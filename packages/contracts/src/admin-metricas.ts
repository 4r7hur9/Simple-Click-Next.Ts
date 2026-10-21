/**
 * Painel de crescimento da administração (card #30): números do período,
 * comparação com o período anterior e as séries dos gráficos. Só leitura,
 * sem dado pessoal: aparecem nomes de loja e contagens.
 *
 * `GET /v1/admin/metricas?inicio=yyyy-mm-dd&fim=yyyy-mm-dd`
 *
 * Os dias são do fuso de Fortaleza, como no seletor de período. O período
 * anterior tem o mesmo número de dias e termina um dia antes do início.
 */

import { z } from "zod";

const esquemaDoDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

/** O maior período aceito: um ano e um dia de folga. */
export const MAXIMO_DE_DIAS_DO_PAINEL_DO_ADMIN = 366;

export const esquemaDaConsultaDeMetricasDoAdmin = z.object({
  inicio: esquemaDoDia,
  fim: esquemaDoDia,
});

export type ConsultaDeMetricasDoAdmin = z.output<
  typeof esquemaDaConsultaDeMetricasDoAdmin
>;

const esquemaDoPar = z.strictObject({
  atual: z.number(),
  /** `null` quando o dado não existe para o período anterior. */
  anterior: z.number().nullable(),
});

const esquemaDoIntervalo = z.strictObject({
  inicio: esquemaDoDia,
  fim: esquemaDoDia,
});

const esquemaDaLojaDoRanking = z.strictObject({
  id: z.string(),
  nome: z.string(),
  apelido: z.string(),
  pedidos: z.number().int().min(0),
  faturamentoCentavos: z.number().int().min(0),
});

export const esquemaDasMetricasDoAdmin = z.strictObject({
  periodo: esquemaDoIntervalo.extend({ dias: z.number().int().min(1) }),
  anterior: esquemaDoIntervalo,
  cartoes: z.strictObject({
    /** Lojas ativas ao fim de cada período. */
    lojasAtivas: esquemaDoPar,
    novasLojas: esquemaDoPar,
    /** Fila de aprovação agora; não tem histórico, então `anterior` é nulo. */
    lojasPendentes: esquemaDoPar,
    pedidos: esquemaDoPar,
    faturamentoCentavos: esquemaDoPar,
    ticketMedioCentavos: esquemaDoPar,
    /** Contas de cliente existentes ao fim de cada período. */
    clientes: esquemaDoPar,
    novosClientes: esquemaDoPar,
    donos: esquemaDoPar,
    staff: esquemaDoPar,
    /** Carrinhos virados em pedido, de 0 a 100; nulo sem carrinho no período. */
    conversaoPercentual: z.strictObject({
      atual: z.number().nullable(),
      anterior: z.number().nullable(),
    }),
  }),
  porDia: z.array(
    z.strictObject({
      dia: esquemaDoDia,
      pedidos: z.number().int().min(0),
      faturamentoCentavos: z.number().int().min(0),
    }),
  ),
  lojasNovasPorSemana: z.array(
    z.strictObject({ semana: esquemaDoDia, quantidade: z.number().int().min(0) }),
  ),
  clientesNovosPorSemana: z.array(
    z.strictObject({ semana: esquemaDoDia, quantidade: z.number().int().min(0) }),
  ),
  porTipoDeNegocio: z.array(
    z.strictObject({
      codigo: z.string(),
      nome: z.string(),
      lojas: z.number().int().min(0),
      pedidos: z.number().int().min(0),
    }),
  ),
  rankingPorFaturamento: z.array(esquemaDaLojaDoRanking),
  rankingPorPedidos: z.array(esquemaDaLojaDoRanking),
  lojasMaisNovas: z.array(
    z.strictObject({
      id: z.string(),
      nome: z.string(),
      apelido: z.string(),
      tipoDeNegocio: z.string(),
      status: z.string(),
      criadaEm: z.string(),
    }),
  ),
  /** Sempre 24 posições, de 0 a 23. */
  porHora: z.array(
    z.strictObject({
      hora: z.number().int().min(0).max(23),
      pedidos: z.number().int().min(0),
    }),
  ),
});

export type MetricasDoAdminNoContrato = z.infer<
  typeof esquemaDasMetricasDoAdmin
>;
