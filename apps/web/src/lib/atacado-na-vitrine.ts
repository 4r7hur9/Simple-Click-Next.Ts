/**
 * O atacado como a vitrine, a página do produto e o feed o escrevem (card #56).
 *
 * A CONTA JÁ VEM PRONTA DA API: cada faixa chega com o preço por unidade e o
 * desconto por unidade calculados sobre o varejo que a tela mostra (a mesma
 * regra do carrinho). Aqui só se escreve — "Atacado a partir de 10 un.:
 * R$ 9,50" no cartão e no post, a tabela de faixas na página do produto.
 * Sem faixa (`atacado` nulo ou ausente), nada aparece e a tela fica como era.
 */
import type { AtacadoDoProdutoNoContrato } from "@simpleclick/contracts";

import { escreverDinheiro } from "./dinheiro.ts";

export type AtacadoNaVitrine = AtacadoDoProdutoNoContrato;

/** "10 un." — a abreviação que o lojista de atacado usa. */
function unidades(quantidade: number): string {
  return `${quantidade.toLocaleString("pt-BR")} un.`;
}

/**
 * A chamada curta do cartão e do post: "Atacado a partir de 10 un.: R$ 9,50".
 * O preço é o da PRIMEIRA faixa (o pedido mínimo); nulo sem atacado.
 */
export function chamadaDoAtacado(
  atacado: AtacadoNaVitrine | null | undefined,
): string | null {
  const primeira = atacado?.faixas[0];
  if (atacado === null || atacado === undefined || primeira === undefined)
    return null;
  return `Atacado a partir de ${unidades(atacado.pedidoMinimo)}: ${escreverDinheiro(primeira.unitarioCentavos)}`;
}

/** Uma linha da tabela de atacado da página do produto. */
export interface LinhaDoAtacado {
  /** A partir de quantas unidades a linha vale (1 no varejo). */
  readonly aPartirDe: number;
  /** "1 a 9 un." no varejo, "A partir de 10 un." nas faixas. */
  readonly quantidade: string;
  /** O nome que o dono deu à faixa ("Caixa fechada"); nulo no varejo. */
  readonly rotulo: string | null;
  /** O preço por unidade. */
  readonly preco: string;
  /** "R$ 0,50 por un. (5%)"; nulo no varejo. */
  readonly economia: string | null;
  readonly ehVarejo: boolean;
}

/**
 * A tabela completa: a linha do varejo (até a quantidade antes do pedido
 * mínimo) e uma por faixa, com o preço por unidade e quanto se economiza.
 * Vazia sem atacado ou sem preço de varejo.
 */
export function linhasDoAtacado(
  atacado: AtacadoNaVitrine | null | undefined,
  varejoCentavos: number | null,
): readonly LinhaDoAtacado[] {
  if (atacado === null || atacado === undefined || varejoCentavos === null)
    return [];
  const varejo: LinhaDoAtacado = {
    aPartirDe: 1,
    quantidade:
      atacado.pedidoMinimo <= 2
        ? "1 un."
        : `1 a ${unidades(atacado.pedidoMinimo - 1)}`,
    rotulo: null,
    preco: escreverDinheiro(varejoCentavos),
    economia: null,
    ehVarejo: true,
  };
  return [
    varejo,
    ...[...atacado.faixas]
      .sort((a, b) => a.quantidadeMinima - b.quantidadeMinima)
      .map((faixa) => ({
        aPartirDe: faixa.quantidadeMinima,
        quantidade: `A partir de ${unidades(faixa.quantidadeMinima)}`,
        rotulo: faixa.rotulo,
        preco: escreverDinheiro(faixa.unitarioCentavos),
        economia: `${escreverDinheiro(faixa.descontoPorUnidadeCentavos)} por un.${
          faixa.tipoDeDesconto === "PERCENTUAL" ? ` (${faixa.desconto}%)` : ""
        }`,
        ehVarejo: false,
      })),
  ];
}

/**
 * A faixa que vale para esta quantidade: a de MAIOR `quantidadeMinima` que ela
 * alcança, qualquer que seja a ordem em que as faixas chegaram. Nula abaixo do
 * pedido mínimo (vale o varejo). A tabela, o preço por unidade e o total do
 * botão leem esta mesma escolha.
 */
export function faixaNoAtacado(
  atacado: AtacadoNaVitrine | null | undefined,
  quantidade: number,
): AtacadoNaVitrine["faixas"][number] | null {
  let escolhida: AtacadoNaVitrine["faixas"][number] | null = null;
  for (const faixa of atacado?.faixas ?? []) {
    if (faixa.quantidadeMinima > quantidade) continue;
    if (
      escolhida === null ||
      faixa.quantidadeMinima > escolhida.quantidadeMinima
    ) {
      escolhida = faixa;
    }
  }
  return escolhida;
}

/**
 * O preço por unidade que vale para esta quantidade: o da maior faixa que ela
 * alcança, como a API já calculou; nulo abaixo do pedido mínimo (vale o
 * varejo). É o que faz o total do botão bater com o que o carrinho cobra.
 */
export function unitarioNoAtacado(
  atacado: AtacadoNaVitrine | null | undefined,
  quantidade: number,
): number | null {
  return faixaNoAtacado(atacado, quantidade)?.unitarioCentavos ?? null;
}
