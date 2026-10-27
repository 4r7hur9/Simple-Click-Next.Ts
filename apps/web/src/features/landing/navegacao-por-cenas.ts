/**
 * A navegação por cenas da landing, sem DOM: só as contas. A narrativa
 * (NarrativaDaLanding) liga isto à roda do mouse, ao toque e ao teclado.
 *
 * O modelo: a narrativa ocupa `total` alturas de palco no documento. A cena k
 * fica na posição `inicio + k * passo`; a seção seguinte começa em
 * `inicio + total * passo` (o "fim"). Entre a última cena e o fim fica a
 * SAÍDA: o palco já se move com a página. Depois do fim, a rolagem é livre.
 *
 * O GESTO: um trackpad do Mac manda dezenas de eventos de roda por gesto e
 * continua mandando por até dois segundos depois que o dedo sai (a inércia).
 * Uma rolada tem de valer UMA cena: o detector soma os eventos até passar do
 * limiar, dispara uma vez e ignora o resto do mesmo gesto. Um gesto novo é
 * reconhecido por pausa, por troca de sentido ou por uma aceleração clara
 * (a inércia só desacelera).
 */

export type Direcao = -1 | 1;

export interface MedidasDaNarrativa {
  /** Posição da página (scrollY) em que a primeira cena está no palco. */
  readonly inicio: number;
  /** Altura de uma cena (a altura do palco). */
  readonly passo: number;
  /** Quantas cenas. */
  readonly total: number;
}

export type Zona = "antes" | "cenas" | "saida" | "depois";

/** Folga, em px, para arredondamentos de rolagem (zoom, telas 1,5x). */
const FOLGA = 2;

export function posicaoDaCena(medidas: MedidasDaNarrativa, indice: number): number {
  const limitado = Math.min(Math.max(indice, 0), medidas.total - 1);
  return medidas.inicio + limitado * medidas.passo;
}

/** Onde começa a seção depois da narrativa. */
export function fimDaNarrativa(medidas: MedidasDaNarrativa): number {
  return medidas.inicio + medidas.total * medidas.passo;
}

export function zonaDaPosicao(medidas: MedidasDaNarrativa, y: number): Zona {
  if (y < medidas.inicio - FOLGA) return "antes";
  if (y <= posicaoDaCena(medidas, medidas.total - 1) + FOLGA) return "cenas";
  if (y < fimDaNarrativa(medidas) - FOLGA) return "saida";
  return "depois";
}

/**
 * Qual cena corresponde a uma posição da página (rolagem que não veio da
 * navegação: barra de rolagem, busca, âncora). Fora das cenas, `null`.
 */
export function cenaDaPosicao(medidas: MedidasDaNarrativa, y: number): number | null {
  if (zonaDaPosicao(medidas, y) !== "cenas") return null;
  const indice = Math.round((y - medidas.inicio) / medidas.passo);
  return Math.min(Math.max(indice, 0), medidas.total - 1);
}

export type Destino =
  /** Trocar para esta cena (o palco fica parado; só a coreografia anda). */
  | { readonly tipo: "cena"; readonly indice: number }
  /** Sair do palco: a página desliza até o começo da seção seguinte. */
  | { readonly tipo: "sair"; readonly y: number }
  /** Voltar ao palco vindo de baixo: a página desliza até a última cena. */
  | { readonly tipo: "voltar"; readonly y: number; readonly indice: number };

/**
 * Para onde um gesto leva. `null` = não é com a narrativa: o navegador rola
 * normalmente (antes do palco, depois dele, ou subindo na primeira cena).
 */
export function destinoDoGesto(
  medidas: MedidasDaNarrativa,
  y: number,
  direcao: Direcao,
  atual: number,
): Destino | null {
  const ultima = medidas.total - 1;
  switch (zonaDaPosicao(medidas, y)) {
    case "cenas":
      if (direcao === 1) {
        return atual < ultima
          ? { tipo: "cena", indice: atual + 1 }
          : { tipo: "sair", y: fimDaNarrativa(medidas) };
      }
      return atual > 0 ? { tipo: "cena", indice: atual - 1 } : null;
    case "saida":
      return direcao === -1
        ? { tipo: "voltar", y: posicaoDaCena(medidas, ultima), indice: ultima }
        : null;
    case "depois":
      // Encostado na seção seguinte (onde a saída deixa a página): subir
      // volta ao palco num gesto só, como de qualquer ponto da saída.
      return direcao === -1 && encostadoNaSaida(medidas, y)
        ? { tipo: "voltar", y: posicaoDaCena(medidas, ultima), indice: ultima }
        : null;
    default:
      return null;
  }
}

/** A página parada no começo da seção seguinte (a borda de baixo da saída). */
function encostadoNaSaida(medidas: MedidasDaNarrativa, y: number): boolean {
  return Math.abs(y - fimDaNarrativa(medidas)) <= FOLGA;
}

