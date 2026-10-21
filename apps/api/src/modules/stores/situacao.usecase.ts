/**
 * A situação da loja vista pelo próprio dono (AC-209).
 *
 * Roda na transação da equipe, com a loja no contexto e o vínculo já
 * conferido (`core/db.ts`, regra 7). As duas leituras passam pelas políticas
 * da equipe: o dono enxerga a própria loja em QUALQUER situação — a política
 * pública esconde a suspensa, a da equipe não (migração 0003) — e enxerga a
 * trilha da própria loja, onde a administração registrou o motivo.
 *
 * O motivo vem da trilha, e não de uma coluna que o dono pudesse editar: o
 * que ele lê é exatamente o que a administração escreveu, e ninguém o
 * reescreve depois (a trilha é imutável, G9).
 */

import type {
  SituacaoDaLoja,
  SituacaoParaODonoNoContrato,
} from "@simpleclick/contracts";

import { transacaoAtual } from "../../core/db.ts";

/** O último ato da trilha com motivo, entre os pedidos. */
async function ultimoAto(
  acoes: readonly string[],
): Promise<{ readonly desde: string; readonly motivo: string } | null> {
  const linhas = await transacaoAtual().$queryRaw<
    { created_at: Date; motivo: string | null }[]
  >`
    SELECT created_at, after_data->>'motivo' AS motivo
      FROM app.audit_log
     WHERE store_id = app.current_store_id()
       AND action = ANY(${[...acoes]}::text[])
     ORDER BY created_at DESC, id DESC
     LIMIT 1`;
  const linha = linhas[0];
  return linha === undefined
    ? null
    : { desde: linha.created_at.toISOString(), motivo: linha.motivo ?? "" };
}

/**
 * A situação da loja do contexto, ou `null` se a equipe não a enxerga.
 *
 * Desativada (INACTIVE): desde quando e por quê. Recusada (REJECTED): quando
 * e o motivo. Aguardando aprovação: a marca `aguardandoAprovacao` (card #25).
 */
export async function situacaoParaODono(): Promise<SituacaoParaODonoNoContrato | null> {
  const tx = transacaoAtual();
  const lojas = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM app.stores WHERE id = app.current_store_id()`;
  const status = lojas[0]?.status as SituacaoDaLoja | undefined;
  if (status === undefined) return null;
  return {
    status,
    suspensao:
      status === "INACTIVE"
        ? await ultimoAto(["LOJA_SUSPENSA", "LOJA_DESATIVADA"])
        : null,
    recusa: status === "REJECTED" ? await ultimoAto(["LOJA_RECUSADA"]) : null,
    aguardandoAprovacao: status === "PENDING_APPROVAL",
  };
}
