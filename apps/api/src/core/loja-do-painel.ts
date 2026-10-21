/**
 * A loja do painel pelo apelido (card #25).
 *
 * O painel trabalha com a loja ATIVA e também com a que AGUARDA APROVAÇÃO: o
 * dono monta o cardápio enquanto a administração analisa. Loja desativada,
 * recusada ou excluída não abre o painel — só a rota da situação a alcança,
 * para dizer por quê.
 */

import { transacaoAtual } from "./db.ts";

/** Situações em que o painel da loja funciona. */
export const SITUACOES_DO_PAINEL: ReadonlySet<string> = new Set([
  "ACTIVE",
  "PENDING_APPROVAL",
]);

export type LojaDoPainel =
  | {
      readonly encontrada: true;
      readonly id: string;
      readonly apelido: string;
      readonly situacao: string;
    }
  | { readonly encontrada: false };

/** Resolve a loja do apelido, dentro da transação em curso. */
export async function identificarLojaDoPainel(chegada: {
  readonly apelido?: string | null;
}): Promise<LojaDoPainel> {
  if (!chegada.apelido) return { encontrada: false };
  const [linha] = await transacaoAtual().$queryRaw<
    { id: string; slug: string; status: string }[]
  >`SELECT id::text AS id, slug, status FROM app.resolve_store(${chegada.apelido})`;
  if (linha === undefined || !SITUACOES_DO_PAINEL.has(linha.status)) {
    return { encontrada: false };
  }
  return {
    encontrada: true,
    id: linha.id,
    apelido: linha.slug,
    situacao: linha.status,
  };
}
