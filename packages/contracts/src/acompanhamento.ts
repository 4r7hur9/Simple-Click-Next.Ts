import { z } from "zod";

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
