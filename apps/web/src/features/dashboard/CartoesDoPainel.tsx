/**
 * Os cartões de números do painel (card #34): vendas, pedidos, ticket médio,
 * clientes novos e recorrentes, itens vendidos e cancelamentos, cada um com a
 * variação contra o período anterior (seta verde ou vermelha).
 *
 * Os cartões de vendas e pedidos usam a comparação que sempre existiu; os
 * demais vêm de `detalhes`, que a API acrescentou. Resposta guardada antes
 * dessa versão não tem `detalhes`: os cartões sem comparação somem em vez de
 * mostrar número inventado.
 */
import {
  IconeClientes,
  IconeDinheiro,
  IconeFechar,
  IconeMetricas,
  IconePedido,
  IconeProduto,
  type Icone,
} from "@simpleclick/ui";
import type { ReactNode } from "react";

import {
  descreverPeriodoAnterior,
  escreverDinheiro,
  type MetricasNoContrato,
  type VariacaoDeMetricaNoContrato,
} from "../../lib/metricas.ts";
import type { NomeDaExplicacao } from "../config/explicacoes-do-painel.ts";
import { InfoDoPainel } from "../config/RotuloComInfo.tsx";
import { VariacaoEmSeta } from "./VariacaoEmSeta.tsx";

/** O "i" de cada cartão: o que o número conta. */
const EXPLICACAO_DO_CARTAO: Readonly<Record<string, NomeDaExplicacao>> = {
  vendido: "vendas",
  pedidos: "pedidos",
  "ticket-medio": "ticketMedio",
  "itens-vendidos": "itensVendidos",
  "clientes-novos": "clientesNovos",
  "clientes-recorrentes": "clientesRecorrentes",
  cancelados: "cancelamentos",
};

interface CartaoDeNumero {
  readonly nome: string;
  readonly rotulo: string;
  readonly valor: string;
  readonly icone: Icone;
  readonly variacao: VariacaoDeMetricaNoContrato | undefined;
  readonly unidade: "dinheiro" | "pedidos";
  readonly inverso?: boolean;
  readonly detalhe?: ReactNode;
  readonly destaque?: boolean;
}

export interface CartoesDoPainelProps {
  readonly metricas: MetricasNoContrato;
  /** Mostra a seta de comparação (o "comparar" do calendário). */
  readonly comparar: boolean;
}

export function CartoesDoPainel({ metricas, comparar }: CartoesDoPainelProps) {
  const { resumo, comparacao, detalhes, periodo } = metricas;
  const contra = descreverPeriodoAnterior(comparacao, periodo);
  const quando = periodo.atalho === "hoje" ? "hoje" : "no período";

  const cartoes: CartaoDeNumero[] = [
    {
      nome: "vendido",
      rotulo: `Vendas ${quando}`,
      valor: escreverDinheiro(resumo.vendidoCentavos),
      icone: IconeDinheiro,
      variacao: comparacao.vendidoCentavos,
      unidade: "dinheiro",
      destaque: true,
      detalhe: `${resumo.concluidos.quantidade} concluídos · ${resumo.emAndamento.quantidade} em andamento`,
    },
    {
      nome: "pedidos",
      rotulo: "Pedidos",
      valor: String(resumo.pedidos),
      icone: IconePedido,
      variacao: comparacao.pedidos,
      unidade: "pedidos",
      detalhe: "que contam como venda",
    },
    {
      nome: "ticket-medio",
      rotulo: "Ticket médio",
      valor: escreverDinheiro(resumo.ticketMedioCentavos),
      icone: IconeMetricas,
      variacao: detalhes?.ticketMedioCentavos,
      unidade: "dinheiro",
      detalhe: "vendido ÷ pedidos",
    },
    {
      nome: "itens-vendidos",
      rotulo: "Itens vendidos",
      valor: String(detalhes?.itensVendidos.atual ?? "—"),
      icone: IconeProduto,
      variacao: detalhes?.itensVendidos,
      unidade: "pedidos",
      detalhe: "unidades nos pedidos vendidos",
    },
    {
      nome: "clientes-novos",
      rotulo: "Clientes novos",
      valor: String(detalhes?.clientesNovos.atual ?? "—"),
      icone: IconeClientes,
      variacao: detalhes?.clientesNovos,
      unidade: "pedidos",
      detalhe: "primeira compra neste período",
    },
    {
      nome: "clientes-recorrentes",
      rotulo: "Clientes recorrentes",
      valor: String(detalhes?.clientesRecorrentes.atual ?? "—"),
      icone: IconeClientes,
      variacao: detalhes?.clientesRecorrentes,
      unidade: "pedidos",
      detalhe: "já tinham comprado antes",
    },
    {
      nome: "cancelados",
      rotulo: "Cancelamentos",
      valor: String(resumo.cancelados.quantidade),
      icone: IconeFechar,
      variacao: detalhes?.cancelados,
      unidade: "pedidos",
      inverso: true,
      detalhe: `${escreverDinheiro(resumo.cancelados.totalCentavos)} fora do vendido`,
    },
  ];

  return (
    <dl
      data-cartoes-do-painel
      className="grid grid-cols-1 gap-4 min-[390px]:grid-cols-2 min-[900px]:grid-cols-4"
    >
      {cartoes.map((cartao) => {
        const Desenho = cartao.icone;
        const explicacao = EXPLICACAO_DO_CARTAO[cartao.nome];
        return (
          <div
            key={cartao.nome}
            data-metrica={cartao.nome}
            className={[
              "flex min-w-0 flex-col rounded-[var(--raio-cartao)] border border-borda bg-superficie-alta p-4 shadow-[var(--sombra-larga)] min-[540px]:p-5",
              cartao.destaque
                ? "min-[390px]:col-span-2 min-[900px]:col-span-2"
                : "",
            ].join(" ")}
          >
            <dt className="flex items-center justify-between gap-3 text-xs font-semibold tracking-wide text-tinta-suave uppercase">
              <span className="flex min-w-0 items-center gap-1 normal-case">
                <span className="min-w-0 uppercase">{cartao.rotulo}</span>
                {explicacao === undefined ? null : (
                  <InfoDoPainel
                    explicacao={explicacao}
                    nome={cartao.rotulo}
                  />
                )}
              </span>
              {/* No celular, em duas colunas, o ícone tomaria o lugar do
                  rótulo ("CANCELAMENTOS" encostaria na borda). */}
              <span className="hidden size-8 shrink-0 items-center justify-center rounded-[var(--raio-botao)] bg-superficie text-tinta-suave min-[540px]:inline-flex">
                <Desenho size={16} />
              </span>
            </dt>
            <dd
              data-valor
              className={[
                "mt-2 font-display font-semibold tabular-nums [overflow-wrap:anywhere]",
                cartao.destaque ? "text-4xl min-[540px]:text-5xl" : "text-3xl",
              ].join(" ")}
            >
              {cartao.valor}
            </dd>
            <dd className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta-suave">
              {comparar && cartao.variacao !== undefined ? (
                <>
                  <VariacaoEmSeta
                    variacao={cartao.variacao}
                    unidade={cartao.unidade}
                    contra={contra}
                    inverso={cartao.inverso}
                  />
                  <span aria-hidden="true">vs {contra}</span>
                </>
              ) : (
                cartao.detalhe
              )}
            </dd>
            {comparar && cartao.variacao !== undefined && cartao.detalhe ? (
              <dd className="mt-1 text-xs text-tinta-suave">
                {cartao.detalhe}
              </dd>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}
