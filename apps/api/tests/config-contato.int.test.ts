/**
 * Prova do contato de WhatsApp e da mensagem do pedido (T-904: AC-913 a AC-915).
 *
 * O que o dono salva no painel é o que o pedido de verdade usa: o número
 * normalizado abre a conversa certa, a saudação dele abre a mensagem, e sem
 * número o pedido continua sendo registrado — com aviso no painel.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
  criarProduto,
} from "@simpleclick/testing";
import type { LojaDeTeste, ProdutoDeTeste } from "@simpleclick/testing";

import {
  camposRecusados,
  gravarSecao,
  lerSecao,
  montarAppDaConfiguracao,
  ORIGEM_DO_PAINEL,
  tokenDoDono,
} from "./apoio-de-configuracao.ts";
import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { COOKIE_DA_SESSAO } from "../src/core/sessao-do-carrinho.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof montarAppDaConfiguracao>;
let token: string;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = montarAppDaConfiguracao(acesso);
  const dono = await criarIdentidade({ nome: "Dona Zica" });
  token = tokenDoDono(dono.id);
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/** Loja aberta a semana inteira, que aceita dinheiro e retirada. */
async function lojaQueVende(
  nome: string,
): Promise<{ loja: LojaDeTeste; produto: ProdutoDeTeste }> {
  const loja = await criarLoja({ nome });
  const produto = await criarProduto({
    loja,
    nome: "Coxinha",
    precoCentavos: 700,
  });
  await migrador.query(
    `UPDATE app.store_settings SET payment = $2 WHERE store_id = $1`,
    [loja.id, JSON.stringify({ formas: ["CASH"] })],
  );
  for (let dia = 0; dia <= 6; dia += 1) {
    await migrador.query(
      `INSERT INTO app.store_hours (store_id, weekday, opens_at, closes_at)
       VALUES ($1, $2, '00:00', '23:59')`,
      [loja.id, dia],
    );
  }
  return { loja, produto };
}

function salvarContato(loja: LojaDeTeste, corpo: unknown) {
  return gravarSecao(app, {
    apelido: loja.apelido,
    secao: "contato",
    corpo,
    token,
  });
}

