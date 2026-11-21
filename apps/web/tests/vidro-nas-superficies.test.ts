import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contarFiltros, lerFolha, regrasDe, semComentarios } from "./apoio-css";

/**
 * O vidro (card #153) no topo, nos menus, na barra inferior do celular e nos
 * destaques do Explorar: as folhas do app que ficam em `apps/web`.
 */

const NAVEGACAO = lerFolha(
  semComentarios(
    readFileSync(
      fileURLToPath(
        new URL("../src/features/usuario/navegacao.css", import.meta.url),
      ),
      "utf8",
    ),
  ),
);
const FEED = lerFolha(
  semComentarios(
    readFileSync(
      fileURLToPath(new URL("../src/features/feed/feed.css", import.meta.url)),
      "utf8",
    ),
  ),
);
const VITRINE = lerFolha(
  semComentarios(
    readFileSync(
      fileURLToPath(
        new URL("../../../packages/ui/styles/vitrine.css", import.meta.url),
      ),
      "utf8",
    ),
  ),
);

const declaracoes = (
  f: ReturnType<typeof lerFolha>,
  seletor: string,
): ReadonlyMap<string, string> => {
  const regras = regrasDe(f, seletor).filter((r) => r.contexto.length === 0);
  expect(regras, `regra de ${seletor}`).toHaveLength(1);
  return regras[0]!.declaracoes;
};

describe("topo do cliente", () => {
  it("[CA-5] o topo guarda preenchimento e sombra, e o desfoque vai no ::before", () => {
    const topo = declaracoes(NAVEGACAO, ".sc-topo-cliente");
    expect(topo.get("position")).toBe("sticky");
    expect(topo.get("z-index")).toBe("30");
    expect(topo.get("isolation")).toBe("isolate");
    expect(topo.get("background-color")).toContain("--vidro-opacidade-medio");
    expect(topo.get("box-shadow")).toContain("--vidro-sombra-medio");
    // Um `backdrop-filter` no próprio topo o faria raiz do fundo dos filhos:
    // o menu do avatar e a região só enxergariam o topo, e não a página.
    expect(topo.has("backdrop-filter")).toBe(false);
    expect(topo.has("-webkit-backdrop-filter")).toBe(false);
  });

  it("[CA-5] o ::before fica atrás do conteúdo, não pega clique e desfoca com o token médio", () => {
    const camada = declaracoes(NAVEGACAO, ".sc-topo-cliente::before");
    expect(camada.get("position")).toBe("absolute");
    expect(camada.get("inset")).toBe("0");
    expect(camada.get("z-index")).toBe("-1");
    expect(camada.get("pointer-events")).toBe("none");
    expect(camada.get("backdrop-filter")).toBe("var(--vidro-filtro-medio)");
    expect(camada.get("-webkit-backdrop-filter")).toBe(
      "var(--vidro-filtro-medio)",
    );
    expect(camada.get("box-shadow")).toContain("--vidro-realce");
  });

  it("[CA-5] o menu do avatar e a região são vidro na forma direta, sobre a base do tema", () => {
    for (const seletor of [
      ".sc-menu-conta__painel",
      ".sc-local-topo__painel",
    ]) {
      const painel = declaracoes(NAVEGACAO, seletor);
      expect(painel.get("background-color"), seletor).toContain(
        "var(--vidro-base)",
      );
      expect(painel.get("backdrop-filter"), seletor).toBe(
        "var(--vidro-filtro-medio)",
      );
      expect(painel.get("-webkit-backdrop-filter"), seletor).toBe(
        "var(--vidro-filtro-medio)",
      );
      expect(painel.get("border"), seletor).toContain("--vidro-borda");
    }
  });

  it("[CA-5] a barra inferior do celular é do DS: aqui só a aresta, sem fundo, sombra nem desfoque", () => {
    const barra = declaracoes(
      NAVEGACAO,
      ".sc-barra-cliente .sc-barra-inferior",
    );
    expect(barra.get("border-block-start-color")).toBe("var(--vidro-borda)");
    for (const propriedade of [
      "background",
      "background-color",
      "background-image",
      "box-shadow",
      "backdrop-filter",
      "-webkit-backdrop-filter",
    ]) {
      expect(barra.has(propriedade), propriedade).toBe(false);
    }
  });
});

describe("o que foi escrito à mão virou token", () => {
  it("[CA-10] navegacao.css não tem mais desfoque nem sombra com rgb() escritos à mão", () => {
    expect(NAVEGACAO.texto).not.toMatch(/blur\(\d/);
    expect(NAVEGACAO.texto).not.toMatch(/\brgba?\(/);
  });

  it("[CA-10] todo backdrop-filter do topo e dos menus vem com o par do Safari", () => {
    const { puro, webkit } = contarFiltros(NAVEGACAO.texto);
    expect(puro).toBeGreaterThan(0);
    expect(webkit).toBe(puro);
  });

  it("[CA-9] o vidro do topo não lê a cor da marca nem escreve cor fixa", () => {
    expect(NAVEGACAO.texto).not.toMatch(
      /--cor-marca|--marca-|#[\da-f]{3,8}\b/i,
    );
  });
});

describe("destaques do Explorar", () => {
  it("[CA-7] os cartões de destaque têm o vidro estático: aresta, brilho e sombra, sem desfoque", () => {
    const cartao = declaracoes(FEED, ".sc-inicio__produtos .sc-feed__cartao");
    expect(cartao.get("background-color")).toContain("--vidro-opacidade-forte");
    expect(cartao.get("background-image")).toContain("--vidro-brilho-alfa");
    expect(cartao.get("box-shadow")).toContain("--vidro-borda");
    expect(cartao.get("box-shadow")).toContain("--vidro-realce");
    expect(cartao.has("backdrop-filter")).toBe(false);
  });

  it("[CA-7] o feed do Explorar não tem backdrop-filter em lugar nenhum: posts, 'Lojas perto' e a grade rolam", () => {
    const { puro, webkit } = contarFiltros(FEED.texto);
    expect(puro + webkit).toBe(0);
  });

  it("[CA-7] a barra de categorias do catálogo (rolagem horizontal longa) também fica sem desfoque", () => {
    for (const regra of regrasDe(VITRINE, ".sc-catalogo-barra")) {
      expect(regra.declaracoes.has("backdrop-filter")).toBe(false);
    }
  });

  it("[CA-7] a lista do feed não ganhou position: sticky (a regra das barras fixas)", () => {
    expect(FEED.texto).not.toMatch(/position:\s*sticky/);
  });
});
