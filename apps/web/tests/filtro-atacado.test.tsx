// @vitest-environment jsdom
/**
 * Card #59 — o filtro "Atacado" no site.
 *
 * A consulta em si (quem tem faixa ativa, a faceta, o feed entre lojas) está
 * provada contra o banco em `apps/api/tests/vitrine-filtro-atacado.test.ts`.
 * Aqui se prova o que só o site faz: o `?atacado=1` mora no endereço e
 * atravessa abas, ordem, busca e especificações; o chip aparece só quando há
 * produto com atacado (ou quando já está ligado); o feed lê e escreve o
 * parâmetro; e o painel recorta a lista "Com preço de atacado".
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CatalogoDaVitrineNoContrato } from "@simpleclick/contracts";

import {
  consultaDaApi,
  enderecoDoFeed,
  lerConsulta,
} from "../src/features/feed/consulta";
import { ListaProdutos } from "../src/features/painel-catalogo/ListaProdutos";
import { BarraDeCatalogo } from "../src/features/vitrine/BarraDeCatalogo";
import { FiltroEspecificacao } from "../src/features/vitrine/FiltroEspecificacao";
import { lerAtacado } from "../src/lib/catalogo";
import { prepararCatalogo } from "../src/server/catalogo-na-tela";

const LOJA = "distribuidora";

function produto(
  id: string,
  nome: string,
): CatalogoDaVitrineNoContrato["destaques"][number] {
  return {
    id,
    apelido: nome.toLowerCase(),
    nome,
    chamada: null,
    precoCentavos: 600,
    precoAnteriorCentavos: null,
    imagem: null,
    destaque: false,
    disponivel: true,
  };
}

const CATALOGO: CatalogoDaVitrineNoContrato = {
  secoes: [
    {
      id: "aaaaaaaa-1111-4111-8111-111111111111",
      apelido: "bebidas",
      nome: "Bebidas",
      produtos: [produto("11111111-1111-4111-8111-111111111111", "Refri")],
    },
  ],
  destaques: [],
  versao: "1",
  atacado: { produtos: 4, menorPedidoMinimo: 6 },
};

const VAZIO: CatalogoDaVitrineNoContrato = {
  secoes: [{ ...CATALOGO.secoes[0]!, produtos: [] }],
  destaques: [],
  versao: "1",
  atacado: { produtos: 0, menorPedidoMinimo: null },
};

describe("o endereço da vitrine com ?atacado=1", () => {
  it("lê 1 e true como ligado; o resto, não", () => {
    expect(lerAtacado("1")).toBe(true);
    expect(lerAtacado("true")).toBe(true);
    expect(lerAtacado("0")).toBe(false);
    expect(lerAtacado(undefined)).toBe(false);
  });

  it("ligado, atravessa as abas e as ordens; o chip desliga sem perder o resto", () => {
    const naTela = prepararCatalogo(CATALOGO, {
      apelidoDaLoja: LOJA,
      termoBuscado: "refri",
      ordem: "a-z",
      filtros: ["marca=X"],
      atacado: true,
    });
    expect(naTela.abas.find((a) => a.nome === "Bebidas")?.link).toBe(
      `/loja/${LOJA}/cardapio?categoria=bebidas&busca=refri&atacado=1&ordem=a-z`,
    );
    expect(naTela.ordens.find((o) => o.valor === "menor-preco")?.link).toBe(
      `/loja/${LOJA}/cardapio?busca=refri&filtro=marca%3DX&atacado=1&ordem=menor-preco`,
    );
    expect(naTela.atacado).toEqual({
      produtos: 4,
      menorPedidoMinimo: 6,
      ligado: true,
      link: `/loja/${LOJA}/cardapio?busca=refri&filtro=marca%3DX&ordem=a-z`,
    });
  });

  it("desligado, o chip liga mantendo categoria, busca e ordem", () => {
    const naTela = prepararCatalogo(CATALOGO, {
      apelidoDaLoja: LOJA,
      categoriaEscolhida: "bebidas",
    });
    expect(naTela.atacado.ligado).toBe(false);
    expect(naTela.atacado.link).toBe(
      `/loja/${LOJA}/cardapio?categoria=bebidas&atacado=1`,
    );
  });

  it("ligado e sem acerto não é loja vazia: é 'nenhum produto com atacado'", () => {
    const naTela = prepararCatalogo(VAZIO, { apelidoDaLoja: LOJA, atacado: true });
    expect(naTela.lojaSemCatalogo).toBe(false);
    expect(naTela.atacadoSemAcerto).toBe(true);

    const semFiltro = prepararCatalogo(VAZIO, { apelidoDaLoja: LOJA });
    expect(semFiltro.lojaSemCatalogo).toBe(true);
    expect(semFiltro.atacadoSemAcerto).toBe(false);
  });
});

function desenharBarra(catalogo: CatalogoDaVitrineNoContrato, atacado: boolean) {
  const naTela = prepararCatalogo(catalogo, { apelidoDaLoja: LOJA, atacado });
  return renderToStaticMarkup(
    <BarraDeCatalogo
      abas={naTela.abas}
      filtroEmVigor={naTela.filtroEmVigor}
      filtros={[{ chave: "marca", nome: "Marca", valores: ["X"] }]}
      selecionados={[]}
      ordens={naTela.ordens}
      ordem={naTela.ordem}
      acao={`/loja/${LOJA}/cardapio`}
      categoria={null}
      busca={null}
      atacado={naTela.atacado}
    />,
  );
}

describe("o chip Atacado na barra do catálogo", () => {
  it("aparece com a contagem quando há produto com atacado, como link", () => {
    const html = desenharBarra(CATALOGO, false);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const chip = doc.querySelector("a.sc-catalogo-barra__chip");
    expect(chip?.getAttribute("href")).toBe(`/loja/${LOJA}/cardapio?atacado=1`);
    expect(chip?.textContent).toContain("Atacado");
    expect(chip?.textContent).toContain("4");
    expect(chip?.getAttribute("title")).toBe(
      "Preço de atacado a partir de 6 unidades",
    );
    expect(chip?.classList.contains("sc-catalogo-barra__chip--ligado")).toBe(false);
  });

  it("não aparece quando nenhum produto tem atacado", () => {
    expect(desenharBarra(VAZIO, false)).not.toContain("sc-catalogo-barra__chip");
  });

  it("ligado, continua aparecendo (para desligar) e o filtro o leva junto", () => {
    const html = desenharBarra(VAZIO, true);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const chip = doc.querySelector("a.sc-catalogo-barra__chip");
    expect(chip?.classList.contains("sc-catalogo-barra__chip--ligado")).toBe(true);
    expect(chip?.getAttribute("aria-current")).toBe("true");
    expect(chip?.getAttribute("href")).toBe(`/loja/${LOJA}/cardapio`);
    // O formulário do filtro. As buscas saíram da barra (card #130): moram no
    // cabeçalho e em cima da grade, e o teste da tela inteira prova que as
    // duas levam o atacado (`catalogo-stitch.onp.test.tsx`).
    expect(
      doc.querySelectorAll('form input[type="hidden"][name="atacado"][value="1"]'),
    ).toHaveLength(1);
  });

  it("o 'Limpar filtros' das especificações não desliga o atacado", () => {
    const html = renderToStaticMarkup(
      <FiltroEspecificacao
        filtros={[{ chave: "marca", nome: "Marca", valores: ["X"] }]}
        selecionados={["marca=X"]}
        acao={`/loja/${LOJA}/cardapio`}
        categoria={null}
        busca={null}
        atacado
      />,
    );
    expect(html).toContain(`href="/loja/${LOJA}/cardapio?atacado=1"`);
  });
});

describe("o filtro Atacado no feed", () => {
  it("lê ?atacado=1 só na aba de produtos", () => {
    expect(lerConsulta("produtos", { atacado: "1" }).atacado).toBe(true);
    expect(lerConsulta("produtos", {}).atacado).toBe(false);
    expect(lerConsulta("lojas", { atacado: "1" }).atacado).toBe(false);
  });

  it("manda para a API e escreve no endereço; desligar tira do endereço", () => {
    const c = lerConsulta("produtos", { atacado: "1", busca: "refri" });
    expect(consultaDaApi(c)).toContain("atacado=1");
    expect(enderecoDoFeed(c)).toBe("/explorar/produtos?busca=refri&atacado=1");
    expect(enderecoDoFeed(c, { atacado: false })).toBe(
      "/explorar/produtos?busca=refri",
    );
    // Trocar para a aba de lojas não carrega o filtro de produto.
    expect(enderecoDoFeed(c, { aba: "lojas" })).toBe("/explorar/lojas?busca=refri");
  });
});

// ---------------------------------------------------------------------------
// Painel: recorte "Com preço de atacado"
// ---------------------------------------------------------------------------

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  // A consulta da lista mora no endereço (card #76): limpa entre os testes.
  window.history.replaceState(null, "", "/");
  container?.remove();
  raiz = null;
  container = null;
  vi.unstubAllGlobals();
});

const BASE = {
  apelido: "x",
  descricao: null,
  categoriaId: "c-1",
  categoriaNome: "Bebidas",
  precoCentavos: 600,
  status: "PUBLISHED",
  disponivel: true,
};

async function assentar(): Promise<void> {
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
}

/**
 * Um servidor de mentira para a lista paginada (card #76): o recorte
 * `situacao=atacado` é feito do lado dele, e os atalhos contam a loja toda.
 */
