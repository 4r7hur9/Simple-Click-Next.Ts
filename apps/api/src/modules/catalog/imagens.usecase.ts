import { randomUUID } from "node:crypto";

export const LIMITE_DE_IMAGENS_POR_PRODUTO = 5;
export const TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES = 10 * 1024 * 1024;

export type FormatoDaImagem = "jpeg" | "png" | "gif" | "webp";

export interface ImagemDoCatalogo {
  readonly id: string;
  readonly url: string;
  readonly altText: string | null;
  readonly principal: boolean;
  readonly ordem: number;
}

export interface EntradaDeImagem {
  readonly id?: string;
  readonly url: string;
  readonly altText?: string | null;
  readonly principal?: boolean;
}

export interface ResultadoDaConferenciaDaImagem {
  readonly formato: FormatoDaImagem;
  readonly tamanhoBytes: number;
}

export class ErroDeImagemInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeImagemInvalida";
  }
}

function bytesDaEntrada(entrada: ArrayBuffer | Uint8Array): Uint8Array {
  return entrada instanceof Uint8Array
    ? new Uint8Array(entrada.buffer, entrada.byteOffset, entrada.byteLength)
    : new Uint8Array(entrada);
}

function textoAscii(
  bytes: Uint8Array,
  inicio: number,
  tamanho: number,
): string {
  return String.fromCharCode(...bytes.slice(inicio, inicio + tamanho));
}

function temAssinatura(
  bytes: Uint8Array,
  assinatura: readonly number[],
  inicio = 0,
): boolean {
  return assinatura.every((valor, indice) => bytes[inicio + indice] === valor);
}

function formatoPelosBytes(bytes: Uint8Array): FormatoDaImagem | null {
  if (temAssinatura(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (temAssinatura(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (
    textoAscii(bytes, 0, 6) === "GIF87a" ||
    textoAscii(bytes, 0, 6) === "GIF89a"
  ) {
    return "gif";
  }
  if (
    textoAscii(bytes, 0, 4) === "RIFF" &&
    textoAscii(bytes, 8, 4) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/** Confere os bytes reais; nome/extensão e MIME declarado não são a prova. */
export function conferirConteudoDaImagem(
  entrada: ArrayBuffer | Uint8Array,
): ResultadoDaConferenciaDaImagem {
  const bytes = bytesDaEntrada(entrada);
  if (bytes.byteLength === 0) {
    throw new ErroDeImagemInvalida("O arquivo de imagem está vazio.");
  }
  if (bytes.byteLength > TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES) {
    throw new ErroDeImagemInvalida(
      "A imagem excede o limite de 10 MB permitido.",
    );
  }

  const formato = formatoPelosBytes(bytes);
  if (formato === null) {
    throw new ErroDeImagemInvalida(
      "O arquivo enviado não é uma imagem válida; a checagem considera o conteúdo, não a extensão.",
    );
  }
  return { formato, tamanhoBytes: bytes.byteLength };
}

function urlHttps(url: string): string {
  const normalizada = url.trim();
  try {
    if (new URL(normalizada).protocol !== "https:") throw new Error();
  } catch {
    throw new Error("A imagem precisa usar uma URL HTTPS válida.");
  }
  return normalizada;
}

function umaPrincipal(imagens: readonly ImagemDoCatalogo[]): void {
  if (imagens.filter((imagem) => imagem.principal).length !== 1) {
    throw new Error("O produto precisa ter exatamente uma imagem principal.");
  }
}

/** Acrescenta uma imagem e desmarca a principal anterior de forma atômica. */
export function adicionarImagem(
  imagens: readonly ImagemDoCatalogo[],
  entrada: EntradaDeImagem,
): readonly ImagemDoCatalogo[] {
  if (imagens.length >= LIMITE_DE_IMAGENS_POR_PRODUTO) {
    throw new Error("O produto pode ter no máximo cinco imagens.");
  }

  const deveSerPrincipal = entrada.principal === true || imagens.length === 0;
  const novaImagem: ImagemDoCatalogo = {
    id: entrada.id ?? randomUUID(),
    url: urlHttps(entrada.url),
    altText: entrada.altText?.trim() || null,
    principal: deveSerPrincipal,
    ordem:
      imagens.reduce((maior, imagem) => Math.max(maior, imagem.ordem), -1) + 1,
  };
  const atualizadas = imagens.map((imagem) =>
    deveSerPrincipal ? { ...imagem, principal: false } : { ...imagem },
  );
  atualizadas.push(novaImagem);
  umaPrincipal(atualizadas);
  return atualizadas;
}

/** Troca a imagem principal sem permitir que o produto fique sem uma. */
export function definirImagemPrincipal(
  imagens: readonly ImagemDoCatalogo[],
  imagemId: string,
): readonly ImagemDoCatalogo[] {
  if (!imagens.some((imagem) => imagem.id === imagemId)) {
    throw new Error("A imagem não pertence ao produto.");
  }
  const atualizadas = imagens.map((imagem) => ({
    ...imagem,
    principal: imagem.id === imagemId,
  }));
  umaPrincipal(atualizadas);
  return atualizadas;
}

/** Remove uma imagem e promove a primeira restante quando necessário. */
export function removerImagem(
  imagens: readonly ImagemDoCatalogo[],
  imagemId: string,
): readonly ImagemDoCatalogo[] {
  const removida = imagens.find((imagem) => imagem.id === imagemId);
  if (removida === undefined)
    throw new Error("A imagem não pertence ao produto.");

  const restantes = imagens.filter((imagem) => imagem.id !== imagemId);
  if (restantes.length === 0) return restantes;
  if (restantes.some((imagem) => imagem.principal)) return restantes;
  const primeira = restantes[0];
  if (primeira === undefined) return restantes;
  return definirImagemPrincipal(restantes, primeira.id);
}
