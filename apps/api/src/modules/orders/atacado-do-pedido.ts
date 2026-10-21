/**
 * A faixa de atacado no pedido manual e na repetição (card #57).
 *
 * O PEDIDO DO BALCÃO COBRA COMO O DO SITE. O carrinho aplica a faixa pela
 * conferência; o pedido manual e a repetição leem o produto como a vitrine o
 * mostra (preço de UMA unidade) e, por isso, precisam aplicar a faixa por
 * conta própria — com a MESMA regra pura do core (`precoNoAtacado`), sobre o
 * mesmo varejo vigente. Duas regras dariam dois preços para dez peças.
 *
 * A QUANTIDADE É A DO PRODUTO, somada em todas as linhas e variações do
 * pedido: 6 camisetas P e 4 G são 10 peças para a faixa de 10 — igual ao
 * carrinho.
 *
 * Só as faixas COM DESCONTO (0064) entram aqui. O atacado antigo, de preço
 * fixo, nunca valeu no pedido manual, e continua sem valer.
 */
import {
  precoNoAtacado,
  precoValeAgora,
  type FaixaDeAtacado,
  type PrecoNoAtacado,
} from "@simpleclick/core";

import { transacaoAtual } from "../../core/db.ts";
import type { FaixaDeAtacadoCongelada } from "./criar-pedido.usecase.ts";

/** As faixas que valem agora, por produto. */
export type FaixasPorProduto = ReadonlyMap<string, readonly FaixaDeAtacado[]>;

/**
 * Lê as faixas com desconto dos produtos, ligadas e dentro das datas.
 *
 * Roda na transação de quem chama, que já declarou a loja: o isolamento por
 * linha esconde a faixa de outra loja.
 */
export async function lerFaixasDeAtacado(
  produtoIds: readonly string[],
  agora: Date,
): Promise<Map<string, FaixaDeAtacado[]>> {
  const porProduto = new Map<string, FaixaDeAtacado[]>();
  if (produtoIds.length === 0) return porProduto;

  const linhas = await transacaoAtual().productPrice.findMany({
    where: {
      productId: { in: [...new Set(produtoIds)] },
      variantId: null,
      kind: "WHOLESALE",
      discountKind: { in: ["PERCENT", "AMOUNT"] },
    },
    select: {
      productId: true,
      label: true,
      minQuantity: true,
      isActive: true,
      startsAt: true,
      endsAt: true,
      discountKind: true,
      discountValue: true,
    },
  });

  for (const linha of linhas) {
    const vale = precoValeAgora(
      {
        tipo: "WHOLESALE",
        valorEmCentavos: 0,
        quantidadeMinima: linha.minQuantity,
        ativo: linha.isActive,
        comecaEm: linha.startsAt,
        terminaEm: linha.endsAt,
      },
      agora,
      // A janela de datas e o interruptor decidem aqui; a quantidade, depois.
      Number.MAX_SAFE_INTEGER,
    );
    if (!vale || linha.discountValue === null) continue;
    const doProduto = porProduto.get(linha.productId) ?? [];
    doProduto.push({
      quantidadeMinima: linha.minQuantity,
      tipoDeDesconto: linha.discountKind === "PERCENT" ? "PERCENTUAL" : "VALOR",
      desconto: Number(linha.discountValue),
      rotulo: linha.label,
    });
    porProduto.set(linha.productId, doProduto);
  }
  return porProduto;
}

/** Soma as unidades de cada produto, em todas as linhas. */
export function quantidadesPorProduto(
  itens: readonly {
    readonly produtoId: string | null;
    readonly quantidade: number;
  }[],
): Map<string, number> {
  const total = new Map<string, number>();
  for (const item of itens) {
    if (item.produtoId === null) continue;
    total.set(
      item.produtoId,
      (total.get(item.produtoId) ?? 0) + item.quantidade,
    );
  }
  return total;
}

/** O preço de uma unidade com a faixa que a quantidade alcança. */
export interface PrecoComAtacado {
  /** O que se cobra por unidade, antes das opções. */
  readonly unitarioEmCentavos: number;
  /** A faixa que valeu, como o pedido a congela; nula no varejo. */
  readonly faixa: FaixaDeAtacadoCongelada | null;
  /** A conta completa da regra; nula quando o produto não tem faixas. */
  readonly atacado: PrecoNoAtacado | null;
}

/**
 * Aplica a faixa ao varejo de agora. Abaixo do pedido mínimo, vale o varejo.
 */
export function aplicarAtacado(
  varejoEmCentavos: number,
  quantidadeDoProduto: number,
  faixas: readonly FaixaDeAtacado[] | undefined,
): PrecoComAtacado {
  if (faixas === undefined || faixas.length === 0) {
    return { unitarioEmCentavos: varejoEmCentavos, faixa: null, atacado: null };
  }
  const atacado = precoNoAtacado(varejoEmCentavos, quantidadeDoProduto, faixas);
  const aplicada = atacado.faixaAplicada;
  return {
    unitarioEmCentavos: atacado.unitarioEmCentavos,
    faixa:
      aplicada === null
        ? null
        : {
            quantidadeMinima: aplicada.quantidadeMinima,
            tipoDeDesconto: aplicada.tipoDeDesconto,
            desconto: aplicada.desconto,
            rotulo: aplicada.rotulo,
          },
    atacado,
  };
}
