/**
 * O relógio da remoção definitiva (AC-211): roda na partida, roda a cada
 * intervalo, nunca duas rodadas ao mesmo tempo, e falha não para nada.
 *
 * O que a rodada remove, contra o banco de verdade, está provado em
 * `apps/api/tests/admin-situacao.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { agendarRetencao, INTERVALO_DA_RETENCAO_MS } from "./retencao.job.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a remoção definitiva roda sozinha, guiada pelo relógio (AC-211)", () => {
  it("@spec:AC-211 roda logo na partida — para recuperar o que venceu com o processo parado — e depois a cada hora", async () => {
    const instantes: Date[] = [];
    const agora = new Date("2026-11-03T00:00:00.000Z");
    const retencao = agendarRetencao({
      remover: async (instante) => {
        instantes.push(instante);
        return 0;
      },
      agora: () => agora,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(instantes).toHaveLength(1);
    expect(instantes[0]).toBe(agora);

    await vi.advanceTimersByTimeAsync(INTERVALO_DA_RETENCAO_MS);
    expect(instantes).toHaveLength(2);
    expect(INTERVALO_DA_RETENCAO_MS).toBe(60 * 60 * 1000);

    await retencao.fechar();
    await vi.advanceTimersByTimeAsync(INTERVALO_DA_RETENCAO_MS * 3);
    expect(instantes).toHaveLength(2);
  });

  it("@spec:AC-211 nunca roda duas vezes ao mesmo tempo: a rodada que ainda corre é a mesma", async () => {
    let soltar: (quantas: number) => void = () => {};
    let chamadas = 0;
    const retencao = agendarRetencao({
      remover: () => {
        chamadas += 1;
        return new Promise<number>((resolver) => {
          soltar = resolver;
        });
      },
      intervaloMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);
    const pedida = retencao.rodarAgora();
    expect(chamadas).toBe(1);

    soltar(3);
    expect(await pedida).toBe(3);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(chamadas).toBe(2);
    soltar(0);
    await retencao.fechar();
  });

  it("@spec:AC-211 a rodada que falha é registrada e a seguinte tenta de novo", async () => {
    const falhas: string[] = [];
    let vez = 0;
    const retencao = agendarRetencao({
      remover: async () => {
        vez += 1;
        if (vez === 1) throw new Error("banco fora do ar");
        return 2;
      },
      intervaloMs: 1_000,
      aoFalhar: (motivo) => falhas.push(motivo),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(falhas).toEqual(["banco fora do ar"]);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(vez).toBe(2);
    expect(await retencao.rodarAgora()).toBe(2);
    await retencao.fechar();
  });
});
