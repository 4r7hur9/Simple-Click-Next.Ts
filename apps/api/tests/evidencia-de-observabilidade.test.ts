/**
 * Gera as evidências do card #139 contra Prometheus e Jaeger de verdade.
 *
 * NÃO roda por padrão (precisa do perfil `obs` de pé). Para reproduzir:
 *
 *   docker compose -f infra/compose/docker-compose.yml --profile obs up -d prometheus jaeger
 *   EVIDENCIA_OBSERVABILIDADE=1 PORTA_API_METRICAS=3101 \
 *     npx vitest run --project api-int apps/api/tests/evidencia-de-observabilidade.test.ts
 *
 * Sobe a API numa porta própria (3101, nunca 3000/3001), com o exportador OTLP
 * apontado para o Jaeger local, faz algumas criações de pedido (banco
 * descartável do arquivo), deixa o Prometheus raspar o /metrics e grava um
 * recorte do /metrics em docs/observabilidade/metrics.txt.
 */
import { writeFileSync } from "node:fs";
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

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import { autorizacaoDoComprador } from "./apoio-de-pedidos.ts";
import { criarApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { COOKIE_DA_SESSAO } from "../src/core/sessao-do-carrinho.ts";
import { iniciarApi, type ApiEmPe } from "../src/main.ts";

const LIGADO = process.env.EVIDENCIA_OBSERVABILIDADE === "1";
const ORIGEM = "https://app.exemplo.test";
const PORTA = Number(process.env.PORTA_API_METRICAS ?? "3101");
const CRIACOES = 6;
const ESPERA_DO_PROMETHEUS_MS = 40_000;
const DESTINO = new URL(
  "../../../docs/observabilidade/metrics.txt",
  import.meta.url,
);

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let api: ApiEmPe | undefined;
let loja: LojaDeTeste;
let produto: ProdutoDeTeste;

describe.skipIf(!LIGADO)("evidência de observabilidade (#139)", () => {
  beforeAll(async () => {
    migrador = await conectarNoBancoDoArquivo();
    acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
    loja = await criarLoja({ nome: "Loja da Evidencia" });
    produto = await criarProduto({ loja, nome: "Marmita", precoCentavos: 2000 });
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
  }, ESPERA_LONGA);

  afterAll(async () => {
    await api?.desligar("fim da evidência");
    await acesso?.encerrar();
    await migrador?.end();
  }, ESPERA_LONGA);

  it(
    "cria pedidos, expõe /metrics na porta própria e exporta o trace ao Jaeger",
    async () => {
      const app = criarApp({
        origens: [ORIGEM],
        vitrine: { acesso },
        carrinho: { acesso },
        pedidos: { acesso },
        observabilidade: {
          metricas: { acesso: { tipo: "aberto" }, metricasPadrao: true },
        },
      });
      api = await iniciarApi({
        aplicacao: app,
        fonte: {
          NODE_ENV: "test",
          PORT: String(PORTA),
          DATABASE_URL: "postgresql://aplicacao:trocar@127.0.0.1:1/x",
          DATABASE_URL_DIRETA: "postgresql://migracao:trocar@127.0.0.1:1/x",
          DATABASE_URL_TEST: "postgresql://aplicacao:trocar@127.0.0.1:1/x_teste",
          REDIS_URL: "redis://127.0.0.1:1/0",
          JWT_SECRET: "x".repeat(48),
          ORIGENS_PERMITIDAS: ORIGEM,
          LOG_LEVEL: "warn",
          SEGUNDO_PLANO: "desligado",
          OTEL_EXPORTER_OTLP_ENDPOINT:
            process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://127.0.0.1:4318",
        },
      });

      for (let i = 0; i < CRIACOES; i += 1) {
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
        const criado = await request(app)
          .post(`/v1/vitrine/${loja.apelido}/pedidos`)
          .set("Origin", ORIGEM)
          .set("Cookie", `${COOKIE_DA_SESSAO}=${sessao}`)
          .set("Authorization", await autorizacaoDoComprador())
          .send({
            contato: { nome: "Cliente de Evidencia", telefone: "11955550100" },
            entrega: "PICKUP",
            chaveDeIdempotencia: `evidencia-${Date.now()}-${i}-abcdefghijklmnop`,
          });
        expect(criado.status).toBe(201);
      }

      // Tempo para o lote ir ao Jaeger e para o Prometheus raspar (15 s).
      await new Promise((r) => setTimeout(r, ESPERA_DO_PROMETHEUS_MS));

      const resposta = await fetch(`http://127.0.0.1:${PORTA}/metrics`);
      expect(resposta.status).toBe(200);
      const texto = await resposta.text();
      const recorte = texto
        .split("\n")
        .filter(
          (l) =>
            l.includes("http_request") &&
            (l.startsWith("#") || l.includes("/v1/vitrine")),
        )
        .join("\n");
      writeFileSync(DESTINO, `${recorte}\n`);
      expect(recorte).toContain("route=\"/v1/vitrine/:apelido/pedidos\"");
    },
    ESPERA_LONGA + ESPERA_DO_PROMETHEUS_MS + 30_000,
  );
});
