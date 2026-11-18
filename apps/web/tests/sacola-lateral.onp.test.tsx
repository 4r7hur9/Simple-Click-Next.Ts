// @vitest-environment jsdom
/**
 * Prova da sacola lateral do computador (card #110, T-11001).
 *
 * A coluna é uma região, e não um diálogo: mostra os itens e o subtotal da
 * última conferência, não carrega dado pessoal, libera o espaço quando vazia e
 * deixa o foco ir e vir sem prendê-lo.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  ColunaDaSacola,
  ID_DO_TITULO_DA_COLUNA,
} from "../src/features/carrinho/ColunaDaSacola";
import type {
  CarrinhoNaTela,
  UsoDoCarrinho,
} from "../src/features/carrinho/useCarrinho";

// O React só aceita `act` quando o ambiente diz que é um teste.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root | null = null;
let regiao: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  regiao?.remove();
  raiz = null;
  regiao = null;
});

const CHEIO: CarrinhoNaTela = {
  itens: [
    {
      id: "i1",
      nome: "Camiseta lisa",
      variacao: "Tamanho M",
      quantidade: 2,
      precoUnitario: "R$ 20,00",
      totalDaLinha: "R$ 40,00",
      foto: {
        url: "https://exemplo.test/camiseta.jpg",
        texto: null,
        largura: 96,
        altura: 96,
      },
    },
    {
      id: "i2",
      nome: "Boné",
      quantidade: 1,
      precoUnitario: "R$ 6,99",
      totalDaLinha: "R$ 6,99",
    },
  ],
  totalDeItens: 3,
  total: "R$ 46,99",
};

function uso(sobrescrita: Partial<UsoDoCarrinho> = {}): UsoDoCarrinho {
  return {
    situacao: "pronto",
    carrinho: CHEIO,
    erro: null,
    mudarQuantidade: async () => {},
    recarregar: async () => {},
    ...sobrescrita,
  };
}

/** Monta a coluna dentro da região que o catálogo reserva para ela. */
function montar(
  carrinho: UsoDoCarrinho,
  aoFechar: () => void = () => {},
): HTMLElement {
  regiao = document.createElement("div");
  regiao.className = "sc-catalogo__sacola";
  regiao.setAttribute("data-regiao-da-sacola", "");
  document.body.append(regiao);
  raiz = createRoot(regiao);
  act(() =>
    raiz?.render(<ColunaDaSacola carrinho={carrinho} aoFechar={aoFechar} />),
  );
  return regiao;
}

