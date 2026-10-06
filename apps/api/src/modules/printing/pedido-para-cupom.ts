/**
 * O pedido guardado, traduzido para o que o gerador do cupom recebe (T-605,
 * T-607).
 *
 * Existe porque o cupom tem DOIS caminhos até o banco e um só conteúdo: a
 * impressão por clique lê o pedido pelo cliente tipado, na transação do dono;
 * o agente de impressão não lê pedido nenhum, e recebe os mesmos campos pela
 * função `app.cupom_do_trabalho` (migração 0034), em JSON. Os dois chegam aqui
 * com os MESMOS nomes de campo — a função foi escrita espelhando a leitura do
 * cliente tipado — e saem pela mesma tradução. Duas traduções divergiriam em
 * silêncio, e o papel da cozinha mudaria conforme o caminho.
 *
 * As diferenças de forma entre os dois caminhos são só de tipo: dinheiro chega
 * como `bigint` pelo cliente tipado e como número pelo JSON; o instante chega
 * como `Date` ou como texto ISO. Os dois viram o mesmo número e o mesmo texto.
 */
import type {
  ConteudoDoCupom,
  FormaDeEntrega,
  FormaDePagamento,
  LarguraDoPapel,
  ModoDaTaxaDeEntrega,
  PedidoParaCupom,
} from "@simpleclick/core";

/** O que o cupom precisa da configuração de impressão da loja (T-906). */
export interface ConfiguracaoDoCupom {
  readonly larguraMm: LarguraDoPapel;
  readonly conteudo: ConteudoDoCupom;
}

/**
 * Interpreta a configuração GUARDADA (`store_settings.printing`), inclusive
 * quando ela está vazia ou velha — nunca falha, devolve o padrão.
 */
export type LerConfiguracaoDoCupom = (guardada: unknown) => ConfiguracaoDoCupom;

/** Dinheiro como o banco devolve: `bigint` pelo cliente tipado, número pelo JSON. */
export type CentavosGuardados = bigint | number;

/** Uma opção escolhida no item, como foi congelada na compra. */
export interface OpcaoGuardadaParaCupom {
  readonly groupNameSnapshot: string;
  readonly optionNameSnapshot: string;
  readonly action: string;
  readonly quantity: number;
  readonly priceDeltaCents: CentavosGuardados;
}

/** Um item do pedido, como foi congelado na compra (P-010). */
export interface ItemGuardadoParaCupom {
  readonly productName: string;
  readonly variantName: string | null;
  readonly quantity: number;
  readonly lineTotalCents: CentavosGuardados;
  readonly note: string | null;
  readonly opcoes: readonly OpcaoGuardadaParaCupom[];
}

/** O contato do pedido: a única parte com dado pessoal. */
export interface ContatoGuardadoParaCupom {
  readonly name: string;
  readonly phoneE164: string;
  readonly recipientName: string | null;
  readonly street: string | null;
  readonly number: string | null;
  readonly complement: string | null;
  readonly neighborhood: string | null;
  readonly city: string | null;
  readonly uf: string | null;
  readonly zip: string | null;
  readonly referencePoint: string | null;
}

/** O pedido guardado, com os nomes de campo do cliente tipado. */
export interface PedidoGuardadoParaCupom {
  readonly code: string;
  readonly channel: string;
  readonly fulfillment: string;
  readonly paymentMethod: string | null;
  readonly changeForCents: CentavosGuardados | null;
  readonly subtotalCents: CentavosGuardados;
  readonly deliveryFeeCents: CentavosGuardados;
  readonly deliveryFeeMode: string | null;
  readonly discountCents: CentavosGuardados;
  readonly pickupDiscountCents: CentavosGuardados;
  readonly totalCents: CentavosGuardados;
  readonly customerNote: string | null;
  readonly storeTimezone: string;
  readonly placedAt: Date | string;
  readonly contato: ContatoGuardadoParaCupom | null;
  readonly itens: readonly ItemGuardadoParaCupom[];
}

