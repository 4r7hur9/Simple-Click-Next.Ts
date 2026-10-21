/**
 * Prova da faixa de atacado no pedido manual e na repetição (card #57).
 *
 * O balcão cobra como o site: a mesma regra pura (`precoNoAtacado`) sobre o
 * varejo de agora, pela quantidade do produto no pedido inteiro. E o item
 * levado ao banco carrega a faixa nas colunas certas de `order_items`.
 */
import type { FaixaDeAtacado } from "@simpleclick/core";
import { describe, expect, it } from "vitest";

import { aplicarAtacado, quantidadesPorProduto } from "./atacado-do-pedido.ts";
import { colunasDoPreco } from "./criar-pedido.usecase.ts";
import {
  precificarItensDoPedidoManual,
  type ProdutoParaPedidoManual,
} from "./pedido-manual.usecase.ts";
import {
  montarRepeticao,
  type PedidoDaEpoca,
} from "./repetir-pedido.usecase.ts";

const FAIXAS: FaixaDeAtacado[] = [
  { quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 5 },
  {
    quantidadeMinima: 50,
    tipoDeDesconto: "PERCENTUAL",
    desconto: 10,
    rotulo: "Fardo",
  },
];

const CAMISETA: ProdutoParaPedidoManual = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Camiseta",
  precoCentavos: null,
  disponivel: true,
  grupos: [],
  variacoes: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      nome: "P",
      precoCentavos: 2000,
      disponivel: true,
      padrao: true,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      nome: "G",
      precoCentavos: 2400,
      disponivel: true,
      padrao: false,
    },
  ],
};

describe("aplicarAtacado: a regra pura sobre o varejo de agora", () => {
  it("abaixo do pedido mínimo vale o varejo", () => {
    const preco = aplicarAtacado(2000, 9, FAIXAS);
    expect(preco.unitarioEmCentavos).toBe(2000);
    expect(preco.faixa).toBeNull();
    expect(preco.atacado?.faltamParaProxima).toBe(1);
  });

  it("vale a maior faixa que a quantidade alcança", () => {
    expect(aplicarAtacado(2000, 10, FAIXAS).unitarioEmCentavos).toBe(1900);
    const fardo = aplicarAtacado(2000, 60, FAIXAS);
    expect(fardo.unitarioEmCentavos).toBe(1800);
    expect(fardo.faixa).toEqual({
      quantidadeMinima: 50,
      tipoDeDesconto: "PERCENTUAL",
      desconto: 10,
      rotulo: "Fardo",
    });
  });

  it("sem faixas, só varejo", () => {
    expect(aplicarAtacado(2000, 100, undefined)).toEqual({
      unitarioEmCentavos: 2000,
      faixa: null,
      atacado: null,
    });
  });

  it("soma as peças de cada produto em todas as linhas", () => {
    expect(
      quantidadesPorProduto([
        { produtoId: "a", quantidade: 6 },
        { produtoId: "a", quantidade: 4 },
        { produtoId: "b", quantidade: 1 },
        { produtoId: null, quantidade: 9 },
      ]),
    ).toEqual(
      new Map([
        ["a", 10],
        ["b", 1],
      ]),
    );
  });
});

describe("o pedido manual aplica a faixa (card #57)", () => {
  const faixas = new Map([[CAMISETA.id, FAIXAS]]);

  it("6 P + 4 G são 10 peças: cada variação ganha 5% sobre o seu varejo", () => {
    const resultado = precificarItensDoPedidoManual(
      [
        {
          produtoId: CAMISETA.id,
          variacaoId: CAMISETA.variacoes[0]?.id ?? null,
          quantidade: 6,
          escolhas: [],
        },
        {
          produtoId: CAMISETA.id,
          variacaoId: CAMISETA.variacoes[1]?.id ?? null,
          quantidade: 4,
          escolhas: [],
        },
      ],
      new Map([[CAMISETA.id, CAMISETA]]),
      faixas,
    );

    expect(resultado.pendencias).toEqual([]);
    expect(resultado.itens.map((i) => i.precoUnitarioEmCentavos)).toEqual([
      1900, 2280,
    ]);
    expect(resultado.subtotalEmCentavos).toBe(1900 * 6 + 2280 * 4);
    expect(resultado.itens[0]).toMatchObject({
      tipoDePreco: "WHOLESALE",
      precoDeVarejoEmCentavos: 2000,
      faixaDeAtacado: {
        quantidadeMinima: 10,
        tipoDeDesconto: "PERCENTUAL",
        desconto: 5,
        rotulo: null,
      },
    });
  });

  it("sem alcançar o mínimo, cobra o varejo e não grava faixa", () => {
    const resultado = precificarItensDoPedidoManual(
      [
        {
          produtoId: CAMISETA.id,
          variacaoId: CAMISETA.variacoes[0]?.id ?? null,
          quantidade: 3,
          escolhas: [],
        },
      ],
      new Map([[CAMISETA.id, CAMISETA]]),
      faixas,
    );

    expect(resultado.itens[0]?.precoUnitarioEmCentavos).toBe(2000);
    expect(resultado.itens[0]?.faixaDeAtacado).toBeUndefined();
  });
});

