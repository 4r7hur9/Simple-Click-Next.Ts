import { esquemaDeMetricasDaConta } from "@simpleclick/contracts";
import { describe, expect, it } from "vitest";

import { calcularMetricasDaConta, type PedidoParaMetricas } from "./metricas.ts";

function pedido(...[id, loja, status, entrega, total, quando]: [string, string, string, string, number, string]): PedidoParaMetricas {
  return { id, lojaApelido: loja, lojaNome: `Loja ${loja}`, status, entrega, totalCentavos: total, criadoEm: new Date(quando) };
}

const pedidos = [
  pedido("a", "x", "COMPLETED", "DELIVERY", 3000, "2026-10-10T15:00:00Z"), // 12h em São Paulo, sábado
  pedido("b", "x", "PENDING", "PICKUP", 1000, "2026-10-12T22:00:00Z"),
  pedido("c", "y", "COMPLETED", "DELIVERY", 2000, "2026-09-20T15:00:00Z"),
  pedido("d", "y", "CANCELLED", "DELIVERY", 9999, "2026-10-01T15:00:00Z"),
];
const itens = [
  { pedidoId: "a", produto: "Pastel", quantidade: 2, totalCentavos: 2000 },
  { pedidoId: "b", produto: "Pastel", quantidade: 1, totalCentavos: 1000 },
  { pedidoId: "a", produto: "Suco", quantidade: 1, totalCentavos: 1000 },
  { pedidoId: "c", produto: "Pastel", quantidade: 9, totalCentavos: 9000 },
];

describe("métricas do cliente", () => {
  const m = calcularMetricasDaConta(pedidos, itens, "2026-10-01", "2026-10-16");

  it("respeita o contrato", () => {
    expect(esquemaDeMetricasDaConta.safeParse(m).success).toBe(true);
  });

  it("soma o período sem contar cancelados e mede o ticket médio", () => {
    expect(m.resumo).toMatchObject({ pedidos: 2, gastoCentavos: 4000, ticketMedioCentavos: 2000, cancelados: 1, lojasDistintas: 1, entregues: 1, retiradas: 1 });
  });

  it("compara com o período anterior de mesmo tamanho", () => {
    expect(m.anterior).toEqual({ de: "2026-09-15", ate: "2026-09-30" });
    expect(m.resumoAnterior).toMatchObject({ pedidos: 1, gastoCentavos: 2000 });
  });

  it("ranqueia produtos só do período e lojas", () => {
    expect(m.topProdutos[0]).toMatchObject({ nome: "Pastel", vezes: 3, gastoCentavos: 3000 });
    expect(m.topLojas[0]).toMatchObject({ apelido: "x", pedidos: 2 });
  });

  it("monta 6 meses, dia da semana e hora no fuso de São Paulo", () => {
    expect(m.gastoPorMes.map((x) => x.mes)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(m.gastoPorMes[4]).toMatchObject({ gastoCentavos: 2000 });
    expect(m.pedidosPorHora[12]).toBe(1);
    expect(m.pedidosPorDiaDaSemana[6]).toBe(1);
  });

  it("sem pedidos devolve zeros", () => {
    const vazio = calcularMetricasDaConta([], [], "2026-10-01", "2026-10-16");
    expect(vazio.resumo.gastoCentavos).toBe(0);
    expect(vazio.topProdutos).toEqual([]);
  });
});
