// @vitest-environment jsdom
/**
 * Prova da decisão de carregar o mundo (AC-935).
 *
 * O QUE O CRITÉRIO COBRA é que a decisão aconteça ANTES do download. Decidir
 * depois de baixar cento e cinquenta quilobytes num celular em rede móvel já
 * gastou o dado da pessoa — a economia teria virado só uma tela preta a menos.
 *
 * Por isso a decisão é uma função pura sobre o ambiente: ela é testável em todos
 * os casos sem depender do aparelho que roda o teste, e quem a chama importa o
 * pacote só depois de ela responder sim.
 */
import { describe, expect, it } from "vitest";

import {
  LARGURA_MINIMA_PARA_3D,
  NUCLEOS_MINIMOS_PARA_3D,
  lerAparelho,
  podeRodar3D,
  type AparelhoDeQuemChegou,
} from "../src/features/landing/podeRodar3D.ts";

/** Um computador capaz, que é o único caso em que o mundo aparece. */
const CAPAZ: AparelhoDeQuemChegou = {
  temWebGL: true,
  larguraEmPixels: 1440,
  nucleos: 8,
  querMovimentoReduzido: false,
};

describe("o mundo só roda onde ele cabe (AC-935)", () => {
  it("@spec:AC-935 num computador capaz, o mundo é carregado", () => {
    expect(podeRodar3D(CAPAZ)).toBe(true);
  });

  it("@spec:AC-935 sem WebGL o pacote nem é baixado", () => {
    // O navegador não teria como desenhar, e tentar produz uma tela preta no
    // lugar de uma página.
    expect(podeRodar3D({ ...CAPAZ, temWebGL: false })).toBe(false);
  });

  it("@spec:AC-935 quem pediu menos movimento não recebe um mundo girando", () => {
    // É um pedido explícito da pessoa, e vale mesmo num computador capaz.
    expect(podeRodar3D({ ...CAPAZ, querMovimentoReduzido: true })).toBe(false);
  });

  it("@spec:AC-935 no celular o mundo fica de fora", () => {
    // Celular tem bateria, dado móvel e processador contados. A landing precisa
    // converter ali sem o mundo.
    expect(
      podeRodar3D({ ...CAPAZ, larguraEmPixels: LARGURA_MINIMA_PARA_3D - 1 }),
    ).toBe(false);
    expect(
      podeRodar3D({ ...CAPAZ, larguraEmPixels: LARGURA_MINIMA_PARA_3D }),
    ).toBe(true);
  });

  it("@spec:AC-935 aparelho de entrada fica de fora, mesmo em tela grande", () => {
    // Ele trava, e a pessoa desiste da página antes de o mundo aparecer.
    expect(
      podeRodar3D({ ...CAPAZ, nucleos: NUCLEOS_MINIMOS_PARA_3D - 1 }),
    ).toBe(false);
  });

  it("@spec:AC-935 quem declarou conexão econômica não paga por um enfeite", () => {
    // É alguém dizendo que está pagando por dado.
    expect(podeRodar3D({ ...CAPAZ, conexaoEconomica: true })).toBe(false);
  });

  it("@spec:AC-935 basta UMA recusa para o mundo não carregar", () => {
    // Nenhuma condição compensa outra: o aparelho capaz que pediu menos
    // movimento continua sem mundo.
    const recusas: Partial<AparelhoDeQuemChegou>[] = [
      { temWebGL: false },
      { querMovimentoReduzido: true },
      { conexaoEconomica: true },
      { larguraEmPixels: 360 },
      { nucleos: 2 },
    ];

    for (const recusa of recusas) {
      expect(podeRodar3D({ ...CAPAZ, ...recusa }), JSON.stringify(recusa)).toBe(
        false,
      );
    }
  });
});

describe("a leitura do aparelho erra para o lado seguro (AC-935)", () => {
  it("@spec:AC-935 sem informação de núcleos, assume o mínimo", () => {
    // Errar para menos custa um mundo que não apareceu; errar para mais custa
    // uma página travada no aparelho de quem menos podia esperar.
    const original = Object.getOwnPropertyDescriptor(
      Navigator.prototype,
      "hardwareConcurrency",
    );
    Object.defineProperty(navigator, "hardwareConcurrency", {
      configurable: true,
      get: () => undefined,
    });

    expect(lerAparelho().nucleos).toBe(1);

    if (original) {
      Object.defineProperty(
        Navigator.prototype,
        "hardwareConcurrency",
        original,
      );
    }
  });

  it("@spec:AC-935 o aparelho lido de um computador capaz passa pela decisão", () => {
    // A leitura e a decisão precisam casar: uma leitura que sempre recusasse
    // faria o mundo nunca aparecer, e o teste da decisão continuaria verde.
    const lido = lerAparelho();

    expect(typeof lido.temWebGL).toBe("boolean");
    expect(typeof lido.larguraEmPixels).toBe("number");
    expect(lido.nucleos).toBeGreaterThanOrEqual(1);
  });
});
