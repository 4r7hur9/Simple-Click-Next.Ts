/**
 * Apoio comum às provas das telas de métricas (T-801, T-803, T-804).
 *
 * As respostas aqui são escritas no formato EXATO do contrato
 * (`esquemaDasMetricas`, que é fechado): a tela confere cada resposta por
 * ele, e uma resposta de teste fora do formato faria a prova passar pelo
 * caminho do erro sem ninguém perceber. `conferirNoContrato` garante isso em
 * cada cenário.
 */
import {
  esquemaDasMetricas,
  type MetricasNoContrato,
  type PeriodoDeMetricasNoContrato,
  type ResumoDeMetricasNoContrato,
} from "@simpleclick/contracts";
import { act } from "react";
import { vi } from "vitest";

/** A régua que a API escreve para o dono (o texto vem dela, não da tela). */
export const REGRA_DE_VENDA_DA_API =
  "Conta como venda todo pedido que você aceitou, em qualquer etapa a partir daí — em preparo, pronto, saiu para entrega ou concluído. Pedido recusado ou cancelado nunca entra na conta e aparece separado.";

const FUSO = "America/Sao_Paulo";

/** As pontas de cada atalho num dia fixo: hoje é 27/09/2026 na loja. */
export const PERIODOS: Readonly<
  Record<"hoje" | "3d" | "7d", PeriodoDeMetricasNoContrato>
> = {
  hoje: {
    atalho: "hoje",
    de: "2026-09-27",
    ate: "2026-09-27",
    dias: 1,
    fuso: FUSO,
    inicio: "2026-09-27T03:00:00.000Z",
    fim: "2026-09-28T03:00:00.000Z",
  },
  "3d": {
    atalho: "3d",
    de: "2026-09-25",
    ate: "2026-09-27",
    dias: 3,
    fuso: FUSO,
    inicio: "2026-09-25T03:00:00.000Z",
    fim: "2026-09-28T03:00:00.000Z",
  },
  "7d": {
    atalho: "7d",
    de: "2026-09-21",
    ate: "2026-09-27",
    dias: 7,
    fuso: FUSO,
    inicio: "2026-09-21T03:00:00.000Z",
    fim: "2026-09-28T03:00:00.000Z",
  },
};

/** Um intervalo escolhido a dedo. */
export function periodoPersonalizado(
  de: string,
  ate: string,
  dias: number,
): PeriodoDeMetricasNoContrato {
  return {
    atalho: "personalizado",
    de,
    ate,
    dias,
    fuso: FUSO,
    inicio: `${de}T03:00:00.000Z`,
    fim: `${ate}T03:00:00.000Z`,
  };
}

const ZERO = { quantidade: 0, totalCentavos: 0 };

/** O resumo de um dia sem pedido nenhum. */
export const RESUMO_ZERADO: ResumoDeMetricasNoContrato = {
  pedidos: 0,
  vendidoCentavos: 0,
  ticketMedioCentavos: 0,
  concluidos: ZERO,
  emAndamento: ZERO,
  emAberto: ZERO,
  cancelados: ZERO,
  naoConfirmados: ZERO,
  porCanal: { site: ZERO, balcao: ZERO },
};

/**
 * Um dia movimentado: oito vendas (cinco concluídas, três em andamento), dois
 * pedidos esperando aceite e dois cancelados à parte.
 */
export const RESUMO_DE_HOJE: ResumoDeMetricasNoContrato = {
  pedidos: 8,
  vendidoCentavos: 50_000,
  ticketMedioCentavos: 6_250,
  concluidos: { quantidade: 5, totalCentavos: 32_000 },
  emAndamento: { quantidade: 3, totalCentavos: 18_000 },
  emAberto: { quantidade: 2, totalCentavos: 7_000 },
  cancelados: { quantidade: 2, totalCentavos: 9_900 },
  naoConfirmados: { quantidade: 1, totalCentavos: 2_500 },
  porCanal: {
    site: { quantidade: 6, totalCentavos: 41_000 },
    balcao: { quantidade: 2, totalCentavos: 9_000 },
  },
};

interface Sobrescrita {
  readonly periodo?: PeriodoDeMetricasNoContrato;
  readonly resumo?: ResumoDeMetricasNoContrato;
  /** O vendido do período anterior, para a comparação (AC-802). */
  readonly vendidoAntes?: number;
  readonly pedidosAntes?: number;
  readonly apelido?: string;
}

function variacao(atual: number, anterior: number) {
  const diferenca = atual - anterior;
  if (anterior === 0) {
    return {
      atual,
      anterior,
      diferenca,
      variacaoPorCento: null,
      direcao: atual === 0 ? ("igual" as const) : ("sem-base" as const),
    };
  }
  return {
    atual,
    anterior,
    diferenca,
    variacaoPorCento: Math.round((diferenca / anterior) * 100),
    direcao:
      diferenca > 0
        ? ("subiu" as const)
        : diferenca < 0
          ? ("caiu" as const)
          : ("igual" as const),
  };
}

/** Confere que a resposta escrita pelo teste está no contrato. */
export function conferirNoContrato(
  metricas: MetricasNoContrato,
): MetricasNoContrato {
  return esquemaDasMetricas.parse(metricas);
}

