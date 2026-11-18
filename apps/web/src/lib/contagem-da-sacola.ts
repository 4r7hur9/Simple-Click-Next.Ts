/**
 * A contagem da sacola, uma chamada por vez (card #105).
 *
 * O ícone da sacola do topo e a sacola flutuante do catálogo perguntam a
 * mesma coisa à API quando o carrinho muda. Cada leitura regrava o cookie do
 * carrinho e abre uma transação, então pedidos iguais em voo dividem a mesma
 * resposta em vez de irem em dobro. Só no NAVEGADOR (a API avisa que a
 * chamada não pode sair do servidor) e sem guardar nada: cada mudança
 * pergunta de novo.
 */
import { contarItensDoCarrinho } from "./carrinho-do-navegador.ts";

const emVoo = new Map<string, Promise<number | null>>();

/** Quantos itens a sacola da loja tem; `null` se a API não respondeu. */
export function contarItensDaSacola(
  apelidoDaLoja: string,
  contar: (apelido: string) => Promise<number | null> = contarItensDoCarrinho,
): Promise<number | null> {
  const andando = emVoo.get(apelidoDaLoja);
  if (andando !== undefined) return andando;
  const pedido = contar(apelidoDaLoja).finally(() => {
    emVoo.delete(apelidoDaLoja);
  });
  emVoo.set(apelidoDaLoja, pedido);
  return pedido;
}
