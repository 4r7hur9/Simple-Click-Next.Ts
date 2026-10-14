// @vitest-environment jsdom
/**
 * Prova do seletor de período e do período no endereço (T-804; AC-803,
 * AC-805, AC-806).
 *
 * A página de métricas é montada como `/painel/metricas` a monta: o período
 * inicial sai do endereço pela mesma função que a página usa, e o período em
 * vigor é gravado de volta no endereço do jsdom pelo mesmo `replaceState` do
 * navegador. A única troca é a rede, que responde no formato do contrato.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clicar,
  desmontar,
  digitar,
  enviar,
  exigir,
  montar,
} from "../../../tests/apoio-config.tsx";
import {
  PERIODOS,
  RESUMO_DE_HOJE,
  adiada,
  assentar,
  metricasDe,
  periodoPersonalizado,
  simularMetricas,
  valorDaMetrica,
  type ChamadaDasMetricas,
  type RespostaDasMetricas,
} from "../../../tests/apoio-metricas.ts";
import {
  enderecoDoPeriodo,
  nomeDoAtalho,
  periodoDoEndereco,
  type AtalhoDoPeriodo,
  type ConsultaDoPeriodo,
} from "../../lib/metricas.ts";
import { MetricasPorPeriodo } from "./MetricasPorPeriodo.tsx";

const PAGINA = "/painel/metricas";

beforeEach(() => {
  window.history.replaceState(null, "", PAGINA);
});

afterEach(desmontar);

/** O servidor de métricas: cada atalho com o seu período e os seus números. */
function servidorDeMetricas(
  extra: (chamada: ChamadaDasMetricas) => RespostaDasMetricas | null = () =>
    null,
): ChamadaDasMetricas[] {
  return simularMetricas((chamada) => {
    const respostaExtra = extra(chamada);
    if (respostaExtra !== null) return respostaExtra;
    const periodo = chamada.consulta.get("periodo");
    if (periodo === "3d" || periodo === "7d" || periodo === "hoje") {
      const fator = periodo === "hoje" ? 1 : periodo === "3d" ? 3 : 7;
      return {
        status: 200,
        corpo: metricasDe({
          periodo: PERIODOS[periodo],
          resumo: {
            ...RESUMO_DE_HOJE,
            pedidos: RESUMO_DE_HOJE.pedidos * fator,
            vendidoCentavos: RESUMO_DE_HOJE.vendidoCentavos * fator,
            concluidos: {
              quantidade: RESUMO_DE_HOJE.concluidos.quantidade * fator,
              totalCentavos: RESUMO_DE_HOJE.concluidos.totalCentavos * fator,
            },
            emAndamento: {
              quantidade: RESUMO_DE_HOJE.emAndamento.quantidade * fator,
              totalCentavos: RESUMO_DE_HOJE.emAndamento.totalCentavos * fator,
            },
          },
        }),
      };
    }
    const de = chamada.consulta.get("de") ?? "";
    const ate = chamada.consulta.get("ate") ?? "";
    if (de === "" || ate === "") {
      return {
        status: 400,
        corpo: {
          erro: "periodo_invalido",
          explicacao: "Informe a data inicial e a data final do intervalo.",
        },
      };
    }
    if (ate < de) {
      return {
        status: 400,
        corpo: {
          erro: "periodo_invalido",
          explicacao:
            "A data final precisa ser igual ou posterior à data inicial.",
        },
      };
    }
    return {
      status: 200,
      corpo: metricasDe({ periodo: periodoPersonalizado(de, ate, 15) }),
    };
  });
}

/** Abre a página como o navegador abriria o endereço atual. */
async function abrirPagina(): Promise<HTMLElement> {
  const consulta = periodoDoEndereco(
    new URLSearchParams(window.location.search),
  );
  const tela = montar(<MetricasPorPeriodo consultaInicial={consulta} />);
  await assentar();
  return tela;
}

/** O atalho dentro do menu de período, achado pelo nome que a tela escreve. */
function atalho(tela: HTMLElement, nome: AtalhoDoPeriodo): HTMLButtonElement {
  const itens = [
    ...tela.querySelectorAll<HTMLButtonElement>(
      "[data-seletor-de-periodo] [popover] button",
    ),
  ];
  const item = itens.find((botao) =>
    botao.textContent?.endsWith(nomeDoAtalho(nome)),
  );
  if (item === undefined) throw new Error(`o menu não tem o atalho ${nome}`);
  return item;
}

/**
 * O atalho em vigor, como a tela o mostra: o botão do menu diz o nome dele,
 * e só ele, dentro do menu, leva a marca "em vigor" para o leitor de tela.
 */
