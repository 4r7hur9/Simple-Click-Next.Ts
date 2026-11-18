"use server";
/**
 * A ação de servidor que a janela do produto chama para buscar o detalhe.
 *
 * MORA NA ROTA, e não em `features/`: a tabela de fronteiras não deixa a camada
 * de componentes alcançar `src/server/` (é ali que o preço é escrito com
 * `packages/core`). A página passa esta função à janela já presa ao apelido da
 * loja (`.bind`), e a janela só sabe pedir "o produto X".
 *
 * A vitrine é consultada junto porque é ela que sabe se a loja está ABERTA — o
 * mesmo motivo da página do produto. As duas respostas têm cache curto no
 * servidor, então abrir dez produtos seguidos não vira vinte idas à API.
 */
import {
  lerOrdem,
  type PaginaNaTela,
  type RecorteDaLista,
} from "../../../../../lib/catalogo.ts";
import type { ProdutoNaTela } from "../../../../../lib/produto.ts";
import { prepararProduto } from "../../../../../server/catalogo-na-tela.ts";
import { buscarProduto } from "../../../../../server/produto.ts";
import {
  buscarPaginaDoCatalogo,
  buscarVitrine,
} from "../../../../../server/vitrine.ts";

export async function carregarProdutoDaJanela(
  apelidoDaLoja: string,
  produtoId: string,
): Promise<ProdutoNaTela | null> {
  const vitrine = await buscarVitrine(apelidoDaLoja);
  if (vitrine.estado !== "encontrada") return null;

  const resultado = await buscarProduto(produtoId, {
    apelidoDaLoja,
    lojaAberta: vitrine.vitrine.abertura.aberta,
  });
  return resultado.estado === "encontrado" ? resultado.produto : null;
}

/**
 * A página seguinte de uma lista do cardápio (card #74), já com preço escrito.
 *
 * O "Ver mais" chama esta ação presa ao apelido da loja (`.bind`) e manda o
 * recorte e o cursor que o servidor desenhou junto com a lista. Nulo quando a
 * API não respondeu — a tela oferece tentar de novo.
 */
export async function carregarMaisProdutos(
  apelidoDaLoja: string,
  recorte: RecorteDaLista,
  cursor: string,
): Promise<PaginaNaTela | null> {
  const pagina = await buscarPaginaDoCatalogo(apelidoDaLoja, {
    categoria: recorte.categoria,
    busca: recorte.busca,
    filtros: recorte.filtros,
    atacado: recorte.atacado,
    estoque: recorte.estoque === true,
    precoMin: recorte.precoMin ?? null,
    precoMax: recorte.precoMax ?? null,
    ordem: lerOrdem(recorte.ordem),
    cursor,
  });
  if (pagina.estado !== "encontrado") return null;
  return {
    produtos: pagina.dados.produtos.map((produto) =>
      prepararProduto(produto, apelidoDaLoja),
    ),
    proximoCursor: pagina.dados.proximoCursor,
  };
}
