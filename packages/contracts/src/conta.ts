/**
 * Contrato da conta do cliente (AC-616): os pedidos do cliente logado, em todas
 * as lojas, e o detalhe de um pedido na mesma forma do link público.
 */

import { z } from "zod";

import { esquemaDoAcompanhamento } from "./acompanhamento.ts";

/** A loja onde o pedido foi feito, como a conta do cliente a vê (AC-616). */
export const esquemaDaLojaDoMeuPedido = z.strictObject({
  nome: z.string(),
  apelido: z.string(),
});

/** Um pedido na lista da conta: o resumo, com o status de agora. */
export const esquemaDoPedidoDaConta = z.strictObject({
  id: z.uuid(),
  loja: esquemaDaLojaDoMeuPedido,
  numero: z.number().int().nonnegative(),
  codigo: z.string(),
  status: z.string(),
  entrega: z.string(),
  totalCentavos: z.number().int().nonnegative(),
  quantidadeDeItens: z.number().int().nonnegative(),
  criadoEm: z.string(),
  atualizadoEm: z.string(),
});

/** `GET /v1/conta/pedidos` — todos os pedidos do cliente logado, em todas as lojas. */
export const esquemaDosMeusPedidos = z.strictObject({
  pedidos: z.array(esquemaDoPedidoDaConta),
});

/**
 * `GET /v1/conta/pedidos/:id` — o detalhe de um pedido do cliente logado.
 *
 * O pedido em si é o MESMO contrato do link público (AC-612..AC-615): quem
 * lê pela conta vê exatamente o que veria pelo link, nem mais nem menos. O
 * endereço público vem junto para a página continuar acompanhando o status
 * pelo caminho que já existe.
 */
export const esquemaDoMeuPedido = z.strictObject({
  id: z.uuid(),
  loja: esquemaDaLojaDoMeuPedido,
  tokenPublico: z.string(),
  pedido: esquemaDoAcompanhamento.shape.pedido,
});

export type PedidoDaContaNoContrato = z.infer<typeof esquemaDoPedidoDaConta>;
export type MeuPedidoNoContrato = z.infer<typeof esquemaDoMeuPedido>;
