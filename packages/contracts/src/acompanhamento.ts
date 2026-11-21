/**
 * Contrato do link público de acompanhamento do pedido (AC-612 a AC-615): o
 * estado, o histórico e só o dado necessário, com o telefone mascarado. A conta
 * do cliente reaproveita esta forma do pedido (`conta.ts`, AC-616).
 */

import { z } from "zod";

import { definirRota } from "./rota.ts";
import { esquemaDoApelido } from "./vitrine.ts";

/** Contrato público do link de acompanhamento (AC-612..AC-615). */
export const esquemaDoAcompanhamento = z.strictObject({
  pedido: z.strictObject({
    numero: z.number().int().nonnegative(),
    codigo: z.string(),
    status: z.string(),
    entrega: z.string(),
    formaDePagamento: z.string().nullable(),
    totalCentavos: z.number().int().nonnegative(),
    criadoEm: z.string(),
    whatsappConfirmadoEm: z.string().nullable(),
    cliente: z.strictObject({
      nome: z.string(),
      telefoneMascarado: z.string(),
    }),
    loja: z.strictObject({
      nome: z.string(),
      whatsappPublico: z.string().nullable(),
    }),
    itens: z.array(
      z.strictObject({
        nome: z.string(),
        variacao: z.string().nullable(),
        quantidade: z.number().int().positive(),
        totalCentavos: z.number().int().nonnegative(),
        opcoes: z.array(
          z.strictObject({
            grupo: z.string(),
            nome: z.string(),
            quantidade: z.number().int().positive(),
          }),
        ),
      }),
    ),
    historico: z.array(
      z.strictObject({
        de: z.string().nullable(),
        para: z.string(),
        motivo: z.string().nullable(),
        ocorridoEm: z.string(),
      }),
    ),
  }),
});

export type AcompanhamentoNoContrato = z.infer<typeof esquemaDoAcompanhamento>;

/** Formato do token público do pedido (o mesmo que a rota confere). */
export const PADRAO_DO_TOKEN_DO_PEDIDO = "^[A-Za-z0-9_-]{22,128}$";

export const esquemaDoApelidoETokenDoPedido = esquemaDoApelido.extend({
  token: z.string().regex(new RegExp(PADRAO_DO_TOKEN_DO_PEDIDO)),
});

/**
 * Acompanhamento do pedido pelo endereço secreto. Sem login: quem tem o
 * `tokenPublico` vê o pedido. Token malformado, inexistente, de outra loja ou
 * loja inexistente respondem todos 404 `nao_encontrado`, sem distinguir.
 */
export const rotaDoAcompanhamento = definirRota({
  metodo: "get",
  caminho: "/v1/vitrine/:apelido/pedido/:token",
  etiqueta: "carrinho",
  resumo: "Acompanha o pedido pelo endereço secreto",
  descricao:
    "Quem tem o `tokenPublico` vê o pedido; a rota não exige login e responde `Cache-Control: no-store`. Token fora do formato, token inexistente, token de outra loja e loja inexistente respondem todos 404 `nao_encontrado`. Loja suspensa continua acompanhável.",
  parametros: esquemaDoApelidoETokenDoPedido,
  resposta: esquemaDoAcompanhamento,
  errosPossiveis: [404],
});