function emVigor(tela: HTMLElement, nome: AtalhoDoPeriodo): void {
  expect(
    exigir(tela, "[data-seletor-de-periodo]").getAttribute("data-vigente"),
  ).toBe(nome);
  expect(
    exigir(tela, "[data-seletor-de-periodo] button[popovertarget]")
      .textContent,
  ).toBe(`Período: ${nomeDoAtalho(nome)}`);
  const marcados = [
    ...tela.querySelectorAll("[data-seletor-de-periodo] [data-em-vigor]"),
  ].map((marca) => marca.closest("button")?.textContent);
  expect(marcados).toEqual(
    nome === "personalizado" ? [] : [`Em vigor: ${nomeDoAtalho(nome)}`],
  );
}

async function tocar(elemento: HTMLElement): Promise<void> {
  clicar(elemento);
  await assentar();
}

async function escolherDatas(
  tela: HTMLElement,
  de: string,
  ate: string,
): Promise<void> {
  digitar(exigir<HTMLInputElement>(tela, 'input[name="de"]'), de);
  digitar(exigir<HTMLInputElement>(tela, 'input[name="ate"]'), ate);
  await enviar(exigir<HTMLFormElement>(tela, "form[data-intervalo]"));
  await assentar();
}

function periodoNaTela(tela: HTMLElement): string {
  return exigir(tela, "[data-periodo-em-vigor]").textContent ?? "";
}

describe("o período escolhido fica no endereço da página (AC-806)", () => {
  it("@spec:AC-806 todo período escrito no endereço é lido de volta igual, inclusive no formato do Next", () => {
    const periodos: ConsultaDoPeriodo[] = [
      { periodo: "hoje" },
      { periodo: "3d" },
      { periodo: "7d" },
      { periodo: "personalizado", de: "2026-08-01", ate: "2026-08-15" },
    ];
    for (const periodo of periodos) {
      const endereco = enderecoDoPeriodo(periodo);
      expect(periodoDoEndereco(new URLSearchParams(endereco))).toEqual(periodo);
      expect(
        periodoDoEndereco(Object.fromEntries(new URLSearchParams(endereco))),
      ).toEqual(periodo);
    }
    expect(
      enderecoDoPeriodo({
        periodo: "personalizado",
        de: "2026-08-01",
        ate: "2026-08-15",
      }),
    ).toBe("periodo=personalizado&de=2026-08-01&ate=2026-08-15");
    // Atalho desconhecido abre o dia de hoje, que é o que o painel abre sem nada.
    expect(periodoDoEndereco(new URLSearchParams("periodo=ontem"))).toEqual({
      periodo: "hoje",
    });
  });

  it("@spec:AC-806 o intervalo aplicado vai para o endereço, e recarregar a página traz o mesmo período", async () => {
    const chamadas = servidorDeMetricas();
    const tela = await abrirPagina();

    await escolherDatas(tela, "2026-08-01", "2026-08-15");
    expect(window.location.pathname).toBe(PAGINA);
    expect(window.location.search).toBe(
      "?periodo=personalizado&de=2026-08-01&ate=2026-08-15",
    );
    emVigor(tela, "personalizado");
    expect(periodoNaTela(tela)).toBe(
      "Intervalo escolhido: 01/08/2026 a 15/08/2026",
    );

    // Recarregar: a página monta de novo a partir do endereço, e pede o
    // mesmo recorte à API. (Desmontar desfaz a rede de mentira; a página
    // recarregada ganha uma nova, e só ela conta.)
    expect(chamadas.at(-1)?.consulta.get("periodo")).toBe("personalizado");
    desmontar();
    const depoisDeRecarregar = servidorDeMetricas();
    const recarregada = await abrirPagina();
    expect(depoisDeRecarregar).toHaveLength(1);
    const pedido = depoisDeRecarregar[0];
    expect(pedido?.consulta.get("periodo")).toBe("personalizado");
    expect(pedido?.consulta.get("de")).toBe("2026-08-01");
    expect(pedido?.consulta.get("ate")).toBe("2026-08-15");
    expect(periodoNaTela(recarregada)).toBe(
      "Intervalo escolhido: 01/08/2026 a 15/08/2026",
    );
  });

  it("@spec:AC-806 o link copiado e aberto em outra aba já chega com o período", async () => {
    window.history.replaceState(null, "", `${PAGINA}?periodo=7d`);
    const chamadas = servidorDeMetricas();
    const tela = await abrirPagina();

    expect(chamadas[0]?.consulta.get("periodo")).toBe("7d");
    emVigor(tela, "7d");
    expect(periodoNaTela(tela)).toBe("Últimos 7 dias: 21/09/2026 a 27/09/2026");
    expect(window.location.search).toBe("?periodo=7d");
  });
});

