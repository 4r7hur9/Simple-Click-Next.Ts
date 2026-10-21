/**
 * As métricas de um período, montadas para a tela (T-800, T-801, T-805).
 *
 * O caso de uso não conhece HTTP nem cache: recebe o período já decidido e a
 * loja do contexto, faz as consultas e devolve o painel inteiro — resumo,
 * comparação com o período anterior, mais vendidos, série por dia e por hora.
 * Quem decide se vale a pena guardar o resultado é `cache.ts`; quem valida a
 * entrada é a borda.
 *
 * DIA E HORA SEM VENDA APARECEM COMO ZERO (AC-808, AC-809). O banco só devolve
 * o que existe; é aqui que a série ganha os buracos preenchidos, para que o
 * gráfico mostre a segunda-feira parada em vez de esconder que ela existiu.
 */
import type {
  MetricasNoContrato,
  PontoDiarioNoContrato,
  PontoHorarioNoContrato,
  ProdutoMaisVendidoNoContrato,
} from "@simpleclick/contracts";

import { exigirLojaDoContexto } from "../../core/contexto.ts";
import {
  clientesDoPeriodo,
  gruposDoPeriodo,
  itensVendidos,
  pedidosPorEtapaAgora,
  vendasPorCategoria,
  vendasPorEntrega,
  vendasPorPagamento,
  produtosMaisVendidos,
  vendasPorDia,
  vendasPorHora,
  type DiaComVenda,
  type HoraComVenda,
  type ProdutoVendido,
} from "./consultas.ts";
import {
  compararPeriodos,
  REGRA_DE_VENDA,
  resumirPeriodo,
  variacao,
} from "./faturamento.ts";
import {
  diasDoPeriodo,
  periodoAnterior,
  type PeriodoResolvido,
} from "./periodo.ts";

/** As etapas do quadro que ainda estão em aberto (fora concluída e cancelada). */
const STATUS_DAS_ETAPAS_AGORA: readonly string[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
];

/** O que o caso de uso calcula; o cache e a rota completam o resto. */
export type MetricasCalculadas = Omit<
  MetricasNoContrato,
  "loja" | "deCache" | "calculadoEm"
> & { readonly calculadoEm: string };

/** A série por dia com todos os dias do período, zerados onde não houve venda. */
export function completarDias(
  periodo: PeriodoResolvido,
  comVenda: readonly DiaComVenda[],
): PontoDiarioNoContrato[] {
  const porDia = new Map(comVenda.map((dia) => [dia.dia, dia]));
  return diasDoPeriodo(periodo).map((dia) => {
    const achado = porDia.get(dia);
    return {
      dia,
      pedidos: achado?.pedidos ?? 0,
      vendidoCentavos: achado?.vendidoCentavos ?? 0,
    };
  });
}

/** As 24 horas do dia, zeradas onde não houve pedido. */
export function completarHoras(
  comVenda: readonly HoraComVenda[],
): PontoHorarioNoContrato[] {
  const porHora = new Map(comVenda.map((hora) => [hora.hora, hora]));
  return Array.from({ length: 24 }, (_, hora) => {
    const achada = porHora.get(hora);
    return {
      hora,
      pedidos: achada?.pedidos ?? 0,
      vendidoCentavos: achada?.vendidoCentavos ?? 0,
    };
  });
}

/**
 * Junta os mais vendidos por quantidade com os mais vendidos por valor.
 *
 * A tela alterna a ordenação (AC-807), e as duas listas não são a mesma: o
 * produto barato que sai muito lidera em quantidade e some em valor. Mandar a
 * união das duas deixa a tela reordenar sem voltar ao servidor e sem perder o
 * líder de nenhum critério.
 */
