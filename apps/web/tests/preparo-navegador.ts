/**
 * O que o jsdom não implementa, e o navegador de verdade tem.
 *
 * O jsdom é uma reimplementação parcial do navegador, e `matchMedia` é uma das
 * ausências mais caras: qualquer componente que pergunte sobre preferência do
 * sistema — movimento reduzido, tema escuro, largura de tela — estoura ao ser
 * montado, com uma mensagem que fala de uma função que não existe em vez de
 * falar do componente.
 *
 * Este preparo dá uma implementação MÍNIMA e HONESTA: ela responde "não" a toda
 * consulta, que é o padrão do navegador quando a pessoa não pediu nada. Teste
 * que precisa de outra resposta a substitui, e o faz explicitamente — que é o
 * certo, porque "com movimento reduzido" é um cenário, não o ambiente.
 */

/** Consulta de mídia que nunca casa, com a superfície que o padrão exige. */
function consultaQueNaoCasa(consulta: string): MediaQueryList {
  return {
    matches: false,
    media: consulta,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    // Os dois antigos continuam existindo: biblioteca que ainda os usa não
    // pode estourar por causa de um preparo de teste.
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList;
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = consultaQueNaoCasa;
}

/**
 * `scrollIntoView` é a segunda ausência cara.
 *
 * Todo navegador a tem desde sempre; o jsdom não. Componente que leva a pessoa
 * até um ponto da página — como o formulário do produto faz ao encontrar uma
 * escolha obrigatória pendente (AC-412) — estoura ao chamá-la, e a falha
 * aparece como rejeição não tratada, longe do teste que a causou.
 *
 * A implementação é VAZIA de propósito, e não uma espiã: rolagem não tem efeito
 * observável no jsdom, e um registro global de chamadas convidaria testes a
 * dependerem da ordem em que rodam. Quem precisa provar que a página rolou
 * substitui o método e o devolve no fim — que é o que a prova do AC-412 faz.
 *
 * Guardar o componente com `if (typeof alvo.scrollIntoView === "function")`
 * seria escrever defesa contra uma ausência que só existe no teste, e essa
 * defesa esconderia o dia em que a chamada parasse de acontecer de verdade.
 */
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
