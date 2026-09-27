/**
 * Prova da densidade da exibição (AC-926, AC-927).
 *
 * O que ela guarda: o corpo nunca desce do mínimo legível, a quantidade por
 * tela é o que sobra (e não o contrário), televisão em pé e deitada dividem o
 * espaço de jeitos diferentes, e nada é cortado na borda.
 */
import { describe, expect, it } from "vitest";

import {
  alturaOcupada,
  calcularDensidade,
  CORPO_MINIMO_EM_PX,
  MAXIMO_POR_TELA,
  MEDIDAS_INICIAIS,
} from "./densidade.ts";

/** As televisões e telas que a exibição encontra pelo caminho. */
const TELAS = {
  fullHdDeitada: { largura: 1920, altura: 1080 },
  fullHdEmPe: { largura: 1080, altura: 1920 },
  hdDeitada: { largura: 1280, altura: 720 },
  quatroKDeitada: { largura: 3840, altura: 2160 },
  quatroKEmPe: { largura: 2160, altura: 3840 },
  tabletEmPe: { largura: 768, altura: 1024 },
  celularEmPe: { largura: 360, altura: 640 },
  dobravelFechado: { largura: 344, altura: 882 },
} as const;

describe("a letra é para ler a três metros (AC-926)", () => {
  it("@spec:AC-926 o corpo nunca desce do mínimo, nem na tela mais apertada", () => {
    for (const medidas of Object.values(TELAS)) {
      expect(calcularDensidade(medidas).corpoEmPx).toBeGreaterThanOrEqual(
        CORPO_MINIMO_EM_PX,
      );
    }
  });

  it("@spec:AC-926 numa Full HD o corpo dá cerca de 22 mm de letra numa TV de 43 polegadas", () => {
    // 45 px × 0,49 mm por pixel ≈ 22 mm: o que a regra de sinalização pede
    // para três metros.
    expect(calcularDensidade(TELAS.fullHdDeitada).corpoEmPx).toBe(45);
  });

  it("@spec:AC-926 a quantidade por tela é o que cabe SEM reduzir o corpo", () => {
    const grande = calcularDensidade(TELAS.fullHdDeitada);
    const pequena = calcularDensidade(TELAS.hdDeitada);

    // Na tela menor, o corpo encolhe proporcionalmente, mas nunca abaixo do
    // mínimo — e é a quantidade que cede, não a letra.
    expect(pequena.corpoEmPx).toBeGreaterThanOrEqual(CORPO_MINIMO_EM_PX);
    expect(pequena.produtosPorTela).toBeLessThanOrEqual(grande.produtosPorTela);
    expect(grande.produtosPorTela).toBeLessThanOrEqual(MAXIMO_POR_TELA);
  });

  it("@spec:AC-926 no celular a tela cabe poucos produtos, com a mesma letra mínima", () => {
    const celular = calcularDensidade(TELAS.celularEmPe);

    expect(celular.corpoEmPx).toBe(CORPO_MINIMO_EM_PX);
    expect(celular.produtosPorTela).toBeGreaterThanOrEqual(1);
    expect(celular.produtosPorTela).toBeLessThan(8);
  });

  it("@spec:AC-926 uma 4K não recebe letra do mesmo tamanho em pixels: a letra cresce com a tela", () => {
    // Pixel de 4K é a metade do de Full HD no mesmo aparelho. Manter 45 px
    // faria a letra ter 11 mm — ilegível da fila.
    const quatroK = calcularDensidade(TELAS.quatroKDeitada).corpoEmPx;
    const fullHd = calcularDensidade(TELAS.fullHdDeitada).corpoEmPx;

    // O dobro, a menos do arredondamento para pixel inteiro.
    expect(Math.abs(quatroK - 2 * fullHd)).toBeLessThanOrEqual(1);
  });
});

describe("em pé e deitada dividem o espaço de jeitos diferentes (AC-927)", () => {
  it("@spec:AC-927 deitada tem duas colunas e o código ao lado; em pé, uma coluna e o código embaixo", () => {
    const deitada = calcularDensidade(TELAS.fullHdDeitada);
    const emPe = calcularDensidade(TELAS.fullHdEmPe);

    expect(deitada.orientacao).toBe("deitada");
    expect(deitada.colunas).toBe(2);
    expect(emPe.orientacao).toBe("em-pe");
    expect(emPe.colunas).toBe(1);
  });

  it("@spec:AC-927 em pé cabem mais linhas do que deitada, com o mesmo corpo", () => {
    const deitada = calcularDensidade(TELAS.fullHdDeitada);
    const emPe = calcularDensidade(TELAS.fullHdEmPe);

    expect(emPe.corpoEmPx).toBe(deitada.corpoEmPx);
    expect(emPe.linhas).toBeGreaterThan(deitada.linhas);
  });

  it("@spec:AC-927 nada é cortado: respiro, cabeçalho, linhas, código e rodapé cabem na altura", () => {
    for (const [nome, medidas] of Object.entries(TELAS)) {
      const densidade = calcularDensidade(medidas);
      expect(alturaOcupada(densidade, medidas), nome).toBeLessThanOrEqual(
        medidas.altura,
      );
    }
  });

  it.each([
    { largura: 1080, altura: 1920, corpo: 45, produtos: 9, ocupada: 1822.5 },
    { largura: 720, altura: 1280, corpo: 30, produtos: 9, ocupada: 1215 },
    { largura: 2160, altura: 3840, corpo: 91, produtos: 9, ocupada: 3672.7 },
    { largura: 1440, altura: 900, corpo: 38, produtos: 7, ocupada: 855 },
  ])(
    "@spec:AC-927 $largura × $altura reserva o espaço inteiro e leva o produto excedente para outra tela",
    ({ largura, altura, corpo, produtos, ocupada }) => {
      const medidas = { largura, altura };
      const densidade = calcularDensidade(medidas);

      expect(densidade.corpoEmPx).toBe(corpo);
      expect(densidade.colunas).toBe(1);
      expect(densidade.produtosPorTela).toBe(produtos);
      expect(alturaOcupada(densidade, medidas)).toBeCloseTo(ocupada);
      expect(ocupada).toBeLessThanOrEqual(altura);
      // Uma linha a mais ultrapassaria a tela: não basta esconder o excesso.
      expect(ocupada + corpo * 2.6).toBeGreaterThan(altura);
    },
  );

  it("@spec:AC-927 a proporção manda: a mesma televisão girada muda a divisão, não a letra", () => {
    const deitada = calcularDensidade(TELAS.quatroKDeitada);
    const emPe = calcularDensidade(TELAS.quatroKEmPe);

    expect(deitada.corpoEmPx).toBe(emPe.corpoEmPx);
    expect(deitada.orientacao).not.toBe(emPe.orientacao);
    expect(deitada.colunas).not.toBe(emPe.colunas);
  });

  it("@spec:AC-927 as medidas iniciais são a televisão mais comum, deitada", () => {
    expect(calcularDensidade(MEDIDAS_INICIAIS).orientacao).toBe("deitada");
  });
});
