// @vitest-environment jsdom
/**
 * Prova do horário de referência e da atualização do painel (T-807; AC-814).
 *
 * O painel do dia é montado como `/painel` o monta, com a rede trocada por
 * respostas no formato do contrato. O que se prova é o que o critério cobra
 * da TELA: ela diz a que horário os números se referem, oferece atualizar
 * agora (e o pedido vai à API com o recálculo), e o pedido novo aparece com o
 * painel aberto dentro do prazo de um minuto, sem ninguém tocar em nada.
 */
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PainelDoDia } from "../src/features/dashboard/PainelDeMetricas.tsx";
import { INTERVALO_DE_RELEITURA_MS } from "../src/features/dashboard/useMetricas.ts";
import { botao, clicar, desmontar, exigir, montar } from "./apoio-config.tsx";
import {
  RESUMO_DE_HOJE,
  adiada,
  assentar,
  conferirNoContrato,
  metricasDe,
  simularMetricas,
  valorDaMetrica,
} from "./apoio-metricas.ts";

afterEach(() => {
  desmontar();
  vi.useRealTimers();
});

/** As métricas de hoje, calculadas num instante e com um vendido. */
function calculadasEm(
  instante: string,
  vendidoCentavos: number,
  deCache = false,
) {
  return conferirNoContrato({
    ...metricasDe({
      resumo: {
        ...RESUMO_DE_HOJE,
        vendidoCentavos,
        concluidos: {
          quantidade: RESUMO_DE_HOJE.concluidos.quantidade,
          totalCentavos:
            vendidoCentavos - RESUMO_DE_HOJE.emAndamento.totalCentavos,
        },
      },
    }),
    calculadoEm: instante,
    deCache,
  });
}

function horario(tela: HTMLElement): HTMLElement {
  return exigir<HTMLElement>(tela, "[data-horario-de-referencia]");
}

describe("o horário a que os números se referem (AC-814)", () => {
  it("@spec:AC-814 a tela escreve o horário dos números no relógio da loja e o atualizar agora pede o recálculo à API", async () => {
    const segunda = adiada<{ status: number; corpo?: unknown }>();
    let vez = 0;
    const chamadas = simularMetricas(() => {
      vez += 1;
      if (vez === 1) {
        return {
          status: 200,
          corpo: calculadasEm("2026-09-27T17:32:00.000Z", 50_000, true),
        };
      }
      return segunda.promessa;
    });
    const tela = montar(<PainelDoDia />);
    await assentar();

    const tempo = exigir<HTMLTimeElement>(horario(tela), "time");
    expect(tempo.textContent).toBe("14h32");
    expect(tempo.getAttribute("dateTime")).toBe("2026-09-27T17:32:00.000Z");
    expect(horario(tela).getAttribute("data-de-cache")).toBe("sim");
    expect(chamadas[0]?.consulta.get("atualizar")).toBeNull();

    clicar(botao(horario(tela), "Atualizar agora"));
    await assentar();
    expect(chamadas).toHaveLength(2);
    expect(chamadas[1]?.consulta.get("atualizar")).toBe("1");
    expect(chamadas[1]?.consulta.get("periodo")).toBe("hoje");
    // Enquanto atualiza, os números ficam: eles valem para o horário escrito.
    expect(tela.querySelector('[data-estado="carregando"]')).toBeNull();
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 500,00");

    segunda.resolver({
      status: 200,
      corpo: calculadasEm("2026-09-27T17:35:00.000Z", 60_000),
    });
    await assentar();
    expect(exigir(horario(tela), "time").textContent).toBe("14h35");
    expect(horario(tela).getAttribute("data-de-cache")).toBe("nao");
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 600,00");
  });

  it("@spec:AC-814 atualização que falha diz que falhou e mantém os números com o horário antigo", async () => {
    let vez = 0;
    simularMetricas(() => {
      vez += 1;
      if (vez === 1) {
        return {
          status: 200,
          corpo: calculadasEm("2026-09-27T17:32:00.000Z", 50_000, true),
        };
      }
      return { status: 503, corpo: { erro: "indisponivel" } };
    });
    const tela = montar(<PainelDoDia />);
    await assentar();

    clicar(botao(horario(tela), "Atualizar agora"));
    await assentar();

    expect(exigir(tela, "[data-atualizacao-falhou]").textContent).toBe(
      "Não foi possível atualizar agora. Os números continuam os de 14h32.",
    );
    expect(exigir(horario(tela), "time").textContent).toBe("14h32");
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 500,00");
  });
});

describe("o pedido novo aparece com o painel aberto (AC-814)", () => {
  async function avancar(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("@spec:AC-814 um minuto depois, o painel aberto relê sozinho e o pedido novo entra na conta", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let vez = 0;
    const chamadas = simularMetricas(() => {
      vez += 1;
      return {
        status: 200,
        corpo:
          vez === 1
            ? calculadasEm("2026-09-27T17:32:00.000Z", 50_000)
            : calculadasEm("2026-09-27T17:33:00.000Z", 62_500, true),
      };
    });
    const tela = montar(<PainelDoDia />);
    await avancar(0);
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 500,00");

    expect(INTERVALO_DE_RELEITURA_MS).toBe(60_000);
    await avancar(INTERVALO_DE_RELEITURA_MS - 1);
    expect(chamadas).toHaveLength(1);

    await avancar(1);
    expect(chamadas).toHaveLength(2);
    // Releitura comum: o guardado da API já mudou com o pedido novo, então
    // não é preciso pedir recálculo.
    expect(chamadas[1]?.consulta.get("atualizar")).toBeNull();
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 625,00");
    expect(exigir(horario(tela), "time").textContent).toBe("14h33");
  });
});
