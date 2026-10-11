/**
 * Situação da loja (AC-209, AC-210, AC-211): suspensão em curso, retenção da
 * excluída, os atos de suspender, reativar, excluir e restaurar, e o que o
 * painel do dono pergunta ao abrir.
 */

import { z } from "zod";

import { esquemaDaSituacaoDaLoja } from "./admin-cadastro.ts";

// ---------------------------------------------------------------------------
// Situação da loja: suspensão em curso e retenção (AC-209, AC-211)
// ---------------------------------------------------------------------------

/** A suspensão em curso: desde quando e o motivo que a administração deu. */
export const esquemaDaSuspensaoEmCurso = z.strictObject({
  /** Instante da suspensão, em ISO 8601. */
  desde: z.string(),
  motivo: z.string(),
});

/** A loja excluída: quando saiu do ar e até quando ainda pode voltar. */
export const esquemaDaRetencaoDaLoja = z.strictObject({
  /** Instante da exclusão, em ISO 8601. */
  excluidaEm: z.string(),
  /**
   * Até quando a loja pode ser restaurada; depois disso vem a remoção
   * definitiva. Nulo quando ela já aconteceu.
   */
  removerApos: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Suspender, reativar, excluir e restaurar (AC-209, AC-210, AC-211)
// ---------------------------------------------------------------------------

/**
 * Por quantos dias a loja excluída fica retida, e restaurável, antes da
 * remoção definitiva (ASM-204).
 */
export const DIAS_DE_RETENCAO_DA_LOJA_EXCLUIDA = 30;

/**
 * `PUT /v1/admin/lojas/:id/suspensao`. O motivo é obrigatório: ele fica na
 * trilha e é o que o dono lê ao entrar no painel.
 */
export const esquemaDaSuspensaoDaLoja = z.strictObject({
  motivo: z
    .string("Informe o motivo da suspensão.")
    .trim()
    .min(3, "Informe o motivo da suspensão, com ao menos 3 letras.")
    .max(500, "O motivo cabe em até 500 caracteres."),
});

/**
 * `PUT /v1/admin/lojas/:id/reativacao` e `PUT /v1/admin/lojas/:id/restauracao`.
 * Sem campo nenhum: o ato é o próprio endereço.
 */
export const esquemaDaReativacaoDaLoja = z.strictObject({});

/** `DELETE /v1/admin/lojas/:id` — a confirmação é o nome da loja, digitado. */
export const esquemaDaExclusaoDaLoja = z.strictObject({
  confirmacao: z
    .string("Digite o nome da loja para confirmar.")
    .trim()
    .min(1, "Digite o nome da loja para confirmar.")
    .max(200, "Digite o nome da loja para confirmar."),
});

/** A recusa da confirmação que não confere. Nada foi excluído. */
export const MENSAGEM_DE_CONFIRMACAO_DIFERENTE =
  "O nome digitado não é o nome da loja. Nada foi excluído.";

/**
 * O nome digitado confere com o nome da loja? Espaço nas pontas e espaço
 * repetido não contam; letra, acento e maiúscula contam — é uma confirmação,
 * e não uma busca. A tela e a API aplicam a MESMA regra.
 */
export function confirmacaoConfere(confirmacao: string, nome: string): boolean {
  const normalizar = (texto: string) =>
    texto.normalize("NFC").trim().replace(/\s+/g, " ");
  const digitado = normalizar(confirmacao);
  return digitado !== "" && digitado === normalizar(nome);
}

/**
 * `GET /v1/lojas/:apelido/situacao` — o que o painel do dono pergunta ao abrir
 * (AC-209). Responde também para a loja suspensa, que a vitrine esconde: é
 * por aqui que o dono fica sabendo por que a loja saiu do ar.
 */
export const esquemaDaSituacaoParaODono = z.strictObject({
  status: esquemaDaSituacaoDaLoja,
  suspensao: esquemaDaSuspensaoEmCurso.nullable(),
});

export type SituacaoParaODonoNoContrato = z.infer<
  typeof esquemaDaSituacaoParaODono
>;
