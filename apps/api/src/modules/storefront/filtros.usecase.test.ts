import { describe, expect, it } from "vitest";

import {
  filtrosAplicaveis,
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
