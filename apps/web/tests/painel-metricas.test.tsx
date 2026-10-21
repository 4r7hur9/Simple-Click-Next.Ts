// @vitest-environment jsdom
/**
 * Prova do painel do dia na tela (T-803; AC-800, AC-801, AC-802, AC-813).
 *
 * Os cartões dos três números e da regra de venda (AC-817, AC-812) têm prova
 * própria em `cartoes-de-metrica.test.tsx`; aqui eles aparecem pelo caminho
 * inteiro, da resposta da API até a tela.
 *
 * O painel é montado como a página `/painel` o monta. A única troca é a rede:
 * o `fetch` responde no formato exato do contrato, e cada cenário escreve a
 * resposta que precisa. O que NÃO é trocado é o caminho até a tela — o
 * endereço pedido, a conferência pelo contrato e o desenho —, que é o mesmo
 * da página de verdade.
 */
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PainelDoDia } from "../src/features/dashboard/PainelDeMetricas.tsx";
import { desmontar, exigir, montar, botao, clicar } from "./apoio-config.tsx";
import {
  RESUMO_ZERADO,
  adiada,
  assentar,
  metricasDe,
  simularMetricas,
  valorDaMetrica,
} from "./apoio-metricas.ts";

afterEach(() => {
  desmontar();
  Reflect.deleteProperty(navigator, "clipboard");
});

async function abrirPainel(): Promise<HTMLElement> {
  const tela = montar(<PainelDoDia />);
  await assentar();
  return tela;
}

function estado(tela: HTMLElement): string | null {
  return (
    tela.querySelector("[data-estado]")?.getAttribute("data-estado") ?? null
  );
}

async function semViolacaoGrave(tela: HTMLElement): Promise<void> {
  const resultado = await axe.run(tela, {
    rules: { "color-contrast": { enabled: false } },
  });
  const graves = resultado.violations.filter((violacao) =>
    ["critical", "serious"].includes(violacao.impact ?? ""),
  );
  expect(graves.map((violacao) => violacao.id)).toEqual([]);
}

describe("o painel abre com os números de hoje (AC-800)", () => {
  it("@spec:AC-800 pede o período de hoje e mostra pedidos, vendido, valor médio e em aberto do dia da loja", async () => {
    const chamadas = simularMetricas(() => ({
      status: 200,
      corpo: metricasDe(),
    }));
    const tela = await abrirPainel();

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.url.startsWith("/api/painel/metricas?")).toBe(true);
    expect(chamadas[0]?.consulta.get("periodo")).toBe("hoje");

    expect(estado(tela)).toBe("sucesso");
    expect(valorDaMetrica(tela, "pedidos")).toBe("8");
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 500,00");
    expect(valorDaMetrica(tela, "ticket-medio")).toBe("R$ 62,50");
    expect(valorDaMetrica(tela, "em-aberto")).toBe("2");

    // "Hoje" é o dia da loja, escrito com a data que a API decidiu.
    const periodo = exigir(tela, "[data-periodo-em-vigor]");
    expect(periodo.textContent).toBe("Hoje: 27/09/2026");
    expect(periodo.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-09-27",
    );
  });
});

describe("dia sem venda orienta em vez de zero seco (AC-801)", () => {
  it("@spec:AC-801 os números zerados vêm com a explicação e o caminho para compartilhar o link da vitrine", async () => {
    simularMetricas(() => ({
      status: 200,
      corpo: metricasDe({
        resumo: RESUMO_ZERADO,
        vendidoAntes: 0,
        pedidosAntes: 0,
        apelido: "pastel-da-zica",
      }),
    }));
    const escrever = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: escrever },
    });
    const tela = await abrirPainel();

    expect(estado(tela)).toBe("vazio");
    // Os zeros continuam na tela...
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 0,00");
    expect(valorDaMetrica(tela, "pedidos")).toBe("0");
    // ...junto com a explicação.
    const vazio = exigir(tela, "[data-painel-vazio]");
    expect(vazio.querySelector("h2")?.textContent).toBe(
      "Ainda não houve pedido hoje",
    );
    expect(vazio.textContent).toMatch(/nenhum pedido entrou hoje/);

    const link = `${window.location.origin}/loja/pastel-da-zica`;
    expect(
      exigir<HTMLInputElement>(vazio, "[data-link-da-vitrine]").value,
    ).toBe(link);
    expect(
      exigir<HTMLAnchorElement>(vazio, 'a[href="/loja/pastel-da-zica"]')
        .textContent,
    ).toBe("Abrir minha vitrine");
    const whatsapp = exigir<HTMLAnchorElement>(
      vazio,
      'a[href^="https://wa.me/"]',
    );
    expect(decodeURIComponent(whatsapp.href)).toContain(link);

    clicar(botao(vazio, "Copiar link"));
    await assentar();
    expect(escrever).toHaveBeenCalledWith(link);
    expect(vazio.querySelector('[role="status"]')?.textContent).toMatch(
      /Link copiado/,
    );

    await semViolacaoGrave(tela);
  }, 60_000);

  it("@spec:AC-801 dia com pedido não mostra a orientação de dia vazio", async () => {
    simularMetricas(() => ({ status: 200, corpo: metricasDe() }));
    const tela = await abrirPainel();
    expect(tela.querySelector("[data-painel-vazio]")).toBeNull();
  });
});

