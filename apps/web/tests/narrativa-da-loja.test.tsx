// @vitest-environment jsdom
/**
 * Prova da narrativa por rolagem (P-011, P-012).
 *
 * O que está sob prova é a SEPARAÇÃO: que a animação é camada, e não requisito.
 * A pergunta que importa não é "a animação roda?", é "o que sobra quando ela não
 * roda?" — porque é isso que acontece com script bloqueado, com erro de
 * carregamento, e com quem pediu para parar de mexer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ApresentacaoDaLoja,
  type LojaNaTela,
} from "../src/features/loja/ApresentacaoDaLoja";
import { NarrativaDaLoja } from "../src/features/loja/NarrativaDaLoja";

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

const LOJA: LojaNaTela = {
  apelido: "sabor-e-cia",
  nome: "Sabor & Cia",
  boasVindas: "Comida caseira todo dia",
  logo: null,
  capa: null,
  formasDeEntrega: ["DELIVERY", "PICKUP"],
  enderecoParaRetirada: null,
};

/** Põe a apresentação no documento, como o servidor a entrega. */
function comAApresentacaoNaPagina(): void {
  document.body.innerHTML = renderToStaticMarkup(
    <ApresentacaoDaLoja
      loja={LOJA}
      abertura={{ aberta: true, proximaAbertura: null, motivo: "ABERTA" }}
      linkDoCardapio="/l/sabor-e-cia/cardapio"
    />,
  );
}

/** Monta a narrativa sobre o que já está na página. */
function montarNarrativa(): void {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() => raiz?.render(<NarrativaDaLoja />));
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

describe("a animação é camada, e não requisito (P-011)", () => {
  it("@principle:P-011 a narrativa não desenha conteúdo nenhum", () => {
    // Se ela desenhasse, o conteúdo dependeria de script para existir — e a
    // página deixaria de abrir em rede ruim e de ser encontrada pelo buscador.
    comMovimentoReduzido(false);
    comAApresentacaoNaPagina();
    const antes = document.body.textContent ?? "";

    montarNarrativa();

    expect(container?.innerHTML).toBe("");
    expect(document.body.textContent).toContain(antes.slice(0, 40));
  });

  it("@principle:P-011 com a página sem as seções, a narrativa não estoura", () => {
    // Acontece quando alguém muda a marcação e esquece dela. Estourar aqui
    // derrubaria a página inteira por causa de um enfeite.
    comMovimentoReduzido(false);
    document.body.innerHTML = "<main><p>página sem narrativa</p></main>";

    expect(() => montarNarrativa()).not.toThrow();
    expect(document.body.textContent).toContain("página sem narrativa");
  });
});

describe("movimento reduzido entrega o estado final (P-012)", () => {
  it("@principle:P-012 quem pediu para parar de mexer continua vendo TUDO", () => {
    // É o erro que este teste existe para impedir: sair cedo da animação
    // deixando o elemento invisível. A pessoa ficaria sem o conteúdo, não sem a
    // animação.
    comMovimentoReduzido(true);
    comAApresentacaoNaPagina();

    montarNarrativa();

    const conteudos = [
      ...document.querySelectorAll<HTMLElement>(".sc-secao__conteudo"),
    ];
    expect(conteudos.length).toBeGreaterThan(0);
    for (const conteudo of conteudos) {
      // Nada foi escondido: sem opacidade zerada, sem deslocamento.
      expect(conteudo.style.opacity).not.toBe("0");
      expect(conteudo.style.transform ?? "").not.toContain("translate");
    }
    expect(document.body.textContent).toContain("Comida caseira todo dia");
  });

  it("@principle:P-012 o texto continua legível com movimento reduzido", () => {
    comMovimentoReduzido(true);
    comAApresentacaoNaPagina();
    montarNarrativa();

    expect(document.body.textContent).toContain("Sabor & Cia");
    expect(document.body.textContent).toContain("Ver o cardápio");
  });
});

describe("a narrativa se desfaz ao sair (P-011)", () => {
  it("@principle:P-011 desmontar limpa o que foi criado", () => {
    // No App Router o componente monta e desmonta a cada navegação. O que não
    // for destruído continua escutando a rolagem de uma página que já não
    // existe, e depois de cinco navegações a página engasga.
    comMovimentoReduzido(false);
    comAApresentacaoNaPagina();
    montarNarrativa();

    expect(() => act(() => raiz?.unmount())).not.toThrow();
    raiz = null;

    // E o conteúdo sobrevive ao desmonte: ele nunca foi da narrativa.
    expect(document.body.textContent).toContain("Sabor & Cia");
  });
});
