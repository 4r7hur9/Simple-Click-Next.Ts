/**
 * Contrato e documentos da loja, guardados pela administração (AC-203 a
 * AC-205).
 *
 * TRÊS REGRAS, nesta ordem, e cada uma existe por um modo de falha real:
 *
 * 1. O TIPO VEM DOS BYTES (AC-204). `contrato.pdf` que não começa com a
 *    assinatura de PDF é recusado antes de qualquer gravação — nem o
 *    armazenamento nem o banco chegam a ver o arquivo.
 * 2. O ARQUIVO NÃO TEM ENDEREÇO FIXO (AC-203, AC-205). A tela recebe um link
 *    gerado no clique, que vale cinco minutos, só para quem o pediu, e só com
 *    a sessão da administração.
 * 3. TODA ABERTURA VAI PARA A TRILHA. Documento de identidade aberto sem
 *    rastro é exatamente o vazamento que ninguém consegue investigar depois.
 *
 * O NOME DO ARQUIVO é metadado para a tela, e nada além: a chave do
 * armazenamento é gerada aqui, e a trilha não o guarda (ele pode carregar o
 * nome de uma pessoa — "RG-joana-almeida.pdf" — e a trilha não guarda dado
 * pessoal, P-009).
 */

import { createHash, randomUUID } from "node:crypto";

import {
  FORMATOS_POR_TIPO_DE_DOCUMENTO,
  LIMITE_DA_IMAGEM_EM_BYTES,
  LIMITE_DO_PDF_EM_BYTES,
  type DocumentoDaLojaNoContrato,
  type TipoDeDocumentoDaLoja,
} from "@simpleclick/contracts";

import type { ArmazenamentoPrivado } from "../../core/arquivo-privado.ts";
import {
  formatoPeloConteudo,
  TIPO_DE_CONTEUDO,
  type FormatoDeArquivo,
} from "./tipo-de-arquivo.ts";

// ---------------------------------------------------------------------------
// Conferência do arquivo
// ---------------------------------------------------------------------------

export type ConferenciaDoArquivo =
  | {
      readonly ok: true;
      readonly formato: FormatoDeArquivo;
      readonly tipoDeConteudo: string;
    }
  | {
      readonly ok: false;
      readonly motivo: "VAZIO" | "TIPO_NAO_PERMITIDO" | "GRANDE_DEMAIS";
      readonly mensagem: string;
    };

const NOMES_DOS_FORMATOS: Readonly<Record<FormatoDeArquivo, string>> = {
  PDF: "PDF",
  PNG: "imagem PNG",
  JPEG: "imagem JPEG",
};

/** "um PDF" ou "um PDF, imagem PNG ou imagem JPEG". */
function formatosAceitos(tipo: TipoDeDocumentoDaLoja): string {
  const nomes = FORMATOS_POR_TIPO_DE_DOCUMENTO[tipo].map(
    (formato) => NOMES_DOS_FORMATOS[formato],
  );
  return nomes.length === 1
    ? `um ${nomes[0] ?? ""}`
    : `um ${nomes.slice(0, -1).join(", ")} ou ${nomes.at(-1) ?? ""}`;
}

/** O limite de tamanho do formato, em bytes (ASM-202). */
export function limiteDoFormato(formato: FormatoDeArquivo): number {
  return formato === "PDF" ? LIMITE_DO_PDF_EM_BYTES : LIMITE_DA_IMAGEM_EM_BYTES;
}

/**
 * Confere o arquivo pelos BYTES, nunca pela extensão nem pelo tipo que o
 * navegador declarou (AC-204).
 */
export function conferirArquivo(
  tipo: TipoDeDocumentoDaLoja,
  bytes: Uint8Array,
): ConferenciaDoArquivo {
  if (bytes.length === 0) {
    return {
      ok: false,
      motivo: "VAZIO",
      mensagem: "O arquivo chegou vazio. Escolha o arquivo de novo.",
    };
  }
  const formato = formatoPeloConteudo(bytes);
  if (
    formato === null ||
    !FORMATOS_POR_TIPO_DE_DOCUMENTO[tipo].includes(formato)
  ) {
    return {
      ok: false,
      motivo: "TIPO_NAO_PERMITIDO",
      mensagem: `Tipo de arquivo não permitido: envie ${formatosAceitos(tipo)}. O conteúdo do arquivo é conferido, não só a extensão do nome.`,
    };
  }
  if (bytes.length > limiteDoFormato(formato)) {
    const megas = limiteDoFormato(formato) / (1024 * 1024);
    return {
      ok: false,
      motivo: "GRANDE_DEMAIS",
      mensagem: `O arquivo passa do limite de ${megas} MB para ${NOMES_DOS_FORMATOS[formato]}.`,
    };
  }
  return { ok: true, formato, tipoDeConteudo: TIPO_DE_CONTEUDO[formato] };
}

