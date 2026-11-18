/**
 * As barras fixas do cliente (card #105): o que o CSS DECLARA — reserva de
 * espaço com a área segura, uma barra fixa de baixo por vez, cookies e aviso
 * acima da barra e as faixas coladas abaixo do topo. A medida real (layout,
 * área segura do aparelho, teclado virtual, foco encoberto) é prova de
 * navegador (e2e/simulador, #114) e está em `e2e/specs/navegacao-do-cliente.onp.spec.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = join(__dirname, "../../..");
const ler = (caminho: string) => readFileSync(join(raiz, caminho), "utf8");

const navegacao = ler("apps/web/src/features/usuario/navegacao.css");
const legal = ler("packages/ui/styles/legal.css");
const componentes = ler("packages/ui/styles/componentes.css");
const layoutRaiz = ler("apps/web/src/app/layout.tsx");

/** O texto de um bloco `@media (...) { ... }` (chaves balanceadas). */
function blocoDaMedia(css: string, consulta: string, inicio = 0): string {
  const comeco = css.indexOf(`@media ${consulta} {`, inicio);
  if (comeco === -1) return "";
  let fundo = 0;
  for (let i = css.indexOf("{", comeco); i < css.length; i++) {
    if (css[i] === "{") fundo++;
    if (css[i] === "}" && --fundo === 0) return css.slice(comeco, i + 1);
  }
  return "";
}

const SECAO = navegacao.slice(
  navegacao.indexOf("barras fixas, camadas e área segura"),
);
const CELULAR = blocoDaMedia(SECAO, "(max-width: 63.99rem)");
const OUTRA_BARRA =
  '.sc-sacola-barra, [data-sacola="barra"], .sc-produto__acao';

