// @vitest-environment jsdom
/**
 * Prova das listas e gráficos do painel (T-805; AC-807, AC-808, AC-809).
 *
 * As séries chegam PRONTAS da API — um ponto por dia, as 24 horas, zero onde
 * não houve venda. O que se prova aqui é a tela: que cada ponto vira uma
 * coluna (o zero inclusive, como traço, e não como buraco), com o valor
 * ESCRITO em cima dela e não só desenhado, que a lista dos mais vendidos
 * alterna entre quantidade e valor sem perder ninguém, e que quem não vê o
 * desenho recebe o mesmo resumo em texto, cada coluna por extenso e a tabela
 * inteira.
 */
import axe from "axe-core";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { DistribuicaoPorHora } from "../src/features/dashboard/DistribuicaoPorHora.tsx";
import { EvolucaoDiaria } from "../src/features/dashboard/EvolucaoDiaria.tsx";
import { marcasDoEixo } from "../src/features/dashboard/GraficoDeBarras.tsx";
import { PainelDoDia } from "../src/features/dashboard/PainelDeMetricas.tsx";
import { RankingProdutos } from "../src/features/dashboard/RankingProdutos.tsx";
import type { MetricasNoContrato } from "../src/lib/metricas.ts";
import { desmontar, exigir, montar } from "./apoio-config.tsx";
import {
  PERIODOS,
  assentar,
  conferirNoContrato,
  metricasDe,
} from "./apoio-metricas.ts";

afterEach(desmontar);

type Metricas = MetricasNoContrato;

/** Três produtos: o líder em quantidade não é o líder em valor. */
const MAIS_VENDIDOS: Metricas["maisVendidos"] = [
  {
    produtoId: "p-coxinha",
    nome: "Coxinha",
    quantidade: 12,
    totalCentavos: 9_600,
  },
  {
    produtoId: "p-marmita",
    nome: "Marmita grande",
    quantidade: 5,
    totalCentavos: 17_500,
  },
  {
    produtoId: null,
    nome: "Suco (apagado)",
    quantidade: 3,
    totalCentavos: 2_400,
  },
];

/** Sete dias, com venda só em três deles. */
const SETE_DIAS: Metricas["porDia"] = [
  { dia: "2026-09-21", pedidos: 0, vendidoCentavos: 0 },
  { dia: "2026-09-22", pedidos: 0, vendidoCentavos: 0 },
  { dia: "2026-09-23", pedidos: 2, vendidoCentavos: 8_000 },
  { dia: "2026-09-24", pedidos: 0, vendidoCentavos: 0 },
  { dia: "2026-09-25", pedidos: 4, vendidoCentavos: 12_000 },
  { dia: "2026-09-26", pedidos: 0, vendidoCentavos: 0 },
  { dia: "2026-09-27", pedidos: 3, vendidoCentavos: 15_000 },
];

/** As 24 horas, com o movimento concentrado no fim da tarde. */
const MOVIMENTO_NO_FIM_DA_TARDE: Metricas["porHora"] = Array.from(
  { length: 24 },
  (_, hora) => {
    const pedidos = { 12: 1, 17: 3, 18: 5, 19: 2 }[hora] ?? 0;
    return { hora, pedidos, vendidoCentavos: pedidos * 2_500 };
  },
);

function linhasDoRanking(tela: ParentNode): string[] {
  return [...tela.querySelectorAll("[data-produto]")].map(
    (linha) => linha.getAttribute("data-produto") ?? "",
  );
}

function colunas(tela: ParentNode, secao: string): HTMLElement[] {
  return [...tela.querySelectorAll<HTMLElement>(`${secao} li[data-ponto]`)];
}

/** A altura da barra desenhada na coluna, em % da área do desenho. */
function altura(coluna: HTMLElement): number {
  return Number.parseFloat(
    exigir<HTMLElement>(coluna, "[data-barra]").style.height,
  );
}

/** O número escrito em cima de cada coluna, à vista. */
function escritos(tela: ParentNode, secao: string): string[] {
  return colunas(tela, secao).map(
    (coluna) => exigir(coluna, "[data-valor-texto]").textContent ?? "",
  );
}

function clicar(alvo: HTMLElement): void {
  act(() => alvo.click());
}

