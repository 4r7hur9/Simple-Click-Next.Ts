/**
 * Leitura da fila operacional do dono (T-600).
 *
 * A fila não altera pedidos. Ela apenas transforma o registro persistido numa
 * projeção pequena para o painel e mantém a regra de agrupamento fora da rota,
 * onde ela pode ser provada sem banco nem relógio real.
 */

export const STATUS_QUE_EXIGEM_ACAO = ["PENDING"] as const;
export const STATUS_EM_ANDAMENTO = [
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
] as const;

export interface PedidoDaFila {
  readonly id: string;
  readonly numero: number;
  readonly codigo: string;
  readonly status: string;
  readonly canal: string;
  readonly entrega: string;
  readonly cliente: string;
  readonly totalCentavos: number;
  readonly criadoEm: string;
  readonly aguardandoConfirmacaoWhatsapp: boolean;
}

export interface GruposDaFila {
  readonly aguardandoAcao: readonly PedidoDaFila[];
  readonly emPreparo: readonly PedidoDaFila[];
  readonly emEntrega: readonly PedidoDaFila[];
  readonly demais: readonly PedidoDaFila[];
}

/** Agrupa a projeção sem perder a ordem cronológica da consulta. */
export function agruparPedidosDaFila(
  pedidos: readonly PedidoDaFila[],
): GruposDaFila {
  const aguardandoAcao: PedidoDaFila[] = [];
  const emPreparo: PedidoDaFila[] = [];
  const emEntrega: PedidoDaFila[] = [];
  const demais: PedidoDaFila[] = [];

  for (const pedido of pedidos) {
    if (STATUS_QUE_EXIGEM_ACAO.includes(pedido.status as "PENDING")) {
      aguardandoAcao.push(pedido);
    } else if (
      STATUS_EM_ANDAMENTO.includes(
        pedido.status as (typeof STATUS_EM_ANDAMENTO)[number],
      )
    ) {
      if (pedido.status === "OUT_FOR_DELIVERY") emEntrega.push(pedido);
      else emPreparo.push(pedido);
    } else {
      demais.push(pedido);
    }
  }

  return { aguardandoAcao, emPreparo, emEntrega, demais };
}

/**
 * Compara duas leituras completas. A leitura nova substitui a antiga — assim
 * uma queda seguida de reconexão recupera também os pedidos que chegaram no
 * intervalo — e só a entrada de um identificador novo dispara o som.
 */
export function atualizarFila(
  anterior: readonly PedidoDaFila[],
  atual: readonly PedidoDaFila[],
  inicializada: boolean,
): {
  readonly pedidos: readonly PedidoDaFila[];
  readonly novos: readonly PedidoDaFila[];
} {
  if (!inicializada) return { pedidos: atual, novos: [] };

  const idsAnteriores = new Set(anterior.map((pedido) => pedido.id));
  return {
    pedidos: atual,
    novos: atual.filter((pedido) => !idsAnteriores.has(pedido.id)),
  };
}

/** Um alerta visual continua válido mesmo quando o som foi silenciado. */
export function deveTocarAlerta(
  novos: readonly PedidoDaFila[],
  somSilenciado: boolean,
): boolean {
  return novos.length > 0 && !somSilenciado;
}
