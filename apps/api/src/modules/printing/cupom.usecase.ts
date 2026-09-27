/**
 * Emitir o cupom de um pedido: soma a via e gera os blocos (T-605 — AC-619,
 * AC-621).
 *
 * As duas coisas acontecem na MESMA transação, e é isso que torna o número da
 * via confiável: a soma é um `UPDATE ... RETURNING` que o PostgreSQL serializa
 * por linha, e o cupom é gerado com o valor devolvido. Duas impressões ao
 * mesmo tempo saem como 2ª e 3ª via — nunca duas 2ª vias —, e se a geração
 * falhar, a transação desfaz a soma: não existe via contada que não saiu.
 *
 * O conteúdo vem do banco, nunca da tela (P-006): nomes, preços e escolhas são
 * as cópias congeladas do momento da compra (P-010). O caso de uso não conhece
 * a configuração da loja — quem a interpreta é o módulo da loja, e a borda
 * (`app.ts`) passa a função pronta, porque a tabela de fronteiras não deixa um
 * módulo importar o outro.
 */
import {
  gerarCupom,
  type ConteudoDoCupom,
  type CupomImpresso,
  type FormaDeEntrega,
  type FormaDePagamento,
  type LarguraDoPapel,
  type ModoDaTaxaDeEntrega,
  type PedidoParaCupom,
} from "@simpleclick/core";

import { exigirLojaDoContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";

/** O pedido não existe — ou é de outra loja, o que para quem pede é o mesmo. */
export class PedidoSemCupom extends Error {
  constructor() {
    super("Pedido não encontrado.");
    this.name = "PedidoSemCupom";
  }
}

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

/** Centavos do banco (`bigint`) para número inteiro, sem perder precisão. */
function centavos(valor: bigint): number {
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero)) {
    throw new Error(`valor em centavos fora do intervalo seguro: ${valor}`);
  }
  return numero;
}

/**
 * Soma uma via ao pedido e devolve o número dela.
 *
 * A loja entra no filtro além de estar no isolamento por linha: a política do
 * banco é a primeira camada, e esta condição é a segunda (P-003).
 */
async function somarVia(pedidoId: string, lojaId: string): Promise<number> {
  const somadas = await transacaoAtual().$queryRaw<{ print_count: number }[]>`
    UPDATE app.orders
       SET print_count = print_count + 1,
           last_printed_at = now()
     WHERE id = ${pedidoId}::uuid
       AND store_id = ${lojaId}::uuid
     RETURNING print_count
  `;
  const via = somadas[0]?.print_count;
  if (via === undefined) throw new PedidoSemCupom();
  return Number(via);
}

/** O pedido do banco, do jeito que o gerador do cupom o recebe. */
async function lerPedidoParaCupom(
  pedidoId: string,
  lojaId: string,
): Promise<{ readonly pedido: PedidoParaCupom; readonly guardada: unknown }> {
  const tx = transacaoAtual();
  const [pedido, loja, configuracao] = await Promise.all([
    tx.order.findFirst({
      where: { id: pedidoId, storeId: lojaId },
      select: {
        code: true,
        channel: true,
        fulfillment: true,
        paymentMethod: true,
        changeForCents: true,
        subtotalCents: true,
        deliveryFeeCents: true,
        deliveryFeeMode: true,
        discountCents: true,
        pickupDiscountCents: true,
        totalCents: true,
        customerNote: true,
        storeTimezone: true,
        placedAt: true,
        contato: {
          select: {
            name: true,
            phoneE164: true,
            recipientName: true,
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            uf: true,
            zip: true,
            referencePoint: true,
          },
        },
        itens: {
          orderBy: { sortOrder: "asc" },
          select: {
            productName: true,
            variantName: true,
            quantity: true,
            lineTotalCents: true,
            note: true,
            opcoes: {
              orderBy: { sortOrder: "asc" },
              select: {
                groupNameSnapshot: true,
                optionNameSnapshot: true,
                action: true,
                quantity: true,
                priceDeltaCents: true,
              },
            },
          },
        },
      },
    }),
    tx.store.findUnique({ where: { id: lojaId }, select: { name: true } }),
    tx.storeSettings.findUnique({
      where: { storeId: lojaId },
      select: { printing: true },
    }),
  ]);
  if (pedido === null || loja === null) throw new PedidoSemCupom();

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
    guardada: configuracao?.printing,
    pedido: {
      loja: loja.name,
      codigo: pedido.code,
      feitoEm: pedido.placedAt.toISOString(),
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
          pedido.changeForCents === null
            ? null
            : centavos(pedido.changeForCents),
      },
      subtotalEmCentavos: centavos(pedido.subtotalCents),
      descontoEmCentavos: centavos(pedido.discountCents),
      descontoDeRetiradaEmCentavos: centavos(pedido.pickupDiscountCents),
      totalEmCentavos: centavos(pedido.totalCents),
    },
  };
}

/**
 * Emite uma via do cupom: soma 1 ao contador do pedido e gera o cupom com o
 * número da via que acabou de ser contada (AC-621).
 *
 * Roda dentro da transação da requisição, com a loja no contexto. Pedido que
 * não existe ou que é de outra loja responde `PedidoSemCupom` — e nesse caso
 * nada foi somado, porque o `UPDATE` não encontrou linha.
 */
export async function emitirCupomDoPedido(
  pedidoId: string,
  lerConfiguracao: LerConfiguracaoDoCupom,
): Promise<CupomImpresso> {
  const lojaId = exigirLojaDoContexto();
  const via = await somarVia(pedidoId, lojaId);
  const { pedido, guardada } = await lerPedidoParaCupom(pedidoId, lojaId);
  const configuracao = lerConfiguracao(guardada);
  return gerarCupom(pedido, {
    larguraMm: configuracao.larguraMm,
    via,
    conteudo: configuracao.conteudo,
  });
}
