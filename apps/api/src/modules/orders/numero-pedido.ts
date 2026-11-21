/**
 * Número e código do pedido (AC-514).
 *
 * A numeração é POR LOJA, e isso não é estética. Uma sequência global do
 * PostgreSQL daria à loja recém-aberta um pedido de número 84.317 — revelando
 * quanto a plataforma inteira já vendeu — e deixaria buracos enormes entre um
 * pedido e o próximo da mesma loja. O dono lê o código em voz alta na cozinha:
 * ele precisa ser curto, começar no 1 e não pular.
 *
 * O incremento atômico mora no banco, em `app.proximo_numero_de_pedido`
 * (migração 0008). Fazer `SELECT` do último número e somar 1 na aplicação
 * pareceria equivalente e não é: dois pedidos simultâneos leriam o mesmo valor
 * e receberiam o mesmo número. O índice único (store_id, number) recusaria o
 * segundo, e o cliente veria um erro por ter tido azar de milissegundo.
 */
import { randomBytes } from "node:crypto";

import { codigoDoPedido as formatarCodigoDoPedido } from "@simpleclick/contracts";

/**
 * O código GRAVADO do pedido. A conta mora no contrato (card #135), mas lá ela
 * é formatação de reserva e nunca lança (card #137); aqui, onde o código vai
 * para o banco, número inválido é recusado em vez de gravar `—`.
 */
export function codigoDoPedido(numero: number): string {
  if (!Number.isInteger(numero) || numero < 1) {
    throw new RangeError(
      `número de pedido precisa ser inteiro positivo, recebeu ${numero}`,
    );
  }
  return formatarCodigoDoPedido(numero);
}

/** Bytes do endereço público. 16 bytes são 128 bits (AC-518). */
const BYTES_DO_TOKEN = 16;

/**
 * Endereço público do acompanhamento, impossível de adivinhar.
 *
 * 128 bits em base64 para endereço: não é exagero. O token é a única coisa que
 * protege o pedido de um estranho — nome, telefone e endereço de entrega estão
 * atrás dele. Um contador ou um identificador sequencial deixaria qualquer um
 * ler os pedidos da loja inteira somando 1.
 */
export function tokenPublico(): string {
  return randomBytes(BYTES_DO_TOKEN).toString("base64url");
}
