import { describe, expect, it } from "vitest";

import {
  ITENS_NO_RESUMO,
  projetarPedidoDoQuadro,
  type LinhaDoQuadro,
} from "./quadro.usecase.ts";

const INICIO_DO_DIA = new Date("2026-10-16T03:00:00.000Z");

function linha(sobrescrita: Partial<LinhaDoQuadro> = {}): LinhaDoQuadro {
  return {
    id: "9b1f2c3d-0000-4000-8000-000000000001",
    number: 42n,
    code: "A-0042",
    status: "PREPARING",
    channel: "ONLINE",
    fulfillment: "PICKUP",
    totalCents: 4_590n,
    placedAt: new Date("2026-10-16T15:34:00.000Z"),
    whatsappClickedAt: null,
    whatsappConfirmedAt: null,
    paymentMethod: "PIX",
    cancelReason: null,
    contato: { name: "Maria Conceição" },
    itens: [{ productName: "Pastel de Carne", quantity: 2 }],
    ...sobrescrita,
  };
}

describe("projeção do pedido no quadro do dia", () => {
  it("leva número, cliente, valor, forma de pagamento e itens resumidos", () => {
    expect(projetarPedidoDoQuadro(linha(), INICIO_DO_DIA)).toEqual({
      id: "9b1f2c3d-0000-4000-8000-000000000001",
      numero: 42,
      codigo: "A-0042",
      status: "PREPARING",
      canal: "ONLINE",
      entrega: "PICKUP",
      cliente: "Maria Conceição",
      buscaTelefone: null,
      totalCentavos: 4_590,
      criadoEm: "2026-10-16T15:34:00.000Z",
      aguardandoConfirmacaoWhatsapp: false,
      pagamento: "PIX",
      itens: [{ quantidade: 2, nome: "Pastel de Carne" }],
      itensAMais: 0,
      motivoCancelamento: null,
      deOutroDia: false,
    });
  });

  it("resume só os primeiros itens e conta os que ficaram de fora", () => {
    const itens = Array.from({ length: ITENS_NO_RESUMO + 2 }, (_, i) => ({
      productName: `Item ${i}`,
      quantity: 1,
    }));
    const projetado = projetarPedidoDoQuadro(linha({ itens }), INICIO_DO_DIA);
    expect(projetado.itens).toHaveLength(ITENS_NO_RESUMO);
    expect(projetado.itensAMais).toBe(2);
  });

  it("marca o pedido que entrou antes do dia mostrado", () => {
    const antigo = linha({ placedAt: new Date("2026-10-15T22:00:00.000Z") });
    expect(projetarPedidoDoQuadro(antigo, INICIO_DO_DIA).deOutroDia).toBe(true);
  });

  it("devolve o motivo do cancelamento e não carrega telefone nem endereço", () => {
    const cancelado = projetarPedidoDoQuadro(
      linha({ status: "CANCELLED", cancelReason: "Acabou o produto" }),
      INICIO_DO_DIA,
    );
    expect(cancelado.motivoCancelamento).toBe("Acabou o produto");
    expect(Object.keys(cancelado)).not.toContain("telefone");
    expect(Object.keys(cancelado)).not.toContain("endereco");
  });
});
