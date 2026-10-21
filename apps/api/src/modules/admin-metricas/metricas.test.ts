import { esquemaDasMetricasDoAdmin } from "@simpleclick/contracts";
import { describe, expect, it, vi } from "vitest";

import { conversao, montarMetricasDoAdmin, ticketMedio } from "./metricas.usecase.ts";
import type {
  NumerosDoPeriodo,
  RepositorioDasMetricasDoAdmin,
} from "./metricas.repo.ts";
import {
  contarDias,
  periodoAnterior,
  validarIntervalo,
  variacaoPercentual,
} from "./periodo.ts";

const ZERO: NumerosDoPeriodo = {
  lojasAtivas: 0,
  novasLojas: 0,
  pedidos: 0,
  faturamentoCentavos: 0,
  clientes: 0,
  novosClientes: 0,
  donos: 0,
  staff: 0,
  carrinhos: 0,
  carrinhosConvertidos: 0,
};

function repositorio(
  numeros: (periodo: { inicio: string; fim: string }) => NumerosDoPeriodo,
): RepositorioDasMetricasDoAdmin {
  return {
    numerosDoPeriodo: vi.fn(async (periodo) => numeros(periodo)),
    lojasPendentes: async () => 3,
    pedidosPorDia: async () => [],
    lojasNovasPorSemana: async () => [],
    clientesNovosPorSemana: async () => [],
    porTipoDeNegocio: async () => [],
    ranking: async () => [],
    lojasMaisNovas: async () => [],
    pedidosPorHora: async () =>
      Array.from({ length: 24 }, (_, hora) => ({ hora, pedidos: 0 })),
  };
}

describe("períodos do painel de crescimento", () => {
  it("o período anterior tem a mesma duração e termina um dia antes", () => {
    expect(periodoAnterior({ inicio: "2026-10-10", fim: "2026-10-16" })).toEqual({
      inicio: "2026-10-03",
      fim: "2026-10-09",
    });
    // virada de mês e de ano
    expect(periodoAnterior({ inicio: "2026-01-01", fim: "2026-01-01" })).toEqual({
      inicio: "2025-12-31",
      fim: "2025-12-31",
    });
    expect(contarDias({ inicio: "2026-02-01", fim: "2026-02-28" })).toBe(28);
  });

  it("recusa data que não existe, intervalo invertido e período maior que um ano", () => {
    expect(validarIntervalo({ inicio: "2026-02-31", fim: "2026-03-01" })).toBe("invalido");
    expect(validarIntervalo({ inicio: "2026-10-10", fim: "2026-10-01" })).toBe("invertido");
    expect(validarIntervalo({ inicio: "2025-01-01", fim: "2026-10-01" })).toBe("longo_demais");
    expect(validarIntervalo({ inicio: "2026-10-01", fim: "2026-10-16" })).toBeNull();
  });

  it("variação percentual não inventa base: anterior zero ou ausente dá nulo", () => {
    expect(variacaoPercentual(15, 10)).toBe(50);
    expect(variacaoPercentual(5, 10)).toBe(-50);
    expect(variacaoPercentual(5, 0)).toBeNull();
    expect(variacaoPercentual(5, null)).toBeNull();
  });
});

describe("montagem do painel", () => {
  it("compara o período com o anterior e devolve um corpo que cumpre o contrato", async () => {
    const repo = repositorio((p) =>
      p.inicio === "2026-10-10"
        ? { ...ZERO, pedidos: 4, faturamentoCentavos: 40_000, carrinhos: 10, carrinhosConvertidos: 4 }
        : { ...ZERO, pedidos: 2, faturamentoCentavos: 10_000 },
    );
    const painel = await montarMetricasDoAdmin(
      { inicio: "2026-10-10", fim: "2026-10-16" },
      repo,
    );
    expect(painel.cartoes.pedidos).toEqual({ atual: 4, anterior: 2 });
    expect(painel.cartoes.ticketMedioCentavos).toEqual({ atual: 10_000, anterior: 5_000 });
    expect(painel.cartoes.lojasPendentes).toEqual({ atual: 3, anterior: null });
    expect(painel.cartoes.conversaoPercentual).toEqual({ atual: 40, anterior: null });
    expect(painel.anterior).toEqual({ inicio: "2026-10-03", fim: "2026-10-09" });
    expect(() => esquemaDasMetricasDoAdmin.parse(painel)).not.toThrow();
  });

  it("sem pedido o ticket é zero e sem carrinho a conversão é nula", () => {
    expect(ticketMedio(0, 0)).toBe(0);
    expect(conversao(ZERO)).toBeNull();
  });
});
