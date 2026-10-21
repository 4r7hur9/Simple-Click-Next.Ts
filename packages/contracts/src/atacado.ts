/**
 * Atacado e varejo: faixas de desconto por quantidade (card #53).
 *
 * O PRODUTO TEM FAIXAS OPCIONAIS. Sem faixa, só varejo. Cada faixa diz "a
 * partir de X unidades" e o desconto por unidade, que o dono escolhe como
 * PERCENTUAL (inteiro de 1 a 99) ou VALOR em centavos. O desconto incide sobre
 * o preço de varejo que vale agora (base ou promoção) do produto ou da
 * variação.
 *
 * MODALIDADES: uma faixa só ou CRESCENTE (10 un = 5%, 50 un = 10%, 100 un =
 * 15%) — vale a maior faixa que a quantidade alcança. A faixa de menor
 * quantidade é o PEDIDO MÍNIMO de atacado; abaixo dela vale o varejo.
 *
 * TRAVAS (as mesmas da migração 0064 e de `problemasDasFaixas` do core):
 * quantidade a partir de 2; uma faixa por quantidade; o mesmo tipo de desconto
 * em todas; desconto estritamente crescente com a quantidade; desconto em
 * reais menor que o preço (este último o servidor confere, que conhece o
 * preço).
 *
 * No banco: linhas `WHOLESALE` de `app.product_prices`, no produto
 * (`variant_id` nulo), com `discount_kind` ('PERCENT' | 'AMOUNT'),
 * `discount_value` e `amount_cents = 0`. A conta é `precoNoAtacado` /
 * `precoAplicavel` de `@simpleclick/core`.
 */

import { z } from "zod";

/** Como o desconto da faixa é dado. */
export const TIPOS_DE_DESCONTO_DO_ATACADO = ["PERCENTUAL", "VALOR"] as const;

export type TipoDeDescontoDoAtacado =
  (typeof TIPOS_DE_DESCONTO_DO_ATACADO)[number];

export const esquemaDoTipoDeDescontoDoAtacado = z.enum(
  TIPOS_DE_DESCONTO_DO_ATACADO,
);

/** O nome de cada tipo no banco (`product_prices.discount_kind`). */
export const TIPO_DE_DESCONTO_NO_BANCO: Readonly<
  Record<TipoDeDescontoDoAtacado, "PERCENT" | "AMOUNT">
> = Object.freeze({ PERCENTUAL: "PERCENT", VALOR: "AMOUNT" });

/** Como cada tipo aparece na tela. */
export const ROTULOS_DOS_TIPOS_DE_DESCONTO: Readonly<
  Record<TipoDeDescontoDoAtacado, string>
> = Object.freeze({
  PERCENTUAL: "Percentual (%)",
  VALOR: "Valor em reais (R$)",
});

/** Limites do cadastro. */
export const LIMITES_DO_ATACADO = Object.freeze({
  quantidadeMinima: 2,
  quantidadeMaxima: 1_000_000,
  percentualMinimo: 1,
  percentualMaximo: 99,
  faixasPorProduto: 10,
});

/** Uma faixa, como o painel envia. */
export const esquemaDaFaixaDeAtacado = z
  .strictObject({
    quantidadeMinima: z
      .int()
      .min(LIMITES_DO_ATACADO.quantidadeMinima, {
        message: "O atacado começa a partir de 2 unidades.",
      })
      .max(LIMITES_DO_ATACADO.quantidadeMaxima),
    tipoDeDesconto: esquemaDoTipoDeDescontoDoAtacado,
    /** Percentual inteiro (1 a 99) ou centavos por unidade. */
    desconto: z
      .int()
      .positive({ message: "O desconto precisa ser maior que zero." })
      .max(999_999_999),
    /** O nome que o dono deu: "Caixa fechada". Opcional. */
    rotulo: z.string().trim().max(100).nullable().optional(),
  })
  .refine(
    (f) =>
      f.tipoDeDesconto !== "PERCENTUAL" ||
      (f.desconto >= LIMITES_DO_ATACADO.percentualMinimo &&
        f.desconto <= LIMITES_DO_ATACADO.percentualMaximo),
    { message: "O desconto percentual vai de 1% a 99%.", path: ["desconto"] },
  );

