/**
 * Borda de validação das rotas de métricas (P-007).
 *
 * A consulta é um objeto FECHADO: chave que a rota não declara é recusada, e
 * não ignorada. É o que faz "informar o identificador da loja B na requisição"
 * responder 400 em vez de ser silenciosamente descartado (AC-811) — a loja vem
 * do apelido no caminho e do contexto, nunca de um parâmetro.
 */
import { z } from "zod";

import { ATALHOS_DE_PERIODO } from "./periodo.ts";

/** Data civil no formato que o endereço da tela carrega: `2026-09-27`. */
export const esquemaDeDataCivil = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD");

/** O que a consulta de métricas aceita na query. */
export const esquemaDaConsultaDeMetricas = z.strictObject({
  periodo: z.enum(ATALHOS_DE_PERIODO).default("hoje"),
  de: esquemaDeDataCivil.optional(),
  ate: esquemaDeDataCivil.optional(),
  /** Pede o recálculo agora, ignorando o que está guardado (AC-814). */
  atualizar: z.enum(["1", "true"]).optional(),
});

/** A exportação usa o mesmo recorte da tela, sem o pedido de recálculo. */
export const esquemaDaConsultaDeExportacao = z.strictObject({
  periodo: z.enum(ATALHOS_DE_PERIODO).default("hoje"),
  de: esquemaDeDataCivil.optional(),
  ate: esquemaDeDataCivil.optional(),
});

/** O apelido da loja no caminho. */
export const esquemaDoApelidoNaRota = z.object({
  apelido: z.string().trim().min(1).max(80),
});

export type ConsultaDeMetricas = z.output<typeof esquemaDaConsultaDeMetricas>;
export type ConsultaDeExportacao = z.output<
  typeof esquemaDaConsultaDeExportacao
>;
