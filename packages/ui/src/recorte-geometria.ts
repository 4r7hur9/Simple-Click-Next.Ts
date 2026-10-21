/**
 * A matemática do recorte de imagem (card #82), toda em funções puras.
 *
 * Nada aqui toca o navegador: recebe números e devolve números. É o que
 * permite provar o recorte sem canvas e sem tela — e é a MESMA conta que
 * mostra a prévia e gera o arquivo, então o que a pessoa vê na moldura é o
 * que sai.
 *
 * Vocabulário:
 * - **origem**: a foto como veio do arquivo (largura × altura naturais).
 * - **moldura**: a janela da prévia, em pixels da tela, na proporção do espaço.
 * - **saída**: o arquivo final, nas dimensões do espaço (ex.: 1600 × 400).
 * - **giro** e **espelhado**: aplicados à foto ANTES de enquadrar (primeiro
 *   gira, depois espelha o que se vê).
 * - **modo**: `preencher` cobre a moldura inteira (sem barras, como o
 *   `object-fit: cover`); `ajustar` mostra a foto inteira (como o `contain`),
 *   com o fundo preenchido nas sobras.
 * - **zoom**: 1 é o enquadramento do modo; sobe até `ZOOM_MAXIMO`.
 * - **x, y**: onde fica o canto de cima à esquerda da foto, em pixels da
 *   moldura.
 */

import { PALETA_OFICIAL } from "./tokens";

export interface Tamanho {
  readonly largura: number;
  readonly altura: number;
}

export type ModoDoRecorte = "preencher" | "ajustar";
export type GiroDoRecorte = 0 | 90 | 180 | 270;

export interface EstadoDoRecorte {
  readonly modo: ModoDoRecorte;
  readonly zoom: number;
  readonly x: number;
  readonly y: number;
  readonly giro: GiroDoRecorte;
  readonly espelhado: boolean;
}

export interface Ponto {
  readonly x: number;
  readonly y: number;
}

export const ZOOM_MINIMO = 1;
export const ZOOM_MAXIMO = 4;

/** A foto com o giro aplicado: a 90° e 270° largura e altura trocam. */
export function tamanhoGirado(origem: Tamanho, giro: GiroDoRecorte): Tamanho {
  return giro === 90 || giro === 270
    ? { largura: origem.altura, altura: origem.largura }
    : origem;
}

export function limitarZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_MINIMO;
  return Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, zoom));
}

/** Quantos pixels da moldura vale 1 pixel da foto, com zoom 1. */
export function escalaBase(
  moldura: Tamanho,
  origem: Tamanho,
  estado: Pick<EstadoDoRecorte, "modo" | "giro">,
): number {
  const girada = tamanhoGirado(origem, estado.giro);
  const horizontal = moldura.largura / girada.largura;
  const vertical = moldura.altura / girada.altura;
  return estado.modo === "preencher"
    ? Math.max(horizontal, vertical)
    : Math.min(horizontal, vertical);
}

export function escalaTotal(
  moldura: Tamanho,
  origem: Tamanho,
  estado: Pick<EstadoDoRecorte, "modo" | "giro" | "zoom">,
): number {
  return escalaBase(moldura, origem, estado) * limitarZoom(estado.zoom);
}

/** O retângulo que a foto (já girada) ocupa na moldura, sem o deslocamento. */
export function tamanhoNaMoldura(
  moldura: Tamanho,
  origem: Tamanho,
  estado: Pick<EstadoDoRecorte, "modo" | "giro" | "zoom">,
): Tamanho & { readonly escala: number } {
  const escala = escalaTotal(moldura, origem, estado);
  const girada = tamanhoGirado(origem, estado.giro);
  return {
    largura: girada.largura * escala,
    altura: girada.altura * escala,
    escala,
  };
}