describe("espaço no fim da página", () => {
  it("[CA-27] @spec:AC-10517 a página reserva a altura da barra mais a área segura", () => {
    expect(CELULAR).toMatch(
      /body:has\(\.sc-barra-cliente\) \{\s*padding-block-end: calc\(\s*var\(--altura-da-barra-inferior\) \+ env\(safe-area-inset-bottom, 0px\)\s*\);/,
    );
  });

  it("[CA-27] @spec:AC-10517 a reserva só vale no celular (a barra não existe a partir de 64rem)", () => {
    const fora = SECAO.replace(CELULAR, "");
    expect(fora).not.toContain("padding-block-end");
  });

  it("[CA-27] @spec:AC-10517 o app liga a área segura do aparelho (viewportFit cover)", () => {
    expect(layoutRaiz).toMatch(/viewportFit:\s*"cover"/);
  });

  it("[CA-27] @spec:AC-10521 o Tab não para atrás do topo nem da barra (scroll-padding)", () => {
    expect(SECAO).toMatch(
      /html:has\(\.sc-topo-cliente\)[^{]*\{\s*scroll-padding-block-start: calc\(\s*var\(--altura-do-topo-cliente\)/,
    );
    expect(CELULAR).toMatch(
      /scroll-padding-block-end: calc\(\s*var\(--altura-da-barra-inferior\) \+ env\(safe-area-inset-bottom, 0px\)/,
    );
  });

  it("[CA-27] @spec:AC-10521 o topo respeita o recorte de cima e o anel de foco segue visível", () => {
    expect(navegacao).toMatch(/padding-block-start: env\(safe-area-inset-top\)/);
    expect(navegacao).toMatch(/\.sc-topo-cliente a:focus-visible[^{]*\{\s*outline: 2px solid var\(--cor-foco\)/);
  });
});

describe("uma barra fixa de baixo por vez", () => {
  it("[CA-28] @spec:AC-10518 a barra de navegação some com a sacola ou a ação do produto", () => {
    expect(CELULAR).toContain(
      `body:has(${OUTRA_BARRA}) .sc-barra-cliente {\n    display: none;`,
    );
  });

  it("[CA-28] @spec:AC-10518 sem reserva dobrada: com outra barra, a reserva da navegação some", () => {
    expect(CELULAR).toContain(
      `body:has(.sc-barra-cliente):has(${OUTRA_BARRA}) {\n    padding-block-end: 0;`,
    );
  });

  it("[CA-28] @spec:AC-10518 ao esvaziar a sacola tudo volta (nada é guardado: são só seletores :has)", () => {
    // Sem a sacola no DOM nenhuma das regras acima casa: a barra reaparece.
    expect(CELULAR).not.toMatch(/\.sc-barra-cliente[^{]*\{[^}]*display: none[^}]*!important/);
  });
});

describe("cookies, aviso e camadas", () => {
  it("[CA-29] @spec:AC-10519 o aviso de cookies sobe a altura da barra (gancho .sc-barra-inferior)", () => {
    const celular = blocoDaMedia(legal, "(max-width: 63.99rem)", legal.indexOf("Celular com a barra de navegação"));
    expect(celular).toContain(".sc-barra-inferior:not(.sc-barra-inferior--embutida, [data-oculta])");
    expect(celular).toMatch(/--sc-cookies-sobe: var\(--altura-da-barra-inferior\)/);
    expect(celular).toContain(OUTRA_BARRA);
  });

  it("[CA-29] @spec:AC-10519 o aviso de cookies já soma a área segura (o deslocamento só soma a barra)", () => {
    expect(legal).toMatch(/max\(var\(--espaco-3\), env\(safe-area-inset-bottom\)\) \+ var\(--sc-cookies-sobe, 0px\)/);
  });

  it("[CA-29] @spec:AC-10519 o aviso flutuante do #104 sobe pelo mesmo deslocamento", () => {
    expect(CELULAR).toMatch(/--deslocamento-do-aviso: var\(--altura-da-barra-inferior\)/);
    expect(componentes).toMatch(/\.sc-aviso-flutuante \{[^}]*var\(--deslocamento-do-aviso, 0px\)[^}]*env\(safe-area-inset-bottom, 0px\)/);
  });

  it("[CA-29] @spec:AC-10519 camadas: o topo (30) acima da barra (25) e do aviso de cookies (15); nada acima de 1000", () => {
    expect(navegacao).toMatch(/\.sc-topo-cliente \{[^}]*z-index: 30;/);
    expect(componentes).toMatch(/\.sc-barra-inferior \{[^}]*z-index: 25;/);
    expect(legal).toMatch(/\.sc-cookies \{[^}]*z-index: 15;/);
    const camadas = [...navegacao.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(camadas.length).toBeGreaterThan(0);
    expect(Math.max(...camadas)).toBeLessThanOrEqual(1000);
  });
});

describe("faixas coladas abaixo do topo", () => {
  it("[CA-30] @spec:AC-10517 a vitrine cola a faixa abaixo do topo, e o feed (Stitch, #128) não tem faixa colada", () => {
    // O início do Stitch rola inteiro: nenhuma faixa do feed gruda por baixo
    // do topo (e por isso o Tab do feed usa a reserva do documento).
    const feed = ler("apps/web/src/features/feed/feed.css");
    expect(feed).not.toMatch(/position:\s*sticky/);
    expect(SECAO).toMatch(/html:has\(\.sc-topo-cliente\):not\(:has\(\.sc-pagina-da-loja\)\)/);
    expect(SECAO).toMatch(
      /body:has\(\.sc-topo-cliente\) \.sc-pagina-da-loja \{\s*--altura-da-barra: var\(--altura-do-topo-cliente\);/,
    );
  });

  it("[CA-30] @spec:AC-10504 a altura do topo é uma só e soma a área segura de cima", () => {
    expect(navegacao).toMatch(
      /--altura-do-topo-cliente: calc\(\s*var\(--altura-da-fileira-do-topo\) \+ var\(--altura-das-abas-do-topo\) \+\s*env\(safe-area-inset-top, 0px\)/,
    );
  });

  it("[CA-30] @spec:AC-10504 só uma navegação por largura: abas a partir de 64rem, barra abaixo", () => {
    expect(blocoDaMedia(navegacao, "(min-width: 64rem)", navegacao.indexOf(".sc-topo-cliente__abas {"))).toContain(
      ".sc-topo-cliente__abas {\n    display: block;",
    );
    expect(navegacao).toMatch(/@media \(min-width: 64rem\) \{\s*\.sc-barra-cliente \{\s*display: none;/);
  });

  it("[CA-30] @spec:AC-10515 o topo usa só tokens da loja (--cor-primaria*, --cor-foco), nunca --cor-marca", () => {
    const semComentarios = navegacao.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(semComentarios).not.toMatch(/--cor-marca|--marca-/);
    expect(semComentarios).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
