import { describe, expect, it } from "vitest";

import {
  calcularMetricas,
  estaEmAndamento,
  filtrarPedidos,
  lerFiltro,
  lojasDosPedidos,
} from "../src/lib/conta-do-cliente.ts";

function pedido(...[id, loja, status, total, criadoEm]: [string, string, string, number, string]) {
  return {
    id,
    loja: { nome: `Loja ${loja}`, apelido: loja },
    numero: 1,
    codigo: id,
    status,
    entrega: "DELIVERY",
    totalCentavos: total,
    quantidadeDeItens: 1,
    criadoEm,
    atualizadoEm: criadoEm,
  } as never;
}

const agora = new Date("2026-10-16T12:00:00");
const pedidos = [
  pedido("a", "x", "COMPLETED", 1000, "2026-10-10T12:00:00"),
  pedido("b", "x", "PENDING", 500, "2026-10-15T12:00:00"),
  pedido("c", "y", "COMPLETED", 2000, "2026-09-20T12:00:00"),
  pedido("d", "y", "CANCELLED", 9999, "2026-10-01T12:00:00"),
];

describe("métricas do cliente", () => {
  const m = calcularMetricas(pedidos, agora);

  it("soma gasto do mês, do mês anterior e total sem contar cancelados", () => {
    expect(m.gastoDoMesCentavos).toBe(1500);
    expect(m.gastoDoMesAnteriorCentavos).toBe(2000);
    expect(m.gastoTotalCentavos).toBe(3500);
    expect(m.totalDePedidos).toBe(4);
    expect(m.variacaoDoGastoPercentual).toBe(-25);
  });

  it("separa o pedido em andamento e ordena os últimos", () => {
    expect(m.emAndamento.map((p) => p.id)).toEqual(["b"]);
    expect(m.ultimos[0]?.id).toBe("b");
  });

  it("ranqueia as lojas por pedidos", () => {
    expect(m.lojasMaisUsadas[0]?.apelido).toBe("x");
  });

  it("sem mês anterior não inventa percentual", () => {
    expect(calcularMetricas([pedidos[0]!], agora).variacaoDoGastoPercentual).toBeNull();
  });
});

describe("filtros dos pedidos", () => {
  it("filtra por situação, loja e período", () => {
    expect(filtrarPedidos(pedidos, lerFiltro({ situacao: "andamento" }), agora)).toHaveLength(1);
    expect(filtrarPedidos(pedidos, lerFiltro({ situacao: "cancelados" }), agora)).toHaveLength(1);
    expect(filtrarPedidos(pedidos, lerFiltro({ loja: "y" }), agora)).toHaveLength(2);
    expect(filtrarPedidos(pedidos, lerFiltro({ periodo: "7" }), agora).map((p) => p.id)).toEqual(["b", "a"].sort().reverse().sort());
  });

  it("valor desconhecido volta ao padrão", () => {
    expect(lerFiltro({ situacao: "x", periodo: "1" })).toEqual({ situacao: "todos", periodo: "todos", loja: "" });
  });

  it("lista as lojas e reconhece o andamento", () => {
    expect(lojasDosPedidos(pedidos)).toHaveLength(2);
    expect(estaEmAndamento("PREPARING")).toBe(true);
    expect(estaEmAndamento("COMPLETED")).toBe(false);
  });
});
