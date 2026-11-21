/**
 * Rastreamento ponta a ponta com OpenTelemetry (card #139).
 *
 * Um trace por requisição: SERVER `POST /v1/vitrine/:apelido/pedidos` →
 * `pedido.criar` (caso de uso) → `prisma:client:db_query` (Postgres).
 *
 * Decisões que importam (D-1, D-3, D-7):
 * - **Opcional.** Sem `OTEL_EXPORTER_OTLP_ENDPOINT` nenhum provedor é
 *   registrado, e `medirEtapa` vira uma chamada direta. A API sobe sem Jaeger.
 * - **Instrumentação manual.** O span SERVER sai deste middleware, o do caso
 *   de uso de `medirEtapa`, o do banco do `@prisma/instrumentation`, que só
 *   liga o ajudante global. Sem `--import`, sem auto-instrumentação de ESM.
 * - **Raiz nova por requisição.** `traceparent` e `tracestate` do cliente são
 *   ignorados: quem chama de fora não escolhe o trace da casa.
 * - **O que sai é lista de permissão** (`exportador-higienizado.ts`).
 * - **A requisição nunca espera o coletor:** o lote tem fila limitada e
 *   tempo de exportação curto; se o Jaeger cair, o trace se perde e só.
 */

import {
  context,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  AlwaysOnSampler,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  TracerProvider,
  type SpanExporter,
} from "@opentelemetry/sdk-trace";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { exportadorHigienizado } from "./exportador-higienizado.ts";
import { rotaDaRequisicao } from "./log.ts";
import type { ConfiguracaoDoExportador } from "./observabilidade.ts";

/** Nome do instrumento (escopo) dos spans da casa. */
const NOME_DO_ESCOPO = "simpleclick-api";

/** O identificador da requisição só vira atributo se for UUID (gerado por nós). */
const FORMA_DE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Caminho que não gera trace: a sonda de saúde roda a cada poucos segundos. */
const PREFIXO_DAS_SONDAS = "/v1/health";

export interface OpcoesDoRastreamento {
  /** Destino OTLP (produção/local). Ignorado quando `exportador` é dado. */
  readonly configuracao?: ConfiguracaoDoExportador | undefined;
  /**
   * Exportador pronto — a prova passa um `InMemorySpanExporter`. Sempre sai
   * embrulhado pela lista de permissão, como o OTLP.
   */
  readonly exportador?: SpanExporter | undefined;
  readonly ambiente?: string | undefined;
}

export interface Rastreamento {
  /** Esvazia a fila e desfaz tudo o que `iniciarRastreamento` registrou. */
  encerrar(): Promise<void>;
}

let ativo = false;

/** Verdadeiro quando há provedor registrado por este módulo. */
export function rastreamentoAtivo(): boolean {
  return ativo;
}

/**
 * Registra o provedor, o gerenciador de contexto e o ajudante do Prisma.
 * Devolve `undefined` quando não há para onde exportar (rastreamento desligado).
 */
export function iniciarRastreamento(
  opcoes: OpcoesDoRastreamento,
): Rastreamento | undefined {
  if (opcoes.exportador === undefined && opcoes.configuracao === undefined) {
    return undefined;
  }
  if (ativo) throw new Error("O rastreamento já foi iniciado neste processo.");

  const gerenciador = new AsyncLocalStorageContextManager().enable();
  context.setGlobalContextManager(gerenciador);

  const processador =
    opcoes.exportador === undefined
      ? new BatchSpanProcessor({
          exporter: exportadorHigienizado(
            new OTLPTraceExporter({
              url: `${opcoes.configuracao?.endpoint ?? ""}/v1/traces`,
              headers: { ...opcoes.configuracao?.cabecalhos },
              timeoutMillis: 5000,
            }),
          ),
          maxQueueSize: 2048,
          exportTimeoutMillis: 5000,
          scheduledDelayMillis: 2000,
        })
      : new SimpleSpanProcessor({
          exporter: exportadorHigienizado(opcoes.exportador),
        });

  const provedor = new TracerProvider({
    sampler: new AlwaysOnSampler(),
    resource: resourceFromAttributes({
      "service.name": NOME_DO_ESCOPO,
      "deployment.environment.name":
        opcoes.ambiente ?? process.env.NODE_ENV ?? "development",
    }),
    spanProcessors: [processador],
  });
  trace.setGlobalTracerProvider(provedor);

  // Só liga o ajudante global (`globalThis.PRISMA_INSTRUMENTATION`) que o
  // cliente do Prisma consulta a cada consulta; nada é "monkey-patched".
  const prisma = new PrismaInstrumentation();
  prisma.setTracerProvider(provedor);
  prisma.enable();

  ativo = true;
  return {
    async encerrar() {
      ativo = false;
      prisma.disable();
      await provedor.shutdown().catch(() => undefined);
      trace.disable();
      context.disable();
    },
  };
}

