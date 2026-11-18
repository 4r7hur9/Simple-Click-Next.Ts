// @vitest-environment jsdom
/**
 * Card #108 · T-10801 — as três zonas, a região da sacola e a reserva de
 * altura. O jsdom não mede largura: aqui se prova a ESTRUTURA do HTML e o que
 * está escrito no bloco novo do `vitrine.css`. Largura real, sticky e CLS são
 * do e2e e do #114.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { renderizarTela } from "./apoio-do-catalogo-na-tela";

const CSS = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../packages/ui/styles/vitrine.css",
  ),
  "utf8",
);

/** Só o bloco do #108: o resto do arquivo tem regras de grade mais antigas. */
const MARCADOR = "/* --- catálogo Stitch (#108)";
const BLOCO = CSS.slice(CSS.indexOf(MARCADOR));

/** O conteúdo de um `@media` do bloco, pelo texto da condição. */
function dentroDaMedia(condicao: string): string {
  const inicio = BLOCO.indexOf(`@media ${condicao}`);
  expect(inicio, `@media ${condicao}`).toBeGreaterThan(-1);
  let profundidade = 0;
  for (let i = BLOCO.indexOf("{", inicio); i < BLOCO.length; i++) {
    if (BLOCO[i] === "{") profundidade += 1;
    if (BLOCO[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return BLOCO.slice(inicio, i + 1);
    }
  }
  return BLOCO.slice(inicio);
}

describe("a estrutura do catálogo", () => {
  it("[CA-1] @spec:AC-10808 tem um só <main>, com a região da sacola vazia no fim", async () => {
    const { documento } = await renderizarTela();
    const principais = documento.querySelectorAll("main");
    expect(principais).toHaveLength(1);

    const main = principais[0]!;
    expect(main.classList.contains("sc-catalogo")).toBe(true);

    const sacola = main.querySelector(":scope > .sc-catalogo__sacola");
    expect(sacola).not.toBeNull();
    expect(sacola?.hasAttribute("data-regiao-da-sacola")).toBe(true);
    // Vazia: é o que deixa o CSS liberar o espaço (`:empty`).
    expect(sacola?.innerHTML).toBe("");
    expect(main.lastElementChild).toBe(sacola);
  });

  it("[CA-1] @spec:AC-10808 a barra é filha direta do main e os produtos ficam num item só", async () => {
    const { documento } = await renderizarTela();
    const main = documento.querySelector("main")!;
    expect(main.querySelector(":scope > .sc-catalogo-barra")).not.toBeNull();

    const produtos = main.querySelectorAll(":scope > .sc-catalogo__produtos");
    expect(produtos).toHaveLength(1);
    expect(produtos[0]?.querySelector(".sc-vitrine__grade")).not.toBeNull();
  });

  it("[CA-1] @spec:AC-10808 os vazios ficam dentro da zona de produtos, e não soltos na grade", async () => {
    const { documento } = await renderizarTela(
      { busca: "zzzz" },
      {
        resumo: {
          versao: "1",
          secoes: [],
          destaques: [],
          filtros: [],
          atacado: { produtos: 0, menorPedidoMinimo: null },
        },
      },
    );
    const vazio = documento.querySelector(".sc-vitrine__sem-resultado");
    expect(vazio).not.toBeNull();
    expect(vazio?.closest(".sc-catalogo__produtos")).not.toBeNull();
  });

  it("[CA-1] @spec:AC-10808 loja sem catálogo mostra o vazio dentro da zona de produtos, sem barra", async () => {
    const { documento } = await renderizarTela(
      {},
      {
        resumo: {
          versao: "1",
          secoes: [],
          destaques: [],
          filtros: [],
          atacado: { produtos: 0, menorPedidoMinimo: null },
        },
      },
    );
    expect(documento.querySelector(".sc-catalogo-barra")).toBeNull();
    expect(
      documento.querySelector(".sc-catalogo__produtos")?.textContent,
    ).toContain("está sendo montado");
  });
});

describe("o CSS do catálogo", () => {
  it("[CA-1] @spec:AC-10808 tem três zonas 3/6/3 a partir de 1280px", () => {
    const computador = dentroDaMedia("(min-width: 1280px)");
    expect(computador).toContain("grid-template-columns: 3fr 6fr 3fr");
    expect(computador).toContain("grid-area: lateral");
    expect(computador).toContain("grid-area: produtos");
    expect(computador).toContain("grid-area: sacola");
  });

  it("[CA-1] @spec:AC-10809 sem sacola, os produtos ocupam a zona dela e não sobra coluna", () => {
    const computador = dentroDaMedia("(min-width: 1280px)");
    expect(computador).toContain(
      ".sc-catalogo:has(> .sc-catalogo__sacola:empty)",
    );
    expect(computador).toContain("grid-template-columns: 3fr 9fr");
    // As áreas também mudam: sem isso a terceira coluna viraria implícita.
    expect(computador).toMatch(/"capa capa"\s*"lateral produtos"/);
  });

  it("[CA-1] @spec:AC-10808 a barra grudada é a coluna lateral, sem display: contents", () => {
    const computador = dentroDaMedia("(min-width: 1280px)");
    expect(computador).toContain("grid-area: lateral");
    expect(computador).toContain("position: static"); // painéis estáticos
    // `display: contents` quebrava o sticky e a ordem das áreas (revisão do plano).
    expect(BLOCO).not.toContain("display: contents");
    // A barra de base já é `position: sticky`; o bloco só a põe na coluna.
    expect(CSS).toMatch(/\.sc-catalogo-barra\s*\{[^}]*position:\s*sticky/);
  });

  it("[CA-1] @spec:AC-10812 o tablet (768 a 1279px) tem gaveta de baixo, e não menu suspenso", () => {
    const tablet = dentroDaMedia("(min-width: 768px) and (max-width: 1279px)");
    expect(tablet).toContain("inset: auto 0 0");
    expect(tablet).toContain("position-area: none");
    // As duas gavetas (ordem e filtro) sobem do pé, e não pendem do botão.
    expect(tablet).toContain(".sc-catalogo .sc-painel--ajustes");
    expect(tablet).toContain(".sc-catalogo .sc-painel--ordem");
  });

  it("[CA-1] @spec:AC-10810 reserva a altura da barra de baixo com a área segura", () => {
    expect(BLOCO).toContain("var(--altura-da-barra-inferior, 0px)");
    expect(BLOCO).toContain("env(safe-area-inset-bottom)");
    expect(BLOCO).toContain("scroll-margin-block-start");
  });

  it("[CA-1] @spec:AC-10811 nada do bloco força rolagem horizontal da página", () => {
    expect(BLOCO).not.toMatch(
      /overflow-x:\s*(scroll|auto)[^;]*;\s*\n[^}]*\.sc-catalogo\s*\{/,
    );
    expect(BLOCO).not.toContain("overflow-x: scroll");
    // Abaixo de 1280px a região da sacola não existe.
    expect(BLOCO).toMatch(/\.sc-catalogo__sacola\s*\{\s*display:\s*none;/);
  });
});
