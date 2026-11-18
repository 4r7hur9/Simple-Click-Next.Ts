// @vitest-environment jsdom
/**
 * Quantidade, atacado e subtotal (card #109): a faixa marcada, o preço por
 * unidade, o subtotal e o total do botão saem da MESMA conta.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AtacadoDoProdutoNoContrato } from "@simpleclick/contracts";

import {
  faixaNoAtacado,
  unitarioNoAtacado,
} from "../src/lib/atacado-na-vitrine";
import {
  aumentar,
  botaoDeAdicionar,
  clicar,
  diminuir,
  grupo,
  ID_DE,
  lido,
  marcar,
  montar,
  naTela,
  opcao,
  textoDoBotao,
  variacao,
} from "./apoio-produto-onp";

afterEach(() => vi.unstubAllGlobals());

const faixa = (min: number, unitario: number) => ({
  quantidadeMinima: min,
  tipoDeDesconto: "PERCENTUAL" as const,
  desconto: 5,
  rotulo: null,
  unitarioCentavos: unitario,
  descontoPorUnidadeCentavos: 1000 - unitario,
});

/** Fora de ordem de propósito: 24 chega antes de 12. */
const ATACADO: AtacadoDoProdutoNoContrato = {
  pedidoMinimo: 12,
  faixas: [faixa(24, 800), faixa(12, 900)],
};

const produtoAtacado = () =>
  naTela({
    precoCentavos: 1000,
    precoAnteriorCentavos: null,
    atacado: ATACADO,
  });

function subtotal(caixa: HTMLElement): string {
  return lido(caixa.querySelector(".sc-produto__subtotal")!);
}
function linhaQueVale(caixa: HTMLElement): string {
  return lido(caixa.querySelector('tr[aria-current="true"]')!);
}

