import { describe, expect, it } from "vitest";

import {
  CATALOGO_DE_FUNCIONALIDADES,
  CHAVES_DE_FUNCIONALIDADE,
  ehChaveDeFuncionalidade,
  funcionalidadeLigada,
  funcionalidadesDaLoja,
} from "./funcionalidades.ts";

describe("funcionalidades por loja", () => {
  it("@spec:AC-213 sem exceção gravada, todas nascem ligadas e sem limite", () => {
    const daLoja = funcionalidadesDaLoja([]);

    expect(daLoja.map((item) => item.chave)).toEqual([
      ...CHAVES_DE_FUNCIONALIDADE,
    ]);
    for (const item of daLoja) {
      expect(item.ligada).toBe(true);
      expect(item.limite).toBeNull();
      expect(item.porExcecao).toBe(false);
    }
    for (const chave of CHAVES_DE_FUNCIONALIDADE) {
      expect(funcionalidadeLigada(chave, [])).toBe(true);
    }
  });

  it("@spec:AC-212 a exceção desliga só a funcionalidade dela", () => {
    const excecoes = [{ chave: "auto_print", ligada: false, limite: null }];

    expect(funcionalidadeLigada("auto_print", excecoes)).toBe(false);
    expect(funcionalidadeLigada("custom_domain", excecoes)).toBe(true);

    const impressao = funcionalidadesDaLoja(excecoes).find(
      (item) => item.chave === "auto_print",
    );
    expect(impressao).toMatchObject({ ligada: false, porExcecao: true });
  });

  it("@spec:AC-212 exceção de chave fora do catálogo não liga nem desliga nada", () => {
    const daLoja = funcionalidadesDaLoja([
      { chave: "inexistente", ligada: false, limite: 3 },
    ]);

    expect(daLoja.every((item) => item.ligada && !item.porExcecao)).toBe(true);
    expect(ehChaveDeFuncionalidade("inexistente")).toBe(false);
    expect(ehChaveDeFuncionalidade("auto_print")).toBe(true);
  });

  it("@spec:AC-212 só a impressão térmica tem efeito hoje", () => {
    expect(
      CATALOGO_DE_FUNCIONALIDADES.filter((item) => item.temEfeito).map(
        (item) => item.chave,
      ),
    ).toEqual(["auto_print"]);
  });
});
