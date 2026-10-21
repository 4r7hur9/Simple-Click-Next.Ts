/**
 * Fotos do importador WinSIS (card #73): achar, conferir, medir e guardar.
 *
 * A conferência do conteúdo segue a do envio pelo painel
 * (`conferirConteudoDaImagem` em `apps/api/.../imagens.usecase.ts`, que este
 * pacote não pode importar): bytes de JPEG/PNG/GIF/WebP de verdade, até 10 MB.
 * O resumo SHA-256 do arquivo vai para `assets.sha256`: na reimportação, foto
 * com o mesmo resumo não é reenviada.
 *
 * A foto fica em `apps/web/public/demo/<loja>/`, fora do git, servida pelo
 * próprio site — como a carga de demonstração. Por isso o importador não roda
 * em produção (lá a foto teria de ir para o Cloudinary, pela API).
 */

import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";


export type FormatoDaImagem = "jpeg" | "png" | "gif" | "webp";

/** O mesmo teto do envio pelo painel. */
const TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES = 10 * 1024 * 1024;

export class ErroDeImagemInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeImagemInvalida";
  }
}

const ascii = (bytes: Uint8Array, inicio: number, tamanho: number): string =>
  String.fromCharCode(...bytes.slice(inicio, inicio + tamanho));

/** Confere os bytes reais; a extensão do arquivo não é prova. */
export function conferirConteudoDaImagem(bytes: Uint8Array): { readonly formato: FormatoDaImagem } {
  if (bytes.byteLength === 0) throw new ErroDeImagemInvalida("O arquivo de imagem está vazio.");
  if (bytes.byteLength > TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES) {
    throw new ErroDeImagemInvalida("A imagem excede o limite de 10 MB permitido.");
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { formato: "jpeg" };
  if (ascii(bytes, 0, 8) === "\x89PNG\r\n\x1a\n") return { formato: "png" };
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return { formato: "gif" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return { formato: "webp" };
  throw new ErroDeImagemInvalida("O arquivo não é uma imagem válida (a checagem olha o conteúdo, não a extensão).");
}

const EXTENSOES = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

/** Índice da pasta de fotos: nome sem extensão → arquivo. */
export async function indiceDeFotos(pasta: string): Promise<Map<string, string>> {
  const indice = new Map<string, string>();
  let nomes: string[];
  try {
    nomes = await readdir(pasta);
  } catch {
    return indice;
  }
  for (const nome of nomes.sort()) {
    const extensao = extname(nome).toLowerCase();
    if (!EXTENSOES.has(extensao)) continue;
    const base = nome.slice(0, -extensao.length);
    // .jpg vence .jpeg quando os dois existem (a ordem do sort põe .jpeg antes).
    if (!indice.has(base) || extensao === ".jpg") indice.set(base, join(pasta, nome));
  }
  return indice;
}

export interface FotoLida {
  readonly caminho: string;
  readonly bytes: Uint8Array;
  readonly formato: FormatoDaImagem;
  readonly sha256: string;
  readonly largura: number | null;
  readonly altura: number | null;
}

/** Lê e confere a foto; lança `ErroDeImagemInvalida` quando não é imagem. */
export async function lerFoto(caminho: string): Promise<FotoLida> {
  const bytes = new Uint8Array(await readFile(caminho));
  const { formato } = conferirConteudoDaImagem(bytes);
  const medidas = medidasDaImagem(bytes, formato);
  return {
    caminho,
    bytes,
    formato,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    largura: medidas?.largura ?? null,
    altura: medidas?.altura ?? null,
  };
}

/** Largura e altura lidas do cabeçalho (JPEG e PNG); nulo nos outros. */
export function medidasDaImagem(
  bytes: Uint8Array,
  formato: FormatoDaImagem,
): { readonly largura: number; readonly altura: number } | null {
  if (formato === "png" && bytes.length >= 24) {
    const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { largura: visao.getUint32(16), altura: visao.getUint32(20) };
  }
  if (formato !== "jpeg") return null;
  let posicao = 2;
  while (posicao + 9 < bytes.length) {
    if (bytes[posicao] !== 0xff) {
      posicao += 1;
      continue;
    }
    const marcador = bytes[posicao + 1]!;
    // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC): é ali que mora o tamanho.
    if (
      marcador >= 0xc0 &&
      marcador <= 0xcf &&
      marcador !== 0xc4 &&
      marcador !== 0xc8 &&
      marcador !== 0xcc
    ) {
      const altura = (bytes[posicao + 5]! << 8) | bytes[posicao + 6]!;
      const largura = (bytes[posicao + 7]! << 8) | bytes[posicao + 8]!;
      return largura > 0 && altura > 0 ? { largura, altura } : null;
    }
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      posicao += 2;
      continue;
    }
    const tamanho = (bytes[posicao + 2]! << 8) | bytes[posicao + 3]!;
    posicao += 2 + tamanho;
  }
  return null;
}

export interface FotoGuardada {
  readonly url: string;
  /** `assets.storage_key`: "demo/<loja>/<arquivo>". */
  readonly chave: string;
  readonly largura: number | null;
  readonly altura: number | null;
}

export interface DestinoDasFotos {
  guardar(foto: FotoLida, codigo: string): Promise<FotoGuardada>;
  /** Tira do disco a foto anterior. */
  descartar(chave: string): Promise<void>;
}

const PUBLICO_DO_SITE = fileURLToPath(new URL("../../../../apps/web/public/", import.meta.url));

const EXTENSAO_DO_FORMATO: Readonly<Record<FormatoDaImagem, string>> = {
  jpeg: "jpg",
  png: "png",
  gif: "gif",
  webp: "webp",
};

/**
 * No disco: `public/demo/<pasta>/<codigo>-<resumo>.jpg`. O resumo no nome faz
 * a foto nova ter endereço novo, e o navegador não fica com a antiga em cache.
 */
export function destinoNoDisco(pasta: string): DestinoDasFotos {
  const raiz = resolve(PUBLICO_DO_SITE, "demo", pasta);
  return {
    async guardar(foto, codigo) {
      await mkdir(raiz, { recursive: true });
      const arquivo = `${codigo}-${foto.sha256.slice(0, 12)}.${EXTENSAO_DO_FORMATO[foto.formato]}`;
      await copyFile(foto.caminho, join(raiz, arquivo));
      const chave = `demo/${pasta}/${arquivo}`;
      return { url: `/${chave}`, chave, largura: foto.largura, altura: foto.altura };
    },
    async descartar(chave) {
      if (!chave.startsWith(`demo/${pasta}/`)) return;
      await rm(resolve(PUBLICO_DO_SITE, chave), { force: true });
    },
  };
}

/** Roda `tarefa` sobre a lista com no máximo `limite` ao mesmo tempo. */
export async function emParalelo<T, R>(
  itens: readonly T[],
  limite: number,
  tarefa: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;
  const trabalhadores = Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, async () => {
    while (proximo < itens.length) {
      const indice = proximo++;
      resultados[indice] = await tarefa(itens[indice]!);
    }
  });
  await Promise.all(trabalhadores);
  return resultados;
}
