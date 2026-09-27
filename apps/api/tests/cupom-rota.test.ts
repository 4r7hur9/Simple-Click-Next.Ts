/**
 * A rota do cupom contra PostgreSQL de verdade (AC-617, AC-621, P-003).
 *
 * É a porta que a página de impressão por clique usa: o dono pede, a API soma
 * a via e devolve o cupom no formato do contrato. Aqui se prova a borda — quem
 * pode pedir, o que acontece com endereço inventado, e que o que sai é um
 * cupom que qualquer consumidor do contrato (navegador ou agente) aceita.
 */
import express from "express";
import request from "supertest";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lerCupomImpresso } from "@simpleclick/core";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
} from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { manipuladorDeErros } from "../src/core/erros.ts";
import { criarPedido } from "../src/modules/orders/criar-pedido.usecase.ts";
import { tokenPublico } from "../src/modules/orders/numero-pedido.ts";
import { criarRotasDoCupom } from "../src/modules/printing/cupom.routes.ts";
import { normalizarConfiguracaoDeImpressao } from "../src/modules/stores/impressao-config.usecase.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let lojaA: LojaDeTeste;
let lojaB: LojaDeTeste;

/** Um app só com a rota do cupom, autenticado como dono quando há cabeçalho. */
function appDoCupom(): express.Express {
  const app = express();
  app.use(
    "/v1/lojas",
    criarRotasDoCupom({
      acesso,
      autenticar: (requisicao) =>
        requisicao.headers.authorization === "Bearer dono"
          ? { identidadeId: lojaA.dono.id, papel: "OWNER" }
          : null,
      resolverLoja: async ({ apelido }) => {
        const loja = [lojaA, lojaB].find((l) => l.apelido === apelido);
        return loja === undefined
          ? { encontrada: false }
          : { encontrada: true, id: loja.id };
      },
      lerConfiguracaoDoCupom: normalizarConfiguracaoDeImpressao,
    }),
  );
  // Como em `app.ts`: é ele que traduz a recusa da guarda central de vínculo
  // com a loja (core/db.ts, regra 7) na resposta do catálogo de erros.
  app.use(manipuladorDeErros());
  return app;
}

/**
 * O código de "não encontrado" nos dois formatos que a API usa: o da rota, à
 * mão (`{ erro: "nao_encontrado" }`), e o do catálogo de erros (AC-024), que é
 * como a recusa de vínculo com a loja sai — a mesma porta da vitrine.
 */
function codigoDoErro(corpo: unknown): string | undefined {
  const erro = (corpo as { erro?: unknown })?.erro;
  if (typeof erro === "string") return erro;
  return (erro as { codigo?: string } | undefined)?.codigo;
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  lojaA = await criarLoja({ nome: "Sorveteria São João" });
  lojaB = await criarLoja({ nome: "Lanchonete Vizinha" });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

async function pedidoDe(loja: LojaDeTeste): Promise<string> {
  const resultado = await comoRequisicao(
    acesso,
    { lojaId: loja.id, papel: "CUSTOMER", tokenDoPedido: tokenPublico() },
    () =>
      criarPedido(
        {
          lojaId: loja.id,
          contato: { nome: "João Açaí", telefoneE164: "5511912345678" },
          itens: [
            {
              nomeDoProduto: "Açaí com granola",
              quantidade: 1,
              precoUnitarioEmCentavos: 2350,
              totalDaLinhaEmCentavos: 2350,
            },
          ],
          entrega: "PICKUP",
          formaDePagamento: "PIX",
          subtotalEmCentavos: 2350,
          taxaDeEntregaEmCentavos: 0,
          totalEmCentavos: 2350,
        },
        { aberta: true },
      ),
  );
  if (!resultado.ok) throw new Error("o pedido de apoio não foi criado");
  return resultado.pedido.id;
}

describe("a rota do cupom para a impressão por clique (AC-617)", () => {
  it(
    "@spec:AC-617 o dono pede o cupom do pedido e recebe um cupom do contrato, sem cache",
    async () => {
      const pedidoId = await pedidoDe(lojaA);
      const resposta = await request(appDoCupom())
        .post(`/v1/lojas/${lojaA.apelido}/pedidos/${pedidoId}/cupom`)
        .set("authorization", "Bearer dono");

      expect(resposta.status).toBe(200);
      expect(resposta.headers["cache-control"]).toBe("no-store");
      const cupom = lerCupomImpresso(resposta.body.cupom);
      expect(cupom).not.toBeNull();
      expect(cupom?.papel).toEqual({ larguraMm: 80, colunas: 48 });
      expect(JSON.stringify(cupom)).toContain("Açaí com granola");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-617 sem sessão de dono a rota recusa, e nenhuma via é contada",
    async () => {
      const pedidoId = await pedidoDe(lojaA);
      const resposta = await request(appDoCupom()).post(
        `/v1/lojas/${lojaA.apelido}/pedidos/${pedidoId}/cupom`,
      );
      expect(resposta.status).toBe(401);

      const vias = await migrador.query<{ print_count: number }>(
        `SELECT print_count FROM app.orders WHERE id = $1`,
        [pedidoId],
      );
      expect(vias.rows[0]?.print_count).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-617 @principle:P-003 pedido de outra loja, loja inexistente e endereço malformado respondem não encontrado",
    async () => {
      const pedidoDaA = await pedidoDe(lojaA);
      const app = appDoCupom();

      for (const caminho of [
        `/v1/lojas/${lojaB.apelido}/pedidos/${pedidoDaA}/cupom`,
        `/v1/lojas/loja-que-nao-existe/pedidos/${pedidoDaA}/cupom`,
        `/v1/lojas/${lojaA.apelido}/pedidos/1%27%20OR%201%3D1/cupom`,
      ]) {
        const resposta = await request(app)
          .post(caminho)
          .set("authorization", "Bearer dono");
        expect(resposta.status, caminho).toBe(404);
        expect(codigoDoErro(resposta.body), caminho).toBe("nao_encontrado");
        expect(JSON.stringify(resposta.body)).not.toContain("Açaí");
      }

      const vias = await migrador.query<{ print_count: number }>(
        `SELECT print_count FROM app.orders WHERE id = $1`,
        [pedidoDaA],
      );
      expect(vias.rows[0]?.print_count).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-621 cada pedido à rota emite uma via: a segunda sai como reimpressão",
    async () => {
      const pedidoId = await pedidoDe(lojaA);
      const app = appDoCupom();
      const caminho = `/v1/lojas/${lojaA.apelido}/pedidos/${pedidoId}/cupom`;

      const primeira = await request(app)
        .post(caminho)
        .set("authorization", "Bearer dono");
      const segunda = await request(app)
        .post(caminho)
        .set("authorization", "Bearer dono");

      expect(primeira.body.cupom.via).toBe(1);
      expect(segunda.body.cupom.via).toBe(2);
      expect(JSON.stringify(segunda.body.cupom.blocos)).toContain(
        "REIMPRESSÃO",
      );
    },
    ESPERA_LONGA,
  );
});
