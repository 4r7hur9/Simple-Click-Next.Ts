/**
 * Quanto cada forma de vender leva do pedido — as contas da seção de mercado.
 *
 * OS NÚMEROS SÃO OS DAS PÁGINAS OFICIAIS do iFood para parceiros
 * (https://parceiros.ifood.com.br/restaurante, reconferida em 20/10/2026) e da
 * Nuvemshop (mais abaixo), e não estimativa nossa. Se uma tabela mudar, muda
 * aqui e nas fontes citadas em `secoes/conteudo-de-prova.ts` e `conteudo.ts`.
 *
 * A conta assume o caso mais comum de quem começa: todos os pedidos pagos pelo
 * app (é quando a taxa de pagamento online incide) e faturamento todo vindo do
 * delivery. A página diz isso ao lado do resultado.
 */

export type PlanoDoAplicativo = "basico" | "entrega";

export interface TabelaDoPlano {
  readonly nome: string;
  /** Comissão sobre cada pedido de delivery, em fração (0,12 = 12%). */
  readonly comissao: number;
  /** Mensalidade em reais, cobrada só acima do limite de faturamento. */
  readonly mensalidade: number;
}

export const TABELA_DO_IFOOD: Readonly<Record<PlanoDoAplicativo, TabelaDoPlano>> =
  {
    basico: { nome: "Plano Básico (entrega própria)", comissao: 0.12, mensalidade: 110 },
    entrega: { nome: "Plano Entrega (entregador do iFood)", comissao: 0.23, mensalidade: 150 },
  };

/** Taxa sobre pedidos pagos pelo app, igual nos dois planos. */
export const TAXA_DE_PAGAMENTO_ONLINE = 0.032;

/** Abaixo deste faturamento mensal o iFood não cobra mensalidade. */
export const LIMITE_SEM_MENSALIDADE = 1800;

export interface CustoNoAplicativo {
  readonly comissao: number;
  readonly pagamentoOnline: number;
  readonly mensalidade: number;
  readonly totalNoMes: number;
  readonly totalNoAno: number;
  /** Parte do faturamento que fica no app, em fração. */
  readonly parteDoFaturamento: number;
}

const centavos = (valor: number) => Math.round(valor * 100) / 100;

/** O custo de um mês no plano escolhido, para um faturamento em reais. */
export function custoNoAplicativo(
  faturamentoNoMes: number,
  plano: PlanoDoAplicativo,
): CustoNoAplicativo {
  const faturamento = Number.isFinite(faturamentoNoMes)
    ? Math.max(0, faturamentoNoMes)
    : 0;
  const tabela = TABELA_DO_IFOOD[plano];
  const comissao = centavos(faturamento * tabela.comissao);
  const pagamentoOnline = centavos(faturamento * TAXA_DE_PAGAMENTO_ONLINE);
  const mensalidade =
    faturamento > LIMITE_SEM_MENSALIDADE ? tabela.mensalidade : 0;
  const totalNoMes = centavos(comissao + pagamentoOnline + mensalidade);

  return {
    comissao,
    pagamentoOnline,
    mensalidade,
    totalNoMes,
    totalNoAno: centavos(totalNoMes * 12),
    parteDoFaturamento: faturamento > 0 ? totalNoMes / faturamento : 0,
  };
}

/**
 * Loja virtual com mensalidade, para a comparação da seção de mercado.
 *
 * Números da página oficial da Nuvemshop
 * (https://www.nuvemshop.com.br/planos-e-precos, consultada em 20/10/2026):
 * plano Essencial a R$ 69 no pagamento mensal e, com o Nuvem Pago, 0% de
 * comissão e 4,19% de processamento por venda (a página avisa que o valor
 * varia por meio de pagamento e parcelas). É o plano pago de entrada.
 */
export const LOJA_VIRTUAL = {
  nome: "Nuvemshop, plano Essencial",
  mensalidade: 69,
  processamento: 0.0419,
} as const;

