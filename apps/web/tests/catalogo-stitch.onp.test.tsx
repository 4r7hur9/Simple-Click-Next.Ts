// @vitest-environment jsdom
/**
 * Card #130 — o catálogo e a sacola no layout do Stitch. O jsdom não mede
 * largura: aqui se prova a COMPOSIÇÃO (o que existe, onde mora e o que cada
 * peça anuncia) e o que está escrito no CSS do bloco do catálogo. A aparência
 * nas três larguras está nas capturas em `.rmcode/capturas/130/`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import axe from "axe-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CartaoDeProduto } from "../src/features/vitrine/CartaoDeProduto";
import type { ProdutoNaTela } from "../src/lib/catalogo";

import { renderizarTela, vitrineDaLoja } from "./apoio-do-catalogo-na-tela";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ESTILOS = resolve(AQUI, "../../../packages/ui/styles");
const VITRINE = readFileSync(resolve(ESTILOS, "vitrine.css"), "utf8");
const FECHAMENTO = readFileSync(resolve(ESTILOS, "fechamento.css"), "utf8");

/** Só o bloco do catálogo (do marcador até o da página da loja). */
const BLOCO = VITRINE.slice(
  VITRINE.indexOf("/* --- catálogo Stitch (#108)"),
  VITRINE.indexOf("/* --- a página da loja, abaixo do cartão"),
);
const BLOCO_DA_SACOLA = FECHAMENTO.slice(
  FECHAMENTO.indexOf("/* --- a sacola no layout Stitch (card #130)"),
);

/**
 * O conteúdo de um `@media` do bloco, pelo texto exato da condição. Com
 * `ultima`, a última ocorrência (a do cartão vem depois da do cabeçalho).
 */
function dentroDaMedia(condicao: string, ultima = false): string {
  const alvo = `@media ${condicao} {`;
  const inicio = ultima ? BLOCO.lastIndexOf(alvo) : BLOCO.indexOf(alvo);
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

function produto(extra: Partial<ProdutoNaTela> = {}): ProdutoNaTela {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    apelido: "pastel",
    nome: "Pastel de carne",
    chamada: null,
    preco: "R$ 49,90",
    precoCentavos: 4990,
    precoAnterior: null,
    imagem: null,
    disponivel: true,
    link: "/loja/casa-do-sabor/produto/pastel",
    ...extra,
  };
}

