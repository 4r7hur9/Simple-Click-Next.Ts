/**
 * Borda de validação das rotas da administração (P-007).
 *
 * Os corpos vêm do contrato (`@simpleclick/contracts`), que o formulário do
 * site também usa — a mesma regra nos dois lados. Aqui ficam as partes que só
 * a API tem: parâmetros de caminho e de consulta.
 */

import {
  esquemaDaConsultaDaAuditoria,
  esquemaDaConsultaDeLojas,
  esquemaDaEdicaoDaLoja,
  esquemaDaExclusaoDaLoja,
  esquemaDaNovaLoja,
  esquemaDaReativacaoDaLoja,
  esquemaDaSuspensaoDaLoja,
  esquemaDaTrocaDeApelido,
  esquemaDaTrocaDeTipoDeNegocio,
  esquemaDoEnvioDeDocumento,
} from "@simpleclick/contracts";
import { z } from "zod";

import { FORMATO_DO_LINK } from "./link-do-documento.ts";

/** Identificador de loja no caminho: uuid, e nada mais. */
export const esquemaDoCaminhoDaLoja = z.object({
  id: z.uuid("Loja inválida."),
});

/** POST /v1/admin/lojas */
export const esquemasDoCadastro = { body: esquemaDaNovaLoja };

/** GET /v1/admin/lojas?busca=&situacao=&pagina=&porPagina= */
export const esquemasDaListagem = { query: esquemaDaConsultaDeLojas };

/** GET /v1/admin/auditoria?loja=&ato=&de=&ate=&pagina=&porPagina= */
export const esquemasDaAuditoria = { query: esquemaDaConsultaDaAuditoria };

/** GET /v1/admin/lojas/:id */
export const esquemasDaFicha = { params: esquemaDoCaminhoDaLoja };

/** PATCH /v1/admin/lojas/:id */
export const esquemasDaEdicao = {
  params: esquemaDoCaminhoDaLoja,
  body: esquemaDaEdicaoDaLoja,
};

/** PUT /v1/admin/lojas/:id/tipo-de-negocio */
export const esquemasDaTrocaDeTipo = {
  params: esquemaDoCaminhoDaLoja,
  body: esquemaDaTrocaDeTipoDeNegocio,
};

/** PUT /v1/admin/lojas/:id/apelido */
export const esquemasDaTrocaDeApelido = {
  params: esquemaDoCaminhoDaLoja,
  body: esquemaDaTrocaDeApelido,
};

/** GET /v1/admin/lojas/:id/documentos */
export const esquemasDosDocumentos = { params: esquemaDoCaminhoDaLoja };

/**
 * POST /v1/admin/lojas/:id/documentos?tipo= — o corpo são os BYTES do
 * arquivo, lidos crus pela rota e conferidos pelo conteúdo (AC-204).
 */
export const esquemasDoEnvioDeDocumento = {
  params: esquemaDoCaminhoDaLoja,
  query: esquemaDoEnvioDeDocumento,
};

/** POST /v1/admin/lojas/:id/documentos/:documentoId/link */
export const esquemasDoLinkDoDocumento = {
  params: esquemaDoCaminhoDaLoja.extend({
    documentoId: z.uuid("Documento inválido."),
  }),
};

/** GET /v1/admin/arquivos/:link — o link assinado, e nada além. */
export const esquemasDoArquivo = {
  params: z.object({
    link: z.string().regex(FORMATO_DO_LINK, "Link inválido."),
  }),
};

/** PUT /v1/admin/lojas/:id/suspensao — com o motivo, que o dono vai ler. */
export const esquemasDaSuspensao = {
  params: esquemaDoCaminhoDaLoja,
  body: esquemaDaSuspensaoDaLoja,
};

/**
 * PUT /v1/admin/lojas/:id/reativacao e PUT /v1/admin/lojas/:id/restauracao —
 * corpo vazio: o ato é o endereço.
 */
export const esquemasDaReativacao = {
  params: esquemaDoCaminhoDaLoja,
  body: esquemaDaReativacaoDaLoja,
};

/** DELETE /v1/admin/lojas/:id — com o nome da loja digitado. */
export const esquemasDaExclusao = {
  params: esquemaDoCaminhoDaLoja,
  body: esquemaDaExclusaoDaLoja,
};
