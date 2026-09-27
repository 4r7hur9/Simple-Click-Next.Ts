/**
 * Forma do pedido de cupom na borda da API (P-007).
 *
 * O identificador do pedido é conferido ANTES de chegar ao banco: um texto
 * qualquer no lugar do identificador faria o PostgreSQL recusar a conversão
 * com um erro de sintaxe — que viraria 500 e diria mais do que devia.
 */
import { z } from "zod";

/** Parâmetros de `POST /v1/lojas/:apelido/pedidos/:id/cupom`. */
export const esquemaDoPedidoDeCupom = z.object({
  apelido: z.string().trim().min(1).max(80),
  id: z.uuid(),
});

export type PedidoDeCupom = z.infer<typeof esquemaDoPedidoDeCupom>;
