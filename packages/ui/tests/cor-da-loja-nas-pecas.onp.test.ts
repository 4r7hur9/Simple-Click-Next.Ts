import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONTRASTE_MINIMO_GRAFICO,
  CONTRASTE_MINIMO_TEXTO,
  ajustarParaContrasteContraTodos,
  relacaoDeContraste,
} from "../src/contraste";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import * as ui from "../src/index";
import { TemaDaMarca } from "../src/tema-da-marca";
import {
  COR_DE_FUNDO_DA_LOJA,
  PALETAS,
  type NomeDoTema,
} from "../src/tokens";

/**
 * Nenhuma peça usa cor de loja (card #127): tudo pinta com o verde oficial
 * SimpleClick, com texto escuro sobre ele; o anel de foco é visto sobre o fundo
 * e sobre as superfícies.
 */

const CSS = readFileSync(
  fileURLToPath(new URL("../styles/componentes.css", import.meta.url)),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

const TEMAS: readonly NomeDoTema[] = ["claro", "escuro"];

function fundosDoFoco(tema: NomeDoTema): string[] {
  const p = PALETAS[tema];
  const base = [p.fundo, p.superficie, p.superficieAlta];
  return tema === "escuro" ? [...base, COR_DE_FUNDO_DA_LOJA] : base;
}

const THEME = readFileSync(
  fileURLToPath(new URL("../styles/theme.css", import.meta.url)),
  "utf8",
);

describe("nenhuma peça usa cor de loja", () => {
  it("[CA-15] @spec:AC-10415 componentes.css não lê --cor-marca, --cor-sobre-marca nem --cor-marca-texto", () => {
    expect(CSS).not.toMatch(/var\(--cor-marca(-texto)?\)/);
    expect(CSS).not.toMatch(/var\(--cor-sobre-marca\)/);
  });

  it("[CA-15] @spec:AC-10415 não existe mais marcaDaLoja, e o TemaDaMarca não injeta cor nenhuma", () => {
    expect((ui as Record<string, unknown>)["marcaDaLoja"]).toBeUndefined();
    const html = renderToStaticMarkup(
      createElement(TemaDaMarca, null, createElement("p", null, "oi")),
    );
    expect(html).not.toMatch(/style=|--cor-/);
  });

  it("[CA-15] @spec:AC-10415 o verde oficial é o único destaque: --cor-primaria #b7ff00 com texto escuro sobre ele", () => {
    expect(THEME).toMatch(/--cor-primaria:\s*#b7ff00/);
    expect(THEME).toMatch(/--cor-marca:\s*var\(--marca-verde-click\)/);
    expect(
      relacaoDeContraste("#0b0f0d", "#b7ff00"),
    ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
  });

  it("[CA-15] @spec:AC-10415 chip ativo, aba ativa, botão principal e anel de foco leem os tokens do SimpleClick", () => {
    const regra = (seletor: string): string =>
      CSS.match(
        new RegExp(
          `${seletor.replace(/[.[\]"=()-]/g, "\\$&")}[^{]*\\{([^}]*)\\}`,
        ),
      )?.[1] ?? "";

    expect(regra(".sc-chip--ativo")).toMatch(/var\(--cor-primaria\)/);
    expect(regra(".sc-chip--ativo")).toMatch(/var\(--cor-em-primaria\)/);
    expect(regra('.sc-abas__aba[aria-selected="true"]')).toMatch(
      /var\(--cor-primaria-texto\)/,
    );
    expect(regra(".sc-botao--primaria")).toMatch(/var\(--cor-primaria\)/);
    expect(CSS).toMatch(/outline:\s*2px solid var\(--cor-foco\)/);
  });
});

describe("o foco é sempre visível", () => {
  it("[CA-17] @spec:AC-10417 o anel do tema também passa de 3:1 sobre todos os fundos", () => {
    for (const tema of TEMAS) {
      for (const fundo of fundosDoFoco(tema)) {
        expect(
          relacaoDeContraste(PALETAS[tema].foco, fundo),
          `${tema} sobre ${fundo}`,
        ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_GRAFICO);
      }
    }
  });

  it("[CA-17] @spec:AC-10417 toda regra de foco visível desenha anel com a cor de foco e nenhuma apaga o contorno", () => {
    const regras = [
      ...CSS.matchAll(/([^{}]*:focus-visible[^{}]*)\{([^}]*)\}/g),
    ];
    expect(regras.length).toBeGreaterThan(5);
    for (const [, seletor, corpo] of regras) {
      expect(corpo, `regra ${seletor?.trim()}`).not.toMatch(
        /outline:\s*(none|0)\b/,
      );
      if (corpo?.includes("outline")) {
        expect(corpo, `regra ${seletor?.trim()}`).toMatch(/var\(--cor-foco\)/);
      }
    }
  });
});

describe("ajuste contra vários fundos", () => {
  it("[CA-17] @spec:AC-10417 devolve uma cor que passa em todos os fundos, mesmo quando ajustar um só desfaria o outro", () => {
    const fundos = ["#0b0f0d", "#161c19", "#1f2722", "#000000"];
    const ajuste = ajustarParaContrasteContraTodos("#1b3a6b", fundos, 3);
    for (const fundo of fundos) {
      expect(relacaoDeContraste(ajuste.cor, fundo)).toBeGreaterThanOrEqual(3);
    }
    expect(ajuste.ajustada).toBe(true);
    expect(ajuste.relacao).toBeGreaterThanOrEqual(3);
  });

  it("[CA-17] @spec:AC-10417 não mexe numa cor que já serve, e recusa lista vazia", () => {
    const ajuste = ajustarParaContrasteContraTodos(
      "#b7ff00",
      ["#0b0f0d", "#000000"],
      3,
    );
    expect(ajuste.cor).toBe("#b7ff00");
    expect(ajuste.ajustada).toBe(false);
    expect(() => ajustarParaContrasteContraTodos("#b7ff00", [], 3)).toThrow();
  });
});
