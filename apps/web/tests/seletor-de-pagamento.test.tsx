// @vitest-environment jsdom
/**
 * Prova da escolha da forma de pagamento na tela (AC-512, AC-513).
 *
 * A regra de QUAIS formas existem já está provada no domínio
 * (`apps/api/src/modules/orders/pagamento.test.ts`). Aqui a pergunta é se a
 * escolha chega a quem paga de um jeito operável — inclusive para quem navega
 * por teclado e ouve a página.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  SeletorDePagamento,
  type FormaParaEscolher,
} from "../src/features/checkout/SeletorDePagamento";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

const TRES_FORMAS: readonly FormaParaEscolher[] = [
  { forma: "PIX", rotulo: "PIX", perguntaTroco: false },
  { forma: "CASH", rotulo: "Dinheiro", perguntaTroco: true },
  {
    forma: "CARD_ON_DELIVERY",
    rotulo: "Cartão na entrega",
    perguntaTroco: false,
  },
];

function montar(
  propriedades: Parameters<typeof SeletorDePagamento>[0],
): HTMLElement {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() => raiz?.render(<SeletorDePagamento {...propriedades} />));
  return container;
}

function opcoes(dentro: HTMLElement): HTMLInputElement[] {
  return [...dentro.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
}

describe("escolha da forma de pagamento (AC-512)", () => {
  it("@spec:AC-512 as três formas configuradas aparecem como opção", () => {
    const tela = montar({ formas: TRES_FORMAS });

    expect(opcoes(tela).map((o) => o.value)).toEqual([
      "PIX",
      "CASH",
      "CARD_ON_DELIVERY",
    ]);
  });

  it("@spec:AC-512 cada opção tem rótulo ligado a ela, e o grupo tem nome", () => {
    // Sem o `label` ligado, quem usa leitor de tela ouve "botão de rádio" sem
    // saber de qual forma se trata; sem a legenda, não sabe nem que a pergunta
    // é sobre pagamento.
    const tela = montar({ formas: TRES_FORMAS });

    for (const opcao of opcoes(tela)) {
      const rotulo = tela.querySelector(`label[for="${opcao.id}"]`);
      expect(rotulo, `opção ${opcao.value} sem rótulo`).not.toBeNull();
      expect(rotulo?.textContent?.trim()).not.toBe("");
    }
    expect(tela.querySelector("fieldset > legend")?.textContent).toContain(
      "Forma de pagamento",
    );
  });

  it("@spec:AC-512 escolher dinheiro revela o campo de troco", async () => {
    const tela = montar({ formas: TRES_FORMAS, totalEmCentavos: 3500 });

    expect(tela.textContent).not.toContain("troco");

    const dinheiro = opcoes(tela).find((o) => o.value === "CASH");
    await act(async () => {
      dinheiro?.click();
    });

    expect(tela.textContent).toContain("troco");
    // A dica traz o total: é o número que a pessoa precisa para responder.
    expect(tela.textContent).toContain("R$ 35,00");
  });

  it("@spec:AC-512 sair do dinheiro esconde o campo de troco de novo", async () => {
    const tela = montar({ formas: TRES_FORMAS, escolhida: "CASH" });
    expect(tela.textContent).toContain("troco");

    const pix = opcoes(tela).find((o) => o.value === "PIX");
    await act(async () => {
      pix?.click();
    });

    expect(tela.textContent).not.toContain("troco");
  });

  it("@spec:AC-512 a escolha é avisada a quem monta o pedido", async () => {
    const escolhas: string[] = [];
    const tela = montar({
      formas: TRES_FORMAS,
      aoEscolher: (forma) => escolhas.push(forma),
    });

    await act(async () => {
      opcoes(tela)
        .find((o) => o.value === "CARD_ON_DELIVERY")
        ?.click();
    });

    expect(escolhas).toEqual(["CARD_ON_DELIVERY"]);
  });

  it("@spec:AC-512 loja que só aceita PIX mostra uma opção, e não um grupo vazio", () => {
    const tela = montar({ formas: [TRES_FORMAS[0]!] });

    expect(opcoes(tela)).toHaveLength(1);
    expect(opcoes(tela)[0]?.checked).toBe(true);
  });
});

describe("nada de cartão na tela (AC-513)", () => {
  it("@spec:AC-513 nenhum campo pede número de cartão, nem com cartão escolhido", () => {
    // "Cartão na entrega" é combinação com o entregador. Se a escolha revelasse
    // um formulário de cartão, o sistema estaria cobrando — que é justamente o
    // que a versão 1 promete não fazer.
    const tela = montar({ formas: TRES_FORMAS, escolhida: "CARD_ON_DELIVERY" });

    const camposDeTexto = [
      ...tela.querySelectorAll<HTMLInputElement>('input:not([type="radio"])'),
    ];
    for (const campo of camposDeTexto) {
      const descricao = `${campo.name} ${campo.id} ${campo.getAttribute("autocomplete") ?? ""}`;
      expect(descricao.toLowerCase()).not.toContain("card");
      expect(descricao.toLowerCase()).not.toContain("cartao");
      expect(descricao.toLowerCase()).not.toContain("cc-");
    }
  });
});