describe("comparação com o período anterior (AC-802)", () => {
  it("@spec:AC-802 R$ 500 hoje contra R$ 400 ontem até as 14h32: subiu R$ 100,00, 25%, e diz contra o quê", async () => {
    simularMetricas(() => ({
      status: 200,
      corpo: metricasDe({ vendidoAntes: 40_000, pedidosAntes: 10 }),
    }));
    const tela = await abrirPainel();

    const vendido = exigir(tela, '[data-metrica="vendido"]');
    const seta = exigir(vendido, "[data-direcao]");
    expect(seta.getAttribute("data-direcao")).toBe("subiu");
    expect(seta.textContent).toContain("25%");
    expect(seta.textContent).toContain("Subiu R$ 100,00 (25%)");
    expect(vendido.textContent).toContain("vs ontem até 14h32");

    const pedidos = exigir(tela, '[data-metrica="pedidos"]');
    const setaPedidos = exigir(pedidos, "[data-direcao]");
    expect(setaPedidos.getAttribute("data-direcao")).toBe("caiu");
    expect(setaPedidos.textContent).toContain("Caiu 2 pedidos (20%)");
  });

  it("@spec:AC-802 sem venda no período anterior não inventa porcentagem", async () => {
    simularMetricas(() => ({
      status: 200,
      corpo: metricasDe({ vendidoAntes: 0, pedidosAntes: 0 }),
    }));
    const tela = await abrirPainel();

    const seta = exigir(
      exigir(tela, '[data-metrica="vendido"]'),
      "[data-direcao]",
    );
    expect(seta.getAttribute("data-direcao")).toBe("sem-base");
    expect(seta.textContent).not.toMatch(/\d%/);
  });
});

describe("enquanto carrega, nenhum número (AC-813)", () => {
  it("@spec:AC-813 a espera mostra o estado de carregamento e nenhum valor até a resposta chegar", async () => {
    const rede = adiada<{ status: number; corpo?: unknown }>();
    simularMetricas(() => rede.promessa);
    const tela = montar(<PainelDoDia />);
    await assentar();

    expect(estado(tela)).toBe("carregando");
    expect(exigir(tela, '[role="status"]').textContent).toContain(
      "Calculando os números de hoje",
    );
    expect(tela.textContent).not.toMatch(/R\$/);
    expect(tela.querySelector("[data-metrica]")).toBeNull();

    rede.resolver({ status: 200, corpo: metricasDe() });
    await assentar();
    expect(estado(tela)).toBe("sucesso");
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 500,00");
  });
});

describe("falha não vira número errado", () => {
  it("queda de rede mostra o erro com tentar de novo, e a segunda leitura traz os números", async () => {
    let vez = 0;
    simularMetricas(() => {
      vez += 1;
      if (vez === 1) return { status: 503, corpo: { erro: "indisponivel" } };
      return { status: 200, corpo: metricasDe() };
    });
    const tela = await abrirPainel();

    expect(estado(tela)).toBe("erro");
    expect(exigir(tela, '[role="alert"]').textContent).toContain(
      "Não foi possível carregar os números",
    );
    expect(tela.textContent).not.toMatch(/R\$/);
    await semViolacaoGrave(tela);

    clicar(botao(tela, "Tentar de novo"));
    await assentar();
    expect(estado(tela)).toBe("sucesso");
  }, 60_000);

  it("resposta fora do contrato é tratada como erro, e nenhum número dela aparece", async () => {
    simularMetricas(() => ({
      status: 200,
      corpo: { ...metricasDe(), resumo: { pedidos: "muitos" } },
    }));
    const tela = await abrirPainel();
    expect(estado(tela)).toBe("erro");
    expect(tela.querySelector("[data-metrica]")).toBeNull();
  });

  it("sessão vencida leva a entrar de novo, e não a tentar de novo", async () => {
    simularMetricas(() => ({
      status: 401,
      corpo: { erro: "nao_autenticado" },
    }));
    const tela = await abrirPainel();
    expect(estado(tela)).toBe("erro");
    expect(
      exigir<HTMLAnchorElement>(tela, 'a[href="/entrar"]').textContent,
    ).toBe("Entrar de novo");
  });
});

describe("acessibilidade do painel com números", () => {
  it("o painel com números não tem violação grave", async () => {
    simularMetricas(() => ({ status: 200, corpo: metricasDe() }));
    const tela = await abrirPainel();
    await semViolacaoGrave(tela);
  }, 60_000);
});