describe("os atalhos recalculam tudo e mostram o período (AC-803)", () => {
  it("@spec:AC-803 de hoje para três e depois sete dias: cada toque pede o período, troca os números e mostra início e fim", async () => {
    const chamadas = servidorDeMetricas();
    const tela = await abrirPagina();
    expect(periodoNaTela(tela)).toBe("Hoje: 27/09/2026");
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 500,00");
    emVigor(tela, "hoje");

    await tocar(atalho(tela, "3d"));
    expect(chamadas.at(-1)?.consulta.get("periodo")).toBe("3d");
    expect(periodoNaTela(tela)).toBe("Últimos 3 dias: 25/09/2026 a 27/09/2026");
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 1.500,00");
    expect(valorDaMetrica(tela, "pedidos")).toBe("24");
    emVigor(tela, "3d");
    expect(window.location.search).toBe("?periodo=3d");

    await tocar(atalho(tela, "7d"));
    expect(chamadas.at(-1)?.consulta.get("periodo")).toBe("7d");
    expect(periodoNaTela(tela)).toBe("Últimos 7 dias: 21/09/2026 a 27/09/2026");
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 3.500,00");
    expect(
      exigir(tela, "[data-periodo-em-vigor]").querySelectorAll("time"),
    ).toHaveLength(2);
    expect(window.location.search).toBe("?periodo=7d");
  });

  it("@spec:AC-803 enquanto o novo período carrega, os números do anterior saem da tela", async () => {
    const lento = adiada<{ status: number; corpo?: unknown }>();
    servidorDeMetricas((chamada) =>
      chamada.consulta.get("periodo") === "7d" ? lento.promessa : null,
    );
    const tela = await abrirPagina();

    await tocar(atalho(tela, "7d"));
    expect(tela.querySelector('[data-estado="carregando"]')).not.toBeNull();
    expect(tela.querySelector("[data-metrica]")).toBeNull();

    lento.resolver({
      status: 200,
      corpo: metricasDe({ periodo: PERIODOS["7d"] }),
    });
    await assentar();
    expect(periodoNaTela(tela)).toBe("Últimos 7 dias: 21/09/2026 a 27/09/2026");
  });

  it("@spec:AC-803 a resposta atrasada de um atalho não sobrescreve a do atalho tocado depois", async () => {
    const lento = adiada<{ status: number; corpo?: unknown }>();
    servidorDeMetricas((chamada) =>
      chamada.consulta.get("periodo") === "3d" ? lento.promessa : null,
    );
    const tela = await abrirPagina();

    await tocar(atalho(tela, "3d"));
    await tocar(atalho(tela, "7d"));
    lento.resolver({
      status: 200,
      corpo: metricasDe({ periodo: PERIODOS["3d"] }),
    });
    await assentar();

    expect(periodoNaTela(tela)).toBe("Últimos 7 dias: 21/09/2026 a 27/09/2026");
    emVigor(tela, "7d");
    expect(window.location.search).toBe("?periodo=7d");
  });
});

describe("intervalo inválido é recusado com explicação (AC-805)", () => {
  it("@spec:AC-805 data final antes da inicial: a tela explica e mantém o período anterior, os números dele e o endereço", async () => {
    window.history.replaceState(null, "", `${PAGINA}?periodo=7d`);
    servidorDeMetricas();
    const tela = await abrirPagina();
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 3.500,00");

    await escolherDatas(tela, "2026-09-20", "2026-09-10");

    const recusa = exigir(tela, '[role="alert"]');
    expect(recusa.textContent).toContain("O período não foi trocado");
    expect(recusa.textContent).toContain(
      "A data final precisa ser igual ou posterior à data inicial.",
    );
    expect(recusa.textContent).toContain(
      "Continua valendo: Últimos 7 dias: 21/09/2026 a 27/09/2026.",
    );

    expect(periodoNaTela(tela)).toBe("Últimos 7 dias: 21/09/2026 a 27/09/2026");
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 3.500,00");
    emVigor(tela, "7d");
    expect(window.location.search).toBe("?periodo=7d");
    // O que foi digitado continua lá, para corrigir só o dia errado.
    expect(exigir<HTMLInputElement>(tela, 'input[name="de"]').value).toBe(
      "2026-09-20",
    );
    expect(exigir<HTMLInputElement>(tela, 'input[name="ate"]').value).toBe(
      "2026-09-10",
    );

    // Corrigido o intervalo, a explicação some e o novo período vale.
    await escolherDatas(tela, "2026-09-01", "2026-09-15");
    expect(tela.querySelector("[data-recusa]")).toBeNull();
    expect(periodoNaTela(tela)).toBe(
      "Intervalo escolhido: 01/09/2026 a 15/09/2026",
    );
  });

  it("@spec:AC-805 endereço que já chega com intervalo impossível mostra a explicação e o dia de hoje, sem quebrar", async () => {
    window.history.replaceState(
      null,
      "",
      `${PAGINA}?periodo=personalizado&de=2026-09-20&ate=2026-09-10`,
    );
    servidorDeMetricas();
    const tela = await abrirPagina();

    expect(exigir(tela, "[data-recusa]").textContent).toBe(
      "A data final precisa ser igual ou posterior à data inicial.",
    );
    expect(periodoNaTela(tela)).toBe("Hoje: 27/09/2026");
    expect(valorDaMetrica(tela, "vendido")).toBe("R$ 500,00");
    expect(window.location.search).toBe("?periodo=hoje");
  });
});
