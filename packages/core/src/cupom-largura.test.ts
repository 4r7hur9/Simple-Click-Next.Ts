import { describe, expect, it } from "vitest";

import {
  AREA_IMPRESSA_EM_MM,
  alinharNaLinha,
  byteNaTabela,
  caractereDoByte,
  colunasDoPapel,
  juntarNaLinha,
  larguraNoPapel,
  normalizarParaImpressao,
  quebrarEmLinhas,
} from "./cupom-largura.ts";

/** Caractere por ponto de código — sem depender de como o editor grava. */
const cp = (ponto: number) => String.fromCodePoint(ponto);

describe("papel e colunas (AC-618)", () => {
  it("@spec:AC-618 papel de 58 mm tem 32 colunas e o de 80 mm tem 48", () => {
    expect(colunasDoPapel(58)).toBe(32);
    expect(colunasDoPapel(80)).toBe(48);
    // As duas larguras usam a mesma letra (12 pontos a 203 dpi = 1,5 mm):
    // muda o número de colunas, não o tamanho do que se lê.
    expect(AREA_IMPRESSA_EM_MM[58] / colunasDoPapel(58)).toBe(1.5);
    expect(AREA_IMPRESSA_EM_MM[80] / colunasDoPapel(80)).toBe(1.5);
  });

  it("@spec:AC-618 o valor encosta na última coluna, em qualquer largura", () => {
    for (const largura of [32, 48]) {
      const linha = juntarNaLinha("Subtotal", "R$ 66,50", largura);
      expect(larguraNoPapel(linha)).toBe(largura);
      expect(linha.endsWith("R$ 66,50")).toBe(true);
    }
    expect(() => juntarNaLinha("x".repeat(30), "R$ 66,50", 32)).toThrow(
      RangeError,
    );
  });

  it("@spec:AC-618 nenhuma linha quebrada passa da largura, e palavra que cabe não é partida", () => {
    const texto =
      "Tocar a campainha do portão azul, o interfone está quebrado desde ontem";
    const linhas = quebrarEmLinhas(texto, 32);
    for (const linha of linhas)
      expect(larguraNoPapel(linha)).toBeLessThanOrEqual(32);
    expect(linhas.join(" ")).toBe(texto);
    expect(linhas).toEqual([
      "Tocar a campainha do portão",
      "azul, o interfone está quebrado",
      "desde ontem",
    ]);
  });

  it("@spec:AC-618 a primeira linha pode ser mais curta, para dar lugar ao valor", () => {
    expect(quebrarEmLinhas("Guaraná Antarctica lata gelado", 18, 30)).toEqual([
      "Guaraná Antarctica",
      "lata gelado",
    ]);
  });

  it("@spec:AC-618 palavra maior que a linha é partida em vez de sumir", () => {
    expect(quebrarEmLinhas("rastreio ABCDEFGHIJKLMNOPQRSTUVWXYZ", 10)).toEqual([
      "rastreio",
      "ABCDEFGHIJ",
      "KLMNOPQRST",
      "UVWXYZ",
    ]);
  });

  it("@spec:AC-618 o símbolo da moeda nunca fica numa linha e o valor na outra", () => {
    const linhas = quebrarEmLinhas("+ Adicionais: Paçoca x2 (+R$ 4,00)", 29);
    expect(linhas).toEqual(["+ Adicionais: Paçoca x2", "(+R$ 4,00)"]);
  });

  it("alinha à direita e ao centro só com espaço à esquerda", () => {
    expect(alinharNaLinha("TOTAL", 11, "direita")).toBe("      TOTAL");
    expect(alinharNaLinha("TOTAL", 11, "centro")).toBe("   TOTAL");
    expect(alinharNaLinha("TOTAL", 11, "esquerda")).toBe("TOTAL");
  });
});