/**
 * As métricas de um período, no formato que a API devolve.
 *
 * Hoje às 14h32 na loja: a comparação de hoje é contra ontem até as 14h32
 * (17h32 em UTC), e a dos atalhos de 3 e 7 dias também corta o último dia
 * do anterior na mesma hora.
 */
export function metricasDe(sobrescrita: Sobrescrita = {}): MetricasNoContrato {
  const periodo = sobrescrita.periodo ?? PERIODOS.hoje;
  const resumo = sobrescrita.resumo ?? RESUMO_DE_HOJE;
  const emCurso = periodo.ate === "2026-09-27";
  const ateAntes =
    periodo.atalho === "hoje"
      ? "2026-09-26"
      : periodo.atalho === "3d"
        ? "2026-09-24"
        : "2026-09-20";
  const deAntes =
    periodo.atalho === "hoje"
      ? "2026-09-26"
      : periodo.atalho === "3d"
        ? "2026-09-22"
        : "2026-09-14";

  return conferirNoContrato({
    loja: { apelido: sobrescrita.apelido ?? "loja-teste" },
    periodo,
    resumo,
    comparacao: {
      periodoAnterior: {
        de: deAntes,
        ate: ateAntes,
        fim: emCurso ? `${ateAntes}T17:32:00.000Z` : periodo.inicio,
        parcial: emCurso,
      },
      vendidoCentavos: variacao(
        resumo.vendidoCentavos,
        sobrescrita.vendidoAntes ?? 40_000,
      ),
      pedidos: variacao(resumo.pedidos, sobrescrita.pedidosAntes ?? 8),
    },
    maisVendidos: [],
    porDia: [],
    porHora: [],
    regraDeVenda: REGRA_DE_VENDA_DA_API,
    calculadoEm: "2026-09-27T17:32:00.000Z",
    deCache: false,
  });
}

/** Uma chamada que a tela fez às métricas. */
export interface ChamadaDasMetricas {
  readonly url: string;
  readonly consulta: URLSearchParams;
}

/** O que o servidor de mentira responde a uma chamada. */
export type RespostaDasMetricas =
  | { readonly status: 200; readonly corpo: MetricasNoContrato }
  | { readonly status: number; readonly corpo?: unknown }
  | Promise<{ readonly status: number; readonly corpo?: unknown }>;

/**
 * Troca o `fetch` por um servidor de métricas escrito pelo teste e devolve as
 * chamadas que a tela fez, com a consulta já separada.
 */
export function simularMetricas(
  responder: (chamada: ChamadaDasMetricas) => RespostaDasMetricas,
): ChamadaDasMetricas[] {
  const chamadas: ChamadaDasMetricas[] = [];
  vi.stubGlobal("fetch", async (endereco: RequestInfo | URL) => {
    const url = String(endereco);
    const chamada: ChamadaDasMetricas = {
      url,
      consulta: new URL(url, "http://localhost").searchParams,
    };
    chamadas.push(chamada);
    const { status, corpo } = await responder(chamada);
    return new Response(JSON.stringify(corpo ?? {}), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  return chamadas;
}

/** Uma promessa que o teste resolve quando quiser: a rede lenta. */
export function adiada<T>(): {
  readonly promessa: Promise<T>;
  readonly resolver: (valor: T) => void;
} {
  let resolver: (valor: T) => void = () => {};
  const promessa = new Promise<T>((cumprir) => {
    resolver = cumprir;
  });
  return { promessa, resolver };
}

/** O valor escrito de uma métrica na tela, pelo nome dela. */
export function valorDaMetrica(tela: ParentNode, nome: string): string {
  const valor = tela.querySelector(`[data-metrica="${nome}"] [data-valor]`);
  if (valor === null) throw new Error(`a tela não mostra a métrica ${nome}`);
  return (valor.textContent ?? "").trim();
}

/** Deixa as respostas simuladas e os efeitos terminarem. */
export async function assentar(): Promise<void> {
  await act(async () => {
    for (let vez = 0; vez < 10; vez += 1) {
      await new Promise((resolver) => setTimeout(resolver, 0));
    }
  });
}

/**
 * Escolhe um atalho no calendário do seletor de período ("Ontem", "Este
 * mês"...) e aplica. Como no uso real: abre a janela, toca o atalho e Aplicar.
 */
export async function escolherNoCalendario(
  tela: ParentNode,
  atalho: string,
  esperar: () => Promise<void> = assentar,
): Promise<void> {
  // O jsdom não traz ResizeObserver, que a janela do calendário usa.
  if (typeof ResizeObserver === "undefined") {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
  }
  const abrir = tela.querySelector<HTMLButtonElement>(
    'button[aria-haspopup="dialog"]',
  );
  if (abrir === null) throw new Error("a tela não tem o calendário de período");
  act(() => abrir.click());
  const janela = document.querySelector('[role="dialog"]');
  if (janela === null) throw new Error("o calendário não abriu");
  const escolhido = [...janela.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === atalho,
  );
  if (escolhido === undefined) throw new Error(`sem o atalho ${atalho}`);
  act(() => escolhido.click());
  const aplicar = [...janela.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === "Aplicar",
  );
  if (aplicar === undefined) throw new Error("sem o botão Aplicar");
  act(() => aplicar.click());
  await esperar();
}
