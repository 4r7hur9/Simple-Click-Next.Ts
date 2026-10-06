import { describe, expect, it } from "vitest";

import type { ProdutoParaPedidoManual } from "./pedido-manual.usecase.ts";
import {
  montarRepeticao,
  type PedidoDaEpoca,
} from "./repetir-pedido.usecase.ts";

const GRUPO = "22222222-2222-4222-8222-222222222222";
const KETCHUP = "33333333-3333-4333-8333-333333333333";
const MOSTARDA = "44444444-4444-4444-8444-444444444444";

const LANCHE_HOJE: ProdutoParaPedidoManual = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "X-Salada",
  precoCentavos: 2500,
  disponivel: true,
  grupos: [
    {
      id: GRUPO,
      nome: "Molho",
      minimo: 1,
      maximo: 1,
      permiteRepetir: false,
      eixoDeVariacao: false,
      opcoes: [
        {
          id: KETCHUP,
          nome: "Ketchup",
          acrescimoCentavos: 0,
          disponivel: true,
        },
      ],
    },
  ],
  variacoes: [],
};

const ANTIGO: PedidoDaEpoca = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  codigo: "A-0007",
  clienteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  entrega: "DELIVERY",
  itens: [
    {
      produtoId: LANCHE_HOJE.id,
      variacaoId: null,
      nome: "X-Salada",
      variacao: null,
      quantidade: 2,
      precoUnitarioCentavos: 2000,
      observacao: "sem cebola",
      escolhas: [
        {
          grupoId: GRUPO,
          opcaoId: KETCHUP,
          grupo: "Molho",
          opcao: "Ketchup",
          quantidade: 1,
        },
      ],
    },
    {
      produtoId: LANCHE_HOJE.id,
      variacaoId: null,
      nome: "X-Salada",
      variacao: null,
      quantidade: 1,
      precoUnitarioCentavos: 2150,
      observacao: null,
      escolhas: [
        {
          grupoId: GRUPO,
          opcaoId: MOSTARDA,
          grupo: "Molho",
          opcao: "Mostarda",
          quantidade: 1,
        },
      ],
    },
    {
      produtoId: null,
      variacaoId: null,
      nome: "Batata frita",
      variacao: null,
      quantidade: 1,
      precoUnitarioCentavos: 900,
      observacao: null,
      escolhas: [],
    },
  ],
};

describe("repetir monta o pedido novo com os preços de hoje (AC-712)", () => {
  it("@spec:AC-712 mesmos itens e escolhas, preço recalculado, preço da época ao lado", () => {
    const repeticao = montarRepeticao(
      ANTIGO,
      new Map([[LANCHE_HOJE.id, LANCHE_HOJE]]),
    );

    expect(repeticao.pedidoOriginal).toEqual({
      id: ANTIGO.id,
      codigo: "A-0007",
    });
    expect(repeticao.itens[0]).toMatchObject({
      quantidade: 2,
      escolhas: [{ grupoId: GRUPO, opcaoId: KETCHUP, quantidade: 1 }],
      observacao: "sem cebola",
      precoUnitarioCentavos: 2500,
      totalDaLinhaCentavos: 5000,
      precoUnitarioDaEpocaCentavos: 2000,
      pendencias: [],
    });
  });

  it("@spec:AC-712 a escolha que sumiu fica apontada no item, e o produto que saiu vai para os indisponíveis", () => {
    const repeticao = montarRepeticao(
      ANTIGO,
      new Map([[LANCHE_HOJE.id, LANCHE_HOJE]]),
    );

    expect(repeticao.itens[1]?.pendencias).toEqual([
      "Mostarda (Molho) não está mais disponível.",
      "Escolha 1 opção em Molho.",
    ]);
    expect(repeticao.indisponiveis).toEqual([
      {
        nome: "Batata frita",
        variacao: null,
        quantidade: 1,
        precoUnitarioDaEpocaCentavos: 900,
        motivo: "FORA_DO_CATALOGO",
      },
    ]);
    expect(repeticao.subtotalCentavos).toBe(5000 + 2500);
  });

  it("@spec:AC-712 produto que existe mas está fora do ar também é apontado", () => {
    const repeticao = montarRepeticao(
      ANTIGO,
      new Map([[LANCHE_HOJE.id, { ...LANCHE_HOJE, disponivel: false }]]),
    );
    expect(repeticao.itens).toEqual([]);
    expect(repeticao.indisponiveis.map((i) => i.motivo)).toEqual([
      "INDISPONIVEL",
      "INDISPONIVEL",
      "FORA_DO_CATALOGO",
    ]);
  });
});
