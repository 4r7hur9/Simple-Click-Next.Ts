/**
 * A faixa de números do topo das páginas do catálogo (Estoque, Variações,
 * Opções): um cartão por número, com o tom de atenção quando pede ação.
 */
import type { ReactNode } from "react";

export interface Indicador {
  readonly rotulo: string;
  readonly valor: ReactNode;
  readonly detalhe?: string;
  /** Pinta o número quando ele pede atenção (algo em falta, por exemplo). */
  readonly tom?: "atencao" | "erro";
}

const COR_DO_TOM = {
  atencao: "text-[var(--cor-atencao)]",
  erro: "text-[var(--cor-erro)]",
} as const;

export function Indicadores({
  rotulo,
  itens,
}: {
  readonly rotulo: string;
  readonly itens: readonly Indicador[];
}) {
  return (
    <section aria-label={rotulo} className="mt-8">
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
        {itens.map((item) => (
          <li
            key={item.rotulo}
            className="rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] p-4 sm:p-5"
          >
            <p className="text-sm font-medium text-[var(--cor-tinta-suave)]">
              {item.rotulo}
            </p>
            <p
              className={`mt-2 font-[family-name:var(--fonte-titulo)] text-xl font-semibold tracking-[-0.03em] [overflow-wrap:anywhere] sm:text-3xl ${item.tom === undefined ? "" : COR_DO_TOM[item.tom]}`}
            >
              {item.valor}
            </p>
            {item.detalhe !== undefined ? (
              <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
                {item.detalhe}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