export interface LimitesDoDeslocamento {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * Até onde a foto pode ir. Em cada eixo:
 * - foto MAIOR que a moldura: não pode deixar vão (vai de `moldura - foto` a 0);
 * - foto MENOR (modo ajustar): pode ficar em qualquer lugar dentro da moldura
 *   (vai de 0 a `moldura - foto`), para a pessoa posicionar.
 */
export function limitesDoDeslocamento(
  moldura: Tamanho,
  origem: Tamanho,
  estado: Pick<EstadoDoRecorte, "modo" | "giro" | "zoom">,
): LimitesDoDeslocamento {
  const imagem = tamanhoNaMoldura(moldura, origem, estado);
  const folgaX = moldura.largura - imagem.largura;
  const folgaY = moldura.altura - imagem.altura;
  return {
    minX: Math.min(0, folgaX),
    maxX: Math.max(0, folgaX),
    minY: Math.min(0, folgaY),
    maxY: Math.max(0, folgaY),
  };
}

function entre(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/** Segura o deslocamento do estado dentro dos limites. */
export function manterDentro(
  moldura: Tamanho,
  origem: Tamanho,
  estado: EstadoDoRecorte,
): EstadoDoRecorte {
  const limites = limitesDoDeslocamento(moldura, origem, estado);
  const x = entre(estado.x, limites.minX, limites.maxX);
  const y = entre(estado.y, limites.minY, limites.maxY);
  return x === estado.x && y === estado.y ? estado : { ...estado, x, y };
}

/** A foto no centro da moldura, com o zoom, o giro e o espelho do estado. */
export function centralizar(
  moldura: Tamanho,
  origem: Tamanho,
  estado: EstadoDoRecorte,
): EstadoDoRecorte {
  const imagem = tamanhoNaMoldura(moldura, origem, estado);
  return {
    ...estado,
    x: (moldura.largura - imagem.largura) / 2,
    y: (moldura.altura - imagem.altura) / 2,
  };
}

/** O ponto de partida: modo escolhido, sem zoom, giro nem espelho, centralizada. */
export function estadoInicial(
  moldura: Tamanho,
  origem: Tamanho,
  modo: ModoDoRecorte = "preencher",
): EstadoDoRecorte {
  return centralizar(moldura, origem, {
    modo,
    zoom: ZOOM_MINIMO,
    x: 0,
    y: 0,
    giro: 0,
    espelhado: false,
  });
}

/** Arrasta a foto (em pixels da moldura), sem sair dos limites. */
export function mover(
  moldura: Tamanho,
  origem: Tamanho,
  estado: EstadoDoRecorte,
  deslocamento: Ponto,
): EstadoDoRecorte {
  return manterDentro(moldura, origem, {
    ...estado,
    x: estado.x + deslocamento.x,
    y: estado.y + deslocamento.y,
  });
}

/**
 * Muda o zoom mantendo o ponto indicado (em pixels da moldura) no mesmo lugar
 * da foto — o centro da moldura, se nada for dito. É o que faz a roda do
 * mouse e a pinça aproximarem "para dentro do dedo".
 */
export function mudarZoom(
  moldura: Tamanho,
  origem: Tamanho,
  estado: EstadoDoRecorte,
  novoZoom: number,
  ponto: Ponto = { x: moldura.largura / 2, y: moldura.altura / 2 },
): EstadoDoRecorte {
  const zoom = limitarZoom(novoZoom);
  if (zoom === limitarZoom(estado.zoom)) return estado;
  const antes = escalaTotal(moldura, origem, estado);
  const depois = escalaTotal(moldura, origem, { ...estado, zoom });
  const razao = depois / antes;
  return manterDentro(moldura, origem, {
    ...estado,
    zoom,
    x: ponto.x - (ponto.x - estado.x) * razao,
    y: ponto.y - (ponto.y - estado.y) * razao,
  });
}

/** Gira 90° no sentido horário e recentraliza (a foto trocou de formato). */
export function girar(
  moldura: Tamanho,
  origem: Tamanho,
  estado: EstadoDoRecorte,
): EstadoDoRecorte {
  const giro = ((estado.giro + 90) % 360) as GiroDoRecorte;
  return manterDentro(
    moldura,
    origem,
    centralizar(moldura, origem, { ...estado, giro }),
  );
}

/** Espelha na horizontal. A foto fica onde está; só o desenho vira. */
export function espelhar(estado: EstadoDoRecorte): EstadoDoRecorte {
  return { ...estado, espelhado: !estado.espelhado };
}

/**
 * Troca entre preencher e ajustar. O enquadramento muda de tamanho, então o
 * zoom volta a 1 e a foto, ao centro; giro e espelho continuam.
 */
export function mudarModo(
  moldura: Tamanho,
  origem: Tamanho,
  estado: EstadoDoRecorte,
  modo: ModoDoRecorte,
): EstadoDoRecorte {
  if (estado.modo === modo) return estado;
  return centralizar(moldura, origem, { ...estado, modo, zoom: ZOOM_MINIMO });
}

/** Mantém o enquadramento quando a moldura muda de tamanho (mesma proporção). */
export function acompanharMoldura(
  estado: EstadoDoRecorte,
  larguraAntes: number,
  larguraDepois: number,
): EstadoDoRecorte {
  if (
    larguraAntes <= 0 ||
    larguraDepois <= 0 ||
    larguraAntes === larguraDepois
  ) {
    return estado;
  }
  const razao = larguraDepois / larguraAntes;
  return { ...estado, x: estado.x * razao, y: estado.y * razao };
}

/**
 * Leva o enquadramento de uma moldura para outra de MESMA proporção e outro
 * tamanho (ex.: a moldura da tela ⇄ a moldura do arquivo de saída). Só o
 * deslocamento muda; modo, zoom, giro e espelho são os mesmos.
 */
export function escalarEstado(
  estado: EstadoDoRecorte,
  fator: number,
): EstadoDoRecorte {
  if (!Number.isFinite(fator) || fator <= 0 || fator === 1) return estado;
  return { ...estado, x: estado.x * fator, y: estado.y * fator };
}

/**
 * O enquadramento de uma moldura de OUTRA PROPORÇÃO que mostra o mesmo ponto
 * da foto no centro e usa o mesmo zoom, modo, giro e espelho.
 *
 * É o que faz o celular "herdar" o ajuste do computador: a moldura em pé
 * (9:20) e a deitada (4:3) cortam a foto de jeitos diferentes, mas o assunto
 * que o dono centralizou continua no meio nas duas.
 */
export function herdarEnquadramento(
  origem: Tamanho,
  molduraDe: Tamanho,
  estadoDe: EstadoDoRecorte,
  molduraPara: Tamanho,
): EstadoDoRecorte {
  const de = tamanhoNaMoldura(molduraDe, origem, estadoDe);
  // O ponto da foto (já girada) que está no centro da moldura de origem, de 0 a 1.
  const focoX = (molduraDe.largura / 2 - estadoDe.x) / de.largura;
  const focoY = (molduraDe.altura / 2 - estadoDe.y) / de.altura;
  const semDeslocamento = { ...estadoDe, x: 0, y: 0 };
  const para = tamanhoNaMoldura(molduraPara, origem, semDeslocamento);
  return manterDentro(molduraPara, origem, {
    ...semDeslocamento,
    x: molduraPara.largura / 2 - focoX * para.largura,
    y: molduraPara.altura / 2 - focoY * para.altura,
  });
}

/**
 * Como desenhar a foto na tela: o `<img>` com o tamanho natural escalado, o
 * centro no lugar certo e a mesma ordem de giro e espelho do canvas.
 * `fator` leva as medidas da moldura para outra tela do mesmo desenho (as
 * miniaturas "como vai aparecer").
 */
export function estiloDaImagem(
  moldura: Tamanho,
  origem: Tamanho,
  estado: EstadoDoRecorte,
  fator = 1,
): { width: number; height: number; transform: string } {
  const imagem = tamanhoNaMoldura(moldura, origem, estado);
  const largura = origem.largura * imagem.escala * fator;
  const altura = origem.altura * imagem.escala * fator;
  const centroX = (estado.x + imagem.largura / 2) * fator;
  const centroY = (estado.y + imagem.altura / 2) * fator;
  const espelho = estado.espelhado ? "scaleX(-1) " : "";
  return {
    width: largura,
    height: altura,
    transform: `translate(${String(centroX - largura / 2)}px, ${String(centroY - altura / 2)}px) ${espelho}rotate(${String(estado.giro)}deg)`,
  };
}

/** Matriz 2D do canvas: [a, b, c, d, e, f] de `setTransform`. */
export type MatrizDoCanvas = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];

const COSSENO_E_SENO: Record<GiroDoRecorte, readonly [number, number]> = {
  0: [1, 0],
  90: [0, 1],
  180: [-1, 0],
  270: [0, -1],
};

/**
 * A matriz que leva a foto original para o arquivo de saída: centraliza,
 * gira, espelha, escala e posiciona. Os cantos da foto caem exatamente onde a
 * moldura os mostra, multiplicados por `saída ÷ moldura`.
 */
export function matrizDeSaida(
  moldura: Tamanho,
  origem: Tamanho,
  estado: EstadoDoRecorte,
  saida: Tamanho,
): MatrizDoCanvas {
  const imagem = tamanhoNaMoldura(moldura, origem, estado);
  const fator = saida.largura / moldura.largura;
  const k = imagem.escala * fator;
  const [cos, sen] = COSSENO_E_SENO[estado.giro];
  const lado = estado.espelhado ? -1 : 1;
  // Parte linear: espelho · giro · escala.
  const a = k * lado * cos;
  const b = k * sen;
  const c = k * lado * -sen;
  const d = k * cos;
  const centroX = (estado.x + imagem.largura / 2) * fator;
  const centroY = (estado.y + imagem.altura / 2) * fator;
  const e = centroX - (a * origem.largura) / 2 - (c * origem.altura) / 2;
  const f = centroY - (b * origem.largura) / 2 - (d * origem.altura) / 2;
  return [
    soltarZeroNegativo(a),
    soltarZeroNegativo(b),
    soltarZeroNegativo(c),
    soltarZeroNegativo(d),
    e,
    f,
  ];
}

function soltarZeroNegativo(valor: number): number {
  return valor === 0 ? 0 : valor;
}

export interface Nitidez {
  /** Quantos pixels da foto cobrem a largura da saída. */
  readonly pixelsDaFotoNaLargura: number;
  /** Quantas vezes a foto precisa ser esticada para chegar à saída. */
  readonly ampliacao: number;
  /** Verdadeiro quando a foto é pequena demais para este recorte. */
  readonly baixa: boolean;
}

/**
 * A resolução que o recorte tem de verdade, com o zoom de agora: aproximar
 * uma foto pequena piora a nitidez, e a pessoa precisa saber.
 * `minimoLargura` é a largura mínima recomendada do espaço; sem ela, vale
 * esticar até 1,34× (cerca de 75% da saída) antes de avisar.
 */
export function avaliarNitidez(
  moldura: Tamanho,
  origem: Tamanho,
  estado: EstadoDoRecorte,
  saida: Tamanho,
  minimoLargura?: number,
): Nitidez {
  const escala = escalaTotal(moldura, origem, estado);
  const ampliacao = (saida.largura / moldura.largura) * escala;
  const limite =
    minimoLargura !== undefined && minimoLargura > 0
      ? saida.largura / minimoLargura
      : 1 / 0.75;
  return {
    pixelsDaFotoNaLargura: moldura.largura / escala,
    ampliacao,
    // Uma folga mínima evita avisar por erro de arredondamento.
    baixa: ampliacao > limite + 1e-6,
  };
}

// ---------------------------------------------------------------------------
// Fundo do modo "ajustar"
// ---------------------------------------------------------------------------

/** A cor média de pixels RGBA (ex.: a foto reduzida a 8 × 8), em `#rrggbb`. */
export function corMediaDosPixels(pixels: ArrayLike<number>): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let peso = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const opacidade = (pixels[i + 3] ?? 0) / 255;
    r += (pixels[i] ?? 0) * opacidade;
    g += (pixels[i + 1] ?? 0) * opacidade;
    b += (pixels[i + 2] ?? 0) * opacidade;
    peso += opacidade;
  }
  if (peso === 0) return PALETA_OFICIAL.grafite;
  const hex = (v: number) =>
    Math.round(v / peso)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// ---------------------------------------------------------------------------
