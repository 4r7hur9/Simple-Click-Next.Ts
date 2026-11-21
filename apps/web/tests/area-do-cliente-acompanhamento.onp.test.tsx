// @vitest-environment jsdom
/**
 * Acompanhamento público por código (card #111, AC-11111, AC-11112).
 *
 * A página real roda com a API trocada por respostas do teste. Que código
 * mal formado, inexistente e de outra loja recebem a MESMA resposta da API é
 * provado contra o banco em `apps/api/tests/acompanhamento-nao-enumeravel.test.ts`;
 * aqui se prova o que o site faz com ela.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AcompanhamentoNoContrato } from "@simpleclick/contracts";

const vitrine = vi.hoisted(() => ({
  buscarVitrine: vi.fn(async () => ({ estado: "nao-encontrada" })),
}));
vi.mock("../src/server/vitrine.ts", () => vitrine);
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import PaginaDeAcompanhamento, {
  generateMetadata,
} from "../src/app/(loja)/loja/[slug]/pedido/[token]/page";
import PedidoNaoEncontrado from "../src/app/(loja)/loja/[slug]/pedido/[token]/not-found";
import { AcompanhamentoDoPedido } from "../src/features/pedido/AcompanhamentoDoPedido";
import { buscarAcompanhamento } from "../src/lib/acompanhamento";
import { desmontar, montar } from "./apoio-config";

afterEach(() => {
  desmontar();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

type Pedido = AcompanhamentoNoContrato["pedido"];

const PEDIDO: Pedido = {
  numero: 9,
  codigo: "A-0009",
  status: "ACCEPTED",
  entrega: "DELIVERY",
  formaDePagamento: "PIX",
  totalCentavos: 3_200,
  criadoEm: "2026-09-22T12:00:00.000Z",
  whatsappConfirmadoEm: "2026-09-22T12:01:00.000Z",
  cliente: { nome: "João Pereira", telefoneMascarado: "••••••4321" },
  loja: { nome: "Floricultura Jardim", whatsappPublico: "+55 19 98888-7777" },
  itens: [
    {
      nome: "Buquê de girassóis",
      variacao: null,
      quantidade: 1,
      totalCentavos: 3_200,
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
  ],
};

const TOKEN = "k7Qx9Zr2Lm4Vb8Nc1Pd6Wt";

function parametros(token = TOKEN, slug = "floricultura-jardim") {
  return { params: Promise.resolve({ slug, token }) };
}

function api(status: number, corpo: unknown = {}) {
  const buscar = vi.fn(
    async () =>
      new Response(JSON.stringify(corpo), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", buscar);
  return buscar;
}

describe("só os campos permitidos aparecem (AC-11111)", () => {
  it("[CA-11] @spec:AC-11111 mostra os dados do pedido e nenhum dado pessoal além do telefone mascarado", async () => {
    const raiz = montar(
      <AcompanhamentoDoPedido
        apelidoDaLoja="floricultura-jardim"
        tokenDoPedido={TOKEN}
        inicial={PEDIDO}
        atualizar={async () => ({ estado: "indisponivel", motivo: "x" })}
        intervaloMs={60_000}
      />,
    );
    await act(async () => {});
    const texto = raiz.textContent ?? "";
    for (const esperado of [
      "Pedido A-0009",
      "Pedido aceito",
      "Entrega",
      "PIX",
      "João Pereira",
      "••••••4321",
      "Floricultura Jardim",
      "Buquê de girassóis",
    ]) {
      expect(texto).toContain(esperado);
    }
    expect(texto).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/); // CPF
    expect(texto).not.toMatch(/@/); // e-mail
    expect(texto).not.toMatch(/\d{5}-?\d{4}/); // telefone completo
    expect(
      raiz.querySelector("[data-contato-da-loja]")?.getAttribute("rel"),
    ).toBe("noopener noreferrer");
    // Pelo link público não há caminho de volta para a conta.
    expect(raiz.innerHTML).not.toContain("/conta");
  });

  it("[CA-11] @spec:AC-11111 campo além do contrato público é recusado, não desenhado", async () => {
    api(200, {
      pedido: {
        ...PEDIDO,
        cliente: { ...PEDIDO.cliente, cpf: "123.456.789-09", email: "j@x.com" },
      },
    });
    const leitura = await buscarAcompanhamento("floricultura-jardim", TOKEN);
    expect(leitura.estado).toBe("indisponivel");
  });

  it("[CA-11] @spec:AC-11111 a busca nunca vai para cache e a página pede aos buscadores para não indexar", async () => {
    const buscar = api(200, { pedido: PEDIDO });
    await buscarAcompanhamento("floricultura-jardim", TOKEN);
    const init = (
      buscar.mock.calls as unknown as [string, RequestInit][]
    )[0]?.[1];
    expect(init?.cache).toBe("no-store");
    const meta = await generateMetadata(parametros());
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.referrer).toBe("no-referrer");
  });
});

describe("código errado e de outra loja dão a mesma resposta (AC-11112)", () => {
  it.each([
    ["mal formado", "abc", "floricultura-jardim"],
    ["inexistente", TOKEN, "floricultura-jardim"],
    ["de outra loja", TOKEN, "outra-loja"],
  ])(
    "[CA-12] @spec:AC-11112 código %s cai na mesma tela de não encontrado",
    async (_nome, token, slug) => {
      api(404, { erro: "nao_encontrado" });
      await expect(
        PaginaDeAcompanhamento(parametros(token, slug)),
      ).rejects.toThrow("NEXT_NOT_FOUND");
      const html = renderToStaticMarkup(<PedidoNaoEncontrado />);
      expect(html).toContain("Pedido não encontrado");
      expect(html).not.toContain(token);
    },
  );

  it("[CA-12] @spec:AC-11112 o código não aparece no título nem no erro da página", async () => {
    vitrine.buscarVitrine.mockResolvedValueOnce({ estado: "nao-encontrada" });
    const meta = await generateMetadata(parametros());
    expect(JSON.stringify(meta)).not.toContain(TOKEN);

    // Rede caindo com o código dentro da mensagem do erro da própria rede.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error(`falha ao abrir /pedido/${TOKEN}`);
      }),
    );
    const leitura = await buscarAcompanhamento("floricultura-jardim", TOKEN);
    expect(leitura).toEqual({
      estado: "indisponivel",
      motivo: "falha de rede",
    });
    const erro = await PaginaDeAcompanhamento(parametros()).catch(
      (e: Error) => e,
    );
    expect((erro as Error).message).not.toContain(TOKEN);
  });
});
