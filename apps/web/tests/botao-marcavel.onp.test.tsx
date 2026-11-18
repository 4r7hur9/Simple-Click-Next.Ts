// @vitest-environment jsdom
/**
 * Pulso do botão marcável (card #104, T-10403): decorativo, só na transição
 * de desmarcado para marcado, e nunca ao carregar a página.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BotaoMarcavel, IconeBrilho } from "@simpleclick/ui";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

function desenhar(marcado: boolean): void {
  if (!container) {
    container = document.createElement("div");
    document.body.append(container);
    raiz = createRoot(container);
  }
  act(() =>
    raiz?.render(
      <BotaoMarcavel
        marcado={marcado}
        soIcone
        icone={<IconeBrilho preenchido={marcado} />}
      >
        Curtir
      </BotaoMarcavel>,
    ),
  );
}

const botao = (): HTMLButtonElement => {
  const achado = container?.querySelector("button");
  if (!achado) throw new Error("botão não renderizado");
  return achado;
};

describe("pulso do curtir", () => {
  it("[CA-6] @spec:AC-10406 já marcado ao carregar: sem pulso", () => {
    desenhar(true);
    expect(botao().getAttribute("aria-pressed")).toBe("true");
    expect(botao().hasAttribute("data-pulso")).toBe(false);
  });

  it("[CA-6] @spec:AC-10406 ao marcar, pulsa; ao fim da animação, o pulso sai", () => {
    desenhar(false);
    expect(botao().hasAttribute("data-pulso")).toBe(false);

    desenhar(true);
    expect(botao().getAttribute("aria-pressed")).toBe("true");
    expect(botao().hasAttribute("data-pulso")).toBe(true);

    // O jsdom não declara `animation` no estilo, e então o React escuta o nome
    // com prefixo. O navegador de verdade usa `animationend`; dispara-se os dois.
    act(() => {
      for (const nome of ["animationend", "webkitAnimationEnd"]) {
        botao().dispatchEvent(new Event(nome, { bubbles: true }));
      }
    });
    expect(botao().hasAttribute("data-pulso")).toBe(false);
  });

  it("[CA-6] @spec:AC-10406 ao desmarcar, não pulsa, e o nome do botão continua o mesmo", () => {
    desenhar(true);
    desenhar(false);
    expect(botao().hasAttribute("data-pulso")).toBe(false);
    expect(botao().getAttribute("aria-pressed")).toBe("false");
    expect(botao().textContent).toBe("Curtir");
  });
});
