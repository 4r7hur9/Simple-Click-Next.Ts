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

/** Quantos pedidos cabem numa letra antes de passar para a próxima. */
const PEDIDOS_POR_LETRA = 9999;

/** Bytes do endereço público. 16 bytes são 128 bits (AC-518). */
const BYTES_DO_TOKEN = 16;

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Converte o número sequencial no código que o cliente e a cozinha leem.
 *
 * A letra avança a cada 9.999 pedidos para o código continuar curto: uma loja
 * movimentada chegaria a "12345" no primeiro ano, e cinco dígitos ditados por
 * telefone viram erro. Com a letra, o código nunca passa de seis caracteres.
 */
export function codigoDoPedido(numero: number): string {
  if (!Number.isInteger(numero) || numero < 1) {
    throw new RangeError(
      `número de pedido precisa ser inteiro positivo, recebeu ${numero}`,
    );
  }

  const indiceDaLetra = Math.floor((numero - 1) / PEDIDOS_POR_LETRA);
  const dentroDaLetra = ((numero - 1) % PEDIDOS_POR_LETRA) + 1;

  if (indiceDaLetra >= LETRAS.length) {
    // 259.974 pedidos numa loja é motivo de festa, não de erro. Passando disso,
    // o código deixa de ter letra e vira o número puro — continua único porque
    // o índice é (store_id, number), e continua legível.
    return String(numero);
  }

  return `${LETRAS[indiceDaLetra]}-${String(dentroDaLetra).padStart(4, "0")}`;
}

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
