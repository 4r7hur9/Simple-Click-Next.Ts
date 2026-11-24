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

/** Mistura `frente` (com `opacidade`) sobre `atras`, em #rrggbb. */
function misturar(frente: string, atras: string, opacidade: number): string {
  const canal = (hex: string, i: number): number =>
    Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const cor = [0, 1, 2].map((i) =>
    Math.round(canal(frente, i) * opacidade + canal(atras, i) * (1 - opacidade))
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${cor.join("")}`;
}

const BLOCOS = {
  claro: [":root {", '[data-tema="claro"] {'],
  escuro: [
    '[data-tema="escuro"],\n:root[data-tema="escuro"] {',
    '  :root:not([data-tema="claro"]) {',
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
            PALETAS_DA_ADMINISTRACAO[tema][
              chave as keyof PaletaDaAdministracao
            ],
          );
        }
      });
    }
  }
});

describe("contraste AA da administração", () => {
  for (const tema of ["claro", "escuro"] as const) {
    const a = PALETAS_DA_ADMINISTRACAO[tema];
    const pagina = PALETAS[tema];
    // O vidro é translúcido: o pior caso é o menu sobre o fundo mais
    // contrário ao texto (branco puro sob o vidro escuro, preto puro sob o
    // claro). O desfoque só aproxima o que está atrás de uma média.
    const piorAtras = tema === "escuro" ? "#ffffff" : "#000000";
    const vidro = misturar(
      a.menuFundo,
      piorAtras,
      Number.parseInt(a.menuOpacidade, 10) / 100,
    );
    // Para o que não é texto vale o fundo real atrás do menu: a página.
    const vidroSobrePagina = misturar(
      a.menuFundo,
      pagina.fundo,
      Number.parseInt(a.menuOpacidade, 10) / 100,
    );
    const textos: [string, string, string][] = [
      ["tinta do menu sobre o vidro", a.menuTinta, vidro],
      ["tinta suave do menu sobre o vidro", a.menuTintaSuave, vidro],
      ["tinta do menu no fallback sólido", a.menuTinta, a.menuFundo],
      ["tinta suave no fallback sólido", a.menuTintaSuave, a.menuFundo],
      ["tinta do menu sobre o hover", a.menuTinta, a.menuHoverFundo],
      ["tinta suave sobre o hover", a.menuTintaSuave, a.menuHoverFundo],
      ["item ativo", a.menuAtivoTinta, a.menuAtivoFundo],
      ["selo", a.seloTinta, a.seloFundo],
    ];
    const naoTextos: [string, string, string][] = [
      ["item ativo contra o vidro", a.menuAtivoFundo, vidroSobrePagina],
      ["foco da página sobre o vidro", pagina.foco, vidroSobrePagina],
      ["selo contra o vidro", a.seloFundo, vidroSobrePagina],
    ];
    for (const [nome, frente, fundo] of textos) {
      it(`[CA-23] ${nome} no tema ${tema} passa de 4,5:1`, () => {
        expect(relacaoDeContraste(frente, fundo)).toBeGreaterThanOrEqual(
          CONTRASTE_MINIMO_TEXTO,
        );
      });
    }
    for (const [nome, frente, fundo] of naoTextos) {
      it(`[CA-23] ${nome} no tema ${tema} passa de 3:1`, () => {
        expect(relacaoDeContraste(frente, fundo)).toBeGreaterThanOrEqual(
          CONTRASTE_MINIMO_GRAFICO,
        );
      });
    }
  }

  it("[CA-23] o menu do admin é vidro (opacidade < 100%), o do painel é sólido", () => {
    for (const tema of ["claro", "escuro"] as const) {
      expect(
        Number.parseInt(PALETAS_DA_ADMINISTRACAO[tema].menuOpacidade, 10),
      ).toBeLessThan(100);
    }
  });

  it("[CA-23] nada de verde chapado no fundo do menu: o verde da marca só no ativo e no selo", () => {
    for (const tema of ["claro", "escuro"] as const) {
      const a = PALETAS_DA_ADMINISTRACAO[tema];
      for (const fundo of [a.menuFundo, a.menuHoverFundo]) {
        const [r, g, b] = [1, 3, 5].map((i) =>
          Number.parseInt(fundo.slice(i, i + 2), 16),
        );
        // Neutro: o canal verde não se destaca dos outros além de 12 níveis.
        expect(g! - Math.max(r!, b!)).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe("a folha do modo administração", () => {
  it("[CA-24] não escreve cor literal: só var(--…)", () => {
    expect(CSS_ADMIN).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CSS_ADMIN).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch|oklab)\(/);
  });

  it("[CA-24] o vidro do menu reusa o filtro do vidro.css, sem blur próprio", () => {
    expect(CSS_ADMIN).not.toMatch(/blur\((?!1px)/);
    expect(CSS_ADMIN).toContain("var(--vidro-filtro-medio)");
    expect(CSS_ADMIN).toMatch(/backdrop-filter: var\(--adm-filtro\)/);
  });

  it("[CA-24] tem fallback sólido sem backdrop-filter e com menos transparência ou mais contraste", () => {
    expect(CSS_ADMIN).toMatch(/@supports not \(\s*\(backdrop-filter/);
    expect(CSS_ADMIN).toContain("prefers-reduced-transparency: reduce");
    expect(CSS_ADMIN).toContain("prefers-contrast: more");
    expect(CSS_ADMIN).toContain("--adm-opacidade: 100%");
  });

  it("[CA-13] é importada por theme.css e não existe admin.css", () => {
    expect(THEME).toContain('@import "./administracao-da-plataforma.css"');
    expect(() => bruto("admin.css")).toThrow();
  });

  it("[CA-24] declara as classes do contrato", () => {
    const folha = lerFolha(CSS_ADMIN);
    for (const seletor of [".sc-moldura-admin", ".sc-menu--administracao"]) {
      expect(regrasDe(folha, seletor).length, seletor).toBeGreaterThan(0);
    }
  });

  it("[CA-24] o menu do admin não depende de [data-tema] e redefine os tokens do menu a partir de --admin-*", () => {
    const folha = lerFolha(CSS_ADMIN);
    expect(regrasDe(folha, ".sc-menu--administracao[data-tema]")).toHaveLength(
      0,
    );
    const regra = regrasDe(folha, ".sc-menu--administracao")[0]!;
    const esperado: Record<string, string> = {
      "--cor-superficie": "var(--admin-menu-fundo)",
      "--cor-superficie-alta": "var(--admin-menu-hover-fundo)",
      "--cor-tinta": "var(--admin-menu-tinta)",
      "--cor-tinta-suave": "var(--admin-menu-tinta-suave)",
      "--cor-borda": "var(--admin-menu-borda)",
    };
    for (const [prop, valor] of Object.entries(esperado)) {
      expect(regra.declaracoes.get(prop), prop).toBe(valor);
    }
    expect(regra.declaracoes.get("background-color")).toContain(
      "var(--admin-menu-fundo)",
    );
    expect(regra.declaracoes.get("backdrop-filter")).toBe("var(--adm-filtro)");
    expect(regra.contexto).toEqual([]);
    // O item da página atual ganha o fundo próprio sem redefinir --cor-primaria.
    const ativo = regrasDe(
      folha,
      '.sc-menu--administracao [aria-current="page"]',
    )[0]!;
    expect(ativo.declaracoes.get("background-color")).toBe(
      "var(--admin-menu-ativo-fundo)",
    );
    expect(ativo.declaracoes.get("color")).toBe(
      "var(--admin-menu-ativo-tinta)",
    );
    expect(CSS_ADMIN).not.toMatch(/--cor-(em-)?primaria\s*:/);
  });

  it("[CA-22] não há faixa no topo: sem borda superior, sem --admin-faixa, sem cabeçalho", () => {
    expect(CSS_ADMIN).not.toContain("admin-faixa");
    expect(CSS_ADMIN).not.toContain("border-top");
    expect(CSS_ADMIN).not.toContain("sc-cabecalho-admin");
    expect(THEME).not.toContain("--admin-faixa");
    expect(THEME).not.toContain("--admin-cabecalho");
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
