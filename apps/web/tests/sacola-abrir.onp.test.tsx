// @vitest-environment jsdom
/**
 * Prova do pedido de abrir a sacola (card #110, T-11003).
 *
 * O ícone do topo (#105) dispara `sc:abrir-sacola`; a sacola atende: foco no
 * título da coluna, ou o diálogo na barra; vazia, avisa sem mover o foco.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const estado = vi.hoisted(() => ({
  forma: "barra" as "barra" | "coluna",
  contagem: 2,
  atraso: false as boolean,
  liberar: null as null | (() => void),
}));

vi.mock("../src/features/carrinho/forma-da-sacola.ts", () => ({
  PONTO_DA_COLUNA: 1280,
  formaDaSacolaAgora: () => estado.forma,
  useFormaDaSacola: () => estado.forma,
}));

vi.mock("../src/features/carrinho/ver-pela-conferencia.ts", () => ({
  lerResumoDaSacola: async () => {
    if (estado.atraso) {
      await new Promise<void>((ok) => {
        estado.liberar = ok;
      });
    }
    return {
      contagem: estado.contagem,
      total: estado.contagem === 0 ? null : "R$ 40,00",
    };
  },
  verPelaConferencia: async () => ({
    itens:
      estado.contagem === 0
        ? []
        : [
            {
              id: "i1",
              nome: "Camiseta",
              quantidade: estado.contagem,
              precoUnitario: "R$ 20,00",
              totalDaLinha: "R$ 40,00",
            },
          ],
    totalDeItens: estado.contagem,
    total: "R$ 40,00",
  }),
}));

import { CarrinhoFlutuante } from "../src/features/carrinho/CarrinhoFlutuante";
import {
  EVENTO_ABRIR_SACOLA,
  type PedidoDeAbrirASacola,
} from "../src/lib/carrinho-do-navegador";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root | null = null;
let alto: HTMLDivElement | null = null;
let regiao: HTMLDivElement | null = null;
const preparar = vi.fn();

beforeEach(() => {
  estado.forma = "barra";
  estado.contagem = 2;
  estado.atraso = false;
  estado.liberar = null;
  preparar.mockReset();
  // O jsdom não implementa `<dialog>` modal.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  alto?.remove();
  regiao?.remove();
  raiz = null;
  alto = null;
  regiao = null;
});

async function montar(comRegiao = false): Promise<void> {
  if (comRegiao) {
    regiao = document.createElement("div");
    regiao.setAttribute("data-regiao-da-sacola", "");
    document.body.append(regiao);
  }
  alto = document.createElement("div");
  document.body.append(alto);
  raiz = createRoot(alto);
  await act(async () => {
    raiz?.render(
      <CarrinhoFlutuante
        apelidoDaLoja="sabor"
        rotuloDoCatalogo="Cardápio"
        prepararFechamento={preparar}
      />,
    );
  });
}

function pedir(): PedidoDeAbrirASacola {
  const pedido: PedidoDeAbrirASacola = { atendido: false };
  act(() => {
    window.dispatchEvent(
      new CustomEvent(EVENTO_ABRIR_SACOLA, { detail: pedido }),
    );
  });
  return pedido;
}

describe("[CA-6] pedido de abrir a sacola (AC-11006, AC-11029)", () => {
  it("[CA-6] @spec:AC-11006 na barra, abre o diálogo e marca o pedido como atendido", async () => {
    await montar();
    const pedido = pedir();

    expect(pedido.atendido).toBe(true);
    expect(document.querySelector("dialog[open]")).not.toBeNull();
    expect(preparar).not.toHaveBeenCalled();
  });

  it("[CA-6] @spec:AC-11006 na coluna, o foco vai ao título 'Sua sacola' e nenhum diálogo abre", async () => {
    estado.forma = "coluna";
    await montar(true);
    const pedido = pedir();

    expect(pedido.atendido).toBe(true);
    expect(document.activeElement?.textContent).toBe("Sua sacola");
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(preparar).not.toHaveBeenCalled();
  });

  it("[CA-6] @spec:AC-11006 vazia, avisa 'Sua sacola está vazia.' sem mover o foco", async () => {
    estado.contagem = 0;
    await montar();
    const antes = document.activeElement;
    const pedido = pedir();

    expect(pedido.atendido).toBe(true);
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(document.activeElement).toBe(antes);
    expect(document.body.textContent).toContain("Sua sacola está vazia.");
  });

  it("[CA-6] @spec:AC-11006 outro diálogo aberto: o pedido é ignorado", async () => {
    await montar();
    const outro = document.createElement("dialog");
    outro.setAttribute("open", "");
    document.body.append(outro);
    pedir();
    outro.remove();

    const abertos = document.querySelectorAll("dialog[open]");
    expect(abertos).toHaveLength(0);
  });

  it("[CA-29] @spec:AC-11029 antes da primeira leitura, a contagem 0 não vira 'vazia': abre o diálogo", async () => {
    estado.atraso = true;
    await montar();
    const pedido = pedir();

    expect(pedido.atendido).toBe(true);
    expect(document.body.textContent).not.toContain("Sua sacola está vazia.");
    expect(document.querySelector("dialog[open]")).not.toBeNull();
    await act(async () => estado.liberar?.());
  });

  it("[CA-29] @spec:AC-11029 sem suporte a <dialog> modal, não marca atendido: o topo navega", async () => {
    // @ts-expect-error simula navegador antigo
    HTMLDialogElement.prototype.showModal = undefined;
    await montar();
    const pedido = pedir();

    expect(pedido.atendido).toBe(false);
  });
});