describe("[CA-1] a composição do Stitch", () => {
  it("[CA-1] cabeçalho em cartão primeiro, com logo, nome em h1 e a busca do celular e do tablet", async () => {
    const { documento } = await renderizarTela();
    const main = documento.querySelector("main.sc-catalogo")!;
    const topo = main.firstElementChild!;
    expect(topo.matches("header.sc-catalogo-topo")).toBe(true);

    // Um só h1, e ele diz o catálogo e a loja (o rótulo vai para o leitor).
    expect(documento.querySelectorAll("h1")).toHaveLength(1);
    expect(topo.querySelector("h1")?.textContent).toBe(
      "Cardápio de Casa do Sabor",
    );
    // Sem logo cadastrado: o ícone neutro, escondido do leitor de tela.
    expect(
      topo
        .querySelector(".sc-catalogo-topo__logo")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");

    const busca = topo.querySelector(
      '.sc-catalogo-topo__busca form[role="search"]',
    );
    expect(busca?.getAttribute("method")).toBe("get");
    expect(busca?.querySelector("#busca-no-topo")).not.toBeNull();
  });

  it("[CA-1] o logo da loja aparece quando cadastrado, sem texto alternativo repetido", async () => {
    const vitrine = vitrineDaLoja();
    // O duble tipa `logo` como nulo; aqui ele vem preenchido, como na API.
    const comLogo = {
      ...vitrine,
      loja: { ...vitrine.loja, logo: "https://exemplo.test/logo.png" },
    } as unknown as typeof vitrine;
    const { documento } = await renderizarTela({}, { vitrine: comLogo });
    const foto = documento.querySelector<HTMLImageElement>(
      ".sc-catalogo-topo__logo img",
    );
    expect(foto?.getAttribute("src")).toBe("https://exemplo.test/logo.png");
    expect(foto?.getAttribute("alt")).toBe("");
  });

  it("[CA-1] em cima da grade, a busca do computador e o 'Ordenar' que abre o painel da ordem", async () => {
    const { documento } = await renderizarTela();
    const ferramentas = documento.querySelector(
      ".sc-catalogo__produtos > .sc-catalogo__ferramentas",
    )!;
    expect(ferramentas).not.toBeNull();
    expect(
      ferramentas.querySelector('form[role="search"] #busca-sobre-a-grade'),
    ).not.toBeNull();

    const ordenar = ferramentas.querySelector("button.sc-catalogo__ordenar")!;
    expect(ordenar.getAttribute("popovertarget")).toBe("painel-da-ordem");
    expect(ordenar.textContent).toContain("Ordenar:");
    // O painel que ele abre existe uma vez só na página.
    expect(documento.querySelectorAll("#painel-da-ordem")).toHaveLength(1);
  });

  it("[CA-1] as duas buscas levam junto o atacado, a ordem e os filtros em vigor", async () => {
    const { documento } = await renderizarTela({
      atacado: "1",
      ordem: "a-z",
      estoque: "1",
    });
    for (const id of ["#busca-no-topo", "#busca-sobre-a-grade"]) {
      const form = documento.querySelector(id)?.closest("form");
      expect(form, id).not.toBeNull();
      expect(
        form?.querySelector('input[name="atacado"]')?.getAttribute("value"),
      ).toBe("1");
      expect(
        form?.querySelector('input[name="ordem"]')?.getAttribute("value"),
      ).toBe("a-z");
      expect(
        form?.querySelector('input[name="estoque"]')?.getAttribute("value"),
      ).toBe("1");
    }
  });

  it("[CA-1] a barra não tem mais busca nem painel da busca; tem 'Ordenar' e 'Filtrar'", async () => {
    const { documento } = await renderizarTela();
    const barra = documento.querySelector(".sc-catalogo-barra")!;
    expect(barra.querySelector('form[role="search"]')).toBeNull();
    expect(documento.querySelector("#painel-da-busca")).toBeNull();
    expect(
      barra.querySelector(
        '.sc-catalogo-barra__botao--ordem[popovertarget="painel-da-ordem"]',
      ),
    ).not.toBeNull();
    expect(
      barra.querySelector(
        '.sc-catalogo-barra__botao--filtro[popovertarget="painel-dos-ajustes"]',
      )?.textContent,
    ).toContain("Filtrar");
    // O título "Filtros" do painel lateral é visual: o leitor já ouve os grupos.
    expect(
      barra
        .querySelector(".sc-catalogo-barra__cabeca")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("[CA-1] a faixa de destaques saiu do catálogo (ela é da página da loja)", async () => {
    const { documento } = await renderizarTela();
    expect(documento.querySelector(".sc-vitrine__destaques")).toBeNull();
  });

  it("[CA-1] a tela inteira não tem violação crítica nem séria de acessibilidade", async () => {
    const { html } = await renderizarTela();
    const raiz = document.createElement("div");
    raiz.innerHTML = html;
    document.body.append(raiz);
    const resultado = await axe.run(raiz, {
      rules: { region: { enabled: false } },
    });
    raiz.remove();
    expect(
      resultado.violations
        .filter((v) => v.impact === "critical" || v.impact === "serious")
        .map((v) => v.id),
    ).toEqual([]);
  });
});

describe("[CA-2] o cartão escuro com '+ Adicionar'", () => {
  it("[CA-2] no catálogo, o '+' ganha o rótulo visível, e o nome acessível começa por ele", () => {
    const pagina = document.createElement("div");
    pagina.innerHTML = renderToStaticMarkup(
      <CartaoDeProduto produto={produto()} formato="catalogo" />,
    );
    const mais = pagina.querySelector("a.sc-vitrine__mais")!;
    expect(mais.textContent).toBe("Adicionar");
    expect(mais.getAttribute("aria-label")).toBe(
      "Adicionar Pastel de carne à sacola",
    );
    expect(mais.getAttribute("data-adicionar-produto")).toBe(produto().id);
  });

  it("[CA-2] fora do catálogo (a faixa), o '+' continua só o ícone redondo", () => {
    const html = renderToStaticMarkup(<CartaoDeProduto produto={produto()} />);
    expect(html).not.toContain("sc-vitrine__mais-rotulo");
  });

  it("[CA-2] o CSS faz a pílula verde e a caixa de preço do cartão na grade", () => {
    expect(BLOCO).toMatch(
      /\.sc-vitrine__cartao--catalogo \.sc-vitrine__mais\s*\{[^}]*border-radius:\s*var\(--raio-completo\);[^}]*background:\s*var\(--cor-primaria\);/,
    );
    const grade = dentroDaMedia("(min-width: 768px)", true);
    expect(grade).toMatch(
      /\.sc-vitrine__cartao--catalogo \.sc-vitrine__pe\s*\{[^}]*background:\s*var\(--cor-fundo\);/,
    );
    expect(grade).toMatch(
      /\.sc-vitrine__cartao--catalogo \.sc-vitrine__mais\s*\{[^}]*position:\s*static;[^}]*inline-size:\s*100%;/,
    );
  });
});

describe("[CA-3] as três larguras e a cor única", () => {
  it("[CA-3] no computador a busca sai do cabeçalho e o cartão das ferramentas aparece", () => {
    expect(BLOCO).toMatch(/\.sc-catalogo__ferramentas\s*\{\s*display:\s*none;/);
    const computador = dentroDaMedia("(min-width: 1280px)");
    expect(computador).toMatch(
      /\.sc-catalogo-topo__busca\s*\{\s*display:\s*none;/,
    );
    expect(computador).toMatch(
      /\.sc-catalogo__ferramentas\s*\{\s*display:\s*flex;/,
    );
    // O painel do filtro fica aberto na lateral; o da ordem continua menu.
    expect(computador).toContain(".sc-catalogo .sc-painel--ajustes {");
    expect(computador).not.toContain(".sc-catalogo .sc-painel--ordem {");
  });

  it("[CA-3] o bloco do catálogo e o da sacola não escrevem cor: só tokens (verde SimpleClick)", () => {
    for (const comComentarios of [BLOCO, BLOCO_DA_SACOLA]) {
      expect(comComentarios.length).toBeGreaterThan(0);
      // Os comentários citam cards ("#108"), que não são cor.
      const bloco = comComentarios.replace(/\/\*[\s\S]*?\*\//g, "");
      expect(bloco).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(bloco).not.toMatch(/\brgba?\(/);
      expect(bloco).not.toMatch(/--cor-(marca|destaque)-da-loja/);
    }
  });

  it("[CA-3] a página não rola na horizontal: as pílulas contêm os textos do leitor de tela", () => {
    // `.sc-so-leitor` é `position: absolute`. Se a pílula não for o bloco de
    // contenção, os das pílulas fora da tela escapam da lista rolável e a
    // página inteira passa a rolar de lado no celular (achado do #131, 390px).
    expect(BLOCO).toMatch(
      /\.sc-catalogo \.sc-vitrine__abas \.sc-chip\s*\{[^}]*position:\s*relative;/,
    );
    expect(BLOCO).toMatch(
      /\.sc-catalogo \.sc-vitrine__abas-lista\s*\{[^}]*position:\s*relative;/,
    );
  });

  it("[CA-3] a sacola: total grande na barra e 'Fechar pedido' em pílula verde na coluna", () => {
    expect(BLOCO_DA_SACOLA).toMatch(
      /\.sc-sacola-barra__total\s*\{[^}]*font-size:\s*1\.375rem;/,
    );
    expect(BLOCO_DA_SACOLA).toMatch(
      /\.sc-sacola-coluna \.sc-carrinho-janela__acao\s*\{[^}]*border-radius:\s*var\(--raio-completo\);[^}]*background:\s*var\(--cor-primaria\);[^}]*text-transform:\s*none;/,
    );
  });
});
