/**
 * Faixas de atacado com desconto (card #53).
 *
 * AS REGRAS DO DONO, nesta ordem:
 *   1. o produto tem faixas OPCIONAIS — sem faixa, ele só vende no varejo;
 *   2. cada faixa diz "a partir de X unidades" e o desconto por unidade:
 *      PERCENTUAL (1 a 99) ou VALOR em centavos;
 *   3. uma faixa só, ou CRESCENTE (10 un = 5%, 50 un = 10%, 100 un = 15%):
 *      vale a MAIOR faixa que a quantidade alcança;
 *   4. a faixa de menor quantidade é o pedido mínimo de atacado; abaixo dela
 *      vale o varejo;
 *   5. o desconto incide sobre o preço de varejo que vale AGORA (BASE ou PROMO)
 *      do produto ou da variação — quem calcula esse preço é `precoQueVale`, e
 *      ele chega aqui pronto.
 *
 * FAIXA QUE NÃO CABE NO PREÇO NÃO VALE. O banco recusa desconto em reais maior
 * que o preço base, mas a promoção (ou um preço novo) pode deixá-lo menor que o
 * desconto. Em vez de cobrar zero ou negativo, a faixa é ignorada e a conta
 * segue pela faixa anterior ou pelo varejo. Percentual arredonda o preço
 * cobrado para o centavo mais próximo, e nunca deixa o item abaixo de 1
 * centavo.
 *
 * Tudo em centavos inteiros (P-005).
 */
import { exigirCentavos, multiplicarCentavos } from "./dinheiro.ts";

/** Como o desconto da faixa é dado. */
export type TipoDeDescontoDoAtacado = "PERCENTUAL" | "VALOR";

/** Uma faixa de atacado, como o dono a cadastrou. */
export interface FaixaDeAtacado {
  /** A partir de quantas unidades a faixa vale (2 ou mais). */
  readonly quantidadeMinima: number;
  readonly tipoDeDesconto: TipoDeDescontoDoAtacado;
  /** Percentual inteiro (1 a 99) ou centavos por unidade. */
  readonly desconto: number;
  /** O nome que o dono deu: "Caixa fechada". Opcional. */
  readonly rotulo?: string | null;
}

/** Uma faixa já convertida em preço, para a quantidade de quem compra. */
export interface FaixaCalculada {
  readonly quantidadeMinima: number;
  readonly tipoDeDesconto: TipoDeDescontoDoAtacado;
  readonly desconto: number;
  readonly rotulo: string | null;
  /** O preço por unidade nesta faixa. */
  readonly unitarioEmCentavos: number;
  /** Quanto cada unidade sai mais barata que no varejo. */
  readonly descontoPorUnidadeEmCentavos: number;
}

/** O que a regra devolve para um item. */
export interface PrecoNoAtacado {
  /** O preço de varejo que serviu de base. */
  readonly varejoEmCentavos: number;
  /** O que se cobra por unidade: o da faixa aplicada, ou o varejo. */
  readonly unitarioEmCentavos: number;
  readonly quantidade: number;
  /** Unitário × quantidade. */
  readonly totalEmCentavos: number;
  /** (Varejo − unitário) × quantidade. */
  readonly economiaEmCentavos: number;
  /** A faixa que vale para esta quantidade; nula = varejo. */
  readonly faixaAplicada: FaixaCalculada | null;
  /** A próxima faixa, com desconto maior; nula quando já está na última. */
  readonly proximaFaixa: FaixaCalculada | null;
  /** Quantas unidades faltam para a próxima faixa; nulo sem próxima. */
  readonly faltamParaProxima: number | null;
  /**
   * A quantidade mínima para comprar no atacado (a menor faixa que cabe no
   * preço); nula quando o produto só vende no varejo.
   */
  readonly pedidoMinimoDoAtacado: number | null;
}

/** O preço por unidade numa faixa, ou nulo quando o desconto não cabe. */
export function unitarioNaFaixa(
  varejoEmCentavos: number,
  faixa: Pick<FaixaDeAtacado, "tipoDeDesconto" | "desconto">,
): number | null {
  exigirCentavos(varejoEmCentavos, "o preço de varejo");
  if (!Number.isSafeInteger(faixa.desconto) || faixa.desconto <= 0) return null;

  if (faixa.tipoDeDesconto === "PERCENTUAL") {
    if (faixa.desconto >= 100) return null;
    // Arredonda o COBRADO para o centavo mais próximo, em inteiros:
    // 1999 × 95 = 189905 → 1899 (R$ 18,99); meio centavo sobe.
    const unitario = Math.floor(
      (varejoEmCentavos * (100 - faixa.desconto) + 50) / 100,
    );
    return unitario >= 1 && unitario < varejoEmCentavos ? unitario : null;
  }

  const unitario = varejoEmCentavos - faixa.desconto;
  return unitario >= 1 ? unitario : null;
}

/**
 * As faixas que valem para este preço, em ordem de quantidade e com o
 * unitário calculado.
 *
 * Fica fora quem não cabe no preço e quem não sai mais barato que a faixa
 * anterior — cadastro velho ou mal feito nunca faz quem leva mais pagar mais.
 * Duas faixas na mesma quantidade: fica a mais barata.
 */
