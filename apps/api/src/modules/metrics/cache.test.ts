/**
 * Prova do cache das métricas (T-807, AC-814): o valor guardado é reusado
 * dentro do prazo, carrega o horário em que foi calculado, e uma alteração
 * de pedido — a marca-d'água — o deixa para trás sem ninguém apagar nada.
 */
import { describe, expect, it, vi } from "vitest";

import { criarCache, type ClienteDeCache } from "../../core/cache.ts";
import {
  lembrarMetricas,
  parteDoPeriodo,
  TTL_DAS_METRICAS_SEGUNDOS,
} from "./cache.ts";
import type { MetricasCalculadas } from "./metricas.usecase.ts";
import { resolverPeriodo } from "./periodo.ts";

/** Um cache em memória com prazo de validade de verdade, sob relógio de mentira. */
function clienteEmMemoria(agora: () => number): ClienteDeCache & {
  readonly chaves: () => string[];
} {
  const guardado = new Map<string, { valor: string; venceEm: number }>();
  return {
    async buscar(chave) {
      const entrada = guardado.get(chave);
      if (entrada === undefined) return undefined;
      if (entrada.venceEm <= agora()) {
        guardado.delete(chave);
        return undefined;
      }
      return entrada.valor;
    },
    async guardar(chave, valor, ttl) {
      guardado.set(chave, { valor, venceEm: agora() + ttl * 1000 });
    },
    async remover(chaves) {
      let removidas = 0;
      for (const chave of chaves) if (guardado.delete(chave)) removidas += 1;
      return removidas;
    },
    async listarPorPrefixo(prefixo) {
      return [...guardado.keys()].filter((chave) => chave.startsWith(prefixo));
    },
    async encerrar() {},
    chaves: () => [...guardado.keys()],
  };
}

const LOJA = "0c9b1a52-6f5e-4c1b-9d3a-1b2c3d4e5f60";

function periodoDeHoje(agora: Date) {
  const resultado = resolverPeriodo(
    { atalho: "hoje" },
    agora,
    "America/Sao_Paulo",
  );
  if (!resultado.ok) throw new Error(resultado.explicacao);
  return resultado.periodo;
}

function metricasDe(vendido: number, calculadoEm: Date): MetricasCalculadas {
  return {
    periodo: {
      atalho: "hoje",
      de: "2026-09-27",
      ate: "2026-09-27",
      dias: 1,
      fuso: "America/Sao_Paulo",
      inicio: "2026-09-27T03:00:00.000Z",
      fim: "2026-09-28T03:00:00.000Z",
    },
    resumo: {
      pedidos: 1,
      vendidoCentavos: vendido,
      ticketMedioCentavos: vendido,
      concluidos: { quantidade: 0, totalCentavos: 0 },
      emAndamento: { quantidade: 1, totalCentavos: vendido },
      emAberto: { quantidade: 0, totalCentavos: 0 },
      cancelados: { quantidade: 0, totalCentavos: 0 },
      naoConfirmados: { quantidade: 0, totalCentavos: 0 },
      porCanal: {
        site: { quantidade: 1, totalCentavos: vendido },
        balcao: { quantidade: 0, totalCentavos: 0 },
      },
    },
    comparacao: {
      periodoAnterior: {
        de: "2026-09-26",
        ate: "2026-09-26",
        fim: "2026-09-26T18:00:00.000Z",
        parcial: true,
      },
      vendidoCentavos: {
        atual: vendido,
        anterior: 0,
        diferenca: vendido,
        variacaoPorCento: null,
        direcao: "sem-base",
      },
      pedidos: {
        atual: 1,
        anterior: 0,
        diferenca: 1,
        variacaoPorCento: null,
        direcao: "sem-base",
      },
    },
    maisVendidos: [],
    porDia: [{ dia: "2026-09-27", pedidos: 1, vendidoCentavos: vendido }],
    porHora: [],
    regraDeVenda: "",
    calculadoEm: calculadoEm.toISOString(),
  };
}