describe("texto normalizado antes de medir (AC-618, AC-620)", () => {
  it("@spec:AC-620 acento e cedilha decompostos viram UMA letra, que ocupa UMA coluna", () => {
    // O navegador pode entregar "ç" como "c" + cedilha solta. Contado cru, o
    // nome ocuparia mais colunas do que ocupa no papel e desalinharia o valor.
    const decomposto = "Açaí com granola".normalize("NFD");
    expect(decomposto.length).toBeGreaterThan("Açaí com granola".length);

    const normalizado = normalizarParaImpressao(decomposto);
    expect(normalizado).toBe("Açaí com granola");
    expect(larguraNoPapel(normalizado)).toBe(16);
  });

  it("@spec:AC-620 emoji sai do texto sem deixar símbolo estranho nem buraco duplo", () => {
    const comEmoji = `Açaí ${cp(0x1f367)} com granola ${cp(0x1f60b)}`;
    const normalizado = normalizarParaImpressao(comEmoji);
    expect(normalizado).toBe("Açaí com granola");
    expect(normalizado).not.toContain("?");
  });

  it("@spec:AC-620 aspas curvas, travessão e reticências viram o equivalente que a impressora tem", () => {
    const digitado = `${cp(0x201c)}Sem cebola${cp(0x201d)} ${cp(0x2014)} obrigado${cp(0x2026)}`;
    expect(normalizarParaImpressao(digitado)).toBe(
      '"Sem cebola" - obrigado...',
    );
  });

  it("@spec:AC-620 letra com acento que a tabela não tem perde só o acento", () => {
    // A 860 (português) não tem "ä"; a 850 (multilíngue) tem.
    expect(normalizarParaImpressao("Pão de mäe", "cp860")).toBe("Pão de mae");
    expect(normalizarParaImpressao("Pão de mäe", "cp850")).toBe("Pão de mäe");
  });

  it("nenhum controle chega à impressora — ESC na observação não vira comando", () => {
    const malicioso = `sem sal${cp(0x1b)}@${cp(0x1d)}V${cp(0x00)} por favor${cp(0x7)}`;
    const normalizado = normalizarParaImpressao(malicioso);
    for (const caractere of normalizado) {
      expect(caractere.codePointAt(0)).toBeGreaterThanOrEqual(0x20);
    }
    expect(normalizado).toBe("sem sal@V por favor");
  });

  it("tabulação, quebra de linha e espaço rígido viram espaço comum", () => {
    expect(
      normalizarParaImpressao(
        `Rua A,\t123\r\nfundos${cp(0xa0)}${cp(0xa0)}casa 2`,
      ),
    ).toBe("Rua A, 123 fundos casa 2");
  });

  it("depois de normalizado, todo caractere tem byte na tabela", () => {
    const texto = normalizarParaImpressao(
      `Maçã ${cp(0x2605)} Ñandú, crème brûlée ${cp(0x2014)} 5${cp(0x20ac)}`,
    );
    for (const caractere of texto) {
      expect(byteNaTabela(caractere, "cp860")).toBeDefined();
    }
  });
});

describe("tabela de caracteres da impressora (AC-620)", () => {
  /**
   * Posições da tabela 860 (português), tiradas da definição da IBM e
   * conferidas contra o decodificador `cp860` da biblioteca padrão do Python.
   * Escritas à mão aqui de propósito: se a tabela do código errar uma posição,
   * este teste acusa — ele não usa a tabela do código para se conferir.
   */
  const CP860: readonly (readonly [string, number])[] = [
    ["Ç", 0x80],
    ["é", 0x82],
    ["â", 0x83],
    ["ã", 0x84],
    ["à", 0x85],
    ["Á", 0x86],
    ["ç", 0x87],
    ["ê", 0x88],
    ["Ê", 0x89],
    ["Í", 0x8b],
    ["Ô", 0x8c],
    ["Ã", 0x8e],
    ["Â", 0x8f],
    ["É", 0x90],
    ["À", 0x91],
    ["ô", 0x93],
    ["õ", 0x94],
    ["Ú", 0x96],
    ["Õ", 0x99],
    ["Ó", 0x9f],
    ["á", 0xa0],
    ["í", 0xa1],
    ["ó", 0xa2],
    ["ú", 0xa3],
    ["ª", 0xa6],
    ["º", 0xa7],
    ["°", 0xf8],
  ];

  /** As mesmas letras na 850 (multilíngue), onde várias mudam de lugar. */
  const CP850: readonly (readonly [string, number])[] = [
    ["Ç", 0x80],
    ["é", 0x82],
    ["â", 0x83],
    ["ã", 0xc6],
    ["à", 0x85],
    ["Á", 0xb5],
    ["ç", 0x87],
    ["ê", 0x88],
    ["Ê", 0xd2],
    ["Í", 0xd6],
    ["Ô", 0xe2],
    ["Ã", 0xc7],
    ["Â", 0xb6],
    ["É", 0x90],
    ["À", 0xb7],
    ["ô", 0x93],
    ["õ", 0xe4],
    ["Ú", 0xe9],
    ["Õ", 0xe5],
    ["Ó", 0xe0],
    ["á", 0xa0],
    ["í", 0xa1],
    ["ó", 0xa2],
    ["ú", 0xa3],
    ["ª", 0xa6],
    ["º", 0xa7],
    ["°", 0xf8],
  ];

  it("@spec:AC-620 toda letra acentuada do português tem o byte certo na tabela 860", () => {
    for (const [letra, byte] of CP860) {
      expect(byteNaTabela(letra, "cp860"), letra).toBe(byte);
      expect(caractereDoByte(byte, "cp860")).toBe(letra);
    }
  });

  it("@spec:AC-620 e na tabela 850, onde metade delas está em outra posição", () => {
    for (const [letra, byte] of CP850) {
      expect(byteNaTabela(letra, "cp850"), letra).toBe(byte);
      expect(caractereDoByte(byte, "cp850")).toBe(letra);
    }
  });

  it("ASCII imprimível é o próprio byte; controle não tem lugar na tabela", () => {
    expect(byteNaTabela("A", "cp860")).toBe(0x41);
    expect(byteNaTabela("~", "cp860")).toBe(0x7e);
    expect(byteNaTabela(cp(0x1b), "cp860")).toBeUndefined();
    expect(byteNaTabela(cp(0x1f367), "cp860")).toBeUndefined();
    expect(caractereDoByte(0x1b, "cp860")).toBeUndefined();
  });
});
