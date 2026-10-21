/**
 * Geometria do editor de Stories (card #84): arrastar, pinça (escala e giro
 * com dois dedos), alça do mouse, roda, enquadramento e lixeira.
 */
import { describe, expect, it } from "vitest";

import {
  ALTURA_DO_PALCO,
  LARGURA_DO_PALCO,
  LIMITES_DOS_OBJETOS,
  TRANSFORMACAO_CENTRAL,
  avancarGesto,
  avancarGestoDaAlca,
  escalaBaseDaMidia,
  escalarComARoda,
  girar,
  girarComARoda,
  iniciarGesto,
  iniciarGestoDaAlca,
  paraOPalco,
  sobreALixeira,
  type Ponto,
  type Transformacao,
} from "../src/features/stories/geometria";

const BASE: Transformacao = { x: 540, y: 960, escala: 1, rotacao: 0 };

function perto(a: number, b: number, casas = 5) {
  expect(a).toBeCloseTo(b, casas);
}

describe("um dedo arrasta", () => {
  it("move o objeto pelo mesmo deslocamento do dedo", () => {
    const gesto = iniciarGesto(BASE, [{ x: 100, y: 100 }]);
    const t = avancarGesto(gesto, [{ x: 160, y: 70 }]);
    expect(t).toEqual({ ...BASE, x: 600, y: 930 });
  });

  it("sem mexer o dedo não muda nada", () => {
    const gesto = iniciarGesto(BASE, [{ x: 10, y: 10 }]);
    expect(avancarGesto(gesto, [{ x: 10, y: 10 }])).toEqual(BASE);
  });

  it("se o número de dedos mudou sem recomeçar, devolve o estado de partida", () => {
    const gesto = iniciarGesto(BASE, [{ x: 10, y: 10 }]);
    expect(
      avancarGesto(gesto, [
        { x: 10, y: 10 },
        { x: 50, y: 50 },
      ]),
    ).toEqual(BASE);
  });
});

describe("dois dedos: pinça e rotação", () => {
  const dedos: Ponto[] = [
    { x: 440, y: 960 },
    { x: 640, y: 960 },
  ];

  it("afastar os dedos aumenta na mesma proporção", () => {
    const gesto = iniciarGesto(BASE, dedos);
    const t = avancarGesto(gesto, [
      { x: 340, y: 960 },
      { x: 740, y: 960 },
    ]);
    perto(t.escala, 2);
    perto(t.rotacao, 0);
    // O meio dos dedos não saiu do lugar: o objeto também não.
    perto(t.x, 540);
    perto(t.y, 960);
  });

  it("aproximar os dedos diminui", () => {
    const gesto = iniciarGesto(BASE, dedos);
    const t = avancarGesto(gesto, [
      { x: 490, y: 960 },
      { x: 590, y: 960 },
    ]);
    perto(t.escala, 0.5);
  });

  it("girar os dedos 90° gira o objeto 90°", () => {
    const gesto = iniciarGesto(BASE, dedos);
    const t = avancarGesto(gesto, [
      { x: 540, y: 860 },
      { x: 540, y: 1060 },
    ]);
    perto(t.rotacao, Math.PI / 2);
    perto(t.escala, 1);
    perto(t.x, 540);
    perto(t.y, 960);
  });

  it("o ponto do objeto sob o meio dos dedos continua sob o meio dos dedos", () => {
    // Dedos longe do centro do objeto: o objeto gira e cresce em volta deles.
    const base: Transformacao = { x: 300, y: 500, escala: 1.5, rotacao: 0.4 };
    const inicio: Ponto[] = [
      { x: 400, y: 600 },
      { x: 500, y: 640 },
    ];
    const gesto = iniciarGesto(base, inicio);
    const agora: Ponto[] = [
      { x: 380, y: 560 },
      { x: 560, y: 700 },
    ];
    const t = avancarGesto(gesto, agora);

    const meioInicial = { x: 450, y: 620 };
    const local = girar(
      { x: meioInicial.x - base.x, y: meioInicial.y - base.y },
      -base.rotacao,
    );
    const ancora = { x: local.x / base.escala, y: local.y / base.escala };
    const noPalco = girar({ x: ancora.x * t.escala, y: ancora.y * t.escala }, t.rotacao);
    perto(t.x + noPalco.x, 470);
    perto(t.y + noPalco.y, 630);
  });

  it("a escala respeita os limites", () => {
    const gesto = iniciarGesto(BASE, dedos);
    const grande = avancarGesto(gesto, [
      { x: -2000, y: 960 },
      { x: 3000, y: 960 },
    ]);
    expect(grande.escala).toBe(LIMITES_DOS_OBJETOS.maxima);
    const pequena = avancarGesto(gesto, [
      { x: 539, y: 960 },
      { x: 541, y: 960 },
    ]);
    expect(pequena.escala).toBe(LIMITES_DOS_OBJETOS.minima);
  });

  it("dedos no mesmo ponto não quebram a conta", () => {
    const gesto = iniciarGesto(BASE, [
      { x: 100, y: 100 },
      { x: 100, y: 100 },
    ]);
    const t = avancarGesto(gesto, [
      { x: 100, y: 100 },
      { x: 150, y: 100 },
    ]);
    expect(Number.isFinite(t.escala)).toBe(true);
    expect(Number.isFinite(t.x)).toBe(true);
  });

  it("recomeçar o gesto com o estado de agora não dá salto", () => {
    const gesto = iniciarGesto(BASE, [{ x: 100, y: 100 }]);
    const meio = avancarGesto(gesto, [{ x: 200, y: 100 }]);
    // Um segundo dedo pousa: o gesto recomeça do estado atual.
    const dois = iniciarGesto(meio, [
      { x: 200, y: 100 },
      { x: 300, y: 100 },
    ]);
    expect(
      avancarGesto(dois, [
        { x: 200, y: 100 },
        { x: 300, y: 100 },
      ]),
    ).toEqual(meio);
  });
});

