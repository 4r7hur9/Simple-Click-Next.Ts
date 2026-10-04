/**
 * A remoção do cliente: ocultar com retenção, e não apagar (AC-705, ASM-703).
 *
 * POR QUE NÃO `DELETE`. Os pedidos do cliente apontam para a ficha, as
 * métricas contam com eles, e o pedido é registro imutável do momento da
 * compra (P-010). Apagar a linha quebraria a chave estrangeira ou, pior,
 * obrigaria a desligar os pedidos dela — e o faturamento de ontem mudaria
 * porque o dono limpou a agenda hoje.
 *
 * Então remover marca `removed_at`: a ficha sai da lista, da busca, do aviso de
 * repetido e do acesso direto, e a linha fica. O direito de exclusão da LGPD
 * é atendido por anonimização dentro do prazo (ASM-703), que é outro caminho.
 */
import { transacaoAtual } from "../../core/db.ts";

/**
 * Tira a ficha das listagens. Devolve falso quando não havia o que remover —
 * cliente de outra loja, já removido ou inexistente, indistinguíveis de fora.
 */
export async function removerCliente(clienteId: string): Promise<boolean> {
  const tx = transacaoAtual();
  const alterados = await tx.storeCustomer.updateMany({
    where: { id: clienteId, removedAt: null, anonymizedAt: null },
    data: { removedAt: new Date() },
  });
  return alterados.count === 1;
}