export function unirRankings(
  porQuantidade: readonly ProdutoVendido[],
  porValor: readonly ProdutoVendido[],
): ProdutoMaisVendidoNoContrato[] {
  const vistos = new Map<string, ProdutoMaisVendidoNoContrato>();
  for (const produto of [...porQuantidade, ...porValor]) {
    const chave = `${produto.produtoId ?? ""}|${produto.nome}`;
    if (!vistos.has(chave)) {
      vistos.set(chave, {
        produtoId: produto.produtoId,
        nome: produto.nome,
        quantidade: produto.quantidade,
        totalCentavos: produto.totalCentavos,
      });
    }
  }
  return [...vistos.values()].sort(
    (a, b) =>
      b.quantidade - a.quantidade ||
      b.totalCentavos - a.totalCentavos ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Calcula o painel inteiro do período para a loja do contexto. */
export async function calcularMetricas(
  periodo: PeriodoResolvido,
  agora: Date,
): Promise<MetricasCalculadas> {
  const lojaId = exigirLojaDoContexto();
  const anterior = periodoAnterior(periodo, agora);

  const [
    [grupos, gruposAnteriores, dias, horas, porQuantidade, porValor],
    [itens, itensAnteriores, clientes, clientesAnteriores],
    [pagamentos, entregas, categorias, etapas],
  ] = await Promise.all([
    Promise.all([
      gruposDoPeriodo(lojaId, periodo),
      gruposDoPeriodo(lojaId, anterior),
      vendasPorDia(lojaId, periodo),
      vendasPorHora(lojaId, periodo),
      produtosMaisVendidos(lojaId, periodo, "quantidade"),
      produtosMaisVendidos(lojaId, periodo, "valor"),
    ]),
    Promise.all([
      itensVendidos(lojaId, periodo),
      itensVendidos(lojaId, anterior),
      clientesDoPeriodo(lojaId, periodo),
      clientesDoPeriodo(lojaId, anterior),
    ]),
    Promise.all([
      vendasPorPagamento(lojaId, periodo),
      vendasPorEntrega(lojaId, periodo),
      vendasPorCategoria(lojaId, periodo),
      pedidosPorEtapaAgora(lojaId, STATUS_DAS_ETAPAS_AGORA),
    ]),
  ]);

  const resumo = resumirPeriodo(grupos);
  const resumoAnterior = resumirPeriodo(gruposAnteriores);

  return {
    periodo: {
      atalho: periodo.atalho,
      de: periodo.de,
      ate: periodo.ate,
      dias: periodo.dias,
      fuso: periodo.fuso,
      inicio: periodo.inicio.toISOString(),
      fim: periodo.fim.toISOString(),
    },
    resumo,
    comparacao: compararPeriodos(resumo, resumoAnterior, {
      de: anterior.de,
      ate: anterior.ate,
      fim: anterior.fim.toISOString(),
      parcial: anterior.parcial,
    }),
    maisVendidos: unirRankings(porQuantidade, porValor),
    porDia: completarDias(periodo, dias),
    porHora: completarHoras(horas),
    detalhes: {
      itensVendidos: variacao(itens, itensAnteriores),
      ticketMedioCentavos: variacao(
        resumo.ticketMedioCentavos,
        resumoAnterior.ticketMedioCentavos,
      ),
      cancelados: variacao(
        resumo.cancelados.quantidade,
        resumoAnterior.cancelados.quantidade,
      ),
      clientesNovos: variacao(clientes.novos, clientesAnteriores.novos),
      clientesRecorrentes: variacao(
        clientes.recorrentes,
        clientesAnteriores.recorrentes,
      ),
      porPagamento: pagamentos,
      porEntrega: entregas.filter(
        (e): e is typeof e & { tipo: "DELIVERY" | "PICKUP" } =>
          e.tipo === "DELIVERY" || e.tipo === "PICKUP",
      ),
      porCategoria: categorias,
      etapasAgora: etapas,
    },
    regraDeVenda: REGRA_DE_VENDA,
    calculadoEm: agora.toISOString(),
  };
}
