// @vitest-environment jsdom
/**
 * Prova da lista de pedidos da conta na tela e da leitura na borda do site
 * (AC-616, P-011, P-012).
 *
 * A tela recebe a leitura pronta e desenha; a leitura é provada com uma
 * resposta de mentira no lugar da rede. O que importa: todo pedido de toda
 * loja aparece, com o status de agora e um caminho para o detalhe que não
 * depende do link original — e a sessão do cliente vai no cabeçalho, nunca
 * na URL.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import axe from "axe-core";
import type { PedidoDaContaNoContrato } from "@simpleclick/contracts";

import {
  caminhoDoMeuPedido,
  MeusPedidos,
} from "../src/features/conta/MeusPedidos";
import {
  agruparPedidosPorLoja,
  buscarMeuPedido,
  buscarMeusPedidos,
} from "../src/lib/meus-pedidos";
import { escreverDinheiro } from "../src/lib/produto";

let raiz: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (raiz) act(() => raiz?.unmount());
  container?.remove();
  raiz = null;
  container = null;
});

const ID_A1 = "6e2f3a4b-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const ID_B1 = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const ID_A2 = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";

function pedido(
  sobrescrita: Partial<PedidoDaContaNoContrato> = {},
): PedidoDaContaNoContrato {
  return {
    id: ID_A1,
    loja: { nome: "Pastelaria da Conta", apelido: "pastelaria-da-conta" },
    numero: 42,
    codigo: "A-0042",
    status: "PENDING",
    entrega: "PICKUP",
    totalCentavos: 900,
    quantidadeDeItens: 1,
    criadoEm: "2026-09-22T12:00:00.000Z",
    atualizadoEm: "2026-09-22T12:00:00.000Z",
    ...sobrescrita,
  };
}

/** Três pedidos em duas lojas, do mais novo ao mais antigo, como a API entrega. */
function emDuasLojas(): PedidoDaContaNoContrato[] {
  return [
    pedido({
      id: ID_A2,
      numero: 43,
      status: "PREPARING",
      criadoEm: "2026-09-22T12:10:00.000Z",
    }),
    pedido({
      id: ID_B1,
      loja: { nome: "Açaí da Conta", apelido: "acai-da-conta" },
      numero: 7,
      status: "OUT_FOR_DELIVERY",
      entrega: "DELIVERY",
      totalCentavos: 2_500,
      quantidadeDeItens: 2,
      criadoEm: "2026-09-22T12:05:00.000Z",
    }),
    pedido({ id: ID_A1, numero: 42, status: "COMPLETED" }),
  ];
}

async function montar(
  leitura: Parameters<typeof MeusPedidos>[0]["leitura"],
): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(<MeusPedidos leitura={leitura} />);
  });
  return container;
}

describe("a conta mostra todos os pedidos, de todas as lojas (AC-616)", () => {
  it("@spec:AC-616 cada loja tem a sua seção, e cada pedido traz número, status atual, total e o caminho do detalhe", async () => {
    const tela = await montar({ estado: "ok", pedidos: emDuasLojas() });

    const lojas = [...tela.querySelectorAll("[data-loja]")].map((secao) =>
      secao.getAttribute("data-loja"),
    );
    expect(lojas).toEqual(["pastelaria-da-conta", "acai-da-conta"]);
    expect(tela.textContent).toContain("Pastelaria da Conta");
    expect(tela.textContent).toContain("Açaí da Conta");

    const pedidos = [...tela.querySelectorAll("[data-pedido]")];
    expect(pedidos.map((p) => p.getAttribute("data-pedido"))).toEqual([
      ID_A2,
      ID_A1,
      ID_B1,
    ]);

    const emPreparo = tela.querySelector(`[data-pedido="${ID_A2}"]`);
    expect(emPreparo?.textContent).toContain("Pedido nº 43");
    expect(emPreparo?.textContent).toContain("Em preparo");
    expect(emPreparo?.querySelector("[data-total]")?.textContent).toBe(
      escreverDinheiro(900),
    );
    expect(emPreparo?.querySelector("a")?.getAttribute("href")).toBe(
      `/minha-conta/pedidos/${ID_A2}`,
    );

    const aCaminho = tela.querySelector(`[data-pedido="${ID_B1}"]`);
    expect(aCaminho?.textContent).toContain("Saiu para entrega");
    expect(aCaminho?.textContent).toContain("2 itens");
    expect(aCaminho?.querySelector("[data-total]")?.textContent).toBe(
      escreverDinheiro(2_500),
    );
    // Nenhum código interno de status vaza para a tela.
    expect(tela.textContent).not.toContain("OUT_FOR_DELIVERY");
    expect(tela.textContent).not.toContain("PREPARING");
  });

  it("@spec:AC-616 o caminho do detalhe é o da conta, e não o link público", () => {
    expect(caminhoDoMeuPedido(ID_A1)).toBe(`/minha-conta/pedidos/${ID_A1}`);
    expect(caminhoDoMeuPedido(ID_A1)).not.toContain("/l/");
  });

  it("@spec:AC-616 agrupar por loja mantém a loja do pedido mais recente primeiro e a ordem dentro dela", () => {
    const grupos = agruparPedidosPorLoja(emDuasLojas());

    expect(grupos.map((g) => g.apelido)).toEqual([
      "pastelaria-da-conta",
      "acai-da-conta",
    ]);
    expect(grupos[0]?.pedidos.map((p) => p.numero)).toEqual([43, 42]);
    expect(grupos[1]?.pedidos.map((p) => p.numero)).toEqual([7]);
    expect(agruparPedidosPorLoja([])).toEqual([]);
  });
});