export function faixasValidas(
  varejoEmCentavos: number,
  faixas: readonly FaixaDeAtacado[],
): FaixaCalculada[] {
  const calculadas = faixas
    .filter(
      (f) =>
        Number.isSafeInteger(f.quantidadeMinima) && f.quantidadeMinima >= 2,
    )
    .flatMap((f) => {
      const unitario = unitarioNaFaixa(varejoEmCentavos, f);
      if (unitario === null) return [];
      const rotulo = f.rotulo?.trim();
      return [
        {
          quantidadeMinima: f.quantidadeMinima,
          tipoDeDesconto: f.tipoDeDesconto,
          desconto: f.desconto,
          rotulo: rotulo === undefined || rotulo === "" ? null : rotulo,
          unitarioEmCentavos: unitario,
          descontoPorUnidadeEmCentavos: varejoEmCentavos - unitario,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.quantidadeMinima - b.quantidadeMinima ||
        a.unitarioEmCentavos - b.unitarioEmCentavos,
    );

  const validas: FaixaCalculada[] = [];
  for (const faixa of calculadas) {
    const anterior = validas.at(-1);
    if (anterior === undefined) {
      validas.push(faixa);
    } else if (
      faixa.quantidadeMinima > anterior.quantidadeMinima &&
      faixa.unitarioEmCentavos < anterior.unitarioEmCentavos
    ) {
      validas.push(faixa);
    }
  }
  return validas;
}

/**
 * Dado o preço de varejo, a quantidade e as faixas: o preço por unidade
 * aplicado, a faixa que valeu, a próxima e quanto falta para ela.
 */
export function precoNoAtacado(
  varejoEmCentavos: number,
  quantidade: number,
  faixas: readonly FaixaDeAtacado[],
): PrecoNoAtacado {
  const unidades = Math.max(1, Math.trunc(quantidade));
  const validas = faixasValidas(varejoEmCentavos, faixas);

  let aplicada: FaixaCalculada | null = null;
  let proxima: FaixaCalculada | null = null;
  for (const faixa of validas) {
    if (faixa.quantidadeMinima <= unidades) aplicada = faixa;
    else {
      proxima = faixa;
      break;
    }
  }

  const unitario = aplicada?.unitarioEmCentavos ?? varejoEmCentavos;
  return {
    varejoEmCentavos,
    unitarioEmCentavos: unitario,
    quantidade: unidades,
    totalEmCentavos: multiplicarCentavos(unitario, unidades),
    economiaEmCentavos: multiplicarCentavos(
      varejoEmCentavos - unitario,
      unidades,
    ),
    faixaAplicada: aplicada,
    proximaFaixa: proxima,
    faltamParaProxima:
      proxima === null ? null : proxima.quantidadeMinima - unidades,
    pedidoMinimoDoAtacado: validas[0]?.quantidadeMinima ?? null,
  };
}

/** Um problema no cadastro das faixas, para a tela apontar a linha. */
export interface ProblemaDaFaixa {
  /** Posição da faixa na lista enviada; nula quando é do conjunto. */
  readonly indice: number | null;
  readonly mensagem: string;
}

/**
 * Confere o cadastro das faixas de um produto (as mesmas travas da migração
 * 0064). Com o preço de varejo, também confere se o desconto cabe nele.
 */
export function problemasDasFaixas(
  faixas: readonly FaixaDeAtacado[],
  varejoEmCentavos?: number | null,
): ProblemaDaFaixa[] {
  const problemas: ProblemaDaFaixa[] = [];

  faixas.forEach((f, indice) => {
    if (!Number.isSafeInteger(f.quantidadeMinima) || f.quantidadeMinima < 2)
      problemas.push({
        indice,
        mensagem: "O atacado começa a partir de 2 unidades.",
      });
    if (!Number.isSafeInteger(f.desconto) || f.desconto <= 0)
      problemas.push({
        indice,
        mensagem: "O desconto precisa ser maior que zero.",
      });
    else if (
      f.tipoDeDesconto === "PERCENTUAL" &&
      (f.desconto < 1 || f.desconto > 99)
    )
      problemas.push({
        indice,
        mensagem: "O desconto percentual vai de 1% a 99%.",
      });
    else if (
      f.tipoDeDesconto === "VALOR" &&
      varejoEmCentavos !== undefined &&
      varejoEmCentavos !== null &&
      f.desconto >= varejoEmCentavos
    )
      problemas.push({
        indice,
        mensagem:
          "O desconto em reais precisa ser menor que o preço do produto.",
      });
  });

  if (new Set(faixas.map((f) => f.tipoDeDesconto)).size > 1)
    problemas.push({
      indice: null,
      mensagem: "Use o mesmo tipo de desconto em todas as faixas.",
    });

  const ordenadas = faixas
    .map((f, indice) => ({ f, indice }))
    .sort((a, b) => a.f.quantidadeMinima - b.f.quantidadeMinima);
  for (let i = 1; i < ordenadas.length; i++) {
    const anterior = ordenadas[i - 1]!;
    const atual = ordenadas[i]!;
    if (atual.f.quantidadeMinima === anterior.f.quantidadeMinima)
      problemas.push({
        indice: atual.indice,
        mensagem: "Já existe uma faixa com essa quantidade.",
      });
    else if (atual.f.desconto <= anterior.f.desconto)
      problemas.push({
        indice: atual.indice,
        mensagem: "Quem leva mais precisa ganhar um desconto maior.",
      });
  }

  return problemas;
}
