/**
 * Prova do preço vigente (AC-410, AC-503).
 *
 * A regra é PURA e mora no core porque dois módulos a usam: a página do produto
 * para mostrar, a conferência do carrinho para cobrar. Provar uma vez prova os
 * dois — e é isso que impede a vitrine anunciar promoção e o fechamento cobrar
 * o preço cheio.
 */
import { describe, expect, it } from "vitest";

import {
  precoQueVale,
  precoValeAgora,
  type PrecoCadastrado,
} from "./preco-vigente.ts";

const AGORA = new Date("2026-08-25T15:00:00Z");

function preco(sobrescrita: Partial<PrecoCadastrado> = {}): PrecoCadastrado {
  return {
    tipo: "BASE",
    valorEmCentavos: 2000,
    quantidadeMinima: 1,
    ativo: true,
    comecaEm: null,
    terminaEm: null,
    ...sobrescrita,
  };
}

describe("qual preço vale agora (AC-410)", () => {
  it("@spec:AC-410 sem promoção, vale o base e não há preço 'de'", () => {
    expect(precoQueVale([preco()], AGORA)).toEqual({
      atualEmCentavos: 2000,
      anteriorEmCentavos: null,
    });
  });

  it("@spec:AC-410 promoção valendo vira o preço, e o base vira o 'de'", () => {
    const vigente = precoQueVale(
      [preco(), preco({ tipo: "PROMO", valorEmCentavos: 1500 })],
      AGORA,
    );

    expect(vigente.atualEmCentavos).toBe(1500);
    expect(vigente.anteriorEmCentavos).toBe(2000);
  });

  it("@spec:AC-410 promoção MAIOR que o base não vira preço 'de' mentiroso", () => {
    // Base igual ou menor que a promoção é cadastro errado, e riscá-lo mentiria
    // sobre o desconto.
    const vigente = precoQueVale(
      [preco(), preco({ tipo: "PROMO", valorEmCentavos: 2500 })],
      AGORA,
    );

    expect(vigente.anteriorEmCentavos).toBeNull();
  });

  it("@spec:AC-410 promoção fora da janela não vale", () => {
    const vigente = precoQueVale(
      [
        preco(),
        preco({
          tipo: "PROMO",
          valorEmCentavos: 1500,
          terminaEm: new Date("2026-08-25T14:00:00Z"),
        }),
      ],
      AGORA,
    );

    expect(vigente.atualEmCentavos).toBe(2000);
  });

  it("@spec:AC-410 o fim da janela é EXCLUSIVO", () => {
    // Promoção que termina às 15h não vale às 15h em ponto.
    expect(precoValeAgora(preco({ terminaEm: AGORA }), AGORA)).toBe(false);
  });

  it("@spec:AC-410 preço desligado não vale", () => {
    expect(precoQueVale([preco({ ativo: false })], AGORA).atualEmCentavos).toBe(
      null,
    );
  });

  it("@spec:AC-410 sem preço nenhum, o resultado é NULO — e não zero", () => {
    // Nulo faz o item ser retirado com explicação; zero o faria sair de graça.
    expect(precoQueVale([], AGORA).atualEmCentavos).toBeNull();
  });

  it("@spec:AC-410 preço de atacado não é o preço de quem leva uma", () => {
    const vigente = precoQueVale(
      [preco({ valorEmCentavos: 1200, quantidadeMinima: 10 })],
      AGORA,
    );

    expect(vigente.atualEmCentavos).toBeNull();
  });

  it("@spec:AC-503 na quantidade certa, o atacado passa a valer", () => {
    const vigente = precoQueVale(
      [preco({ valorEmCentavos: 1200, quantidadeMinima: 10 })],
      AGORA,
      10,
    );

    expect(vigente.atualEmCentavos).toBe(1200);
  });

  it("@spec:AC-503 entre dois do mesmo tipo valendo, vale o MENOR", () => {
    // Cadastro sobreposto é engano do dono; cobrar o maior por engano dele é o
    // cliente pagando a conta.
    const vigente = precoQueVale(
      [preco({ valorEmCentavos: 2000 }), preco({ valorEmCentavos: 1800 })],
      AGORA,
    );

    expect(vigente.atualEmCentavos).toBe(1800);
  });
});
