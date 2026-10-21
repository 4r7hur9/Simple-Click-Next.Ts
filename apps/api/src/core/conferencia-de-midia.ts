/**
 * O que é o arquivo, pelos BYTES (card #46): foto ou vídeo, formato, e — no
 * vídeo — a duração e o tamanho do quadro.
 *
 * O nome e o tipo declarados não provam nada: "video.mp4" pode ser qualquer
 * coisa. O que decide é a assinatura do arquivo:
 *
 *   jpeg  FF D8 FF                 png  89 50 4E 47 0D 0A 1A 0A
 *   webp  "RIFF" .... "WEBP"
 *   mp4   caixa "ftyp" com marca ISO (isom, mp41, mp42, avc1, dash…). A
 *         marca "qt  " (QuickTime .mov) e as de foto (heic) ficam de fora.
 *   webm  cabeçalho EBML (1A 45 DF A3) com DocType "webm".
 *
 * A DURAÇÃO vem de dentro do arquivo: no mp4, a caixa `mvhd` (escala de tempo
 * e duração); no webm, `Info/Duration` × `TimecodeScale`. Vídeo gravado no
 * navegador (MediaRecorder) costuma sair SEM duração no webm — aí a duração
 * fica nula e quem chama decide (a rota aceita a que o painel leu do
 * `<video>`).
 *
 * Mora em `core` porque o catálogo (vídeo do produto) e os stories usam a
 * mesma conferência.
 */

import {
  LIMITES_DE_MIDIA_PADRAO,
  type LimitesDeMidia,
  FORMATOS_DE_IMAGEM,
  FORMATOS_DE_VIDEO,
} from "@simpleclick/contracts";

export type FormatoDeFoto = "jpeg" | "png" | "webp";
export type FormatoDeVideo = "mp4" | "webm";

export type MidiaConferida =
  | {
      readonly tipo: "imagem";
      readonly formato: FormatoDeFoto;
      readonly tipoDeConteudo: string;
      readonly extensao: string;
    }
  | {
      readonly tipo: "video";
      readonly formato: FormatoDeVideo;
      readonly tipoDeConteudo: string;
      readonly extensao: string;
      readonly duracaoMs: number | null;
      readonly largura: number | null;
      readonly altura: number | null;
    };

function ascii(bytes: Uint8Array, inicio: number, tamanho: number): string {
  if (inicio < 0 || inicio + tamanho > bytes.length) return "";
  return String.fromCharCode(...bytes.subarray(inicio, inicio + tamanho));
}

function comeca(bytes: Uint8Array, assinatura: readonly number[]): boolean {
  return assinatura.every((valor, indice) => bytes[indice] === valor);
}