async function pedir(alvo: { loja: LojaDeTeste; produto: ProdutoDeTeste }) {
  const item = await request(app)
    .post(`/v1/vitrine/${alvo.loja.apelido}/carrinho/itens`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .send({ produtoId: alvo.produto.id, quantidade: 1, escolhas: [] });
  expect(item.status).toBe(201);
  const cookie = ([item.headers["set-cookie"]].flat() as (string | undefined)[])
    .find((valor) => valor?.startsWith(`${COOKIE_DA_SESSAO}=`))
    ?.split(";")[0];

  return request(app)
    .post(`/v1/vitrine/${alvo.loja.apelido}/pedidos`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .set("Cookie", cookie ?? "")
    .send({
      contato: { nome: "Ana Paula", telefone: "11988887777" },
      entrega: "PICKUP",
      formaDePagamento: "CASH",
      chaveDeIdempotencia: `zap-${Math.random().toString(36).slice(2)}`,
    });
}

describe("o número é validado no cadastro (AC-913)", () => {
  it(
    "@spec:AC-913 número com máscara e sem código do país é guardado no formato internacional",
    async () => {
      const loja = await criarLoja({ nome: "Salgaderia do Número" });
      const salvo = await salvarContato(loja, {
        numero: "(11) 9 1234-5678",
        saudacao: "Olá!",
        publico: false,
      });
      expect(salvo.status).toBe(204);

      const lido = await lerSecao(app, loja.apelido, "contato", token);
      expect(lido.body.numero).toBe("5511912345678");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-913 número impossível é recusado explicando o que falta, e o anterior continua",
    async () => {
      const loja = await criarLoja({ nome: "Salgaderia Firme" });
      await salvarContato(loja, {
        numero: "(11) 91234-5678",
        saudacao: "Olá!",
        publico: false,
      });

      const recusado = await salvarContato(loja, {
        numero: "(20) 91234-5678",
        saudacao: "Olá!",
        publico: false,
      });
      expect(recusado.status).toBe(400);
      expect(camposRecusados(recusado.body)).toEqual(["numero"]);
      expect(recusado.body.campos[0].mensagem).toMatch(/DDD|código de área/i);

      const lido = await lerSecao(app, loja.apelido, "contato", token);
      expect(lido.body.numero).toBe("5511912345678");
    },
    ESPERA_LONGA,
  );
});

describe("sem WhatsApp, aviso no painel e pedido registrado (AC-914)", () => {
  it(
    "@spec:AC-914 loja sem número: o painel avisa, e o pedido do cliente é registrado assim mesmo",
    async () => {
      const alvo = await lojaQueVende("Salgaderia Sem Zap");

      const avisos = await request(app)
        .get(`/v1/lojas/${alvo.loja.apelido}/configuracao/pendencias`)
        .set("Authorization", `Bearer ${token}`);
      const whatsapp = (
        avisos.body.pendencias as { codigo: string; href: string }[]
      ).find((pendencia) => pendencia.codigo === "WHATSAPP");
      expect(whatsapp?.href).toBe("/painel/config/contato");

      const pedido = await pedir(alvo);
      expect(pedido.status).toBe(201);
      expect(pedido.body.numero).toBeGreaterThan(0);
      expect(pedido.body.whatsapp).toBeNull();
      const { rows } = await migrador.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM app.orders WHERE store_id = $1`,
        [alvo.loja.id],
      );
      expect(rows[0]?.total).toBe(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-914 cadastrado o número, o aviso some",
    async () => {
      const alvo = await lojaQueVende("Salgaderia Com Zap");
      await salvarContato(alvo.loja, {
        numero: "(11) 91234-5678",
        saudacao: null,
        publico: false,
      });

      const avisos = await request(app)
        .get(`/v1/lojas/${alvo.loja.apelido}/configuracao/pendencias`)
        .set("Authorization", `Bearer ${token}`);
      const codigos = (avisos.body.pendencias as { codigo: string }[]).map(
        (pendencia) => pendencia.codigo,
      );
      expect(codigos).not.toContain("WHATSAPP");
    },
    ESPERA_LONGA,
  );
});

describe("o dono ajusta o texto da mensagem (AC-915)", () => {
  it(
    "@spec:AC-915 a saudação do dono abre a mensagem do pedido de verdade, e o corpo obrigatório continua lá",
    async () => {
      const alvo = await lojaQueVende("Salgaderia da Saudação");
      await salvarContato(alvo.loja, {
        numero: "(11) 91234-5678",
        saudacao: "Oi, Dona Zica! Quero fazer um pedido:",
        publico: false,
      });

      const pedido = await pedir(alvo);
      expect(pedido.status).toBe(201);
      const texto = pedido.body.whatsapp.texto as string;
      expect(
        texto.startsWith("Oi, Dona Zica! Quero fazer um pedido:\n\n"),
      ).toBe(true);
      expect(texto).toContain(pedido.body.codigo);
      expect(texto).toContain("Coxinha");
      expect(texto).toContain("R$ 7,00");
      expect(texto).toContain(`/pedido/${pedido.body.tokenPublico}`);
      expect(pedido.body.whatsapp.endereco).toContain("wa.me/5511912345678");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-915 apagar a saudação tira o que o dono não quer, e a mensagem sai sem marca da plataforma",
    async () => {
      const alvo = await lojaQueVende("Salgaderia Direta");
      const salvo = await salvarContato(alvo.loja, {
        numero: "(11) 91234-5678",
        saudacao: null,
        publico: false,
      });
      expect(salvo.status).toBe(204);
      const lido = await lerSecao(app, alvo.loja.apelido, "contato", token);
      expect(lido.body.saudacao).toBeNull();

      const pedido = await pedir(alvo);
      const texto = pedido.body.whatsapp.texto as string;
      expect(texto).not.toContain("Olá! Segue meu pedido:");
      expect(texto).toContain(pedido.body.codigo);
      // Marca é TEXTO de assinatura ("enviado pelo SimpleClick"); o endereço do
      // link de acompanhamento depende do domínio em que o site está no ar, e
      // fica fora da conferência.
      const semEnderecos = texto.replace(/https?:\/\/\S+/g, "");
      expect(semEnderecos).not.toMatch(/simple\s*click/i);
    },
    ESPERA_LONGA,
  );
});