describe("os mais vendidos (AC-807)", () => {
  it("@spec:AC-807 cada produto vem com quantidade e valor, ordenado por quantidade, e a ordem alterna para valor", () => {
    const tela = montar(<RankingProdutos produtos={MAIS_VENDIDOS} />);

    expect(linhasDoRanking(tela)).toEqual([
      "Coxinha",
      "Marmita grande",
      "Suco (apagado)",
    ]);
    const coxinha = exigir(tela, '[data-produto="Coxinha"]');
    expect(exigir(coxinha, "[data-quantidade]").textContent).toBe(
      "12 unidades",
    );
    expect(exigir(coxinha, "[data-valor]").textContent).toBe("R$ 96,00");

    const porQuantidade = exigir<HTMLElement>(
      tela,
      '[data-medida="quantidade"]',
    );
    const porValor = exigir<HTMLElement>(tela, '[data-medida="valor"]');
    expect(porQuantidade.getAttribute("aria-pressed")).toBe("true");
    expect(porValor.getAttribute("aria-pressed")).toBe("false");

    clicar(porValor);
    expect(
      exigir(tela, "[data-ranking-produtos]").getAttribute("data-ordem"),
    ).toBe("valor");
    expect(linhasDoRanking(tela)).toEqual([
      "Marmita grande",
      "Coxinha",
      "Suco (apagado)",
    ]);
    expect(porValor.getAttribute("aria-pressed")).toBe("true");
    // A barra do líder em valor é a cheia; nenhum produto saiu da lista.
    const barra = exigir<HTMLElement>(
      tela,
      '[data-produto="Marmita grande"] [data-barra]',
    );
    expect(barra.style.width).toBe("100%");

    clicar(porQuantidade);
    expect(linhasDoRanking(tela)).toEqual([
      "Coxinha",
      "Marmita grande",
      "Suco (apagado)",
    ]);
  });

  it("@spec:AC-807 período sem produto vendido explica, em vez de mostrar uma lista vazia", () => {
    const tela = montar(<RankingProdutos produtos={[]} />);
    expect(exigir(tela, "[data-ranking-vazio]").textContent).toMatch(
      /nenhum produto vendido/i,
    );
    expect(tela.querySelector("[data-medida]")).toBeNull();
  });
});