/**
 * O nome que veio do navegador, só para mostrar: sem caminho, sem caractere
 * de controle, com tamanho contido. Nunca vira caminho de nada.
 */
export function nomeParaMostrar(bruto: string | undefined): string {
  let decodificado = bruto ?? "";
  try {
    decodificado = decodeURIComponent(decodificado);
  } catch {
    // Nome mal codificado continua sendo só um nome: fica como veio.
  }
  const semCaminho = decodificado.split(/[\\/]/).at(-1) ?? "";
  // eslint-disable-next-line no-control-regex -- é exatamente o que sai daqui
  const limpo = semCaminho.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (limpo === "" ? "documento" : limpo).slice(0, 200);
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

/** O documento, do jeito que o banco o descreve. */
export interface DocumentoParaGravar {
  readonly lojaId: string;
  readonly tipo: TipoDeDocumentoDaLoja;
  readonly chave: string;
  readonly tipoDeConteudo: string;
  readonly tamanhoEmBytes: number;
  readonly resumo: Buffer;
  readonly nomeDoArquivo: string;
  readonly enviadoPor: string;
  /** O instante do envio, pelo relógio da API — o mesmo que a trilha usa. */
  readonly enviadoEm: Date;
}

/** O que o envio precisa do banco, dentro da transação da administração. */
export interface RepositorioDosDocumentos {
  lojaExiste(lojaId: string): Promise<boolean>;
  /** Grava o documento e a linha da trilha, e devolve como a tela o mostra. */
  gravarDocumento(
    documento: DocumentoParaGravar,
  ): Promise<DocumentoDaLojaNoContrato>;
}

export interface PedidoDeEnvio {
  readonly lojaId: string;
  readonly tipo: TipoDeDocumentoDaLoja;
  readonly nomeDoArquivo: string | undefined;
  readonly bytes: Uint8Array;
  readonly administradorId: string;
}

export type ResultadoDoEnvio =
  | { readonly ok: true; readonly documento: DocumentoDaLojaNoContrato }
  | { readonly ok: false; readonly motivo: "NAO_ENCONTRADA" }
  | Extract<ConferenciaDoArquivo, { readonly ok: false }>;

/**
 * Confere, guarda os bytes e registra.
 *
 * Os bytes vão ao armazenamento ANTES da linha do banco: a linha que aponta
 * para arquivo nenhum seria um documento que a ficha mostra e ninguém abre.
 * Se a gravação no banco falha depois, o arquivo guardado é apagado.
 */
export async function enviarDocumento(
  pedido: PedidoDeEnvio,
  dependencias: {
    readonly repositorio: RepositorioDosDocumentos;
    readonly armazenamento: ArmazenamentoPrivado;
    readonly agora: () => Date;
  },
): Promise<ResultadoDoEnvio> {
  const conferencia = conferirArquivo(pedido.tipo, pedido.bytes);
  if (!conferencia.ok) return conferencia;

  const { repositorio, armazenamento, agora } = dependencias;
  if (!(await repositorio.lojaExiste(pedido.lojaId))) {
    return { ok: false, motivo: "NAO_ENCONTRADA" };
  }

  const chave = `${pedido.lojaId}/${randomUUID()}`;
  await armazenamento.guardar(chave, {
    bytes: pedido.bytes,
    tipoDeConteudo: conferencia.tipoDeConteudo,
  });
  try {
    const documento = await repositorio.gravarDocumento({
      lojaId: pedido.lojaId,
      tipo: pedido.tipo,
      chave,
      tipoDeConteudo: conferencia.tipoDeConteudo,
      tamanhoEmBytes: pedido.bytes.length,
      resumo: createHash("sha256").update(pedido.bytes).digest(),
      nomeDoArquivo: nomeParaMostrar(pedido.nomeDoArquivo),
      enviadoPor: pedido.administradorId,
      enviadoEm: agora(),
    });
    return { ok: true, documento };
  } catch (causa) {
    await armazenamento.apagar(chave).catch(() => undefined);
    throw causa;
  }
}
