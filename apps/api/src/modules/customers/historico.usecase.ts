/**
 * A ficha do cliente com o histórico de compras NESTA loja (AC-711, AC-713).
 *
 * DO MAIS NOVO PARA O MAIS ANTIGO, com número, data, itens, valor e status de
 * cada pedido. O que aparece de cada item é a CÓPIA DA ÉPOCA (P-010): nome,
 * variação, escolhas e preço como estavam no momento da compra. O catálogo de
 * hoje só é consultado para uma pergunta — o produto ainda está à venda? — e a
 * resposta vira a marca `indisponivel`, sem mexer no que o pedido guardou.
 *
 * Produto apagado, arquivado ou em rascunho, variação apagada e item cujo
 * produto nem existe mais (a chave virou nula) são "não mais disponível". Nada
 * disso quebra a leitura: o texto da época está no próprio item (AC-713).
 *
 * A LOJA VEM DO CONTEXTO. Cliente de outra loja não existe para esta
 * requisição, e o histórico dele também não (AC-702).
 */
import type {
  FichaComHistoricoNoContrato,
  PedidoDoHistoricoNoContrato,
} from "@simpleclick/contracts";

import { transacaoAtual } from "../../core/db.ts";
import { fichaDaLinha, lerFichaAtiva } from "./ficha.ts";

/** Teto do histórico: o bastante para atender, sem carregar anos de pedidos. */
export const LIMITE_DO_HISTORICO = 100;

/** Os produtos e variações citados que continuam à venda hoje. */
async function aindaAVenda(
  produtoIds: readonly string[],
  variacaoIds: readonly string[],
): Promise<{
  readonly produtos: ReadonlySet<string>;
  readonly variacoes: ReadonlySet<string>;
}> {
  const tx = transacaoAtual();
  const [produtos, variacoes] = await Promise.all([
    produtoIds.length === 0
      ? []
      : tx.product.findMany({
          where: {
            id: { in: [...produtoIds] },
            deletedAt: null,
            status: "PUBLISHED",
          },
          select: { id: true },
        }),
    variacaoIds.length === 0
      ? []
      : tx.productVariant.findMany({
          where: { id: { in: [...variacaoIds] }, deletedAt: null },
          select: { id: true },
        }),
  ]);
  return {
    produtos: new Set(produtos.map((p) => p.id)),
    variacoes: new Set(variacoes.map((v) => v.id)),
  };
}

/** A ficha e o histórico, ou nulo quando o cliente não é desta loja. */
export async function historicoDoCliente(
  clienteId: string,
): Promise<FichaComHistoricoNoContrato | null> {
  const ficha = await lerFichaAtiva(clienteId);
  if (ficha === null) return null;

  const tx = transacaoAtual();
  const pedidos = await tx.order.findMany({
    where: { storeCustomerId: ficha.id },
    orderBy: [{ placedAt: "desc" }, { number: "desc" }],
    take: LIMITE_DO_HISTORICO,
    select: {
      id: true,
      number: true,
      code: true,
      status: true,
      channel: true,
      fulfillment: true,
      totalCents: true,
      placedAt: true,
      itens: {
        orderBy: { sortOrder: "asc" },
        select: {
          productId: true,
          variantId: true,
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
              quantity: true,
            },
          },
        },
      },
    },
  });

  const itens = pedidos.flatMap((pedido) => pedido.itens);
  const vivos = await aindaAVenda(
    [...new Set(itens.flatMap((i) => (i.productId ? [i.productId] : [])))],
    [...new Set(itens.flatMap((i) => (i.variantId ? [i.variantId] : [])))],
  );

  const historico: PedidoDoHistoricoNoContrato[] = pedidos.map((pedido) => ({
    id: pedido.id,
    numero: Number(pedido.number),
    codigo: pedido.code,
    status: pedido.status,
    canal: pedido.channel,
    entrega: pedido.fulfillment,
    totalCentavos: Number(pedido.totalCents),
    criadoEm: pedido.placedAt.toISOString(),
    itens: pedido.itens.map((item) => ({
      nome: item.productName,
      variacao: item.variantName,
      quantidade: item.quantity,
      totalCentavos: Number(item.lineTotalCents),
      observacao: item.note,
      opcoes: item.opcoes.map((opcao) => ({
        grupo: opcao.groupNameSnapshot,
        nome: opcao.optionNameSnapshot,
        quantidade: opcao.quantity,
      })),
      indisponivel:
        item.productId === null ||
        !vivos.produtos.has(item.productId) ||
        (item.variantId !== null && !vivos.variacoes.has(item.variantId)),
    })),
  }));

  return { cliente: fichaDaLinha(ficha), pedidos: historico };
}