describe("a evolução por dia (AC-808)", () => {
  it("@spec:AC-808 sete dias viram sete colunas, os quatro dias sem venda em zero, e o valor alterna para pedidos", () => {
    const tela = montar(<EvolucaoDiaria pontos={SETE_DIAS} />);

    const desenho = colunas(tela, "[data-evolucao-diaria]");
    expect(desenho.map((coluna) => coluna.getAttribute("data-ponto"))).toEqual(
      SETE_DIAS.map((ponto) => ponto.dia),
    );
    const zerados = desenho.filter((coluna) =>
      coluna.hasAttribute("data-zero"),
    );
    expect(zerados.map((coluna) => coluna.getAttribute("data-ponto"))).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-24",
      "2026-09-26",
    ]);
    // O zero é um traço visível, e não uma coluna de altura nenhuma — mas é
    // menor que a coluna de qualquer dia com venda.
    const menorComVenda = Math.min(
      ...desenho.filter((coluna) => !zerados.includes(coluna)).map(altura),
    );
    for (const coluna of zerados) {
      expect(altura(coluna)).toBeGreaterThan(0);
      expect(altura(coluna)).toBeLessThan(menorComVenda);
    }
    // O maior dia enche a coluna; os outros, na proporção.
    expect(desenho.map(altura)).toEqual([2, 2, 53.333333333333336, 2, 80, 2, 100]);
    // O valor está escrito em cima de cada coluna, e não só no desenho.
    expect(escritos(tela, "[data-evolucao-diaria]")).toEqual([
      "0",
      "0",
      "80",
      "0",
      "120",
      "0",
      "150",
    ]);
    expect(
      exigir(tela, '[data-ponto="2026-09-25"] .sc-so-leitor').textContent,
    ).toBe("25/09/2026: R$ 120,00");
    expect(desenho.map((coluna) => coluna.getAttribute("data-valor"))).toEqual([
      "0",
      "0",
      "8000",
      "0",
      "12000",
      "0",
      "15000",
    ]);

    clicar(exigir<HTMLElement>(tela, '[data-medida="quantidade"]'));
    expect(
      colunas(tela, "[data-evolucao-diaria]").map((coluna) =>
        coluna.getAttribute("data-valor"),
      ),
    ).toEqual(["0", "0", "2", "0", "4", "0", "3"]);
    expect(escritos(tela, "[data-evolucao-diaria]")).toEqual([
      "0",
      "0",
      "2",
      "0",
      "4",
      "0",
      "3",
    ]);
    expect(
      exigir(tela, '[data-ponto="2026-09-25"] .sc-so-leitor').textContent,
    ).toBe("25/09/2026: 4 pedidos");

    // Quem não vê o desenho: o resumo em texto, as colunas numa lista e a
    // tabela com os sete dias.
    const grafico = exigir(tela, "[data-evolucao-diaria] [data-grafico]");
    expect(grafico.getAttribute("role")).toBe("group");
    expect(grafico.getAttribute("aria-label")).toContain("4 dias sem venda");
    expect(grafico.querySelectorAll("ol > li")).toHaveLength(7);
    expect(exigir(tela, "[data-resumo-do-grafico]").textContent).toBe(
      "De 21/09 a 27/09: R$ 350,00 em 9 pedidos; melhor dia 25/09, com 4 pedidos; 4 dias sem venda.",
    );
    const linhas = tela.querySelectorAll("[data-evolucao-diaria] tbody tr");
    expect(linhas).toHaveLength(7);
    expect(exigir(tela, '[data-linha="2026-09-24"]').textContent).toBe(
      "24/09/20260R$ 0,00",
    );
  });

  it("@spec:AC-808 período sem venda nenhuma ainda tem uma coluna por dia, todas em zero", () => {
    const parado = SETE_DIAS.map((ponto) => ({
      ...ponto,
      pedidos: 0,
      vendidoCentavos: 0,
    }));
    const tela = montar(<EvolucaoDiaria pontos={parado} />);
    const desenho = colunas(tela, "[data-evolucao-diaria]");
    expect(desenho).toHaveLength(7);
    expect(desenho.every((coluna) => coluna.hasAttribute("data-zero"))).toBe(
      true,
    );
    expect(exigir(tela, "[data-resumo-do-grafico]").textContent).toBe(
      "De 21/09 a 27/09: nenhuma venda, 7 dias em zero.",
    );
  });

  it("@spec:AC-808 período longo rotula o eixo sem amontoar, sempre com o primeiro e o último dia", () => {
    expect(marcasDoEixo(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const ano = marcasDoEixo(366);
    expect(ano.length).toBeLessThanOrEqual(7);
    expect(ano[0]).toBe(0);
    expect(ano.at(-1)).toBe(365);
  });

  it("@spec:AC-808 período longo demais para escrever número em cada coluna ainda desenha todas, e deixa os números na tabela", () => {
    const trintaEUmDias = Array.from({ length: 31 }, (_, indice) => ({
      dia: `2026-08-${String(indice + 1).padStart(2, "0")}`,
      pedidos: indice % 3,
      vendidoCentavos: (indice % 3) * 1_000,
    }));
    const tela = montar(<EvolucaoDiaria pontos={trintaEUmDias} />);
    expect(colunas(tela, "[data-evolucao-diaria]")).toHaveLength(31);
    expect(tela.querySelector("[data-valor-texto]")).toBeNull();
    expect(
      tela.querySelectorAll("[data-evolucao-diaria] tbody tr"),
    ).toHaveLength(31);
  });
});

