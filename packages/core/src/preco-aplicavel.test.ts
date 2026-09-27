/**
 * Prova do preço cobrado por item (AC-309, AC-310, AC-311).
 *
 * A regra é pura e mora no core porque a conferência do carrinho e o pedido a
 * usam para COBRAR, e a vitrine usa a vizinha `precoQueVale` para ANUNCIAR.
 * Os cenários abaixo são os dos critérios, com os números dos critérios.
 */
import { describe, expect, it } from "vitest";

import { precoAplicavel } from "./preco-aplicavel.ts";
import { precoQueVale, type PrecoCadastrado } from "./preco-vigente.ts";

const AGORA = new Date("2026-09-26T15:00:00Z");

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

describe("preço base e promocional (AC-309)", () => {
  it("@spec:AC-309 promoção ativa de R$ 15,00 é o que se paga, com R$ 20,00 riscado", () => {
    const precos = [preco(), preco({ tipo: "PROMO", valorEmCentavos: 1500 })];

    const cobrado = precoAplicavel(precos, AGORA, 1);

    expect(cobrado?.unitarioEmCentavos).toBe(1500);
    expect(cobrado?.anteriorEmCentavos).toBe(2000);
    expect(cobrado?.tipo).toBe("PROMO");
    // O carrinho cobra o mesmo que a vitrine anuncia: as duas regras concordam.
    expect(precoQueVale(precos, AGORA)).toEqual({
      atualEmCentavos: 1500,
      anteriorEmCentavos: 2000,
    });
  });

  it("@spec:AC-309 promoção desativada devolve o preço base, sem nada riscado", () => {
    const precos = [
      preco(),
      preco({ tipo: "PROMO", valorEmCentavos: 1500, ativo: false }),
    ];

    const cobrado = precoAplicavel(precos, AGORA, 2);

    expect(cobrado?.unitarioEmCentavos).toBe(2000);
    expect(cobrado?.anteriorEmCentavos).toBeNull();
    expect(cobrado?.motivo).toBeNull();
    expect(cobrado?.totalEmCentavos).toBe(4000);
  });

  it("@spec:AC-309 promoção fora da janela não vale", () => {
    const precos = [
      preco(),
      preco({
        tipo: "PROMO",
        valorEmCentavos: 1500,
        terminaEm: new Date("2026-09-26T14:00:00Z"),
      }),
    ];

    expect(precoAplicavel(precos, AGORA, 1)?.unitarioEmCentavos).toBe(2000);
  });
});

describe("preço nomeado por quantidade (AC-310)", () => {
  const precos = [
    preco(),
    preco({
      tipo: "WHOLESALE",
      rotulo: "Atacado",
      valorEmCentavos: 1500,
      quantidadeMinima: 6,
    }),
  ];

  it("@spec:AC-310 com seis unidades o atacado entra sozinho e diz por quê", () => {
    const cobrado = precoAplicavel(precos, AGORA, 6);

    expect(cobrado?.unitarioEmCentavos).toBe(1500);
    expect(cobrado?.totalEmCentavos).toBe(9000);
    expect(cobrado?.rotulo).toBe("Atacado");
    expect(cobrado?.motivo).toContain("Atacado");
    expect(cobrado?.motivo).toContain("a partir de 6 unidades");
    // O preço normal fica como referência do desconto.
    expect(cobrado?.anteriorEmCentavos).toBe(2000);
  });

  it("@spec:AC-310 com cinco unidades vale o preço base, e o atacado não é anunciado como preço", () => {
    const cobrado = precoAplicavel(precos, AGORA, 5);

    expect(cobrado?.unitarioEmCentavos).toBe(2000);
    expect(cobrado?.motivo).toBeNull();
    // A vitrine nunca mostra o atacado como "o preço" de uma unidade.
    expect(precoQueVale(precos, AGORA).atualEmCentavos).toBe(2000);
  });

  it("@spec:AC-310 entre duas faixas valendo, vale a de menor preço", () => {
    const faixas = [
      ...precos,
      preco({
        tipo: "WHOLESALE",
        rotulo: "Caixa fechada",
        valorEmCentavos: 1200,
        quantidadeMinima: 12,
      }),
    ];

    expect(precoAplicavel(faixas, AGORA, 12)?.rotulo).toBe("Caixa fechada");
    expect(precoAplicavel(faixas, AGORA, 8)?.rotulo).toBe("Atacado");
  });

  it("@spec:AC-310 promoção mais barata que o atacado continua valendo", () => {
    const comPromo = [
      ...precos,
      preco({ tipo: "PROMO", valorEmCentavos: 1000 }),
    ];

    const cobrado = precoAplicavel(comPromo, AGORA, 6);
    expect(cobrado?.tipo).toBe("PROMO");
    expect(cobrado?.unitarioEmCentavos).toBe(1000);
  });

  it("@spec:AC-310 atacado sem nome recebe o nome padrão, e nunca aparece vazio", () => {
    const semNome = [
      preco(),
      preco({ tipo: "WHOLESALE", valorEmCentavos: 1500, quantidadeMinima: 6 }),
    ];

    expect(precoAplicavel(semNome, AGORA, 6)?.rotulo).toBe("Atacado");
  });
});

describe("o total do item é inteiro (AC-311)", () => {
  it("@spec:AC-311 @principle:P-005 R$ 19,99 vezes três dá 5997 centavos", () => {
    const cobrado = precoAplicavel(
      [preco({ valorEmCentavos: 1999 })],
      AGORA,
      3,
    );

    expect(cobrado?.totalEmCentavos).toBe(5997);
  });

  it("@spec:AC-311 sem preço nenhum valendo, o resultado é nulo, e não zero", () => {
    expect(precoAplicavel([], AGORA, 1)).toBeNull();
    expect(precoAplicavel([preco({ ativo: false })], AGORA, 1)).toBeNull();
  });
});
