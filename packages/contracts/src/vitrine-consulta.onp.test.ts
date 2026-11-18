/**
 * Card #108 · T-10808a — o que a consulta do catálogo público aceita: o filtro
 * "em estoque", a faixa de preço (centavos, só dígitos) e as duas ordens novas.
 *
 * O esquema é ESTRITO (parâmetro desconhecido é 400) e entra no documento
 * OpenAPI, então: nada de `transform`, e o produto na vitrine não muda (a TV e o
 * feed leem esse objeto).
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  MAXIMO_DE_CARACTERES_DO_FILTRO,
  MAXIMO_DE_FILTROS_NA_CONSULTA,
  TETO_DO_PRECO_DO_FILTRO_EM_CENTAVOS,
  esquemaDaBuscaDoCatalogo,
  esquemaDaConsultaDaPagina,
  esquemaDaConsultaDoResumo,
  esquemaDaOrdemDoCatalogo,
  estoqueLigado,
} from "./index.ts";
import { esquemaDeProdutoNaVitrine } from "./vitrine.ts";

const aceita = (consulta: unknown) =>
  esquemaDaBuscaDoCatalogo.safeParse(consulta).success;

describe("estoque e faixa de preço na consulta", () => {
  it("[CA-8] @spec:AC-10816 aceita estoque e a faixa de preço, em centavos e como texto", () => {
    expect(aceita({ estoque: "1", precoMin: "1050", precoMax: "9999" })).toBe(
      true,
    );
    expect(aceita({ estoque: "true" })).toBe(true);
    expect(
      aceita({ precoMax: String(TETO_DO_PRECO_DO_FILTRO_EM_CENTAVOS) }),
    ).toBe(true);
    expect(aceita({ precoMin: "0" })).toBe(true);
    // Os campos são opcionais: a consulta de hoje continua valendo.
    expect(aceita({})).toBe(true);
    expect(
      aceita({ busca: "pastel", categoria: "salgados", atacado: "1" }),
    ).toBe(true);
  });

  it("[CA-8] @spec:AC-10816 recusa preço vazio, negativo, decimal, científico, hexadecimal, com espaço ou acima do teto", () => {
    for (const ruim of [
      "",
      "-1",
      "10.5",
      "10,5",
      "1e3",
      "0x10",
      " 12",
      "12 ",
      "abc",
      "100000001", // um centavo acima do teto
      "123456789", // nove dígitos
      "+5",
    ]) {
      expect(
        aceita({ precoMin: ruim }),
        `precoMin=${JSON.stringify(ruim)}`,
      ).toBe(false);
      expect(
        aceita({ precoMax: ruim }),
        `precoMax=${JSON.stringify(ruim)}`,
      ).toBe(false);
    }
  });

  it("[CA-8] @spec:AC-10816 recusa estoque fora de 1, true, 0 e false", () => {
    expect(aceita({ estoque: "sim" })).toBe(false);
    expect(aceita({ estoque: "" })).toBe(false);
  });

  it("[CA-8] @spec:AC-10816 o helper estoqueLigado só liga com 1 ou true", () => {
    expect(estoqueLigado("1")).toBe(true);
    expect(estoqueLigado("true")).toBe(true);
    expect(estoqueLigado("0")).toBe(false);
    expect(estoqueLigado("false")).toBe(false);
    expect(estoqueLigado(undefined)).toBe(false);
  });

  it("[CA-8] @spec:AC-10816 parâmetro desconhecido continua sendo recusado", () => {
    expect(aceita({ preco: "10" })).toBe(false);
    expect(aceita({ emEstoque: "1" })).toBe(false);
  });
});

describe("o limite dos filtros de especificação", () => {
  it("[CA-8] @spec:AC-10816 aceita até 20 filtros de até 120 caracteres", () => {
    const vinte = Array.from(
      { length: MAXIMO_DE_FILTROS_NA_CONSULTA },
      (_, i) => `k${i}=v`,
    );
    expect(aceita({ filtro: vinte })).toBe(true);
    expect(aceita({ filtro: "tamanho=M" })).toBe(true);
    expect(aceita({ filtro: "x".repeat(MAXIMO_DE_CARACTERES_DO_FILTRO) })).toBe(
      true,
    );
  });

  it("[CA-8] @spec:AC-10816 recusa o 21º filtro e o filtro com mais de 120 caracteres", () => {
    const vinteEUm = Array.from(
      { length: MAXIMO_DE_FILTROS_NA_CONSULTA + 1 },
      (_, i) => `k${i}=v`,
    );
    expect(aceita({ filtro: vinteEUm })).toBe(false);
    expect(
      aceita({ filtro: "x".repeat(MAXIMO_DE_CARACTERES_DO_FILTRO + 1) }),
    ).toBe(false);
    expect(
      aceita({
        filtro: ["ok", "x".repeat(MAXIMO_DE_CARACTERES_DO_FILTRO + 1)],
      }),
    ).toBe(false);
  });
});

describe("as ordens do catálogo", () => {
  it("[CA-8] @spec:AC-10816 aceita as quatro de hoje e as duas novas, e recusa o resto", () => {
    for (const ordem of [
      "relevancia",
      "menor-preco",
      "maior-preco",
      "a-z",
      "maior-desconto-atacado",
      "lancamentos",
    ]) {
      expect(esquemaDaOrdemDoCatalogo.safeParse(ordem).success, ordem).toBe(
        true,
      );
      expect(
        esquemaDaConsultaDaPagina.safeParse({ ordem }).success,
        ordem,
      ).toBe(true);
    }
    expect(esquemaDaOrdemDoCatalogo.safeParse("aleatoria").success).toBe(false);
    expect(
      esquemaDaConsultaDaPagina.safeParse({ ordem: "aleatoria" }).success,
    ).toBe(false);
  });

  it("[CA-8] @spec:AC-10816 o resumo e a página herdam os filtros novos", () => {
    const filtros = { estoque: "1", precoMin: "100", precoMax: "500" };
    expect(
      esquemaDaConsultaDoResumo.safeParse({ ...filtros, porSecao: "24" })
        .success,
    ).toBe(true);
    expect(
      esquemaDaConsultaDaPagina.safeParse({ ...filtros, limite: "48" }).success,
    ).toBe(true);
    // A ordem é da página: o resumo não a aceita.
    expect(
      esquemaDaConsultaDoResumo.safeParse({ ordem: "lancamentos" }).success,
    ).toBe(false);
  });
});

describe("o que não pode mudar", () => {
  it("[CA-8] @spec:AC-10816 o esquema da consulta sai no OpenAPI (sem transform) com os preços como texto", () => {
    const documento = z.toJSONSchema(esquemaDaBuscaDoCatalogo, {
      io: "output",
    }) as {
      properties: Record<string, { type?: string; pattern?: string }>;
    };
    expect(documento.properties["precoMin"]?.type).toBe("string");
    expect(documento.properties["precoMax"]?.pattern).toContain("100000000");
    expect(documento.properties["estoque"]).toBeDefined();
  });

  it("[CA-8] @spec:AC-10816 o produto na vitrine não ganhou campo nenhum (TV e feed leem esse objeto)", () => {
    expect(Object.keys(esquemaDeProdutoNaVitrine.shape).sort()).toEqual(
      [
        "apelido",
        "atacado",
        "chamada",
        "destaque",
        "disponivel",
        "id",
        "imagem",
        "motivoIndisponivel",
        "nome",
        "precoAnteriorCentavos",
        "precoCentavos",
      ].sort(),
    );
  });
});
