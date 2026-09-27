// @vitest-environment jsdom
/**
 * Prova do detalhe do pedido no painel (AC-604..AC-608).
 *
 * A tela recebe do servidor o pedido e os próximos passos possíveis, e é isso
 * que ela desenha: um botão por passo oferecido, nenhum a mais. A rede é
 * trocada por uma que responde sem servidor e anota o que a tela pediu — é o
 * que permite afirmar o que a tela ENVIOU ao mudar o status.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  DetalheDoPedido,
  horarioExato,
  type PedidoDetalhado,
} from "../src/features/painel-pedidos/DetalheDoPedido";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

const OPCOES = {
  aceitar: { status: "ACCEPTED", rotulo: "Aceito", acao: "Aceitar pedido" },
  recusar: {
    status: "CANCELLED",
    rotulo: "Cancelado",
    acao: "Recusar pedido",
  },
  cancelar: {
    status: "CANCELLED",
    rotulo: "Cancelado",
    acao: "Cancelar pedido",
  },
  pronto: {
    status: "READY_FOR_PICKUP",
    rotulo: "Pronto para retirada",
    acao: "Pronto para retirada",
  },
} as const;

function pedido(sobrescrita: Partial<PedidoDetalhado> = {}): PedidoDetalhado {
  return {
    id: "pedido-1",
    numero: 12,
    codigo: "A-0012",
    status: "PENDING",
    canal: "ONLINE",
    entrega: "DELIVERY",
    totalCentavos: 4_800,
    criadoEm: "2026-09-22T12:00:00.000Z",
    observacao: null,
    motivoCancelamento: null,
    contato: {
      nome: "Maria Conceição",
      telefone: "+5511988887777",
      endereco: { logradouro: "Rua das Flores", numero: "123" },
    },
    itens: [
      {
        id: "item-1",
        nome: "Açaí com granola",
        variacao: null,
        quantidade: 2,
        totalCentavos: 4_000,
        observacao: null,
        opcoes: [],
      },
    ],
    historico: [
      {
        id: "passo-1",
        de: null,
        para: "PENDING",
        papel: "CUSTOMER",
        motivo: null,
        ocorridoEm: "2026-09-22T12:00:07.123Z",
      },
    ],
    proximosStatus: [OPCOES.aceitar, OPCOES.recusar],
    ...sobrescrita,
  };
}

interface Chamada {
  readonly metodo: string;
  readonly corpo: unknown;
}

/**
 * Uma API de mentira: cada GET devolve o próximo estado do pedido; cada PATCH
 * é anotado e respondido com a resposta dada.
 */
function api(
  estados: PedidoDetalhado[],
  respostaDoPatch: { status: number; corpo: unknown } = {
    status: 200,
    corpo: {},
  },
) {
  const chamadas: Chamada[] = [];
  const fila = [...estados];
  const buscar = vi.fn(async (_endereco: unknown, opcoes?: RequestInit) => {
    const metodo = opcoes?.method ?? "GET";
    chamadas.push({
      metodo,
      corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : null,
    });
    if (metodo === "PATCH") {
      return new Response(JSON.stringify(respostaDoPatch.corpo), {
        status: respostaDoPatch.status,
      });
    }
    const atual = fila.length > 1 ? fila.shift() : fila[0];
    return new Response(JSON.stringify({ pedido: atual }), { status: 200 });
  });
  return { buscar: buscar as unknown as typeof fetch, chamadas };
}

async function montar(buscar: typeof fetch): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(<DetalheDoPedido pedidoId="pedido-1" buscar={buscar} />);
  });
  return container;
}

function botoes(tela: HTMLElement): string[] {
  return [...tela.querySelectorAll("button[data-status]")].map(
    (botao) => botao.textContent ?? "",
  );
}

function botao(tela: HTMLElement, texto: string): HTMLButtonElement {
  const achado = [...tela.querySelectorAll("button")].find(
    (candidato) => candidato.textContent === texto,
  );
  if (!achado) throw new Error(`não existe botão "${texto}"`);
  return achado;
}

