import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lerArquivo, lerFolha, regrasDe, valorDe } from "./apoio-css";

/**
 * Encaixe do aviso de cookies (card #171): fixo no pé da tela, acima da área
 * segura, nunca mais largo que a tela, com altura máxima e rolagem interna, e
 * um rodapé que só ganha uma folga fixa (não a altura do aviso) enquanto ele
 * existe. Confere as regras das folhas; a medição no navegador fica no card.
 */

const url = (nome: string): URL => new URL(`../styles/${nome}`, import.meta.url);
const bruto = (nome: string): string => lerArquivo(url(nome));
const legal = () => lerFolha(bruto("legal.css"));
const rodape = () => lerFolha(bruto("landing-rodape.css"));
/** Texto cru do arquivo, com os espaços e quebras de linha normalizados (as `calc()` quebram linha). */
const cru = (nome: string): string =>
  readFileSync(fileURLToPath(url(nome)), "utf8").replace(/\s+/g, " ");

describe("aviso de cookies: posição e área segura", () => {
  it("fica fixo no pé da tela, com a margem ou a área segura do aparelho, a que for maior", () => {
    expect(valorDe(legal(), ".sc-cookies", "position")).toBe("fixed");
    expect(cru("legal.css")).toMatch(
      /inset-block-end: calc\( max\(var\(--espaco-3\), env\(safe-area-inset-bottom\)\) \+ var\(--sc-cookies-sobe, 0px\) \);/,
    );
  });

  it("nos lados, respeita as margens e a área segura (sem largura fixa no celular)", () => {
    expect(valorDe(legal(), ".sc-cookies", "inset-inline")).toBe(
      "max(var(--espaco-3), env(safe-area-inset-left)) max(var(--espaco-3), env(safe-area-inset-right))",
    );
    expect(valorDe(legal(), ".sc-cookies", "inline-size")).toBeUndefined();
  });

  it("a barra de atalhos ou de ação sobe o aviso pela altura dela (regra preservada)", () => {
    expect(cru("legal.css")).toMatch(/--sc-cookies-sobe: var\(--altura-da-barra-inferior\)/);
  });
});

describe("aviso de cookies: largura, altura e quebra", () => {
  it("nunca passa da largura da tela menos as margens", () => {
    expect(valorDe(legal(), ".sc-cookies", "max-inline-size")).toBe(
      "calc(100vw - 2 * var(--espaco-3))",
    );
    expect(valorDe(legal(), ".sc-cookies", "min-inline-size")).toBe("0");
  });

  it("a altura máxima deixa o topo livre e a área segura, com fallback para navegador sem dvh", () => {
    const texto = cru("legal.css");
    expect(texto).toMatch(
      /max-block-size: calc\( 100vh - 8rem - max\(var\(--espaco-3\), env\(safe-area-inset-bottom\)\) - var\(--sc-cookies-sobe, 0px\) \);/,
    );
    expect(texto).toMatch(
      /max-block-size: calc\( 100dvh - 8rem - max\(var\(--espaco-3\), env\(safe-area-inset-bottom\)\) - var\(--sc-cookies-sobe, 0px\) \);/,
    );
  });

  it("quando o conteúdo passa da altura, rola por dentro (e não empurra a página)", () => {
    expect(valorDe(legal(), ".sc-cookies", "overflow-y")).toBe("auto");
    expect(valorDe(legal(), ".sc-cookies", "overflow-x")).toBe("hidden");
    expect(valorDe(legal(), ".sc-cookies", "overscroll-behavior")).toBe("contain");
  });

  it("o texto quebra dentro da janela e o fieldset não guarda largura do conteúdo", () => {
    expect(valorDe(legal(), ".sc-cookies", "overflow-wrap")).toBe("anywhere");
    expect(valorDe(legal(), ".sc-cookies__categorias", "min-inline-size")).toBe("0");
    expect(valorDe(legal(), ".sc-cookies__categoria > span", "min-inline-size")).toBe("0");
  });

  it("no celular, os botões dividem a linha sem estourar (colunas mínimas em 0)", () => {
    expect(cru("legal.css")).toMatch(
      /@media \(max-width: 40rem\) \{.*?\.sc-cookies__acoes \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(valorDe(legal(), ".sc-cookies__botao", "max-inline-size")).toBe("100%");
  });

  it("o aviso continua com z-index abaixo da sacola e da lateral", () => {
    expect(valorDe(legal(), ".sc-cookies", "z-index")).toBe("15");
  });
});

describe("rodapé com o aviso aberto", () => {
  it("ganha só uma folga fixa embaixo, não a altura do aviso", () => {
    expect(regrasDe(rodape(), "body:has(.sc-cookies) .sc-rodape")).toHaveLength(1);
    expect(
      valorDe(rodape(), "body:has(.sc-cookies) .sc-rodape", "padding-block-end"),
    ).toBe("calc(var(--espaco-8) + env(safe-area-inset-bottom))");
  });

  it("não lê mais a altura medida do aviso (que chegava a 455 px com 'Personalizar')", () => {
    expect(bruto("landing-rodape.css")).not.toMatch(/--altura-do-aviso-de-cookies/);
  });
});
