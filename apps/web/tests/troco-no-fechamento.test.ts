import { describe, expect, it } from "vitest";

import { trocoEmCentavos } from "../src/features/checkout/FechamentoDaCompra.tsx";

describe("troco no fechamento (card #70)", () => {
  it("vazio é sem troco", () => {
    expect(trocoEmCentavos("")).toBeNull();
    expect(trocoEmCentavos("  ")).toBeNull();
  });

  it("aceita o jeito brasileiro de escrever dinheiro", () => {
    expect(trocoEmCentavos("100")).toBe(10_000);
    expect(trocoEmCentavos("100,00")).toBe(10_000);
    expect(trocoEmCentavos("R$ 50,5")).toBe(5_050);
    expect(trocoEmCentavos("1.000,50")).toBe(100_050);
    expect(trocoEmCentavos("1.000")).toBe(100_000);
    expect(trocoEmCentavos("100.5")).toBe(10_050);
  });

  it("recusa o que não é dinheiro", () => {
    expect(trocoEmCentavos("cem")).toBeUndefined();
    expect(trocoEmCentavos("0")).toBeUndefined();
    expect(trocoEmCentavos("10,555")).toBeUndefined();
  });
});
