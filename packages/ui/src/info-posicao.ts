/**
 * Onde o balão do {@link Info} fica na tela.
 *
 * Função pura, sem DOM, para ser provada por teste: recebe o retângulo do
 * botão "i", o tamanho medido do balão e o tamanho da tela, e devolve a posição
 * em coordenadas da viewport (`position: fixed`).
 *
 * As regras:
 *
 * - **Acima primeiro.** O "i" mora na linha do rótulo e o controle vem logo
 *   embaixo: abrindo para cima, o balão não cobre o campo que a pessoa está
 *   preenchendo. Só abre para baixo quando em cima não cabe (flip).
 * - **Nunca fora da tela.** O balão centraliza no ícone e escorrega para o lado
 *   (shift) até caber, respeitando a margem; a seta continua apontando o ícone.
 * - **Largura limitada.** No máximo {@link LARGURA_MAXIMA_DO_BALAO}px e, no
 *   celular, a largura da tela menos 2rem.
 * - Se nem em cima nem embaixo cabe, fica do lado com mais espaço, com altura
 *   máxima e rolagem própria.
 */

export type Retangulo = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type LadoDoBalao = "cima" | "baixo";

export type EntradaDaPosicao = {
  /** `getBoundingClientRect()` do botão "i". */
  ancora: Retangulo;
  /** Tamanho medido do balão (largura já limitada pelo CSS). */
  balao: { largura: number; altura: number };
  tela: { largura: number; altura: number };
  /** Distância mínima até a borda da tela. Padrão: 16px (1rem). */
  margem?: number;
  /** Espaço entre o ícone e o balão (onde a seta mora). Padrão: 10px. */
  vao?: number;
};

export type PosicaoDoBalao = {
  top: number;
  left: number;
  largura: number;
  /** Altura máxima: só fica menor que a do balão quando não cabe inteiro. */
  alturaMaxima: number;
  lado: LadoDoBalao;
  /** Centro da seta, medido da borda esquerda do balão. */
  setaX: number;
};

export const LARGURA_MAXIMA_DO_BALAO = 320;
const MARGEM_PADRAO = 16;
const VAO_PADRAO = 10;
/** A seta não encosta no canto arredondado do balão. */
const FOLGA_DA_SETA = 14;

/** Largura do balão para uma tela: 320px, ou a tela menos as duas margens. */
export function larguraMaximaDoBalao(
  larguraDaTela: number,
  margem = MARGEM_PADRAO,
): number {
  return Math.max(
    0,
    Math.min(LARGURA_MAXIMA_DO_BALAO, larguraDaTela - margem * 2),
  );
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), Math.max(minimo, maximo));
}

/** Posição do balão: acima do "i", ou abaixo se em cima não cabe. */
export function calcularPosicaoDoBalao({
  ancora,
  balao,
  tela,
  margem = MARGEM_PADRAO,
  vao = VAO_PADRAO,
}: EntradaDaPosicao): PosicaoDoBalao {
  const largura = Math.min(balao.largura, larguraMaximaDoBalao(tela.largura, margem));
  const centro = ancora.left + ancora.width / 2;

  // Shift: centraliza no ícone e escorrega até caber entre as margens.
  const left = limitar(
    centro - largura / 2,
    margem,
    tela.largura - largura - margem,
  );
  const setaX = limitar(
    centro - left,
    FOLGA_DA_SETA,
    largura - FOLGA_DA_SETA,
  );

  // Flip: acima se couber; senão abaixo; senão onde houver mais espaço.
  const espacoEmCima = ancora.top - vao - margem;
  const espacoEmbaixo = tela.altura - (ancora.top + ancora.height) - vao - margem;
  let lado: LadoDoBalao;
  if (balao.altura <= espacoEmCima) lado = "cima";
  else if (balao.altura <= espacoEmbaixo) lado = "baixo";
  else lado = espacoEmCima >= espacoEmbaixo ? "cima" : "baixo";

  const espaco = Math.max(0, lado === "cima" ? espacoEmCima : espacoEmbaixo);
  const altura = Math.min(balao.altura, espaco);
  const top =
    lado === "cima"
      ? ancora.top - vao - altura
      : ancora.top + ancora.height + vao;

  return { top, left, largura, alturaMaxima: altura, lado, setaX };
}
