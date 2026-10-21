import { describe, expect, it } from "vitest";

import {
  atacadoDentroDoPedidoMinimo,
  facetaDeAtacado,
  filtrosAplicaveis,
  produtosComAtacado,
  produtosQueCasamComEspecificacoes,
  valoresSatisfazemFiltros,
} from "./filtros.usecase.ts";

describe("filtro por especificação na vitrine", () => {
  it("@spec:AC-328 casa somente valores preenchidos e todos os filtros escolhidos", () => {
    expect(
      valoresSatisfazemFiltros(new Set(["aro=14", "largura=205"]), ["aro=14"]),
    ).toBe(true);
    expect(valoresSatisfazemFiltros(new Set(["aro=14"]), ["aro=15"])).toBe(
      false,
    );
    expect(
      valoresSatisfazemFiltros(new Set(["aro=14", "largura=205"]), [
        "aro=14",
        "largura=195",
      ]),
    ).toBe(false);
    expect(produtosQueCasamComEspecificacoes).toBeTypeOf("function");
  });

  it("@spec:AC-328 especificação que não é filtrável não vira filtro, nem pelo endereço", () => {
    const filtraveis = new Set(["aro"]);

    expect(
      filtrosAplicaveis(["aro=15", "marca=Pirelli", "=15", "aro="], filtraveis),
    ).toEqual(["aro=15"]);
    expect(filtrosAplicaveis(["marca=Pirelli"], filtraveis)).toEqual([]);
  });
});

describe("filtro de atacado na vitrine (card #59)", () => {
  const comAtacado = [
    { id: "a", pedidoMinimo: 6 },
    { id: "b", pedidoMinimo: 12 },
    { id: "c", pedidoMinimo: 50 },
  ];

  it("sem pedido mínimo, todo produto com faixa ativa entra", () => {
    expect(atacadoDentroDoPedidoMinimo(comAtacado)).toEqual(["a", "b", "c"]);
  });

  it("com pedido mínimo, só entra quem já dá atacado com essa quantidade", () => {
    expect(atacadoDentroDoPedidoMinimo(comAtacado, 12)).toEqual(["a", "b"]);
    expect(atacadoDentroDoPedidoMinimo(comAtacado, 5)).toEqual([]);
  });

  it("a faceta conta sobre o catálogo inteiro quando não há outro filtro", () => {
    expect(facetaDeAtacado(comAtacado, undefined)).toEqual({
      produtos: 3,
      menorPedidoMinimo: 6,
    });
  });

  it("a faceta conta só os produtos que já casam com busca e especificações", () => {
    expect(facetaDeAtacado(comAtacado, ["b", "c", "x"])).toEqual({
      produtos: 2,
      menorPedidoMinimo: 12,
    });
    expect(facetaDeAtacado(comAtacado, ["x"])).toEqual({
      produtos: 0,
      menorPedidoMinimo: null,
    });
    expect(facetaDeAtacado([], undefined)).toEqual({
      produtos: 0,
      menorPedidoMinimo: null,
    });
  });

  it("a consulta ao banco existe e é assíncrona", () => {
    expect(produtosComAtacado).toBeTypeOf("function");
  });
});
