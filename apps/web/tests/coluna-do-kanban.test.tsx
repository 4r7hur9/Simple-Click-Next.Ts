// @vitest-environment jsdom
/**
 * Prova da lista de uma coluna do quadro (card #65): começa com um lote,
 * desenha o resto aos poucos e oferece o botão para quem vem pelo teclado.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ListaDaColuna } from "../src/features/painel-pedidos/ColunaDoKanban";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

function montar(quantos: number, lote: number): HTMLDivElement {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  const itens = Array.from(
    { length: quantos },
    (_, indice) => `#${indice + 1}`,
  );
  act(() =>
    raiz?.render(
      <ListaDaColuna
        itens={itens}
        rotulo="Pedido gerado"
        lote={lote}
        desenhar={(item) => (
          <p key={item} data-item>
            {item}
          </p>
        )}
      />,
    ),
  );
  return container;
}

describe("ListaDaColuna", () => {
  it("mostra o primeiro lote e o resto ao pedir mais", () => {
    const tela = montar(20, 8);
    expect(tela.querySelectorAll("[data-item]")).toHaveLength(8);
    const botao = tela.querySelector("button");
    expect(botao?.textContent).toBe("Mostrar mais 8 de 12");

    act(() => botao?.click());
    expect(tela.querySelectorAll("[data-item]")).toHaveLength(16);
    expect(tela.querySelector("button")?.textContent).toBe(
      "Mostrar os outros 4",
    );

    act(() => tela.querySelector("button")?.click());
    expect(tela.querySelectorAll("[data-item]")).toHaveLength(20);
    expect(tela.querySelector("button")).toBeNull();
  });

  it("é uma região com nome, alcançável pelo teclado", () => {
    const tela = montar(3, 8);
    const regiao = tela.querySelector('[role="region"]');
    expect(regiao?.getAttribute("aria-label")).toBe("Pedidos em Pedido gerado");
    expect(regiao?.getAttribute("tabindex")).toBe("0");
    expect(tela.querySelector("button")).toBeNull();
  });
});
