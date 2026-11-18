// @vitest-environment jsdom
/**
 * Card #108 · T-10805 — páginas, "Ver mais" e busca no servidor.
 *
 * O catálogo nunca vem inteiro: 24 por seção, no máximo 72 na primeira tela e
 * até 48 por requisição, com cursor opaco. O erro de "Ver mais" mantém os itens
 * e é ANUNCIADO por uma região falada que já existia antes do erro.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GradeDeProdutos } from "../src/features/vitrine/GradeDeProdutos";
import type {
  PaginaNaTela,
  ProdutoNaTela,
  RecorteDaLista,
  SecaoNaTela,
} from "../src/lib/catalogo";

import { RESUMO, renderizarTela } from "./apoio-do-catalogo-na-tela";

// O React exige este marcador para aceitar `act` fora de um framework de teste.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const RECORTE: RecorteDaLista = {
  categoria: "salgados",
  busca: null,
  filtros: [],
  atacado: false,
  ordem: "relevancia",
};

function item(n: number): ProdutoNaTela {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    apelido: `item-${n}`,
    nome: `Item ${n}`,
    chamada: null,
    preco: "R$ 10,00",
    precoCentavos: 1000,
    precoAnterior: null,
    imagem: null,
    disponivel: true,
    link: `/loja/casa-do-sabor/produto/item-${n}`,
  };
}

const SECAO: SecaoNaTela = {
  id: "s1",
  apelido: "salgados",
  nome: "Salgados",
  produtos: [item(1), item(2), item(3)],
  total: 9,
  mais: {
    cursor: "c1",
    recorte: RECORTE,
    link: "/loja/casa-do-sabor/cardapio?categoria=salgados&cursor=c1",
  },
};

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.unstubAllGlobals();
});

async function montar(
  carregarMais: (r: RecorteDaLista, c: string) => Promise<PaginaNaTela | null>,
  automatico = false,
): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(
      <GradeDeProdutos
        secao={SECAO}
        carregarMais={carregarMais}
        automatico={automatico}
      />,
    );
  });
  return container;
}

const verMais = (tela: HTMLElement) =>
  tela.querySelector<HTMLAnchorElement>(".sc-vitrine__ver-mais a")!;
const ids = (tela: HTMLElement) =>
  [...tela.querySelectorAll("[data-adicionar-produto]")].map((e) =>
    e.getAttribute("data-adicionar-produto"),
  );

describe("'Ver mais' traz a próxima página", () => {
  it("[CA-5] @spec:AC-10802 acrescenta os produtos novos sem repetir nenhum", async () => {
    const carregar = vi
      .fn<(r: RecorteDaLista, c: string) => Promise<PaginaNaTela | null>>()
      .mockResolvedValueOnce({
        produtos: [item(3), item(4), item(5)],
        proximoCursor: "c2",
      })
      .mockResolvedValueOnce({
        produtos: [item(5), item(6)],
        proximoCursor: null,
      });
    const tela = await montar(carregar);
    expect(ids(tela)).toHaveLength(3);
    expect(verMais(tela).textContent).toContain("Ver mais 6 produtos");

    await act(async () => verMais(tela).click());
    // O item 3 voltou na página 2 e não pode aparecer de novo.
    expect(carregar).toHaveBeenLastCalledWith(RECORTE, "c1");
    expect(ids(tela)).toHaveLength(5);

    await act(async () => verMais(tela).click());
    expect(carregar).toHaveBeenLastCalledWith(RECORTE, "c2");
    const todos = ids(tela);
    expect(new Set(todos).size).toBe(todos.length);
    // Chegou ao fim: o botão some.
    expect(tela.querySelector(".sc-vitrine__ver-mais")).toBeNull();
  });
});

describe("falha ao carregar mais", () => {
  it("[CA-5] @spec:AC-10826 a região falada já existe, vazia, antes de qualquer erro", async () => {
    const tela = await montar(async () => null);
    const aviso = tela.querySelector('[role="status"][aria-live="polite"]');
    expect(aviso).not.toBeNull();
    expect(aviso?.textContent).toBe("");
  });

  it("[CA-5] @spec:AC-10826 o erro mantém os itens, mostra Tentar de novo e é anunciado", async () => {
    const carregar = vi.fn(async () => null);
    const tela = await montar(carregar);

    await act(async () => verMais(tela).click());

    expect(ids(tela)).toHaveLength(3);
    expect(verMais(tela).textContent).toContain(
      "Não deu para carregar. Tentar de novo",
    );
    expect(
      tela.querySelector('[role="status"][aria-live="polite"]')?.textContent,
    ).toBe("Não deu para carregar mais produtos de Salgados.");
  });

  it("[CA-5] @spec:AC-10826 depois do erro, tentar de novo funciona e limpa o aviso", async () => {
    const carregar = vi
      .fn<(r: RecorteDaLista, c: string) => Promise<PaginaNaTela | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ produtos: [item(4)], proximoCursor: null });
    const tela = await montar(carregar);

    await act(async () => verMais(tela).click());
    await act(async () => verMais(tela).click());

    expect(ids(tela)).toHaveLength(4);
    expect(
      tela.querySelector('[role="status"][aria-live="polite"]')?.textContent,
    ).toBe("");
  });

  it("[CA-5] @spec:AC-10826 a rolagem automática não repete a tentativa sozinha depois do erro", async () => {
    const chamadasDoObservador: Array<
      (e: Array<{ isIntersecting: boolean }>) => void
    > = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (e: Array<{ isIntersecting: boolean }>) => void) {
          chamadasDoObservador.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    const carregar = vi.fn(async () => null);
    await montar(carregar, true);
    expect(chamadasDoObservador).toHaveLength(1);

    // O botão chega perto da tela: a primeira tentativa é automática.
    await act(async () =>
      chamadasDoObservador[0]?.([{ isIntersecting: true }]),
    );
    expect(carregar).toHaveBeenCalledTimes(1);

    // Falhou: nenhum observador novo, e nada de segunda tentativa sem toque.
    expect(chamadasDoObservador).toHaveLength(1);
    await act(async () =>
      chamadasDoObservador[0]?.([{ isIntersecting: false }]),
    );
    expect(carregar).toHaveBeenCalledTimes(1);
  });
});

describe("o catálogo nunca vem inteiro, e o endereço guarda o recorte", () => {
  it("[CA-5] @spec:AC-10801 sem categoria, o resumo pede 24 por seção e no máximo 72 no total", async () => {
    const { chamadasAoResumo } = await renderizarTela();
    const opcoes = chamadasAoResumo[0]?.[1] as Record<string, unknown>;
    expect(opcoes["porSecao"]).toBe(24);
    expect(opcoes["totalMaximo"]).toBe(72);
  });

  it("[CA-5] @spec:AC-10801 a página pedida ao servidor nunca passa de 48 itens", async () => {
    const { chamadasAPagina } = await renderizarTela({ categoria: "salgados" });
    const opcoes = chamadasAPagina[0]?.[1] as Record<string, unknown>;
    // Sem `limite`, vale o padrão da API (24); com, nunca acima de 48.
    expect((opcoes["limite"] as number | undefined) ?? 24).toBeLessThanOrEqual(
      48,
    );
  });

  it("[CA-5] @spec:AC-10804 o 'Ver mais' sem JavaScript é um link com cursor, busca, categoria, filtros, atacado e ordem", async () => {
    const { documento } = await renderizarTela(
      {
        categoria: "salgados",
        busca: "pastel",
        atacado: "1",
        ordem: "menor-preco",
        filtro: ["tamanho=M"],
      },
      {
        resumo: {
          ...RESUMO,
          filtros: [{ chave: "tamanho", nome: "Tamanho", valores: ["P", "M"] }],
        },
        pagina: {
          versao: "1",
          produtos: [RESUMO.secoes[0]!.produtos[0]!],
          total: 90,
          proximoCursor: "eyJwIjoyNH0",
        },
      },
    );
    const link = documento.querySelector<HTMLAnchorElement>(
      ".sc-vitrine__ver-mais a",
    )!;
    const url = new URL(link.getAttribute("href")!, "http://x");
    expect(url.pathname).toBe("/loja/casa-do-sabor/cardapio");
    expect(url.searchParams.get("cursor")).toBe("eyJwIjoyNH0");
    expect(url.searchParams.get("categoria")).toBe("salgados");
    expect(url.searchParams.get("busca")).toBe("pastel");
    expect(url.searchParams.get("atacado")).toBe("1");
    expect(url.searchParams.get("ordem")).toBe("menor-preco");
    expect(url.searchParams.getAll("filtro")).toEqual(["tamanho=M"]);
  });

  it("[CA-5] @spec:AC-10804 a busca é um formulário GET para o próprio catálogo", async () => {
    const { documento } = await renderizarTela();
    const form = documento.querySelector<HTMLFormElement>(
      'form[role="search"]',
    )!;
    expect(form.getAttribute("method")?.toLowerCase()).toBe("get");
    expect(form.getAttribute("action")).toBe("/loja/casa-do-sabor/cardapio");
  });
});
