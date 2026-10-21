/**
 * Monta o painel de crescimento: período atual, período anterior de mesma
 * duração e as séries dos gráficos. Só orquestra o repositório; as contas de
 * calendário estão em `periodo.ts`.
 */
import type { MetricasDoAdminNoContrato } from "@simpleclick/contracts";

import {
  contarDias,
  periodoAnterior,
  type IntervaloDeDias,
} from "./periodo.ts";
import type {
  NumerosDoPeriodo,
  RepositorioDasMetricasDoAdmin,
} from "./metricas.repo.ts";

const par = (atual: number, anterior: number) => ({ atual, anterior });

export function ticketMedio(faturamentoCentavos: number, pedidos: number) {
  return pedidos === 0 ? 0 : Math.round(faturamentoCentavos / pedidos);
}

/** Carrinhos virados em pedido, em %; `null` sem carrinho para medir. */
export function conversao(n: NumerosDoPeriodo): number | null {
  if (n.carrinhos === 0) return null;
  return Math.round((n.carrinhosConvertidos / n.carrinhos) * 1000) / 10;
}

export async function montarMetricasDoAdmin(
  periodo: IntervaloDeDias,
  repo: RepositorioDasMetricasDoAdmin,
): Promise<MetricasDoAdminNoContrato> {
  const anterior = periodoAnterior(periodo);
  const [
    atual,
    antes,
    pendentes,
    porDia,
    lojasNovasPorSemana,
    clientesNovosPorSemana,
    porTipoDeNegocio,
    rankingPorFaturamento,
    rankingPorPedidos,
    lojasMaisNovas,
    porHora,
  ] = await Promise.all([
    repo.numerosDoPeriodo(periodo),
    repo.numerosDoPeriodo(anterior),
    repo.lojasPendentes(),
    repo.pedidosPorDia(periodo),
    repo.lojasNovasPorSemana(periodo),
    repo.clientesNovosPorSemana(periodo),
    repo.porTipoDeNegocio(periodo),
    repo.ranking(periodo, "faturamento"),
    repo.ranking(periodo, "pedidos"),
    repo.lojasMaisNovas(),
    repo.pedidosPorHora(periodo),
  ]);

  return {
    periodo: { ...periodo, dias: contarDias(periodo) },
    anterior,
    cartoes: {
      lojasAtivas: par(atual.lojasAtivas, antes.lojasAtivas),
      novasLojas: par(atual.novasLojas, antes.novasLojas),
      lojasPendentes: { atual: pendentes, anterior: null },
      pedidos: par(atual.pedidos, antes.pedidos),
      faturamentoCentavos: par(
        atual.faturamentoCentavos,
        antes.faturamentoCentavos,
      ),
      ticketMedioCentavos: par(
        ticketMedio(atual.faturamentoCentavos, atual.pedidos),
        ticketMedio(antes.faturamentoCentavos, antes.pedidos),
      ),
      clientes: par(atual.clientes, antes.clientes),
      novosClientes: par(atual.novosClientes, antes.novosClientes),
      donos: par(atual.donos, antes.donos),
      staff: par(atual.staff, antes.staff),
      conversaoPercentual: {
        atual: conversao(atual),
        anterior: conversao(antes),
      },
    },
    porDia,
    lojasNovasPorSemana,
    clientesNovosPorSemana,
    porTipoDeNegocio,
    rankingPorFaturamento,
    rankingPorPedidos,
    lojasMaisNovas,
    porHora,
  };
}
