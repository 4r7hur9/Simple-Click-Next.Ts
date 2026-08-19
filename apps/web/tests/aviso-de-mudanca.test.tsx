// @vitest-environment jsdom
/**
 * Prova do aviso de mudança na tela (AC-503).
 *
 * A comparação já está provada em `packages/core` e contra o banco. Aqui a
 * pergunta é se a pessoa CONSEGUE decidir: se ela vê o que mudou, item por
 * item, com o nome, e se o fechamento espera a confirmação dela.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  AvisoDeMudanca,
  type MudancaNaTela,
} from "../src/features/checkout/AvisoDeMudanca";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

const SUBIU: MudancaNaTela = {
  itemId: "i1",
  tipo: "PRECO_SUBIU",
  explicacao: "Marmita executiva subiu de R$ 20,00 para R$ 25,00.",
};
const SUMIU: MudancaNaTela = {
  itemId: "i2",
  tipo: "SAIU_DO_CATALOGO",
  explicacao:
    "Um item do seu carrinho não está mais no cardápio e foi retirado.",
};

function montar(
  sobrescrita: Partial<Parameters<typeof AvisoDeMudanca>[0]> = {},
): HTMLElement {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() =>
    raiz?.render(
      <AvisoDeMudanca
        mudancas={[SUBIU]}
        novoTotal="R$ 50,00"
        aoConfirmar={() => {}}
        {...sobrescrita}
      />,
    ),
  );
  return container;
}

function botao(dentro: HTMLElement, trecho: string): HTMLButtonElement {
  const achado = [...dentro.querySelectorAll("button")].find((candidato) =>
    (candidato.textContent ?? "").includes(trecho),
  );
  if (!achado) throw new Error(`não existe botão com "${trecho}"`);
  return achado;
}

describe("o que mudou aparece item por item (AC-503)", () => {
  it("@spec:AC-503 cada mudança aparece com o que mudou e os dois valores", () => {
    const tela = montar();

    expect(tela.textContent).toContain("Preço aumentou");
    expect(tela.textContent).toContain("R$ 20,00");
    expect(tela.textContent).toContain("R$ 25,00");
  });

  it("@spec:AC-503 o novo total é mostrado junto, e não escondido atrás do aviso", () => {
    expect(montar().textContent).toContain("R$ 50,00");
  });

  it("@spec:AC-503 a tela nomeia o item que o servidor não conseguiu nomear", () => {
    // Produto que saiu do cardápio some do que o servidor enxerga. Quem sabe o
    // nome é esta tela, que está mostrando o carrinho — e sem o nome o cliente
    // não sabe qual dos itens dele foi retirado.
    const tela = montar({
      mudancas: [SUMIU],
      nomesDoCarrinho: { i2: "Torta de limão" },
    });

    expect(tela.textContent).toContain("Torta de limão");
    expect(tela.textContent).not.toContain("Um item do seu carrinho");
  });

  it("@spec:AC-503 sem o nome à mão, o texto genérico ainda é dito por inteiro", () => {
    const tela = montar({ mudancas: [SUMIU] });

    expect(tela.textContent).toContain("não está mais no cardápio");
  });

  it("@spec:AC-503 várias mudanças aparecem todas, e o título diz quantas", () => {
    const tela = montar({ mudancas: [SUBIU, SUMIU] });

    expect(tela.textContent).toContain("2 coisas mudaram");
    expect(tela.querySelectorAll("li")).toHaveLength(2);
  });

  it("@spec:AC-503 o aviso é anunciado a quem ouve a página, e não só pintado", () => {
    const tela = montar();

    expect(
      tela.querySelector('[role="status"], [role="alert"]'),
    ).not.toBeNull();
  });
});

describe("o fechamento espera a confirmação (AC-503)", () => {
  it("@spec:AC-503 só prossegue quando a pessoa confirma", async () => {
    let confirmou = false;
    const tela = montar({
      aoConfirmar: () => {
        confirmou = true;
      },
    });

    expect(confirmou).toBe(false);
    await act(async () => {
      botao(tela, "Confirmar e continuar").click();
    });

    expect(confirmou).toBe(true);
  });

  it("@spec:AC-503 existe caminho de volta para quem não aceita a mudança", async () => {
    // Confirmar não pode ser a única saída: quem viu o preço subir precisa
    // poder tirar o item em vez de aceitar.
    let voltou = false;
    const tela = montar({
      aoVoltarAoCarrinho: () => {
        voltou = true;
      },
    });

    await act(async () => {
      botao(tela, "Voltar ao carrinho").click();
    });

    expect(voltou).toBe(true);
  });

  it("@spec:AC-503 sem mudança nenhuma o aviso não aparece", () => {
    // Aviso que aparece sempre treina o cliente a fechar sem ler, e aí ele
    // deixa de proteger justamente quando importa.
    const tela = montar({ mudancas: [] });

    expect(tela.textContent).toBe("");
  });
});
