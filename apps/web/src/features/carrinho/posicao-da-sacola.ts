/**
 * A posição da sacola flutuante: onde ela pode ficar e como é lembrada.
 *
 * GUARDADA EM FRAÇÃO, E NÃO EM PIXEL. "Encostada à direita, a dois terços da
 * altura" continua valendo quando o celular gira ou a janela encolhe; "x = 912"
 * jogaria a sacola para fora da tela no primeiro giro. A fração é de quanto a
 * sacola andou dentro da ÁREA LIVRE — a tela menos as margens e a área segura
 * do aparelho —, então 0 e 1 são sempre os cantos visíveis.
 *
 * UMA POSIÇÃO PARA TODAS AS LOJAS. Quem arrastou a sacola para a esquerda
 * porque é canhoto continua canhoto na loja seguinte.
 *
 * Funções puras, sem DOM: quem mede a tela é o componente.
 */

/** A chave no `localStorage`. */
export const CHAVE_DA_POSICAO = "simpleclick:sacola:posicao";

/** Um retângulo na tela, em pixels. */
export interface Area {
  readonly esquerda: number;
  readonly topo: number;
  readonly largura: number;
  readonly altura: number;
}

/** Um ponto na tela: o canto superior esquerdo da sacola. */
export interface Ponto {
  readonly x: number;
  readonly y: number;
}

/** Onde a sacola está, em fração da área livre (0 a 1 em cada eixo). */
export interface Fracao {
  readonly fx: number;
  readonly fy: number;
}

/** Sem posição guardada, a sacola nasce no canto de baixo, à direita. */
export const POSICAO_INICIAL: Fracao = { fx: 1, fy: 1 };

function entre(valor: number, minimo: number, maximo: number): number {
  if (maximo < minimo) return minimo;
  return Math.min(Math.max(valor, minimo), maximo);
}

/** Prende o ponto dentro da área, contando o tamanho da sacola. */
export function limitar(
  ponto: Ponto,
  tamanho: { readonly largura: number; readonly altura: number },
  area: Area,
): Ponto {
  return {
    x: entre(
      ponto.x,
      area.esquerda,
      area.esquerda + area.largura - tamanho.largura,
    ),
    y: entre(ponto.y, area.topo, area.topo + area.altura - tamanho.altura),
  };
}

/** O ponto, em fração da área livre. */
export function paraFracao(
  ponto: Ponto,
  tamanho: { readonly largura: number; readonly altura: number },
  area: Area,
): Fracao {
  const livreX = area.largura - tamanho.largura;
  const livreY = area.altura - tamanho.altura;
  return {
    fx: livreX <= 0 ? 0 : entre((ponto.x - area.esquerda) / livreX, 0, 1),
    fy: livreY <= 0 ? 0 : entre((ponto.y - area.topo) / livreY, 0, 1),
  };
}

/** A fração, de volta em ponto — já dentro da área. */
export function deFracao(
  fracao: Fracao,
  tamanho: { readonly largura: number; readonly altura: number },
  area: Area,
): Ponto {
  return limitar(
    {
      x: area.esquerda + fracao.fx * (area.largura - tamanho.largura),
      y: area.topo + fracao.fy * (area.altura - tamanho.altura),
    },
    tamanho,
    area,
  );
}

/**
 * Encosta a sacola na borda lateral mais próxima, mantendo a altura.
 *
 * O ARRASTE É LIVRE, O POUSO NÃO. Solta no meio da tela, a sacola cobriria
 * justamente o produto que a pessoa está lendo; encostada na borda esquerda ou
 * direita, ela fica à mão do polegar e fora do caminho. A altura continua onde
 * a pessoa deixou.
 */
export function encostarNaBorda(
  ponto: Ponto,
  tamanho: { readonly largura: number; readonly altura: number },
  area: Area,
): Ponto {
  const preso = limitar(ponto, tamanho, area);
  const esquerda = area.esquerda;
  const direita = area.esquerda + area.largura - tamanho.largura;
  const centro = preso.x + tamanho.largura / 2;
  const meio = area.esquerda + area.largura / 2;
  return { x: centro < meio ? esquerda : direita, y: preso.y };
}

/** Lê a posição guardada. Qualquer coisa estranha vale a inicial. */
export function lerPosicaoGuardada(guardado: string | null): Fracao {
  if (guardado === null) return POSICAO_INICIAL;
  try {
    const lido: unknown = JSON.parse(guardado);
    if (
      typeof lido === "object" &&
      lido !== null &&
      "fx" in lido &&
      "fy" in lido &&
      typeof lido.fx === "number" &&
      typeof lido.fy === "number" &&
      Number.isFinite(lido.fx) &&
      Number.isFinite(lido.fy)
    ) {
      return { fx: entre(lido.fx, 0, 1), fy: entre(lido.fy, 0, 1) };
    }
  } catch {
    // JSON quebrado: alguém mexeu na mão. A sacola volta ao canto.
  }
  return POSICAO_INICIAL;
}

/** Quanto a seta do teclado anda, em pixels; com Shift, o passo é maior. */
export const PASSO_DO_TECLADO = 16;
export const PASSO_LONGO_DO_TECLADO = 64;

/** O deslocamento de cada seta. Outras teclas não movem. */
export function passoDaTecla(tecla: string, longo: boolean): Ponto | null {
  const passo = longo ? PASSO_LONGO_DO_TECLADO : PASSO_DO_TECLADO;
  switch (tecla) {
    case "ArrowLeft":
      return { x: -passo, y: 0 };
    case "ArrowRight":
      return { x: passo, y: 0 };
    case "ArrowUp":
      return { x: 0, y: -passo };
    case "ArrowDown":
      return { x: 0, y: passo };
    default:
      return null;
  }
}

/**
 * Quantos pixels o dedo precisa andar para contar como arraste. Abaixo disso é
 * toque — o dedo sempre treme um pouco, e um toque que vira arraste não abre
 * o carrinho.
 */
export const DISTANCIA_DO_ARRASTE = 6;
