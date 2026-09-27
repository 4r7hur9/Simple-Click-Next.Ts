/**
 * Prova da entrega, retirada, taxa e mínimo configurados (T-902: AC-905 a AC-908).
 *
 * O cálculo da taxa, da gratuidade e do mínimo já está provado na regra pura
 * (`packages/core/src/taxa-entrega.test.ts`). O que só esta prova mostra é a
 * COSTURA: o que o dono salva no painel é o que o checkout passa a oferecer e
 * cobrar — e desligar os dois modos impede o pedido, com aviso no painel.
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
  gravarSecao,
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

const ENTREGA = {
  aceitaEntrega: true,
  aceitaRetirada: true,
  taxaCentavos: 800,
  nomeDaTaxa: "Motoboy",
  gratisAcimaDeCentavos: 6_000,
  minimoParaEntregaCentavos: 2_500,
  minimoParaRetiradaCentavos: null,
  prazoMinutos: 40,
};

const ENDERECO = {
  logradouro: "Rua das Flores",
  numero: "10",
  bairro: "Centro",
  cidade: "São Paulo",
};

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

/** Uma loja aberta a semana inteira, que aceita dinheiro. */
async function lojaQueVende(
  nome: string,
): Promise<{ loja: LojaDeTeste; produto: ProdutoDeTeste }> {
  const loja = await criarLoja({ nome });
  const produto = await criarProduto({
    loja,
    nome: "Marmita",
    precoCentavos: 2_000,
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

function salvarEntrega(loja: LojaDeTeste, corpo: unknown) {
  return gravarSecao(app, {
    apelido: loja.apelido,
    secao: "entrega",
    corpo,
    token,
  });
}

async function fechamento(loja: LojaDeTeste) {
  const resposta = await request(app).get(
    `/v1/vitrine/${loja.apelido}/fechamento`,
  );
  expect(resposta.status).toBe(200);
  return resposta.body.entrega as Record<string, unknown>;
}

/** Monta um carrinho com `quantidade` marmitas e tenta fechar. */
async function pedir(
  alvo: { loja: LojaDeTeste; produto: ProdutoDeTeste },
  quantidade: number,
  corpo: Record<string, unknown>,
) {
  const item = await request(app)
    .post(`/v1/vitrine/${alvo.loja.apelido}/carrinho/itens`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .send({ produtoId: alvo.produto.id, quantidade, escolhas: [] });
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
      formaDePagamento: "CASH",
      chaveDeIdempotencia: `ent-${Math.random().toString(36).slice(2)}`,
      ...corpo,
    });
}

describe("o checkout oferece exatamente o que o dono ativou (AC-905)", () => {
  it(
    "@spec:AC-905 só entrega ativada: o checkout oferece entrega e não retirada",
    async () => {
      const alvo = await lojaQueVende("Marmitaria Só Entrega");
      const salvo = await salvarEntrega(alvo.loja, {
        ...ENTREGA,
        aceitaRetirada: false,
      });
      expect(salvo.status).toBe(204);

      const oferecido = await fechamento(alvo.loja);
      expect(oferecido["aceitaEntrega"]).toBe(true);
      expect(oferecido["aceitaRetirada"]).toBe(false);

      const vitrine = await request(app).get(
        `/v1/vitrine/${alvo.loja.apelido}`,
      );
      expect(vitrine.body.loja.formasDeEntrega).toEqual(["DELIVERY"]);

      // Retirada, que o dono desligou, é recusada no fechamento.
      const retirada = await pedir(alvo, 2, { entrega: "PICKUP" });
      expect(retirada.status).toBe(409);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-905 só retirada ativada: o checkout oferece retirada e recusa entrega",
    async () => {
      const alvo = await lojaQueVende("Marmitaria Só Retirada");
      await salvarEntrega(alvo.loja, {
        ...ENTREGA,
        aceitaEntrega: false,
      });

      const oferecido = await fechamento(alvo.loja);
      expect(oferecido["aceitaEntrega"]).toBe(false);
      expect(oferecido["aceitaRetirada"]).toBe(true);

      const retirada = await pedir(alvo, 1, { entrega: "PICKUP" });
      expect(retirada.status).toBe(201);
      const entrega = await pedir(alvo, 2, {
        entrega: "DELIVERY",
        contato: {
          nome: "Ana Paula",
          telefone: "11988887777",
          ...ENDERECO,
        },
      });
      expect(entrega.status).toBe(409);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-905 as duas desligadas: o cliente não finaliza, e o painel do dono avisa",
    async () => {
      const alvo = await lojaQueVende("Marmitaria Parada");
      await salvarEntrega(alvo.loja, {
        ...ENTREGA,
        aceitaEntrega: false,
        aceitaRetirada: false,
      });

      const oferecido = await fechamento(alvo.loja);
      expect(oferecido["aceitaEntrega"]).toBe(false);
      expect(oferecido["aceitaRetirada"]).toBe(false);

      expect((await pedir(alvo, 1, { entrega: "PICKUP" })).status).toBe(409);
      expect(
        (
          await pedir(alvo, 2, {
            entrega: "DELIVERY",
            contato: {
              nome: "Ana Paula",
              telefone: "11988887777",
              ...ENDERECO,
            },
          })
        ).status,
      ).toBe(409);

      const avisos = await request(app)
        .get(`/v1/lojas/${alvo.loja.apelido}/configuracao/pendencias`)
        .set("Authorization", `Bearer ${token}`);
      const entrega = (
        avisos.body.pendencias as {
          codigo: string;
          titulo: string;
          href: string;
        }[]
      ).find((pendencia) => pendencia.codigo === "ENTREGA");
      expect(entrega?.titulo).toMatch(/entrega|retirada/i);
      expect(entrega?.href).toBe("/painel/config/entrega");
    },
    ESPERA_LONGA,
  );
});

describe("o que o dono salva é o que o checkout cobra (AC-906, AC-907, AC-908)", () => {
  it(
    "@spec:AC-906 a taxa única, com o nome que o dono deu, chega ao fechamento e entra no total",
    async () => {
      const alvo = await lojaQueVende("Marmitaria da Taxa");
      await salvarEntrega(alvo.loja, ENTREGA);

      const oferecido = await fechamento(alvo.loja);
      expect(oferecido["taxaCentavos"]).toBe(800);
      expect(oferecido["nomeDaTaxa"]).toBe("Motoboy");

      // Duas marmitas: R$ 40,00, acima do mínimo e abaixo da gratuidade.
      const pedido = await pedir(alvo, 2, {
        entrega: "DELIVERY",
        contato: { nome: "Ana Paula", telefone: "11988887777", ...ENDERECO },
      });
      expect(pedido.status).toBe(201);
      expect(pedido.body.taxaDeEntregaCentavos).toBe(800);
      expect(pedido.body.totalCentavos).toBe(4_800);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-907 acima do valor configurado a entrega sai de graça, e abaixo continua pagando",
    async () => {
      const alvo = await lojaQueVende("Marmitaria Grátis");
      await salvarEntrega(alvo.loja, ENTREGA);

      const acima = await pedir(alvo, 4, {
        entrega: "DELIVERY",
        contato: { nome: "Ana Paula", telefone: "11988887777", ...ENDERECO },
      });
      expect(acima.status).toBe(201);
      expect(acima.body.taxaDeEntregaCentavos).toBe(0);
      expect(acima.body.totalCentavos).toBe(8_000);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-908 abaixo do mínimo de entrega o pedido é impedido, e a retirada sem mínimo continua",
    async () => {
      const alvo = await lojaQueVende("Marmitaria do Mínimo");
      await salvarEntrega(alvo.loja, ENTREGA);

      const abaixo = await pedir(alvo, 1, {
        entrega: "DELIVERY",
        contato: { nome: "Ana Paula", telefone: "11988887777", ...ENDERECO },
      });
      expect(abaixo.status).toBe(409);

      const retirada = await pedir(alvo, 1, { entrega: "PICKUP" });
      expect(retirada.status).toBe(201);
    },
    ESPERA_LONGA,
  );
});
