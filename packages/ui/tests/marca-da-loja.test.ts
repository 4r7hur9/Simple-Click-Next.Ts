import { describe, expect, it } from "vitest";

import {
  CONTRASTE_MINIMO_GRAFICO,
  CONTRASTE_MINIMO_TEXTO,
  relacaoDeContraste,
} from "../src/contraste";
import { marcaDaLoja } from "../src/marca-da-loja";

/** A cor de destaque da loja sobre o fundo sempre preto. */

describe("marcaDaLoja", () => {
  it("o verde SimpleClick não precisa de conserto nenhum", () => {
    const marca = marcaDaLoja("#b7ff00");
    expect(marca.variaveis["--cor-marca"]).toBe("#b7ff00");
    expect(marca.variaveis["--cor-sobre-marca"]).toBe("#0b0f0d");
    expect(marca.variaveis["--cor-marca-texto"]).toBe("#b7ff00");
    expect(marca.avisos).toEqual([]);
    expect(marca.corSugerida).toBeNull();
  });

  it("escolhe grafite ou branco para a letra sobre a marca, sempre com AA", () => {
    for (const cor of [
      "#b7ff00",
      "#ff3b30",
      "#1a237e",
      "#ffd60a",
      "#7c3aed",
      "#00bcd4",
      "#ffffff",
      "#000000",
    ]) {
      const marca = marcaDaLoja(cor);
      expect(
        relacaoDeContraste(marca.corSobreMarca, marca.cor),
        cor,
      ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
    }
    expect(marcaDaLoja("#1a237e").corSobreMarca).toBe("#ffffff");
    expect(marcaDaLoja("#ffd60a").corSobreMarca).toBe("#0b0f0d");
  });

  it("cor escura demais para o preto: avisa, sugere outra e clareia só o texto", () => {
    const marca = marcaDaLoja("#1a237e");
    expect(marca.variaveis["--cor-marca"]).toBe("#1a237e");
    expect(marca.avisos[0]).toMatch(/escura demais/);
    expect(marca.corSugerida).not.toBeNull();
    expect(
      relacaoDeContraste(marca.corSugerida ?? "", "#000000"),
    ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_GRAFICO);
    expect(
      relacaoDeContraste(marca.variaveis["--cor-marca-texto"] ?? "", "#000000"),
    ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
  });

  it("cor ilegível cai no verde padrão e avisa", () => {
    const marca = marcaDaLoja("banana");
    expect(marca.cor).toBe("#b7ff00");
    expect(marca.corRecusada).toBe(true);
    expect(marca.avisos[0]).toMatch(/não foi reconhecida/);
  });

  it("leva junto as variáveis do tema escuro para os componentes comuns", () => {
    const marca = marcaDaLoja("#ff3b30");
    expect(marca.variaveis["--cor-primaria"]).toBe("#ff3b30");
    expect(marca.variaveis["--cor-em-primaria"]).toBeDefined();
  });
});
