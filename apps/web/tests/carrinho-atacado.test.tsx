// @vitest-environment jsdom
/**
 * Prova do atacado na linha do carrinho (card #57).
 *
 * A conta é da API (`apps/api/tests/carrinho-atacado.int.test.ts`). Aqui a
 * pergunta é se a linha DIZ o que a conferência calculou: o varejo riscado ao
 * lado do preço da faixa, a faixa que já vale e quantas peças faltam para o
 * próximo desconto.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { AtacadoNoItemNoContrato } from "@simpleclick/contracts";

import {
  avisoDoAtacado,
  faixaQueValeu,
} from "../src/features/carrinho/atacado-na-linha";
import { LinhaCarrinho } from "../src/features/carrinho/LinhaCarrinho";
import type { ItemNaTela } from "../src/features/carrinho/useCarrinho";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

const CINCO_POR_CENTO = {
  quantidadeMinima: 10,
  tipoDeDesconto: "PERCENTUAL" as const,
  desconto: 5,
  rotulo: null,
  unitarioCentavos: 1900,
  descontoPorUnidadeCentavos: 100,
};

const DEZ_POR_CENTO = {
  quantidadeMinima: 50,
  tipoDeDesconto: "PERCENTUAL" as const,
  desconto: 10,
  rotulo: "Fardo",
  unitarioCentavos: 1800,
  descontoPorUnidadeCentavos: 200,
};

function renderizar(item: ItemNaTela): HTMLElement {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() =>
    raiz?.render(
      <ul>
        <LinhaCarrinho item={item} aoMudarQuantidade={() => {}} />
      </ul>,
    ),
  );
  return container;
}

describe("as frases do atacado (card #57)", () => {
  it("abaixo do mínimo: faltam N peças para o próximo desconto", () => {
    const atacado: AtacadoNoItemNoContrato = {
      pedidoMinimo: 10,
      faixaAplicada: null,
      proximaFaixa: CINCO_POR_CENTO,
      faltamParaProxima: 4,
      economiaCentavos: 0,
    };

    expect(avisoDoAtacado(atacado)).toBe(
      "Faltam 4 peças para o próximo desconto (R$ 19,00 cada a partir de 10)",
    );
    expect(faixaQueValeu(atacado)).toBeNull();
  });

  it("uma peça só: singular", () => {
    expect(
      avisoDoAtacado({
        pedidoMinimo: 10,
        faixaAplicada: null,
        proximaFaixa: CINCO_POR_CENTO,
        faltamParaProxima: 1,
        economiaCentavos: 0,
      }),
    ).toMatch(/^Falta 1 peça para o próximo desconto/);
  });

  it("na faixa: diz qual vale e quanto falta para a próxima", () => {
    const atacado: AtacadoNoItemNoContrato = {
      pedidoMinimo: 10,
      faixaAplicada: CINCO_POR_CENTO,
      proximaFaixa: DEZ_POR_CENTO,
      faltamParaProxima: 38,
      economiaCentavos: 1200,
    };

    expect(faixaQueValeu(atacado)).toBe(
      "Atacado: 5% de desconto a partir de 10 peças",
    );
    expect(avisoDoAtacado(atacado)).toMatch(/^Faltam 38 peças/);
  });

  it("na última faixa, sem aviso de próxima; desconto em reais escrito em reais", () => {
    const atacado: AtacadoNoItemNoContrato = {
      pedidoMinimo: 10,
      faixaAplicada: {
        ...DEZ_POR_CENTO,
        tipoDeDesconto: "VALOR",
        desconto: 250,
      },
      proximaFaixa: null,
      faltamParaProxima: null,
      economiaCentavos: 0,
    };

    expect(avisoDoAtacado(atacado)).toBeNull();
    expect(faixaQueValeu(atacado)).toBe(
      "Fardo: R$ 2,50 de desconto a partir de 50 peças",
    );
    expect(avisoDoAtacado(null)).toBeNull();
  });
});

describe("a linha do carrinho mostra o atacado (card #57)", () => {
  it("risca o varejo e mostra a faixa e o que falta", () => {
    const tela = renderizar({
      id: "i1",
      nome: "Copo descartável",
      quantidade: 12,
      precoUnitario: "R$ 19,00",
      totalDaLinha: "R$ 228,00",
      precoDeVarejo: "R$ 20,00",
      faixaDoAtacado: "Atacado: 5% de desconto a partir de 10 peças",
      avisoDoAtacado: "Faltam 38 peças para o próximo desconto",
    });

    const riscado = tela.querySelector("s.sc-carrinho-janela__varejo");
    expect(riscado?.textContent).toContain("R$ 20,00");
    expect(
      tela.querySelector(".sc-carrinho-janela__unitario")?.textContent,
    ).toContain("R$ 19,00");
    expect(tela.textContent).toContain(
      "Atacado: 5% de desconto a partir de 10 peças",
    );
    expect(tela.textContent).toContain(
      "Faltam 38 peças para o próximo desconto",
    );
  });

  it("no varejo, sem riscado nem aviso", () => {
    const tela = renderizar({
      id: "i2",
      nome: "Refrigerante lata",
      quantidade: 1,
      precoUnitario: "R$ 6,99",
      totalDaLinha: "R$ 6,99",
    });

    expect(tela.querySelector("s")).toBeNull();
    expect(tela.querySelector(".sc-carrinho-janela__atacado")).toBeNull();
  });
});
