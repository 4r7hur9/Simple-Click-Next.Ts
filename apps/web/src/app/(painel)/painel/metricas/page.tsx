import Link from "next/link";

import { MetricasPorPeriodo } from "../../../../features/dashboard/MetricasPorPeriodo.tsx";
import {
  enderecoDoPeriodo,
  periodoDoEndereco,
} from "../../../../lib/metricas.ts";

export const metadata = {
  title: "Métricas | SimpleClick",
  description:
    "As vendas da sua loja por período: hoje, três dias, sete dias ou as datas que você escolher.",
};

interface PaginaDeMetricasProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * As métricas por período (T-804).
 *
 * O período vem do endereço — `periodo`, `de` e `ate`, os mesmos nomes da
 * consulta da API —, e é por isso que recarregar ou abrir o link em outra aba
 * mostra o mesmo recorte (AC-806). A página não busca número no servidor: lê
 * o período e entrega à tela, que pede as métricas pela rota do próprio site.
 */
export default async function PaginaDeMetricas({
  searchParams,
}: PaginaDeMetricasProps) {
  const consulta = periodoDoEndereco(await searchParams);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 min-[540px]:px-6 lg:px-8 lg:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold min-[540px]:text-3xl">
            Métricas da loja
          </h1>
          <p className="mt-2 text-tinta-suave">
            Escolha o período. Ele fica no endereço da página: dá para
            recarregar ou mandar o link sem perder a escolha.
          </p>
        </div>
        <Link className="sc-botao sc-botao--discreta" href="/painel">
          Voltar ao resumo de hoje
        </Link>
      </header>
      <MetricasPorPeriodo
        key={enderecoDoPeriodo(consulta)}
        consultaInicial={consulta}
      />
    </div>
  );
}
