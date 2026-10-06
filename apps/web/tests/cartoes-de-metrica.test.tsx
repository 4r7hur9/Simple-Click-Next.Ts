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

import { CartoesDeMetrica } from "../src/features/dashboard/CartoesDeMetrica.tsx";
import { desmontar, exigir, montar } from "./apoio-config.tsx";
import {
  REGRA_DE_VENDA_DA_API,
  RESUMO_DE_HOJE,
  RESUMO_ZERADO,
  valorDaMetrica,
} from "./apoio-metricas.ts";

afterEach(desmontar);

function desenhar(resumo = RESUMO_DE_HOJE): HTMLElement {
  return montar(
    <CartoesDeMetrica
      resumo={resumo}
      regraDeVenda={REGRA_DE_VENDA_DA_API}
      rotuloDoPeriodo="hoje"
    />,
  );
}

describe("vendido, concluído e em andamento (AC-817)", () => {
  it("@spec:AC-817 três valores distintos e rotulados, com a relação entre eles escrita", () => {
    const tela = desenhar();

    const rotulo = (nome: string) =>
      exigir(tela, `[data-metrica="${nome}"] dt`).textContent?.trim();
    expect(rotulo("vendido")).toBe("Vendido hoje");
    expect(rotulo("concluido")).toBe("Já concluído");
    expect(rotulo("em-andamento")).toBe("Em andamento");

    const vendido = valorDaMetrica(tela, "vendido");
    const concluido = valorDaMetrica(tela, "concluido");
    const emAndamento = valorDaMetrica(tela, "em-andamento");
    expect([vendido, concluido, emAndamento]).toEqual([
      "R$ 500,00",
      "R$ 320,00",
      "R$ 180,00",
    ]);
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
      '[data-metrica="vendido"] [aria-hidden="true"] > span',
    );
    expect([...partes].map((parte) => parte.style.width)).toEqual([
      "64%",
      "36%",
    ]);
  });
});

describe("cancelado não infla o vendido (AC-812)", () => {
  it("@spec:AC-812 os cancelados aparecem à parte do vendido e a regra do que conta como venda está escrita na tela", () => {
    const tela = desenhar();

    expect(valorDaMetrica(tela, "cancelados")).toBe("2");
    expect(exigir(tela, '[data-metrica="cancelados"]').textContent).toContain(
      "R$ 99,00 fora do vendido",
    );
    // O cancelado não está dentro do vendido: o cartão do vendido não o cita.
    expect(exigir(tela, '[data-metrica="vendido"]').textContent).not.toContain(
      "R$ 99,00",
    );

    const regra = exigir<HTMLElement>(tela, "[data-regra-de-venda]");
    expect(regra.textContent).toContain(REGRA_DE_VENDA_DA_API);
    // Visível: nem escondida, nem dentro de um "saiba mais" fechado.
    expect(regra.closest("[hidden], details:not([open])")).toBeNull();
    expect(regra.className).not.toContain("sc-so-leitor");

    expect(
      exigir(tela, '[data-metrica="nao-confirmados"]').textContent,
    ).toContain("1 pedido no WhatsApp sem confirmação do envio (R$ 25,00)");
  });

  it("@spec:AC-812 sem pedido fora da conta, a linha dos não confirmados não aparece", () => {
    const tela = desenhar(RESUMO_ZERADO);
    expect(tela.querySelector('[data-metrica="nao-confirmados"]')).toBeNull();
    expect(valorDaMetrica(tela, "cancelados")).toBe("0");
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
