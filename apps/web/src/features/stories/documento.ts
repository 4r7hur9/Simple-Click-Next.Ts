/**
 * O documento do editor de Stories (card #84): tudo que a pessoa fez em cima
 * da foto ou do vídeo. É imutável — cada mudança devolve um documento novo,
 * o que deixa o desfazer trivial (veja `historico.ts`).
 *
 * Ordem de empilhar (de baixo para cima): mídia → desenho → camadas (textos,
 * emojis e etiquetas, na ordem em que foram postos; a última fica por cima).
 */
import {
  LIMITES_DO_FUNDO,
  TRANSFORMACAO_CENTRAL,
  arredondar,
  limitar,
  type ModoDeEnquadramento,
  type Ponto,
  type Transformacao,
} from "./geometria.ts";

import coresDoEditor from "./cores-do-editor.json";

/** As cores do editor vêm de `cores-do-editor.json` (são conteúdo, não tema). */
export const CORES_DO_EDITOR: readonly string[] = coresDoEditor.paleta;
export const BRANCO: string = coresDoEditor.branco;
export const PRETO: string = coresDoEditor.preto;
export const COR_DO_FUNDO_DO_PALCO: string = coresDoEditor.fundoDoPalco;

/** A paleta do editor, com a cor da loja na frente (sem repetir). */
export function paletaDaLoja(corDestaque: string | null): readonly string[] {
  const cor = corDestaque?.toLowerCase() ?? null;
  if (cor === null || !/^#[0-9a-f]{6}$/.test(cor)) return CORES_DO_EDITOR;
  return [cor, ...CORES_DO_EDITOR.filter((outra) => outra !== cor)];
}

/** As três espessuras do pincel, em unidades do palco. */
export const ESPESSURAS_DO_PINCEL = [
  { id: "fino", rotulo: "Fino", valor: 10 },
  { id: "medio", rotulo: "Médio", valor: 26 },
  { id: "grosso", rotulo: "Grosso", valor: 56 },
] as const;

export type EspessuraId = (typeof ESPESSURAS_DO_PINCEL)[number]["id"];

export interface Traco {
  readonly id: string;
  readonly cor: string;
  readonly espessura: number;
  /** A borracha apaga só o desenho, nunca a foto. */
  readonly borracha: boolean;
  readonly pontos: readonly Ponto[];
}

export type FonteDoTexto = "moderno" | "maquina" | "elegante";
export type AlinhamentoDoTexto = "esquerda" | "centro" | "direita";

export const FONTES_DO_TEXTO: readonly {
  readonly id: FonteDoTexto;
  readonly rotulo: string;
  readonly peso: number;
  readonly italico: boolean;
  /** Pilha de fontes que o canvas e a tela entendem (sem `var()`). */
  readonly familia: string;
}[] = [
  {
    id: "moderno",
    rotulo: "Moderno",
    peso: 700,
    italico: false,
    familia: '"Space Grotesk", ui-sans-serif, system-ui, "Segoe UI", sans-serif',
  },
  {
    id: "maquina",
    rotulo: "Máquina",
    peso: 700,
    italico: false,
    familia: '"Courier New", ui-monospace, Menlo, Consolas, monospace',
  },
  {
    id: "elegante",
    rotulo: "Elegante",
    peso: 600,
    italico: true,
    familia: 'Georgia, "Times New Roman", serif',
  },
];

export function fonteDoTexto(id: FonteDoTexto) {
  return FONTES_DO_TEXTO.find((fonte) => fonte.id === id) ?? FONTES_DO_TEXTO[0]!;
}

/** O tamanho natural (escala 1) do texto, em unidades do palco. */
export const TAMANHO_DO_TEXTO = 84;
export const ALTURA_DA_LINHA = 1.3;
/** Recuo lateral do fundo do texto, em múltiplos do tamanho. */
export const RECUO_DO_FUNDO = 0.32;
export const RAIO_DO_FUNDO = 0.28;

export interface Texto {
  readonly tipo: "texto";
  readonly id: string;
  readonly texto: string;
  readonly fonte: FonteDoTexto;
  readonly cor: string;
  readonly alinhamento: AlinhamentoDoTexto;
  /** Fundo na cor do texto (a letra vira preto ou branco, a que contrastar). */
  readonly comFundo: boolean;
  readonly t: Transformacao;
}

export interface Emoji {
  readonly tipo: "emoji";
  readonly id: string;
  readonly emoji: string;
  readonly t: Transformacao;
}

export interface ProdutoMarcado {
  readonly id: string;
  readonly nome: string;
}

/** Etiqueta: oferta, preço, aberto… e o produto marcado (com link). */
export interface Etiqueta {
  readonly tipo: "etiqueta";
  readonly id: string;
  readonly texto: string;
  readonly fundo: string;
  readonly tinta: string;
  readonly produto: ProdutoMarcado | null;
  readonly t: Transformacao;
}

export type Camada = Texto | Emoji | Etiqueta;

export const TAMANHO_DO_EMOJI = 170;
export const TAMANHO_DA_ETIQUETA = 64;
export const ALTURA_DA_ETIQUETA = 1.6;
export const RECUO_DA_ETIQUETA = 0.7;

export interface FundoDoStory {
  readonly modo: ModoDeEnquadramento;
  readonly t: Transformacao;
}

export interface DocumentoDoStory {
  readonly fundo: FundoDoStory;
  readonly tracos: readonly Traco[];
  readonly camadas: readonly Camada[];
}

export function documentoVazio(): DocumentoDoStory {
  return {
    fundo: { modo: "preencher", t: TRANSFORMACAO_CENTRAL },
    tracos: [],
    camadas: [],
  };
}

/** O documento tem algo feito pela pessoa (para perguntar antes de descartar)? */
export function temEdicao(documento: DocumentoDoStory): boolean {
  const fundoMexido =
    documento.fundo.modo !== "preencher" ||
    documento.fundo.t.x !== TRANSFORMACAO_CENTRAL.x ||
    documento.fundo.t.y !== TRANSFORMACAO_CENTRAL.y ||
    documento.fundo.t.escala !== 1 ||
    documento.fundo.t.rotacao !== 0;
  return fundoMexido || documento.tracos.length > 0 || documento.camadas.length > 0;
}

let contador = 0;
/** Identificador local (só vive no editor). */
export function novoId(prefixo: string): string {
  contador += 1;
  return `${prefixo}-${contador}-${Math.random().toString(36).slice(2, 7)}`;
}

export function adicionarTraco(
  documento: DocumentoDoStory,
  traco: Traco,
): DocumentoDoStory {
  return { ...documento, tracos: [...documento.tracos, traco] };
}

export function adicionarCamada(
  documento: DocumentoDoStory,
  camada: Camada,
): DocumentoDoStory {
  return { ...documento, camadas: [...documento.camadas, camada] };
}

export function atualizarCamada(
  documento: DocumentoDoStory,
  id: string,
  mudanca: (camada: Camada) => Camada,
): DocumentoDoStory {
  let mexeu = false;
  const camadas = documento.camadas.map((camada) => {
    if (camada.id !== id) return camada;
    mexeu = true;
    return mudanca(camada);
  });
  return mexeu ? { ...documento, camadas } : documento;
}

export function mudarTransformacao(
  documento: DocumentoDoStory,
  id: string,
  t: Transformacao,
): DocumentoDoStory {
  return atualizarCamada(documento, id, (camada) => ({ ...camada, t }));
}

export function removerCamada(
  documento: DocumentoDoStory,
  id: string,
): DocumentoDoStory {
  const camadas = documento.camadas.filter((camada) => camada.id !== id);
  return camadas.length === documento.camadas.length
    ? documento
    : { ...documento, camadas };
}

/** Traz a camada para cima de todas (ao ser tocada). */
export function trazerParaFrente(
  documento: DocumentoDoStory,
  id: string,
): DocumentoDoStory {
  const indice = documento.camadas.findIndex((camada) => camada.id === id);
  if (indice < 0 || indice === documento.camadas.length - 1) return documento;
  const camada = documento.camadas[indice]!;
  return {
    ...documento,
    camadas: [
      ...documento.camadas.slice(0, indice),
      ...documento.camadas.slice(indice + 1),
      camada,
    ],
  };
}

export function mudarFundo(
  documento: DocumentoDoStory,
  t: Transformacao,
): DocumentoDoStory {
  return {
    ...documento,
    fundo: {
      ...documento.fundo,
      t: { ...t, escala: limitar(t.escala, LIMITES_DO_FUNDO.minima, LIMITES_DO_FUNDO.maxima) },
    },
  };
}

/** Trocar entre preencher e ajustar volta a mídia ao centro. */
export function mudarModoDoFundo(
  documento: DocumentoDoStory,
  modo: ModoDeEnquadramento,
): DocumentoDoStory {
  if (documento.fundo.modo === modo) return documento;
  return { ...documento, fundo: { modo, t: TRANSFORMACAO_CENTRAL } };
}

export function desfazerEnquadramento(documento: DocumentoDoStory): DocumentoDoStory {
  return { ...documento, fundo: { ...documento.fundo, t: TRANSFORMACAO_CENTRAL } };
}

/** O produto marcado no story (a última etiqueta de produto), ou nulo. */
export function produtoDoStory(documento: DocumentoDoStory): ProdutoMarcado | null {
  for (let i = documento.camadas.length - 1; i >= 0; i -= 1) {
    const camada = documento.camadas[i]!;
    if (camada.tipo === "etiqueta" && camada.produto !== null) return camada.produto;
  }
  return null;
}

/** Posição de uma camada nova: no meio, um pouco acima (a mão alcança). */
export function posicaoInicialDaCamada(deslocamento = 0): Transformacao {
  return {
    x: TRANSFORMACAO_CENTRAL.x,
    y: 820 + deslocamento,
    escala: 1,
    rotacao: 0,
  };
}

export function novoTraco(
  cor: string,
  espessura: number,
  borracha: boolean,
  inicio: Ponto,
): Traco {
  return {
    id: novoId("traco"),
    cor,
    espessura,
    borracha,
    pontos: [{ x: arredondar(inicio.x, 1), y: arredondar(inicio.y, 1) }],
  };
}

/** Acrescenta um ponto ao traço; ignora pontos colados no anterior. */
export function estenderTraco(traco: Traco, ponto: Ponto): Traco {
  const ultimo = traco.pontos[traco.pontos.length - 1];
  if (ultimo !== undefined && Math.hypot(ponto.x - ultimo.x, ponto.y - ultimo.y) < 2) {
    return traco;
  }
  return {
    ...traco,
    pontos: [
      ...traco.pontos,
      { x: arredondar(ponto.x, 1), y: arredondar(ponto.y, 1) },
    ],
  };
}

/** Preto ou branco, o que contrastar mais com a cor (`#rrggbb`). */
export function tintaSobre(cor: string): string {
  const limpa = cor.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(limpa)) return BRANCO;
  const parte = (inicio: number) => {
    const canal = Number.parseInt(limpa.slice(inicio, inicio + 2), 16) / 255;
    return canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = 0.2126 * parte(0) + 0.7152 * parte(2) + 0.0722 * parte(4);
  return luminancia > 0.4 ? PRETO : BRANCO;
}

// ---------------------------------------------------------------------------
// Adesivos da casa
// ---------------------------------------------------------------------------

export const EMOJIS_DA_CASA = [
  "🔥", "😍", "😋", "🎉", "✨", "❤️", "👏", "🙌",
  "🍕", "🍔", "🌮", "🍰", "☕", "🛍️", "🎁", "🚚",
  "💸", "🏷️", "🆕", "⭐", "📍", "💥", "👀", "🥳",
] as const;

export interface ModeloDeEtiqueta {
  readonly id: string;
  readonly texto: string;
  readonly fundo: string;
  readonly tinta: string;
}

export const ETIQUETAS_DA_CASA: readonly ModeloDeEtiqueta[] = coresDoEditor.etiquetas;

/** "19,9" → "R$ 19,90"; vazio ou inválido → null. */
export function textoDoPreco(digitado: string): string | null {
  const limpo = digitado.replace(/[^\d,.]/g, "").trim();
  if (limpo === "") return null;
  const numero = Number(limpo.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(numero) || numero <= 0 || numero > 9_999_999) return null;
  return `R$ ${numero.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function criarEmoji(emoji: string, t: Transformacao): Emoji {
  return { tipo: "emoji", id: novoId("emoji"), emoji, t };
}

export function criarEtiqueta(
  modelo: Pick<ModeloDeEtiqueta, "texto" | "fundo" | "tinta">,
  t: Transformacao,
  produto: ProdutoMarcado | null = null,
): Etiqueta {
  return {
    tipo: "etiqueta",
    id: novoId("etiqueta"),
    texto: modelo.texto,
    fundo: modelo.fundo,
    tinta: modelo.tinta,
    produto,
    t,
  };
}

export function criarTexto(
  parte: Pick<Texto, "texto" | "fonte" | "cor" | "alinhamento" | "comFundo">,
  t: Transformacao,
): Texto {
  return { tipo: "texto", id: novoId("texto"), ...parte, t };
}
