/**
 * Geometria do editor de Stories (card #84).
 *
 * Tudo no editor vive num PALCO de 1080 x 1920 unidades (o tamanho do arquivo
 * final). A tela só mostra o palco menor; os dedos e o mouse são convertidos
 * para essas unidades antes de qualquer conta. Assim o que se vê é o que sai
 * no arquivo, em qualquer tamanho de tela.
 *
 * Aqui só há conta, sem tela: arrastar, pinçar (escalar e girar com dois
 * dedos), girar e escalar pela alça (mouse), roda do mouse, enquadramento da
 * foto e a zona da lixeira.
 */

export const LARGURA_DO_PALCO = 1080;
export const ALTURA_DO_PALCO = 1920;
/** A faixa de baixo do palco onde soltar um objeto o joga fora. */
export const ALTURA_DA_LIXEIRA = 260;

export interface Ponto {
  readonly x: number;
  readonly y: number;
}

/** Posição do CENTRO do objeto no palco, escala (1 = tamanho natural) e giro em radianos. */
export interface Transformacao {
  readonly x: number;
  readonly y: number;
  readonly escala: number;
  readonly rotacao: number;
}

export interface LimitesDeEscala {
  readonly minima: number;
  readonly maxima: number;
}

export const LIMITES_DOS_OBJETOS: LimitesDeEscala = { minima: 0.2, maxima: 8 };
export const LIMITES_DO_FUNDO: LimitesDeEscala = { minima: 0.3, maxima: 10 };

export const TRANSFORMACAO_CENTRAL: Transformacao = {
  x: LARGURA_DO_PALCO / 2,
  y: ALTURA_DO_PALCO / 2,
  escala: 1,
  rotacao: 0,
};

export function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

export function girar(ponto: Ponto, angulo: number): Ponto {
  const seno = Math.sin(angulo);
  const cosseno = Math.cos(angulo);
  return {
    x: ponto.x * cosseno - ponto.y * seno,
    y: ponto.x * seno + ponto.y * cosseno,
  };
}

export function distancia(a: Ponto, b: Ponto): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function angulo(a: Ponto, b: Ponto): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function pontoMedio(a: Ponto, b: Ponto): Ponto {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Converte um ponto da tela (px) para o palco, dado o retângulo do palco na tela. */
export function paraOPalco(
  cliente: Ponto,
  retangulo: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  },
): Ponto {
  const largura = retangulo.width > 0 ? retangulo.width : LARGURA_DO_PALCO;
  const altura = retangulo.height > 0 ? retangulo.height : ALTURA_DO_PALCO;
  return {
    x: ((cliente.x - retangulo.left) / largura) * LARGURA_DO_PALCO,
    y: ((cliente.y - retangulo.top) / altura) * ALTURA_DO_PALCO,
  };
}

/** Soltar aqui (rodapé do palco) joga o objeto na lixeira. */
export function sobreALixeira(ponto: Ponto): boolean {
  return ponto.y >= ALTURA_DO_PALCO - ALTURA_DA_LIXEIRA;
}

// ---------------------------------------------------------------------------
// Gestos: um dedo arrasta; dois dedos arrastam, escalam e giram.
// ---------------------------------------------------------------------------

/** O começo de um gesto: a transformação de partida e onde estavam os dedos. */
export interface Gesto {
  readonly base: Transformacao;
  readonly pontos: readonly Ponto[];
  /**
   * Com dois dedos: o ponto do objeto que estava sob o meio dos dedos, nas
   * medidas do próprio objeto. Ele continua sob o meio dos dedos durante o gesto.
   */
  readonly ancora: Ponto;
}

/** Os dois primeiros pontos valem; o resto é ignorado. */
function primeiros(pontos: readonly Ponto[]): readonly Ponto[] {
  return pontos.slice(0, 2);
}

/** Começa (ou recomeça, quando o número de dedos muda) um gesto a partir do estado de agora. */
export function iniciarGesto(
  base: Transformacao,
  pontos: readonly Ponto[],
): Gesto {
  const usados = primeiros(pontos);
  const [a, b] = usados;
  let ancora: Ponto = { x: 0, y: 0 };
  if (a !== undefined && b !== undefined) {
    const meio = pontoMedio(a, b);
    const relativo = girar(
      { x: meio.x - base.x, y: meio.y - base.y },
      -base.rotacao,
    );
    ancora = { x: relativo.x / base.escala, y: relativo.y / base.escala };
  }
  return { base, pontos: usados, ancora };
}

