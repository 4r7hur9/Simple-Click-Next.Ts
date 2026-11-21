/**
 * Exportador de spans com LISTA DE PERMISSÃO (card #139, D-8).
 *
 * Mesma ideia do registro (`core/log.ts`): o que vai para fora do processo
 * (Jaeger, arquivo, teste) é montado pelo que PODE sair, não pelo que não
 * pode. Um atributo, evento ou mensagem de erro que nasça amanhã — numa
 * biblioteca ou num `setAttribute` descuidado — é omitido em vez de vazar.
 *
 * Fica de fora, sempre: eventos (exceções carregam mensagem e pilha com o
 * valor que causou a falha), links, `status.message` e `traceState`.
 */

import type { SpanExporter } from "@opentelemetry/sdk-trace";

/** Tipo de um span legível, o mesmo que o exportador recebe. */
type SpanLegivel = Parameters<SpanExporter["export"]>[0][number];

/** Atributos que podem sair. Cada um descreve a requisição sem ser dado dela. */
export const ATRIBUTOS_PERMITIDOS_NO_SPAN: ReadonlySet<string> = new Set([
  // HTTP
  "http.request.method",
  "http.route",
  "http.response.status_code",
  "error.type",
  "simpleclick.requisicao_id",
  // Banco (Prisma): o SQL é parametrizado, sem os valores.
  "db.system",
  "db.system.name",
  "db.query.text",
  "db.operation.name",
]);

/** O SQL é cortado: consulta enorme não ajuda a investigar e incha o span. */
const TAMANHO_MAXIMO_DO_SQL = 2000;

function atributosPermitidos(
  atributos: SpanLegivel["attributes"],
): SpanLegivel["attributes"] {
  const limpo: Record<string, string | number | boolean> = {};
  for (const [chave, valor] of Object.entries(atributos)) {
    if (!ATRIBUTOS_PERMITIDOS_NO_SPAN.has(chave)) continue;
    if (
      typeof valor !== "string" &&
      typeof valor !== "number" &&
      typeof valor !== "boolean"
    ) {
      continue;
    }
    limpo[chave] =
      chave === "db.query.text" && typeof valor === "string"
        ? valor.slice(0, TAMANHO_MAXIMO_DO_SQL)
        : valor;
  }
  return limpo;
}

/** Cópia do span só com o que a lista permite. */
export function higienizarSpan(span: SpanLegivel): SpanLegivel {
  const contexto = span.spanContext();
  const pai = span.parentSpanContext;
  return {
    name: span.name,
    kind: span.kind,
    spanContext: () => ({
      traceId: contexto.traceId,
      spanId: contexto.spanId,
      traceFlags: contexto.traceFlags,
    }),
    ...(pai === undefined
      ? {}
      : {
          parentSpanContext: {
            traceId: pai.traceId,
            spanId: pai.spanId,
            traceFlags: pai.traceFlags,
          },
        }),
    startTime: span.startTime,
    endTime: span.endTime,
    // Sem `message`: o texto livre de um erro é exatamente o que vaza.
    status: { code: span.status.code },
    attributes: atributosPermitidos(span.attributes),
    links: [],
    events: [],
    duration: span.duration,
    ended: span.ended,
    resource: span.resource,
    instrumentationScope: span.instrumentationScope,
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  };
}

/** Embrulha um exportador para que nada saia sem passar pela lista. */
export function exportadorHigienizado(interno: SpanExporter): SpanExporter {
  return {
    export(spans, retorno) {
      interno.export(spans.map(higienizarSpan), retorno);
    },
    shutdown: () => interno.shutdown(),
    ...(interno.forceFlush === undefined
      ? {}
      : { forceFlush: () => interno.forceFlush?.() ?? Promise.resolve() }),
  };
}
