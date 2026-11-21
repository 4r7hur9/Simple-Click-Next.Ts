/**
 * O código do pedido (AC-514; formato único desde o card #135).
 *
 * É o que o cliente vê na confirmação e em Meus pedidos, o que sai no cupom e
 * na mensagem do WhatsApp e o que o lojista lê no quadro de pedidos: o mesmo
 * pedido tem UM nome em toda tela. A API grava o código com esta função; o
 * site mostra o código gravado (`codigoDoPedidoNaTela`) e só formata o número
 * quando o código falta. Ninguém escreve "nº 4" ou "#4" à mão.
 *
 * A numeração é por loja e começa no 1. A letra avança a cada 9.999 pedidos
 * para o código continuar curto: uma loja movimentada chegaria a "12345" no
 * primeiro ano, e cinco dígitos ditados por telefone viram erro. Com a letra,
 * o código nunca passa de seis caracteres.
 */

/** Quantos pedidos cabem numa letra antes de passar para a próxima. */
const PEDIDOS_POR_LETRA = 9999;

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** O que a tela mostra quando não há código nem número válido. */
export const CODIGO_DO_PEDIDO_INDISPONIVEL = "—";

/**
 * Formata o número sequencial do pedido no código lido em toda tela: `A-0004`.
 *
 * NUNCA LANÇA (card #137): é formatação de reserva, chamada no meio de uma
 * tela. Número zero, negativo, fracionário ou ausente — que os esquemas de
 * resposta admitem — vira `—`, e a tela continua de pé. Quem GRAVA o código
 * (a API) confere o número antes, em `numero-pedido.ts`.
 */
export function codigoDoPedido(numero: number | null | undefined): string {
  if (typeof numero !== "number" || !Number.isInteger(numero) || numero < 1) {
    return CODIGO_DO_PEDIDO_INDISPONIVEL;
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

/** O mínimo que uma tela sabe de um pedido para nomeá-lo. */
export interface PedidoComCodigo {
  readonly codigo?: string | null | undefined;
  readonly numero?: number | null | undefined;
}

/**
 * O código que a tela mostra: o `codigo` GRAVADO, que a API envia, sempre que
 * ele existir (card #137). Recalcular a partir do número divergia do banco:
 * pedido importado ou do seed tem código próprio (`A-1000` com número 1000,
 * por exemplo). Só sem `codigo` a tela formata o número, como reserva.
 */
export function codigoDoPedidoNaTela(pedido: PedidoComCodigo): string {
  const gravado = pedido.codigo?.trim();
  if (gravado !== undefined && gravado.length > 0) return gravado;
  return codigoDoPedido(pedido.numero);
}
