/**
 * Quando uma variação "está acabando" (T-307, AC-336).
 *
 * MORA NO CORE porque três lugares perguntam a mesma coisa — a lista de
 * produtos do dono, a tela de estoque e a visão do que está acabando — e três
 * cópias da conta divergiriam no dia em que alguém trocasse `<=` por `<` em
 * uma delas: o dono veria o aviso numa tela e não na outra.
 *
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
