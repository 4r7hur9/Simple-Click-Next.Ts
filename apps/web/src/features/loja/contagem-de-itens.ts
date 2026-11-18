/**
 * Quantos produtos a loja tem à venda, SÓ quando dá para afirmar o número.
 *
 * O resumo do catálogo vem cortado (12 por seção, 48 no total) e o mesmo
 * produto pode estar em mais de uma seção. Por isso o número só sai quando
 * todas as seções vieram inteiras; contam-se os produtos distintos. Se
 * alguma veio cortada, devolve `null` e a tela mostra só o texto — um número
 * errado numa loja é pior do que nenhum.
 */
export interface SecaoParaContar {
  readonly total: number;
  readonly proximoCursor: string | null;
  readonly produtos: readonly { readonly id: string }[];
}

export function contagemExataDeItens(
  secoes: readonly SecaoParaContar[],
): number | null {
  const ids = new Set<string>();
  for (const secao of secoes) {
    if (secao.proximoCursor !== null) return null;
    if (secao.produtos.length !== secao.total) return null;
    for (const produto of secao.produtos) ids.add(produto.id);
  }
  return ids.size > 0 ? ids.size : null;
}

/** "1 item", "32 itens". */
export function textoDaContagem(quantos: number): string {
  return `${quantos} ${quantos === 1 ? "item" : "itens"}`;
}
