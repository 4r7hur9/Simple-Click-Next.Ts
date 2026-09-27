/**
 * Regras das categorias da loja (T-300).
 *
 * A rota fala com o banco; a DECISÃO mora aqui, onde ela pode ser lida e
 * provada sem banco nenhum (P-013). São duas decisões:
 *
 * 1. APAGAR CATEGORIA COM PRODUTOS EXIGE DESTINO (AC-303). O dono escolhe entre
 *    mover os produtos para outra categoria — e aí a categoria sai — ou
 *    ocultá-la junto com eles, sem apagar nada. Não existe terceira via: apagar
 *    a categoria e deixar os produtos soltos criaria produto órfão, sem seção na
 *    vitrine e sem lugar na gestão.
 *
 * 2. MOVER OS PRODUTOS NÃO DUPLICA NEM PERDE VÍNCULO. O mesmo produto pode já
 *    estar na categoria de destino (o vínculo é N:M). Nesse caso o vínculo da
 *    origem é descartado em vez de repetido, e se era ele o principal, o do
 *    destino passa a ser — o produto nunca fica sem categoria principal.
 */

/** O que fazer com os produtos da categoria que vai sair. */
export type DestinoDosProdutos =
  | { readonly acao: "mover"; readonly categoriaId: string }
  | { readonly acao: "ocultar" };

export type DecisaoDaRemocao =
  /** Categoria vazia: sai sem perguntar nada. */
  | { readonly tipo: "apagar" }
  /** Tem produto e o dono ainda não disse para onde eles vão. */
  | { readonly tipo: "exige_destino"; readonly produtos: number }
  /** Os produtos vão para outra categoria, e esta sai. */
  | { readonly tipo: "mover"; readonly categoriaId: string }
  /** A categoria fica, oculta, com os produtos dentro. */
  | { readonly tipo: "ocultar" }
  | { readonly tipo: "destino_invalido"; readonly motivo: string };

export interface PedidoDeRemocao {
  readonly categoriaId: string;
  /** Produtos NÃO removidos que estão na categoria. */
  readonly produtos: number;
  readonly destino?: DestinoDosProdutos | undefined;
  /**
   * A categoria de destino existe nesta loja e não foi apagada? Quem responde
   * é o banco; aqui só se decide o que fazer com a resposta.
   */
  readonly destinoExiste?: boolean;
}

/** Decide o que acontece quando o dono pede para apagar uma categoria. */
export function decidirRemocaoDaCategoria(
  pedido: PedidoDeRemocao,
): DecisaoDaRemocao {
  if (!Number.isInteger(pedido.produtos) || pedido.produtos < 0) {
    throw new RangeError("A quantidade de produtos da categoria é inválida.");
  }
  if (pedido.produtos === 0) return { tipo: "apagar" };

  const destino = pedido.destino;
  if (destino === undefined) {
    return { tipo: "exige_destino", produtos: pedido.produtos };
  }
  if (destino.acao === "ocultar") return { tipo: "ocultar" };

  if (destino.categoriaId === pedido.categoriaId) {
    return {
      tipo: "destino_invalido",
      motivo: "Escolha uma categoria diferente da que será apagada.",
    };
  }
  if (pedido.destinoExiste !== true) {
    return {
      tipo: "destino_invalido",
      motivo: "A categoria de destino não existe nesta loja.",
    };
  }
  return { tipo: "mover", categoriaId: destino.categoriaId };
}

/** Um produto dentro de uma categoria, do jeito que o vínculo guarda. */
export interface VinculoDeProduto {
  readonly id: string;
  readonly produtoId: string;
  readonly principal: boolean;
  readonly ordem: number;
}

export interface PlanoDeMudancaDeVinculos {
  /** Vínculos da origem que passam a apontar para o destino, na nova ordem. */
  readonly mover: readonly { readonly id: string; readonly ordem: number }[];
  /** Vínculos da origem descartados porque o produto já está no destino. */
  readonly descartar: readonly string[];
  /** Vínculos do destino que herdam a condição de principal. */
  readonly tornarPrincipal: readonly string[];
}

/**
 * Calcula como levar os produtos da origem para o destino.
 *
 * Os movidos entram DEPOIS dos que já estavam no destino, na mesma ordem em que
 * estavam na origem: o dono organizou as duas seções, e mover não deve
 * embaralhar nenhuma delas.
 */
export function planejarMudancaDeVinculos(
  origem: readonly VinculoDeProduto[],
  destino: readonly VinculoDeProduto[],
): PlanoDeMudancaDeVinculos {
  const noDestino = new Map(
    destino.map((vinculo) => [vinculo.produtoId, vinculo]),
  );
  let proximaOrdem =
    destino.reduce((maior, vinculo) => Math.max(maior, vinculo.ordem), -1) + 1;

  const mover: { id: string; ordem: number }[] = [];
  const descartar: string[] = [];
  const tornarPrincipal: string[] = [];

  // Ordenação ESTÁVEL: no empate de ordem, vale a sequência em que os vínculos
  // chegaram — quem chama os entrega na ordem em que foram criados.
  const naOrdemDaOrigem = [...origem].sort((a, b) => a.ordem - b.ordem);
  for (const vinculo of naOrdemDaOrigem) {
    const jaNoDestino = noDestino.get(vinculo.produtoId);
    if (jaNoDestino === undefined) {
      mover.push({ id: vinculo.id, ordem: proximaOrdem });
      proximaOrdem += 1;
      continue;
    }
    descartar.push(vinculo.id);
    if (vinculo.principal && !jaNoDestino.principal) {
      tornarPrincipal.push(jaNoDestino.id);
    }
  }

  return { mover, descartar, tornarPrincipal };
}
