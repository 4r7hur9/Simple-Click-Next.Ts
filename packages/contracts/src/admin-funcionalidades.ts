/**
 * Contrato das funcionalidades liberadas por loja (T-207, AC-212, AC-213).
 *
 * A administração lê e altera as EXCEÇÕES de uma loja; o dono só lê o que
 * vale para a loja dele, para o painel esconder a área desligada. O catálogo
 * e a regra do padrão ligado moram em `@simpleclick/core` (funcionalidades).
 */

import { z } from "zod";

/** A exceção gravada: por que, quando e por quem. */
export const esquemaDaExcecaoDeFuncionalidade = z.strictObject({
  motivo: z.string(),
  definidaEm: z.string(),
  definidaPor: z.strictObject({ id: z.string(), nome: z.string() }).nullable(),
});

/** Uma funcionalidade como vale para a loja, vista pela administração. */
export const esquemaDaFuncionalidadeNaAdministracao = z.strictObject({
  chave: z.string(),
  rotulo: z.string(),
  descricao: z.string(),
  /** Algum ponto do sistema consulta a chave: só estas podem ser desligadas. */
  temEfeito: z.boolean(),
  ligada: z.boolean(),
  /** `null` = sem limite (versão 1: sempre). */
  limite: z.number().nullable(),
  excecao: esquemaDaExcecaoDeFuncionalidade.nullable(),
});

/** `GET /v1/admin/lojas/:id/funcionalidades` e a resposta do `PUT`. */
export const esquemaDasFuncionalidadesDaLoja = z.strictObject({
  loja: z.strictObject({ id: z.string(), nome: z.string() }),
  funcionalidades: z.array(esquemaDaFuncionalidadeNaAdministracao),
});

/**
 * `PUT /v1/admin/lojas/:id/funcionalidades/:chave`. Ligar de novo apaga a
 * exceção (volta ao padrão); desligar a grava. O motivo vai para a trilha.
 */
export const esquemaDaAlteracaoDeFuncionalidade = z.strictObject({
  ligada: z.boolean("Diga se a funcionalidade fica ligada ou desligada."),
  motivo: z
    .string("Informe o motivo da alteração.")
    .trim()
    .min(3, "Informe o motivo da alteração, com ao menos 3 letras.")
    .max(500, "O motivo cabe em até 500 caracteres."),
});

/** `GET /v1/lojas/:apelido/funcionalidades` — o que o painel do dono lê. */
export const esquemaDasFuncionalidadesParaODono = z.strictObject({
  funcionalidades: z.array(
    z.strictObject({ chave: z.string(), ligada: z.boolean() }),
  ),
});

export type FuncionalidadeNaAdministracaoNoContrato = z.infer<
  typeof esquemaDaFuncionalidadeNaAdministracao
>;
export type FuncionalidadesDaLojaNoContrato = z.infer<
  typeof esquemaDasFuncionalidadesDaLoja
>;
