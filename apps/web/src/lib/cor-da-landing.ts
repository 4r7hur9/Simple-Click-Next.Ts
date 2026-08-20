/**
 * A cor que a pessoa escolheu, propagada para a landing inteira (AC-939).
 *
 * O PROBLEMA. A escolha de cor mora na prévia, que é uma ilha de interação
 * dentro de uma página desenhada no servidor. O fundo da página e o mundo em
 * três dimensões precisam da mesma cor — e nenhum dos dois é filho da prévia.
 *
 * A saída é um AVISO, e não estado compartilhado. Levantar a cor para um
 * provedor obrigaria a página inteira a virar cliente, e ela deixaria de chegar
 * pronta do servidor — que é o que o AC-934 exige. Com um aviso, cada parte
 * escuta se quiser, e a página continua desenhada antes de qualquer script.
 *
 * A cor também é escrita como valor declarado no documento, para o CSS a
 * alcançar sem passar por script nenhum.
 */

/** O nome do aviso. Um só, e escrito uma vez. */
const AVISO = "sc:cor-da-landing";

/** O valor declarado que o CSS lê. */
export const VARIAVEL_DA_COR = "--cor-da-landing";

/** Quem escuta recebe a cor nova. */
export type OuvinteDeCor = (cor: string) => void;

/**
 * Anuncia a cor escolhida.
 *
 * Escreve no documento E avisa. As duas coisas: o CSS lê o valor declarado sem
 * script, e o mundo em três dimensões precisa saber o momento da troca para
 * repintar o material — ele não observa folha de estilo.
 */
export function anunciarCor(cor: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(VARIAVEL_DA_COR, cor);
  window.dispatchEvent(new CustomEvent(AVISO, { detail: cor }));
}

/**
 * Escuta as trocas de cor, e devolve como parar de escutar.
 *
 * Devolver a forma de parar não é zelo: sem ela, um mundo desmontado continuaria
 * escutando e tentaria pintar um material já descartado.
 */
export function ouvirCor(ouvinte: OuvinteDeCor): () => void {
  if (typeof window === "undefined") return () => {};

  const receber = (evento: Event): void => {
    const cor = (evento as CustomEvent<string>).detail;
    if (typeof cor === "string" && cor !== "") ouvinte(cor);
  };

  window.addEventListener(AVISO, receber);
  return () => window.removeEventListener(AVISO, receber);
}