/** A transformação resultante com os dedos onde estão agora. */
export function avancarGesto(
  gesto: Gesto,
  pontos: readonly Ponto[],
  limites: LimitesDeEscala = LIMITES_DOS_OBJETOS,
): Transformacao {
  const usados = primeiros(pontos);
  if (usados.length !== gesto.pontos.length) return gesto.base;
  const [inicio1, inicio2] = gesto.pontos;
  const [agora1, agora2] = usados;
  if (inicio1 === undefined || agora1 === undefined) return gesto.base;

  if (inicio2 === undefined || agora2 === undefined) {
    return {
      ...gesto.base,
      x: gesto.base.x + (agora1.x - inicio1.x),
      y: gesto.base.y + (agora1.y - inicio1.y),
    };
  }

  // Dedos quase no mesmo ponto não dão razão confiável: usa 1 como piso.
  const distanciaInicial = Math.max(1, distancia(inicio1, inicio2));
  const distanciaAgora = Math.max(1, distancia(agora1, agora2));
  const escala = limitar(
    (gesto.base.escala * distanciaAgora) / distanciaInicial,
    limites.minima,
    limites.maxima,
  );
  const rotacao =
    gesto.base.rotacao + (angulo(agora1, agora2) - angulo(inicio1, inicio2));
  const meio = pontoMedio(agora1, agora2);
  const deslocamento = girar(
    { x: gesto.ancora.x * escala, y: gesto.ancora.y * escala },
    rotacao,
  );
  return { x: meio.x - deslocamento.x, y: meio.y - deslocamento.y, escala, rotacao };
}

// ---------------------------------------------------------------------------
// Alça (mouse): arrastar a alça do canto escala e gira em volta do centro.
// ---------------------------------------------------------------------------

export interface GestoDaAlca {
  readonly base: Transformacao;
  readonly distanciaInicial: number;
  readonly anguloInicial: number;
}

export function iniciarGestoDaAlca(
  base: Transformacao,
  alca: Ponto,
): GestoDaAlca {
  const centro = { x: base.x, y: base.y };
  return {
    base,
    distanciaInicial: Math.max(1, distancia(centro, alca)),
    anguloInicial: angulo(centro, alca),
  };
}

export function avancarGestoDaAlca(
  gesto: GestoDaAlca,
  alca: Ponto,
  limites: LimitesDeEscala = LIMITES_DOS_OBJETOS,
): Transformacao {
  const centro = { x: gesto.base.x, y: gesto.base.y };
  return {
    ...gesto.base,
    escala: limitar(
      (gesto.base.escala * Math.max(1, distancia(centro, alca))) /
        gesto.distanciaInicial,
      limites.minima,
      limites.maxima,
    ),
    rotacao:
      gesto.base.rotacao + (angulo(centro, alca) - gesto.anguloInicial),
  };
}

// ---------------------------------------------------------------------------
// Roda do mouse
// ---------------------------------------------------------------------------

/** Roda para cima aumenta; para baixo diminui. */
export function escalarComARoda(
  base: Transformacao,
  deltaY: number,
  limites: LimitesDeEscala = LIMITES_DOS_OBJETOS,
): Transformacao {
  const fator = Math.exp(-deltaY * 0.0015);
  return {
    ...base,
    escala: limitar(base.escala * fator, limites.minima, limites.maxima),
  };
}

/** Shift + roda gira (cada 100 de roda = 15 graus). */
export function girarComARoda(base: Transformacao, deltaY: number): Transformacao {
  return { ...base, rotacao: base.rotacao + (deltaY / 100) * (Math.PI / 12) };
}

// ---------------------------------------------------------------------------
// Enquadramento da foto/vídeo no palco
// ---------------------------------------------------------------------------

export type ModoDeEnquadramento = "preencher" | "ajustar";

/**
 * A escala que faz a mídia ocupar o palco: `preencher` cobre tudo (corta o que
 * sobra); `ajustar` mostra a mídia inteira (sobram faixas).
 */
export function escalaBaseDaMidia(
  largura: number,
  altura: number,
  modo: ModoDeEnquadramento,
): number {
  if (largura <= 0 || altura <= 0) return 1;
  const pelaLargura = LARGURA_DO_PALCO / largura;
  const pelaAltura = ALTURA_DO_PALCO / altura;
  return modo === "preencher"
    ? Math.max(pelaLargura, pelaAltura)
    : Math.min(pelaLargura, pelaAltura);
}

/** Segura o centro da mídia dentro do palco, para ela nunca "fugir" da tela. */
export function manterNoPalco(t: Transformacao): Transformacao {
  return {
    ...t,
    x: limitar(t.x, 0, LARGURA_DO_PALCO),
    y: limitar(t.y, 0, ALTURA_DO_PALCO),
  };
}

/** Arredonda para 2 casas, para os números do estado não crescerem à toa. */
export function arredondar(valor: number, casas = 2): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}
