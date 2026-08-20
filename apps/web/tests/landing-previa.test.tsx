// @vitest-environment jsdom
/**
 * Prova da prévia viva (AC-939, AC-940).
 *
 * O que está sob prova é o que diferencia esta landing: a pessoa digita o nome
 * do negócio dela e escolhe uma cor, e vê a loja tomar forma com o MESMO ajuste
 * de contraste que o produto faz. Concorrente mostra captura de tela; aqui o
 * produto se mostra.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { PreviaDaLoja } from "../src/features/landing/PreviaDaLoja";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

const ITENS = [
  { nome: "Pastel de carne", detalhe: "Ponto: Bem passado", preco: "R$ 18,00" },
  { nome: "Caldo de cana", detalhe: "500 ml", preco: "R$ 7,00" },
];

const MENSAGEM = "*Pedido A-1042*\n\n*Itens*\n2x Pastel de carne — R$ 18,00";

function montar(): HTMLElement {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() =>
    raiz?.render(
      <PreviaDaLoja itens={ITENS} total="R$ 32,00" mensagem={MENSAGEM} />,
    ),
  );
  return container;
}

function digitar(elemento: HTMLInputElement, texto: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(elemento, texto);
  elemento.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("a prévia mostra a loja de quem chegou (AC-939)", () => {
  it("@spec:AC-939 o nome digitado aparece na loja, na hora", () => {
    const tela = montar();
    const campo = tela.querySelector<HTMLInputElement>("input[type='text']");
    expect(campo).not.toBeNull();

    act(() => digitar(campo as HTMLInputElement, "Pastelaria do Zé"));

    expect(tela.querySelector(".sc-previa__nome-da-loja")?.textContent).toBe(
      "Pastelaria do Zé",
    );
  });

  it("@spec:AC-939 antes de digitar, a loja tem um nome de exemplo, e não um vazio", () => {
    // Moldura de celular com nome em branco lê como defeito, e a pessoa fecha
    // antes de entender o que era para ver.
    const tela = montar();

    expect(tela.querySelector(".sc-previa__nome-da-loja")?.textContent).toBe(
      "Sua Loja",
    );
  });

  it("@spec:AC-939 a marca mostra as iniciais do nome digitado", () => {
    const tela = montar();
    const campo = tela.querySelector<HTMLInputElement>("input[type='text']");

    act(() => digitar(campo as HTMLInputElement, "Pastelaria do Zé"));

    // "do" é ligação e não vira inicial; "Zé" é o nome da pessoa e vira.
    expect(tela.querySelector(".sc-previa__marca")?.textContent).toBe("PZ");
  });

  it("@spec:AC-939 escolher a cor repinta a loja de verdade", () => {
    // É a prova do argumento: duas escolhas produzem duas lojas visivelmente
    // diferentes, com o contraste ajustado pelo design system.
    const tela = montar();
    const antes = tela.querySelector(".sc-previa__tela")?.getAttribute("style");

    const cores = [
      ...tela.querySelectorAll<HTMLInputElement>("input[type='radio']"),
    ];
    expect(cores.length).toBeGreaterThan(1);

    act(() => cores[3]?.click());

    const depois = tela
      .querySelector(".sc-previa__tela")
      ?.getAttribute("style");
    expect(depois).not.toBe(antes);
    expect(depois).toContain("--cor-primaria");
  });

  it("@spec:AC-939 @principle:P-012 a escolha de cor é alcançável por teclado", () => {
    // Esconder o controle com `display: none` o tiraria da ordem de foco, e quem
    // navega por teclado perderia a escolha de cor por completo.
    const tela = montar();

    for (const cor of tela.querySelectorAll<HTMLInputElement>(
      "input[type='radio']",
    )) {
      expect(cor.style.display).not.toBe("none");
      expect(cor.disabled).toBe(false);
    }
  });

  it("@spec:AC-939 cada cor tem nome de coisa, e não de código", () => {
    // "Índigo" e "#1b3a6b" não dizem nada a quem vende pastel.
    const tela = montar();
    const nomes = [...tela.querySelectorAll(".sc-previa__cor-nome")].map(
      (n) => n.textContent,
    );

    expect(nomes).toContain("Brasa");
    expect(nomes.join(" ")).not.toContain("#");
  });
});

describe("a prévia mostra a mensagem que o cliente manda (AC-940)", () => {
  it("@spec:AC-940 a mensagem aparece como ela chega, com as quebras de linha", () => {
    // O dono já sabe como uma mensagem de pedido deveria parecer, porque recebe
    // pedido no WhatsApp todo dia. É isso que faz ele confiar antes de testar.
    const tela = montar();
    const mensagem = tela.querySelector(".sc-previa__mensagem");

    expect(mensagem?.textContent).toBe(MENSAGEM);
    expect(mensagem?.tagName.toLowerCase()).toBe("pre");
  });

  it("@spec:AC-940 os itens e o total do exemplo aparecem na loja", () => {
    const lido = montar().textContent ?? "";

    expect(lido).toContain("Pastel de carne");
    expect(lido).toContain("R$ 32,00");
  });

  it("@spec:AC-940 a tela NÃO calcula nada: itens e total chegam prontos", () => {
    // Preço calculado na tela é o erro que a versão 1 deste produto cometeu
    // (P-006). Aqui os valores só são exibidos.
    const fonte = PreviaDaLoja.toString();

    expect(fonte).not.toContain("reduce");
    expect(fonte).not.toMatch(/\*\s*quantidade|centavos\s*\//);
  });
});
