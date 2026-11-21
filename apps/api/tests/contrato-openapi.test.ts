/**
 * Teste de contrato (curso Full Cycle, Projeto A): respostas REAIS da API —
 * catálogo da vitrine e pedido — validadas contra o OpenAPI publicado (status
 * documentado + schema do corpo). Contra banco de verdade, como os demais
 * testes de integração.
 *
 * Se a API mudar uma resposta sem o contrato acompanhar (ou o contrato sem a
 * API), este teste reprova nomeando o campo — é o que o `contrato:verificar`
 * sozinho não enxerga, porque ele compara documento com esquema, não com a rota.
 */
import { readFileSync } from "node:fs";
import type pg from "pg";
import request from "supertest";
import { parse } from "yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
  criarProduto,
} from "@simpleclick/testing";
import type { LojaDeTeste, ProdutoDeTeste } from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import { autorizacaoDoComprador } from "./apoio-de-pedidos.ts";
import { prepararParaVender } from "./apoio-de-compra.ts";
import {
  CAMINHO_DO_YAML,
  lerOpenApi,
  problemasDaResposta,
} from "./apoio-de-contrato.ts";
import { criarApp } from "../src/app.ts";
import { COOKIE_DA_SESSAO } from "../src/core/sessao-do-carrinho.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

const ORIGEM = "https://app.exemplo.test";
const doc = lerOpenApi();

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof criarApp>;
let loja: LojaDeTeste;
let lanche: ProdutoDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = criarApp({
    origens: [ORIGEM],
    vitrine: { acesso },
    carrinho: { acesso },
    pedidos: { acesso },
  });
  loja = await criarLoja({ nome: "Loja do Contrato" });
  lanche = await criarProduto({
    loja,
    nome: "X-Contrato",
    precoCentavos: 2000,
  });
  await prepararParaVender(migrador, loja);
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/** Reprova listando TODOS os problemas, não só o primeiro. */
function conforme(
  caminho: string,
  metodo: "get" | "post",
  resposta: request.Response,
  statusEsperado: number,
): void {
  expect(resposta.status, JSON.stringify(resposta.body)).toBe(statusEsperado);
  expect(
    problemasDaResposta(doc, caminho, metodo, resposta.status, resposta.body),
  ).toEqual([]);
}

function sessaoDe(resposta: request.Response): string {
  const cabecalho = resposta.headers["set-cookie"];
  const cookies = Array.isArray(cabecalho) ? cabecalho : [cabecalho ?? ""];
  const nosso = cookies.find((c) => c.startsWith(`${COOKIE_DA_SESSAO}=`));
  const valor = nosso?.split(";")[0]?.split("=")[1];
  if (!valor) throw new Error("sem cookie de sessão do carrinho");
  return valor;
}

describe("o OpenAPI publicado", () => {
  it("é 3.1 e o YAML do curso é o mesmo documento do JSON", () => {
    expect(doc.openapi).toMatch(/^3\.1\./);
    const yaml = parse(readFileSync(CAMINHO_DO_YAML, "utf8")) as unknown;
    expect(yaml).toEqual(doc);
  });

  it("documenta 201 e 200 na criação do pedido e o GET do pedido com 404", () => {
    const criar = doc.paths["/v1/vitrine/{apelido}/pedidos"]?.post;
    expect(Object.keys(criar?.responses ?? {})).toEqual(
      expect.arrayContaining(["200", "201", "401", "404", "409", "422"]),
    );
    const ver = doc.paths["/v1/vitrine/{apelido}/pedido/{token}"]?.get;
    expect(Object.keys(ver?.responses ?? {})).toEqual(
      expect.arrayContaining(["200", "404"]),
    );
  });
});

