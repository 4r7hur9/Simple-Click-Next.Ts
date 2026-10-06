/**
 * Pedido cancelado não vai mais ao papel (T-608 — AC-624, AC-607).
 *
 * O cupom de cada pedido entra na fila de impressão quando o pedido é criado
 * (`app.enfileirar_impressao`, migração 0034). Se o agente está fora do ar e o
 * dono cancela o pedido, o trabalho continuaria esperando — e, na volta do
 * agente, a cozinha receberia o cupom de um pedido que não existe mais. Aqui o
 * cancelamento leva junto o que ainda espera na fila, na MESMA transação.
 *
 * O módulo de pedidos não importa o de impressão (fronteiras): a instrução é
 * a mesma de `cancelarTrabalhosDoPedido` (`printing/fila.usecase.ts`), e a
 * política do banco só deixa a equipe da loja cancelar trabalho da própria
 * loja. O trabalho que já está com o agente também é cancelado: se ele
 * imprimir, a confirmação responde "cancelado"; se não, ele não volta.
 */
import { transacaoAtual } from "../../core/db.ts";

/** Cancela os trabalhos de impressão ainda pendentes do pedido da loja. */
export async function cancelarImpressoesPendentesDoPedido(
  lojaId: string,
  pedidoId: string,
): Promise<number> {
  return transacaoAtual().$executeRaw`
    UPDATE app.print_jobs
       SET status = 'CANCELED',
           lease_until = NULL,
           updated_at = now()
     WHERE store_id = ${lojaId}::uuid
       AND order_id = ${pedidoId}::uuid
       AND status IN ('QUEUED', 'LEASED', 'FAILED', 'DEAD')`;
}
