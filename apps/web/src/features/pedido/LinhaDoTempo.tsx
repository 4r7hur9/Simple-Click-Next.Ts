import type { AcompanhamentoNoContrato } from "@simpleclick/contracts";

type Historico = AcompanhamentoNoContrato["pedido"]["historico"];

const ROTULOS: Record<string, string> = {
  PENDING: "Pedido recebido",
  ACCEPTED: "Pedido aceito",
  PREPARING: "Em preparo",
  READY_FOR_PICKUP: "Pronto para retirada",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  COMPLETED: "Pedido concluído",
  CANCELLED: "Pedido cancelado",
  REJECTED: "Pedido recusado",
};

function rotuloDoStatus(status: string): string {
  return ROTULOS[status] ?? status;
}

function horario(data: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(data));
}

export interface LinhaDoTempoProps {
  readonly historico: Historico;
}

export function LinhaDoTempo({ historico }: LinhaDoTempoProps) {
  return (
    <ol className="space-y-5">
      {historico.map((entrada, indice) => (
        <li key={`${entrada.ocorridoEm}-${indice}`} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-1 h-3 w-3 shrink-0 rounded-full bg-[var(--cor-primaria)] ring-4 ring-[var(--cor-primaria-suave)]"
          />
          <div>
            <p className="font-semibold">{rotuloDoStatus(entrada.para)}</p>
            <p className="text-sm text-[var(--cor-tinta-suave)]">
              {horario(entrada.ocorridoEm)}
              {entrada.motivo ? ` · ${entrada.motivo}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export { rotuloDoStatus };
