/**
 * Persistência do contrato e dos documentos da loja (AC-203 a AC-205).
 *
 * Tudo aqui roda na transação da administração (`sc_admin`): a tabela
 * `store_contracts` não tem política nem privilégio para a credencial das
 * lojas (migração 0033). Os bytes não moram aqui — moram no armazenamento
 * privado; aqui fica o que os descreve.
 */

import type {
  DocumentoDaLojaNoContrato,
  TipoDeDocumentoDaLoja,
} from "@simpleclick/contracts";

import { transacaoAtual } from "../../core/db.ts";
import type {
  DocumentoParaGravar,
  RepositorioDosDocumentos,
} from "./contratos.usecase.ts";
import { registrarNaTrilha } from "./lojas.repo.ts";

/** O tipo na língua da tela ↔ o tipo como o banco o guarda. */
const TIPO_NO_BANCO: Readonly<Record<TipoDeDocumentoDaLoja, string>> = {
  CONTRATO: "CONTRACT",
  DOCUMENTO_DO_RESPONSAVEL: "ID_DOC",
  COMPROVANTE_DE_ENDERECO: "ADDRESS_PROOF",
};

function tipoDaTela(noBanco: string): TipoDeDocumentoDaLoja {
  const achado = (
    Object.entries(TIPO_NO_BANCO) as [TipoDeDocumentoDaLoja, string][]
  ).find(([, valor]) => valor === noBanco);
  if (achado === undefined) {
    throw new Error(`tipo de documento desconhecido no banco: ${noBanco}`);
  }
  return achado[0];
}

interface LinhaDoDocumento {
  readonly id: string;
  readonly kind: string;
  readonly original_filename: string | null;
  readonly byte_size: bigint;
  readonly mime_type: string;
  readonly created_at: Date;
  readonly uploaded_by: string;
  readonly display_name: string | null;
}

function documentoDaLinha(linha: LinhaDoDocumento): DocumentoDaLojaNoContrato {
  return {
    id: linha.id,
    tipo: tipoDaTela(linha.kind),
    nomeDoArquivo: linha.original_filename ?? "documento",
    tamanhoEmBytes: Number(linha.byte_size),
    tipoDeConteudo: linha.mime_type,
    enviadoEm: linha.created_at.toISOString(),
    enviadoPor: {
      id: linha.uploaded_by,
      nome: linha.display_name ?? "Pessoa sem nome",
    },
  };
}

/** Os documentos da loja, do mais novo para o mais antigo. */
export async function listarDocumentos(
  lojaId: string,
): Promise<DocumentoDaLojaNoContrato[]> {
  const linhas = await transacaoAtual().$queryRaw<LinhaDoDocumento[]>`
    SELECT c.id::text AS id, c.kind, c.original_filename, c.byte_size,
           c.mime_type, c.created_at, c.uploaded_by::text AS uploaded_by,
           i.display_name
      FROM app.store_contracts c
      LEFT JOIN app.identities i ON i.id = c.uploaded_by
     WHERE c.store_id = ${lojaId}::uuid
     ORDER BY c.created_at DESC, c.id DESC`;
  return linhas.map(documentoDaLinha);
}

/** O que a entrega do arquivo precisa saber do documento. */
export interface DocumentoGuardado {
  readonly id: string;
  readonly tipo: TipoDeDocumentoDaLoja;
  readonly chave: string;
  readonly tipoDeConteudo: string;
  readonly nomeDoArquivo: string;
}

/** Um documento DESTA loja, ou `null`. */
export async function lerDocumento(
  lojaId: string,
  documentoId: string,
): Promise<DocumentoGuardado | null> {
  const linhas = await transacaoAtual().$queryRaw<
    {
      id: string;
      kind: string;
      storage_key: string;
      mime_type: string;
      original_filename: string | null;
    }[]
  >`
    SELECT id::text AS id, kind, storage_key, mime_type, original_filename
      FROM app.store_contracts
     WHERE id = ${documentoId}::uuid AND store_id = ${lojaId}::uuid`;
  const linha = linhas[0];
  if (linha === undefined) return null;
  return {
    id: linha.id,
    tipo: tipoDaTela(linha.kind),
    chave: linha.storage_key,
    tipoDeConteudo: linha.mime_type,
    nomeDoArquivo: linha.original_filename ?? "documento",
  };
}

/** Registra que a administração abriu o documento: quem, qual e quando. */
export async function registrarAberturaDoDocumento(abertura: {
  readonly lojaId: string;
  readonly atorId: string;
  readonly documento: DocumentoGuardado;
}): Promise<void> {
  await registrarNaTrilha({
    lojaId: abertura.lojaId,
    atorId: abertura.atorId,
    acao: "DOCUMENTO_BAIXADO",
    entidade: "store_contracts",
    entidadeId: abertura.documento.id,
    depois: { campos: { tipo: abertura.documento.tipo } },
  });
}

async function lojaExiste(lojaId: string): Promise<boolean> {
  const linhas = await transacaoAtual().$queryRaw<{ existe: boolean }[]>`
    SELECT true AS existe FROM app.stores WHERE id = ${lojaId}::uuid`;
  return linhas.length === 1;
}

async function gravarDocumento(
  documento: DocumentoParaGravar,
): Promise<DocumentoDaLojaNoContrato> {
  const tx = transacaoAtual();
  const linhas = await tx.$queryRaw<LinhaDoDocumento[]>`
    WITH gravado AS (
      INSERT INTO app.store_contracts
        (store_id, kind, storage_key, mime_type, byte_size, sha256,
         original_filename, uploaded_by, created_at)
      VALUES (${documento.lojaId}::uuid, ${TIPO_NO_BANCO[documento.tipo]},
              ${documento.chave}, ${documento.tipoDeConteudo},
              ${documento.tamanhoEmBytes}, ${documento.resumo},
              ${documento.nomeDoArquivo}, ${documento.enviadoPor}::uuid,
              ${documento.enviadoEm})
      RETURNING *
    )
    SELECT g.id::text AS id, g.kind, g.original_filename, g.byte_size,
           g.mime_type, g.created_at, g.uploaded_by::text AS uploaded_by,
           i.display_name
      FROM gravado g
      LEFT JOIN app.identities i ON i.id = g.uploaded_by`;
  const linha = linhas[0];
  if (linha === undefined) throw new Error("documento não gravado");

  // A trilha diz O QUE entrou, e não o nome do arquivo: o nome pode carregar
  // o nome de uma pessoa, e a trilha não guarda dado pessoal (P-009).
  await registrarNaTrilha(
    {
      lojaId: documento.lojaId,
      atorId: documento.enviadoPor,
      acao: "DOCUMENTO_ENVIADO",
      entidade: "store_contracts",
      entidadeId: linha.id,
      depois: {
        campos: {
          tipo: documento.tipo,
          tipoDeConteudo: documento.tipoDeConteudo,
          tamanhoEmBytes: documento.tamanhoEmBytes,
        },
      },
    },
    tx,
  );
  return documentoDaLinha(linha);
}

/** O repositório do envio, sobre a transação em curso. */
export function repositorioDosDocumentos(): RepositorioDosDocumentos {
  return { lojaExiste, gravarDocumento };
}
