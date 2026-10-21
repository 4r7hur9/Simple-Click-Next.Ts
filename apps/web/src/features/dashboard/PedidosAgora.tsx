/**
 * Os pedidos de cada etapa agora, com atalho para o quadro de pedidos
 * (card #34). Vem de `detalhes.etapasAgora` (qualquer data): é o que está
 * esperando a loja neste instante, e não um número do período escolhido.
 */
import Link from "next/link";
import { ETAPAS_DO_PEDIDO } from "@simpleclick/contracts";
import { IconeAvancar } from "@simpleclick/ui";

import type { DetalhesDeMetricasNoContrato } from "../../lib/metricas.ts";

export function PedidosAgora({
  etapas,
}: {
  readonly etapas: DetalhesDeMetricasNoContrato["etapasAgora"];
}) {
  const porStatus = new Map(etapas.map((e) => [e.status, e.quantidade]));
  const abertas = ETAPAS_DO_PEDIDO.filter((e) => e.status !== "COMPLETED");
  const total = abertas.reduce((soma, e) => soma + (porStatus.get(e.status) ?? 0), 0);

  return (
    <section
      aria-labelledby="pedidos-agora"
      data-pedidos-agora
      className="sc-cartao min-w-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pedidos-agora" className="sc-cartao__titulo">
          Pedidos agora
        </h2>
        <Link
          href="/painel/pedidos"
          className="sc-botao sc-botao--discreta sc-botao--pilula"
        >
          Abrir o quadro de pedidos
          <IconeAvancar size={16} />
        </Link>
      </div>
      <p className="text-sm text-tinta-suave">
        {total === 0
          ? "Nenhum pedido esperando a loja neste momento."
          : `${total} ${total === 1 ? "pedido em andamento" : "pedidos em andamento"} agora.`}
      </p>
      <ul className="grid grid-cols-2 gap-3 min-[700px]:gap-4 min-[700px]:grid-cols-5">
        {abertas.map((etapa) => {
          const quantidade = porStatus.get(etapa.status) ?? 0;
          return (
            <li
              key={etapa.status}
              data-etapa={etapa.status}
              className={[
                "rounded-[var(--raio-botao)] border p-3",
                quantidade > 0
                  ? "border-[var(--cor-primaria)] bg-superficie"
                  : "border-borda bg-superficie",
              ].join(" ")}
            >
              <Link href="/painel/pedidos" className="block">
                <span className="block font-display text-2xl font-semibold tabular-nums">
                  {quantidade}
                </span>
                <span className="block text-xs text-tinta-suave">
                  {etapa.rotulo}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
