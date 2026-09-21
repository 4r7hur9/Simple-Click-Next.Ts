/**
 * Loader de imagens públicas do Next (AC-416).
 *
 * O arquivo original fica no Cloudinary, mas a vitrine nunca deve pedir esse
 * original ao celular. O Next informa a largura escolhida para o cartão e o
 * loader transforma a URL no CDN: formato, qualidade e largura são decididos
 * na borda, perto de quem está vendo a imagem.
 */
const HOSTE_DO_CLOUDINARY = "res.cloudinary.com";

export const TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES = 10 * 1024 * 1024;

export type FormatoDaImagem = "jpeg" | "png" | "gif" | "webp";

export interface ResultadoDaConferenciaDaImagem {
  readonly formato: FormatoDaImagem;
  readonly tamanhoBytes: number;
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

/** Confere o conteúdo do arquivo antes de criar uma URL de pré-visualização. */
export function conferirConteudoDaImagem(
  entrada: ArrayBuffer | Uint8Array,
): ResultadoDaConferenciaDaImagem {
  const bytes =
    entrada instanceof Uint8Array
      ? new Uint8Array(entrada.buffer, entrada.byteOffset, entrada.byteLength)
      : new Uint8Array(entrada);
  if (bytes.byteLength === 0)
    throw new Error("O arquivo de imagem está vazio.");
  if (bytes.byteLength > TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES) {
    throw new Error("A imagem excede o limite de 10 MB permitido.");
  }

  const formato: FormatoDaImagem | null = temAssinatura(
    bytes,
    [0xff, 0xd8, 0xff],
  )
    ? "jpeg"
    : temAssinatura(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      ? "png"
      : textoAscii(bytes, 0, 6) === "GIF87a" ||
          textoAscii(bytes, 0, 6) === "GIF89a"
        ? "gif"
        : textoAscii(bytes, 0, 4) === "RIFF" &&
            textoAscii(bytes, 8, 4) === "WEBP"
          ? "webp"
          : null;
  if (formato === null) {
    throw new Error(
      "O arquivo enviado não é uma imagem válida; a checagem considera o conteúdo, não a extensão.",
    );
  }
  return { formato, tamanhoBytes: bytes.byteLength };
}

export async function conferirArquivoDeImagem(
  arquivo: Blob,
): Promise<ResultadoDaConferenciaDaImagem> {
  return conferirConteudoDaImagem(await arquivo.arrayBuffer());
}

export interface OpcoesDaImagem {
  readonly src: string;
  readonly width: number;
  readonly quality?: number | undefined;
}

function qualidade(qualidadeSolicitada: number | undefined): string {
  if (qualidadeSolicitada === undefined) return "auto";
  const limitada = Math.min(100, Math.max(1, Math.round(qualidadeSolicitada)));
  return String(limitada);
}

/**
 * Gera uma URL Cloudinary limitada à largura que será exibida.
 *
 * URLs locais ou de outra origem são devolvidas intactas: o loader não pode
 * inventar uma transformação para um servidor que não conhece.
 */
export function urlDaImagemOtimizada({
  src,
  width,
  quality: qualidadeSolicitada,
}: OpcoesDaImagem): string {
  let endereco: URL;
  try {
    endereco = new URL(src);
  } catch {
    return src;
  }

  if (
    endereco.protocol !== "https:" ||
    endereco.hostname !== HOSTE_DO_CLOUDINARY
  ) {
    return src;
  }

  const partes = endereco.pathname.split("/");
  const indiceDoUpload = partes.indexOf("upload");
  if (indiceDoUpload === -1) return src;

  const largura = Math.max(1, Math.round(width));
  const transformacoes = [
    "f_auto",
    `q_${qualidade(qualidadeSolicitada)}`,
    `w_${largura}`,
    "c_limit",
  ];
  partes.splice(indiceDoUpload + 1, 0, transformacoes.join(","));
  endereco.pathname = partes.join("/");
  return endereco.toString();
}

/** Adaptador exigido pelo `images.loader = "custom"` do Next. */
export default function loaderDaImagem(opcoes: OpcoesDaImagem): string {
  return urlDaImagemOtimizada(opcoes);
}