describe("faixa, unitário e subtotal", () => {
  it("[CA-16] @spec:AC-10915 de 11 para 12 a faixa, o unitário, o subtotal e o botão andam juntos", () => {
    const { caixa, desmontar } = montar(produtoAtacado());

    aumentar(caixa, 10); // 11
    expect(linhaQueVale(caixa)).toContain("1 a 11 un.");
    expect(subtotal(caixa)).toMatch(/11 × R\$\s*10,00 = R\$\s*110,00/);

    aumentar(caixa, 1); // 12
    expect(linhaQueVale(caixa)).toContain("A partir de 12 un.");
    expect(subtotal(caixa)).toMatch(/12 × R\$\s*9,00 = R\$\s*108,00/);
    expect(textoDoBotao(caixa)).toContain("108,00");
    desmontar();
  });

  it("[CA-16] @spec:AC-10915 teste de ouro: dos dois lados de cada limite, igual a unitarioNoAtacado e calcularItem", () => {
    const { caixa, desmontar } = montar(produtoAtacado());
    let quantidade = 1;
    for (const alvo of [11, 12, 23, 24, 30]) {
      aumentar(caixa, alvo - quantidade);
      quantidade = alvo;
      const unitario = unitarioNoAtacado(ATACADO, alvo) ?? 1000;
      const real = (centavos: number) =>
        centavos.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
      expect(subtotal(caixa)).toMatch(
        new RegExp(
          `${alvo} × R\\$\\s*${real(unitario / 100)} = R\\$\\s*${real((unitario * alvo) / 100)}`,
        ),
      );
      expect(textoDoBotao(caixa)).toContain(real((unitario * alvo) / 100));
      expect(faixaNoAtacado(ATACADO, alvo)?.unitarioCentavos ?? 1000).toBe(
        unitario,
      );
    }
    desmontar();
  });

  it("[CA-16] @spec:AC-10915 os adicionais entram no preço por unidade da linha, não na tabela", () => {
    const { caixa, desmontar } = montar(
      naTela({
        precoCentavos: 1000,
        precoAnteriorCentavos: null,
        atacado: ATACADO,
        grupos: [
          grupo(20, "Extras", "ADDON", [
            opcao(21, "Bacon", { acrescimoCentavos: 100 }),
          ]),
        ],
      }),
    );
    aumentar(caixa, 11); // 12
    marcar(caixa, "Bacon");
    expect(subtotal(caixa)).toMatch(/12 × R\$\s*10,00 = R\$\s*120,00/);
    expect(linhaQueVale(caixa)).toContain("R$ 9,00");
    desmontar();
  });

  it("[CA-17] @spec:AC-10916 voltar abaixo da faixa devolve o preço de varejo", () => {
    const { caixa, desmontar } = montar(produtoAtacado());
    aumentar(caixa, 11); // 12
    diminuir(caixa, 1); // 11
    expect(linhaQueVale(caixa)).toContain("1 a 11 un.");
    expect(subtotal(caixa)).toMatch(/11 × R\$\s*10,00 = R\$\s*110,00/);
    expect(textoDoBotao(caixa)).toContain("110,00");
    desmontar();
  });

  it("[CA-11] @spec:AC-10910 trocar a variação troca o preço, a tabela e o total", () => {
    const base = (precoCentavos: number, unitarioAtacado: number) => ({
      pedidoMinimo: 12,
      faixas: [faixa(12, unitarioAtacado)],
      precoCentavos,
    });
    const produto = naTela({
      precoCentavos: null,
      precoAnteriorCentavos: null,
      variacoes: [
        variacao(61, "350 ml", 500, [], { atacado: base(500, 400) }),
        variacao(62, "2 L", 1000, [], { atacado: base(1000, 800) }),
      ],
    });
    const { caixa, desmontar } = montar(produto);

    marcar(caixa, "350 ml");
    expect(lido(caixa.querySelector(".sc-produto__preco")!)).toContain("5,00");
    expect(lido(caixa.querySelector(".sc-atacado__tabela")!)).toContain(
      "R$ 4,00",
    );

    marcar(caixa, "2 L");
    expect(lido(caixa.querySelector(".sc-produto__preco")!)).toContain("10,00");
    expect(lido(caixa.querySelector(".sc-atacado__tabela")!)).toContain(
      "R$ 8,00",
    );
    expect(textoDoBotao(caixa)).toContain("10,00");
    desmontar();
  });

  it("[CA-18] @spec:AC-10917 sem variação escolhida não há linha de subtotal, há convite", () => {
    const { caixa, desmontar } = montar(
      naTela({
        precoCentavos: null,
        precoAnteriorCentavos: null,
        variacoes: [variacao(61, "P", 1000), variacao(62, "G", 1500)],
      }),
    );
    aumentar(caixa, 2);
    expect(caixa.querySelector(".sc-produto__subtotal")).toBeNull();
    expect(lido(caixa.querySelector(".sc-produto__preco-convite")!)).toBe(
      "Escolher tamanho",
    );
    desmontar();
  });
});

describe("quantidade", () => {
  it("[CA-19] @spec:AC-10918 fica entre 1 e 99, é anunciada, e os botões têm 48 px", () => {
    const { caixa, desmontar } = montar(naTela());
    const contagem = caixa.querySelector(".sc-produto__contagem")!;
    expect(contagem.getAttribute("aria-live")).toBe("polite");

    diminuir(caixa, 3);
    expect(contagem.textContent).toBe("1");
    aumentar(caixa, 150);
    expect(contagem.textContent).toBe("99");

    const css = readFileSync(
      join(process.cwd(), "packages/ui/styles/produto.css"),
      "utf8",
    );
    const bloco = /\.sc-produto__passo \{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(bloco).toContain("inline-size: 3rem");
    expect(bloco).toContain("block-size: 3rem");
    desmontar();
  });
});

describe("cardápio que mudou", () => {
  it("[CA-20] @spec:AC-10919 o 409 avisa que mudou, não fecha a janela e não confirma", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 409 })),
    );
    const aoAdicionado = vi.fn();
    const { caixa, desmontar } = montar(naTela(), { aoAdicionado });

    clicar(botaoDeAdicionar(caixa));
    await vi.waitFor(() => {
      expect(lido(caixa)).toContain("O cardápio mudou enquanto você escolhia");
    });
    expect(aoAdicionado).not.toHaveBeenCalled();
    expect(lido(caixa)).not.toContain("Adicionado à sacola");
    desmontar();
  });
});

void ID_DE;