describe("a lista cobre vazio, erro e sucesso (P-011)", () => {
  it("@principle:P-011 sem pedido nenhum, a tela diz isso e explica como o histórico aparece", async () => {
    const tela = await montar({ estado: "ok", pedidos: [] });

    expect(tela.textContent).toContain("Você ainda não fez nenhum pedido");
    expect(tela.querySelector("[data-meus-pedidos]")).toBeNull();
  });

  it("@principle:P-011 com a API fora do ar, a tela avisa e oferece tentar de novo, sem expor o motivo cru", async () => {
    const tela = await montar({
      estado: "indisponivel",
      motivo: "ECONNREFUSED 10.0.0.7:5432",
    });

    const alerta = tela.querySelector("[role='alert']");
    expect(alerta?.textContent).toContain("Não deu para carregar seus pedidos");
    expect(alerta?.querySelector("a")?.getAttribute("href")).toBe(
      "/minha-conta/pedidos",
    );
    expect(tela.textContent).not.toContain("ECONNREFUSED");
  });
});

describe("a leitura na borda do site (AC-616)", () => {
  function responder(status: number, corpo: unknown) {
    return vi.fn(
      async () =>
        new Response(JSON.stringify(corpo), {
          status,
          headers: { "content-type": "application/json" },
        }),
    );
  }

  it("@spec:AC-616 a sessão do cliente vai no cabeçalho, e a lista volta conferida pelo contrato", async () => {
    const buscar = responder(200, { pedidos: emDuasLojas() });

    const leitura = await buscarMeusPedidos(
      "token-de-acesso",
      buscar as unknown as typeof fetch,
    );

    expect(leitura.estado).toBe("ok");
    if (leitura.estado === "ok") expect(leitura.pedidos).toHaveLength(3);
    const [endereco, opcoes] = buscar.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(endereco).toMatch(/\/v1\/conta\/pedidos$/);
    expect(endereco).not.toContain("token-de-acesso");
    expect((opcoes.headers as Record<string, string>)["authorization"]).toBe(
      "Bearer token-de-acesso",
    );
    expect(opcoes.cache).toBe("no-store");
  });

  it("@spec:AC-616 sessão recusada vira 'entrar de novo', e não uma lista vazia", async () => {
    const leitura = await buscarMeusPedidos(
      "token-vencido",
      responder(401, { erro: "nao_autenticado" }) as unknown as typeof fetch,
    );

    expect(leitura).toEqual({ estado: "nao-autenticado" });
  });

  it("@spec:AC-616 resposta fora do contrato e API fora do ar viram indisponível, nunca uma tela com dado estranho", async () => {
    const comCampoAMais = await buscarMeusPedidos(
      "token",
      responder(200, {
        pedidos: [{ ...pedido(), telefoneDoCliente: "11988887777" }],
      }) as unknown as typeof fetch,
    );
    const semRede = await buscarMeusPedidos("token", (async () => {
      throw new Error("falha de rede");
    }) as unknown as typeof fetch);

    expect(comCampoAMais.estado).toBe("indisponivel");
    expect(semRede).toEqual({
      estado: "indisponivel",
      motivo: "falha de rede",
    });
  });

  it("@spec:AC-616 o detalhe pelo identificador volta com a loja, o endereço público e o pedido; pedido que não é seu é não encontrado", async () => {
    const detalhe = {
      id: ID_A1,
      loja: { nome: "Pastelaria da Conta", apelido: "pastelaria-da-conta" },
      tokenPublico: "token-longo-e-aleatorio",
      pedido: {
        numero: 42,
        codigo: "A-0042",
        status: "PENDING",
        entrega: "PICKUP",
        formaDePagamento: "PIX",
        totalCentavos: 900,
        criadoEm: "2026-09-22T12:00:00.000Z",
        whatsappConfirmadoEm: null,
        cliente: { nome: "Maria da Conta", telefoneMascarado: "••••••6666" },
        loja: { nome: "Pastelaria da Conta", whatsappPublico: null },
        itens: [],
        historico: [],
      },
    };

    const encontrado = await buscarMeuPedido(
      ID_A1,
      "token",
      responder(200, detalhe) as unknown as typeof fetch,
    );
    const alheio = await buscarMeuPedido(
      ID_B1,
      "token",
      responder(404, { erro: "nao_encontrado" }) as unknown as typeof fetch,
    );

    expect(encontrado).toEqual({ estado: "encontrado", detalhe });
    expect(alheio).toEqual({ estado: "nao-encontrado" });
  });
});

describe("a lista é acessível (P-012)", () => {
  it("@principle:P-012 a lista de pedidos não tem violação crítica nem séria", async () => {
    const tela = await montar({ estado: "ok", pedidos: emDuasLojas() });
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
  }, 60_000);
});
