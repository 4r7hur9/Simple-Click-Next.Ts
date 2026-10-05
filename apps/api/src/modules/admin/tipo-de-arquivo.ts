/**
 * O tipo de um arquivo, lido dos BYTES (AC-204).
 *
 * A extensão é o nome que a pessoa deu, e o tipo que o navegador declara é o
 * que o sistema dela adivinhou pela extensão. Nenhum dos dois é prova de nada:
 * `contrato.pdf` pode ser uma página HTML, um executável ou uma imagem
 * renomeada. O que decide é a assinatura no começo do arquivo — os mesmos
 * bytes que o leitor de PDF confere antes de abrir.
 */

export type FormatoDeArquivo = "PDF" | "PNG" | "JPEG";

/** O tipo de conteúdo que o arquivo sai com, quando entregue. */
export const TIPO_DE_CONTEUDO: Readonly<Record<FormatoDeArquivo, string>> = {
  PDF: "application/pdf",
  PNG: "image/png",
  JPEG: "image/jpeg",
};

/** `%PDF-` */
const ASSINATURA_DO_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const ASSINATURA_DO_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ASSINATURA_DO_JPEG = [0xff, 0xd8, 0xff];

function comecaCom(bytes: Uint8Array, assinatura: readonly number[]): boolean {
  return (
    bytes.length >= assinatura.length &&
    assinatura.every((byte, indice) => bytes[indice] === byte)
  );
}

/**
 * O formato pelo conteúdo, ou `null` quando não é nenhum dos aceitos.
 *
 * A assinatura é exigida no byte ZERO, sem tolerância a lixo antes dela: um
 * arquivo que precisa de tolerância para ser reconhecido é exatamente o tipo
 * de arquivo que não deveria ser aceito como documento de loja.
 */
export function formatoPeloConteudo(
  bytes: Uint8Array,
): FormatoDeArquivo | null {
  if (comecaCom(bytes, ASSINATURA_DO_PDF)) return "PDF";
  if (comecaCom(bytes, ASSINATURA_DO_PNG)) return "PNG";
  if (comecaCom(bytes, ASSINATURA_DO_JPEG)) return "JPEG";
  return null;
}