/** Se a narrativa deve segurar este gesto (impedir a rolagem do navegador). */
export function seguraOGesto(medidas: MedidasDaNarrativa, y: number, direcao: Direcao): boolean {
  const zona = zonaDaPosicao(medidas, y);
  if (zona === "cenas") return !(direcao === -1 && y <= medidas.inicio + FOLGA);
  if (direcao === 1) return false;
  return zona === "saida" || (zona === "depois" && encostadoNaSaida(medidas, y));
}

// --- o gesto --------------------------------------------------------------------

export interface OpcoesDoDetector {
  /** Quanto o gesto precisa somar (px) para valer uma cena. */
  readonly limiar?: number;
  /** Sem evento por este tempo (ms), o próximo é um gesto novo. */
  readonly pausa?: number;
}

export interface LeituraDoGesto {
  /** O sentido, quando este evento completou uma rolada nova; senão 0. */
  readonly disparo: Direcao | 0;
  /** Se este evento começou um gesto novo. */
  readonly novo: boolean;
}

export interface DetectorDeGesto {
  /**
   * Um evento de roda. `conta` diz se a narrativa está segurando a rolagem:
   * fora do palco o gesto é só acompanhado (para saber quando acaba), sem
   * somar — assim um gesto que ENTRA no palco ainda vale uma cena.
   */
  registrar(tempo: number, delta: number, conta?: boolean): LeituraDoGesto;
  /** Ignora tudo até este instante (a transição está correndo). */
  travarAte(tempo: number): void;
}

export function criarDetectorDeGesto({ limiar = 24, pausa = 180 }: OpcoesDoDetector = {}): DetectorDeGesto {
  let ultimoTempo = Number.NEGATIVE_INFINITY;
  let ultimoTamanho = 0;
  let ultimoSentido = 0;
  let acumulado = 0;
  let usado = false;
  let travadoAte = Number.NEGATIVE_INFINITY;

  return {
    registrar(tempo, delta, conta = true) {
      if (delta === 0) return { disparo: 0, novo: false };
      const tamanho = Math.abs(delta);
      const sentido = Math.sign(delta);
      const novo =
        tempo - ultimoTempo > pausa ||
        sentido !== ultimoSentido ||
        // A inércia só desacelera: um salto claro é um dedo novo no trackpad.
        (tamanho >= 12 && tamanho > ultimoTamanho * 1.8);
      if (novo) {
        acumulado = 0;
        usado = false;
      }
      ultimoTempo = tempo;
      ultimoTamanho = tamanho;
      ultimoSentido = sentido;

      if (tempo < travadoAte) {
        // Gesto que começa durante a transição não vale depois dela.
        usado = true;
        return { disparo: 0, novo };
      }
      if (usado || !conta) return { disparo: 0, novo };
      acumulado += delta;
      if (Math.abs(acumulado) < limiar) return { disparo: 0, novo };
      usado = true;
      return { disparo: acumulado > 0 ? 1 : -1, novo };
    },
    travarAte(tempo) {
      travadoAte = tempo;
      usado = true;
    },
  };
}

// --- âncoras --------------------------------------------------------------------

/**
 * O id de destino de um link para esta mesma página: `#taxas` e também
 * `/#taxas` (os links do rodapé, que servem a outras páginas). `null` se o
 * link leva a outra página ou não tem âncora.
 */
export function ancoraDaMesmaPagina(href: string | null | undefined, paginaAtual: string): string | null {
  if (!href || !href.includes("#")) return null;
  let destino: URL;
  let atual: URL;
  try {
    atual = new URL(paginaAtual);
    destino = new URL(href, atual);
  } catch {
    return null;
  }
  if (destino.origin !== atual.origin || destino.pathname !== atual.pathname || destino.search !== atual.search) return null;
  const id = decodeURIComponent(destino.hash.slice(1));
  return id === "" ? null : id;
}

// --- teclado --------------------------------------------------------------------

const TECLAS_PARA_BAIXO = new Set(["ArrowDown", "PageDown"]);
const TECLAS_PARA_CIMA = new Set(["ArrowUp", "PageUp"]);

/**
 * O sentido de uma tecla, ou 0 se ela não é de navegação. Dentro de campo de
 * texto nada conta; em botão e link, o Espaço é do controle (aciona).
 */
export function direcaoDaTecla(
  tecla: string,
  { shift = false, alvo = "outro" }: { readonly shift?: boolean; readonly alvo?: "texto" | "controle" | "outro" } = {},
): Direcao | 0 {
  if (alvo === "texto") return 0;
  if (TECLAS_PARA_BAIXO.has(tecla)) return 1;
  if (TECLAS_PARA_CIMA.has(tecla)) return -1;
  if (tecla === " " && alvo !== "controle") return shift ? -1 : 1;
  return 0;
}

/** Arrasto vertical do dedo: para cima (conteúdo sobe) é avançar. */
export function direcaoDoToque(inicioY: number, fimY: number, minimo = 40): Direcao | 0 {
  const distancia = inicioY - fimY;
  if (Math.abs(distancia) < minimo) return 0;
  return distancia > 0 ? 1 : -1;
}
