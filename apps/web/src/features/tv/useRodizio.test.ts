// @vitest-environment jsdom
/**
 * Prova do rodízio (AC-925): a tela avança sozinha, no relógio, e dá a volta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SEGUNDOS_POR_TELA, useRodizio } from "./useRodizio.ts";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.useRealTimers();
});

/** Um componente que só escreve o índice na tela. */
function Mostrador({
  quantidade,
  intervalo,
}: {
  readonly quantidade: number;
  readonly intervalo: number;
}) {
  return createElement(
    "output",
    null,
    String(useRodizio(quantidade, intervalo)),
  );
}

function montar(quantidade: number, intervalo: number): HTMLElement {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() => raiz?.render(createElement(Mostrador, { quantidade, intervalo })));
  return container;
}

const lido = (tela: HTMLElement): string => tela.textContent ?? "";

describe("a tela avança sozinha (AC-925)", () => {
  it("@spec:AC-925 começa na primeira e passa para a próxima quando o tempo vence", () => {
    const tela = montar(3, 1000);

    expect(lido(tela)).toBe("0");
    act(() => vi.advanceTimersByTime(999));
    expect(lido(tela)).toBe("0");
    act(() => vi.advanceTimersByTime(1));
    expect(lido(tela)).toBe("1");
  });

  it("@spec:AC-925 depois da última volta para a primeira, sem ninguém apertar nada", () => {
    const tela = montar(3, 1000);

    act(() => vi.advanceTimersByTime(3000));
    expect(lido(tela)).toBe("0");
    act(() => vi.advanceTimersByTime(1000));
    expect(lido(tela)).toBe("1");
  });

  it("@spec:AC-925 com uma tela só não há relógio: ela fica", () => {
    const tela = montar(1, 1000);

    act(() => vi.advanceTimersByTime(10_000));
    expect(lido(tela)).toBe("0");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("@spec:AC-925 quando o catálogo encolhe, o índice continua dentro do limite", () => {
    const tela = montar(5, 1000);
    act(() => vi.advanceTimersByTime(4000));
    expect(lido(tela)).toBe("4");

    act(() =>
      raiz?.render(
        createElement(Mostrador, { quantidade: 2, intervalo: 1000 }),
      ),
    );

    expect(["0", "1"]).toContain(lido(tela));
  });

  it("@spec:AC-925 desmontar para o relógio", () => {
    montar(3, 1000);
    expect(vi.getTimerCount()).toBe(1);

    act(() => raiz?.unmount());
    raiz = null;

    expect(vi.getTimerCount()).toBe(0);
  });

  it("@spec:AC-925 o padrão dá tempo de ler e não deixa a fila ver sempre a mesma tela", () => {
    expect(SEGUNDOS_POR_TELA).toBeGreaterThanOrEqual(8);
    expect(SEGUNDOS_POR_TELA).toBeLessThanOrEqual(20);
  });
});
