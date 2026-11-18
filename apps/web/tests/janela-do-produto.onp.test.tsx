// @vitest-environment jsdom
/**
 * A janela do produto (card #109): composição do ramo, link direto, fechar,
 * foco de volta ao cartão, "+" do cartão e o item enviado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import type { ProdutoNaTela } from "../src/lib/produto";
import {
  eProdutoSimples,
  JanelaDoProduto,
} from "../src/features/produto/JanelaDoProduto";
import {
  botaoDeAdicionar,
  clicar,
  grupo,
  LOJA,
  lido,
  marcar,
  montar,
  naTela,
  opcao,
  ID_DE,
} from "./apoio-produto-onp";

const ROTULOS = { variacao: "Tamanho" };

beforeEach(() => {
  // O jsdom não implementa o <dialog> modal: o stub faz o que o navegador faz.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  const matchesOriginal = Element.prototype.matches;
  Element.prototype.matches = function (this: Element, seletor: string) {
    return seletor === ":modal"
      ? this.hasAttribute("open")
      : matchesOriginal.call(this, seletor);
  } as typeof Element.prototype.matches;
  Element.prototype.scrollTo = (() => {}) as never;
});
const raizes: Root[] = [];

afterEach(() => {
  // Desmonta as raízes: cada janela ouve cliques no documento inteiro.
  act(() => raizes.splice(0).forEach((raiz) => raiz.unmount()));
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

const com = naTela({
  grupos: [
    grupo(40, "Adicionais", "ADDON", [opcao(41, "Bacon")]),
    grupo(30, "Ingredientes", "INGREDIENT", [opcao(31, "Cebola")]),
  ],
});

function janelaEstatica(blocos?: readonly string[]) {
  return renderToStaticMarkup(
    <JanelaDoProduto
      apelidoDaLoja={LOJA}
      rotulos={ROTULOS}
      rotuloDoCatalogo="Cardápio"
      blocosDoDetalhe={blocos}
      produtoInicial={com}
      carregarProduto={async () => null}
    />,
  );
}

describe("composição e link direto", () => {
  it("[CA-6] @spec:AC-10905 a lista do ramo chega à janela e ordena os grupos", () => {
    const html = janelaEstatica(["ingredientes", "adicionais"]);
    expect(html.indexOf("Ingredientes")).toBeLessThan(
      html.indexOf("Adicionais"),
    );
    const inverso = janelaEstatica(["adicionais", "ingredientes"]);
    expect(inverso.indexOf("Adicionais")).toBeLessThan(
      inverso.indexOf("Ingredientes"),
    );
  });

  it("[CA-31] @spec:AC-10931 o link direto traz a janela aberta com o conteúdo pronto, sem script", () => {
    const html = janelaEstatica();
    expect(html).toContain("<dialog");
    expect(html).toMatch(/<dialog[^>]*\sopen/);
    expect(html).toContain("Pastel de queijo");
    expect(html).toContain("Feito na hora.");
    expect(html.replace(/\s+/g, " ")).toMatch(/R\$\s*20,00/);
    expect(html).toContain("Adicionais");
  });
});

/** Monta a janela com um cartão (link) fora dela, como no cardápio. */
function montarComCartao(
  opts: {
    inicial?: boolean;
    carregar?: (id: string) => Promise<ProdutoNaTela | null>;
  } = {},
) {
  const cartao = document.createElement("a");
  cartao.href = `/loja/${LOJA}/produto/${com.id}`;
  cartao.setAttribute("data-abre-produto", com.id);
  cartao.textContent = "cartão";
  document.body.appendChild(cartao);
  const mais = document.createElement("a");
  mais.href = `/loja/${LOJA}/produto/${com.id}`;
  mais.setAttribute("data-adicionar-produto", com.id);
  document.body.appendChild(mais);

  const alvo = document.createElement("div");
  document.body.appendChild(alvo);
  const raiz = createRoot(alvo);
  raizes.push(raiz);
  const carregar = vi.fn(opts.carregar ?? (async () => com));
  act(() => {
    raiz.render(
      <JanelaDoProduto
        apelidoDaLoja={LOJA}
        rotulos={ROTULOS}
        rotuloDoCatalogo="Cardápio"
        produtoInicial={opts.inicial ? com : null}
        carregarProduto={carregar}
      />,
    );
  });
  return {
    cartao,
    mais,
    carregar,
    janela: () => document.querySelector("dialog")!,
  };
}

