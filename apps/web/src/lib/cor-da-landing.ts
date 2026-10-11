/**
 * A cor que a pessoa escolheu na prévia, propagada para a landing inteira (AC-939).
 *
 * A escolha mora na prévia, uma ilha de interação numa página desenhada no
 * servidor, e o fundo da página não é filho dela. A cor vira VALOR DECLARADO no
 * documento, que o CSS de `landing.css` alcança sem script, e a troca sai num
 * AVISO. Levantar a cor para um provedor obrigaria a página inteira a virar
 * cliente, e ela deixaria de chegar pronta do servidor (AC-934).
 */

/** O nome do aviso. Um só, e escrito uma vez. */
const AVISO = "sc:cor-da-landing";

/** O valor declarado que o CSS lê. */
export const VARIAVEL_DA_COR = "--cor-da-landing";

/** Quem escuta recebe a cor nova. */
export type OuvinteDeCor = (cor: string) => void;

/**
 * Anuncia a cor escolhida: escreve o valor declarado no documento, que é o que
 * o fundo da página lê, e dispara o aviso da troca para quem o escutar.
 */
export function anunciarCor(cor: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(VARIAVEL_DA_COR, cor);
  window.dispatchEvent(new CustomEvent(AVISO, { detail: cor }));
}

/**
 * Escuta as trocas de cor, e devolve como parar de escutar. Só a prova a chama:
 * o mundo 3D pinta com as cores das séries (`--cor-serie-*`), e não com esta.
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