function nomeDoErro(erro: unknown): string {
  return erro instanceof Error && /^[A-Za-z0-9_.]{1,64}$/.test(erro.name)
    ? erro.name
    : "Erro";
}

/**
 * Roda `acao` dentro de um span filho do ativo. Sem rastreamento é uma
 * chamada direta. Em erro marca ERROR com só o NOME do erro — nunca a
 * mensagem, nunca `recordException`.
 */
export function medirEtapa<T>(
  nome: string,
  acao: () => Promise<T>,
): Promise<T> {
  return trace
    .getTracer(NOME_DO_ESCOPO)
    .startActiveSpan(nome, async (span: Span) => {
      try {
        return await acao();
      } catch (erro) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute("error.type", nomeDoErro(erro));
        throw erro;
      } finally {
        span.end();
      }
    });
}

const spansDasRequisicoes = new WeakMap<object, Span>();

/**
 * Abre o span SERVER como RAIZ e roda o resto da cadeia dentro dele.
 * Montado antes do registro de requisição, que então já enxerga o trace.
 */
export function middlewareDeRastreamento(): RequestHandler {
  return function rastrearRequisicao(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (!ativo || req.path.startsWith(PREFIXO_DAS_SONDAS)) {
      next();
      return;
    }

    const span = trace
      .getTracer(NOME_DO_ESCOPO)
      .startSpan(
        req.method,
        {
          kind: SpanKind.SERVER,
          root: true,
          attributes: { "http.request.method": req.method },
        },
        ROOT_CONTEXT,
      );
    spansDasRequisicoes.set(req, span);
    let encerrado = false;

    function encerrar(cancelada: boolean): void {
      if (encerrado) return;
      encerrado = true;
      const rota = rotaDaRequisicao(req);
      span.updateName(rota === undefined ? req.method : `${req.method} ${rota}`);
      if (rota !== undefined) span.setAttribute("http.route", rota);
      const identificador = res.getHeader("x-request-id");
      if (typeof identificador === "string" && FORMA_DE_UUID.test(identificador)) {
        span.setAttribute("simpleclick.requisicao_id", identificador);
      }
      if (cancelada) {
        span.setAttribute("error.type", "cancelada");
        span.setStatus({ code: SpanStatusCode.ERROR });
      } else {
        span.setAttribute("http.response.status_code", res.statusCode);
        if (res.statusCode >= 500) {
          span.setAttribute("error.type", String(res.statusCode));
          span.setStatus({ code: SpanStatusCode.ERROR });
        }
      }
      span.end();
    }

    res.on("finish", () => encerrar(false));
    res.on("close", () => encerrar(true));

    context.with(trace.setSpan(ROOT_CONTEXT, span), next);
  };
}

/**
 * Devolve a cadeia ao contexto do span da requisição. O leitor de corpo do
 * Express chama `next()` de dentro de um evento do socket, que não herda o
 * contexto; este passo, depois dele, o restaura.
 */
export function reentrarNoRastreio(): RequestHandler {
  return function reentrar(req: Request, _res: Response, next: NextFunction): void {
    const span = spansDasRequisicoes.get(req);
    if (span === undefined) {
      next();
      return;
    }
    context.with(trace.setSpan(ROOT_CONTEXT, span), next);
  };
}
