import { describe, expect, it } from "vitest";

import {
  chaveDaEspecificacao,
  colunasDoValor,
  especificacaoDaLinha,
  valorDaLinha,
} from "./especificacoes.routes.ts";
import { validarValorDaEspecificacao } from "./especificacoes.usecase.ts";

/**
 * A tradução entre a linha do banco e o registro do domínio. Se ela perder o
 * tipo, a lista fechada ou a unidade, a regra provada no domínio passa a valer
 * para um registro diferente do que o dono cadastrou.
 */
describe("a linha do banco e o registro tipado (AC-325, AC-327)", () => {
  const linhaDoAro = {
    id: "0f7d8a4e-2f6c-4a57-9a5b-7d1f1a1e2b3c",
    categoryId: "c0a1b2c3-d4e5-4f60-8a9b-0c1d2e3f4a5b",
    key: "aro",
    label: "Aro",
    dataType: "ENUM",
    unit: "pol",
    allowedValues: ["13", "14", "15", "16"],
    isRequired: true,
    isFilterable: true,
    sortOrder: 2,
    deprecatedAt: null,
  };

  it("@spec:AC-325 os quatro tipos do banco viram os quatro tipos do domínio, com unidade, obrigatoriedade e filtro", () => {
    expect(especificacaoDaLinha(linhaDoAro, 3)).toEqual({
      id: linhaDoAro.id,
      categoriaId: linhaDoAro.categoryId,
      nome: "Aro",
      tipo: "lista",
      unidade: "pol",
      obrigatoria: true,
      filtravel: true,
      opcoes: ["13", "14", "15", "16"],
      ordem: 2,
      versao: 3,
      removidaEm: null,
    });
    expect(
      ["TEXT", "NUMBER", "ENUM", "BOOLEAN"].map(
        (dataType) =>
          especificacaoDaLinha({ ...linhaDoAro, dataType, allowedValues: null })
            .tipo,
      ),
    ).toEqual(["texto", "numero", "lista", "booleano"]);
  });

  it("@spec:AC-327 a lista lida do banco continua fechada: 17 é recusado", () => {
    const aro = especificacaoDaLinha(linhaDoAro);
    expect(() => validarValorDaEspecificacao(aro, "17")).toThrow(
      "13, 14, 15, 16",
    );
    expect(validarValorDaEspecificacao(aro, "15")).toBe("15");
  });

  it("@spec:AC-325 cada tipo grava numa coluna só, e volta com o mesmo tipo", () => {
    expect(colunasDoValor("lista", "15")).toEqual({
      valueText: "15",
      valueNum: null,
      valueBool: null,
      valueDate: null,
    });
    expect(colunasDoValor("numero", 195.5)).toMatchObject({
      valueText: null,
      valueNum: 195.5,
    });
    expect(colunasDoValor("booleano", false)).toMatchObject({
      valueText: null,
      valueBool: false,
    });
    expect(
      valorDaLinha({
        definitionId: "d",
        valueText: null,
        valueNum: { toString: () => "195.5" },
        valueBool: null,
        valueDate: null,
      }),
    ).toBe(195.5);
    expect(
      valorDaLinha({
        definitionId: "d",
        valueText: null,
        valueNum: null,
        valueBool: false,
        valueDate: null,
      }),
    ).toBe(false);
  });

  it("@spec:AC-325 a chave do filtro nasce do nome, sem acento nem espaço", () => {
    expect(chaveDaEspecificacao("Índice de carga")).toBe("indice-de-carga");
    expect(chaveDaEspecificacao("  Aro ")).toBe("aro");
    expect(chaveDaEspecificacao("!!!")).toBe("");
  });
});
