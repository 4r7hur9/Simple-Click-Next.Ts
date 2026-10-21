/**
 * Bytes → texto, descobrindo a codificação (card #60).
 *
 * A planilha do pequeno negócio sai do Excel brasileiro em Windows-1252
 * ("latin1"), do Google Planilhas em UTF-8 e, no "Texto Unicode" do Excel, em
 * UTF-16 com marca. A ordem é: marca no começo do arquivo; senão, UTF-8 se os
 * bytes FECHAM como UTF-8 (o decodificador estrito recusa qualquer sequência
 * inválida, e um "ç" em Windows-1252 nunca é UTF-8 válido); senão, latin1 —
 * que aceita qualquer byte.
 */
import type { CodificacaoDaImportacao } from "@simpleclick/contracts";

export interface TextoDecodificado {
  readonly texto: string;
  readonly codificacao: CodificacaoDaImportacao;
}

function semMarca(texto: string): string {
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

export function decodificarTexto(
  bytes: Uint8Array,
  forcada?: CodificacaoDaImportacao,
): TextoDecodificado {
  const b0 = bytes[0];
  const b1 = bytes[1];
  const utf16 =
    (b0 === 0xff && b1 === 0xfe) || (b0 === 0xfe && b1 === 0xff)
      ? b0 === 0xff
        ? "utf-16le"
        : "utf-16be"
      : null;

  if (forcada === "latin1") {
    return {
      texto: new TextDecoder("windows-1252").decode(bytes),
      codificacao: "latin1",
    };
  }
  if (utf16 !== null && forcada !== "utf-8") {
    return {
      texto: semMarca(new TextDecoder(utf16).decode(bytes)),
      codificacao: "utf-16",
    };
  }
  if (forcada === "utf-16") {
    return {
      texto: semMarca(new TextDecoder("utf-16le").decode(bytes)),
      codificacao: "utf-16",
    };
  }
  if (forcada === "utf-8") {
    return {
      texto: semMarca(new TextDecoder("utf-8").decode(bytes)),
      codificacao: "utf-8",
    };
  }
  try {
    return {
      texto: semMarca(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      codificacao: "utf-8",
    };
  } catch {
    return {
      texto: new TextDecoder("windows-1252").decode(bytes),
      codificacao: "latin1",
    };
  }
}