describe("número em cache nunca se passa por número do instante (AC-814)", () => {
  it("@spec:AC-814 a segunda leitura vem do cache com o horário em que foi calculada, e 'atualizar agora' recalcula", async () => {
    let relogio = new Date("2026-09-27T15:00:00.000Z").getTime();
    const cliente = clienteEmMemoria(() => relogio);
    const cache = criarCache({ cliente, agora: () => relogio });
    const periodo = periodoDeHoje(new Date(relogio));
    const calcular = vi.fn(async () => metricasDe(5_000, new Date(relogio)));

    const primeira = await lembrarMetricas(
      cache,
      { lojaId: LOJA, periodo, marca: "1000" },
      calcular,
    );
    expect(primeira.deCache).toBe(false);
    expect(primeira.metricas.calculadoEm).toBe("2026-09-27T15:00:00.000Z");

    // Vinte segundos depois, sem pedido novo: o guardado responde, e diz de
    // que horas ele é.
    relogio += 20_000;
    const segunda = await lembrarMetricas(
      cache,
      { lojaId: LOJA, periodo, marca: "1000" },
      calcular,
    );
    expect(segunda.deCache).toBe(true);
    expect(segunda.metricas.calculadoEm).toBe("2026-09-27T15:00:00.000Z");
    expect(calcular).toHaveBeenCalledTimes(1);

    // "Atualizar agora": recalcula e regrava, com o horário novo.
    const terceira = await lembrarMetricas(
      cache,
      { lojaId: LOJA, periodo, marca: "1000", atualizar: true },
      calcular,
    );
    expect(terceira.deCache).toBe(false);
    expect(terceira.metricas.calculadoEm).toBe("2026-09-27T15:00:20.000Z");
    expect(calcular).toHaveBeenCalledTimes(2);
  });

  it("@spec:AC-814 um pedido novo muda a marca-d'água e o painel recalcula na hora, antes de o prazo vencer", async () => {
    let relogio = new Date("2026-09-27T15:00:00.000Z").getTime();
    const cliente = clienteEmMemoria(() => relogio);
    const cache = criarCache({ cliente, agora: () => relogio });
    const periodo = periodoDeHoje(new Date(relogio));

    await lembrarMetricas(
      cache,
      { lojaId: LOJA, periodo, marca: "1000" },
      async () => metricasDe(5_000, new Date(relogio)),
    );

    relogio += 5_000;
    const depoisDoPedido = await lembrarMetricas(
      cache,
      { lojaId: LOJA, periodo, marca: "1005" },
      async () => metricasDe(9_000, new Date(relogio)),
    );
    expect(depoisDoPedido.deCache).toBe(false);
    expect(depoisDoPedido.metricas.resumo.vendidoCentavos).toBe(9_000);
    expect(depoisDoPedido.metricas.calculadoEm).toBe(
      "2026-09-27T15:00:05.000Z",
    );
  });

  it("@spec:AC-814 mesmo sem marca nova, o guardado morre no prazo definido de atualização", async () => {
    let relogio = new Date("2026-09-27T15:00:00.000Z").getTime();
    const cliente = clienteEmMemoria(() => relogio);
    const cache = criarCache({ cliente, agora: () => relogio });
    const periodo = periodoDeHoje(new Date(relogio));
    const calcular = vi.fn(async () => metricasDe(5_000, new Date(relogio)));

    await lembrarMetricas(
      cache,
      { lojaId: LOJA, periodo, marca: "1" },
      calcular,
    );
    relogio += TTL_DAS_METRICAS_SEGUNDOS * 1000 + 1;
    const depois = await lembrarMetricas(
      cache,
      { lojaId: LOJA, periodo, marca: "1" },
      calcular,
    );

    expect(depois.deCache).toBe(false);
    expect(calcular).toHaveBeenCalledTimes(2);
    expect(TTL_DAS_METRICAS_SEGUNDOS).toBeLessThanOrEqual(60);
  });

  it("a chave começa pela loja e carrega o período e a marca (AC-027)", async () => {
    const relogio = Date.now();
    const cliente = clienteEmMemoria(() => relogio);
    const cache = criarCache({ cliente, agora: () => relogio });
    const periodo = periodoDeHoje(new Date("2026-09-27T15:00:00.000Z"));

    await lembrarMetricas(
      cache,
      { lojaId: LOJA, periodo, marca: "42" },
      async () => metricasDe(1, new Date(relogio)),
    );

    expect(parteDoPeriodo(periodo)).toBe("hoje_2026-09-27_2026-09-27");
    expect(cliente.chaves()).toEqual([
      `${LOJA}:metricas:hoje_2026-09-27_2026-09-27:42`,
    ]);
  });

  it("o atalho entra na chave: 7 dias e o intervalo a dedo com as mesmas datas não dividem a entrada", async () => {
    const relogio = Date.now();
    const cliente = clienteEmMemoria(() => relogio);
    const cache = criarCache({ cliente, agora: () => relogio });
    const agora = new Date("2026-09-27T15:00:00.000Z");
    const seteDias = resolverPeriodo(
      { atalho: "7d" },
      agora,
      "America/Sao_Paulo",
    );
    const aDedo = resolverPeriodo(
      { atalho: "personalizado", de: "2026-09-21", ate: "2026-09-27" },
      agora,
      "America/Sao_Paulo",
    );
    if (!seteDias.ok || !aDedo.ok) throw new Error("período de apoio inválido");
    expect([aDedo.periodo.de, aDedo.periodo.ate]).toEqual([
      seteDias.periodo.de,
      seteDias.periodo.ate,
    ]);

    const calcular = vi.fn(async () => metricasDe(1, new Date(relogio)));
    const primeira = await lembrarMetricas(
      cache,
      { lojaId: LOJA, periodo: seteDias.periodo, marca: "42" },
      calcular,
    );
    const segunda = await lembrarMetricas(
      cache,
      { lojaId: LOJA, periodo: aDedo.periodo, marca: "42" },
      calcular,
    );

    expect(primeira.deCache).toBe(false);
    expect(segunda.deCache).toBe(false);
    expect(calcular).toHaveBeenCalledTimes(2);
  });
});
