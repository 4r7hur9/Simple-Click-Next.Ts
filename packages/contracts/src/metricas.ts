/**
 * As métricas do painel do dono (T-800 a T-808), como a API as promete.
 *
 * TODO DINHEIRO É CENTAVO INTEIRO (P-005). A tela escreve em reais; a API
 * nunca escreve. Toda data civil é `AAAA-MM-DD` no fuso da loja, e todo
 * instante é ISO 8601 em UTC — o fuso vem junto para a tela saber de que dia
 * cada número fala.
 */
import { z } from "zod";

/** Data civil no fuso da loja: `2026-09-27`. */
export const esquemaDeDataCivilDasMetricas = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const inteiro = z.number().int();
const centavos = z.number().int().nonnegative();

/** Quantos pedidos e quanto dinheiro, em centavos inteiros. */
export const esquemaDeParcelaDeMetrica = z.strictObject({
  quantidade: inteiro.nonnegative(),
  totalCentavos: centavos,
});

/** O período em vigor, com as pontas por extenso. */
export const esquemaDoPeriodoDeMetricas = z.strictObject({
  atalho: z.enum(["hoje", "3d", "7d", "personalizado"]),
  de: esquemaDeDataCivilDasMetricas,
  ate: esquemaDeDataCivilDasMetricas,
  dias: inteiro.positive(),
  fuso: z.string(),
  inicio: z.string(),
  /** Exclusivo: o primeiro instante depois do período. */
  fim: z.string(),
});

/**
 * O resumo do período (AC-800, AC-817, AC-812, AC-810).
 *
 * `vendidoCentavos` é o faturamento: só o que conta como venda. Concluído e
 * em andamento são as duas metades dele, e a soma das duas bate com ele.
 * Cancelados e não confirmados ficam À PARTE, nunca dentro.
 */
export const esquemaDoResumoDeMetricas = z.strictObject({
  /** Pedidos que contam como venda. */
  pedidos: inteiro.nonnegative(),
  vendidoCentavos: centavos,
  ticketMedioCentavos: centavos,
  concluidos: esquemaDeParcelaDeMetrica,
  emAndamento: esquemaDeParcelaDeMetrica,
  /** Aguardando a decisão do dono: ainda não é venda, nem perda. */
  emAberto: esquemaDeParcelaDeMetrica,
  cancelados: esquemaDeParcelaDeMetrica,
  /** Abriram o WhatsApp e não confirmaram: fora do faturamento (AC-611). */
  naoConfirmados: esquemaDeParcelaDeMetrica,
  /** A divisão das VENDAS por canal; a soma dos dois é o vendido. */
  porCanal: z.strictObject({
    site: esquemaDeParcelaDeMetrica,
    balcao: esquemaDeParcelaDeMetrica,
  }),
});

/** Uma medida comparada com o período anterior equivalente (AC-802). */
export const esquemaDeVariacaoDeMetrica = z.strictObject({
  atual: inteiro.nonnegative(),
  anterior: inteiro.nonnegative(),
  diferenca: inteiro,
  /** Em pontos percentuais inteiros; nulo quando o anterior é zero. */
  variacaoPorCento: inteiro.nullable(),
  direcao: z.enum(["subiu", "caiu", "igual", "sem-base"]),
});

/**
 * A comparação com o período anterior equivalente (AC-802).
 *
 * Período em curso compara com o MESMO PEDAÇO do anterior: hoje até as 14h32
 * contra ontem até as 14h32 (decisão de 03/10/2026). `fim` é o instante
 * (exclusivo, ISO em UTC) até onde o anterior foi contado, e `parcial` diz se
 * ele foi cortado antes do fim do último dia — é o que deixa a tela escrever
 * "ontem até 14h32" em vez de deixar o dono achar que comparou o dia inteiro.
 */
export const esquemaDaComparacaoDeMetricas = z.strictObject({
  periodoAnterior: z.strictObject({
    de: esquemaDeDataCivilDasMetricas,
    ate: esquemaDeDataCivilDasMetricas,
    fim: z.string(),
    parcial: z.boolean(),
  }),
  vendidoCentavos: esquemaDeVariacaoDeMetrica,
  pedidos: esquemaDeVariacaoDeMetrica,
});

/** Um produto na lista dos mais vendidos (AC-807). */
export const esquemaDoProdutoMaisVendido = z.strictObject({
  produtoId: z.string().nullable(),
  nome: z.string(),
  quantidade: inteiro.nonnegative(),
  totalCentavos: centavos,
});

/** Um dia do período, com zero onde não houve venda (AC-808). */
export const esquemaDoPontoDiario = z.strictObject({
  dia: esquemaDeDataCivilDasMetricas,
  pedidos: inteiro.nonnegative(),
  vendidoCentavos: centavos,
});

/** Uma hora do dia, de 0 a 23, com zero onde não houve pedido (AC-809). */
export const esquemaDoPontoHorario = z.strictObject({
  hora: inteiro.min(0).max(23),
  pedidos: inteiro.nonnegative(),
  vendidoCentavos: centavos,
});

/** `GET /v1/lojas/:apelido/metricas` — o painel inteiro de um período. */
export const esquemaDasMetricas = z.strictObject({
  loja: z.strictObject({ apelido: z.string() }),
  periodo: esquemaDoPeriodoDeMetricas,
  resumo: esquemaDoResumoDeMetricas,
  comparacao: esquemaDaComparacaoDeMetricas,
  maisVendidos: z.array(esquemaDoProdutoMaisVendido),
  porDia: z.array(esquemaDoPontoDiario),
  porHora: z.array(esquemaDoPontoHorario),
  /** A régua do que conta como venda, escrita para o dono ler (AC-812). */
  regraDeVenda: z.string(),
  /** A que instante os números se referem (AC-814). */
  calculadoEm: z.string(),
  deCache: z.boolean(),
});

/** Recusa de período: a tela explica e mantém o período anterior (AC-805). */
export const esquemaDaRecusaDePeriodo = z.strictObject({
  erro: z.literal("periodo_invalido"),
  explicacao: z.string(),
});

export type ParcelaDeMetricaNoContrato = z.infer<
  typeof esquemaDeParcelaDeMetrica
>;
export type PeriodoDeMetricasNoContrato = z.infer<
  typeof esquemaDoPeriodoDeMetricas
>;
export type ResumoDeMetricasNoContrato = z.infer<
  typeof esquemaDoResumoDeMetricas
>;
export type VariacaoDeMetricaNoContrato = z.infer<
  typeof esquemaDeVariacaoDeMetrica
>;
export type ComparacaoDeMetricasNoContrato = z.infer<
  typeof esquemaDaComparacaoDeMetricas
>;
export type ProdutoMaisVendidoNoContrato = z.infer<
  typeof esquemaDoProdutoMaisVendido
>;
export type PontoDiarioNoContrato = z.infer<typeof esquemaDoPontoDiario>;
export type PontoHorarioNoContrato = z.infer<typeof esquemaDoPontoHorario>;
export type MetricasNoContrato = z.infer<typeof esquemaDasMetricas>;