function digitar(campo: HTMLTextAreaElement, valor: string): void {
  const escrever = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  escrever?.call(campo, valor);
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("o dono faz o pedido andar (AC-604)", () => {
  it("@spec:AC-604 aceitar envia o passo ao servidor e a tela mostra o status novo", async () => {
    const aceito = pedido({
      status: "ACCEPTED",
      proximosStatus: [
        { status: "PREPARING", rotulo: "Em preparo", acao: "Iniciar preparo" },
        OPCOES.cancelar,
      ],
    });
    const { buscar, chamadas } = api([pedido(), aceito]);
    const tela = await montar(buscar);

    await act(async () => {
      botao(tela, "Aceitar pedido").click();
    });

    expect(chamadas.find((c) => c.metodo === "PATCH")?.corpo).toEqual({
      status: "ACCEPTED",
      motivo: null,
    });
    expect(
      tela
        .querySelector("[data-status-atual]")
        ?.getAttribute("data-status-atual"),
    ).toBe("ACCEPTED");
    expect(botoes(tela)).toEqual(["Iniciar preparo", "Cancelar pedido"]);
  });
});

describe("retirada não oferece entrega (AC-605)", () => {
  it("@spec:AC-605 em preparo, o pedido de retirada mostra pronto para retirada e nenhum botão de entrega", async () => {
    const { buscar } = api([
      pedido({
        status: "PREPARING",
        entrega: "PICKUP",
        proximosStatus: [OPCOES.pronto, OPCOES.cancelar],
      }),
    ]);
    const tela = await montar(buscar);

    expect(botoes(tela)).toEqual(["Pronto para retirada", "Cancelar pedido"]);
    expect(tela.textContent).not.toContain("Saiu para entrega");
  });
});

describe("caminho que não existe (AC-606)", () => {
  it("@spec:AC-606 pedido concluído não oferece ação nenhuma", async () => {
    const { buscar } = api([
      pedido({ status: "COMPLETED", proximosStatus: [] }),
    ]);
    const tela = await montar(buscar);

    expect(botoes(tela)).toEqual([]);
    expect(tela.textContent).toContain("não há próxima ação");
  });

  it("@spec:AC-606 a recusa do servidor aparece com a explicação, e o status continua o de antes", async () => {
    const { buscar } = api([pedido()], {
      status: 409,
      corpo: {
        erro: "transicao_invalida",
        explicacao: "Não é possível mudar de Concluído para Em preparo.",
      },
    });
    const tela = await montar(buscar);

    await act(async () => {
      botao(tela, "Aceitar pedido").click();
    });

    expect(tela.querySelector('[role="alert"]')?.textContent).toBe(
      "Não é possível mudar de Concluído para Em preparo.",
    );
    expect(
      tela
        .querySelector("[data-status-atual]")
        ?.getAttribute("data-status-atual"),
    ).toBe("PENDING");
  });
});

describe("recusar exige motivo (AC-607)", () => {
  it("@spec:AC-607 o botão de recusar só destrava com motivo, e o motivo vai junto ao servidor", async () => {
    const { buscar, chamadas } = api([pedido()]);
    const tela = await montar(buscar);
    const recusar = botao(tela, "Recusar pedido");
    const campo = tela.querySelector("textarea");
    if (!campo) throw new Error("a tela não tem o campo do motivo");

    expect(recusar.disabled).toBe(true);
    await act(async () => {
      digitar(campo, "Acabou o açaí");
    });
    expect(recusar.disabled).toBe(false);

    await act(async () => {
      recusar.click();
    });
    expect(chamadas.find((c) => c.metodo === "PATCH")?.corpo).toEqual({
      status: "CANCELLED",
      motivo: "Acabou o açaí",
    });
  });

  it("@spec:AC-607 o pedido cancelado mostra o motivo que o cliente recebeu", async () => {
    const { buscar } = api([
      pedido({
        status: "CANCELLED",
        motivoCancelamento: "Acabou o açaí",
        proximosStatus: [],
      }),
    ]);
    const tela = await montar(buscar);

    expect(tela.textContent).toContain("Motivo informado ao cliente");
    expect(tela.textContent).toContain("Acabou o açaí");
  });
});

describe("a linha do tempo diz quando e quem (AC-608)", () => {
  it("@spec:AC-608 cada passo aparece com o horário exato e quem o deu", async () => {
    const historico = [
      {
        id: "p1",
        de: null,
        para: "PENDING",
        papel: "CUSTOMER",
        motivo: null,
        ocorridoEm: "2026-09-22T12:00:07.123Z",
      },
      {
        id: "p2",
        de: "PENDING",
        para: "ACCEPTED",
        papel: "OWNER",
        motivo: null,
        ocorridoEm: "2026-09-22T12:01:30.000Z",
      },
      {
        id: "p3",
        de: "ACCEPTED",
        para: "CANCELLED",
        papel: "STAFF",
        motivo: "Cliente desistiu",
        ocorridoEm: "2026-09-22T12:05:59.000Z",
      },
    ];
    const { buscar } = api([
      pedido({ status: "CANCELLED", historico, proximosStatus: [] }),
    ]);
    const tela = await montar(buscar);

    const passos = [...tela.querySelectorAll("[data-passo]")];
    expect(passos.map((p) => p.getAttribute("data-passo"))).toEqual([
      "PENDING",
      "ACCEPTED",
      "CANCELLED",
    ]);
    expect(passos[0]?.querySelector("time")?.textContent).toBe(
      horarioExato("2026-09-22T12:00:07.123Z"),
    );
    // O horário exato traz os segundos.
    expect(horarioExato("2026-09-22T12:00:07.123Z")).toMatch(/:07$/);
    expect(passos[0]?.textContent).toContain("Cliente");
    expect(passos[1]?.textContent).toContain("Dono da loja");
    expect(passos[2]?.textContent).toContain("Equipe da loja");
    expect(passos[2]?.textContent).toContain("Cliente desistiu");
  });
});

describe("os estados do detalhe (P-011)", () => {
  it("@principle:P-011 enquanto carrega, a espera é anunciada; se falhar, há como tentar de novo", async () => {
    let responder: ((resposta: Response) => void) | undefined;
    const pendente = vi.fn(
      () =>
        new Promise<Response>((resolver) => {
          responder = resolver;
        }),
    ) as unknown as typeof fetch;
    const tela = await montar(pendente);

    expect(tela.querySelector('[role="status"]')?.textContent).toContain(
      "Carregando pedido",
    );

    await act(async () => {
      responder?.(new Response("{}", { status: 404 }));
    });
    expect(tela.querySelector('[role="alert"]')?.textContent).toContain(
      "Não foi possível abrir este pedido",
    );
    expect(botao(tela, "Tentar de novo")).toBeTruthy();
  });
});
