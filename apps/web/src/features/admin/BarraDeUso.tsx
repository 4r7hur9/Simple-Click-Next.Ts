/**
 * A barra de uso de um limite: quanto já se usou do que é permitido. Verde
 * enquanto sobra folga, âmbar perto do limite (80%) e vermelha no limite. A
 * informação não depende só da cor: o número fica ao lado e a barra é um
 * `progressbar` com o valor para o leitor de tela.
 */

import { usoNaBarra } from "./apresentacao.ts";

const COR_DA_BARRA = {
  normal: "bg-[var(--cor-primaria)]",
  atencao: "bg-[var(--cor-atencao)]",
  perigo: "bg-[var(--cor-erro)]",
} as const;

export function BarraDeUso({
  uso,
  limite,
  rotulo,
}: {
  readonly uso: number;
  readonly limite: number;
  /** O que a barra mede, para o leitor de tela ("Produtos"). */
  readonly rotulo: string;
}) {
  const { percentual, tom } = usoNaBarra(uso, limite);
  return (
    <div
      role="progressbar"
      aria-label={`${rotulo}: ${uso} de ${limite}`}
      aria-valuemin={0}
      aria-valuemax={Math.max(limite, 1)}
      aria-valuenow={Math.min(uso, Math.max(limite, 1))}
      className="h-2 w-full overflow-hidden rounded-full bg-[var(--cor-borda-forte)]/40"
    >
      <div
        className={`h-full rounded-full ${COR_DA_BARRA[tom]}`}
        style={{ width: `${percentual}%` }}
      />
    </div>
  );
}
