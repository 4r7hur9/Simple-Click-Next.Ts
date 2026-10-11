/**
 * O que conta como venda (T-602, AC-607, AC-611).
 *
 * UMA REGRA SÓ, para a fila, o painel de métricas e qualquer relatório que
 * vier. Se cada tela decidisse o que é venda, o faturamento do painel e o da
 * exportação divergiriam no primeiro pedido esquisito — e o dono deixaria de
 * confiar nos dois.
 *
 * A régua:
 *
 * - VENDA é o pedido que o dono ACEITOU, em qualquer etapa daí em diante —
 *   aceito, em preparo, pronto, em entrega, concluído. É o "aceitos em diante"
 *   que o painel de métricas usa (AC-817).
 * - CANCELADO nunca é venda, tenha sido recusado na chegada ou cancelado no
 *   meio do preparo (AC-607).
 * - NÃO CONFIRMADO é o pedido que abriu o WhatsApp e nunca confirmou o envio,
 *   e que o dono ainda não aceitou: é o candidato a pedido fantasma (AC-611).
 *   Ele aparece à parte, contado e somado, para o dono saber quanto se perdeu
 *   nessa etapa — mas nunca entra no faturamento.
 * - AGUARDANDO é o pedido que chegou e espera o dono decidir. Ainda não é
 *   venda, e também não é perda.
 *
 * Aceitar um pedido sem a confirmação do WhatsApp é decisão do dono de que ele
 * é real: a partir daí ele é venda como qualquer outro.
 */

export type SituacaoNaVenda =
  "VENDA" | "AGUARDANDO" | "NAO_CONFIRMADO" | "CANCELADO";

/** O mínimo do pedido que a regra precisa enxergar. */
export interface PedidoParaVenda {
  readonly status: string;
  readonly totalCentavos: number;
  /** Abriu a conversa do WhatsApp e não confirmou o envio (AC-609). */
  readonly aguardandoConfirmacaoWhatsapp: boolean;
}

const STATUS_DE_VENDA = new Set([
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
]);

/** Onde o pedido cai na conta da loja. */
export function situacaoNaVenda(pedido: PedidoParaVenda): SituacaoNaVenda {
  if (pedido.status === "CANCELLED") return "CANCELADO";
  if (STATUS_DE_VENDA.has(pedido.status)) return "VENDA";
  if (pedido.aguardandoConfirmacaoWhatsapp) return "NAO_CONFIRMADO";
  return "AGUARDANDO";
}

/** Quantos pedidos e quanto dinheiro, em centavos inteiros (P-005). */
export interface ParcelaDoResumo {
  readonly quantidade: number;
  readonly totalCentavos: number;
}

/** O período visto pela régua acima. */
export interface ResumoDeVendas {
  /** Só o que é VENDA. É o número que o dono chama de faturamento. */
  readonly faturamentoCentavos: number;
  readonly vendas: ParcelaDoResumo;
  readonly aguardando: ParcelaDoResumo;
  /** Os que se perderam esperando a confirmação do WhatsApp (AC-611). */
  readonly naoConfirmados: ParcelaDoResumo;
  readonly cancelados: ParcelaDoResumo;
}

const VAZIA: ParcelaDoResumo = { quantidade: 0, totalCentavos: 0 };

/** Mais um pedido na parcela: conta um e soma o valor dele. */
function somar(parcela: ParcelaDoResumo, centavos: number): ParcelaDoResumo {
  return {
    quantidade: parcela.quantidade + 1,
    totalCentavos: parcela.totalCentavos + centavos,
  };
}

/** Resume um conjunto de pedidos, separando o que é venda do que não é. */
export function resumirVendas(
  pedidos: readonly PedidoParaVenda[],
): ResumoDeVendas {
  let vendas = VAZIA;
  let aguardando = VAZIA;
  let naoConfirmados = VAZIA;
  let cancelados = VAZIA;

  for (const pedido of pedidos) {
    switch (situacaoNaVenda(pedido)) {
      case "VENDA":
        vendas = somar(vendas, pedido.totalCentavos);
        break;
      case "AGUARDANDO":
        aguardando = somar(aguardando, pedido.totalCentavos);
        break;
      case "NAO_CONFIRMADO":
        naoConfirmados = somar(naoConfirmados, pedido.totalCentavos);
        break;
      case "CANCELADO":
        cancelados = somar(cancelados, pedido.totalCentavos);
        break;
    }
  }

  return {
    faturamentoCentavos: vendas.totalCentavos,
    vendas,
    aguardando,
    naoConfirmados,
    cancelados,
  };
}
