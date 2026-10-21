/**
 * O link de acompanhamento não pode ser adivinhado (AC-614, P-003).
 *
 * A página abre sem login, porque o link vai por WhatsApp. Então o endereço É a
 * senha: quem o tem vê nome, itens e andamento do pedido. Se ele fosse o número
 * do pedido, ou o identificador interno, um laço de "somar 1" passearia pelos
 * pedidos da loja inteira — e de todas as lojas.
 *
 * A prova faz o pedido pelo CAMINHO DE VERDADE (carrinho e fechamento pela API),
 * porque é o token que o cliente recebe ali que precisa ser impossível de
 * adivinhar — e depois tenta, de todos os jeitos baratos, alcançar pedido de
 * outra pessoa. Todos respondem "não encontrado", com a mesma resposta, para
 * que nem a diferença entre "existe mas não é seu" e "não existe" vaze.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
  criarProduto,
} from "@simpleclick/testing";
import type { LojaDeTeste, ProdutoDeTeste } from "@simpleclick/testing";

import { abrirAcessoDaAplicacao } from "./apoio-de-isolamento.ts";
import {
  aplicacaoDaOperacao,
  autorizacaoDoComprador,
  ESPERA_DA_OPERACAO,
  ORIGEM_DO_PAINEL,
} from "./apoio-de-pedidos.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { COOKIE_DA_SESSAO } from "../src/core/sessao-do-carrinho.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof aplicacaoDaOperacao>;
let loja: LojaDeTeste;
let outraLoja: LojaDeTeste;
let produto: ProdutoDeTeste;
let produtoDaOutra: ProdutoDeTeste;

/** O que o fechamento devolve ao cliente. */
interface PedidoFechado {
  readonly id: string;
  readonly numero: number;
  readonly codigo: string;
  readonly tokenPublico: string;
}

/** A loja precisa poder vender: entrega configurada e aberta o dia todo. */
async function prepararParaVender(alvo: LojaDeTeste): Promise<void> {
  await migrador.query(
    `UPDATE app.store_settings
        SET delivery = $2, payment = $3
      WHERE store_id = $1`,
    [
      alvo.id,
      JSON.stringify({ taxaPadraoCents: 700, retiradaNoLocal: true }),
      JSON.stringify({ formas: ["PIX", "CASH"] }),
    ],
  );
  for (let dia = 0; dia <= 6; dia += 1) {
    await migrador.query(
      `INSERT INTO app.store_hours (store_id, weekday, opens_at, closes_at)
       VALUES ($1, $2, '00:00', '23:59')`,
      [alvo.id, dia],
    );
  }
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = aplicacaoDaOperacao(acesso);
  loja = await criarLoja({ nome: "Pastelaria do Link" });
  outraLoja = await criarLoja({ nome: "Pastelaria do Outro Link" });
  await prepararParaVender(loja);
  await prepararParaVender(outraLoja);
  produto = await criarProduto({
    loja,
    nome: "Pastel de queijo",
    precoCentavos: 900,
  });
  produtoDaOutra = await criarProduto({
    loja: outraLoja,
    nome: "Pastel de carne",
    precoCentavos: 1000,
  });
}, ESPERA_DA_OPERACAO);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DA_OPERACAO);

/** Tira o token da sessão do carrinho do cookie que a API emitiu. */
function sessaoDe(resposta: request.Response): string {
  const cabecalho = resposta.headers["set-cookie"];
  const cookies = Array.isArray(cabecalho) ? cabecalho : [cabecalho ?? ""];
  const nosso = cookies.find((c) => c.startsWith(`${COOKIE_DA_SESSAO}=`));
  const valor = nosso?.split(";")[0]?.split("=")[1];
  if (valor === undefined || valor === "") {
    throw new Error("a API não emitiu o cookie da sessão do carrinho");
  }
  return valor;
}