describe("[CA-1] a coluna mostra itens, subtotal e o botão de fechar (AC-11001)", () => {
  it("[CA-1] @spec:AC-11001 título, quantidade de itens, linhas, subtotal, 'Fechar pedido' e a entrega no fechamento", () => {
    const aoFechar = vi.fn();
    const lateral = montar(uso(), aoFechar);

    expect(lateral.querySelector("h2")?.textContent).toBe("Sua sacola");
    expect(lateral.textContent).toContain("3 itens");
    // Cada item com foto, nome, quantidade e preço.
    expect(lateral.textContent).toContain("Camiseta lisa");
    expect(lateral.textContent).toContain("Tamanho M");
    expect(lateral.textContent).toContain("R$ 40,00");
    expect(lateral.querySelector("img")?.getAttribute("src")).toBe(
      "https://exemplo.test/camiseta.jpg",
    );
    expect(lateral.querySelectorAll(".sc-carrinho-janela__item")).toHaveLength(
      2,
    );
    // O subtotal é o da conferência do servidor, em reais.
    expect(lateral.querySelector("dl")?.textContent).toContain("R$ 46,99");
    expect(lateral.textContent).toContain("calculada no fechamento");

    const fechar = [...lateral.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Fechar pedido"),
    );
    fechar?.click();
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("[CA-1] @spec:AC-11001 é uma região com nome 'Sua sacola', e não um diálogo", () => {
    const lateral = montar(uso());

    const coluna = lateral.querySelector("aside");
    expect(coluna?.getAttribute("aria-labelledby")).toBe(
      ID_DO_TITULO_DA_COLUNA,
    );
    expect(document.getElementById(ID_DO_TITULO_DA_COLUNA)?.textContent).toBe(
      "Sua sacola",
    );
  });
});

describe("[CA-2] sem dados pessoais nem chave PIX (AC-11002)", () => {
  it("[CA-2] @spec:AC-11002 a coluna não tem telefone, endereço nem chave PIX", () => {
    const lateral = montar(uso());

    const texto = lateral.textContent ?? "";
    expect(texto).not.toMatch(/\(\d{2}\)\s?\d{4,5}-\d{4}/);
    expect(texto).not.toMatch(/PIX|chave|endereço|telefone|WhatsApp/i);
  });
});

describe("[CA-3] sacola vazia libera o espaço (AC-11003)", () => {
  it("[CA-3] @spec:AC-11003 vazia, a região fica sem nenhum filho e sem atalho", () => {
    const lateral = montar(
      uso({
        situacao: "vazio",
        carrinho: { itens: [], totalDeItens: 0, total: "R$ 0,00" },
      }),
    );

    expect(lateral.childElementCount).toBe(0);
    expect(lateral.matches(":empty")).toBe(true);
    expect(document.querySelector(".sc-sacola-atalho")).toBeNull();
  });

  it("[CA-3] @spec:AC-11003 ao remover o último item, a coluna some e a região esvazia", () => {
    const lateral = montar(uso());
    expect(lateral.childElementCount).toBe(1);

    act(() =>
      raiz?.render(
        <ColunaDaSacola
          carrinho={uso({
            situacao: "vazio",
            carrinho: { itens: [], totalDeItens: 0, total: "R$ 0,00" },
          })}
          aoFechar={() => {}}
        />,
      ),
    );

    expect(lateral.childElementCount).toBe(0);
    expect(document.querySelector(".sc-sacola-atalho")).toBeNull();
  });
});

describe("[CA-28] a coluna persistente não prende o foco nem fecha com Esc (AC-11028)", () => {
  it("[CA-28] @spec:AC-11028 sem role de diálogo, sem aria-modal e sem inert no resto da página", () => {
    const lateral = montar(uso());

    expect(lateral.querySelector('[role="dialog"], [aria-modal]')).toBeNull();
    expect(document.querySelector("[inert]")).toBeNull();
    expect(lateral.querySelector("dialog")).toBeNull();
  });

  it("[CA-28] @spec:AC-11028 o primeiro Tab da página oferece 'Ir para a sacola', que leva o foco ao título", () => {
    const antes = document.createElement("button");
    antes.textContent = "um produto";
    document.body.append(antes);
    const lateral = montar(uso());

    const primeiro = document.querySelector<HTMLElement>(
      "a[href], button, [tabindex='0']",
    );
    expect(primeiro?.textContent).toBe("Ir para a sacola");

    primeiro?.click();
    expect(document.activeElement).toBe(
      lateral.querySelector(`#${ID_DO_TITULO_DA_COLUNA}`),
    );
    antes.remove();
  });

  it("[CA-28] @spec:AC-11028 Esc dentro da coluna não a fecha nem move o foco", () => {
    const lateral = montar(uso());
    const titulo = lateral.querySelector<HTMLElement>(
      `#${ID_DO_TITULO_DA_COLUNA}`,
    );
    titulo?.focus();

    act(() => {
      titulo?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(lateral.querySelector("aside")).not.toBeNull();
    expect(document.activeElement).toBe(titulo);
  });

  it("[CA-28] @spec:AC-11028 o atalho sai junto com a coluna", () => {
    montar(uso());
    expect(document.querySelectorAll(".sc-sacola-atalho")).toHaveLength(1);

    act(() => raiz?.unmount());
    raiz = null;

    expect(document.querySelector(".sc-sacola-atalho")).toBeNull();
  });
});
