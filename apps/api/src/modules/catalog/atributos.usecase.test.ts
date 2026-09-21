import { describe, expect, it } from "vitest";

import {
  ErroDeAtributoInvalido,
  atributosDoRamo,
  validarAtributosDoRamo,
} from "./atributos.usecase.ts";

describe("atributos do ramo", () => {
  it("@spec:AC-319 aceita voltagem prevista para eletrônicos", () => {
    expect(
      validarAtributosDoRamo("ELECTRONICS", { voltagem: "BIVOLT" }),
    ).toEqual({ voltagem: "BIVOLT" });
    expect(atributosDoRamo("ELECTRONICS")).toHaveLength(2);
  });

  it("@spec:AC-319 recusa voltagem fora do vocabulário sem apagar os outros campos", () => {
    expect(() =>
      validarAtributosDoRamo("ELECTRONICS", {
        voltagem: "127V",
        garantiaMeses: 12,
      }),
    ).toThrow(ErroDeAtributoInvalido);
  });

  it("@spec:AC-318 preserva campo criado pelo dono para o ramo", () => {
    expect(
      validarAtributosDoRamo("APPAREL", { tecido: "algodão", corte: "reto" }),
    ).toEqual({ tecido: "algodão", corte: "reto" });
  });
});
