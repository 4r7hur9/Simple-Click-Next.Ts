/**
 * Prova das faixas de atacado com desconto (card #53).
 */
import { describe, expect, it } from "vitest";

import {
  faixasValidas,
  precoNoAtacado,
  problemasDasFaixas,
  unitarioNaFaixa,
  type FaixaDeAtacado,
} from "./atacado.ts";

const pct = (quantidadeMinima: number, desconto: number): FaixaDeAtacado => ({
  quantidadeMinima,
  tipoDeDesconto: "PERCENTUAL",
  desconto,
});
const reais = (quantidadeMinima: number, desconto: number): FaixaDeAtacado => ({
  quantidadeMinima,
  tipoDeDesconto: "VALOR",
  desconto,
});

const CRESCENTE = [pct(10, 5), pct(50, 10), pct(100, 15)];

describe("sem faixa: só varejo", () => {
  it("cobra o varejo e não tem pedido mínimo", () => {
    const r = precoNoAtacado(2000, 30, []);
    expect(r.unitarioEmCentavos).toBe(2000);
    expect(r.totalEmCentavos).toBe(60_000);
    expect(r.economiaEmCentavos).toBe(0);
    expect(r.faixaAplicada).toBeNull();
    expect(r.proximaFaixa).toBeNull();
    expect(r.faltamParaProxima).toBeNull();
    expect(r.pedidoMinimoDoAtacado).toBeNull();
  });
});

describe("borda de quantidade", () => {
  it("uma unidade abaixo da faixa é varejo, e diz quanto falta", () => {
    const r = precoNoAtacado(2000, 9, [pct(10, 5)]);
    expect(r.unitarioEmCentavos).toBe(2000);
    expect(r.faixaAplicada).toBeNull();
    expect(r.proximaFaixa?.quantidadeMinima).toBe(10);
    expect(r.faltamParaProxima).toBe(1);
    expect(r.pedidoMinimoDoAtacado).toBe(10);
  });

  it("exatamente na quantidade mínima já vale a faixa", () => {
    const r = precoNoAtacado(2000, 10, [pct(10, 5)]);
    expect(r.unitarioEmCentavos).toBe(1900);
    expect(r.faixaAplicada?.quantidadeMinima).toBe(10);
    expect(r.totalEmCentavos).toBe(19_000);
    expect(r.economiaEmCentavos).toBe(1000);
    expect(r.proximaFaixa).toBeNull();
    expect(r.faltamParaProxima).toBeNull();
  });

  it("quantidade quebrada ou zero conta como unidades inteiras, mínimo 1", () => {
    expect(precoNoAtacado(2000, 0, [pct(10, 5)]).quantidade).toBe(1);
    expect(precoNoAtacado(2000, 10.9, [pct(10, 5)]).unitarioEmCentavos).toBe(
      1900,
    );
  });
});

describe("percentual e valor em reais", () => {
  it("percentual sobre o preço, arredondado ao centavo", () => {
    // 1999 × 95% = 1899,05 → 1899.
    expect(unitarioNaFaixa(1999, pct(2, 5))).toBe(1899);
    // 1990 × 85% = 1691,5 → meio centavo sobe: 1692.
    expect(unitarioNaFaixa(1990, pct(2, 15))).toBe(1692);
  });

  it("valor em reais tira os centavos de cada unidade", () => {
    const r = precoNoAtacado(2000, 12, [reais(12, 250)]);
    expect(r.unitarioEmCentavos).toBe(1750);
    expect(r.totalEmCentavos).toBe(21_000);
    expect(r.faixaAplicada?.descontoPorUnidadeEmCentavos).toBe(250);
  });
});