describe("fechar e foco", () => {
  it("[CA-32] @spec:AC-10932 aberta pelo cartão, fechar desfaz a entrada do histórico (voltar)", async () => {
    const voltar = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => {});
    const { cartao, janela } = montarComCartao();

    await act(async () => cartao.click());
    expect(window.location.pathname).toBe(`/loja/${LOJA}/produto/${com.id}`);
    expect(janela().hasAttribute("open")).toBe(true);

    act(() => janela().close());
    expect(voltar).toHaveBeenCalledTimes(1);
  });

  it("[CA-32] @spec:AC-10932 aberta pelo link direto, fechar troca o endereço pelo do catálogo", () => {
    window.history.replaceState(null, "", `/loja/${LOJA}/produto/${com.id}`);
    const trocar = vi.spyOn(window.history, "replaceState");
    const { janela } = montarComCartao({ inicial: true });

    act(() => janela().close());
    expect(trocar).toHaveBeenCalledWith(null, "", `/loja/${LOJA}/cardapio`);
  });

  it("[CA-29] @spec:AC-10929 fechar devolve o foco ao cartão de onde a pessoa veio", async () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { cartao, janela } = montarComCartao();
    await act(async () => cartao.click());
    (document.activeElement as HTMLElement | null)?.blur?.();

    act(() => janela().close());
    expect(document.activeElement).toBe(cartao);
  });

  it("[CA-29] @spec:AC-10929 no link direto o foco cai no cartão do mesmo produto", () => {
    window.history.replaceState(null, "", `/loja/${LOJA}/produto/${com.id}`);
    const { cartao, janela } = montarComCartao({ inicial: true });

    act(() => janela().close());
    expect(document.activeElement).toBe(cartao);
  });
});

describe('o "+" do cartão', () => {
  it("[CA-33] @spec:AC-10934 só o produto simples entra direto; com escolha obrigatória abre a janela", async () => {
    const simples = naTela();
    const obrigatorio = naTela({
      grupos: [
        grupo(10, "Ponto", "INGREDIENT", [opcao(11, "Ao ponto")], {
          minimo: 1,
          maximo: 1,
        }),
      ],
    });
    expect(eProdutoSimples(simples)).toBe(true);
    expect(eProdutoSimples(obrigatorio)).toBe(false);
    expect(
      eProdutoSimples(
        naTela({
          variacoes: [
            {
              id: ID_DE(61),
              nome: "P",
              precoCentavos: 1,
              precoAnteriorCentavos: null,
              disponivel: true,
              padrao: true,
              valoresDosEixos: [],
            },
            {
              id: ID_DE(62),
              nome: "G",
              precoCentavos: 2,
              precoAnteriorCentavos: null,
              disponivel: true,
              padrao: false,
              valoresDosEixos: [],
            },
          ],
        }),
      ),
    ).toBe(false);

    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const { mais, janela } = montarComCartao({
      carregar: vi.fn(async () => obrigatorio),
    });
    await act(async () => mais.click());
    expect(janela().hasAttribute("open")).toBe(true);
    expect(fetchFalso).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("item enviado", () => {
  it("[CA-34] @spec:AC-10935 adicionar envia os mesmos campos de sempre", async () => {
    const aoAdicionar = vi.fn(async () => {});
    const produto = naTela({
      aceitaObservacao: true,
      grupos: [grupo(40, "Adicionais", "ADDON", [opcao(41, "Bacon")])],
    });
    const { caixa, desmontar } = montar(produto, { aoAdicionar });

    marcar(caixa, "Bacon");
    const obs = caixa.querySelector<HTMLTextAreaElement>("textarea")!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(obs, "sem cebola");
      obs.dispatchEvent(new Event("input", { bubbles: true }));
    });
    clicar(botaoDeAdicionar(caixa));
    await act(async () => {});

    expect(aoAdicionar).toHaveBeenCalledWith({
      produtoId: produto.id,
      variacaoId: null,
      quantidade: 1,
      observacao: "sem cebola",
      escolhas: [{ grupoId: ID_DE(40), itemId: ID_DE(41), quantidade: 1 }],
    });
    expect(lido(caixa)).toContain("Bacon");
    desmontar();
  });
});
