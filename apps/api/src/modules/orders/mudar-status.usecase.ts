import { decidirTransicao, type StatusDoPedido } from "@simpleclick/core";

import { exigirContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";

export class ErroDeTransicaoDoPedido extends Error {
  readonly explicacao: string;

  constructor(explicacao: string) {
    super(explicacao);
    this.explicacao = explicacao;
    this.name = "ErroDeTransicaoDoPedido";
  }
}

export class PedidoNaoEncontrado extends Error {
  constructor() {
    super("Pedido não encontrado.");
    this.name = "PedidoNaoEncontrado";
  }
}

export interface ResultadoDaMudancaDeStatus {
  readonly id: string;
  readonly status: StatusDoPedido;
  readonly motivo: string | null;
}

/** Muda o pedido e acrescenta uma linha de histórico na mesma transação. */
export async function mudarStatusDoPedido(
  pedidoId: string,
  proximoStatus: string,
  motivo?: string | null,
  agora = new Date(),
): Promise<ResultadoDaMudancaDeStatus> {
  const contexto = exigirContexto();
  const tx = transacaoAtual();
  const pedido = await tx.order.findFirst({
    where: { id: pedidoId },
    select: { id: true, status: true, fulfillment: true },
  });
  if (pedido === null) throw new PedidoNaoEncontrado();

  const decisao = decidirTransicao(
    pedido.status,
    proximoStatus,
    pedido.fulfillment,
    motivo,
  );
  if (!decisao.ok) throw new ErroDeTransicaoDoPedido(decisao.explicacao);

  await tx.order.update({
    where: { id: pedido.id },
    data: {
      status: decisao.para,
      updatedAt: agora,
      ...(decisao.para === "ACCEPTED" ? { acceptedAt: agora } : {}),
      ...(decisao.para === "COMPLETED" ? { completedAt: agora } : {}),
      ...(decisao.para === "CANCELLED"
        ? { cancelledAt: agora, cancelReason: decisao.motivo }
        : {}),
    },
  });

  await tx.orderStatusEntry.create({
    data: {
      storeId: contexto.lojaId as string,
      orderId: pedido.id,
      fromStatus: decisao.de,
      toStatus: decisao.para,
      changedByIdentityId: contexto.usuarioId ?? null,
      actorRole: contexto.papel,
      reason: decisao.motivo,
      occurredAt: agora,
    },
  });

  return {
    id: pedido.id,
    status: decisao.para,
    motivo: decisao.motivo,
  };
}
