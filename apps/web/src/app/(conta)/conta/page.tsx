import { hojeNoFuso } from "@simpleclick/ui";
import { redirect } from "next/navigation";

import { PaginaDaConta } from "../../../features/conta/PaginaDaConta.tsx";
import { VisaoGeralDaConta } from "../../../features/conta/VisaoGeralDaConta.tsx";
import { buscarMetricasDaConta, calcularMetricas, lerPeriodoDaVisao } from "../../../lib/conta-do-cliente.ts";
import { buscarMeusPedidos } from "../../../lib/meus-pedidos.ts";
import { Erro } from "@simpleclick/ui";
import { tokenOuEntrar } from "./_token.ts";

export const metadata = { title: "Visão geral | SimpleClick" };
export const dynamic = "force-dynamic";

/** A visão geral da conta: pedidos e gastos do cliente, em todas as lojas. */
export default async function PaginaInicialDaConta({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string }>;
}) {
  const token = await tokenOuEntrar();
  const periodo = lerPeriodoDaVisao(await searchParams, hojeNoFuso("America/Sao_Paulo"));
  const [pedidos, metricas] = await Promise.all([
    buscarMeusPedidos(token),
    buscarMetricasDaConta(token, periodo),
  ]);
  if (pedidos.estado === "nao-autenticado" || metricas.estado === "nao-autenticado") redirect("/entrar");

  return (
    <PaginaDaConta
      atual="inicio"
      titulo="Visão geral"
      descricao="Acompanhe seus pedidos e seus gastos em todas as lojas."
    >
      {pedidos.estado === "indisponivel" ? (
        <Erro titulo="Não deu para carregar seu resumo" mensagem="Tente de novo em instantes." />
      ) : (
        <VisaoGeralDaConta
          periodo={periodo}
          metricas={metricas.estado === "ok" ? metricas.dados : null}
          lista={calcularMetricas(pedidos.pedidos, new Date())}
        />
      )}
    </PaginaDaConta>
  );
}
