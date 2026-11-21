/** A cópia das transições bate com `proximosStatus` do núcleo. */

import { describe, expect, it } from "vitest";

import { proximosStatus, STATUS_DO_PEDIDO } from "../../../core/src/maquina-status.ts";
import { proximosStatusDoPedido } from "./transicoes.ts";

describe("transições do pedido (cópia de packages/core)", () => {
  it("dá os mesmos próximos status do núcleo para todo status e as duas entregas", () => {
    const status = [...STATUS_DO_PEDIDO, "REJECTED", "DESCONHECIDO"];
    for (const atual of status) {
      for (const entrega of ["DELIVERY", "PICKUP"]) {
        expect(proximosStatusDoPedido(atual, entrega), `${atual}/${entrega}`).toEqual(
          proximosStatus(atual, entrega).map((o) => o.status),
        );
      }
    }
  });
});
