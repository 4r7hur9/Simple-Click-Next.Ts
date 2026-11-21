/**
 * Métricas RED da API (card #139): taxa, erros e duração, por rota.
 *
 * - **Rate / Errors:** `http_requests_total{method,route,status_code}` — o
 *   erro é a fatia `status_code=~"5.."` do mesmo contador.
 * - **Duration:** `http_request_duration_seconds{method,route,status_code}`,
 *   histograma com um bucket em `1` segundo, que é o limite do SLO.
 *
 * **Cardinalidade é a regra.** Etiqueta com valor livre derruba o Prometheus
 * (e vaza dado). Por isso:
 * - `route` é o MOLDE (`/v1/vitrine/:apelido/pedidos`), nunca o endereço
 *   pedido: id, token, telefone e apelido da loja não chegam à etiqueta;
 * - `method` é uma lista fechada; o que sai dela vira `OUTRO`;
 * - fora de molde, `route` é `nao_encontrada` (404 sem rota) ou
 *   `nao_roteada` (resposta de um middleware antes do roteamento — CORS,
 *   aceite, portão);
 * - `status_code` é o código numérico, ou `cancelada` quando o cliente fecha
 *   a conexão antes da resposta.
 *
 * O `Registry` é próprio de cada app (nunca o global): dois apps no mesmo
 * processo de teste não somam um no outro.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

import { instalarCapturaDeRota, rotaDaRequisicao } from "./log.ts";

/** Buckets em segundos; o de 1 s é o limite do SLO de criação de pedido. */
export const BUCKETS_DE_DURACAO = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
] as const;

const METODOS_CONHECIDOS: ReadonlySet<string> = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/** Etiqueta de `route` para 404 sem rota. */
export const ROTA_NAO_ENCONTRADA = "nao_encontrada";
/** Etiqueta de `route` para resposta dada antes de rotear. */
export const ROTA_NAO_ROTEADA = "nao_roteada";
/** Etiqueta de `status_code` quando a conexão fechou antes do `finish`. */
export const STATUS_CANCELADA = "cancelada";

export interface OpcoesDeMetricas {
  /** Liga as métricas padrão do processo (memória, laço de eventos). */
  readonly metricasPadrao?: boolean;
}

export interface Metricas {
  readonly registro: Registry;
  /** Mede cada requisição que passa por ele. */
  middleware(): RequestHandler;
}

/** Método HTTP em forma de etiqueta: lista fechada. */
export function metodoEmEtiqueta(metodo: string): string {
  const maiusculo = metodo.toUpperCase();
  return METODOS_CONHECIDOS.has(maiusculo) ? maiusculo : "OUTRO";
}

/** Cria o registro e os instrumentos RED. */
export function criarMetricas(opcoes: OpcoesDeMetricas = {}): Metricas {
  const registro = new Registry();
  if (opcoes.metricasPadrao === true) {
    collectDefaultMetrics({ register: registro });
  }

  const nomesDasEtiquetas = ["method", "route", "status_code"] as const;
  const requisicoes = new Counter({
    name: "http_requests_total",
    help: "Requisições HTTP atendidas, por método, rota (molde) e status.",
    labelNames: nomesDasEtiquetas,
    registers: [registro],
  });
  const duracao = new Histogram({
    name: "http_request_duration_seconds",
    help: "Duração das requisições HTTP em segundos, por método, rota (molde) e status.",
    labelNames: nomesDasEtiquetas,
    buckets: [...BUCKETS_DE_DURACAO],
    registers: [registro],
  });

  function middleware(): RequestHandler {
    return function medirRequisicao(
      req: Request,
      res: Response,
      next: NextFunction,
    ): void {
      instalarCapturaDeRota(req);
      const inicio = process.hrtime.bigint();
      let registrada = false;

      function registrar(statusCode: string): void {
        if (registrada) return;
        registrada = true;
        const segundos = Number(process.hrtime.bigint() - inicio) / 1e9;
        const route =
          rotaDaRequisicao(req) ??
          (res.statusCode === 404 ? ROTA_NAO_ENCONTRADA : ROTA_NAO_ROTEADA);
        const etiquetas = {
          method: metodoEmEtiqueta(req.method),
          route,
          status_code: statusCode,
        };
        requisicoes.inc(etiquetas);
        duracao.observe(etiquetas, segundos);
      }

      res.on("finish", () => registrar(String(res.statusCode)));
      // `close` sem `finish`: o cliente desistiu antes da resposta terminar.
      res.on("close", () => registrar(STATUS_CANCELADA));
      next();
    };
  }

  return { registro, middleware };
}
