// @vitest-environment jsdom
/**
 * Prova dos cartões de métrica (T-801; AC-817, AC-812, AC-810).
 *
 * O componente recebe o resumo PRONTO da API e só o desenha: nenhuma conta
 * mora nele. O que se prova é que os três valores aparecem distintos e
 * rotulados, que o cancelado fica à parte do vendido e que a regra do que
 * conta como venda está escrita na tela — com o texto que a API mandou, e não
 * com um texto da tela que poderia divergir da conta.
 */
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";

import { CartoesDoPainel } from "../src/features/dashboard/CartoesDoPainel.tsx";
import { ComposicaoDasVendas } from "../src/features/dashboard/ComposicaoDasVendas.tsx";
import { desmontar, exigir, montar } from "./apoio-config.tsx";
import {
  REGRA_DE_VENDA_DA_API,
  RESUMO_DE_HOJE,
  RESUMO_ZERADO,
  metricasDe,
  valorDaMetrica,
} from "./apoio-metricas.ts";

afterEach(desmontar);

function variacaoDe(atual: number, anterior: number) {
  const diferenca = atual - anterior;
  return {
    atual,
    anterior,
    diferenca,
    variacaoPorCento: Math.round((diferenca / anterior) * 100),
    direcao:
      diferenca > 0 ? ("subiu" as const) : diferenca < 0 ? ("caiu" as const) : ("igual" as const),
  };
}

function desenhar(resumo = RESUMO_DE_HOJE): HTMLElement {
  return montar(
    <ComposicaoDasVendas
      resumo={resumo}
      regraDeVenda={REGRA_DE_VENDA_DA_API}
    />,
  );
}

describe("vendido, concluído e em andamento (AC-817)", () => {
  it("@spec:AC-817 três valores distintos e rotulados, com a relação entre eles escrita", () => {
    const tela = desenhar();

    const rotulo = (nome: string) =>
      exigir(tela, `[data-metrica="${nome}"] dt`).textContent?.trim();
    expect(rotulo("concluido")).toBe("Já concluído");
    expect(rotulo("em-andamento")).toBe("Em andamento");

    const concluido = valorDaMetrica(tela, "concluido");
    const emAndamento = valorDaMetrica(tela, "em-andamento");
    expect([concluido, emAndamento]).toEqual(["R$ 320,00", "R$ 180,00"]);
    // O cenário é o do critério: concluído somado ao em andamento é o vendido.
    expect(
      RESUMO_DE_HOJE.concluidos.totalCentavos +
        RESUMO_DE_HOJE.emAndamento.totalCentavos,
    ).toBe(RESUMO_DE_HOJE.vendidoCentavos);

    expect(exigir(tela, "[data-soma]").textContent).toMatch(
      /concluído mais em andamento é o vendido/i,
    );
    expect(exigir(tela, '[data-metrica="concluido"]').textContent).toContain(
      "5 pedidos entregues ou retirados",
    );
    expect(exigir(tela, '[data-metrica="em-andamento"]').textContent).toContain(
      "3 pedidos em preparo, prontos ou a caminho",
    );
  });

  it("@spec:AC-817 a barra do vendido divide o total na proporção do concluído e do em andamento", () => {
    const tela = desenhar();
    const partes = tela.querySelectorAll<HTMLElement>(
      '[data-composicao] [aria-hidden="true"] > span',
    );
    expect([...partes].map((parte) => parte.style.width)).toEqual([
      "64%",
      "36%",
    ]);
  });
});

describe("cancelado não infla o vendido (AC-812)", () => {
  it("@spec:AC-812 a regra do que conta como venda está escrita na tela, com o texto da API", () => {
    const tela = desenhar();

    const regra = exigir<HTMLElement>(tela, "[data-regra-de-venda]");
    expect(regra.textContent).toContain(REGRA_DE_VENDA_DA_API);
    // Visível: nem escondida, nem dentro de um "saiba mais" fechado.
    expect(regra.closest("[hidden], details:not([open])")).toBeNull();
    expect(regra.className).not.toContain("sc-so-leitor");
    // O cancelado não está dentro da composição do vendido.
    expect(tela.textContent).not.toContain("R$ 99,00");

    expect(
      exigir(tela, '[data-metrica="nao-confirmados"]').textContent,
    ).toContain("1 pedido no WhatsApp sem confirmação do envio (R$ 25,00)");
  });

  it("@spec:AC-812 sem pedido fora da conta, a linha dos não confirmados não aparece", () => {
    const tela = desenhar(RESUMO_ZERADO);
    expect(tela.querySelector('[data-metrica="nao-confirmados"]')).toBeNull();
  });

  it("os cancelamentos têm cartão próprio, à parte do vendido, e subir é ruim (seta vermelha)", () => {
    const metricas = metricasDe();
    const tela = montar(
      <CartoesDoPainel
        comparar
        metricas={{
          ...metricas,
          detalhes: {
            itensVendidos: variacaoDe(20, 10),
            ticketMedioCentavos: variacaoDe(6_250, 5_000),
            cancelados: variacaoDe(2, 1),
            clientesNovos: variacaoDe(3, 3),
            clientesRecorrentes: variacaoDe(4, 8),
            porPagamento: [],
            porEntrega: [],
            porCategoria: [],
            etapasAgora: [],
          },
        }}
      />,
    );

    expect(valorDaMetrica(tela, "cancelados")).toBe("2");
    expect(exigir(tela, '[data-metrica="cancelados"]').textContent).toContain(
      "R$ 99,00 fora do vendido",
    );
    const seta = exigir(exigir(tela, '[data-metrica="cancelados"]'), "[data-direcao]");
    expect(seta.getAttribute("data-direcao")).toBe("subiu");
    expect(seta.className).toContain("text-erro");

    expect(valorDaMetrica(tela, "itens-vendidos")).toBe("20");
    expect(valorDaMetrica(tela, "ticket-medio")).toBe("R$ 62,50");
    expect(valorDaMetrica(tela, "clientes-novos")).toBe("3");
    expect(valorDaMetrica(tela, "clientes-recorrentes")).toBe("4");
    expect(
      exigir(exigir(tela, '[data-metrica="clientes-recorrentes"]'), "[data-direcao]")
        .getAttribute("data-direcao"),
    ).toBe("caiu");
  });

  it("sem comparar, as setas somem e ficam os detalhes", () => {
    const tela = montar(
      <CartoesDoPainel comparar={false} metricas={metricasDe()} />,
    );
    expect(tela.querySelector("[data-direcao]")).toBeNull();
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 500,00");
  });
});

describe("o vendido dividido por canal (AC-810)", () => {
  it("@spec:AC-810 o vendido soma o site e o balcão, e a divisão por canal está na tela", () => {
    const tela = desenhar();
    expect(exigir(tela, '[data-metrica="por-canal"]').textContent).toBe(
      "Por canal: pelo site R$ 410,00 (6 pedidos) · no balcão R$ 90,00 (2 pedidos)",
    );
  });
});

describe("acessibilidade dos cartões", () => {
  it("os cartões não têm violação grave", async () => {
    const tela = desenhar();
    const resultado = await axe.run(tela, {
      rules: { "color-contrast": { enabled: false } },
    });
    const graves = resultado.violations.filter((violacao) =>
      ["critical", "serious"].includes(violacao.impact ?? ""),
    );
    expect(graves.map((violacao) => violacao.id)).toEqual([]);
  }, 60_000);
});
