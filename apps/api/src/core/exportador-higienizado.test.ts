import { SpanKind, SpanStatusCode, TraceFlags } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { InMemorySpanExporter, type ReadableSpan } from "@opentelemetry/sdk-trace";
import { describe, expect, it } from "vitest";

import {
  ATRIBUTOS_PERMITIDOS_NO_SPAN,
  exportadorHigienizado,
  higienizarSpan,
} from "./exportador-higienizado.ts";

const SENTINELA = "valor-sentinela-que-nao-pode-sair";

/** Span sintético que carrega TUDO o que não pode sair. */
function spanSujo(): ReadableSpan {
  return {
    name: "POST /v1/vitrine/:apelido/pedidos",
    kind: SpanKind.SERVER,
    spanContext: () => ({
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      traceFlags: TraceFlags.SAMPLED,
      traceState: { serialize: () => `vendor=${SENTINELA}` } as never,
    }),
    parentSpanContext: {
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "00f067aa0ba902b7",
      traceFlags: TraceFlags.SAMPLED,
    },
    startTime: [1, 0],
    endTime: [2, 0],
    status: { code: SpanStatusCode.ERROR, message: `falhou com ${SENTINELA}` },
    attributes: {
      "http.request.method": "POST",
      "http.route": "/v1/vitrine/:apelido/pedidos",
      "http.response.status_code": 500,
      "db.query.text": "SELECT 1 WHERE x = $1",
      "url.full": `https://x.test/?telefone=${SENTINELA}`,
      "http.request.header.authorization": `Bearer ${SENTINELA}`,
      "enduser.id": SENTINELA,
      "exception.message": SENTINELA,
      "campo.que.nasceu.ontem": SENTINELA,
    },
    links: [
      {
        context: {
          traceId: "0af7651916cd43dd8448eb211c80319c",
          spanId: "1111111111111111",
          traceFlags: 1,
        },
        attributes: { segredo: SENTINELA },
      },
    ],
    events: [
      {
        name: "exception",
        time: [1, 5],
        attributes: {
          "exception.message": SENTINELA,
          "exception.stacktrace": `Error: ${SENTINELA}\n at x`,
        },
      },
    ],
    duration: [1, 0],
    ended: true,
    resource: resourceFromAttributes({ "service.name": "simpleclick-api" }),
    instrumentationScope: { name: "simpleclick-api" },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  } as ReadableSpan;
}

describe("exportador higienizado", () => {
  it("deixa passar só atributos da lista e descarta eventos, links, mensagem de status e traceState", () => {
    const limpo = higienizarSpan(spanSujo());

    expect(Object.keys(limpo.attributes).sort()).toEqual(
      [
        "db.query.text",
        "http.request.method",
        "http.response.status_code",
        "http.route",
      ].sort(),
    );
    expect(limpo.events).toEqual([]);
    expect(limpo.links).toEqual([]);
    expect(limpo.status).toEqual({ code: SpanStatusCode.ERROR });
    expect(limpo.spanContext().traceState).toBeUndefined();
    expect(limpo.spanContext().traceId).toBe("0af7651916cd43dd8448eb211c80319c");
    expect(limpo.parentSpanContext?.spanId).toBe("00f067aa0ba902b7");
    expect(JSON.stringify(limpo)).not.toContain(SENTINELA);
  });

  it("corta SQL gigante", () => {
    const span = spanSujo();
    (span.attributes as Record<string, string>)["db.query.text"] = "x".repeat(5000);
    expect(String(higienizarSpan(span).attributes["db.query.text"]).length).toBe(2000);
  });

  it("o exportador embrulhado entrega ao de baixo só o que passou pela lista", () => {
    const memoria = new InMemorySpanExporter();
    const exportador = exportadorHigienizado(memoria);
    exportador.export([spanSujo()], () => undefined);

    const [entregue] = memoria.getFinishedSpans();
    expect(entregue).toBeDefined();
    expect(JSON.stringify(entregue?.attributes)).not.toContain(SENTINELA);
    expect(entregue?.events).toEqual([]);
  });

  it("a lista de permissão é pequena e conhecida", () => {
    expect([...ATRIBUTOS_PERMITIDOS_NO_SPAN]).not.toContain("url.full");
    expect([...ATRIBUTOS_PERMITIDOS_NO_SPAN]).not.toContain("enduser.id");
  });
});
