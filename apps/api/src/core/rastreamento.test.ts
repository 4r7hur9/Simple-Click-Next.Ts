import { readFileSync } from "node:fs";

import express from "express";
import request from "supertest";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace";
import { SpanStatusCode } from "@opentelemetry/api";
import { afterEach, describe, expect, it } from "vitest";

import { middlewareDeRegistro } from "./log.ts";
import {
  iniciarRastreamento,
  medirEtapa,
  middlewareDeRastreamento,
  rastreamentoAtivo,
  type Rastreamento,
} from "./rastreamento.ts";

let rastreamento: Rastreamento | undefined;
afterEach(async () => {
  await rastreamento?.encerrar();
  rastreamento = undefined;
});

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("rastreamento", () => {
  it("sem exportador nem configuração não registra nada e medirEtapa é chamada direta", async () => {
    expect(iniciarRastreamento({})).toBeUndefined();
    expect(rastreamentoAtivo()).toBe(false);
    await expect(medirEtapa("x.y", async () => 42)).resolves.toBe(42);
  });

  it("medirEtapa marca ERROR só com o nome do erro, sem mensagem nem evento", async () => {
    const memoria = new InMemorySpanExporter();
    rastreamento = iniciarRastreamento({ exportador: memoria });

    await expect(
      medirEtapa("pedido.criar", async () => {
        throw new TypeError("telefone 5585999990000 inválido");
      }),
    ).rejects.toThrow(TypeError);

    const [span] = memoria.getFinishedSpans();
    expect(span?.name).toBe("pedido.criar");
    expect(span?.status).toEqual({ code: SpanStatusCode.ERROR });
    expect(span?.attributes["error.type"]).toBe("TypeError");
    expect(JSON.stringify(span)).not.toContain("5585999990000");
  });

  it("cada requisição abre um trace novo: ignora o traceparent do cliente", async () => {
    const memoria = new InMemorySpanExporter();
    rastreamento = iniciarRastreamento({ exportador: memoria });
    const app = express();
    app.use(middlewareDeRastreamento());
    app.use(middlewareDeRegistro());
    app.get("/v1/coisa/:id", async (_req, res) => {
      await medirEtapa("coisa.ler", async () => esperar(1));
      res.json({ ok: true });
    });

    const traceDoCliente = "4bf92f3577b34da6a3ce929d0e0e4736";
    await request(app)
      .get("/v1/coisa/123")
      .set("traceparent", `00-${traceDoCliente}-00f067aa0ba902b7-01`)
      .set("tracestate", "vendor=valor");
    await esperar(30);

    const spans = memoria.getFinishedSpans();
    const servidor = spans.find((s) => s.name === "GET /v1/coisa/:id");
    expect(servidor).toBeDefined();
    expect(servidor?.spanContext().traceId).not.toBe(traceDoCliente);
    expect(servidor?.parentSpanContext).toBeUndefined();
    const filho = spans.find((s) => s.name === "coisa.ler");
    expect(filho?.spanContext().traceId).toBe(servidor?.spanContext().traceId);
    expect(JSON.stringify(spans.map((s) => s.attributes))).not.toContain("123");
  });

  it("5xx vira ERROR com error.type e a sonda de saúde não gera trace", async () => {
    const memoria = new InMemorySpanExporter();
    rastreamento = iniciarRastreamento({ exportador: memoria });
    const app = express();
    app.use(middlewareDeRastreamento());
    app.use(middlewareDeRegistro());
    app.get("/falha", (_req, res) => {
      res.status(503).end();
    });
    app.get("/v1/health/live", (_req, res) => {
      res.json({ status: "viva" });
    });

    await request(app).get("/falha");
    await request(app).get("/v1/health/live");
    await esperar(30);

    const spans = memoria.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0]?.attributes["error.type"]).toBe("503");
  });

  it("[CA-6] o contexto do trace sobrevive ao leitor de corpo (express.json) sem passo de reentrada", async () => {
    // Era o motivo do `reentrarNoRastreio` (card #137): no Node 24 com o
    // express 5, o AsyncLocalStorage atravessa a leitura do corpo, mesmo com
    // o corpo chegando em vários pedaços.
    const memoria = new InMemorySpanExporter();
    rastreamento = iniciarRastreamento({ exportador: memoria });
    const app = express();
    app.use(middlewareDeRastreamento());
    app.use(middlewareDeRegistro());
    app.use(express.json({ limit: "1mb" }));
    app.post("/v1/coisa", async (req, res) => {
      await medirEtapa("coisa.criar", async () => esperar(1));
      res.json({ recebidos: (req.body as { itens: unknown[] }).itens.length });
    });

    const itens = Array.from({ length: 5000 }, (_, i) => ({ nome: `item-${i}` }));
    const resposta = await request(app).post("/v1/coisa").send({ itens });
    expect(resposta.body).toEqual({ recebidos: 5000 });
    await esperar(30);

    const spans = memoria.getFinishedSpans();
    const servidor = spans.find((s) => s.name === "POST /v1/coisa");
    const filho = spans.find((s) => s.name === "coisa.criar");
    expect(servidor).toBeDefined();
    expect(filho?.spanContext().traceId).toBe(servidor?.spanContext().traceId);
    expect(filho?.parentSpanContext?.spanId).toBe(servidor?.spanContext().spanId);
  });

  it("[CA-9] a sonda que não gera trace é o MESMO prefixo onde a saúde é montada", async () => {
    const { PREFIXO_DE_SAUDE } = await import("./prefixo-de-saude.ts");
    const { PREFIXO_DE_SAUDE: doApp } = await import("../app.ts");
    expect(doApp).toBe(PREFIXO_DE_SAUDE);
    const fonte = readFileSync(new URL("./rastreamento.ts", import.meta.url), "utf8");
    expect(fonte).toContain('from "./prefixo-de-saude.ts"');
    expect(fonte).not.toMatch(/["']\/v1\/health["']/);
    expect(fonte).not.toMatch(/reentrarNoRastreio|spansDasRequisicoes/);
  });

  it("encerrar desfaz o registro e permite iniciar de novo", async () => {
    const memoria = new InMemorySpanExporter();
    rastreamento = iniciarRastreamento({ exportador: memoria });
    expect(rastreamentoAtivo()).toBe(true);
    await rastreamento?.encerrar();
    rastreamento = undefined;
    expect(rastreamentoAtivo()).toBe(false);
    rastreamento = iniciarRastreamento({ exportador: new InMemorySpanExporter() });
    expect(rastreamentoAtivo()).toBe(true);
  });
});