/** Monta o carrinho e fecha o pedido, como a vitrine faz. */
async function fecharPeloSite(
  alvo: LojaDeTeste,
  item: ProdutoDeTeste,
): Promise<PedidoFechado> {
  const acrescentado = await request(app)
    .post(`/v1/vitrine/${alvo.apelido}/carrinho/itens`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .send({ produtoId: item.id, quantidade: 1, escolhas: [] });
  expect(acrescentado.status).toBe(201);
  const sessao = sessaoDe(acrescentado);

  const fechado = await request(app)
    .post(`/v1/vitrine/${alvo.apelido}/pedidos`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .set("Cookie", `${COOKIE_DA_SESSAO}=${sessao}`)
    .set("Authorization", await autorizacaoDoComprador())
    .send({
      contato: { nome: "Ana Paula", telefone: "11988887777" },
      entrega: "PICKUP",
      chaveDeIdempotencia: `chave-${Math.random().toString(36).slice(2)}-teste`,
    });
  expect(fechado.status).toBe(201);
  return fechado.body as PedidoFechado;
}

function acompanhar(apelido: string, token: string) {
  return request(app).get(
    `/v1/vitrine/${apelido}/pedido/${encodeURIComponent(token)}`,
  );
}

/** Troca um caractere do token por outro do mesmo alfabeto. */
function trocarUmCaractere(token: string, posicao: number): string {
  const atual = token[posicao] ?? "A";
  const trocado = atual === "A" ? "B" : "A";
  return `${token.slice(0, posicao)}${trocado}${token.slice(posicao + 1)}`;
}

describe("o endereço usa um código longo e aleatório (AC-614)", () => {
  it(
    "@spec:AC-614 o token que o cliente recebe tem ao menos 128 bits e não carrega número, código nem identificador",
    async () => {
      const pedido = await fecharPeloSite(loja, produto);

      // base64 de endereço: 6 bits por caractere. 22 caracteres = 132 bits.
      expect(pedido.tokenPublico).toMatch(/^[A-Za-z0-9_-]{22,}$/);
      expect(pedido.tokenPublico.length * 6).toBeGreaterThanOrEqual(128);
      // O número é curto: um dígito dele pode aparecer por acaso num sorteio
      // de 43 caracteres. O que não pode é o token SER o número, ou começar
      // por ele como um prefixo sequencial.
      expect(pedido.tokenPublico).not.toBe(String(pedido.numero));
      expect(pedido.tokenPublico.startsWith(`${pedido.numero}-`)).toBe(false);
      expect(pedido.tokenPublico).not.toContain(pedido.codigo);
      expect(pedido.tokenPublico).not.toContain(pedido.id);

      const lido = await acompanhar(loja.apelido, pedido.tokenPublico);
      expect(lido.status).toBe(200);
      expect(lido.body.pedido.codigo).toBe(pedido.codigo);
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-614 pedidos seguidos da mesma loja recebem tokens sem relação entre si",
    async () => {
      const primeiro = await fecharPeloSite(loja, produto);
      const segundo = await fecharPeloSite(loja, produto);

      expect(segundo.numero).toBe(primeiro.numero + 1);
      expect(segundo.tokenPublico).not.toBe(primeiro.tokenPublico);
      // Nenhum pedaço comum no começo: não existe "sufixo que muda".
      expect(segundo.tokenPublico.slice(0, 6)).not.toBe(
        primeiro.tokenPublico.slice(0, 6),
      );
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-614 trocar números, usar o código ou o identificador do pedido não alcança pedido nenhum",
    async () => {
      const pedido = await fecharPeloSite(loja, produto);
      const tentativas = [
        String(pedido.numero),
        String(pedido.numero + 1),
        pedido.codigo,
        pedido.id,
        trocarUmCaractere(pedido.tokenPublico, 0),
        trocarUmCaractere(pedido.tokenPublico, pedido.tokenPublico.length - 1),
        pedido.tokenPublico.slice(0, -1),
        `${pedido.tokenPublico}A`,
        pedido.tokenPublico.toUpperCase() === pedido.tokenPublico
          ? pedido.tokenPublico.toLowerCase()
          : pedido.tokenPublico.toUpperCase(),
        "' OR '1'='1",
        "%",
        "_",
      ];

      for (const tentativa of tentativas) {
        const resposta = await acompanhar(loja.apelido, tentativa);
        expect(resposta.status, `"${tentativa}" alcançou um pedido`).toBe(404);
        expect(resposta.body).toEqual({ erro: "nao_encontrado" });
      }
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-614 cem endereços sorteados no mesmo formato não encontram nada",
    async () => {
      await fecharPeloSite(loja, produto);
      const alfabeto =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

      for (let tentativa = 0; tentativa < 100; tentativa += 1) {
        const sorteado = Array.from(
          { length: 43 },
          () => alfabeto[Math.floor(Math.random() * alfabeto.length)],
        ).join("");
        const resposta = await acompanhar(loja.apelido, sorteado);
        expect(resposta.status).toBe(404);
      }
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "@spec:AC-614 loja que não existe responde exatamente como pedido que não existe",
    async () => {
      const pedido = await fecharPeloSite(loja, produto);

      const lojaInventada = await acompanhar(
        "loja-que-nao-existe",
        pedido.tokenPublico,
      );
      const tokenInventado = await acompanhar(
        loja.apelido,
        trocarUmCaractere(pedido.tokenPublico, 3),
      );

      expect(lojaInventada.status).toBe(404);
      expect(tokenInventado.status).toBe(404);
      expect(lojaInventada.body).toEqual(tokenInventado.body);
    },
    ESPERA_DA_OPERACAO,
  );
});

describe("o link de uma loja nunca abre pedido de outra (P-003)", () => {
  it(
    "@spec:AC-614 @principle:P-003 o token verdadeiro de um pedido, no endereço de outra loja, não encontra nada",
    async () => {
      const daOutra = await fecharPeloSite(outraLoja, produtoDaOutra);
      const desta = await fecharPeloSite(loja, produto);

      const cruzadoA = await acompanhar(loja.apelido, daOutra.tokenPublico);
      const cruzadoB = await acompanhar(outraLoja.apelido, desta.tokenPublico);

      expect(cruzadoA.status).toBe(404);
      expect(cruzadoB.status).toBe(404);
      // E cada um, no endereço certo, continua abrindo.
      expect(
        (await acompanhar(outraLoja.apelido, daOutra.tokenPublico)).status,
      ).toBe(200);
      expect((await acompanhar(loja.apelido, desta.tokenPublico)).status).toBe(
        200,
      );
    },
    ESPERA_DA_OPERACAO,
  );
});
