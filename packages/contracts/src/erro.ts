/**
 * Contrato da resposta de falha da API.
 *
 * Uma forma só para todo erro de toda rota: quem consome — site hoje,
 * aplicativo nativo depois — escreve o tratamento uma vez. O corpo carrega
 * código para a máquina, texto opcional para a pessoa e referência opcional
 * para a investigação; nunca detalhe interno (AC-024).
 */

import { z } from "zod";
import {
  esquemaDeCodigoDeMaquina,
  esquemaDeReferencia,
  esquemaDeTextoCurto,
} from "./comum.ts";

/**
 * Corpo de erro da API.
 *
 * É estrito de propósito: campo a mais no corpo é divergência entre o que a
 * API devolve e o que o contrato promete, e divergência silenciosa é
 * exatamente o que esta tarefa existe para impedir.
 */
export const esquemaDeErro = z.strictObject({
  erro: esquemaDeCodigoDeMaquina,
  mensagem: esquemaDeTextoCurto.optional(),
  referencia: esquemaDeReferencia.optional(),
});

export type ErroDaApi = z.infer<typeof esquemaDeErro>;

/** Código que a API devolve quando o endereço não corresponde a rota alguma. */
export const CODIGO_NAO_ENCONTRADO = "nao_encontrado";
