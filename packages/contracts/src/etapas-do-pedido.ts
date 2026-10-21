/**
 * As seis etapas do quadro de pedidos (kanban) — card #25.
 *
 * Cada etapa é um status que a API já usa; os códigos não mudaram. O que
 * muda é o nome na tela e a regra de que retirada e entrega têm caminhos
 * diferentes:
 *
 *   Pedido gerado → Confirmado → Em preparo → Retirada → Concluída     (retirada)
 *   Pedido gerado → Confirmado → Em preparo → Saiu para entrega → Concluída (entrega)
 *
 * Cancelado fica FORA do quadro. Quem decide se uma mudança é possível é a
 * máquina de status de `@simpleclick/core` (`proximosStatus`,
 * `decidirTransicao`), que a API aplica em `PATCH /v1/lojas/:apelido/pedidos/:id/status`.
 * O histórico de cada mudança é preservado (só cresce).
 */

export const ETAPAS_DO_PEDIDO = [
  {
    status: "PENDING",
    etapa: "PEDIDO_GERADO",
    rotulo: "Pedido gerado",
    formas: ["DELIVERY", "PICKUP"],
  },
  {
    status: "ACCEPTED",
    etapa: "CONFIRMADO",
    rotulo: "Confirmado",
    formas: ["DELIVERY", "PICKUP"],
  },
  {
    status: "PREPARING",
    etapa: "EM_PREPARO",
    rotulo: "Em preparo",
    formas: ["DELIVERY", "PICKUP"],
  },
  {
    status: "READY_FOR_PICKUP",
    etapa: "RETIRADA",
    rotulo: "Retirada",
    formas: ["PICKUP"],
  },
  {
    status: "OUT_FOR_DELIVERY",
    etapa: "SAIU_PARA_ENTREGA",
    rotulo: "Saiu para entrega",
    formas: ["DELIVERY"],
  },
  {
    status: "COMPLETED",
    etapa: "CONCLUIDA",
    rotulo: "Concluída",
    formas: ["DELIVERY", "PICKUP"],
  },
] as const;

export type EtapaDoPedido = (typeof ETAPAS_DO_PEDIDO)[number];

export type CodigoDaEtapa = EtapaDoPedido["etapa"];

/** Fora do quadro. */
export const STATUS_FORA_DO_QUADRO = ["CANCELLED"] as const;

export const ROTULO_DO_CANCELADO = "Cancelado";

/** Todos os status que um pedido pode ter hoje. */
export const STATUS_DOS_PEDIDOS = [
  ...ETAPAS_DO_PEDIDO.map((etapa) => etapa.status),
  ...STATUS_FORA_DO_QUADRO,
] as const;

/** A etapa de um status, ou `null` (cancelado ou desconhecido). */
export function etapaDoStatus(status: string): EtapaDoPedido | null {
  return ETAPAS_DO_PEDIDO.find((etapa) => etapa.status === status) ?? null;
}

/** As etapas por que passa um pedido de entrega (`DELIVERY`) ou retirada (`PICKUP`). */
export function etapasDaForma(forma: string): readonly EtapaDoPedido[] {
  return ETAPAS_DO_PEDIDO.filter((etapa) =>
    (etapa.formas as readonly string[]).includes(forma),
  );
}

/** O nome do status na tela, inclusive cancelado. */
export function rotuloDaEtapa(status: string): string {
  if (status === "CANCELLED") return ROTULO_DO_CANCELADO;
  return etapaDoStatus(status)?.rotulo ?? status;
}