async function montarLista(
  produtos: readonly ({ readonly pedidoMinimoDeAtacado?: number | null } & Record<
    string,
    unknown
  >)[],
): Promise<HTMLElement> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const situacao = new URL(url, "http://teste").searchParams.get("situacao");
      const comAtacado = produtos.filter(
        (p) => typeof p.pedidoMinimoDeAtacado === "number",
      );
      const lista = situacao === "atacado" ? comAtacado : produtos;
      return new Response(
        JSON.stringify({
          produtos: lista,
          pagina: 1,
          porPagina: 50,
          total: lista.length,
          totalDePaginas: 1,
          resumo: {
            todos: produtos.length,
            estoqueBaixo: 0,
            comAtacado: comAtacado.length,
          },
          categorias: [],
          marcas: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(<ListaProdutos />);
  });
  await assentar();
  return container;
}

function nomesNaTabela(tela: HTMLElement) {
  return [...tela.querySelectorAll("tbody tr")].map(
    (linha) => linha.querySelector("a")?.textContent,
  );
}

function botaoPeloTexto(tela: HTMLElement, texto: string) {
  const achado = [...tela.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === texto,
  );
  if (!achado) throw new Error(`nenhum botão "${texto}"`);
  return achado;
}

describe("o painel recorta os produtos com preço de atacado", () => {
  it("o botão mostra quantos têm atacado e alterna o recorte", async () => {
    const tela = await montarLista([
      { ...BASE, id: "p-1", nome: "Refri", pedidoMinimoDeAtacado: 6 },
      { ...BASE, id: "p-2", nome: "Suco", pedidoMinimoDeAtacado: null },
      { ...BASE, id: "p-3", nome: "Água" },
    ]);
    expect(nomesNaTabela(tela)).toEqual(["Refri", "Suco", "Água"]);

    await act(async () => botaoPeloTexto(tela, "Com atacado (1)").click());
    await assentar();
    expect(nomesNaTabela(tela)).toEqual(["Refri"]);

    await act(async () => botaoPeloTexto(tela, "Com atacado (1)").click());
    await assentar();
    expect(nomesNaTabela(tela)).toEqual(["Refri", "Suco", "Água"]);
  });

  it("sem produto com atacado, o recorte não é oferecido", async () => {
    const tela = await montarLista([{ ...BASE, id: "p-2", nome: "Suco" }]);
    expect(tela.textContent).not.toContain("Com atacado");
  });
});
