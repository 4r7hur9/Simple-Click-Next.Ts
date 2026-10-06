/**
 * Prova das peças puras do painel (T-805): a união dos dois rankings e o
 * preenchimento dos dias e das horas sem venda.
 *
 * O banco só devolve o que existe. É aqui que a segunda-feira parada e a
 * madrugada sem pedido viram zero em vez de sumirem do gráfico, e é aqui que
 * o produto barato que sai muito e o caro que sai pouco ficam os dois na
 * lista que a tela reordena.
 */
import { describe, expect, it } from "vitest";

import type { ProdutoVendido } from "./consultas.ts";
import {
  completarDias,
  completarHoras,
  unirRankings,
} from "./metricas.usecase.ts";
import { resolverPeriodo } from "./periodo.ts";

const SAO_PAULO = "America/Sao_Paulo";

function produto(
  nome: string,
  quantidade: number,
  totalCentavos: number,
  produtoId: string | null = `id-${nome}`,
): ProdutoVendido {
  return { produtoId, nome, quantidade, totalCentavos };
}

describe("os mais vendidos, por quantidade e por valor (AC-807)", () => {
  it("@spec:AC-807 a lista une os líderes dos dois critérios, ordenada por quantidade, com quantidade e valor de cada um", () => {
    const porQuantidade = [
      produto("Pão de queijo", 40, 20_000),
      produto("Café", 30, 15_000),
    ];
    const porValor = [
      produto("Bolo inteiro", 2, 24_000),
      produto("Pão de queijo", 40, 20_000),
    ];

    const lista = unirRankings(porQuantidade, porValor);

    expect(lista).toEqual([
      {
        produtoId: "id-Pão de queijo",
        nome: "Pão de queijo",
        quantidade: 40,
        totalCentavos: 20_000,
      },
      {
        produtoId: "id-Café",
        nome: "Café",
        quantidade: 30,
        totalCentavos: 15_000,
      },
      {
        produtoId: "id-Bolo inteiro",
        nome: "Bolo inteiro",
        quantidade: 2,
        totalCentavos: 24_000,
      },
    ]);

    // A tela alterna para valor sem voltar ao servidor: o líder em valor
    // está na lista, mesmo vendendo pouco.
    const porValorNaTela = [...lista].sort(
      (a, b) => b.totalCentavos - a.totalCentavos,
    );
    expect(porValorNaTela.map((p) => p.nome)).toEqual([
      "Bolo inteiro",
      "Pão de queijo",
      "Café",
    ]);
  });

  it("@spec:AC-807 empate em quantidade desempata pelo valor, e o produto apagado (sem identificador) continua contado pelo nome", () => {
    const lista = unirRankings(
      [
        produto("Suco", 5, 2_500),
        produto("Água", 5, 1_500),
        produto("Combo antigo", 5, 2_500, null),
      ],
      [],
    );

    expect(lista.map((p) => p.nome)).toEqual(["Combo antigo", "Suco", "Água"]);
    expect(lista[0]?.produtoId).toBeNull();
  });
});

describe("a evolução por dia mostra o dia parado (AC-808)", () => {
  it("@spec:AC-808 sete dias com venda em três deles viram sete pontos, os outros quatro em zero", () => {
    const resultado = resolverPeriodo(
      { atalho: "7d" },
      new Date("2026-09-27T15:00:00.000Z"),
      SAO_PAULO,
    );
    if (!resultado.ok) throw new Error(resultado.explicacao);

    const serie = completarDias(resultado.periodo, [
      { dia: "2026-09-21", pedidos: 3, vendidoCentavos: 9_000 },
      { dia: "2026-09-24", pedidos: 1, vendidoCentavos: 2_500 },
      { dia: "2026-09-27", pedidos: 2, vendidoCentavos: 4_000 },
    ]);

    expect(serie).toEqual([
      { dia: "2026-09-21", pedidos: 3, vendidoCentavos: 9_000 },
      { dia: "2026-09-22", pedidos: 0, vendidoCentavos: 0 },
      { dia: "2026-09-23", pedidos: 0, vendidoCentavos: 0 },
      { dia: "2026-09-24", pedidos: 1, vendidoCentavos: 2_500 },
      { dia: "2026-09-25", pedidos: 0, vendidoCentavos: 0 },
      { dia: "2026-09-26", pedidos: 0, vendidoCentavos: 0 },
      { dia: "2026-09-27", pedidos: 2, vendidoCentavos: 4_000 },
    ]);
  });

  it("@spec:AC-808 período sem venda nenhuma ainda tem um ponto por dia", () => {
    const resultado = resolverPeriodo(
      { atalho: "3d" },
      new Date("2026-09-27T15:00:00.000Z"),
      SAO_PAULO,
    );
    if (!resultado.ok) throw new Error(resultado.explicacao);

    const serie = completarDias(resultado.periodo, []);

    expect(serie.map((p) => p.dia)).toEqual([
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
    expect(serie.every((p) => p.pedidos === 0 && p.vendidoCentavos === 0)).toBe(
      true,
    );
  });
});

describe("a distribuição por hora mostra a hora parada (AC-809)", () => {
  it("@spec:AC-809 movimento concentrado no fim da tarde vira 24 horas, com as horas sem pedido em zero", () => {
    const horas = completarHoras([
      { hora: 17, pedidos: 4, vendidoCentavos: 12_000 },
      { hora: 18, pedidos: 9, vendidoCentavos: 30_000 },
      { hora: 19, pedidos: 6, vendidoCentavos: 18_000 },
    ]);

    expect(horas).toHaveLength(24);
    expect(horas.map((h) => h.hora)).toEqual(
      Array.from({ length: 24 }, (_, hora) => hora),
    );
    expect(horas[18]).toEqual({
      hora: 18,
      pedidos: 9,
      vendidoCentavos: 30_000,
    });
    expect(horas[3]).toEqual({ hora: 3, pedidos: 0, vendidoCentavos: 0 });

    // A faixa de maior movimento é identificável: a hora de pico é a 18.
    const pico = horas.reduce((maior, h) =>
      h.pedidos > maior.pedidos ? h : maior,
    );
    expect(pico.hora).toBe(18);
    expect(horas.filter((h) => h.pedidos === 0)).toHaveLength(21);
  });
});