export type FaixaDeAtacadoNoContrato = z.infer<typeof esquemaDaFaixaDeAtacado>;

/**
 * Todas as faixas do produto, de uma vez (o painel regrava a lista inteira).
 * Lista vazia = o produto volta a vender só no varejo.
 */
export const esquemaDasFaixasDeAtacado = z
  .array(esquemaDaFaixaDeAtacado)
  .max(LIMITES_DO_ATACADO.faixasPorProduto)
  .superRefine((faixas, ctx) => {
    if (new Set(faixas.map((f) => f.tipoDeDesconto)).size > 1)
      ctx.addIssue({
        code: "custom",
        message: "Use o mesmo tipo de desconto em todas as faixas.",
      });

    const ordenadas = faixas
      .map((f, indice) => ({ f, indice }))
      .sort((a, b) => a.f.quantidadeMinima - b.f.quantidadeMinima);
    for (let i = 1; i < ordenadas.length; i++) {
      const anterior = ordenadas[i - 1]!;
      const atual = ordenadas[i]!;
      if (atual.f.quantidadeMinima === anterior.f.quantidadeMinima)
        ctx.addIssue({
          code: "custom",
          path: [atual.indice, "quantidadeMinima"],
          message: "Já existe uma faixa com essa quantidade.",
        });
      else if (atual.f.desconto <= anterior.f.desconto)
        ctx.addIssue({
          code: "custom",
          path: [atual.indice, "desconto"],
          message: "Quem leva mais precisa ganhar um desconto maior.",
        });
    }
  });

/** Corpo do `PUT` das faixas do produto. */
export const esquemaDasFaixasParaSalvar = z.strictObject({
  faixas: esquemaDasFaixasDeAtacado,
});

export type FaixasParaSalvarNoContrato = z.infer<
  typeof esquemaDasFaixasParaSalvar
>;

/** Uma faixa gravada, como a API devolve. */
export const esquemaDaFaixaGravada = z.strictObject({
  id: z.uuid(),
  quantidadeMinima: z.int().min(2),
  tipoDeDesconto: esquemaDoTipoDeDescontoDoAtacado,
  desconto: z.int().positive(),
  rotulo: z.string().nullable(),
  ativo: z.boolean(),
});

export type FaixaGravadaNoContrato = z.infer<typeof esquemaDaFaixaGravada>;

/** Uma faixa já em preço, para um preço de varejo conhecido. */
export const esquemaDaFaixaComPreco = z.strictObject({
  quantidadeMinima: z.int().min(2),
  tipoDeDesconto: esquemaDoTipoDeDescontoDoAtacado,
  desconto: z.int().positive(),
  rotulo: z.string().nullable(),
  /** O preço por unidade nesta faixa. */
  unitarioCentavos: z.int().positive(),
  /** Quanto cada unidade sai mais barata que no varejo. */
  descontoPorUnidadeCentavos: z.int().positive(),
});

export type FaixaComPrecoNoContrato = z.infer<typeof esquemaDaFaixaComPreco>;

/**
 * O atacado do produto na vitrine e no painel: as faixas com preço calculado
 * sobre o varejo vigente e o pedido mínimo. Nulo (no campo de quem o usa) =
 * só varejo.
 */
export const esquemaDoAtacadoDoProduto = z.strictObject({
  /** A menor quantidade que já compra no atacado. */
  pedidoMinimo: z.int().min(2),
  faixas: z.array(esquemaDaFaixaComPreco).min(1),
});

export type AtacadoDoProdutoNoContrato = z.infer<
  typeof esquemaDoAtacadoDoProduto
>;

/**
 * O atacado de um item no carrinho: a faixa que valeu (nula = varejo), a
 * próxima e quantas unidades faltam — "leve mais 4 e pague R$ 1,00 a menos em
 * cada".
 */
export const esquemaDoAtacadoNoItem = z.strictObject({
  pedidoMinimo: z.int().min(2),
  faixaAplicada: esquemaDaFaixaComPreco.nullable(),
  proximaFaixa: esquemaDaFaixaComPreco.nullable(),
  faltamParaProxima: z.int().positive().nullable(),
  /** (Varejo − unitário) × quantidade. */
  economiaCentavos: z.int().nonnegative(),
});

export type AtacadoNoItemNoContrato = z.infer<typeof esquemaDoAtacadoNoItem>;
