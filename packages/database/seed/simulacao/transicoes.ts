/**
 * As transições de status do pedido, copiadas de `proximosStatus` em
 * `packages/core/src/maquina-status.ts`.
 *
 * É cópia de propósito: pela tabela de fronteiras, `pkg-database` não importa
 * `pkg-core`. `transicoes.test.ts` compara esta tabela com a do núcleo para
 * todos os status e as duas formas de entrega; se o núcleo mudar, o teste falha.
 */

const STATUS_CONHECIDOS = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
] as const;

/** Os próximos status permitidos a partir de `atual`, conforme a entrega. */
export function proximosStatusDoPedido(atual: string, entrega: string): readonly string[] {
  if (!(STATUS_CONHECIDOS as readonly string[]).includes(atual)) return [];
  switch (atual) {
    case "PENDING":
      return ["ACCEPTED", "CANCELLED"];
    case "ACCEPTED":
      return ["PREPARING", "CANCELLED"];
    case "PREPARING":
      return entrega === "PICKUP"
        ? ["READY_FOR_PICKUP", "CANCELLED"]
        : ["OUT_FOR_DELIVERY", "CANCELLED"];
    case "READY_FOR_PICKUP":
    case "OUT_FOR_DELIVERY":
      return ["COMPLETED", "CANCELLED"];
    default:
      return [];
  }
}
