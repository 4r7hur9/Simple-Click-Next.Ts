/**
 * Apoio das provas da operação do pedido (T-600..T-604).
 *
 * Três coisas que todas as provas da operação repetiriam:
 *
 * - criar um pedido pelo MESMO caso de uso do fechamento, com o endereço
 *   público declarado no contexto como a rota o declara (migração 0009);
 * - emitir um token de acesso de verdade, assinado com o segredo do ambiente,
 *   para que a prova passe pela autenticação que a API usa — e não por um
 *   atalho que só existe no teste;
 * - montar a aplicação inteira sobre o banco descartável do arquivo.
 *
 * Segredo só por variável de ambiente (P-002): o segredo de assinatura vem de
 * `JWT_SECRET`, e a ausência dele é recusa que ensina o caminho, nunca teste
 * pulado.
 */
import { randomUUID } from "node:crypto";

import type { LojaDeTeste } from "@simpleclick/testing";

import { comoRequisicao, exigirVariavel } from "./apoio-de-isolamento.ts";
import { criarApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import {
  assinarTokenDeAcesso,
  type PapelDaSessao,
} from "../src/modules/auth/token.ts";
import {
  criarPedido,
  type PedidoCriado,
  type PedidoParaCriar,
} from "../src/modules/orders/criar-pedido.usecase.ts";
import { tokenPublico } from "../src/modules/orders/numero-pedido.ts";

/**
 * A origem autorizada destas provas. Método que muda estado exige origem da
 * lista (AC-126); o navegador manda sozinho, o supertest precisa receber.
 */
export const ORIGEM_DO_PAINEL = "https://painel.exemplo.test";

/** Espera generosa: o primeiro arquivo do dia ainda constrói o molde. */
export const ESPERA_DA_OPERACAO = 120_000;

/** A aplicação inteira, falando com o banco descartável deste arquivo. */
export function aplicacaoDaOperacao(acesso: AcessoAoBanco) {
  return criarApp({
    origens: [ORIGEM_DO_PAINEL],
    vitrine: { acesso },
    carrinho: { acesso },
    pedidos: { acesso },
    fila: { acesso },
    conta: { acesso },
  });
}

/**
 * Um token de acesso de verdade para a identidade e o papel pedidos.
 *
 * Assinado com o mesmo segredo que a API confere — a prova atravessa a
 * autenticação real, inclusive a recusa de papel errado.
 */
export function tokenDeAcesso(
  identidadeId: string,
  papel: PapelDaSessao,
): string {
  return assinarTokenDeAcesso(
    {
      identidadeId,
      papel,
      sessaoId: randomUUID(),
      familiaId: randomUUID(),
    },
    exigirVariavel("JWT_SECRET"),
  );
}

/** Cabeçalho de autorização pronto para o supertest. */
export function comoPortador(token: string): string {
  return `Bearer ${token}`;
}

/**
 * Cria um pedido pelo caso de uso do fechamento, como um cliente da loja.
 *
 * Os valores são inteiros em centavos (P-005) e a conta fecha: dois itens de
 * R$ 20,00, mais R$ 8,00 de taxa quando é entrega.
 */
export async function fazerPedido(
  acesso: AcessoAoBanco,
  loja: LojaDeTeste,
  sobrescrita: Partial<Omit<PedidoParaCriar, "lojaId">> = {},
): Promise<PedidoCriado> {
  const entrega = sobrescrita.entrega ?? "DELIVERY";
  const taxa = entrega === "DELIVERY" ? 800 : 0;
  const entrada: PedidoParaCriar = {
    lojaId: loja.id,
    contato: {
      nome: "Maria Conceição",
      telefoneE164: "5511988887777",
      logradouro: "Rua das Flores",
      numero: "123",
      bairro: "Centro",
      cidade: "São Paulo",
      estado: "SP",
      cep: "01001000",
    },
    itens: [
      {
        nomeDoProduto: "Açaí com granola",
        quantidade: 2,
        precoUnitarioEmCentavos: 2000,
        totalDaLinhaEmCentavos: 4000,
        opcoes: [{ nomeDoGrupo: "Cobertura", nomeDaOpcao: "Leite em pó" }],
      },
    ],
    entrega,
    formaDePagamento: "PIX",
    subtotalEmCentavos: 4000,
    taxaDeEntregaEmCentavos: taxa,
    totalEmCentavos: 4000 + taxa,
    ...sobrescrita,
  };

  const resultado = await comoRequisicao(
    acesso,
    { lojaId: loja.id, papel: "CUSTOMER", tokenDoPedido: tokenPublico() },
    () => criarPedido(entrada, { aberta: true }),
  );
  if (!resultado.ok) {
    throw new Error(
      `o pedido de apoio não foi criado: ${resultado.recusa.causa}`,
    );
  }
  return resultado.pedido;
}
