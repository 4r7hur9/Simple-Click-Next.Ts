import { describe, expect, it } from "vitest";

import {
  decidirRemocaoDaCategoria,
  planejarMudancaDeVinculos,
} from "./categorias.usecase.ts";

describe("apagar categoria com produtos exige destino (AC-303)", () => {
  it("@spec:AC-303 categoria vazia sai sem pedir destino", () => {
    expect(
      decidirRemocaoDaCategoria({ categoriaId: "lanches", produtos: 0 }),
    ).toEqual({ tipo: "apagar" });
  });

  it("@spec:AC-303 categoria com cinco produtos e sem destino não é apagada", () => {
    expect(
      decidirRemocaoDaCategoria({ categoriaId: "lanches", produtos: 5 }),
    ).toEqual({ tipo: "exige_destino", produtos: 5 });
  });

  it("@spec:AC-303 o destino só pode ser outra categoria existente, ou ocultar", () => {
    expect(
      decidirRemocaoDaCategoria({
        categoriaId: "lanches",
        produtos: 5,
        destino: { acao: "mover", categoriaId: "lanches" },
        destinoExiste: true,
      }).tipo,
    ).toBe("destino_invalido");
    expect(
      decidirRemocaoDaCategoria({
        categoriaId: "lanches",
        produtos: 5,
        destino: { acao: "mover", categoriaId: "sumida" },
        destinoExiste: false,
      }).tipo,
    ).toBe("destino_invalido");
    expect(
      decidirRemocaoDaCategoria({
        categoriaId: "lanches",
        produtos: 5,
        destino: { acao: "mover", categoriaId: "salgados" },
        destinoExiste: true,
      }),
    ).toEqual({ tipo: "mover", categoriaId: "salgados" });
    expect(
      decidirRemocaoDaCategoria({
        categoriaId: "lanches",
        produtos: 5,
        destino: { acao: "ocultar" },
      }),
    ).toEqual({ tipo: "ocultar" });
  });

  it("@spec:AC-303 mover não duplica vínculo e o produto nunca fica sem principal", () => {
    const plano = planejarMudancaDeVinculos(
      [
        { id: "o-2", produtoId: "suco", principal: true, ordem: 1 },
        { id: "o-1", produtoId: "pastel", principal: true, ordem: 0 },
        { id: "o-3", produtoId: "promo", principal: true, ordem: 2 },
      ],
      [
        { id: "d-1", produtoId: "coxinha", principal: true, ordem: 4 },
        { id: "d-2", produtoId: "promo", principal: false, ordem: 5 },
      ],
    );

    expect(plano.mover).toEqual([
      { id: "o-1", ordem: 6 },
      { id: "o-2", ordem: 7 },
    ]);
    expect(plano.descartar).toEqual(["o-3"]);
    expect(plano.tornarPrincipal).toEqual(["d-2"]);
  });
});
