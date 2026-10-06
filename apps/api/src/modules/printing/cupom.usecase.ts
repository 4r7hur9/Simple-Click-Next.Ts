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
 *
 * Imprimir por clique um cupom que ainda está na fila de impressão CANCELA o
 * trabalho da fila, na mesma transação (T-607, decisão de 03/10): o cupom
 * nunca sai duas vezes, uma pela mão do dono e outra pelo agente.
 */
import { gerarCupom, type CupomImpresso } from "@simpleclick/core";

import { exigirLojaDoContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";
import { cancelarTrabalhosDoPedido } from "./fila.usecase.ts";
import {
  montarPedidoParaCupom,
  type LerConfiguracaoDoCupom,
  type PedidoGuardadoParaCupom,
} from "./pedido-para-cupom.ts";

export type {
  ConfiguracaoDoCupom,
  LerConfiguracaoDoCupom,
} from "./pedido-para-cupom.ts";

/** O pedido não existe — ou é de outra loja, o que para quem pede é o mesmo. */
export class PedidoSemCupom extends Error {
  constructor() {
    super("Pedido não encontrado.");
    this.name = "PedidoSemCupom";
  }
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

/** O pedido do banco, pelo cliente tipado, com o nome da loja e a configuração. */
async function lerPedidoGuardado(
  pedidoId: string,
  lojaId: string,
): Promise<{
  readonly pedido: PedidoGuardadoParaCupom;
  readonly nomeDaLoja: string;
  readonly guardada: unknown;
}> {
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

  return { pedido, nomeDaLoja: loja.name, guardada: configuracao?.printing };
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
  // O dono imprimiu: o que ainda esperava pelo agente não sai mais. Cancelar
  // ANTES de somar a via é de propósito: a reivindicação do agente trava o
  // trabalho e depois o pedido, e travar na mesma ordem aqui é o que impede as
  // duas transações de esperarem uma pela outra para sempre. Pedido que não
  // existe não tem trabalho, e a soma logo abaixo recusa e desfaz tudo.
  await cancelarTrabalhosDoPedido(pedidoId);
  const via = await somarVia(pedidoId, lojaId);
  const { pedido, nomeDaLoja, guardada } = await lerPedidoGuardado(
    pedidoId,
    lojaId,
  );
  const configuracao = lerConfiguracao(guardada);
  return gerarCupom(montarPedidoParaCupom(pedido, nomeDaLoja), {
    larguraMm: configuracao.larguraMm,
    via,
    conteudo: configuracao.conteudo,
  });
}
