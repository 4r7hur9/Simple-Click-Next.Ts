// @vitest-environment jsdom
/**
 * Prova da página de acompanhamento na tela (AC-607, AC-610, AC-612, AC-613,
 * AC-615).
 *
 * A página nasce com o pedido que o servidor entregou e depois pergunta de novo
 * sozinha. A pergunta é trocada por uma que responde sem rede, e o relógio é de
 * mentira: "atualiza em poucos segundos sem recarregar" vira cinco segundos de
 * relógio e o status novo na tela.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import axe from "axe-core";
import type { AcompanhamentoNoContrato } from "@simpleclick/contracts";

import { AcompanhamentoDoPedido } from "../src/features/pedido/AcompanhamentoDoPedido";
import {
  buscarAcompanhamento,
  type ResultadoDoAcompanhamento,
} from "../src/lib/acompanhamento";
import { escreverDinheiro } from "../src/lib/produto";

type Pedido = AcompanhamentoNoContrato["pedido"];

const INTERVALO = 5_000;

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
  vi.useRealTimers();
});

function pedido(sobrescrita: Partial<Pedido> = {}): Pedido {
  return {
    numero: 42,
    codigo: "A-0042",
    status: "PENDING",
    entrega: "DELIVERY",
    formaDePagamento: "PIX",
    totalCentavos: 4_800,
    criadoEm: "2026-09-22T12:00:00.000Z",
    whatsappConfirmadoEm: null,
    cliente: { nome: "Maria Conceição", telefoneMascarado: "••••••7777" },
    loja: { nome: "Açaí da Praça", whatsappPublico: "+55 11 91111-2222" },
    itens: [
      {
        nome: "Açaí com granola",
        variacao: "500 ml",
        quantidade: 2,
        totalCentavos: 4_000,
        opcoes: [{ grupo: "Cobertura", nome: "Leite em pó", quantidade: 1 }],
      },
    ],
    historico: [
      {
        de: null,
        para: "PENDING",
        motivo: null,
        ocorridoEm: "2026-09-22T12:00:00.000Z",
      },
    ],
    ...sobrescrita,
  };
}

const encontrado = (p: Pedido): ResultadoDoAcompanhamento => ({
  estado: "encontrado",
  acompanhamento: { pedido: p },
});

function respostas(...resultados: ResultadoDoAcompanhamento[]) {
  const fila = [...resultados];
  return vi.fn(async () => {
    const proximo = fila.length > 1 ? fila.shift() : fila[0];
    if (proximo === undefined) throw new Error("cenário sem resposta");
    return proximo;
  });
}

async function montar(
  inicial: Pedido,
  atualizar: (
    a: string,
    t: string,
  ) => Promise<ResultadoDoAcompanhamento> = respostas(encontrado(inicial)),
): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(
      <AcompanhamentoDoPedido
        apelidoDaLoja="acai-da-praca"
        tokenDoPedido="token-longo-e-aleatorio"
        inicial={inicial}
        corPrincipal="#7c3aed"
        atualizar={atualizar}
        intervaloMs={INTERVALO}
      />,
    );
  });
  return container;
}

async function avancar(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function statusNaTela(tela: HTMLElement): string | null {
  return (
    tela
      .querySelector("[data-status-atual]")
      ?.getAttribute("data-status-atual") ?? null
  );
}

describe("a página mostra o estado atual e o que já passou (AC-612)", () => {
  it("@spec:AC-612 número, status em linguagem clara, linha do tempo, itens, total, pagamento e contato da loja", async () => {
    const tela = await montar(
      pedido({
        status: "PREPARING",
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
      }),
    );

    expect(tela.querySelector("h1")?.textContent).toBe("Pedido nº 42");
    expect(tela.textContent).toContain("A-0042");
    expect(tela.querySelector("[data-status-atual]")?.textContent).toBe(
      "Em preparo",
    );
    expect(tela.textContent).toContain("Seu pedido está sendo preparado.");
    expect(
      [...tela.querySelectorAll("[data-passo]")].map((p) =>
        p.getAttribute("data-passo"),
      ),
    ).toEqual(["PENDING", "ACCEPTED", "PREPARING"]);
    expect(tela.textContent).toContain("Pedido recebido");
    expect(tela.textContent).toContain("Pedido aceito");
    expect(tela.textContent).toContain("Açaí com granola");
    expect(tela.textContent).toContain("Cobertura: Leite em pó");
    expect(tela.querySelector("[data-total]")?.textContent).toBe(
      escreverDinheiro(4_800),
    );
    expect(tela.textContent).toContain("PIX");
    expect(
      tela.querySelector("[data-contato-da-loja]")?.getAttribute("href"),
    ).toBe("https://wa.me/5511911112222");
  });

  it("@spec:AC-612 a loja sem contato público é dita, em vez de deixar um vazio", async () => {
    const tela = await montar(
      pedido({ loja: { nome: "Açaí da Praça", whatsappPublico: null } }),
    );

    expect(tela.querySelector("[data-contato-da-loja]")).toBeNull();
    expect(tela.textContent).toContain(
      "A loja não divulgou um contato público",
    );
  });
});

describe("a página atualiza sozinha (AC-613)", () => {
  it("@spec:AC-613 quando o dono muda o status, a página mostra o novo em poucos segundos sem recarregar", async () => {
    const inicial = pedido();
    const aceito = pedido({
      status: "ACCEPTED",
      historico: [
        ...inicial.historico,
        {
          de: "PENDING",
          para: "ACCEPTED",
          motivo: null,
          ocorridoEm: "2026-09-22T12:03:00.000Z",
        },
      ],
    });
    const atualizar = respostas(encontrado(inicial), encontrado(aceito));
    const tela = await montar(inicial, atualizar);
    expect(statusNaTela(tela)).toBe("PENDING");

    await avancar(INTERVALO);
    expect(statusNaTela(tela)).toBe("PENDING");

    await avancar(INTERVALO);
    expect(statusNaTela(tela)).toBe("ACCEPTED");
    expect(tela.querySelectorAll("[data-passo]")).toHaveLength(2);
    expect(atualizar).toHaveBeenCalledWith(
      "acai-da-praca",
      "token-longo-e-aleatorio",
    );
  });

  it("@spec:AC-613 falha de rede avisa, mantém o último status e se recupera sozinha", async () => {
    const inicial = pedido();
    const atualizar = respostas(
      { estado: "indisponivel", motivo: "falha de rede" },
      encontrado(pedido({ status: "ACCEPTED" })),
    );
    const tela = await montar(inicial, atualizar);

    await avancar(INTERVALO);
    expect(tela.textContent).toContain("Não foi possível atualizar agora");
    expect(statusNaTela(tela)).toBe("PENDING");

    await avancar(INTERVALO);
    expect(tela.textContent).not.toContain("Não foi possível atualizar agora");
    expect(statusNaTela(tela)).toBe("ACCEPTED");
  });
});

describe("cancelado avisa o cliente e diz por quê (AC-607)", () => {
  it("@spec:AC-607 o pedido cancelado mostra o aviso com o motivo que a loja informou", async () => {
    const tela = await montar(
      pedido({
        status: "CANCELLED",
        historico: [
          {
            de: null,
            para: "PENDING",
            motivo: null,
            ocorridoEm: "2026-09-22T12:00:00.000Z",
          },
          {
            de: "PENDING",
            para: "CANCELLED",
            motivo: "Acabou o açaí",
            ocorridoEm: "2026-09-22T12:04:00.000Z",
          },
        ],
      }),
    );

    expect(tela.querySelector("[data-status-atual]")?.textContent).toBe(
      "Pedido cancelado",
    );
    expect(tela.textContent).toContain(
      "A loja informou o motivo: Acabou o açaí",
    );
    // Pedido cancelado não pede mais para o cliente confirmar o WhatsApp.
    expect(tela.textContent).not.toContain("Já enviei a mensagem");
  });
});

describe("a página não mostra mais do que o necessário (AC-615)", () => {
  it("@spec:AC-615 o telefone do cliente aparece só mascarado", async () => {
    const tela = await montar(pedido());

    expect(tela.textContent).toContain("Telefone ••••••7777");
    expect(tela.textContent).not.toMatch(/\d{8,}/);
  });
});

describe("o cliente sinaliza o envio pela página (AC-610)", () => {
  it("@spec:AC-610 o 'já enviei' aparece enquanto a loja não recebeu a confirmação, e some depois", async () => {
    const semConfirmar = await montar(pedido());
    expect(semConfirmar.textContent).toContain("Já enviei a mensagem");
    act(() => raiz?.unmount());
    container?.remove();

    const confirmado = await montar(
      pedido({ whatsappConfirmadoEm: "2026-09-22T12:01:00.000Z" }),
    );
    expect(confirmado.textContent).not.toContain("Já enviei a mensagem");
  });
});

describe("a leitura do link na borda do site (AC-614, AC-615)", () => {
  function responder(status: number, corpo: unknown) {
    return vi.fn(
      async () =>
        new Response(JSON.stringify(corpo), {
          status,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
  }

  it("@spec:AC-614 endereço que a API não encontra vira página de não encontrado", async () => {
    const resultado = await buscarAcompanhamento(
      "acai-da-praca",
      "token-que-nao-existe",
      responder(404, { erro: "nao_encontrado" }),
    );

    expect(resultado).toEqual({ estado: "nao-encontrado" });
  });

  it("@spec:AC-615 resposta com campo além do contrato público é recusada, e não desenhada", async () => {
    const comTelefoneInteiro = {
      pedido: {
        ...pedido(),
        cliente: {
          nome: "Maria Conceição",
          telefoneMascarado: "••••••7777",
          telefone: "+5511988887777",
        },
      },
    };

    const resultado = await buscarAcompanhamento(
      "acai-da-praca",
      "token-longo-e-aleatorio",
      responder(200, comTelefoneInteiro),
    );

    expect(resultado.estado).toBe("indisponivel");
  });
});

describe("a página é acessível (P-012)", () => {
  it("@principle:P-012 a página de acompanhamento não tem violação crítica nem séria", async () => {
    const tela = await montar(pedido({ status: "OUT_FOR_DELIVERY" }));
    vi.useRealTimers();
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => null,
    });
    document.documentElement.lang = "pt-BR";

    const resultado = await axe.run(tela, {
      rules: { "color-contrast": { enabled: false } },
    });
    const graves = resultado.violations.filter((violacao) =>
      ["critical", "serious"].includes(violacao.impact ?? ""),
    );

    expect(graves.map((violacao) => violacao.id)).toEqual([]);
    // O motor do axe percorre a árvore inteira: com a suíte completa rodando
    // em paralelo, ele passa dos 5 s padrão sem nada de errado na tela.
  }, 60_000);
});
