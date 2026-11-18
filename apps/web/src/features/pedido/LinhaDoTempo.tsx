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
};

/** O status em linguagem de cliente, e não o código interno (AC-612). */
function rotuloDoStatus(status: string): string {
  return ROTULOS[status] ?? "Em andamento";
}

/**
 * Uma frase sobre o que o status quer dizer para quem espera.
 *
 * "Em preparo" é claro para o dono; para o cliente, a pergunta é "e agora?".
 */
function explicacaoDoStatus(status: string, entrega: string): string {
  switch (status) {
    case "PENDING":
      return "A loja recebeu seu pedido e vai confirmar em instantes.";
    case "ACCEPTED":
      return "A loja aceitou seu pedido e já vai começar a preparar.";
    case "PREPARING":
      return "Seu pedido está sendo preparado.";
    case "READY_FOR_PICKUP":
      return "Seu pedido está pronto. Pode vir buscar.";
    case "OUT_FOR_DELIVERY":
      return "Seu pedido saiu para entrega e já está a caminho.";
    case "COMPLETED":
      return entrega === "PICKUP"
        ? "Pedido retirado. Obrigado pela compra!"
        : "Pedido entregue. Obrigado pela compra!";
    case "CANCELLED":
      return "Este pedido foi cancelado pela loja.";
    default:
      return "A loja está cuidando do seu pedido.";
  }
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

/**
 * A etapa atual é a última do histórico (card #111, AC-11109): ela é marcada
 * por `aria-current="step"` e por um texto ("Agora"), e não só pela cor.
 * As anteriores ficam listadas, mais discretas.
 */
export function LinhaDoTempo({ historico }: LinhaDoTempoProps) {
  const ultima = historico.length - 1;
  return (
    <ol className="space-y-5" data-linha-do-tempo>
      {historico.map((entrada, indice) => {
        const atual = indice === ultima;
        return (
          <li
            key={`${entrada.ocorridoEm}-${indice}`}
            className="flex gap-3"
            data-passo={entrada.para}
            aria-current={atual ? "step" : undefined}
          >
            <span
              aria-hidden="true"
              className={
                atual
                  ? "mt-1 h-3 w-3 shrink-0 rounded-full bg-[var(--cor-primaria)] ring-4 ring-[var(--cor-primaria-suave)]"
                  : "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--cor-borda-forte)]"
              }
            />
            <div>
              <p
                className={
                  atual
                    ? "font-bold"
                    : "font-medium text-[var(--cor-tinta-suave)]"
                }
              >
                {rotuloDoStatus(entrada.para)}
                {atual ? (
                  <span className="ml-2 rounded-full border border-[var(--cor-primaria)] px-2 py-0.5 text-xs font-semibold">
                    Agora
                  </span>
                ) : null}
              </p>
              <p className="text-sm text-[var(--cor-tinta-suave)]">
                <time dateTime={entrada.ocorridoEm}>
                  {horario(entrada.ocorridoEm)}
                </time>
                {entrada.motivo ? ` · ${entrada.motivo}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export { explicacaoDoStatus, rotuloDoStatus };