describe("o movimento por hora (AC-809)", () => {
  it("@spec:AC-809 as 24 horas aparecem, as paradas em zero, e as faixas do fim da tarde ficam em destaque com texto", () => {
    const tela = montar(
      <DistribuicaoPorHora pontos={MOVIMENTO_NO_FIM_DA_TARDE} />,
    );

    const desenho = colunas(tela, "[data-distribuicao-por-hora]");
    expect(desenho).toHaveLength(24);
    expect(
      desenho.filter((coluna) => coluna.hasAttribute("data-zero")),
    ).toHaveLength(20);
    expect(
      desenho
        .filter((coluna) => coluna.hasAttribute("data-destaque"))
        .map((coluna) => coluna.getAttribute("data-ponto")),
    ).toEqual(["17", "18", "19"]);
    // As 24 horas cabem com o número escrito em cima de cada coluna.
    expect(escritos(tela, "[data-distribuicao-por-hora]")).toEqual(
      MOVIMENTO_NO_FIM_DA_TARDE.map((ponto) => String(ponto.pedidos)),
    );
    expect(
      exigir(tela, '[data-distribuicao-por-hora] [data-ponto="18"] .sc-so-leitor')
        .textContent,
    ).toBe("18h às 19h: 5 pedidos");

    expect(
      exigir(tela, "[data-distribuicao-por-hora] [data-resumo-do-grafico]")
        .textContent,
    ).toBe(
      "Mais movimento: 18h às 19h (5 pedidos), 17h às 18h (3 pedidos), 19h às 20h (2 pedidos). 20 horas sem pedido.",
    );
    expect(
      tela.querySelectorAll("[data-distribuicao-por-hora] tbody tr"),
    ).toHaveLength(24);
    expect(
      exigir(tela, '[data-distribuicao-por-hora] [data-linha="3"]').textContent,
    ).toBe("3h às 4h0R$ 0,00");
  });

  it("@spec:AC-809 sem pedido nenhum, nenhuma hora é destaque e a tela diz isso", () => {
    const parado = MOVIMENTO_NO_FIM_DA_TARDE.map((ponto) => ({
      ...ponto,
      pedidos: 0,
      vendidoCentavos: 0,
    }));
    const tela = montar(<DistribuicaoPorHora pontos={parado} />);
    expect(tela.querySelectorAll("[data-destaque]")).toHaveLength(0);
    expect(colunas(tela, "[data-distribuicao-por-hora]")).toHaveLength(24);
    expect(exigir(tela, "[data-resumo-do-grafico]").textContent).toMatch(
      /nenhum pedido/i,
    );
  });
});

describe("as listas e gráficos dentro do painel", () => {
  function metricasDaSemana(): Metricas {
    return conferirNoContrato({
      ...metricasDe({ periodo: PERIODOS["7d"] }),
      maisVendidos: MAIS_VENDIDOS,
      porDia: SETE_DIAS,
      porHora: MOVIMENTO_NO_FIM_DA_TARDE,
    });
  }

  it("@spec:AC-807 o painel do período mostra os mais vendidos, a evolução e o movimento por hora", async () => {
    const tela = montar(
      <PainelDoDia
        buscar={async () => ({ estado: "ok", metricas: metricasDaSemana() })}
      />,
    );
    await assentar();
    expect(linhasDoRanking(tela)).toEqual([
      "Coxinha",
      "Marmita grande",
      "Suco (apagado)",
    ]);
    expect(colunas(tela, "[data-evolucao-diaria]")).toHaveLength(7);
    expect(colunas(tela, "[data-distribuicao-por-hora]")).toHaveLength(24);
  });

  it("o painel de um dia só não desenha a evolução de uma coluna", async () => {
    const tela = montar(
      <PainelDoDia
        buscar={async () => ({
          estado: "ok",
          metricas: conferirNoContrato({
            ...metricasDe(),
            porDia: [
              { dia: "2026-09-27", pedidos: 8, vendidoCentavos: 50_000 },
            ],
            porHora: MOVIMENTO_NO_FIM_DA_TARDE,
          }),
        })}
      />,
    );
    await assentar();
    expect(tela.querySelector("[data-evolucao-diaria]")).toBeNull();
    expect(tela.querySelector("[data-distribuicao-por-hora]")).not.toBeNull();
  });

  it("as listas e gráficos não têm violação grave de acessibilidade", async () => {
    const tela = montar(
      <>
        <RankingProdutos produtos={MAIS_VENDIDOS} />
        <EvolucaoDiaria pontos={SETE_DIAS} />
        <DistribuicaoPorHora pontos={MOVIMENTO_NO_FIM_DA_TARDE} />
      </>,
    );
    const resultado = await axe.run(tela, {
      rules: { "color-contrast": { enabled: false } },
    });
    const graves = resultado.violations.filter((violacao) =>
      ["critical", "serious"].includes(violacao.impact ?? ""),
    );
    expect(graves.map((violacao) => violacao.id)).toEqual([]);
  }, 60_000);
});
