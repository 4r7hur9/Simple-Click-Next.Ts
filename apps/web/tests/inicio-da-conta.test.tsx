import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { VisaoGeralDaConta, horaDePico, variacaoDe } from "../src/features/conta/VisaoGeralDaConta.tsx";
import { calcularMetricas, lerPeriodoDaVisao } from "../src/lib/conta-do-cliente.ts";

const zerada = {
  periodo: { de: "2026-09-18", ate: "2026-10-17", fuso: "America/Sao_Paulo" },
  anterior: { de: "2026-08-19", ate: "2026-09-17" },
  resumo: { pedidos: 0, gastoCentavos: 0, ticketMedioCentavos: 0, cancelados: 0, lojasDistintas: 0, entregues: 0, retiradas: 0 },
  resumoAnterior: { pedidos: 0, gastoCentavos: 0, ticketMedioCentavos: 0 },
  topProdutos: [],
  topLojas: [],
  gastoPorMes: [],
  pedidosPorDiaDaSemana: [0, 0, 0, 0, 0, 0, 0],
  pedidosPorHora: Array.from({ length: 24 }, () => 0),
};

describe("visão geral da conta", () => {
  it("sem pedidos mostra indicadores zerados e o convite, sem saudação", () => {
    const html = renderToStaticMarkup(
      <VisaoGeralDaConta
        periodo={lerPeriodoDaVisao({}, "2026-10-17")}
        metricas={zerada}
        lista={calcularMetricas([], new Date())}
      />,
    );
    expect(html).toMatch(/R\$\s0,00/);
    expect(html).toContain("Pedidos");
    expect(html).toContain("Explorar lojas");
    expect(html).not.toContain("Olá");
  });

  it("variação e pico", () => {
    expect(variacaoDe(150, 100)).toMatchObject({ direcao: "subiu", variacaoPorCento: 50 });
    expect(variacaoDe(5, 0).direcao).toBe("sem-base");
    expect(variacaoDe(0, 0).direcao).toBe("igual");
    expect(horaDePico([0, 0, 3, 1])).toBe(2);
    expect(horaDePico([0, 0])).toBeNull();
  });

  it("lê o período do endereço", () => {
    expect(lerPeriodoDaVisao({}, "2026-10-17")).toEqual({ de: "2026-09-18", ate: "2026-10-17", atalho: "30d" });
    expect(lerPeriodoDaVisao({ periodo: "ano" }, "2026-10-17").de).toBe("2026-01-01");
    expect(lerPeriodoDaVisao({ periodo: "personalizado", de: "2026-05-01", ate: "2026-04-01" }, "2026-10-17")).toMatchObject({ de: "2026-04-01", ate: "2026-05-01" });
  });
});
