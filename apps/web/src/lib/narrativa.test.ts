// @vitest-environment jsdom
/**
 * Prova da régua da narrativa (P-012).
 *
 * O que está sob prova é o TEMPO, e não o tamanho. Numa tela comprida com duas
 * seções visíveis, a segunda já está na tela desde o começo: com a âncora da
 * janela, ela dispara junto com a primeira, tudo anima de uma vez, e o efeito de
 * revelação some. É o defeito que só aparece em aparelho alto — e por isso passa
 * despercebido em qualquer monitor de programador.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  ancoraDaVaga,
  passoDaSequencia,
  querMovimentoReduzido,
  secoesVisiveis,
} from "./narrativa.ts";

afterEach(() => {
  document.documentElement.style.removeProperty("--secoes-visiveis");
});

/** Simula o que a folha declara naquele ponto de quebra. */
function comSecoesVisiveis(quantas: string) {
  document.documentElement.style.setProperty("--secoes-visiveis", quantas);
}

describe("quantas seções cabem na tela (P-012)", () => {
  it("@principle:P-012 o valor vem da FOLHA, e não é recalculado no script", () => {
    // Recalcular aqui a partir da altura faria a folha e o script discordarem no
    // dia em que alguém mudasse a escada num lugar só.
    comSecoesVisiveis("3");

    expect(secoesVisiveis()).toBe(3);
  });

  it("@principle:P-012 sem valor declarado, cai em uma seção por tela", () => {
    expect(secoesVisiveis()).toBe(1);
  });

  it("@principle:P-012 valor absurdo cai no padrão, em vez de quebrar a narrativa", () => {
    for (const absurdo of ["0", "-2", "99", "muitas", ""]) {
      comSecoesVisiveis(absurdo);
      expect(secoesVisiveis(), `valor: ${absurdo}`).toBe(1);
    }
  });

  it("@principle:P-012 sem documento nenhum, responde sem estourar", () => {
    // Acontece na renderização do servidor, onde não há folha para consultar.
    expect(secoesVisiveis(null)).toBe(1);
  });
});

describe("a âncora acompanha a vaga, e não a janela (P-012)", () => {
  it("@principle:P-012 com uma seção por tela, a âncora é 80% da janela", () => {
    expect(ancoraDaVaga(1)).toBe("top 80%");
  });

  it("@principle:P-012 com duas seções, a âncora é 40% — 80% da VAGA de cada uma", () => {
    // Sem isto, a segunda seção dispara junto com a primeira numa tela alta, e
    // a narrativa se conta sozinha antes de a pessoa chegar nela.
    expect(ancoraDaVaga(2)).toBe("top 40%");
  });

  it("@principle:P-012 com três seções, numa TV em pé, a âncora encolhe de novo", () => {
    expect(ancoraDaVaga(3)).toBe("top 26.7%");
  });

  it("@principle:P-012 a âncora lê a folha quando ninguém informa o número", () => {
    comSecoesVisiveis("2");

    expect(ancoraDaVaga()).toBe("top 40%");
  });
});

describe("o passo da sequência encurta na tela alta (P-012)", () => {
  it("@principle:P-012 mais seções visíveis, passo mais curto", () => {
    // A pessoa percorre a narrativa mais rápido numa tela alta; o passo antigo
    // faria o último cartão aparecer depois de ela já ter rolado adiante.
    expect(passoDaSequencia(6, 1)).toBeCloseTo(0.08, 3);
    expect(passoDaSequencia(6, 2)).toBeCloseTo(0.04, 3);
  });

  it("@principle:P-012 lista longa cabe num tempo que alguém aceita esperar", () => {
    // Doze cartões a 0,08s levariam quase um segundo só para começar o último.
    const passo = passoDaSequencia(30, 1);

    expect(passo * 29).toBeLessThanOrEqual(0.9);
  });

  it("@principle:P-012 lista de um item não tem passo nenhum", () => {
    expect(passoDaSequencia(1)).toBe(0);
  });
});

describe("movimento reduzido (P-012)", () => {
  it("@principle:P-012 responde ao que a pessoa pediu no sistema", () => {
    // A consulta é feita na hora, e não guardada na carga: a pessoa pode mudar a
    // preferência com a página aberta.
    const original = window.matchMedia;
    window.matchMedia = ((consulta: string) => ({
      matches: consulta.includes("reduce"),
      media: consulta,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;

    expect(querMovimentoReduzido()).toBe(true);

    window.matchMedia = original;
  });
});
