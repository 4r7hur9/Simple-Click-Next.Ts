import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONTRASTE_MINIMO_GRAFICO,
  CONTRASTE_MINIMO_TEXTO,
  relacaoDeContraste,
} from "../src/contraste";
import {
  NOME_NO_CSS_DA_ADMINISTRACAO,
  PALETAS,
  PALETAS_DA_ADMINISTRACAO,
  type PaletaDaAdministracao,
} from "../src/tokens";
import { lerArquivo, lerFolha, regrasDe } from "./apoio-css";

/**
 * O modo administração no design system (card #170, CA-13): tokens espelhados,
 * contraste AA nos dois temas, CSS sem cor literal e sem tocar o vidro.
 */

const url = (nome: string): URL =>
  new URL(`../styles/${nome}`, import.meta.url);
const bruto = (nome: string): string =>
  readFileSync(fileURLToPath(url(nome)), "utf8");

const THEME = bruto("theme.css");
const CSS_ADMIN = lerArquivo(url("administracao-da-plataforma.css"));

/** Valores `--admin-*` do primeiro bloco que abre com `seletor`. */
function tokensDoBloco(seletor: string): Map<string, string> {
  const inicio = THEME.indexOf(seletor);
  if (inicio === -1) throw new Error(`bloco "${seletor}" não existe`);
  const abertura = THEME.indexOf("{", inicio);
  const corpo = THEME.slice(abertura + 1, THEME.indexOf("\n}", abertura));
  const mapa = new Map<string, string>();
  for (const linha of corpo.split(";")) {
    const i = linha.indexOf(":");
    if (i === -1) continue;
    const nome = linha.slice(0, i).trim().split("\n").pop()!.trim();
    if (nome.startsWith("--admin-")) mapa.set(nome, linha.slice(i + 1).trim());
  }
  return mapa;
}

const BLOCOS = {
  claro: [":root {", '[data-tema="claro"] {'],
  escuro: [
    '[data-tema="escuro"],\n:root[data-tema="escuro"] {',
    "  :root:not([data-tema=\"claro\"]) {",
  ],
} as const;

describe("tokens --admin-* espelhados", () => {
  for (const tema of ["claro", "escuro"] as const) {
    for (const bloco of BLOCOS[tema]) {
      it(`[CA-13] o bloco ${JSON.stringify(bloco.trim())} repete o tema ${tema} do espelho em TypeScript`, () => {
        const noCss = tokensDoBloco(bloco);
        for (const [chave, nome] of Object.entries(
          NOME_NO_CSS_DA_ADMINISTRACAO,
        )) {
          expect(noCss.get(nome), `${nome} falta em ${bloco}`).toBe(
            PALETAS_DA_ADMINISTRACAO[tema][chave as keyof PaletaDaAdministracao],
          );
        }
      });
    }
  }
});

describe("contraste AA da administração", () => {
  for (const tema of ["claro", "escuro"] as const) {
    const a = PALETAS_DA_ADMINISTRACAO[tema];
    const pagina = PALETAS[tema].fundo;
    const textos: [string, string, string][] = [
      ["tinta do menu", a.menuTinta, a.menuFundo],
      ["tinta suave do menu", a.menuTintaSuave, a.menuFundo],
      ["item ativo", a.menuAtivoTinta, a.menuAtivoFundo],
      ["selo", a.seloTinta, a.seloFundo],
    ];
    const naoTextos: [string, string, string][] = [
      ["borda do menu", a.menuBorda, a.menuFundo],
      ["faixa sobre a página", a.faixa, pagina],
    ];
    for (const [nome, frente, fundo] of textos) {
      it(`[CA-13] ${nome} no tema ${tema} passa de 4,5:1`, () => {
        expect(relacaoDeContraste(frente, fundo)).toBeGreaterThanOrEqual(
          CONTRASTE_MINIMO_TEXTO,
        );
      });
    }
    for (const [nome, frente, fundo] of naoTextos) {
      it(`[CA-13] ${nome} no tema ${tema} passa de 3:1`, () => {
        expect(relacaoDeContraste(frente, fundo)).toBeGreaterThanOrEqual(
          CONTRASTE_MINIMO_GRAFICO,
        );
      });
    }
  }
});

describe("a folha do modo administração", () => {
  it("[CA-13] não escreve cor literal: só var(--…)", () => {
    expect(CSS_ADMIN).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CSS_ADMIN).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch|oklab)\(/);
  });

  it("[CA-13] não usa blur nem filtro de fundo", () => {
    expect(CSS_ADMIN).not.toMatch(/backdrop-filter|blur\(/);
  });

  it("[CA-13] é importada por theme.css e não existe admin.css", () => {
    expect(THEME).toContain('@import "./administracao-da-plataforma.css"');
    expect(() => bruto("admin.css")).toThrow();
  });

  it("[CA-13] declara as três classes do contrato", () => {
    const folha = lerFolha(CSS_ADMIN);
    for (const seletor of [
      ".sc-moldura-admin",
      ".sc-menu--administracao[data-tema]",
      ".sc-cabecalho-admin",
    ]) {
      expect(regrasDe(folha, seletor).length, seletor).toBeGreaterThan(0);
    }
  });

  it("[CA-13] o seletor composto vence [data-tema=…] por especificidade", () => {
    const folha = lerFolha(CSS_ADMIN);
    const regra = regrasDe(folha, ".sc-menu--administracao[data-tema]")[0]!;
    const peso = (seletor: string): number =>
      (seletor.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length;
    // `[data-tema="escuro"]` vale (0,1,0); o composto vale (0,2,0).
    expect(peso(".sc-menu--administracao[data-tema]")).toBeGreaterThan(
      peso('[data-tema="escuro"]'),
    );
    expect(regra.declaracoes.get("background-color")).toBe(
      "var(--admin-menu-fundo)",
    );
    expect(regra.contexto).toEqual([]);
  });

  it("[CA-13] nenhum host do vidro.css declara background, box-shadow ou backdrop-filter", () => {
    const hosts = [
      ".sc-acesso-janela",
      ".sc-sobre-janela",
      ".sc-cookies",
      ".sc-sacola-barra",
      ".sc-janela-pedido",
      ".sc-painel",
      ".sc-aviso-rapido__texto",
      ".sc-janela-produto",
      ".sc-menu__painel",
    ];
    const folha = lerFolha(CSS_ADMIN);
    for (const host of hosts) {
      for (const regra of regrasDe(folha, host)) {
        for (const prop of [
          "background",
          "background-color",
          "background-image",
          "box-shadow",
          "backdrop-filter",
          "-webkit-backdrop-filter",
        ]) {
          expect(regra.declaracoes.has(prop), `${host} ${prop}`).toBe(false);
        }
      }
    }
  });
});
