import { describe, expect, it } from "vitest";

import { projetarPedidoDaFila, type LinhaDaFila } from "./fila.usecase.ts";

function linha(sobrescrita: Partial<LinhaDaFila> = {}): LinhaDaFila {
  return {
    id: "9b1f2c3d-0000-4000-8000-000000000001",
    number: 42n,
    code: "A-0042",
    status: "PENDING",
    channel: "ONLINE",
    fulfillment: "PICKUP",
    totalCents: 4_590n,
    placedAt: new Date("2026-09-22T12:34:00.000Z"),
    whatsappClickedAt: null,
    whatsappConfirmedAt: null,
    contato: { name: "Maria Conceição" },
    ...sobrescrita,
  };
}

describe("projeção do pedido na fila", () => {
  it("@spec:AC-601 cada pedido leva número, horário, cliente, valor, canal e forma de entrega", () => {
    expect(projetarPedidoDaFila(linha())).toEqual({
      id: "9b1f2c3d-0000-4000-8000-000000000001",
      numero: 42,
      codigo: "A-0042",
      status: "PENDING",
      canal: "ONLINE",
      entrega: "PICKUP",
      cliente: "Maria Conceição",
      totalCentavos: 4_590,
      criadoEm: "2026-09-22T12:34:00.000Z",
      aguardandoConfirmacaoWhatsapp: false,
    });
  });

  it("@spec:AC-601 a fila não carrega telefone nem endereço do cliente", () => {
    const projetado = projetarPedidoDaFila(linha());

    expect(Object.keys(projetado).sort()).toEqual(
      [
        "aguardandoConfirmacaoWhatsapp",
        "canal",
        "cliente",
        "codigo",
        "criadoEm",
        "entrega",
        "id",
        "numero",
        "status",
        "totalCentavos",
      ].sort(),
    );
  });

  it("@spec:AC-609 só é marcado quem abriu a conversa e não confirmou o envio", () => {
    const clicou = new Date("2026-09-22T12:35:00.000Z");
    const confirmou = new Date("2026-09-22T12:36:00.000Z");

    expect(
      projetarPedidoDaFila(linha({ whatsappClickedAt: clicou }))
        .aguardandoConfirmacaoWhatsapp,
    ).toBe(true);
    expect(
      projetarPedidoDaFila(
        linha({ whatsappClickedAt: clicou, whatsappConfirmedAt: confirmou }),
      ).aguardandoConfirmacaoWhatsapp,
    ).toBe(false);
    // Loja sem WhatsApp: ninguém abre conversa, e a fila não vira suspeita.
    expect(projetarPedidoDaFila(linha()).aguardandoConfirmacaoWhatsapp).toBe(
      false,
    );
  });
});
