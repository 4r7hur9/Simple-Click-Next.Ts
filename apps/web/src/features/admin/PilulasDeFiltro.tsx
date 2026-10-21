/**
 * Os filtros em pílulas, com o número de cada um (lojas por situação, contas
 * por tipo). Todos ficam visíveis o tempo todo e o escolhido leva o verde da
 * marca. Um filtro pode pedir atenção (as lojas pendentes): ele ganha o tom
 * de atenção enquanto houver o que fazer.
 */

import type { ReactNode } from "react";

export interface PilulaDeFiltro<V extends string> {
  readonly valor: V;
  readonly rotulo: string;
  readonly quantidade?: number | undefined;
  /** Destaca a pílula quando há quantidade: é a fila que espera por alguém. */
  readonly destaque?: boolean | undefined;
}

const BASE =
  "inline-flex min-h-[var(--altura-toque)] items-center gap-2 rounded-full border px-4 text-sm font-medium outline-none motion-safe:transition-colors motion-safe:duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cor-foco)]";

export function PilulasDeFiltro<V extends string>({
  rotulo,
  pilulas,
  valor,
  aoEscolher,
}: {
  readonly rotulo: string;
  readonly pilulas: readonly PilulaDeFiltro<V>[];
  readonly valor: V;
  readonly aoEscolher: (valor: V) => void;
}): ReactNode {
  return (
    <nav aria-label={rotulo}>
      <ul className="flex flex-wrap gap-3">
        {pilulas.map((pilula) => {
          const escolhida = pilula.valor === valor;
          const chama =
            pilula.destaque === true && (pilula.quantidade ?? 0) > 0;
          const estilo = escolhida
            ? "border-transparent bg-[var(--cor-primaria)] font-semibold text-[var(--cor-em-primaria)]"
            : chama
              ? "border-[var(--cor-atencao)] bg-[var(--cor-atencao-suave)] text-[var(--cor-tinta)] hover:border-[var(--cor-tinta)]"
              : "border-[var(--cor-borda-forte)] bg-transparent text-[var(--cor-tinta-suave)] hover:border-[var(--cor-tinta)] hover:text-[var(--cor-tinta)]";
          return (
            <li key={pilula.valor}>
              <button
                type="button"
                aria-pressed={escolhida}
                onClick={() => aoEscolher(pilula.valor)}
                className={`${BASE} ${estilo}`}
              >
                {pilula.rotulo}
                {pilula.quantidade !== undefined && (
                  <span
                    className={`rounded-full px-2 text-xs font-semibold tabular-nums ${
                      escolhida
                        ? "bg-[var(--cor-em-primaria)] text-[var(--cor-primaria)]"
                        : chama
                          ? "bg-[var(--cor-atencao)] text-[var(--cor-fundo)]"
                          : "bg-[var(--cor-superficie-alta)] text-[var(--cor-tinta)]"
                    }`}
                  >
                    {pilula.quantidade}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
