import { describe, expect, it } from "vitest";

import {
  resumirVendas,
  situacaoNaVenda,
  type PedidoParaVenda,
} from "./situacao-na-venda.ts";

function pedido(
  status: string,
  totalCentavos: number,
  aguardandoConfirmacaoWhatsapp = false,
): PedidoParaVenda {
  return { status, totalCentavos, aguardandoConfirmacaoWhatsapp };
}

describe("pedido fantasma não infla as métricas (AC-611)", () => {
  it("@spec:AC-611 os não confirmados aparecem à parte, contados e somados, fora do faturamento", () => {
    const resumo = resumirVendas([
      pedido("COMPLETED", 5_000),
      pedido("PREPARING", 3_000),
      pedido("PENDING", 2_500, true),
      pedido("PENDING", 1_500, true),
      pedido("PENDING", 4_000),
    ]);

    expect(resumo.faturamentoCentavos).toBe(8_000);
    expect(resumo.vendas).toEqual({ quantidade: 2, totalCentavos: 8_000 });
    expect(resumo.naoConfirmados).toEqual({
      quantidade: 2,
      totalCentavos: 4_000,
    });
    expect(resumo.aguardando).toEqual({ quantidade: 1, totalCentavos: 4_000 });
  });

  it("@spec:AC-611 o pedido que abriu o WhatsApp e não confirmou não é venda nem espera comum", () => {
    expect(situacaoNaVenda(pedido("PENDING", 1_000, true))).toBe(
      "NAO_CONFIRMADO",
    );
    expect(situacaoNaVenda(pedido("PENDING", 1_000, false))).toBe("AGUARDANDO");
  });

  it("@spec:AC-611 aceitar sem a confirmação é decisão do dono: a partir daí é venda", () => {
    expect(situacaoNaVenda(pedido("ACCEPTED", 1_000, true))).toBe("VENDA");
  });

  it("@spec:AC-611 período só com não confirmados fatura zero e diz quantos se perderam", () => {
    const resumo = resumirVendas([
      pedido("PENDING", 2_000, true),
      pedido("PENDING", 3_000, true),
    ]);

    expect(resumo.faturamentoCentavos).toBe(0);
    expect(resumo.naoConfirmados.quantidade).toBe(2);
  });
});

describe("cancelado sai das vendas (AC-607)", () => {
  it("@spec:AC-607 recusado ou cancelado nunca conta como venda, em qualquer etapa", () => {
    const resumo = resumirVendas([
      pedido("COMPLETED", 5_000),
      pedido("CANCELLED", 7_000),
      pedido("CANCELLED", 1_000, true),
    ]);

    expect(situacaoNaVenda(pedido("CANCELLED", 7_000))).toBe("CANCELADO");
    expect(resumo.faturamentoCentavos).toBe(5_000);
    expect(resumo.cancelados).toEqual({ quantidade: 2, totalCentavos: 8_000 });
  });
});

describe("o que é venda", () => {
  it("@spec:AC-611 todo status de aceito em diante é venda; aguardando não é", () => {
    for (const status of [
      "ACCEPTED",
      "PREPARING",
      "READY_FOR_PICKUP",
      "OUT_FOR_DELIVERY",
      "COMPLETED",
    ]) {
      expect(situacaoNaVenda(pedido(status, 100)), status).toBe("VENDA");
    }
    expect(situacaoNaVenda(pedido("PENDING", 100))).toBe("AGUARDANDO");
  });

  it("@spec:AC-611 o resumo de nada é zero em tudo, sem ponto flutuante", () => {
    const resumo = resumirVendas([]);

    expect(resumo).toEqual({
      faturamentoCentavos: 0,
      vendas: { quantidade: 0, totalCentavos: 0 },
      aguardando: { quantidade: 0, totalCentavos: 0 },
      naoConfirmados: { quantidade: 0, totalCentavos: 0 },
      cancelados: { quantidade: 0, totalCentavos: 0 },
    });
  });
});
