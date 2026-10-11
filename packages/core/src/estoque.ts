/**
 * Quando uma variação "está acabando" (T-307, AC-336). Mora no core porque a
 * lista de produtos do dono, a tela de estoque e a visão do que está acabando
 * perguntam a mesma coisa, e três cópias da conta divergiriam no primeiro
 * ajuste: o dono veria o aviso numa tela e não na outra.
 */

/**
 * O LIMITE É INCLUSIVO. "Avisar com cinco" quer dizer que o quinto item já
 * acende o aviso, e é assim que o critério fala: "chega a cinco ou menos".
 *
 * SEM CONTROLE, SEM AVISO. Estoque nulo é "não controla" (a lanchonete), e
 * mínimo nulo é "não quero aviso". Nenhum dos dois é zero — tratar nulo como
 * zero acenderia o aviso em toda variação de comida.
 */
export function estaAcabando(
  quantidade: number | null,
  minimoParaAviso: number | null,
): boolean {
  if (quantidade === null || minimoParaAviso === null) return false;
  return quantidade <= minimoParaAviso;
}
