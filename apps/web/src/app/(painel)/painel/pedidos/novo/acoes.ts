"use server";

import type { ProdutoNaTela } from "../../../../../lib/produto.ts";
import { buscarProduto } from "../../../../../server/produto.ts";

/** Carrega a ficha completa apenas quando o lojista escolhe o produto. */
export async function carregarDetalheDoBalcao(
  apelidoDaLoja: string,
  produtoId: string,
): Promise<ProdutoNaTela | null> {
  const resultado = await buscarProduto(produtoId, { apelidoDaLoja });
  return resultado.estado === "encontrado" ? resultado.produto : null;
}
