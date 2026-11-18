// @vitest-environment jsdom
/**
 * Prova de privacidade e do que fica de fora (card #110, T-11008).
 *
 * Sacola só pelo navegador, sem cache; coluna nasce vazia no servidor; nada de
 * cupom, desconto, parcela, previsão ou "compra segura" (itens "A decidir").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../src/features/carrinho/forma-da-sacola.ts", () => ({
  PONTO_DA_COLUNA: 1280,
  formaDaSacolaAgora: () => "barra",
  useFormaDaSacola: () => "barra",
}));

vi.mock("../src/features/carrinho/ver-pela-conferencia.ts", () => ({
  lerResumoDaSacola: async () => ({ contagem: 1, total: "R$ 20,00" }),
  verPelaConferencia: async () => ({
    itens: [
      {
        id: "i1",
        nome: "Camiseta",
        quantidade: 1,
        precoUnitario: "R$ 20,00",
        totalDaLinha: "R$ 20,00",
      },
    ],
    totalDeItens: 1,
    total: "R$ 20,00",
  }),
}));

import { renderToString } from "react-dom/server";

import { CarrinhoFlutuante } from "../src/features/carrinho/CarrinhoFlutuante";
import { contarItensDoCarrinho } from "../src/lib/carrinho-do-navegador";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const PROIBIDO = /cupom|desconto|parcel|previs|compra segura/i;

let raiz: Root | null = null;
let alto: HTMLDivElement | null = null;
const preparar = vi.fn();

beforeEach(() => {
  preparar.mockReset();
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  alto?.remove();
  raiz = null;
  alto = null;
  vi.restoreAllMocks();
});

function elemento() {
  return (
    <CarrinhoFlutuante
      apelidoDaLoja="sabor"
      rotuloDoCatalogo="Cardápio"
      prepararFechamento={preparar}
    />
  );
}

describe("[CA-26] sacola e conta só pelo navegador, sem cache (AC-11026)", () => {
  it("[CA-26] @spec:AC-11026 a leitura da sacola leva cookie e 'no-store'", async () => {
    const buscar = vi.fn(
      async () =>
        new Response(JSON.stringify({ totalDeItens: 0, itens: [] }), {
          status: 200,
        }),
    );
    await contarItensDoCarrinho("sabor", buscar as unknown as typeof fetch);

    const opcoes = (
      buscar.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    expect(opcoes.cache).toBe("no-store");
    expect(opcoes.credentials).toBe("include");
  });

  it("[CA-26] @spec:AC-11026 a ilha renderizada no servidor não traz itens nem total", () => {
    const html = renderToString(elemento());

    expect(html).not.toContain("Camiseta");
    expect(html).not.toContain("R$ 20,00");
  });
});

describe("[CA-27] sem dados pessoais em registro (AC-11027)", () => {
  it("[CA-27] @spec:AC-11027 abrir a sacola não registra nada nem prepara o fechamento", async () => {
    const espioes = (["log", "info", "warn", "error"] as const).map((n) =>
      vi.spyOn(console, n).mockImplementation(() => {}),
    );
    alto = document.createElement("div");
    document.body.append(alto);
    raiz = createRoot(alto);
    await act(async () => raiz?.render(elemento()));

    expect(preparar).not.toHaveBeenCalled();
    for (const espiao of espioes) expect(espiao).not.toHaveBeenCalled();
  });
});

describe("[CA-23] nada de 'A decidir' na tela (AC-11023)", () => {
  it("[CA-23] @spec:AC-11023 o diálogo da sacola não tem cupom, desconto, parcela, previsão nem 'compra segura'", async () => {
    alto = document.createElement("div");
    document.body.append(alto);
    raiz = createRoot(alto);
    await act(async () => raiz?.render(elemento()));
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("sc:abrir-sacola", { detail: { atendido: false } }),
      );
    });

    expect(document.querySelector("dialog[open]")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(PROIBIDO);
  });
});
