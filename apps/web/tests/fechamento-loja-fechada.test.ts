/**
 * A recusa da loja fechada diz quando ela abre (AC-517).
 *
 * A API responde 409 só com o código do catálogo de erros (`CorpoDeErro` não
 * leva detalhe). Quem sabe a próxima abertura é a vitrine pública, que usa o
 * MESMO cálculo da criação do pedido (`lojaDaVitrine`). Por isso, diante do
 * 409, o site pergunta à vitrine se a loja está fechada e, se estiver, mostra
 * quando ela abre — achado do ponta a ponta da T-908 (dívida 95).
 */
import { describe, expect, it, vi } from "vitest";

import {
  criarPedido,
  type PedidoParaEnviar,
} from "../src/lib/carrinho-do-navegador";

const LOJA = "sabor-e-cia";

const PEDIDO: PedidoParaEnviar = {
  itens: [],
  cliente: { nome: "Ana Paula", telefone: "11988887777" },
  entrega: "PICKUP",
  formaDePagamento: "CASH",
  trocoParaCentavos: null,
  observacao: null,
  chaveDeIdempotencia: "chave-do-teste",
  totalVistoCentavos: 4600,
} as unknown as PedidoParaEnviar;

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** 409 no pedido; a vitrine responde com a abertura dada. */
function apiComAbertura(abertura: unknown) {
  return vi.fn(async (endereco: string | URL | Request) => {
    const url = String(endereco);
    if (url.endsWith("/pedidos")) {
      return json(409, {
        erro: { codigo: "conflito", mensagem: "x", referencia: "r" },
      });
    }
    if (url.endsWith(`/v1/vitrine/${LOJA}`)) {
      return json(200, { abertura });
    }
    return json(404, {});
  });
}

describe("recusa da loja fechada no fechamento (AC-517)", () => {
  it("@spec:AC-517 o 409 com a loja fechada diz o horário em que ela abre", async () => {
    const buscar = apiComAbertura({
      aberta: false,
      proximaAbertura: "abre amanhã às 18h",
      motivo: "FORA_DO_HORARIO",
    });

    const resultado = await criarPedido(LOJA, PEDIDO, buscar);

    expect(resultado).toEqual({
      estado: "nao-pode",
      motivo: "A loja está fechada agora. Ela abre amanhã às 18h.",
    });
  });

  it("@spec:AC-517 loja fechada sem próxima abertura diz que o horário não foi informado", async () => {
    const buscar = apiComAbertura({
      aberta: false,
      proximaAbertura: null,
      motivo: "ENCERRADA",
    });

    const resultado = await criarPedido(LOJA, PEDIDO, buscar);

    expect(resultado).toEqual({
      estado: "nao-pode",
      motivo:
        "A loja está fechada agora e ainda não informou o próximo horário de funcionamento.",
    });
  });

  it("o 409 com a loja aberta (preço, estoque) continua com o texto genérico", async () => {
    const buscar = apiComAbertura({
      aberta: true,
      proximaAbertura: null,
      motivo: "ABERTA",
    });

    const resultado = await criarPedido(LOJA, PEDIDO, buscar);

    expect(resultado).toEqual({
      estado: "nao-pode",
      motivo:
        "Não foi possível fechar o pedido agora. Confira o carrinho e tente de novo.",
    });
  });

  it("a vitrine fora do ar não troca a recusa por falha", async () => {
    const buscar = vi.fn(async (endereco: string | URL | Request) =>
      String(endereco).endsWith("/pedidos")
        ? json(409, {})
        : Promise.reject(new Error("rede caiu")),
    );

    const resultado = await criarPedido(LOJA, PEDIDO, buscar);

    expect(resultado.estado).toBe("nao-pode");
  });
});