// Arquivo
// ---------------------------------------------------------------------------

/** O que o recortador lê: o que o navegador sabe abrir (HEIC só no Safari). */
export const TIPOS_DE_FOTO_PARA_RECORTAR: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export const LIMITE_DA_FOTO_ESCOLHIDA_EM_BYTES = 25 * 1024 * 1024;

/** A qualidade do WebP: 0,85 e, se o arquivo passar do limite, vai baixando. */
export const QUALIDADES_DO_WEBP: readonly number[] = [
  0.85, 0.75, 0.65, 0.5, 0.4,
];

export function formatarMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const texto =
    mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1).replace(".", ",");
  return `${texto} MB`;
}

const EXTENSOES_POR_TIPO: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "image/heif": ["heif", "heic"],
};

/** O tipo do arquivo; se o navegador não informou (comum no HEIC), pela extensão. */
export function tipoDoArquivo(arquivo: { type: string; name: string }): string {
  if (arquivo.type !== "") return arquivo.type.toLowerCase();
  const extensao = arquivo.name.split(".").pop()?.toLowerCase() ?? "";
  for (const [tipo, extensoes] of Object.entries(EXTENSOES_POR_TIPO)) {
    if (extensoes.includes(extensao)) return tipo;
  }
  return "";
}

/**
 * Confere o arquivo escolhido ANTES de abrir o recorte. Nulo quando serve; a
 * frase da recusa (em português simples) quando não serve.
 */
