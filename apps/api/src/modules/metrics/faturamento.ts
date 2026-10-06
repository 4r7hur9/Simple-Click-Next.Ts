/**
 * Os três números do painel: vendido, concluído e em andamento (T-801;
 * AC-817, AC-812, AC-810, AC-802).
 *
 * A RÉGUA DO QUE É VENDA NÃO MORA AQUI. Ela é `situacaoNaVenda`, de
 * `packages/core` — a mesma que a fila do dono usa. Este arquivo só aplica a
 * régua a pedidos já agrupados pelo banco e reparte o resultado nas parcelas
 * que a tela mostra. Se a régua mudar, muda em um lugar, e a fila e o painel
 * continuam contando a mesma coisa.
 *
 * A LISTA DE STATUS QUE CONTAM COMO VENDA É DERIVADA da régua, e não escrita
 * de novo: cada status conhecido é perguntado à régua, e os que respondem
 * "VENDA" formam a lista que as consultas de série e de ranking usam no SQL.
 * Assim nem o SQL carrega uma segunda cópia da regra.
 */
import {
  situacaoNaVenda,
  STATUS_DO_PEDIDO,
  type SituacaoNaVenda,
} from "@simpleclick/core";
import type {
  ComparacaoDeMetricasNoContrato,
  ParcelaDeMetricaNoContrato,
  ResumoDeMetricasNoContrato,
  VariacaoDeMetricaNoContrato,
} from "@simpleclick/contracts";

/** Um grupo de pedidos iguais no que a régua enxerga, já somado pelo banco. */
export interface GrupoDePedidos {
  readonly status: string;
  readonly aguardandoConfirmacaoWhatsapp: boolean;
  readonly canal: string;
  readonly quantidade: number;
  readonly totalCentavos: number;
}

/**
 * Os status que a régua considera venda, derivados dela.
 *
 * O `Set` é para o SQL (`status = ANY(...)`) e para quem precisa filtrar
 * antes de somar: série por dia, por hora e ranking só contam o que é venda.
 */
export const STATUS_QUE_CONTAM_COMO_VENDA: readonly string[] =
  STATUS_DO_PEDIDO.filter(
    (status) =>
      situacaoNaVenda({
        status,
        totalCentavos: 0,
        aguardandoConfirmacaoWhatsapp: false,
      }) === "VENDA",
  );

/** O status que encerra a venda: o que já foi entregue ou retirado. */
export const STATUS_CONCLUIDO = "COMPLETED";

/**
 * A régua, escrita para o dono ler na tela (AC-812).
 *
 * É texto de produto, não de programador: diz o que entra, o que fica de fora
 * e por quê, sem citar nome de status.
 */
export const REGRA_DE_VENDA =
  "Conta como venda todo pedido que você aceitou, em qualquer etapa a partir daí — em preparo, pronto, saiu para entrega ou concluído. Pedido recusado ou cancelado nunca entra na conta e aparece separado. Pedido que abriu o WhatsApp sem confirmar o envio fica fora até você aceitá-lo.";

const PARCELA_VAZIA: ParcelaDeMetricaNoContrato = {
  quantidade: 0,
  totalCentavos: 0,
};

function somar(
  parcela: ParcelaDeMetricaNoContrato,
  grupo: GrupoDePedidos,
): ParcelaDeMetricaNoContrato {
  return {
    quantidade: parcela.quantidade + grupo.quantidade,
    totalCentavos: parcela.totalCentavos + grupo.totalCentavos,
  };
}

/** Onde o grupo cai na régua — a mesma pergunta que a fila faz por pedido. */
export function situacaoDoGrupo(grupo: GrupoDePedidos): SituacaoNaVenda {
  return situacaoNaVenda({
    status: grupo.status,
    totalCentavos: grupo.totalCentavos,
    aguardandoConfirmacaoWhatsapp: grupo.aguardandoConfirmacaoWhatsapp,
  });
}

/**
 * Reparte os grupos nas parcelas do painel.
 *
 * O vendido é a soma do concluído com o em andamento — por construção, e não
 * por coincidência: os dois são as duas metades da situação "VENDA", partidas
 * pelo status que encerra o pedido (AC-817).
 */
export function resumirPeriodo(
  grupos: readonly GrupoDePedidos[],
): ResumoDeMetricasNoContrato {
  let concluidos = PARCELA_VAZIA;
  let emAndamento = PARCELA_VAZIA;
  let emAberto = PARCELA_VAZIA;
  let cancelados = PARCELA_VAZIA;
  let naoConfirmados = PARCELA_VAZIA;
  let site = PARCELA_VAZIA;
  let balcao = PARCELA_VAZIA;

  for (const grupo of grupos) {
    switch (situacaoDoGrupo(grupo)) {
      case "VENDA":
        if (grupo.status === STATUS_CONCLUIDO) {
          concluidos = somar(concluidos, grupo);
        } else {
          emAndamento = somar(emAndamento, grupo);
        }
        // O canal só é dividido no que é venda: é "quanto do meu movimento
        // já é digital" (AC-810), e movimento cancelado não é movimento.
        if (grupo.canal === "MANUAL") balcao = somar(balcao, grupo);
        else site = somar(site, grupo);
        break;
      case "AGUARDANDO":
        emAberto = somar(emAberto, grupo);
        break;
      case "NAO_CONFIRMADO":
        naoConfirmados = somar(naoConfirmados, grupo);
        break;
      case "CANCELADO":
        cancelados = somar(cancelados, grupo);
        break;
    }
  }

  const pedidos = concluidos.quantidade + emAndamento.quantidade;
  const vendidoCentavos = concluidos.totalCentavos + emAndamento.totalCentavos;

  return {
    pedidos,
    vendidoCentavos,
    // Divisão inteira: centavo não se parte, e a média é um número de tela.
    ticketMedioCentavos:
      pedidos === 0 ? 0 : Math.round(vendidoCentavos / pedidos),
    concluidos,
    emAndamento,
    emAberto,
    cancelados,
    naoConfirmados,
    porCanal: { site, balcao },
  };
}

/** Compara uma medida com a do período anterior equivalente (AC-802). */
export function variacao(
  atual: number,
  anterior: number,
): VariacaoDeMetricaNoContrato {
  const diferenca = atual - anterior;
  if (anterior === 0) {
    // Sem base não há porcentagem honesta: "subiu infinito" não orienta ninguém.
    return {
      atual,
      anterior,
      diferenca,
      variacaoPorCento: null,
      direcao: atual === 0 ? "igual" : "sem-base",
    };
  }
  return {
    atual,
    anterior,
    diferenca,
    variacaoPorCento: Math.round((diferenca / anterior) * 100),
    direcao: diferenca > 0 ? "subiu" : diferenca < 0 ? "caiu" : "igual",
  };
}

/** A comparação inteira do painel: vendido e pedidos, frente ao anterior. */
export function compararPeriodos(
  atual: ResumoDeMetricasNoContrato,
  anterior: ResumoDeMetricasNoContrato,
  periodoAnterior: ComparacaoDeMetricasNoContrato["periodoAnterior"],
): ComparacaoDeMetricasNoContrato {
  return {
    periodoAnterior: {
      de: periodoAnterior.de,
      ate: periodoAnterior.ate,
      fim: periodoAnterior.fim,
      parcial: periodoAnterior.parcial,
    },
    vendidoCentavos: variacao(atual.vendidoCentavos, anterior.vendidoCentavos),
    pedidos: variacao(atual.pedidos, anterior.pedidos),
  };
}
