/**
 * Configuração da observabilidade (card #139): métricas RED em `/metrics` e
 * o rastreamento opcional para o Jaeger.
 *
 * Duas regras de segurança moram aqui, e as duas são "fechado por padrão":
 *
 * 1. `/metrics` só existe com um token (`METRICAS_TOKEN`, 32+ caracteres) ou,
 *    sem token, com `METRICAS_ABERTAS=sim` FORA de produção. Sem `NODE_ENV` e
 *    sem token, a rota fica desligada: ambiente mal configurado fecha a porta.
 * 2. O rastreamento só liga com `OTEL_EXPORTER_OTLP_ENDPOINT`. Sem ela a API
 *    sobe do mesmo jeito e nenhum provedor é registrado.
 *
 * A função é pura (recebe a fonte por parâmetro, como `carregarAmbiente`) e os
 * erros citam só o NOME da variável — o valor pode ser credencial.
 */

import type { FonteDeAmbiente } from "./env.ts";

/** Variáveis que este módulo lê. O teste da partida as remove do ambiente. */
export const VARIAVEIS_DE_OBSERVABILIDADE = [
  "METRICAS_TOKEN",
  "METRICAS_ABERTAS",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
] as const;

/** Tamanho mínimo do token do `/metrics` (openssl rand -hex 32 dá 64). */
export const TAMANHO_MINIMO_DO_TOKEN_DE_METRICAS = 32;

/** Como o `/metrics` se comporta. */
export type AcessoAoMetricas =
  | { readonly tipo: "desligado" }
  | { readonly tipo: "aberto" }
  | { readonly tipo: "token"; readonly token: string };

/** Para onde vai o rastreamento; ausente quando o endpoint não foi dado. */
export interface ConfiguracaoDoExportador {
  readonly endpoint: string;
  /** Cabeçalhos de autenticação do coletor. Nunca é registrado. */
  readonly cabecalhos: Readonly<Record<string, string>>;
}

export interface ConfiguracaoDeObservabilidade {
  readonly metricas: AcessoAoMetricas;
  readonly exportador: ConfiguracaoDoExportador | undefined;
}

/** Configuração inválida; a mensagem cita variáveis, nunca valores. */
export class ErroDeObservabilidade extends Error {
  readonly mensagemEscritaPorNos = true as const;
  readonly variavel: string;

  constructor(variavel: string, problema: string) {
    super(`${variavel}: ${problema}`);
    this.name = "ErroDeObservabilidade";
    this.variavel = variavel;
  }
}

function texto(fonte: FonteDeAmbiente, nome: string): string | undefined {
  const bruto = fonte[nome]?.trim();
  return bruto === undefined || bruto === "" ? undefined : bruto;
}

function ehLoopback(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1"
  );
}

function lerCabecalhos(bruto: string | undefined): Record<string, string> {
  const cabecalhos: Record<string, string> = {};
  if (bruto === undefined) return cabecalhos;
  for (const par of bruto.split(",")) {
    const indice = par.indexOf("=");
    if (indice <= 0) {
      throw new ErroDeObservabilidade(
        "OTEL_EXPORTER_OTLP_HEADERS",
        "esperado o formato nome=valor separado por vírgula",
      );
    }
    cabecalhos[par.slice(0, indice).trim()] = par.slice(indice + 1).trim();
  }
  return cabecalhos;
}

function lerExportador(
  fonte: FonteDeAmbiente,
  producao: boolean,
): ConfiguracaoDoExportador | undefined {
  const endpoint = texto(fonte, "OTEL_EXPORTER_OTLP_ENDPOINT");
  if (endpoint === undefined) return undefined;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new ErroDeObservabilidade(
      "OTEL_EXPORTER_OTLP_ENDPOINT",
      "não é uma URL válida",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ErroDeObservabilidade(
      "OTEL_EXPORTER_OTLP_ENDPOINT",
      "só aceita http ou https",
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new ErroDeObservabilidade(
      "OTEL_EXPORTER_OTLP_ENDPOINT",
      "não pode levar credencial na URL; use OTEL_EXPORTER_OTLP_HEADERS",
    );
  }
  if (producao && url.protocol !== "https:" && !ehLoopback(url.hostname)) {
    throw new ErroDeObservabilidade(
      "OTEL_EXPORTER_OTLP_ENDPOINT",
      "em produção precisa ser https (exceto loopback)",
    );
  }

  return {
    endpoint: url.toString().replace(/\/$/, ""),
    cabecalhos: lerCabecalhos(texto(fonte, "OTEL_EXPORTER_OTLP_HEADERS")),
  };
}

function lerAcesso(
  fonte: FonteDeAmbiente,
  producao: boolean,
): AcessoAoMetricas {
  const token = texto(fonte, "METRICAS_TOKEN");
  const aberta = texto(fonte, "METRICAS_ABERTAS") === "sim";

  if (aberta && producao) {
    throw new ErroDeObservabilidade(
      "METRICAS_ABERTAS",
      "não é aceita em produção; use METRICAS_TOKEN",
    );
  }
  if (token !== undefined) {
    if (token.length < TAMANHO_MINIMO_DO_TOKEN_DE_METRICAS) {
      throw new ErroDeObservabilidade(
        "METRICAS_TOKEN",
        `precisa ter pelo menos ${TAMANHO_MINIMO_DO_TOKEN_DE_METRICAS} caracteres (gere com: openssl rand -hex 32)`,
      );
    }
    return { tipo: "token", token };
  }
  // Sem token: só abre fora de produção E com NODE_ENV declarado.
  const ambienteDeclarado = texto(fonte, "NODE_ENV") !== undefined;
  if (aberta && ambienteDeclarado) return { tipo: "aberto" };
  return { tipo: "desligado" };
}

/** Lê e valida a configuração de métricas e de rastreamento. */
export function lerConfiguracaoDeObservabilidade(
  fonte: FonteDeAmbiente,
): ConfiguracaoDeObservabilidade {
  const producao = texto(fonte, "NODE_ENV") === "production";
  return {
    metricas: lerAcesso(fonte, producao),
    exportador: lerExportador(fonte, producao),
  };
}
