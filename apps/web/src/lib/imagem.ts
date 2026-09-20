/**
 * Loader de imagens públicas do Next (AC-416).
 *
 * O arquivo original fica no Cloudinary, mas a vitrine nunca deve pedir esse
 * original ao celular. O Next informa a largura escolhida para o cartão e o
 * loader transforma a URL no CDN: formato, qualidade e largura são decididos
 * na borda, perto de quem está vendo a imagem.
 */
const HOSTE_DO_CLOUDINARY = "res.cloudinary.com";

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
