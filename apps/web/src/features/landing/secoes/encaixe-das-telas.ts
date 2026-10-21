/**
 * O encaixe das seções depois da narrativa, sem DOM: só as contas. O
 * telas-em-encaixe.ts liga isto à roda do mouse, ao toque e ao teclado, com o
 * mesmo detector de gesto das cenas (navegacao-por-cenas.ts).
 *
 * O MODELO: cada "tela" (uma seção do tamanho da janela, ou uma parte dela) tem
 * a posição da página em que ela encosta no topo (`topo`) e a sua altura. A
 * área útil (`janela`) é a altura da janela menos o topo grudado. Uma tela que
 * cabe na janela tem um ponto só de parada; uma mais alta rola por dentro, do
 * `topo` até o seu `fim` (o pé dela encostado no pé da janela).
 *
 * O GESTO: dentro da tela alta, a rolagem é a do navegador (nunca prende);
 * na borda, um gesto leva à tela seguinte ou à anterior, inteira. Antes da
 * primeira tela (a narrativa) e depois do pé da última (o rodapé), o gesto não
 * é com o encaixe.
 */

export interface TelaMedida {
  /** Posição da página (scrollY) com o alto da tela encostado embaixo do topo. */
  readonly topo: number;
  readonly altura: number;
}

export interface MedidasDasTelas {
  readonly telas: readonly TelaMedida[];
  /** Altura útil da janela (sem o topo grudado). */
  readonly janela: number;
}

/** Folga, em px, para arredondamentos de rolagem (zoom, telas 1,5x). */
export const FOLGA = 2;

/** Onde a tela termina de rolar por dentro: o pé dela no pé da janela. */
export function fimDaTela(medidas: MedidasDasTelas, indice: number): number {
  const tela = medidas.telas[indice];
  if (!tela) return 0;
  return tela.topo + Math.max(0, Math.round(tela.altura - medidas.janela));
}

/** Se a tela cabe inteira na janela (um ponto só de parada). */
export function cabeNaJanela(medidas: MedidasDasTelas, indice: number): boolean {
  const tela = medidas.telas[indice];
  return tela !== undefined && tela.altura <= medidas.janela + FOLGA;
}

/**
 * A tela em que a página está: a última cujo alto já passou do topo. `null`
 * antes da primeira (ainda na narrativa).
 */
export function telaDaPosicao(medidas: MedidasDasTelas, y: number): number | null {
  const { telas } = medidas;
  if (telas.length === 0 || y < telas[0]!.topo - FOLGA) return null;
  let indice = 0;
  for (let i = 1; i < telas.length; i += 1) {
    if (telas[i]!.topo <= y + FOLGA) indice = i;
    else break;
  }
  return indice;
}

export type Passo =
  /** Não é com o encaixe: antes das telas, no rodapé, ou subindo da primeira. */
  | { readonly tipo: "fora" }
  /**
   * Rolagem do navegador, dentro de uma tela alta. `limite` é a borda que o
   * gesto não pode passar (o encaixe segura ali e o próximo gesto troca de tela).
   */
  | { readonly tipo: "livre"; readonly limite: number }
  /** A página desliza até `y` (o alto da tela seguinte ou o pé da anterior). */
  | { readonly tipo: "ir"; readonly y: number; readonly indice: number };

/** Para onde um gesto leva, a partir da posição `y`. */
export function passoDoGesto(medidas: MedidasDasTelas, y: number, direcao: -1 | 1): Passo {
  const indice = telaDaPosicao(medidas, y);
  if (indice === null) return { tipo: "fora" };
  const ultima = medidas.telas.length - 1;
  const topo = medidas.telas[indice]!.topo;
  const fim = fimDaTela(medidas, indice);

  if (direcao === 1) {
    if (y < fim - FOLGA) return { tipo: "livre", limite: fim };
    // No pé da última, o rodapé rola como sempre.
    if (indice === ultima) return { tipo: "fora" };
    return { tipo: "ir", y: medidas.telas[indice + 1]!.topo, indice: indice + 1 };
  }

  // Subindo do rodapé: rola até o pé da última e para ali.
  if (indice === ultima && y > fim + FOLGA) return { tipo: "livre", limite: fim };
  // Entre duas telas (meio de uma, meio da outra): encaixa a de cima.
  if (y > fim + FOLGA) return { tipo: "ir", y: fim, indice };
  if (y > topo + FOLGA) return { tipo: "livre", limite: topo };
  // Subindo da primeira, quem cuida é a narrativa.
  if (indice === 0) return { tipo: "fora" };
  return { tipo: "ir", y: fimDaTela(medidas, indice - 1), indice: indice - 1 };
}

/**
 * Depois de uma rolagem livre (toque com inércia, barra de rolagem): se a
 * página parou entre duas telas, a mais próxima encaixa. `null` = está bem.
 */
export function ajusteDaPosicao(medidas: MedidasDasTelas, y: number): number | null {
  const indice = telaDaPosicao(medidas, y);
  if (indice === null || indice === medidas.telas.length - 1) return null;
  const fim = fimDaTela(medidas, indice);
  if (y <= fim + FOLGA) return null;
  const seguinte = medidas.telas[indice + 1]!.topo;
  if (y >= seguinte - FOLGA) return null;
  return y - fim <= seguinte - y ? fim : seguinte;
}

/** Até onde uma rolagem livre de `distancia` px pode ir sem passar do limite. */
export function rolagemLimitada(y: number, distancia: number, limite: number): number {
  return distancia > 0 ? Math.min(y + distancia, limite) : Math.max(y + distancia, limite);
}

/** A curva das cenas (power3.inOut do GSAP), para o deslize ser o mesmo. */
export function curvaDoDeslize(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}
