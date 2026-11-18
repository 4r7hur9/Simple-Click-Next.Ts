// @vitest-environment jsdom
/**
 * A sacola no topo da loja (card #105): contagem lida no navegador, anunciada
 * como "Sacola, N itens" e que abre a MESMA sacola da loja.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clicar, desmontar, exigir, montar } from "./apoio-config.tsx";

const ambiente = vi.hoisted(() => ({
  contagem: vi.fn(async (_apelido: string): Promise<number | null> => 0),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: ambiente.push, replace: vi.fn() }),
}));

vi.mock("../src/lib/carrinho-do-navegador.ts", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  contarItensDoCarrinho: (apelido: string) => ambiente.contagem(apelido),
}));

import { CarrinhoFlutuante } from "../src/features/carrinho/CarrinhoFlutuante.tsx";
import {
  SacolaDoTopo,
  textoDaSacola,
} from "../src/features/usuario/SacolaDoTopo.tsx";
import {
  AVISO_DE_CARRINHO_MUDOU,
  EVENTO_ABRIR_SACOLA,
  type PedidoDeAbrirASacola,
} from "../src/lib/carrinho-do-navegador.ts";
import { contarItensDaSacola } from "../src/lib/contagem-da-sacola.ts";

beforeEach(() => {
  ambiente.contagem.mockReset();
  ambiente.contagem.mockResolvedValue(0);
  ambiente.push.mockReset();
});
afterEach(desmontar);

async function sacola(apelido = "padaria") {
  const tela = montar(<SacolaDoTopo apelido={apelido} />);
  await act(async () => {});
  return tela;
}
const botao = (tela: HTMLElement) =>
  exigir<HTMLButtonElement>(tela, ".sc-sacola-topo");

describe("a contagem", () => {
  it("[CA-22] @spec:AC-10509 com 3 itens mostra 3 e o nome é 'Sacola, 3 itens'", async () => {
    ambiente.contagem.mockResolvedValue(3);
    const tela = await sacola();
    expect(botao(tela).getAttribute("aria-label")).toBe("Sacola, 3 itens");
    expect(tela.querySelector(".sc-sacola-topo__contagem")?.textContent).toBe(
      "3",
    );
    expect(ambiente.contagem).toHaveBeenCalledWith("padaria");
  });

  it("[CA-22] @spec:AC-10509 com um item o nome é 'Sacola, 1 item'", async () => {
    ambiente.contagem.mockResolvedValue(1);
    const tela = await sacola();
    expect(botao(tela).getAttribute("aria-label")).toBe("Sacola, 1 item");
    expect(textoDaSacola(2)).toBe("Sacola, 2 itens");
  });

  it("[CA-22] @spec:AC-10509 vazia: o ícone aparece sem número", async () => {
    const tela = await sacola();
    expect(botao(tela).getAttribute("aria-label")).toBe("Sacola, vazia");
    expect(tela.querySelector(".sc-sacola-topo__contagem")).toBeNull();
  });

  it("[CA-22] @spec:AC-10509 se a API não responder, o ícone segue sem número", async () => {
    ambiente.contagem.mockResolvedValue(null);
    const tela = await sacola();
    expect(tela.querySelector(".sc-sacola-topo__contagem")).toBeNull();
  });

  it("[CA-22] @spec:AC-10509 atualiza a cada aviso de mudança do carrinho e anuncia a mudança", async () => {
    ambiente.contagem.mockResolvedValue(1);
    const tela = await sacola();
    expect(exigir(tela, '[role="status"]').textContent).toBe("");

    ambiente.contagem.mockResolvedValue(4);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(AVISO_DE_CARRINHO_MUDOU));
    });
    expect(botao(tela).getAttribute("aria-label")).toBe("Sacola, 4 itens");
    expect(exigir(tela, '[role="status"]').textContent).toBe("Sacola, 4 itens");
  });

  it("[CA-22] @spec:AC-10509 o HTML desenhado no servidor sai sem número (a contagem é do navegador)", () => {
    const html = renderToStaticMarkup(<SacolaDoTopo apelido="padaria" />);
    expect(html).not.toContain("sc-sacola-topo__contagem");
    expect(html).toContain("Sacola, vazia");
    expect(ambiente.contagem).not.toHaveBeenCalled();
  });

  it("[CA-22] @spec:AC-10509 pedidos iguais em voo dividem uma só chamada e nada fica em cache", async () => {
    let resolver: (n: number) => void = () => undefined;
    const contar = vi
      .fn<(apelido: string) => Promise<number | null>>()
      .mockImplementationOnce(
        () => new Promise<number | null>((ok) => (resolver = ok)),
      )
      .mockResolvedValue(5);
    const a = contarItensDaSacola("loja-x", contar);
    const b = contarItensDaSacola("loja-x", contar);
    expect(contar).toHaveBeenCalledTimes(1);
    resolver(2);
    expect(await a).toBe(2);
    expect(await b).toBe(2);
    // Resolvido: a próxima pergunta vai de novo.
    expect(await contarItensDaSacola("loja-x", contar)).toBe(5);
    expect(contar).toHaveBeenCalledTimes(2);
  });
});

describe("abrir a sacola", () => {
  it("[CA-23] @spec:AC-10510 dispara o pedido e, se a sacola da página atende, não navega", async () => {
    const tela = await sacola();
    const pedidos: PedidoDeAbrirASacola[] = [];
    const ouvinte = (evento: Event) => {
      const pedido = (evento as CustomEvent<PedidoDeAbrirASacola>).detail;
      pedidos.push(pedido);
      pedido.atendido = true;
    };
    window.addEventListener(EVENTO_ABRIR_SACOLA, ouvinte);
    clicar(botao(tela));
    window.removeEventListener(EVENTO_ABRIR_SACOLA, ouvinte);
    expect(pedidos).toHaveLength(1);
    expect(ambiente.push).not.toHaveBeenCalled();
  });

  it("[CA-23] @spec:AC-10510 sem sacola montada leva à página da sacola da loja (endereço da propriedade)", async () => {
    const tela = await sacola("loja do zé/1");
    clicar(botao(tela));
    expect(ambiente.push).toHaveBeenCalledWith(
      "/loja/loja%20do%20z%C3%A9%2F1/carrinho",
    );
  });

  it("[CA-23] @spec:AC-10510 um evento com destino escrito por outro script não muda para onde vai", async () => {
    const tela = await sacola("padaria");
    const ouvinte = (evento: Event) => {
      (evento as CustomEvent<Record<string, unknown>>).detail["destino"] =
        "https://evil.example";
    };
    window.addEventListener(EVENTO_ABRIR_SACOLA, ouvinte);
    clicar(botao(tela));
    window.removeEventListener(EVENTO_ABRIR_SACOLA, ouvinte);
    expect(ambiente.push).toHaveBeenCalledWith("/loja/padaria/carrinho");
  });

  it("[CA-23] @spec:AC-10510 o CarrinhoFlutuante ouve o pedido, abre a mesma sacola e marca atendido", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    });
    ambiente.contagem.mockResolvedValue(2);
    const carrinho = montar(
      <CarrinhoFlutuante
        apelidoDaLoja="padaria"
        rotuloDoCatalogo="Cardápio"
        carregarProduto={async () => null}
      />,
    );
    await act(async () => {});
    const gaveta = exigir<HTMLDialogElement>(carrinho, "dialog");
    expect(gaveta.hasAttribute("open")).toBe(false);

    const pedido: PedidoDeAbrirASacola = { atendido: false };
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(EVENTO_ABRIR_SACOLA, { detail: pedido }),
      );
    });
    expect(pedido.atendido).toBe(true);
    expect(gaveta.hasAttribute("open")).toBe(true);
  });
});