describe("crescente (10 = 5%, 50 = 10%, 100 = 15%)", () => {
  it.each([
    { quantidade: 9, unitario: 2000, faixa: null, proxima: 10, faltam: 1 },
    { quantidade: 10, unitario: 1900, faixa: 10, proxima: 50, faltam: 40 },
    { quantidade: 49, unitario: 1900, faixa: 10, proxima: 50, faltam: 1 },
    { quantidade: 50, unitario: 1800, faixa: 50, proxima: 100, faltam: 50 },
    { quantidade: 99, unitario: 1800, faixa: 50, proxima: 100, faltam: 1 },
    {
      quantidade: 100,
      unitario: 1700,
      faixa: 100,
      proxima: null,
      faltam: null,
    },
    {
      quantidade: 500,
      unitario: 1700,
      faixa: 100,
      proxima: null,
      faltam: null,
    },
  ])(
    "levando $quantidade: unitário $unitario, faixa $faixa, próxima $proxima, faltam $faltam",
    ({ quantidade, unitario, faixa, proxima, faltam }) => {
      const r = precoNoAtacado(2000, quantidade, CRESCENTE);
      expect(r.unitarioEmCentavos).toBe(unitario);
      expect(r.faixaAplicada?.quantidadeMinima ?? null).toBe(faixa);
      expect(r.proximaFaixa?.quantidadeMinima ?? null).toBe(proxima);
      expect(r.faltamParaProxima).toBe(faltam);
      expect(r.pedidoMinimoDoAtacado).toBe(10);
    },
  );

  it("a ordem do cadastro não importa", () => {
    const r = precoNoAtacado(2000, 60, [...CRESCENTE].reverse());
    expect(r.faixaAplicada?.quantidadeMinima).toBe(50);
  });
});

describe("desconto maior que o preço", () => {
  it("faixa em reais igual ou maior que o preço é ignorada", () => {
    expect(unitarioNaFaixa(500, reais(2, 500))).toBeNull();
    expect(unitarioNaFaixa(500, reais(2, 800))).toBeNull();
    const r = precoNoAtacado(500, 20, [reais(10, 800)]);
    expect(r.unitarioEmCentavos).toBe(500);
    expect(r.faixaAplicada).toBeNull();
    expect(r.pedidoMinimoDoAtacado).toBeNull();
  });

  it("na crescente, a faixa que não cabe cai e vale a anterior", () => {
    // Promoção baixou o preço para R$ 3,00: a faixa de R$ 3,50 não cabe.
    const r = precoNoAtacado(300, 100, [reais(10, 100), reais(100, 350)]);
    expect(r.unitarioEmCentavos).toBe(200);
    expect(r.faixaAplicada?.quantidadeMinima).toBe(10);
    expect(r.proximaFaixa).toBeNull();
  });

  it("percentual que zeraria o preço não vale", () => {
    expect(unitarioNaFaixa(1, pct(2, 50))).toBeNull();
    expect(unitarioNaFaixa(2000, pct(2, 100))).toBeNull();
  });
});

describe("cadastro torto não faz quem leva mais pagar mais", () => {
  it("faixa maior com desconto menor é descartada", () => {
    const validas = faixasValidas(2000, [pct(10, 10), pct(50, 5)]);
    expect(validas.map((f) => f.quantidadeMinima)).toEqual([10]);
  });

  it("faixa abaixo de 2 unidades é descartada", () => {
    expect(faixasValidas(2000, [pct(1, 10)])).toEqual([]);
  });
});

describe("problemasDasFaixas (as travas da 0064)", () => {
  it("cadastro crescente correto não tem problema", () => {
    expect(problemasDasFaixas(CRESCENTE, 2000)).toEqual([]);
    expect(problemasDasFaixas([])).toEqual([]);
  });

  it("aponta cada trava", () => {
    const mensagens = (faixas: FaixaDeAtacado[], preco?: number) =>
      problemasDasFaixas(faixas, preco).map((p) => p.mensagem);

    expect(mensagens([pct(1, 5)])).toContain(
      "O atacado começa a partir de 2 unidades.",
    );
    expect(mensagens([pct(10, 0)])).toContain(
      "O desconto precisa ser maior que zero.",
    );
    expect(mensagens([pct(10, 100)])).toContain(
      "O desconto percentual vai de 1% a 99%.",
    );
    expect(mensagens([reais(10, 2000)], 2000)).toContain(
      "O desconto em reais precisa ser menor que o preço do produto.",
    );
    expect(mensagens([pct(10, 5), reais(20, 500)])).toContain(
      "Use o mesmo tipo de desconto em todas as faixas.",
    );
    expect(mensagens([pct(10, 5), pct(10, 8)])).toContain(
      "Já existe uma faixa com essa quantidade.",
    );
    expect(mensagens([pct(10, 5), pct(50, 5)])).toContain(
      "Quem leva mais precisa ganhar um desconto maior.",
    );
  });

  it("aponta a linha do problema", () => {
    const [problema] = problemasDasFaixas([pct(50, 5), pct(10, 8)]);
    expect(problema?.indice).toBe(0);
  });
});
