// @vitest-environment jsdom
/**
 * Prova da narrativa da landing (AC-934, AC-936).
 *
 * A pergunta que importa não é "a animação roda?", é "o que sobra quando ela não
 * roda?" — porque é isso que acontece com script bloqueado, com erro de
 * carregamento, e com quem pediu para parar de mexer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { HistoriaDaLanding } from "../src/features/landing/HistoriaDaLanding";
import { NarrativaDaLanding } from "../src/features/landing/NarrativaDaLanding";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

/** Põe a história no documento, como o servidor a entrega. */
function comAHistoriaNaPagina(): void {
  document.body.innerHTML = renderToStaticMarkup(
    <HistoriaDaLanding linkParaComecar="/entrar" />,
  );
}

function montarNarrativa(): void {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() => raiz?.render(<NarrativaDaLanding />));
}

/** Simula alguém que pediu menos movimento no sistema. */
function comMovimentoReduzido(reduzido: boolean) {
  vi.stubGlobal("matchMedia", (consulta: string) => ({
    matches: reduzido && consulta.includes("reduce"),
    media: consulta,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("a animação é camada, e não requisito (AC-934)", () => {
  it("@spec:AC-934 a narrativa não desenha conteúdo nenhum", () => {
    // Se ela desenhasse, a história dependeria de script para existir — e a
    // página deixaria de abrir em rede ruim e de ser encontrada pelo buscador.
    comMovimentoReduzido(false);
    comAHistoriaNaPagina();
    const antes = document.body.textContent ?? "";

    montarNarrativa();

    expect(document.body.textContent).toContain(antes.slice(0, 60));
  });

  it("@spec:AC-934 com a página sem capítulos, a narrativa não estoura", () => {
    // Acontece quando alguém muda a marcação e esquece dela. Estourar aqui
    // derrubaria a página inteira por causa de um enfeite.
    comMovimentoReduzido(false);
    document.body.innerHTML = "<main><p>página sem capítulos</p></main>";

    expect(() => montarNarrativa()).not.toThrow();
    expect(document.body.textContent).toContain("página sem capítulos");
  });
});

describe("movimento reduzido entrega a página inteira, parada (AC-936)", () => {
  it("@spec:AC-936 quem pediu para parar de mexer continua vendo TUDO", () => {
    // É o erro que este teste existe para impedir: sair cedo da animação
    // deixando o elemento invisível. A pessoa ficaria sem o conteúdo, não sem a
    // animação.
    comMovimentoReduzido(true);
    comAHistoriaNaPagina();

    montarNarrativa();

    const conteudos = [
      ...document.querySelectorAll<HTMLElement>(".sc-lp__conteudo"),
    ];
    expect(conteudos.length).toBeGreaterThan(0);
    for (const conteudo of conteudos) {
      expect(conteudo.style.opacity).not.toBe("0");
      expect(conteudo.style.transform ?? "").not.toContain("translate");
    }
    expect(document.body.textContent).toContain("Pedido no papel");
  });

  it("@spec:AC-936 @spec:AC-935 com movimento reduzido, o mundo nem é montado", () => {
    // A decisão vem antes do download: quem pediu para parar de mexer não paga
    // pelo pacote do mundo.
    comMovimentoReduzido(true);
    comAHistoriaNaPagina();

    montarNarrativa();

    expect(document.querySelector(".sc-lp__mundo")).toBeNull();
  });
});

describe("a narrativa se desfaz ao sair (AC-934)", () => {
  it("@spec:AC-934 desmontar limpa o que foi criado, e o conteúdo sobrevive", () => {
    // No App Router o componente monta e desmonta a cada navegação. O que não
    // for destruído continua escutando a rolagem de uma página que já não
    // existe, e depois de cinco navegações a página engasga.
    comMovimentoReduzido(false);
    comAHistoriaNaPagina();
    montarNarrativa();

    expect(() => act(() => raiz?.unmount())).not.toThrow();
    raiz = null;

    expect(document.body.textContent).toContain("Seu cardápio online");
  });
});