describe("contrato do catálogo da vitrine", () => {
  const base = () => `/v1/vitrine/${loja.apelido}`;

  it(
    "GET /v1/vitrine/{apelido}",
    async () => {
      conforme(
        "/v1/vitrine/{apelido}",
        "get",
        await request(app).get(base()).set("Origin", ORIGEM),
        200,
      );
    },
    ESPERA_LONGA,
  );

  it(
    "GET /catalogo, /catalogo/resumo e /catalogo/produtos",
    async () => {
      for (const sufixo of [
        "catalogo",
        "catalogo/resumo",
        "catalogo/produtos",
      ]) {
        conforme(
          `/v1/vitrine/{apelido}/${sufixo}`,
          "get",
          await request(app).get(`${base()}/${sufixo}`).set("Origin", ORIGEM),
          200,
        );
      }
    },
    ESPERA_LONGA,
  );

  it(
    "GET /produto/{produtoId}",
    async () => {
      conforme(
        "/v1/vitrine/{apelido}/produto/{produtoId}",
        "get",
        await request(app)
          .get(`${base()}/produto/${lanche.id}`)
          .set("Origin", ORIGEM),
        200,
      );
    },
    ESPERA_LONGA,
  );

  it(
    "loja inexistente responde 404 no formato Erro do contrato",
    async () => {
      conforme(
        "/v1/vitrine/{apelido}/catalogo",
        "get",
        await request(app)
          .get("/v1/vitrine/nao-existe-mesmo/catalogo")
          .set("Origin", ORIGEM),
        404,
      );
    },
    ESPERA_LONGA,
  );
});

describe("contrato do pedido", () => {
  async function fechar(chave: string, comConta = true) {
    const acrescentado = await request(app)
      .post(`/v1/vitrine/${loja.apelido}/carrinho/itens`)
      .set("Origin", ORIGEM)
      .send({ produtoId: lanche.id, quantidade: 1, escolhas: [] });
    expect(acrescentado.status).toBe(201);
    return { sessao: sessaoDe(acrescentado), chave, comConta };
  }

  function enviar(sessao: string, chave: string, autorizacao?: string) {
    let req = request(app)
      .post(`/v1/vitrine/${loja.apelido}/pedidos`)
      .set("Origin", ORIGEM)
      .set("Cookie", `${COOKIE_DA_SESSAO}=${sessao}`);
    if (autorizacao !== undefined) req = req.set("Authorization", autorizacao);
    return req.send({
      entrega: "PICKUP",
      telefone: "11988887777",
      chaveDeIdempotencia: chave,
    });
  }

  it(
    "201 na criação, 200 no reenvio, GET do pedido e 404 do inexistente",
    async () => {
      const chave = `chave-contrato-${Date.now()}`;
      const { sessao } = await fechar(chave);
      const autorizacao = await autorizacaoDoComprador();

      const criado = await enviar(sessao, chave, autorizacao);
      conforme("/v1/vitrine/{apelido}/pedidos", "post", criado, 201);
      expect(criado.body.jaExistia).toBe(false);

      const reenvio = await enviar(sessao, chave, autorizacao);
      conforme("/v1/vitrine/{apelido}/pedidos", "post", reenvio, 200);
      expect(reenvio.body.jaExistia).toBe(true);

      const visto = await request(app)
        .get(`/v1/vitrine/${loja.apelido}/pedido/${criado.body.tokenPublico}`)
        .set("Origin", ORIGEM);
      conforme("/v1/vitrine/{apelido}/pedido/{token}", "get", visto, 200);

      const inexistente = await request(app)
        .get(`/v1/vitrine/${loja.apelido}/pedido/${"a".repeat(30)}`)
        .set("Origin", ORIGEM);
      conforme("/v1/vitrine/{apelido}/pedido/{token}", "get", inexistente, 404);
    },
    ESPERA_LONGA,
  );

  it(
    "sem conta, o fechamento responde 401 no formato Erro",
    async () => {
      const { sessao } = await fechar(`chave-sem-conta-${Date.now()}`);
      conforme(
        "/v1/vitrine/{apelido}/pedidos",
        "post",
        await enviar(sessao, `chave-sem-conta-${Date.now()}`),
        401,
      );
    },
    ESPERA_LONGA,
  );

  it(
    "corpo inválido responde 400 no formato Erro",
    async () => {
      const resposta = await request(app)
        .post(`/v1/vitrine/${loja.apelido}/pedidos`)
        .set("Origin", ORIGEM)
        .set("Authorization", await autorizacaoDoComprador())
        .send({ entrega: "NADA" });
      conforme("/v1/vitrine/{apelido}/pedidos", "post", resposta, 400);
    },
    ESPERA_LONGA,
  );
});
