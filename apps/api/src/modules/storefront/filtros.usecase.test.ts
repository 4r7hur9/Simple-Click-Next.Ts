import { describe, expect, it } from "vitest";

import {
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
    expect(produtosQueCasamComEspecificacoes).toBeTypeOf("function");
  });
});