/** O formato da foto pela assinatura, ou nulo. */
export function formatoDaFoto(bytes: Uint8Array): FormatoDeFoto | null {
  if (comeca(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (comeca(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "webp";
  }
  return null;
}

// ---------------------------------------------------------------------------
// mp4 (ISO BMFF)
// ---------------------------------------------------------------------------

const MARCAS_DO_MP4 = new Set([
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "M4V ",
  "dash",
  "mmp4",
  "MSNV",
]);

interface Caixa {
  readonly tipo: string;
  /** Onde começa o conteúdo (depois do cabeçalho). */
  readonly conteudo: number;
  /** Onde a caixa termina. */
  readonly fim: number;
}

function lerU32(visao: DataView, posicao: number): number {
  return visao.getUint32(posicao);
}

/** As caixas filhas dentro de [inicio, fim). */
function caixas(visao: DataView, inicio: number, fim: number): Caixa[] {
  const lista: Caixa[] = [];
  let posicao = inicio;
  while (posicao + 8 <= fim) {
    let tamanho = lerU32(visao, posicao);
    const tipo = String.fromCharCode(
      visao.getUint8(posicao + 4),
      visao.getUint8(posicao + 5),
      visao.getUint8(posicao + 6),
      visao.getUint8(posicao + 7),
    );
    let cabecalho = 8;
    if (tamanho === 1) {
      if (posicao + 16 > fim) break;
      tamanho = Number(visao.getBigUint64(posicao + 8));
      cabecalho = 16;
    } else if (tamanho === 0) {
      tamanho = fim - posicao;
    }
    if (tamanho < cabecalho || posicao + tamanho > fim) break;
    lista.push({ tipo, conteudo: posicao + cabecalho, fim: posicao + tamanho });
    posicao += tamanho;
  }
  return lista;
}

function ehMp4(bytes: Uint8Array): boolean {
  if (ascii(bytes, 4, 4) !== "ftyp") return false;
  const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tamanho = Math.min(lerU32(visao, 0), bytes.length);
  const principal = ascii(bytes, 8, 4);
  if (principal === "qt  ") return false;
  if (MARCAS_DO_MP4.has(principal)) return true;
  for (let posicao = 16; posicao + 4 <= tamanho; posicao += 4) {
    if (MARCAS_DO_MP4.has(ascii(bytes, posicao, 4))) return true;
  }
  return false;
}

function medidasDoMp4(bytes: Uint8Array): {
  duracaoMs: number | null;
  largura: number | null;
  altura: number | null;
} {
  const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let duracaoMs: number | null = null;
  let largura: number | null = null;
  let altura: number | null = null;
  try {
    const moov = caixas(visao, 0, bytes.length).find((c) => c.tipo === "moov");
    if (moov === undefined) return { duracaoMs, largura, altura };
    const filhas = caixas(visao, moov.conteudo, moov.fim);
    const mvhd = filhas.find((c) => c.tipo === "mvhd");
    if (mvhd !== undefined) {
      const versao = visao.getUint8(mvhd.conteudo);
      const escala =
        versao === 1
          ? lerU32(visao, mvhd.conteudo + 20)
          : lerU32(visao, mvhd.conteudo + 12);
      const duracao =
        versao === 1
          ? Number(visao.getBigUint64(mvhd.conteudo + 24))
          : lerU32(visao, mvhd.conteudo + 16);
      if (escala > 0 && duracao > 0 && duracao !== 0xffffffff) {
        duracaoMs = Math.round((duracao / escala) * 1000);
      }
    }
    for (const trak of filhas.filter((c) => c.tipo === "trak")) {
      const tkhd = caixas(visao, trak.conteudo, trak.fim).find(
        (c) => c.tipo === "tkhd",
      );
      if (tkhd === undefined) continue;
      const versao = visao.getUint8(tkhd.conteudo);
      const deslocamento = tkhd.conteudo + (versao === 1 ? 88 : 76);
      if (deslocamento + 8 > tkhd.fim) continue;
      const w = lerU32(visao, deslocamento) >>> 16;
      const h = lerU32(visao, deslocamento + 4) >>> 16;
      if (w > 0 && h > 0) {
        largura = w;
        altura = h;
        break;
      }
    }
  } catch {
    // Arquivo truncado: o que não deu para ler fica nulo.
  }
  return { duracaoMs, largura, altura };
}

// ---------------------------------------------------------------------------
// webm (EBML / Matroska)
// ---------------------------------------------------------------------------

const EBML = 0x1a45dfa3;
const DOCTYPE = 0x4282;
const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const TIMECODE_SCALE = 0x2ad7b1;
const DURATION = 0x4489;
const TRACKS = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const VIDEO = 0xe0;
const PIXEL_WIDTH = 0xb0;
const PIXEL_HEIGHT = 0xba;
const CLUSTER = 0x1f43b675;

interface Elemento {
  readonly id: number;
  readonly conteudo: number;
  /** Fim do elemento; tamanho desconhecido vai até o fim do pai. */
  readonly fim: number;
}

function lerVint(
  bytes: Uint8Array,
  posicao: number,
  manterMarcador: boolean,
): { valor: number; tamanho: number; desconhecido: boolean } | null {
  const primeiro = bytes[posicao];
  if (primeiro === undefined || primeiro === 0) return null;
  let tamanho = 1;
  while (tamanho <= 8 && (primeiro & (0x80 >> (tamanho - 1))) === 0) tamanho++;
  if (tamanho > 8 || posicao + tamanho > bytes.length) return null;
  let valor = manterMarcador ? primeiro : primeiro & (0xff >> tamanho);
  let todosUm = valor === 0xff >> tamanho;
  for (let i = 1; i < tamanho; i++) {
    const byte = bytes[posicao + i] ?? 0;
    valor = valor * 256 + byte;
    if (byte !== 0xff) todosUm = false;
  }
  return { valor, tamanho, desconhecido: !manterMarcador && todosUm };
}

function elementos(bytes: Uint8Array, inicio: number, fim: number): Elemento[] {
  const lista: Elemento[] = [];
  let posicao = inicio;
  while (posicao < fim && lista.length < 10_000) {
    const id = lerVint(bytes, posicao, true);
    if (id === null) break;
    const tamanho = lerVint(bytes, posicao + id.tamanho, false);
    if (tamanho === null) break;
    const conteudo = posicao + id.tamanho + tamanho.tamanho;
    const fimDoElemento = tamanho.desconhecido
      ? fim
      : Math.min(conteudo + tamanho.valor, fim);
    lista.push({ id: id.valor, conteudo, fim: fimDoElemento });
    // O primeiro cluster já é o vídeo: o que interessa vem antes dele.
    if (id.valor === CLUSTER || tamanho.desconhecido) break;
    posicao = fimDoElemento;
  }
  return lista;
}

function inteiro(bytes: Uint8Array, elemento: Elemento): number {
  let valor = 0;
  for (let i = elemento.conteudo; i < elemento.fim; i++) {
    valor = valor * 256 + (bytes[i] ?? 0);
  }
  return valor;
}

function decimal(bytes: Uint8Array, elemento: Elemento): number | null {
  const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tamanho = elemento.fim - elemento.conteudo;
  if (tamanho === 4) return visao.getFloat32(elemento.conteudo);
  if (tamanho === 8) return visao.getFloat64(elemento.conteudo);
  return null;
}

function ehWebm(bytes: Uint8Array): boolean {
  const [cabecalho] = elementos(bytes, 0, Math.min(bytes.length, 4_096));
  if (cabecalho?.id !== EBML) return false;
  const tipo = elementos(bytes, cabecalho.conteudo, cabecalho.fim).find(
    (e) => e.id === DOCTYPE,
  );
  return (
    tipo !== undefined &&
    ascii(bytes, tipo.conteudo, tipo.fim - tipo.conteudo).replace(/\0+$/, "") ===
      "webm"
  );
}

/** Largura e altura da trilha de vídeo, ou nulo se a trilha não é vídeo. */
function quadroDaTrilha(
  bytes: Uint8Array,
  entrada: Elemento,
): { largura: number; altura: number } | null {
  const video = elementos(bytes, entrada.conteudo, entrada.fim).find(
    (e) => e.id === VIDEO,
  );
  if (video === undefined) return null;
  const campos = elementos(bytes, video.conteudo, video.fim);
  const w = campos.find((e) => e.id === PIXEL_WIDTH);
  const h = campos.find((e) => e.id === PIXEL_HEIGHT);
  return w === undefined || h === undefined
    ? null
    : { largura: inteiro(bytes, w), altura: inteiro(bytes, h) };
}

function medidasDoWebm(bytes: Uint8Array): {
  duracaoMs: number | null;
  largura: number | null;
  altura: number | null;
} {
  let duracaoMs: number | null = null;
  let largura: number | null = null;
  let altura: number | null = null;
  try {
    const segmento = elementos(bytes, 0, bytes.length).find(
      (e) => e.id === SEGMENT,
    );
    if (segmento === undefined) return { duracaoMs, largura, altura };
    // Dentro do segmento o tamanho desconhecido aparece só no cluster.
    const filhos: Elemento[] = [];
    let posicao = segmento.conteudo;
    while (posicao < segmento.fim && filhos.length < 1_000) {
      const [proximo] = elementos(bytes, posicao, segmento.fim);
      if (proximo === undefined || proximo.id === CLUSTER) break;
      filhos.push(proximo);
      if (proximo.fim <= posicao) break;
      posicao = proximo.fim;
    }
    const info = filhos.find((e) => e.id === INFO);
    if (info !== undefined) {
      const campos = elementos(bytes, info.conteudo, info.fim);
      const escalaElemento = campos.find((e) => e.id === TIMECODE_SCALE);
      const escala =
        escalaElemento === undefined ? 1_000_000 : inteiro(bytes, escalaElemento);
      const duracaoElemento = campos.find((e) => e.id === DURATION);
      const duracao =
        duracaoElemento === undefined ? null : decimal(bytes, duracaoElemento);
      if (duracao !== null && Number.isFinite(duracao) && duracao > 0) {
        duracaoMs = Math.round((duracao * escala) / 1_000_000);
      }
    }
    const trilhas = filhos.find((e) => e.id === TRACKS);
    const quadro =
      trilhas === undefined
        ? null
        : elementos(bytes, trilhas.conteudo, trilhas.fim)
            .filter((entrada) => entrada.id === TRACK_ENTRY)
            .map((entrada) => quadroDaTrilha(bytes, entrada))
            .find((medida) => medida !== null);
    if (quadro) ({ largura, altura } = quadro);
  } catch {
    // Arquivo truncado: o que não deu para ler fica nulo.
  }
  return { duracaoMs, largura, altura };
}

// ---------------------------------------------------------------------------
// A conferência
// ---------------------------------------------------------------------------

/** O que o arquivo é de verdade, ou nulo se não é foto nem vídeo aceito. */
export function conferirMidia(bytes: Uint8Array): MidiaConferida | null {
  const foto = formatoDaFoto(bytes);
  if (foto !== null) {
    return {
      tipo: "imagem",
      formato: foto,
      tipoDeConteudo: `image/${foto}`,
      extensao: foto === "jpeg" ? "jpg" : foto,
    };
  }
  if (ehMp4(bytes)) {
    return {
      tipo: "video",
      formato: "mp4",
      tipoDeConteudo: "video/mp4",
      extensao: "mp4",
      ...medidasDoMp4(bytes),
    };
  }
  if (ehWebm(bytes)) {
    return {
      tipo: "video",
      formato: "webm",
      tipoDeConteudo: "video/webm",
      extensao: "webm",
      ...medidasDoWebm(bytes),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Limites (do ambiente, com os padrões do contrato)
// ---------------------------------------------------------------------------

export interface LimitesDeMidiaDaApi extends LimitesDeMidia {
  readonly limpezaDosStoriesMinutos: number;
}

function numeroDoAmbiente(
  valor: string | undefined,
  padrao: number,
  minimo = 0,
): number {
  const numero = Number(valor);
  return valor === undefined || valor.trim() === "" || !Number.isFinite(numero)
    ? padrao
    : Math.max(minimo, numero);
}

/** Os limites que valem neste processo. */
export function limitesDeMidiaDoAmbiente(
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): LimitesDeMidiaDaApi {
  const megabyte = 1024 * 1024;
  const padrao = LIMITES_DE_MIDIA_PADRAO;
  return {
    videoTamanhoMaximoBytes: Math.round(
      numeroDoAmbiente(
        fonte["MIDIA_VIDEO_MAX_MB"],
        padrao.videoTamanhoMaximoBytes / megabyte,
        1,
      ) * megabyte,
    ),
    videoDuracaoMaximaSegundos: Math.round(
      numeroDoAmbiente(
        fonte["MIDIA_VIDEO_MAX_SEGUNDOS"],
        padrao.videoDuracaoMaximaSegundos,
        1,
      ),
    ),
    videosPorProduto: Math.round(
      numeroDoAmbiente(fonte["MIDIA_VIDEOS_POR_PRODUTO"], padrao.videosPorProduto),
    ),
    imagemDoStoryTamanhoMaximoBytes: Math.round(
      numeroDoAmbiente(
        fonte["STORIES_IMAGEM_MAX_MB"],
        padrao.imagemDoStoryTamanhoMaximoBytes / megabyte,
        1,
      ) * megabyte,
    ),
    duracaoDoStoryHoras: padrao.duracaoDoStoryHoras,
    formatosDeVideo: [...FORMATOS_DE_VIDEO],
    formatosDeImagem: [...FORMATOS_DE_IMAGEM],
    limpezaDosStoriesMinutos: numeroDoAmbiente(
      fonte["STORIES_LIMPEZA_MINUTOS"],
      padrao.limpezaDosStoriesMinutos,
    ),
  };
}

/** Tamanho legível: 52428800 → "50 MB". */
export function tamanhoLegivel(bytes: number): string {
  const megas = bytes / (1024 * 1024);
  return `${Number.isInteger(megas) ? megas : megas.toFixed(1)} MB`;
}

/**
 * A duração que vale para o vídeo: a lida do arquivo, ou a declarada pelo
 * painel quando o arquivo não diz. Nula quando nenhuma das duas existe.
 */
export function duracaoDoVideoMs(
  lida: number | null,
  declaradaSegundos: number | undefined,
): number | null {
  if (lida !== null) return lida;
  return declaradaSegundos === undefined
    ? null
    : Math.round(declaradaSegundos * 1000);
}
