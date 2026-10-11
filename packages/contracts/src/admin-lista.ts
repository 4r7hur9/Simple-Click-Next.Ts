/**
 * Lista e busca de lojas da administração (AC-206): a consulta e a loja como
 * a lista a mostra, sem dado pessoal.
 */

import { z } from "zod";

import { esquemaDaSituacaoDaLoja } from "./admin-cadastro.ts";

/**
 * `GET /v1/admin/lojas?busca=&situacao=&pagina=&porPagina=`
 *
 * A busca é UM campo só, de propósito: quem atende o telefone tem na mão um
 * nome, um CNPJ ou um código de atendimento, e não deveria precisar saber em
 * qual caixinha cada um entra. A API descobre pelo formato.
 */
export const esquemaDaConsultaDeLojas = z.object({
  /** Parte do nome, do documento (com ou sem máscara) ou do código. */
  busca: z.string().trim().max(80).optional(),
  /** Sem filtro, a lista traz tudo que não foi excluído (AC-211). */
  situacao: esquemaDaSituacaoDaLoja.optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(25),
});

export type ConsultaDeLojasNoContrato = z.output<
  typeof esquemaDaConsultaDeLojas
>;

/** Uma loja como a lista da administração a mostra. Sem dado pessoal. */
export const esquemaDaLojaNaLista = z.strictObject({
  id: z.string(),
  codigo: z.string(),
  nome: z.string(),
  apelido: z.string(),
  tipoDeNegocio: z.strictObject({ codigo: z.string(), nome: z.string() }),
  status: esquemaDaSituacaoDaLoja,
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  /** Instante do cadastro, em ISO 8601. */
  criadaEm: z.string(),
});

export const esquemaDaListaDeLojas = z.strictObject({
  lojas: z.array(esquemaDaLojaNaLista),
  /** Quantas lojas casam com a consulta, contando as páginas seguintes. */
  total: z.number().int().min(0),
  pagina: z.number().int().min(1),
  porPagina: z.number().int().min(1),
});

export type LojaNaListaNoContrato = z.infer<typeof esquemaDaLojaNaLista>;
export type ListaDeLojasNoContrato = z.infer<typeof esquemaDaListaDeLojas>;