describe("alça do mouse e roda", () => {
  it("arrastar a alça para longe do centro aumenta e para o lado gira", () => {
    const gesto = iniciarGestoDaAlca(BASE, { x: 740, y: 960 });
    const maior = avancarGestoDaAlca(gesto, { x: 940, y: 960 });
    perto(maior.escala, (940 - 540) / (740 - 540));
    perto(maior.rotacao, 0);
    const girada = avancarGestoDaAlca(gesto, { x: 540, y: 1160 });
    perto(girada.rotacao, Math.PI / 2);
    expect(girada.x).toBe(540);
    expect(girada.y).toBe(960);
  });

  it("a roda para cima aumenta, para baixo diminui, com limites", () => {
    expect(escalarComARoda(BASE, -100).escala).toBeGreaterThan(1);
    expect(escalarComARoda(BASE, 100).escala).toBeLessThan(1);
    expect(escalarComARoda(BASE, 100_000).escala).toBe(LIMITES_DOS_OBJETOS.minima);
    expect(escalarComARoda(BASE, -100_000).escala).toBe(LIMITES_DOS_OBJETOS.maxima);
  });

  it("shift + roda gira em passos de 15°", () => {
    perto(girarComARoda(BASE, 100).rotacao, Math.PI / 12);
  });
});

describe("palco, enquadramento e lixeira", () => {
  it("converte a tela para o palco de 1080 x 1920", () => {
    const retangulo = { left: 10, top: 20, width: 270, height: 480 };
    expect(paraOPalco({ x: 10, y: 20 }, retangulo)).toEqual({ x: 0, y: 0 });
    expect(paraOPalco({ x: 280, y: 500 }, retangulo)).toEqual({
      x: LARGURA_DO_PALCO,
      y: ALTURA_DO_PALCO,
    });
    expect(paraOPalco({ x: 145, y: 260 }, retangulo)).toEqual({ x: 540, y: 960 });
  });

  it("preencher cobre o palco; ajustar mostra tudo", () => {
    // Foto deitada 4000 x 3000.
    perto(escalaBaseDaMidia(4000, 3000, "preencher"), 1920 / 3000);
    perto(escalaBaseDaMidia(4000, 3000, "ajustar"), 1080 / 4000);
    // Em pé 9:16: os dois modos coincidem.
    perto(escalaBaseDaMidia(1080, 1920, "preencher"), 1);
    perto(escalaBaseDaMidia(1080, 1920, "ajustar"), 1);
    expect(escalaBaseDaMidia(0, 0, "preencher")).toBe(1);
  });

  it("a lixeira é a faixa de baixo do palco", () => {
    expect(sobreALixeira({ x: 540, y: 1000 })).toBe(false);
    expect(sobreALixeira({ x: 540, y: ALTURA_DO_PALCO - 10 })).toBe(true);
    expect(sobreALixeira({ x: 0, y: ALTURA_DO_PALCO - 260 })).toBe(true);
  });

  it("a transformação central é o meio do palco", () => {
    expect(TRANSFORMACAO_CENTRAL).toEqual({ x: 540, y: 960, escala: 1, rotacao: 0 });
  });
});
