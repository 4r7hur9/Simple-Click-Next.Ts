// @vitest-environment jsdom
/**
 * Prova do painel de crescimento da administração: o comparativo com o
 * período anterior, os cartões, os estados vazio/erro/carregando e o repasse
 * liberado para o caminho de métricas.
 */
import type { MetricasDoAdminNoContrato } from "@simpleclick/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CorpoDoPainel } from "../src/features/admin-dashboard/DashboardDoAdmin.tsx";
import { compararComAnterior } from "../src/features/admin-dashboard/formatar.ts";
import { caminhoPermitido } from "../src/server/admin-api.ts";
import { desmontar, montar } from "./apoio-config.tsx";

const par = (atual: number, anterior: number | null) => ({ atual, anterior });

function metricas(sobre: Partial<MetricasDoAdminNoContrato["cartoes"]> = {}): MetricasDoAdminNoContrato {
  return {
    periodo: { inicio: "2026-10-10", fim: "2026-10-12", dias: 3 },
    anterior: { inicio: "2026-10-07", fim: "2026-10-09" },
    cartoes: {
      lojasAtivas: par(2, 2),
      novasLojas: par(1, 0),
      lojasPendentes: par(2, null),
      pedidos: par(10, 20),
      faturamentoCentavos: par(150_000, 100_000),
      ticketMedioCentavos: par(15_000, 5_000),
      clientes: par(7, 2),
      novosClientes: par(5, 0),
      donos: par(5, 2),
      staff: par(2, 1),
      conversaoPercentual: { atual: null, anterior: null },
      ...sobre,
    },
    porDia: [
      { dia: "2026-10-10", pedidos: 4, faturamentoCentavos: 40_000 },
      { dia: "2026-10-11", pedidos: 6, faturamentoCentavos: 110_000 },
      { dia: "2026-10-12", pedidos: 0, faturamentoCentavos: 0 },
    ],
    lojasNovasPorSemana: [{ semana: "2026-10-05", quantidade: 1 }],
    clientesNovosPorSemana: [{ semana: "2026-10-05", quantidade: 0 }],
    porTipoDeNegocio: [{ codigo: "FOOD_SNACK", nome: "Lanchonete", lojas: 1, pedidos: 6 }],
    rankingPorFaturamento: [{ id: "a", nome: "Loja A", apelido: "a", pedidos: 6, faturamentoCentavos: 110_000 }],
    rankingPorPedidos: [{ id: "a", nome: "Loja A", apelido: "a", pedidos: 6, faturamentoCentavos: 110_000 }],
    lojasMaisNovas: [{ id: "a", nome: "Loja A", apelido: "a", tipoDeNegocio: "Lanchonete", status: "PENDING_APPROVAL", criadaEm: "2026-10-11T15:00:00.000Z" }],
    porHora: Array.from({ length: 24 }, (_, hora) => ({ hora, pedidos: hora === 12 ? 6 : 0 })),
  };
}

afterEach(() => desmontar());

describe("comparativo com o período anterior", () => {
  it("sobe, cai, fica igual e não inventa percentual sobre base zero", () => {
    expect(compararComAnterior(15, 10)).toMatchObject({ sentido: "alta", percentual: 50 });
    expect(compararComAnterior(5, 10)).toMatchObject({ sentido: "queda", percentual: 50 });
    expect(compararComAnterior(5, 5)).toMatchObject({ sentido: "igual" });
    expect(compararComAnterior(3, 0)).toMatchObject({ sentido: "alta", percentual: null, texto: "Novo no período" });
    expect(compararComAnterior(0, 0)?.sentido).toBe("igual");
    expect(compararComAnterior(3, null)).toBeNull();
  });
});

describe("corpo do painel", () => {
  it("mostra os cartões com seta verde ou vermelha e o atalho das pendentes", () => {
    const recipiente = montar(
      <CorpoDoPainel estado={{ fase: "pronto", metricas: metricas() }} comparar aoTentarDeNovo={() => {}} />,
    );
    const q = (nome: string) => recipiente.querySelector(`[data-metrica="${nome}"]`);
    expect(q("pedidos")?.querySelector('[data-variacao="queda"]')).not.toBeNull();
    expect(q("faturamento")?.querySelector('[data-variacao="alta"]')).not.toBeNull();
    expect(q("lojas-pendentes")?.querySelector("a")?.getAttribute("href")).toBe(
      "/admin/lojas?situacao=PENDING_APPROVAL",
    );
    expect(q("conversao")?.textContent).toContain("—");
  });

  it("sem comparar, nenhum cartão mostra variação", () => {
    const recipiente = montar(
      <CorpoDoPainel estado={{ fase: "pronto", metricas: metricas() }} comparar={false} aoTentarDeNovo={() => {}} />,
    );
    expect(recipiente.querySelector("[data-variacao]")).toBeNull();
  });

  it("período sem pedidos mostra estados vazios em vez de gráficos", () => {
    const vazio = metricas({ pedidos: par(0, 0), faturamentoCentavos: par(0, 0), lojasPendentes: par(0, null) });
    const recipiente = montar(
      <CorpoDoPainel estado={{ fase: "pronto", metricas: vazio }} comparar aoTentarDeNovo={() => {}} />,
    );
    expect(recipiente.textContent).toContain("Nenhum pedido neste período");
    expect(recipiente.querySelector('[data-grafico="linha"]')).toBeNull();
  });

  it("erro oferece tentar de novo e carregando mostra o esqueleto", () => {
    const aoTentar = vi.fn();
    const erro = montar(
      <CorpoDoPainel estado={{ fase: "erro", mensagem: "Falhou." }} comparar aoTentarDeNovo={aoTentar} />,
    );
    erro.querySelector("button")?.click();
    expect(aoTentar).toHaveBeenCalled();
    desmontar();
    const espera = montar(
      <CorpoDoPainel estado={{ fase: "carregando", anterior: null }} comparar aoTentarDeNovo={() => {}} />,
    );
    expect(espera.querySelector('[data-estado="carregando"]')).not.toBeNull();
  });
});

describe("repasse do site", () => {
  it("libera só GET em /metricas", () => {
    expect(caminhoPermitido("metricas", "GET")).toBe(true);
    expect(caminhoPermitido("metricas", "POST")).toBe(false);
  });
});
