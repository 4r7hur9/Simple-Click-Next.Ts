/**
 * Contrato e documentos que a administração guarda de cada loja (AC-203,
 * AC-204, AC-205): tipos, formatos aceitos, limites e o link temporário.
 */

import { z } from "zod";

/** Os documentos que a administração guarda de cada loja. */
export const TIPOS_DE_DOCUMENTO = [
  "CONTRATO",
  "DOCUMENTO_DO_RESPONSAVEL",
  "COMPROVANTE_DE_ENDERECO",
] as const;

export type TipoDeDocumentoDaLoja = (typeof TIPOS_DE_DOCUMENTO)[number];

export const ROTULOS_DOS_TIPOS_DE_DOCUMENTO: Readonly<
  Record<TipoDeDocumentoDaLoja, string>
> = {
  CONTRATO: "Contrato assinado",
  DOCUMENTO_DO_RESPONSAVEL: "Documento do responsável",
  COMPROVANTE_DE_ENDERECO: "Comprovante de endereço",
};

/** Quais formatos cada documento aceita. O contrato é sempre PDF. */
export const FORMATOS_POR_TIPO_DE_DOCUMENTO: Readonly<
  Record<TipoDeDocumentoDaLoja, readonly ("PDF" | "PNG" | "JPEG")[]>
> = {
  CONTRATO: ["PDF"],
  DOCUMENTO_DO_RESPONSAVEL: ["PDF", "PNG", "JPEG"],
  COMPROVANTE_DE_ENDERECO: ["PDF", "PNG", "JPEG"],
};

/**
 * Limites de tamanho (ASM-202): 10 MB por PDF, 5 MB por imagem de documento.
 * Em bytes, porque é assim que o servidor e a tela os comparam.
 */
export const LIMITE_DO_PDF_EM_BYTES = 10 * 1024 * 1024;
export const LIMITE_DA_IMAGEM_EM_BYTES = 5 * 1024 * 1024;

/** `POST /v1/admin/lojas/:id/documentos?tipo=` — o corpo são os bytes. */
export const esquemaDoEnvioDeDocumento = z.object({
  tipo: z.enum(TIPOS_DE_DOCUMENTO, "Escolha o tipo do documento."),
});

/** Um documento como a ficha o mostra: nome, tamanho, data e quem enviou. */
export const esquemaDoDocumentoDaLoja = z.strictObject({
  id: z.string(),
  tipo: z.enum(TIPOS_DE_DOCUMENTO),
  nomeDoArquivo: z.string(),
  tamanhoEmBytes: z.number().int().positive(),
  tipoDeConteudo: z.string(),
  /** Instante do envio, em ISO 8601. */
  enviadoEm: z.string(),
  enviadoPor: z.strictObject({ id: z.string(), nome: z.string() }).nullable(),
});

export const esquemaDosDocumentosDaLoja = z.strictObject({
  documentos: z.array(esquemaDoDocumentoDaLoja),
});

/**
 * O link temporário de um documento, gerado no clique (AC-203). Ele só abre
 * com a sessão da administração e deixa de funcionar no prazo (AC-205).
 */
export const esquemaDoLinkDoDocumento = z.strictObject({
  link: z.string(),
  expiraEm: z.string(),
});

export type DocumentoDaLojaNoContrato = z.infer<
  typeof esquemaDoDocumentoDaLoja
>;
