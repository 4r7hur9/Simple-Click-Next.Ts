/**
 * Trace ponta a ponta da criação de pedido (card #139).
 *
 * Compra REAL pela API (carrinho → fechamento → acompanhamento → recusa) com
 * o rastreamento ligado a um `InMemorySpanExporter`. Confere:
 *   1. o span SERVER `POST /v1/vitrine/:apelido/pedidos` 201;
 *   2. o filho `pedido.criar`;
 *   3. um descendente `*db_query*` do Postgres, com `db.query.text`;
 *   4. o MESMO traceId nos três;
 *   5. o traceId nas linhas de log `requisicao.iniciou` e `requisicao.terminou`,
 *      e o atributo `simpleclick.requisicao_id` igual ao `x-request-id`;
 *   6. nenhum dado da compra (nem o token) em nenhum span;
 *   7. a rota nas métricas, com o molde.
 */
import type pg from "pg";
import request from "supertest";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace";
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
import { criarApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { criarRegistrador, definirRegistrador } from "../src/core/log.ts";
import {
  iniciarRastreamento,
  type Rastreamento,
} from "../src/core/rastreamento.ts";
import { COOKIE_DA_SESSAO } from "../src/core/sessao-do-carrinho.ts";

const ORIGEM = "https://app.exemplo.test";
const NOME = "Zenaide Sentinela Fictícia";
const TELEFONE = "11955550199";
const CHAVE = "chave-sentinela-trace-0123456789";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof criarApp>;
let loja: LojaDeTeste;
let produto: ProdutoDeTeste;
let rastreamento: Rastreamento | undefined;
const memoria = new InMemorySpanExporter();
const linhasBrutas: string[] = [];

function linhas(): Record<string, unknown>[] {
  return linhasBrutas.map((l) => JSON.parse(l) as Record<string, unknown>);
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  rastreamento = iniciarRastreamento({ exportador: memoria });
  app = criarApp({
    origens: [ORIGEM],
    vitrine: { acesso },
    carrinho: { acesso },
    pedidos: { acesso },
    observabilidade: { metricas: { acesso: { tipo: "aberto" } } },
  });
  loja = await criarLoja({ nome: "Loja do Teste de Trace" });
  produto = await criarProduto({ loja, nome: "Marmita de trace", precoCentavos: 2000 });
  await migrador.query(
    `INSERT INTO app.store_settings (store_id, delivery, payment, whatsapp)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (store_id) DO UPDATE
       SET delivery = EXCLUDED.delivery, payment = EXCLUDED.payment,
           whatsapp = EXCLUDED.whatsapp`,
    [
      loja.id,
      JSON.stringify({ taxaPadraoCents: 700, retiradaNoLocal: true }),
      JSON.stringify({ formas: ["PIX", "CASH"] }),
      JSON.stringify({ numero: "+5511911112222" }),
    ],
  );
  for (let dia = 0; dia <= 6; dia += 1) {
    await migrador.query(
      `INSERT INTO app.store_hours (store_id, weekday, opens_at, closes_at)
       VALUES ($1, $2, '00:00', '23:59')`,
      [loja.id, dia],
    );
  }
  definirRegistrador(
    criarRegistrador({
      nivel: "debug",
      destino: {
        write(trecho: string): void {
          for (const l of trecho.split("\n")) {
            if (l.trim() !== "") linhasBrutas.push(l);
          }
        },
      },
    }),
  );
}, ESPERA_LONGA);

