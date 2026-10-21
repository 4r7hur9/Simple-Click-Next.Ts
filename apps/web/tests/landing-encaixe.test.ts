/**
 * O encaixe das seções depois da narrativa (secoes/encaixe-das-telas.ts): um
 * gesto, uma tela; tela alta rola solta até a borda; ninguém fica preso.
 */
import { describe, expect, it } from "vitest";

import {
  ajusteDaPosicao,
  curvaDoDeslize,
  fimDaTela,
  passoDoGesto,
  telaDaPosicao,
  type MedidasDasTelas,
} from "../src/features/landing/secoes/encaixe-das-telas.ts";
import { palavrasDosTrechos } from "../src/features/landing/secoes/TelaDaLanding.tsx";

// Três telas: a 1ª e a 3ª cabem (800), a 2ª é alta (1300) e rola 500 por dentro.
const M: MedidasDasTelas = {
  janela: 800,
  telas: [
    { topo: 5000, altura: 800 },
    { topo: 5800, altura: 1300 },
    { topo: 7100, altura: 800 },
  ],
};

describe("encaixe das telas", () => {
  it("sabe em que tela está, e nada antes da primeira", () => {
    expect(telaDaPosicao(M, 4000)).toBeNull();
    expect(telaDaPosicao(M, 5000)).toBe(0);
    expect(telaDaPosicao(M, 6000)).toBe(1);
    expect(fimDaTela(M, 1)).toBe(6300);
    expect(fimDaTela(M, 0)).toBe(5000);
  });

  it("um gesto leva à tela seguinte inteira", () => {
    expect(passoDoGesto(M, 5000, 1)).toEqual({ tipo: "ir", y: 5800, indice: 1 });
    expect(passoDoGesto(M, 7100, -1)).toEqual({ tipo: "ir", y: 6300, indice: 1 });
  });

  it("dentro da tela alta, a rolagem é solta até a borda", () => {
    expect(passoDoGesto(M, 5800, 1)).toEqual({ tipo: "livre", limite: 6300 });
    expect(passoDoGesto(M, 6100, -1)).toEqual({ tipo: "livre", limite: 5800 });
    expect(passoDoGesto(M, 6300, 1)).toEqual({ tipo: "ir", y: 7100, indice: 2 });
  });

  it("não prende: subindo da primeira é com a narrativa, descendo da última vai ao rodapé", () => {
    expect(passoDoGesto(M, 5000, -1)).toEqual({ tipo: "fora" });
    expect(passoDoGesto(M, 4000, 1)).toEqual({ tipo: "fora" });
    expect(passoDoGesto(M, 7100, 1)).toEqual({ tipo: "fora" });
  });

  it("parou entre duas telas: encaixa a mais perto", () => {
    expect(ajusteDaPosicao(M, 5100)).toBe(5000);
    expect(ajusteDaPosicao(M, 5700)).toBe(5800);
    expect(ajusteDaPosicao(M, 6000)).toBeNull();
    expect(ajusteDaPosicao(M, 7100)).toBeNull();
  });

  it("o deslize usa a curva das cenas", () => {
    expect(curvaDoDeslize(0)).toBe(0);
    expect(curvaDoDeslize(0.5)).toBeCloseTo(0.5);
    expect(curvaDoDeslize(1)).toBe(1);
  });
});

describe("palavras do título", () => {
  it("a pontuação fica grudada no destaque e o destaque sobe inteiro", () => {
    const grupos = palavrasDosTrechos(["Quatro jeitos, ", { destaque: "na mesma régua" }, "."]);
    expect(grupos).toEqual([["Quatro"], ["jeitos,"], [{ destaque: "na mesma régua" }, "."]]);
  });
});