const FORMAS_DE_PAGAMENTO: readonly FormaDePagamento[] = [
  "PIX",
  "CASH",
  "CARD_ON_DELIVERY",
  "OTHER",
];

const MODOS_DA_TAXA: readonly ModoDaTaxaDeEntrega[] = [
  "VALUE",
  "FREE",
  "ASK",
  "OUTSIDE_AREA",
  "NEIGHBORHOOD_NOT_FOUND",
];

function formaDePagamento(guardada: string | null): FormaDePagamento {
  return FORMAS_DE_PAGAMENTO.find((forma) => forma === guardada) ?? "OTHER";
}

/** Sem modo guardado, o valor decide: taxa cobrada é valor, zero é grátis. */
function modoDaTaxa(
  guardado: string | null,
  valorEmCentavos: number,
): ModoDaTaxaDeEntrega {
  return (
    MODOS_DA_TAXA.find((modo) => modo === guardado) ??
    (valorEmCentavos > 0 ? "VALUE" : "FREE")
  );
}

/** Centavos do banco para número inteiro, sem perder precisão (P-005). */
export function centavos(valor: CentavosGuardados): number {
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero)) {
    throw new Error(`valor em centavos fora do intervalo seguro: ${valor}`);
  }
  return numero;
}

/** O instante da compra em ISO 8601, venha ele como `Date` ou como texto. */
function instante(valor: Date | string): string {
  return (valor instanceof Date ? valor : new Date(valor)).toISOString();
}

/** O pedido guardado, do jeito que o gerador do cupom o recebe. */
export function montarPedidoParaCupom(
  pedido: PedidoGuardadoParaCupom,
  nomeDaLoja: string,
): PedidoParaCupom {
  const contato = pedido.contato;
  const taxa = centavos(pedido.deliveryFeeCents);
  const entrega: FormaDeEntrega =
    pedido.fulfillment === "DELIVERY"
      ? {
          tipo: "DELIVERY",
          endereco: {
            logradouro: contato?.street ?? "",
            numero: contato?.number ?? null,
            complemento: contato?.complement ?? null,
            bairro: contato?.neighborhood ?? null,
            cidade: contato?.city ?? null,
            uf: contato?.uf ?? null,
            cep: contato?.zip ?? null,
            pontoDeReferencia: contato?.referencePoint ?? null,
            destinatario: contato?.recipientName ?? null,
          },
        }
      : { tipo: "PICKUP" };

  return {
    loja: nomeDaLoja,
    codigo: pedido.code,
    feitoEm: instante(pedido.placedAt),
    fusoHorario: pedido.storeTimezone,
    canal: pedido.channel === "MANUAL" ? "MANUAL" : "ONLINE",
    cliente: {
      nome: contato?.name ?? "Cliente sem nome",
      telefone: contato?.phoneE164 ?? "",
    },
    itens: pedido.itens.map((item) => ({
      nome: item.productName,
      variacao: item.variantName,
      quantidade: item.quantity,
      totalDaLinhaEmCentavos: centavos(item.lineTotalCents),
      observacao: item.note,
      opcoes: item.opcoes.map((opcao) => ({
        grupo: opcao.groupNameSnapshot,
        opcao: opcao.optionNameSnapshot,
        acao: opcao.action === "REMOVE" ? "REMOVE" : "ADD",
        quantidade: opcao.quantity,
        acrescimoEmCentavos: centavos(opcao.priceDeltaCents),
      })),
    })),
    observacao: pedido.customerNote,
    entrega,
    taxaDeEntrega: {
      modo: modoDaTaxa(pedido.deliveryFeeMode, taxa),
      valorEmCentavos: taxa,
    },
    pagamento: {
      forma: formaDePagamento(pedido.paymentMethod),
      trocoParaEmCentavos:
        pedido.changeForCents === null ? null : centavos(pedido.changeForCents),
    },
    subtotalEmCentavos: centavos(pedido.subtotalCents),
    descontoEmCentavos: centavos(pedido.discountCents),
    descontoDeRetiradaEmCentavos: centavos(pedido.pickupDiscountCents),
    totalEmCentavos: centavos(pedido.totalCents),
  };
}
