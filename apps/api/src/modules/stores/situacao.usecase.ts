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

/** A situação da loja do contexto, ou `null` se a equipe não a enxerga. */
export async function situacaoParaODono(): Promise<SituacaoParaODonoNoContrato | null> {
  const tx = transacaoAtual();
  const lojas = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM app.stores WHERE id = app.current_store_id()`;
  const status = lojas[0]?.status as SituacaoDaLoja | undefined;
  if (status === undefined) return null;
  if (status !== "SUSPENDED") return { status, suspensao: null };

  const suspensoes = await tx.$queryRaw<
    { created_at: Date; motivo: string | null }[]
  >`
    SELECT created_at, after_data->>'motivo' AS motivo
      FROM app.audit_log
     WHERE store_id = app.current_store_id()
       AND action = 'LOJA_SUSPENSA'
     ORDER BY created_at DESC, id DESC
     LIMIT 1`;
  const suspensao = suspensoes[0];
  return {
    status,
    suspensao:
      suspensao === undefined
        ? null
        : {
            desde: suspensao.created_at.toISOString(),
            motivo: suspensao.motivo ?? "",
          },
  };
}
