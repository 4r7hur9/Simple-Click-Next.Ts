/**
 * A situação do pedido como o dono a lê de longe, com a cozinha cheia.
 *
 * O tom segue o que o pedido pede do dono: atenção enquanto espera por ele,
 * informação enquanto anda na cozinha, sucesso quando está pronto ou entregue
 * e erro quando foi cancelado. O sentido está no texto; a cor só ajuda.
 */
import { Selo, type TomDeSelo } from "@simpleclick/ui";

import { rotuloDaEtapa } from "../../lib/quadro-de-pedidos.ts";

const TONS_DE_STATUS: Readonly<Record<string, TomDeSelo>> = {
  PENDING: "atencao",
  ACCEPTED: "info",
  PREPARING: "info",
  READY_FOR_PICKUP: "sucesso",
  OUT_FOR_DELIVERY: "sucesso",
  COMPLETED: "neutro",
  CANCELLED: "erro",
};

export function rotuloDoStatus(status: string): string {
  // Os nomes das seis etapas do quadro (card #33), os mesmos da coluna.
  return rotuloDaEtapa(status);
}

export function tomDoStatus(status: string): TomDeSelo {
  return TONS_DE_STATUS[status] ?? "neutro";
}

export function SeloDeStatus({
  status,
  rotulo = rotuloDoStatus(status),
  grande = false,
}: {
  readonly status: string;
  /** Texto próprio, quando a tela já tem um nome para a situação. */
  readonly rotulo?: string | undefined;
  /** Para o topo do pedido aberto, lido de longe. */
  readonly grande?: boolean | undefined;
}) {
  return (
    <Selo
      tom={tomDoStatus(status)}
      className={grande ? "px-4 py-2 text-base" : undefined}
    >
      {rotulo}
    </Selo>
  );
}