describe("repetir o pedido aplica a faixa de hoje (card #57)", () => {
  it("o pedido antigo de 12 peças volta com o preço da faixa", () => {
    const antigo: PedidoDaEpoca = {
      id: "44444444-4444-4444-8444-444444444444",
      codigo: "A-0001",
      clienteId: null,
      entrega: "PICKUP",
      itens: [
        {
          produtoId: CAMISETA.id,
          variacaoId: CAMISETA.variacoes[0]?.id ?? null,
          nome: "Camiseta",
          variacao: "P",
          quantidade: 12,
          precoUnitarioCentavos: 2000,
          observacao: null,
          escolhas: [],
        },
      ],
    };

    const repeticao = montarRepeticao(
      antigo,
      new Map([[CAMISETA.id, CAMISETA]]),
      new Map([[CAMISETA.id, FAIXAS]]),
    );

    expect(repeticao.itens[0]).toMatchObject({
      precoUnitarioCentavos: 1900,
      totalDaLinhaCentavos: 1900 * 12,
      precoUnitarioDaEpocaCentavos: 2000,
    });
  });
});

describe("as colunas de order_items (card #57)", () => {
  it("faixa com desconto vira as quatro colunas, o varejo e o tipo", () => {
    expect(
      colunasDoPreco({
        nomeDoProduto: "Camiseta",
        quantidade: 12,
        precoUnitarioEmCentavos: 1900,
        totalDaLinhaEmCentavos: 22_800,
        tipoDePreco: "WHOLESALE",
        precoDeVarejoEmCentavos: 2000,
        faixaDeAtacado: {
          quantidadeMinima: 10,
          tipoDeDesconto: "VALOR",
          desconto: 100,
          rotulo: "Caixa",
        },
      }),
    ).toEqual({
      priceKindSnapshot: "WHOLESALE",
      compareAtCents: 2000n,
      wholesaleMinQuantity: 10,
      wholesaleDiscountKind: "AMOUNT",
      wholesaleDiscountValue: 100n,
      wholesaleLabel: "Caixa",
    });
  });

  it("atacado antigo de preço fixo guarda a quantidade, sem desconto", () => {
    expect(
      colunasDoPreco({
        nomeDoProduto: "Água",
        quantidade: 6,
        precoUnitarioEmCentavos: 250,
        totalDaLinhaEmCentavos: 1500,
        tipoDePreco: "WHOLESALE",
        precoDeVarejoEmCentavos: 300,
        faixaDeAtacado: {
          quantidadeMinima: 6,
          tipoDeDesconto: null,
          desconto: null,
          rotulo: null,
        },
      }),
    ).toMatchObject({
      wholesaleMinQuantity: 6,
      wholesaleDiscountKind: null,
      wholesaleDiscountValue: null,
    });
  });

  it("no varejo, tudo nulo", () => {
    expect(
      colunasDoPreco({
        nomeDoProduto: "Pão",
        quantidade: 1,
        precoUnitarioEmCentavos: 100,
        totalDaLinhaEmCentavos: 100,
      }),
    ).toEqual({
      priceKindSnapshot: null,
      compareAtCents: null,
      wholesaleMinQuantity: null,
      wholesaleDiscountKind: null,
      wholesaleDiscountValue: null,
      wholesaleLabel: null,
    });
  });
});
