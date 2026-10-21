import Link from "next/link";

import type { ConsultaDoPeriodo } from "../../lib/metricas.ts";
import { enderecoDoPeriodo } from "../../lib/metricas.ts";
import { MetricasPorPeriodo } from "./MetricasPorPeriodo.tsx";

/**
 * O início do painel (card #34): a primeira coisa que o dono e a equipe veem
 * ao entrar. É um painel de métricas da loja: o dia comparado com o anterior,
 * os últimos 7 dias ou o período escolhido no calendário, com os pedidos que
 * estão em cada etapa agora e o atalho para o quadro de pedidos.
 *
 * Dono e equipe veem a mesma tela: as métricas de venda são da loja. O
 * período mora no endereço, como na visão detalhada, que acrescenta a
 * planilha para exportar.
 *
 * Não busca nada no servidor: os números são lidos pelo navegador, pela rota
 * do próprio site que leva a sessão à API, e mostram os quatro estados
 * enquanto isso (P-011).
 */
export function InicioDoPainel({
  consultaInicial,
}: Readonly<{ consultaInicial: ConsultaDoPeriodo }>) {
  const detalhe = `/painel/metricas?${enderecoDoPeriodo(consultaInicial)}`;
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 min-[540px]:px-6 lg:px-8 lg:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="font-display text-2xl font-semibold min-[540px]:text-3xl">
            Resumo da loja
          </h1>
          <p className="mt-2 text-tinta-suave">
            O que aconteceu na sua loja, comparado com o período anterior.
            Horário de Fortaleza.
          </p>
        </div>
        <Link
          className="sc-botao sc-botao--secundaria sc-botao--pilula"
          href={detalhe}
        >
          Ver métricas detalhadas
        </Link>
      </header>
      <MetricasPorPeriodo
        key={enderecoDoPeriodo(consultaInicial)}
        consultaInicial={consultaInicial}
        exportar={false}
      />
      <p className="text-sm leading-6 text-tinta-suave">
        Pagamento, entrega, horário, contato, apresentação e impressão ficam
        nas configurações da loja. Tipo de negócio, apelido, documento e
        contrato são cuidados pela administração da plataforma.
      </p>
    </div>
  );
}
