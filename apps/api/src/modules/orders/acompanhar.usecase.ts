import { exigirContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";

export interface PedidoAcompanhado {
  readonly numero: number;
  readonly codigo: string;
  readonly status: string;
  readonly entrega: string;
  readonly formaDePagamento: string | null;
  readonly totalCentavos: number;
  readonly criadoEm: string;
  readonly whatsappConfirmadoEm: string | null;
  readonly cliente: {
    readonly nome: string;
    readonly telefoneMascarado: string;
  };
  readonly loja: {
    readonly nome: string;
    readonly whatsappPublico: string | null;
  };
  readonly itens: readonly {
    readonly nome: string;
    readonly variacao: string | null;
    readonly quantidade: number;
    readonly totalCentavos: number;
    readonly opcoes: readonly {
      readonly grupo: string;
      readonly nome: string;
      readonly quantidade: number;
    }[];
  }[];
  readonly historico: readonly {
    readonly de: string | null;
    readonly para: string;
    readonly motivo: string | null;
    readonly ocorridoEm: string;
  }[];
}

/** Lê somente o pedido autorizado pelo token declarado no contexto. */
export async function acompanharPedido(): Promise<PedidoAcompanhado | null> {
  const contexto = exigirContexto();
  if (contexto.tokenDoPedido === undefined) return null;

  const tx = transacaoAtual();
  const pedido = await tx.order.findFirst({
    where: { publicToken: contexto.tokenDoPedido },
    select: {
      number: true,
      code: true,
      status: true,
      fulfillment: true,
      paymentMethod: true,
      totalCents: true,
      placedAt: true,
      whatsappConfirmedAt: true,
      contato: { select: { name: true, phoneE164: true } },
      itens: {
        orderBy: { sortOrder: "asc" },
        select: {
          productName: true,
          variantName: true,
          quantity: true,
          lineTotalCents: true,
          opcoes: {
            orderBy: { sortOrder: "asc" },
            select: {
              groupNameSnapshot: true,
              optionNameSnapshot: true,
              quantity: true,
            },
          },
        },
      },
      historico: {
        orderBy: { occurredAt: "asc" },
        select: {
          fromStatus: true,
          toStatus: true,
          reason: true,
          occurredAt: true,
        },
      },
    },
  });
  if (pedido === null) return null;

  // O nome e o WhatsApp público da loja vêm por função dedicada, e não pela
  // relação com `stores`: a política pública esconde a loja SUSPENSA, e o
  // cliente continua acompanhando o pedido dela (Q-203, migração 0039). A
  // função devolve só estes dois campos, e só para quem tem o link do pedido.
  const lojas = await tx.$queryRaw<{ name: string; whatsapp: unknown }[]>`
    SELECT name, whatsapp FROM app.tracked_order_store()
  `;
  const loja = lojas[0];
  if (loja === undefined) return null;

  return {
    numero: Number(pedido.number),
    codigo: pedido.code,
    status: pedido.status,
    entrega: pedido.fulfillment,
    formaDePagamento: pedido.paymentMethod,
    totalCentavos: Number(pedido.totalCents),
    criadoEm: pedido.placedAt.toISOString(),
    whatsappConfirmadoEm: pedido.whatsappConfirmedAt?.toISOString() ?? null,
    cliente: {
      nome: pedido.contato?.name ?? "Cliente",
      telefoneMascarado: mascararTelefone(pedido.contato?.phoneE164 ?? ""),
    },
    loja: {
      nome: loja.name,
      whatsappPublico: lerWhatsAppPublico(loja.whatsapp),
    },
    itens: pedido.itens.map((item) => ({
      nome: item.productName,
      variacao: item.variantName,
      quantidade: item.quantity,
      totalCentavos: Number(item.lineTotalCents),
      opcoes: item.opcoes.map((opcao) => ({
        grupo: opcao.groupNameSnapshot,
        nome: opcao.optionNameSnapshot,
        quantidade: opcao.quantity,
      })),
    })),
    historico: pedido.historico.map((entrada) => ({
      de: entrada.fromStatus,
      para: entrada.toStatus,
      motivo: entrada.reason,
      ocorridoEm: entrada.occurredAt.toISOString(),
    })),
  };
}

/** Mantém somente os quatro últimos dígitos do telefone do cliente. */
export function mascararTelefone(telefone: string): string {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length <= 4) return "••••";
  return `••••••${digitos.slice(-4)}`;
}

function lerWhatsAppPublico(valor: unknown): string | null {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    return null;
  }
  const configuracao = valor as Record<string, unknown>;
  return configuracao.publico === true &&
    typeof configuracao.numero === "string"
    ? configuracao.numero
    : null;
}