export type OpcaoDeVenda = "simpleclick" | "lojaVirtual" | PlanoDoAplicativo;

export interface DescricaoDaOpcao {
  readonly id: OpcaoDeVenda;
  /** Nome curto, o que aparece ao lado da barra. */
  readonly nome: string;
  /** De onde vem a taxa, em uma linha. */
  readonly detalhe: string;
  /** O que a plataforma leva de cada pedido pago por ela, em fração. */
  readonly taxaPorPedido: number;
  /** A mensalidade, já com a condição, ou null quando não há. */
  readonly mensalidade: string | null;
}

const PORCENTO = (fracao: number) =>
  `${(fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/**
 * As quatro formas de vender comparadas nos gráficos, na ordem em que
 * aparecem. Tudo sai das tabelas acima; nenhum número é digitado duas vezes.
 */
export const OPCOES_DE_VENDA: readonly DescricaoDaOpcao[] = [
  {
    id: "simpleclick",
    nome: "SimpleClick",
    detalhe: "Seu link, sem comissão e sem mensalidade",
    taxaPorPedido: 0,
    mensalidade: null,
  },
  {
    id: "lojaVirtual",
    nome: "Loja virtual com mensalidade",
    detalhe: `${LOJA_VIRTUAL.nome}: ${PORCENTO(LOJA_VIRTUAL.processamento)} de processamento`,
    taxaPorPedido: LOJA_VIRTUAL.processamento,
    mensalidade: `+ R$\u00a0${LOJA_VIRTUAL.mensalidade} por mês`,
  },
  ...(["basico", "entrega"] as const).map((plano) => {
    const tabela = TABELA_DO_IFOOD[plano];
    return {
      id: plano,
      nome:
        plano === "basico"
          ? "App de delivery, entrega própria"
          : "App de delivery, entregador do app",
      detalhe: `iFood ${tabela.nome.replace(/ \(.*\)$/, "")}: ${PORCENTO(tabela.comissao)} + ${PORCENTO(TAXA_DE_PAGAMENTO_ONLINE)} do pagamento online`,
      taxaPorPedido: tabela.comissao + TAXA_DE_PAGAMENTO_ONLINE,
      mensalidade: `+ R$\u00a0${tabela.mensalidade} por mês acima de R$\u00a0${LIMITE_SEM_MENSALIDADE.toLocaleString("pt-BR")} vendidos`,
    } satisfies DescricaoDaOpcao;
  }),
];

/** Quanto fica com a loja de um pedido de R$ 100 (sem contar mensalidade). */
export function sobraDeCemReais(opcao: DescricaoDaOpcao): number {
  return centavos(100 * (1 - opcao.taxaPorPedido));
}

/** O que a opção cobra num mês com esse faturamento, mensalidade incluída. */
export function custoNoMesDaOpcao(
  opcao: OpcaoDeVenda,
  faturamentoNoMes: number,
): number {
  if (opcao === "simpleclick") return 0;
  if (opcao === "lojaVirtual") {
    const faturamento = Number.isFinite(faturamentoNoMes)
      ? Math.max(0, faturamentoNoMes)
      : 0;
    return centavos(faturamento * LOJA_VIRTUAL.processamento + LOJA_VIRTUAL.mensalidade);
  }
  return custoNoAplicativo(faturamentoNoMes, opcao).totalNoMes;
}

const REAIS = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/** R$ 1.234 — sem centavos, que numa estimativa só fingem precisão. */
export function emReais(valor: number): string {
  // Espaço inquebrável entre "R$" e o número, em todo navegador: o valor
  // nunca quebra a linha no meio.
  return REAIS.format(Math.round(valor)).replace(/\s/g, "\u00a0");
}

const REAIS_COM_CENTAVOS = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** R$ 84,80 — para a conta de cada R$ 100, onde o centavo é exato. */
export function emReaisComCentavos(valor: number): string {
  return REAIS_COM_CENTAVOS.format(valor).replace(/\s/g, "\u00a0");
}
