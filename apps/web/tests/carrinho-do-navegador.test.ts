/**
 * Prova das chamadas do carrinho feitas do navegador (AC-500, AC-501).
 *
 * O `fetch` é falso: o que se prova é o CAMINHO e o cookie — que ver e mudar
 * batem na rota certa com `credentials: "include"` (sem ele o carrinho nasce
 * vazio a cada chamada) — e a tradução da conferência para o que a gaveta
 * desenha, com os valores escritos pelo mesmo `emReais` da API.
 */
import { describe, expect, it } from "vitest";

import { carrinhoDaConferencia } from "../src/features/carrinho/servico-do-carrinho";
import {
  mudarQuantidadeNoCarrinho,
  verCarrinho,
} from "../src/lib/carrinho-do-navegador";

interface Chamada {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

/** Um `fetch` que anota a chamada e responde um carrinho cru válido. */
function buscarQueAnota(chamadas: Chamada[]): typeof fetch {
  return async (entrada, init) => {
    chamadas.push({ url: String(entrada), init });
    return new Response(
      JSON.stringify({
        itens: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            produtoId: "22222222-2222-4222-8222-222222222222",
            variacaoId: null,
            quantidade: 2,
            observacao: null,
            opcoes: [],
          },
        ],
        totalDeItens: 2,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
}

describe("ver o carrinho (AC-500)", () => {
  it("@spec:AC-500 bate na rota do carrinho da loja, levando o cookie", async () => {
    const chamadas: Chamada[] = [];

    const resultado = await verCarrinho(
      "sabor-e-cia",
      buscarQueAnota(chamadas),
    );

    expect(resultado.estado).toBe("visto");
    expect(chamadas[0]?.url).toMatch(/\/v1\/vitrine\/sabor-e-cia\/carrinho$/);
    expect(chamadas[0]?.init?.credentials).toBe("include");
    if (resultado.estado === "visto") {
      expect(resultado.carrinho.totalDeItens).toBe(2);
    }
  });

  it("@spec:AC-500 resposta fora do contrato vira falha, e não carrinho inventado", async () => {
    const buscar: typeof fetch = async () =>
      new Response(JSON.stringify({ qualquer: "coisa" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const resultado = await verCarrinho("sabor-e-cia", buscar);

    expect(resultado.estado).toBe("falhou");
  });
});

describe("mudar a quantidade (AC-501)", () => {
  it("@spec:AC-501 é um PATCH no item, com a quantidade nova no corpo", async () => {
    const chamadas: Chamada[] = [];

    await mudarQuantidadeNoCarrinho(
      "sabor-e-cia",
      "11111111-1111-4111-8111-111111111111",
      3,
      buscarQueAnota(chamadas),
    );

    expect(chamadas[0]?.init?.method).toBe("PATCH");
    expect(chamadas[0]?.url).toMatch(
      /\/carrinho\/itens\/11111111-1111-4111-8111-111111111111$/,
    );
    expect(chamadas[0]?.init?.credentials).toBe("include");
    expect(JSON.parse(String(chamadas[0]?.init?.body))).toEqual({
      quantidade: 3,
    });
  });
});

describe("a conferência vira o carrinho da tela (AC-500)", () => {
  it("@spec:AC-500 nomes e valores vêm da conferência, escritos em reais", () => {
    const carrinho = carrinhoDaConferencia({
      mudancas: [],
      precisaConfirmar: false,
      itens: [
        {
          itemId: "i1",
          produtoId: "p1",
          nome: "Pastel de carne",
          quantidade: 2,
          precoUnitarioCentavos: 900,
          totalDaLinhaCentavos: 1800,
        },
        {
          itemId: "i2",
          produtoId: "p2",
          nome: "Guaraná",
          quantidade: 1,
          precoUnitarioCentavos: 600,
          totalDaLinhaCentavos: 600,
        },
      ],
      subtotalCentavos: 2400,
    });

    expect(carrinho.totalDeItens).toBe(3);
    expect(carrinho.total).toBe("R$ 24,00");
    expect(carrinho.itens[0]).toMatchObject({
      nome: "Pastel de carne",
      precoUnitario: "R$ 9,00",
      totalDaLinha: "R$ 18,00",
    });
  });
});
