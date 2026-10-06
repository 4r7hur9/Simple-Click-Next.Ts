// @vitest-environment jsdom
/**
 * Prova da exportação do período na tela (T-808; AC-815).
 *
 * A página de métricas é montada como `/painel/metricas` a monta. A rede é
 * trocada por um servidor de mentira que responde as métricas no formato do
 * contrato e a planilha como a API a devolve (CSV com nome no cabeçalho). O
 * que se prova é que a planilha pedida é a do período EM VIGOR — o mesmo
 * recorte dos números na tela — e que o arquivo chega ao navegador com o
 * nome que a API deu.
 */
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MetricasPorPeriodo } from "../src/features/dashboard/MetricasPorPeriodo.tsx";
import {
  botao,
  clicar,
  desmontar,
  digitar,
  enviar,
  exigir,
  montar,
} from "./apoio-config.tsx";
import { PERIODOS, assentar, metricasDe } from "./apoio-metricas.ts";

const CSV = "﻿data;numero;cliente\r\n27/09/2026 12:00;1;Ana\r\n";
const ARQUIVO = "pedidos-loja-teste-2026-09-21-a-2026-09-27.csv";

interface Chamada {
  readonly caminho: string;
  readonly consulta: URLSearchParams;
}

let salvos: { nome: string; arquivo: Blob }[] = [];

beforeEach(() => {
  window.history.replaceState(null, "", "/painel/metricas?periodo=7d");
  salvos = [];
  // O jsdom não cria endereço de arquivo nem baixa nada: aqui o que se
  // registra é o que o navegador receberia.
  const criados = new Map<string, Blob>();
  URL.createObjectURL = (arquivo: Blob) => {
    const endereco = `blob:planilha-${criados.size}`;
    criados.set(endereco, arquivo);
    return endereco;
  };
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    const arquivo = criados.get(this.href);
    if (arquivo !== undefined) salvos.push({ nome: this.download, arquivo });
  });
});

afterEach(() => {
  desmontar();
  vi.restoreAllMocks();
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

function servidor(
  planilha: () => Response = () =>
    new Response(CSV, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${ARQUIVO}"`,
        "x-quantidade-de-pedidos": "12",
      },
    }),
): Chamada[] {
  const chamadas: Chamada[] = [];
  vi.stubGlobal("fetch", async (endereco: RequestInfo | URL) => {
    const url = new URL(String(endereco), "http://localhost");
    chamadas.push({ caminho: url.pathname, consulta: url.searchParams });
    if (url.pathname.endsWith("/exportar")) return planilha();
    const periodo = url.searchParams.get("periodo");
    if (periodo === "7d" || periodo === "3d" || periodo === "hoje") {
      return Response.json(metricasDe({ periodo: PERIODOS[periodo] }));
    }
    return Response.json(
      {
        erro: "periodo_invalido",
        explicacao:
          "A data final precisa ser igual ou posterior à data inicial.",
      },
      { status: 400 },
    );
  });
  return chamadas;
}

async function abrir(): Promise<HTMLElement> {
  const tela = montar(
    <MetricasPorPeriodo consultaInicial={{ periodo: "7d" }} />,
  );
  await assentar();
  return tela;
}

describe("a planilha do período em vigor (AC-815)", () => {
  it("@spec:AC-815 o botão pede a planilha do mesmo período dos números e entrega o arquivo com o nome da API", async () => {
    const chamadas = servidor();
    const tela = await abrir();

    clicar(botao(tela, "Baixar planilha do período"));
    await assentar();

    const pedido = chamadas.find((chamada) =>
      chamada.caminho.endsWith("/exportar"),
    );
    expect(pedido?.caminho).toBe("/api/painel/metricas/exportar");
    expect(pedido?.consulta.toString()).toBe("periodo=7d");

    expect(salvos).toHaveLength(1);
    const [salvo] = salvos;
    if (salvo === undefined) throw new Error("nenhum arquivo foi entregue");
    expect(salvo.nome).toBe(ARQUIVO);
    const bytes = new Uint8Array(await salvo.arquivo.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    expect(exigir(tela, "[data-exportar] [role=status]").textContent).toBe(
      `Planilha ${ARQUIVO} baixada com 12 pedidos (Últimos 7 dias: 21/09/2026 a 27/09/2026).`,
    );
  });

  it("@spec:AC-815 depois de um intervalo recusado, a planilha continua sendo a do período que vale", async () => {
    const chamadas = servidor();
    const tela = await abrir();

    digitar(exigir<HTMLInputElement>(tela, 'input[name="de"]'), "2026-09-20");
    digitar(exigir<HTMLInputElement>(tela, 'input[name="ate"]'), "2026-09-10");
    await enviar(exigir<HTMLFormElement>(tela, "form[data-intervalo]"));
    await assentar();
    expect(tela.querySelector("[data-recusa]")).not.toBeNull();

    clicar(botao(tela, "Baixar planilha do período"));
    await assentar();
    const pedido = chamadas.find((chamada) =>
      chamada.caminho.endsWith("/exportar"),
    );
    expect(pedido?.consulta.toString()).toBe("periodo=7d");
  });

  it("sessão vencida diz o motivo em vez de baixar um arquivo com erro dentro", async () => {
    servidor(() => Response.json({ erro: "nao_autenticado" }, { status: 401 }));
    const tela = await abrir();

    clicar(botao(tela, "Baixar planilha do período"));
    await assentar();

    expect(salvos).toHaveLength(0);
    expect(exigir(tela, "[data-exportar-falhou]").textContent).toBe(
      "Sua sessão terminou. Entre de novo para baixar a planilha.",
    );
  });
});

describe("acessibilidade da página de períodos", () => {
  it("seletor, números e exportação juntos não têm violação grave", async () => {
    servidor();
    const tela = await abrir();
    const resultado = await axe.run(tela, {
      rules: { "color-contrast": { enabled: false } },
    });
    const graves = resultado.violations.filter((violacao) =>
      ["critical", "serious"].includes(violacao.impact ?? ""),
    );
    expect(graves.map((violacao) => violacao.id)).toEqual([]);
  }, 60_000);
});
