/**
 * Borda de validação das rotas da administração (P-007).
 *
 * Os corpos vêm do contrato (`@simpleclick/contracts`), que o formulário do
 * site também usa — a mesma regra nos dois lados. Aqui ficam as partes que só
 * a API tem: parâmetros de caminho e de consulta.
 */

import {
  esquemaDaConsultaDeLojas,
  esquemaDaEdicaoDaLoja,
  esquemaDaNovaLoja,
  esquemaDaTrocaDeTipoDeNegocio,
} from "@simpleclick/contracts";
import { z } from "zod";

/** Identificador de loja no caminho: uuid, e nada mais. */
export const esquemaDoCaminhoDaLoja = z.object({
  id: z.uuid("Loja inválida."),
});

/** POST /v1/admin/lojas */
export const esquemasDoCadastro = { body: esquemaDaNovaLoja };

/** GET /v1/admin/lojas?busca=&situacao=&pagina=&porPagina= */
export const esquemasDaListagem = { query: esquemaDaConsultaDeLojas };

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
