/**
 * O código do pedido (AC-514; formato único desde o card #135).
 *
 * É o que o cliente vê na confirmação e em Meus pedidos, o que sai no cupom e
 * na mensagem do WhatsApp e o que o lojista lê no quadro de pedidos: o mesmo
 * pedido tem UM nome em toda tela. A API grava o código com esta função e o
 * site formata o número com ela; ninguém escreve "nº 4" ou "#4" à mão.
 *
 * A numeração é por loja e começa no 1. A letra avança a cada 9.999 pedidos
 * para o código continuar curto: uma loja movimentada chegaria a "12345" no
 * primeiro ano, e cinco dígitos ditados por telefone viram erro. Com a letra,
 * o código nunca passa de seis caracteres.
 */

/** Quantos pedidos cabem numa letra antes de passar para a próxima. */
const PEDIDOS_POR_LETRA = 9999;

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Converte o número sequencial do pedido no código lido em toda tela: `A-0004`. */
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
