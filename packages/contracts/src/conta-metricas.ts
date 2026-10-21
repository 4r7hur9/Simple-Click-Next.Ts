/**
 * As métricas do cliente em todas as lojas (card #35):
 * `GET /v1/conta/metricas?de=aaaa-mm-dd&ate=aaaa-mm-dd`.
 *
 * Valores em centavos inteiros. Pedido cancelado não entra em gasto, ticket,
 * lojas, produtos nem horários: aparece só em `cancelados`. O período anterior
 * tem o mesmo tamanho e vem logo antes, para a comparação.
 */
import { z } from "zod";

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const inteiro = z.number().int().nonnegative();

export const esquemaDaConsultaDeMetricasDaConta = z.object({
  de: data.optional(),
  ate: data.optional(),
});

const resumo = z.strictObject({
  pedidos: inteiro,
  gastoCentavos: inteiro,
  ticketMedioCentavos: inteiro,
});

export const esquemaDeMetricasDaConta = z.strictObject({
  periodo: z.strictObject({ de: data, ate: data, fuso: z.string() }),
  anterior: z.strictObject({ de: data, ate: data }),
  resumo: resumo.extend({
    cancelados: inteiro,
    lojasDistintas: inteiro,
    entregues: inteiro,
    retiradas: inteiro,
  }),
  resumoAnterior: resumo,
  topProdutos: z.array(
    z.strictObject({
      nome: z.string(),
      loja: z.strictObject({ nome: z.string(), apelido: z.string() }),
      vezes: inteiro,
      gastoCentavos: inteiro,
    }),
  ),
  topLojas: z.array(
    z.strictObject({
      apelido: z.string(),
      nome: z.string(),
      pedidos: inteiro,
      gastoCentavos: inteiro,
    }),
  ),
  /** Os 6 meses até o fim do período, do mais antigo ao mais novo. */
  gastoPorMes: z.array(
    z.strictObject({ mes: z.string().regex(/^\d{4}-\d{2}$/), gastoCentavos: inteiro, pedidos: inteiro }),
  ),
  /** Pedidos por dia da semana (0 = domingo) e por hora (0 a 23). */
  pedidosPorDiaDaSemana: z.array(inteiro).length(7),
  pedidosPorHora: z.array(inteiro).length(24),
});

export type MetricasDaContaNoContrato = z.infer<typeof esquemaDeMetricasDaConta>;
