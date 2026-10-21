import { describe, expect, it } from "vitest";

import {
  CONTRASTE_MINIMO_GRAFICO,
  CONTRASTE_MINIMO_TEXTO,
  luminanciaRelativa,
  relacaoDeContraste,
} from "../src/contraste";
import {
  CORES_DO_SELO,
  avaliarSelo,
  corMedia,
  ehAvermelhada,
  variacaoDoSelo,
} from "../src/selo-de-status";

describe("a base: luminância e razão de contraste (WCAG)", () => {
  it("luminância vai de 0 (preto) a 1 (branco), com os valores de referência", () => {
    expect(luminanciaRelativa("#000000")).toBe(0);
    expect(luminanciaRelativa("#ffffff")).toBeCloseTo(1, 10);
    expect(luminanciaRelativa("#ff0000")).toBeCloseTo(0.2126, 4);
  });

  it("razão é 21 no preto e branco, 1 na mesma cor e não depende da ordem", () => {
    expect(relacaoDeContraste("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(relacaoDeContraste("#7a1010", "#7a1010")).toBe(1);
    expect(relacaoDeContraste("#136c3a", "#ffffff")).toBe(
      relacaoDeContraste("#ffffff", "#136c3a"),
    );
  });
});

describe("as duas variações do selo passam no AA", () => {
  for (const [nome, cores] of Object.entries(CORES_DO_SELO)) {
    it(`${nome}: texto ≥ 4,5 e pontos ≥ 3 contra a pílula`, () => {
      expect(relacaoDeContraste(cores.texto, cores.fundo)).toBeGreaterThanOrEqual(
        CONTRASTE_MINIMO_TEXTO,
      );
      expect(
        relacaoDeContraste(cores.pontoAberto, cores.fundo),
      ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_GRAFICO);
      expect(
        relacaoDeContraste(cores.pontoFechado, cores.fundo),
      ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_GRAFICO);
    });

    it(`${nome}: verde é aberto, vermelho é fechado, e a pílula é neutra`, () => {
      expect(ehAvermelhada(cores.pontoFechado)).toBe(true);
      expect(ehAvermelhada(cores.pontoAberto)).toBe(false);
      // Nunca vermelho sobre vermelho: o ponto de fechado fica na pílula.
      expect(ehAvermelhada(cores.fundo)).toBe(false);
    });
  }
});

describe("cor avermelhada", () => {
  it("reconhece vermelho, vinho e rosa", () => {
    expect(ehAvermelhada("#ff0000")).toBe(true);
    expect(ehAvermelhada("#7a1010")).toBe(true);
    expect(ehAvermelhada("#e83e8c")).toBe(true);
  });

  it("não confunde cinza, verde, azul nem laranja; cor inválida não é vermelha", () => {
    for (const cor of ["#808080", "#2a2624", "#136c3a", "#1e40af", "#f59e0b"]) {
      expect(ehAvermelhada(cor)).toBe(false);
    }
    expect(ehAvermelhada("vermelho")).toBe(false);
  });
});

describe("variação do selo", () => {
  it("sem cor da capa (ou cor inválida), o automático é o escuro", () => {
    expect(variacaoDoSelo("AUTOMATICO", null)).toBe("ESCURO");
    expect(variacaoDoSelo(undefined, undefined)).toBe("ESCURO");
    expect(variacaoDoSelo("AUTOMATICO", "não é cor")).toBe("ESCURO");
  });

  it("capa clara pede a pílula escura; capa escura, a clara", () => {
    expect(variacaoDoSelo("AUTOMATICO", "#f4efe6")).toBe("ESCURO");
    expect(variacaoDoSelo("AUTOMATICO", "#101418")).toBe("CLARO");
  });

  it("capa vermelho-escura (Moto Peças) recebe a pílula clara, que se destaca", () => {
    const avaliacao = avaliarSelo("AUTOMATICO", "#6b1414");
    expect(avaliacao.variacao).toBe("CLARO");
    expect(avaliacao.destacada).toBe(true);
    expect(avaliacao.legivel).toBe(true);
  });

  it("o automático sempre se destaca da capa", () => {
    for (const capa of [
      "#000000",
      "#ffffff",
      "#ff0000",
      "#7a1010",
      "#808080",
      "#777777",
      "#b7ff00",
      "#1e40af",
    ]) {
      const avaliacao = avaliarSelo("AUTOMATICO", capa);
      expect(avaliacao.legivel).toBe(true);
      expect(avaliacao.contrasteComOFundo ?? 0).toBeGreaterThanOrEqual(
        CONTRASTE_MINIMO_GRAFICO,
      );
    }
  });

  it("o manual vale mesmo quando a pílula some na capa, e a avaliação avisa", () => {
    const escura = avaliarSelo("ESCURO", "#1a0a0a");
    expect(escura.variacao).toBe("ESCURO");
    expect(escura.legivel).toBe(true);
    expect(escura.destacada).toBe(false);
    expect(avaliarSelo("CLARO", "#fafafa").destacada).toBe(false);
  });

  it("sem cor conhecida, não há o que avisar", () => {
    const avaliacao = avaliarSelo("CLARO", null);
    expect(avaliacao.contrasteComOFundo).toBeNull();
    expect(avaliacao.destacada).toBe(true);
  });
});

describe("cor média da imagem", () => {
  it("faz a média dos pixels pesada pela opacidade", () => {
    const pixels = [255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 0];
    expect(corMedia(pixels)).toBe("#800080");
  });

  it("sem pixel visível, nulo", () => {
    expect(corMedia([10, 10, 10, 0])).toBeNull();
    expect(corMedia([])).toBeNull();
  });
});