export function validarArquivoDeImagem(
  arquivo: { type: string; name: string; size: number },
  opcoes: {
    readonly tipos?: readonly string[] | undefined;
    readonly limiteEmBytes?: number | undefined;
  } = {},
): string | null {
  const tipos = opcoes.tipos ?? TIPOS_DE_FOTO_PARA_RECORTAR;
  const limite = opcoes.limiteEmBytes ?? LIMITE_DA_FOTO_ESCOLHIDA_EM_BYTES;
  if (!tipos.includes(tipoDoArquivo(arquivo))) {
    return "Esse arquivo não é uma foto que eu consiga abrir. Use JPG, PNG, WebP ou HEIC.";
  }
  if (arquivo.size <= 0) return "Esse arquivo está vazio. Escolha outra foto.";
  if (arquivo.size > limite) {
    return `Essa foto tem ${formatarMegabytes(arquivo.size)} e o limite para escolher é ${formatarMegabytes(limite)}. Escolha uma menor — depois do recorte ela fica bem mais leve.`;
  }
  return null;
}

/** "foto-da-loja.jpeg" → "foto-da-loja.webp". */
export function nomeDoArquivoRecortado(
  nome: string,
  extensao = "webp",
): string {
  const base = nome.replace(/\.[^./\\]+$/, "").trim();
  return `${base === "" ? "foto" : base}.${extensao}`;
}
