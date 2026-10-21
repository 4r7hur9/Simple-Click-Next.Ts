/**
 * Limites controlados pela administração (card #25).
 *
 * Por DONO: quantas lojas ele abre (padrão 2). Por LOJA: equipe (1),
 * produtos (500), categorias (50) e clientes (5000). A administração ajusta os
 * padrões da plataforma, uma loja ou um dono; `null` num ajuste volta ao
 * padrão.
 *
 * Criar além do limite responde `409 limite_atingido {recurso, limite, uso}`.
 * Cliente que chega por um pedido do site nunca é barrado (a venda não pode
 * cair por isso); o limite de clientes vale para o cadastro feito no painel.
 */

import { z } from "zod";

/** Recursos limitados por loja. */
export const RECURSOS_LIMITADOS_DA_LOJA = [
  "staff",
  "produtos",
  "categorias",
  "clientes",
] as const;

export type RecursoLimitadoDaLoja = (typeof RECURSOS_LIMITADOS_DA_LOJA)[number];

/** Todo recurso limitado, inclusive as lojas de um dono. */
export const RECURSOS_LIMITADOS = [
  ...RECURSOS_LIMITADOS_DA_LOJA,
  "lojas",
] as const;

export type RecursoLimitado = (typeof RECURSOS_LIMITADOS)[number];

export const esquemaDoRecursoLimitado = z.enum(RECURSOS_LIMITADOS);

/** Os padrões da plataforma, quando nada foi ajustado. */
export const LIMITES_PADRAO = Object.freeze({
  lojasPorDono: 2,
  staffPorLoja: 1,
  produtosPorLoja: 500,
  categoriasPorLoja: 50,
  clientesPorLoja: 5000,
});

/** Como cada recurso se chama na tela. */
export const ROTULOS_DOS_RECURSOS: Readonly<Record<RecursoLimitado, string>> =
  Object.freeze({
    staff: "Pessoas na equipe",
    produtos: "Produtos",
    categorias: "Categorias",
    clientes: "Clientes",
    lojas: "Lojas",
  });

/** Um recurso: quanto pode, quanto usa e quanto sobra. */
export const esquemaDoUsoELimite = z.strictObject({
  recurso: esquemaDoRecursoLimitado,
  limite: z.number().int().nonnegative(),
  uso: z.number().int().nonnegative(),
  /** `limite - uso`, nunca negativo. */
  restante: z.number().int().nonnegative(),
});

export type UsoELimite = z.infer<typeof esquemaDoUsoELimite>;

/**
 * `GET /v1/lojas/:apelido/limites` (dono e equipe) e
 * `GET /v1/admin/lojas/:id/limites` (administração).
 */
export const esquemaDosLimitesDaLoja = z.strictObject({
  limites: z.array(esquemaDoUsoELimite),
  /** O que a administração ajustou para esta loja; nulo = vale o padrão. */
  ajustes: z
    .strictObject({
      staff: z.number().int().nonnegative().nullable(),
      produtos: z.number().int().nonnegative().nullable(),
      categorias: z.number().int().nonnegative().nullable(),
      clientes: z.number().int().nonnegative().nullable(),
    })
    .optional(),
});

export type LimitesDaLojaNoContrato = z.infer<typeof esquemaDosLimitesDaLoja>;

const quantidade = (rotulo: string) =>
  z
    .number(`${rotulo}: informe um número inteiro.`)
    .int(`${rotulo}: informe um número inteiro.`)
    .min(0, `${rotulo}: não pode ser negativo.`)
    .max(1_000_000, `${rotulo}: no máximo 1.000.000.`);

/** `GET /v1/admin/limites` — os padrões da plataforma. */
export const esquemaDosPadroesDeLimite = z.strictObject({
  lojasPorDono: z.number().int().nonnegative(),
  staffPorLoja: z.number().int().nonnegative(),
  produtosPorLoja: z.number().int().nonnegative(),
  categoriasPorLoja: z.number().int().nonnegative(),
  clientesPorLoja: z.number().int().nonnegative(),
});

export type PadroesDeLimiteNoContrato = z.infer<
  typeof esquemaDosPadroesDeLimite
>;

/** `PATCH /v1/admin/limites` — só os campos enviados mudam. */
export const esquemaDaEdicaoDosPadroesDeLimite = z
  .strictObject({
    lojasPorDono: quantidade("Lojas por dono").optional(),
    staffPorLoja: quantidade("Equipe por loja").optional(),
    produtosPorLoja: quantidade("Produtos por loja").optional(),
    categoriasPorLoja: quantidade("Categorias por loja").optional(),
    clientesPorLoja: quantidade("Clientes por loja").optional(),
  })
  .refine((valor) => Object.keys(valor).length > 0, {
    message: "Informe ao menos um limite para alterar.",
  });

/** `PATCH /v1/admin/lojas/:id/limites` — `null` volta ao padrão. */
export const esquemaDaEdicaoDosLimitesDaLoja = z
  .strictObject({
    staff: quantidade("Equipe").nullable().optional(),
    produtos: quantidade("Produtos").nullable().optional(),
    categorias: quantidade("Categorias").nullable().optional(),
    clientes: quantidade("Clientes").nullable().optional(),
  })
  .refine((valor) => Object.keys(valor).length > 0, {
    message: "Informe ao menos um limite para alterar.",
  });

/** `GET` e `PATCH /v1/admin/donos/:identidadeId/limites`. */
export const esquemaDoLimiteDoDono = z.strictObject({
  identidadeId: z.uuid(),
  limite: esquemaDoUsoELimite,
  /** O ajuste deste dono; nulo = vale o padrão da plataforma. */
  ajuste: z.number().int().nonnegative().nullable(),
});

export type LimiteDoDonoNoContrato = z.infer<typeof esquemaDoLimiteDoDono>;

export const esquemaDaEdicaoDoLimiteDoDono = z.strictObject({
  lojas: quantidade("Lojas").nullable(),
});

/** A recusa de quem passou do limite. */
export const esquemaDoLimiteAtingido = z.strictObject({
  erro: z.literal("limite_atingido"),
  recurso: esquemaDoRecursoLimitado,
  limite: z.number().int().nonnegative(),
  uso: z.number().int().nonnegative(),
  mensagem: z.string(),
});

export type LimiteAtingidoNoContrato = z.infer<typeof esquemaDoLimiteAtingido>;

/** A frase da recusa, por recurso. */
export function mensagemDoLimiteAtingido(
  recurso: RecursoLimitado,
  limite: number,
): string {
  const frases: Record<RecursoLimitado, string> = {
    staff: `Esta loja já tem ${limite} ${limite === 1 ? "pessoa" : "pessoas"} na equipe, o máximo do plano.`,
    produtos: `Esta loja chegou ao máximo de ${limite} produtos.`,
    categorias: `Esta loja chegou ao máximo de ${limite} categorias.`,
    clientes: `Esta loja chegou ao máximo de ${limite} clientes cadastrados.`,
    lojas: `Você já tem ${limite} ${limite === 1 ? "loja" : "lojas"}, o máximo permitido.`,
  };
  return `${frases[recurso]} Para aumentar, fale com o SimpleClick.`;
}