afterAll(async () => {
  definirRegistrador(undefined);
  await rastreamento?.encerrar();
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

describe("trace da criação de pedido (#139)", () => {
  it(
    "HTTP → pedido.criar → db_query no mesmo trace, ligado ao log e sem dado da compra",
    async () => {
      const item = await request(app)
        .post(`/v1/vitrine/${loja.apelido}/carrinho/itens`)
        .set("Origin", ORIGEM)
        .send({ produtoId: produto.id, quantidade: 1, escolhas: [] });
      expect(item.status).toBe(201);
      const cabecalho = item.headers["set-cookie"];
      const cookies = Array.isArray(cabecalho) ? cabecalho : [cabecalho ?? ""];
      const sessao = cookies
        .find((c) => c.startsWith(`${COOKIE_DA_SESSAO}=`))
        ?.split(";")[0]
        ?.split("=")[1];
      const cookie = `${COOKIE_DA_SESSAO}=${sessao}`;

      const fechar = async (chave: string) =>
        request(app)
          .post(`/v1/vitrine/${loja.apelido}/pedidos`)
          .set("Origin", ORIGEM)
          .set("Cookie", cookie)
          .set("Authorization", await autorizacaoDoComprador())
          .send({
            contato: { nome: NOME, telefone: TELEFONE },
            entrega: "PICKUP",
            chaveDeIdempotencia: chave,
          });

      // Só a criação interessa ao trace: limpa o que o carrinho gerou.
      await esperar(50);
      memoria.reset();
      linhasBrutas.length = 0;

      const criado = await fechar(CHAVE);
      expect(criado.status).toBe(201);
      const idDaRequisicao = criado.headers["x-request-id"] as string;
      const token = criado.body.tokenPublico as string;

      const acompanhar = await request(app)
        .get(`/v1/vitrine/${loja.apelido}/pedido/${token}`)
        .set("Origin", ORIGEM);
      expect(acompanhar.status).toBe(200);
      const recusado = await fechar("outra-chave-sentinela-trace-987");
      expect(recusado.status).toBeGreaterThanOrEqual(400);

      await esperar(150);
      const spans = memoria.getFinishedSpans();

      // 1. o SERVER da criação
      const servidor = spans.find(
        (s) =>
          s.name === "POST /v1/vitrine/:apelido/pedidos" &&
          s.attributes["http.response.status_code"] === 201,
      );
      expect(servidor, "span SERVER 201").toBeDefined();
      if (servidor === undefined) return;
      const traceId = servidor.spanContext().traceId;
      expect(servidor.parentSpanContext).toBeUndefined(); // raiz nova
      expect(servidor.attributes["http.route"]).toBe(
        "/v1/vitrine/:apelido/pedidos",
      );

      // 2. o filho pedido.criar
      const caso = spans.find(
        (s) =>
          s.name === "pedido.criar" && s.spanContext().traceId === traceId,
      );
      expect(caso, "span pedido.criar").toBeDefined();

      // 3. um db_query descendente, com o SQL parametrizado
      const doTrace = spans.filter((s) => s.spanContext().traceId === traceId);
      const banco = doTrace.filter((s) => s.name.includes("db_query"));
      expect(banco.length, "spans db_query").toBeGreaterThan(0);
      expect(
        banco.some((s) => typeof s.attributes["db.query.text"] === "string"),
      ).toBe(true);

      // 4. mesmo traceId (já filtrado) e o encadeamento: o caso de uso é
      // descendente do SERVER (a transação do banco pode ficar no meio), e o
      // SQL do pedido é descendente do caso de uso.
      const porId = new Map(doTrace.map((s) => [s.spanContext().spanId, s]));
      const descendeDe = (span: (typeof doTrace)[number], ancestral: string) => {
        let atual = span.parentSpanContext?.spanId;
        for (let i = 0; i < 20 && atual !== undefined; i += 1) {
          if (atual === ancestral) return true;
          atual = porId.get(atual)?.parentSpanContext?.spanId;
        }
        return false;
      };
      if (caso === undefined) return;
      expect(descendeDe(caso, servidor.spanContext().spanId)).toBe(true);
      expect(
        banco.some((s) => descendeDe(s, caso.spanContext().spanId)),
        "db_query dentro de pedido.criar",
      ).toBe(true);

      // 5. correlação com o log e com o x-request-id
      expect(servidor.attributes["simpleclick.requisicao_id"]).toBe(idDaRequisicao);
      const deste = linhas().filter((l) => l.requisicaoId === idDaRequisicao);
      const inicio = deste.find((l) => l.evento === "requisicao.iniciou");
      const fim = deste.find((l) => l.evento === "requisicao.terminou");
      expect(inicio?.traceId).toBe(traceId);
      expect(fim?.traceId).toBe(traceId);

      // 6. nada da compra em nenhum span (compra, acompanhamento, recusa)
      const tudo = JSON.stringify(
        spans.map((s) => ({
          name: s.name,
          attributes: s.attributes,
          events: s.events,
          status: s.status,
          links: s.links,
        })),
      );
      for (const proibido of [
        NOME,
        "Sentinela",
        TELEFONE,
        CHAVE,
        "outra-chave",
        token,
        "Bearer",
        loja.apelido,
      ]) {
        expect(tudo, `um span contém "${proibido}"`).not.toContain(proibido);
      }
      // e o acompanhamento saiu pelo molde, sem o token
      expect(spans.some((s) => s.name === "GET /v1/vitrine/:apelido/pedido/:token")).toBe(true);
      expect(spans.every((s) => s.events.length === 0)).toBe(true);

      // 7. a rota nas métricas
      const metricas = await request(app).get("/metrics");
      expect(metricas.text).toContain(
        'route="/v1/vitrine/:apelido/pedidos"',
      );
      expect(metricas.text).not.toContain(token);
    },
    ESPERA_LONGA,
  );
});
