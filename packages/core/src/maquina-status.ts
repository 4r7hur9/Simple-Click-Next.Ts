/**
 * Caminhos permitidos para a operação do pedido (T-601).
 *
 * A transição é uma regra pura: não conhece banco, HTTP nem a tela. Assim a
 * API e o painel usam o mesmo vocabulário, e uma mudança impossível nunca
 * vira apenas um botão escondido no navegador.
 */

export const STATUS_DO_PEDIDO = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
] as const;

export type StatusDoPedido = (typeof STATUS_DO_PEDIDO)[number];

export interface OpcaoDeStatus {
  readonly status: StatusDoPedido;
  /** O nome do status: "Em preparo". */
  readonly rotulo: string;
  /** O texto do botão que leva a ele: "Iniciar preparo". */
  readonly acao: string;
}

export interface EntradaDeHistorico {
  readonly de: StatusDoPedido | null;
  readonly para: StatusDoPedido;
  readonly motivo?: string | null;
}

export type DecisaoDeTransicao =
  | {
      readonly ok: true;
      readonly de: StatusDoPedido;
      readonly para: StatusDoPedido;
      readonly motivo: string | null;
      readonly contaComoVenda: boolean;
    }
  | { readonly ok: false; readonly explicacao: string };

const ROTULOS: Readonly<Record<StatusDoPedido, string>> = {
  PENDING: "Aguardando confirmação",
  ACCEPTED: "Aceito",
  PREPARING: "Em preparo",
  READY_FOR_PICKUP: "Pronto para retirada",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

/**
 * O verbo de cada passo. O botão diz o que ele FAZ, e não o nome do status de
 * chegada: "Aceitar pedido" é uma decisão; "Aceito" é só um estado.
 */
const ACOES: Readonly<Record<StatusDoPedido, string>> = {
  PENDING: "Voltar para aguardando",
  ACCEPTED: "Aceitar pedido",
  PREPARING: "Iniciar preparo",
  READY_FOR_PICKUP: "Pronto para retirada",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  COMPLETED: "Concluir pedido",
  CANCELLED: "Cancelar pedido",
};

/** Antes de aceitar, cancelar é RECUSAR — e o botão diz isso. */
function acaoDoPasso(atual: StatusDoPedido, proximo: StatusDoPedido): string {
  if (proximo === "CANCELLED" && atual === "PENDING") return "Recusar pedido";
  return ACOES[proximo];
}

function statusConhecido(status: string): status is StatusDoPedido {
  return (STATUS_DO_PEDIDO as readonly string[]).includes(status);
}

/** Próximos botões válidos para o pedido, respeitando entrega ou retirada. */
export function proximosStatus(
  atual: string,
  entrega: string,
): readonly OpcaoDeStatus[] {
  if (!statusConhecido(atual)) return [];
  const caminhos: Partial<Record<StatusDoPedido, readonly StatusDoPedido[]>> = {
    PENDING: ["ACCEPTED", "CANCELLED"],
    ACCEPTED: ["PREPARING", "CANCELLED"],
    PREPARING:
      entrega === "PICKUP"
        ? ["READY_FOR_PICKUP", "CANCELLED"]
        : ["OUT_FOR_DELIVERY", "CANCELLED"],
    READY_FOR_PICKUP: ["COMPLETED", "CANCELLED"],
    OUT_FOR_DELIVERY: ["COMPLETED", "CANCELLED"],
  };

  return (caminhos[atual] ?? []).map((status) => ({
    status,
    rotulo: ROTULOS[status],
    acao: acaoDoPasso(atual, status),
  }));
}

/** Decide uma transição e aplica a exigência de motivo para cancelamento. */
export function decidirTransicao(
  atual: string,
  proximo: string,
  entrega: string,
  motivo?: string | null,
): DecisaoDeTransicao {
  if (!statusConhecido(atual) || !statusConhecido(proximo)) {
    return { ok: false, explicacao: "Este status não existe." };
  }

  const possiveis = proximosStatus(atual, entrega).map((opcao) => opcao.status);
  if (!possiveis.includes(proximo)) {
    return {
      ok: false,
      explicacao: `Não é possível mudar de ${ROTULOS[atual]} para ${ROTULOS[proximo]}.`,
    };
  }

  const motivoLimpo = motivo?.trim() ?? "";
  if (proximo === "CANCELLED" && motivoLimpo.length < 3) {
    return {
      ok: false,
      explicacao: "Informe o motivo para recusar ou cancelar o pedido.",
    };
  }

  return {
    ok: true,
    de: atual,
    para: proximo,
    motivo: proximo === "CANCELLED" ? motivoLimpo : null,
    contaComoVenda: proximo !== "CANCELLED",
  };
}

/** Histórico é somente de acréscimo: a entrada anterior nunca é reescrita. */
export function acrescentarHistorico(
  historico: readonly EntradaDeHistorico[],
  entrada: EntradaDeHistorico,
): readonly EntradaDeHistorico[] {
  return [...historico, { ...entrada }];
}
