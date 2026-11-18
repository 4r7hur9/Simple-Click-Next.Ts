// @vitest-environment jsdom
/**
 * Pedidos da conta (card #111): lista com o estado real e filtros no
 * endereço (AC-11106, AC-11107), detalhe com linha do tempo e atualização
 * sozinha (AC-11108 a AC-11110). Quem entrega só os pedidos da pessoa
 * (AC-11105) é a API: `apps/api/tests/meus-pedidos.test.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  AcompanhamentoNoContrato,
  PedidoDaContaNoContrato,
} from "@simpleclick/contracts";

import { FiltrosDePedidos } from "../src/features/conta/FiltrosDePedidos";
import { MeusPedidos } from "../src/features/conta/MeusPedidos";
import { AcompanhamentoDoPedido } from "../src/features/pedido/AcompanhamentoDoPedido";
import PedidoDaContaNaoEncontrado from "../src/app/(conta)/conta/pedidos/[id]/not-found";
import { desmontar, montar } from "./apoio-config";

afterEach(() => {
  desmontar();
  vi.useRealTimers();
});

type Pedido = AcompanhamentoNoContrato["pedido"];

function naLista(status: string, numero: number): PedidoDaContaNoContrato {
  return {
    id: `6e2f3a4b-1c2d-4e5f-8a9b-0c1d2e3f4a${numero.toString().padStart(2, "0")}`,
    loja: { nome: "Livraria da Esquina", apelido: "livraria-da-esquina" },
    numero,
    codigo: `L-00${numero}`,
    status,
    entrega: "PICKUP",
    totalCentavos: 5_000,
    quantidadeDeItens: 2,
    criadoEm: "2026-09-22T12:00:00.000Z",
    atualizadoEm: "2026-09-22T12:00:00.000Z",
  };
}

describe("a lista mostra o estado real (AC-11106)", () => {
  const ESTADOS: readonly [string, string][] = [
    ["PENDING", "Pedido recebido"],
    ["ACCEPTED", "Pedido aceito"],
    ["PREPARING", "Em preparo"],
    ["READY_FOR_PICKUP", "Pronto para retirada"],
    ["OUT_FOR_DELIVERY", "Saiu para entrega"],
    ["COMPLETED", "Pedido concluído"],
    ["CANCELLED", "Pedido cancelado"],
  ];

  it("[CA-6] @spec:AC-11106 cada pedido traz o texto do cliente, nunca o código interno", () => {
    const raiz = montar(
      <MeusPedidos
        leitura={{
          estado: "ok",
          pedidos: ESTADOS.map(([status], i) => naLista(status, i + 1)),
        }}
      />,
    );
    ESTADOS.forEach(([status, rotulo]) => {
      expect(
        raiz.querySelector(`[data-status="${status}"]`)?.textContent,
      ).toContain(rotulo);
    });
    expect(raiz.textContent).not.toMatch(
      /PREPARING|OUT_FOR_DELIVERY|READY_FOR_PICKUP|CANCELLED/,
    );
    expect(raiz.textContent).not.toContain("Confirmado");
  });

  it("[CA-6] @spec:AC-11106 o cancelado tem aparência própria, além do texto", () => {
    const raiz = montar(
      <MeusPedidos
        leitura={{
          estado: "ok",
          pedidos: [naLista("COMPLETED", 1), naLista("CANCELLED", 2)],
        }}
      />,
    );
    const concluido = raiz.querySelector('[data-status="COMPLETED"]');
    const cancelado = raiz.querySelector('[data-status="CANCELLED"]');
    expect(cancelado?.className).toContain(
      "sc-meus-pedidos__pedido--cancelado",
    );
    expect(concluido?.className).not.toContain("--cancelado");
    expect(cancelado?.textContent).toContain("Pedido cancelado");
  });

  it("[CA-6] @spec:AC-11106 nenhum arquivo da conta importa o texto interno do painel", () => {
    const pasta = join(__dirname, "../src/features/conta");
    for (const arquivo of readdirSync(pasta)) {
      const fonte = readFileSync(join(pasta, arquivo), "utf8");
      expect(fonte, arquivo).not.toContain("painel-pedidos");
    }
  });
});

describe("os filtros vão no endereço (AC-11107)", () => {
  const filtro = {
    situacao: "andamento",
    periodo: "30",
    loja: "livraria-da-esquina",
  } as const;

  it("[CA-7] @spec:AC-11107 a situação é um chip por link com o atual anunciado, e os links só levam situação, período e loja", () => {
    const html = renderToStaticMarkup(
      <FiltrosDePedidos
        filtro={filtro}
        lojas={[
          { apelido: "livraria-da-esquina", nome: "Livraria da Esquina" },
        ]}
      />,
    );
    const documento = new DOMParser().parseFromString(html, "text/html");
    const chips = [
      ...documento.querySelectorAll('nav[aria-label="Situação do pedido"] a'),
    ];
    expect(chips.map((a) => a.textContent)).toEqual([
      "Todos",
      "Em andamento",
      "Concluídos",
      "Cancelados",
    ]);
    expect(
      chips
        .filter((a) => a.getAttribute("aria-current") === "true")
        .map((a) => a.textContent),
    ).toEqual(["Em andamento"]);
    for (const chip of chips) {
      const consulta = new URL(
        chip.getAttribute("href") ?? "",
        "https://x.test",
      ).searchParams;
      for (const chave of consulta.keys()) {
        expect(["situacao", "periodo", "loja"]).toContain(chave);
      }
    }
    // O chip de "Concluídos" mantém período e loja: o filtro sobrevive ao clique.
    const concluidos = chips[2]?.getAttribute("href") ?? "";
    expect(concluidos).toContain("periodo=30");
    expect(concluidos).toContain("loja=livraria-da-esquina");
    expect(concluidos).toContain("situacao=concluidos");
  });
});

function detalhe(sobrescrita: Partial<Pedido> = {}): Pedido {
  return {
    numero: 42,
    codigo: "L-0042",
    status: "PREPARING",
    entrega: "PICKUP",
    formaDePagamento: "PIX",
    totalCentavos: 5_000,
    criadoEm: "2026-09-22T12:00:00.000Z",
    whatsappConfirmadoEm: "2026-09-22T12:01:00.000Z",
    cliente: { nome: "Maria", telefoneMascarado: "••••••7777" },
    loja: { nome: "Livraria da Esquina", whatsappPublico: null },
    itens: [
      {
        nome: "Livro de receitas",
        variacao: null,
        quantidade: 1,
        totalCentavos: 5_000,
        opcoes: [],
      },
    ],
    historico: [
      {
        de: null,
        para: "PENDING",
        motivo: null,
        ocorridoEm: "2026-09-22T12:00:00.000Z",
      },
      {
        de: "PENDING",
        para: "ACCEPTED",
        motivo: null,
        ocorridoEm: "2026-09-22T12:02:00.000Z",
      },
      {
        de: "ACCEPTED",
        para: "PREPARING",
        motivo: null,
        ocorridoEm: "2026-09-22T12:05:00.000Z",
      },
    ],
    ...sobrescrita,
  };
}

async function montarDetalhe(
  inicial: Pedido,
  atualizar: () => Promise<
    | { estado: "encontrado"; acompanhamento: { pedido: Pedido } }
    | { estado: "indisponivel"; motivo: string }
  >,
): Promise<HTMLElement> {
  const raiz = montar(
    <AcompanhamentoDoPedido
      apelidoDaLoja="livraria-da-esquina"
      tokenDoPedido="token-longo"
      inicial={inicial}
      atualizar={atualizar}
      intervaloMs={5_000}
      voltar={{ href: "/conta/pedidos", rotulo: "← Meus pedidos" }}
    />,
  );
  await act(async () => {});
  return raiz;
}

describe("a linha do tempo (AC-11109)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("[CA-9] @spec:AC-11109 só a última etapa é a atual, as anteriores continuam listadas", async () => {
    const raiz = await montarDetalhe(detalhe(), async () => ({
      estado: "indisponivel",
      motivo: "x",
    }));
    const passos = [...raiz.querySelectorAll("[data-passo]")];
    expect(passos.map((p) => p.getAttribute("data-passo"))).toEqual([
      "PENDING",
      "ACCEPTED",
      "PREPARING",
    ]);
    expect(passos.map((p) => p.getAttribute("aria-current"))).toEqual([
      null,
      null,
      "step",
    ]);
    expect(passos[2]?.textContent).toContain("Agora");
    expect(passos[0]?.textContent).not.toContain("Agora");
    expect(raiz.textContent).toContain("Seu pedido está sendo preparado.");
  });

  it("[CA-9] @spec:AC-11109 etapa que o sistema não conhece mostra texto neutro, sem quebrar", async () => {
    const raiz = await montarDetalhe(
      detalhe({
        status: "EM_ROTA_NOVA",
        historico: [
          {
            de: null,
            para: "EM_ROTA_NOVA",
            motivo: null,
            ocorridoEm: "2026-09-22T12:00:00.000Z",
          },
        ],
      }),
      async () => ({ estado: "indisponivel", motivo: "x" }),
    );
    expect(raiz.textContent).toContain("Em andamento");
    expect(raiz.textContent).toContain("A loja está cuidando do seu pedido.");
    expect(raiz.textContent).not.toContain("EM_ROTA_NOVA");
  });
});

describe("o acompanhamento atualiza sozinho (AC-11110)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("[CA-10] @spec:AC-11110 a nova etapa aparece em até 5 segundos, sem recarregar", async () => {
    const novo = detalhe({
      status: "OUT_FOR_DELIVERY",
      historico: [
        ...detalhe().historico,
        {
          de: "PREPARING",
          para: "OUT_FOR_DELIVERY",
          motivo: null,
          ocorridoEm: "2026-09-22T12:20:00.000Z",
        },
      ],
    });
    const raiz = await montarDetalhe(detalhe(), async () => ({
      estado: "encontrado",
      acompanhamento: { pedido: novo },
    }));
    expect(
      raiz
        .querySelector("[data-status-atual]")
        ?.getAttribute("data-status-atual"),
    ).toBe("PREPARING");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(
      raiz
        .querySelector("[data-status-atual]")
        ?.getAttribute("data-status-atual"),
    ).toBe("OUT_FOR_DELIVERY");
    expect(
      raiz
        .querySelector('[data-passo="OUT_FOR_DELIVERY"]')
        ?.getAttribute("aria-current"),
    ).toBe("step");
  });

  it("[CA-10] @spec:AC-11110 se a atualização falhar, a última etapa continua com um aviso", async () => {
    const raiz = await montarDetalhe(detalhe(), async () => ({
      estado: "indisponivel",
      motivo: "falha de rede",
    }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(
      raiz
        .querySelector("[data-status-atual]")
        ?.getAttribute("data-status-atual"),
    ).toBe("PREPARING");
    expect(raiz.textContent).toContain("Não foi possível atualizar agora.");
  });
});

describe("pedido de outra pessoa é igual a pedido que não existe (AC-11108)", () => {
  it("[CA-8] @spec:AC-11108 a tela de não encontrado é uma só e não diz se o pedido existe", () => {
    const html = renderToStaticMarkup(<PedidoDaContaNaoEncontrado />);
    expect(html).toContain("Pedido não encontrado");
    expect(html).toContain("/conta/pedidos");
    expect(html).not.toMatch(/existe|outra pessoa|pertence/i);
  });

  it("[CA-8] @spec:AC-11108 a página do detalhe usa notFound para os dois casos", () => {
    const fonte = readFileSync(
      join(__dirname, "../src/app/(conta)/conta/pedidos/[id]/page.tsx"),
      "utf8",
    );
    expect(fonte).toContain('leitura.estado === "nao-encontrado") notFound()');
  });
});
