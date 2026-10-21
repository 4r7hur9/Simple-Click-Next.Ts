/**
 * O atacado que a vitrine, a página do produto e o feed mostram (card #56).
 *
 * UMA REGRA PARA AS TRÊS TELAS. O cartão da vitrine, a página do produto e o
 * post do feed anunciam o mesmo "a partir de 10 un.: R$ 9,50"; se cada módulo
 * fizesse a conta, o post diria um preço e a página outro no dia em que alguém
 * corrigisse uma das cópias. Por isso a conta mora aqui, no `core` da API, que
 * os módulos `storefront` e `feed` podem importar (um não importa o outro).
 *
 * A CONTA É A DO CARRINHO (card #53): `faixasValidas` de `@simpleclick/core`,
 * sobre o mesmo preço de varejo que o cartão mostra. Entram:
 *   - as faixas COM DESCONTO (0064), ligadas e dentro da janela de datas;
 *   - o atacado ANTIGO de preço fixo, ligado e vigente, quando sai mais barato
 *     que o varejo — vira uma faixa de desconto em reais (varejo − preço fixo),
 *     que é exatamente o que o carrinho cobra.
 * Faixa que não cabe no preço não aparece (a mesma trava do carrinho), e sem
 * nenhuma faixa válida a resposta é nula: a tela fica como sempre foi.
 */
import type {
  AtacadoDoProdutoNoContrato,
  TipoDeDescontoDoAtacado,
} from "@simpleclick/contracts";
import {
  faixasValidas,
  precoValeAgora,
  type FaixaDeAtacado,
  type PrecoCadastrado,
} from "@simpleclick/core";

/** Uma linha de `product_prices`, com as colunas que o atacado usa. */
export interface LinhaDePrecoDoAtacado {
  readonly kind: string;
  readonly amountCents: bigint | number;
  readonly minQuantity: number;
  readonly isActive: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly label?: string | null;
  /** 'PERCENT' | 'AMOUNT' (0064); nulo = preço fixo. */
  readonly discountKind?: string | null;
  readonly discountValue?: bigint | number | null;
}

function tipoDoBanco(valor: string): TipoDeDescontoDoAtacado {
  return valor === "AMOUNT" ? "VALOR" : "PERCENTUAL";
}

/** A linha do banco no vocabulário da regra do core. */
export function comoPrecoCadastrado(
  linha: LinhaDePrecoDoAtacado,
): PrecoCadastrado {
  const comDesconto =
    linha.discountKind !== undefined && linha.discountKind !== null;
  return {
    tipo: linha.kind,
    valorEmCentavos: Number(linha.amountCents),
    quantidadeMinima: linha.minQuantity,
    ativo: linha.isActive,
    comecaEm: linha.startsAt,
    terminaEm: linha.endsAt,
    rotulo: linha.label ?? null,
    tipoDeDesconto: comDesconto ? tipoDoBanco(linha.discountKind!) : null,
    desconto: comDesconto ? Number(linha.discountValue ?? 0) : null,
  };
}

/**
 * O atacado para um preço de varejo, a partir dos preços cadastrados do
 * produto. Nulo = só varejo (sem preço, sem faixa ou nenhuma cabe no preço).
 */
export function atacadoPublico(
  varejoEmCentavos: number | null,
  precos: readonly PrecoCadastrado[],
  agora: Date,
): AtacadoDoProdutoNoContrato | null {
  if (varejoEmCentavos === null || varejoEmCentavos <= 0) return null;

  const faixas: FaixaDeAtacado[] = [];
  for (const preco of precos) {
    // Vigente em qualquer quantidade: o pedido mínimo vem da própria faixa.
    if (
      preco.tipo !== "WHOLESALE" ||
      !precoValeAgora(preco, agora, Number.MAX_SAFE_INTEGER)
    )
      continue;
    if (preco.tipoDeDesconto !== undefined && preco.tipoDeDesconto !== null) {
      faixas.push({
        quantidadeMinima: preco.quantidadeMinima,
        tipoDeDesconto: preco.tipoDeDesconto,
        desconto: preco.desconto ?? 0,
        rotulo: preco.rotulo ?? null,
      });
    } else if (preco.valorEmCentavos < varejoEmCentavos) {
      faixas.push({
        quantidadeMinima: preco.quantidadeMinima,
        tipoDeDesconto: "VALOR",
        desconto: varejoEmCentavos - preco.valorEmCentavos,
        rotulo: preco.rotulo ?? null,
      });
    }
  }

  const validas = faixasValidas(varejoEmCentavos, faixas);
  const primeira = validas[0];
  if (primeira === undefined) return null;
  return {
    pedidoMinimo: primeira.quantidadeMinima,
    faixas: validas.map((f) => ({
      quantidadeMinima: f.quantidadeMinima,
      tipoDeDesconto: f.tipoDeDesconto,
      desconto: f.desconto,
      rotulo: f.rotulo,
      unitarioCentavos: f.unitarioEmCentavos,
      descontoPorUnidadeCentavos: f.descontoPorUnidadeEmCentavos,
    })),
  };
}
