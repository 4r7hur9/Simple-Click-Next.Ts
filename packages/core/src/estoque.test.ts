import { describe, expect, it } from "vitest";

import { estaAcabando } from "./estoque.ts";

describe("quando uma variação está acabando (AC-336)", () => {
  it("@spec:AC-336 com aviso em cinco, o quinto item já acende o aviso", () => {
    expect(estaAcabando(6, 5)).toBe(false);
    expect(estaAcabando(5, 5)).toBe(true);
    expect(estaAcabando(0, 5)).toBe(true);
  });

  it("@spec:AC-336 @spec:AC-337 sem controle de estoque ou sem mínimo, não há aviso", () => {
    // Nulo não é zero: a lanchonete não controla unidades e não deve ver o
    // painel inteiro acusando estoque baixo.
    expect(estaAcabando(null, 5)).toBe(false);
    expect(estaAcabando(0, null)).toBe(false);
  });
});
