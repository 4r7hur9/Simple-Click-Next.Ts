// @vitest-environment jsdom
/**
 * Prova do carrinho flutuante e do contador da barra (AC-500, AC-501).
 *
 * O que está sob prova é a REGRA DE APARECER: carrinho vazio não ganha barra
 * nem número; com item, a barra traz contagem e total, abre a gaveta por cima
 * do cardápio e leva ao fechamento por um link de verdade. O serviço é falso e
 * responde sem rede — a regra de negócio já está provada contra o banco.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CarrinhoFlutuante } from "../src/features/carrinho/CarrinhoFlutuante";
import { ContadorDoCarrinho } from "../src/features/carrinho/ContadorDoCarrinho";
import type {
  CarrinhoNaTela,
  ServicoDoCarrinho,
} from "../src/features/carrinho/useCarrinho";
import {
  EVENTO_CARRINHO_MUDOU,
  avisarQueOCarrinhoMudou,
} from "../src/lib/carrinho-do-navegador";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

const CHEIO: CarrinhoNaTela = {
  itens: [
    {
      id: "i1",
      nome: "Pastel de carne",
      quantidade: 2,
      precoUnitario: "R$ 9,00",
      totalDaLinha: "R$ 18,00",
    },
    {
      id: "i2",
      nome: "Guaraná",
      quantidade: 1,
      precoUnitario: "R$ 6,00",
      totalDaLinha: "R$ 6,00",
    },
  ],
  totalDeItens: 3,
  total: "R$ 24,00",
};

const VAZIO: CarrinhoNaTela = { itens: [], totalDeItens: 0, total: "R$ 0,00" };

/** Um serviço que devolve sempre o mesmo carrinho, e conta quantas vezes viu. */
function servicoCom(carrinho: CarrinhoNaTela): ServicoDoCarrinho & {
  readonly vezes: () => number;
} {
  let vezes = 0;
  return {
    vezes: () => vezes,
    async ver() {
      vezes += 1;
      return carrinho;
    },
    async mudarQuantidade() {
      return carrinho;
    },
  };
}

async function montar(elemento: React.ReactElement): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(elemento);
  });
  return container;
}

describe("a barra só existe quando há o que mostrar (AC-500)", () => {
  it("@spec:AC-500 carrinho vazio não ganha barra flutuante", async () => {
    const tela = await montar(
      <CarrinhoFlutuante
        apelidoDaLoja="sabor"
        linkDoFechamento="/l/sabor/checkout"
        linkDaVitrine="/l/sabor/catalogo"
        servico={servicoCom(VAZIO)}
      />,
    );

    expect(tela.innerHTML).toBe("");
  });

  it("@spec:AC-500 com itens, a barra traz a contagem TOTAL e o total em dinheiro", async () => {
    const tela = await montar(
      <CarrinhoFlutuante
        apelidoDaLoja="sabor"
        linkDoFechamento="/l/sabor/checkout"
        linkDaVitrine="/l/sabor/catalogo"
        servico={servicoCom(CHEIO)}
      />,
    );

    // Duas linhas, três itens: o número é o de unidades, e não o de linhas.
    expect(tela.textContent).toContain("3 itens");
    expect(tela.textContent).toContain("R$ 24,00");
  });

  it("@spec:AC-500 fechar o pedido é um LINK para o fechamento, e não um botão", async () => {
    const tela = await montar(
      <CarrinhoFlutuante
        apelidoDaLoja="sabor"
        linkDoFechamento="/l/sabor/checkout"
        linkDaVitrine="/l/sabor/catalogo"
        servico={servicoCom(CHEIO)}
      />,
    );

    const link = [...tela.querySelectorAll("a")].find(
      (a) => a.getAttribute("href") === "/l/sabor/checkout",
    );
    expect(link?.textContent).toContain("Fechar pedido");
  });
});

describe("a gaveta abre por cima do cardápio (AC-501)", () => {
  it("@spec:AC-501 tocar na barra abre a gaveta com os itens, e Esc fecha", async () => {
    const tela = await montar(
      <CarrinhoFlutuante
        apelidoDaLoja="sabor"
        linkDoFechamento="/l/sabor/checkout"
        linkDaVitrine="/l/sabor/catalogo"
        servico={servicoCom(CHEIO)}
      />,
    );

    const abrir = tela.querySelector<HTMLButtonElement>(
      'button[aria-expanded="false"]',
    );
    expect(abrir).not.toBeNull();
    await act(async () => {
      abrir?.click();
    });

    const gaveta = tela.querySelector("#carrinho-flutuante");
    expect(gaveta?.textContent).toContain("Pastel de carne");
    expect(gaveta?.textContent).toContain("Guaraná");
    // Aberta, a barra aponta para a gaveta — e só aberta, porque apontar para
    // um `id` que não existe é violação de acessibilidade.
    expect(
      tela
        .querySelector('button[aria-expanded="true"]')
        ?.getAttribute("aria-controls"),
    ).toBe("carrinho-flutuante");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(tela.querySelector("#carrinho-flutuante")).toBeNull();
  });

  it("@spec:AC-501 o aviso de carrinho mudado faz a barra recarregar", async () => {
    const servico = servicoCom(CHEIO);
    await montar(
      <CarrinhoFlutuante
        apelidoDaLoja="sabor"
        linkDoFechamento="/l/sabor/checkout"
        linkDaVitrine="/l/sabor/catalogo"
        servico={servico}
      />,
    );
    const antes = servico.vezes();

    await act(async () => {
      avisarQueOCarrinhoMudou();
    });

    expect(servico.vezes()).toBe(antes + 1);
  });
});

describe("o contador da barra do topo", () => {
  /** Um `fetch` falso que responde o carrinho cru da API. */
  function buscarCom(totalDeItens: number): typeof fetch {
    return async () =>
      new Response(JSON.stringify({ itens: [], totalDeItens }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
  }

  it("@spec:AC-500 carrinho vazio não ganha número ao lado do ícone", async () => {
    const tela = await montar(
      <ContadorDoCarrinho apelidoDaLoja="sabor" buscar={buscarCom(0)} />,
    );

    expect(tela.innerHTML).toBe("");
  });

  it("@spec:AC-500 com itens, o número aparece e diz o que é para quem ouve", async () => {
    const tela = await montar(
      <ContadorDoCarrinho apelidoDaLoja="sabor" buscar={buscarCom(2)} />,
    );

    expect(tela.querySelector(".sc-contador")?.textContent).toContain("2");
    expect(tela.textContent).toContain("itens no carrinho");
  });

  it("@spec:AC-500 o contador reconta quando a página avisa que o carrinho mudou", async () => {
    let chamadas = 0;
    const buscar: typeof fetch = async () => {
      chamadas += 1;
      return new Response(JSON.stringify({ itens: [], totalDeItens: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    await montar(<ContadorDoCarrinho apelidoDaLoja="sabor" buscar={buscar} />);
    const antes = chamadas;

    await act(async () => {
      window.dispatchEvent(new Event(EVENTO_CARRINHO_MUDOU));
    });

    expect(chamadas).toBe(antes + 1);
  });
});
