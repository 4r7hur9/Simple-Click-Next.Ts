/**
 * Prova da repartição do faturamento (T-801): os três números, o cancelado à
 * parte, o canal somado, e a comparação com o período anterior.
 */
import { describe, expect, it } from "vitest";

import { resumirVendas, STATUS_DO_PEDIDO } from "@simpleclick/core";

import {
  compararPeriodos,
  REGRA_DE_VENDA,
  resumirPeriodo,
  STATUS_QUE_CONTAM_COMO_VENDA,
  variacao,
  type GrupoDePedidos,
} from "./faturamento.ts";

function grupo(
  status: string,
  quantidade: number,
  totalCentavos: number,
  extras: Partial<GrupoDePedidos> = {},
): GrupoDePedidos {
  return {
    status,
    aguardandoConfirmacaoWhatsapp: false,
    canal: "ONLINE",
    quantidade,
    totalCentavos,
    ...extras,
  };
}

describe("vendido, concluído e em andamento (AC-817)", () => {
  it("@spec:AC-817 o vendido é a soma do concluído com o em andamento, e cada parcela é rotulada", () => {
    const resumo = resumirPeriodo([
      grupo("COMPLETED", 3, 9_000),
      grupo("PREPARING", 2, 5_000),
      grupo("OUT_FOR_DELIVERY", 1, 2_000),
      grupo("ACCEPTED", 1, 1_000),
      grupo("PENDING", 4, 8_000),
    ]);

    expect(resumo.vendidoCentavos).toBe(17_000);
    expect(resumo.concluidos).toEqual({ quantidade: 3, totalCentavos: 9_000 });
    expect(resumo.emAndamento).toEqual({ quantidade: 4, totalCentavos: 8_000 });
    expect(
      resumo.concluidos.totalCentavos + resumo.emAndamento.totalCentavos,
    ).toBe(resumo.vendidoCentavos);
    expect(resumo.pedidos).toBe(7);
    expect(resumo.ticketMedioCentavos).toBe(Math.round(17_000 / 7));
    // O que aguarda o dono não é venda ainda, e aparece como em aberto.
    expect(resumo.emAberto).toEqual({ quantidade: 4, totalCentavos: 8_000 });
  });

  it("a lista de status que contam como venda é derivada da régua do core, não copiada", () => {
    for (const status of STATUS_DO_PEDIDO) {
      const resumo = resumirVendas([
        { status, totalCentavos: 100, aguardandoConfirmacaoWhatsapp: false },
      ]);
      expect(STATUS_QUE_CONTAM_COMO_VENDA.includes(status)).toBe(
        resumo.faturamentoCentavos === 100,
      );
    }
    expect(STATUS_QUE_CONTAM_COMO_VENDA).not.toContain("CANCELLED");
    expect(STATUS_QUE_CONTAM_COMO_VENDA).not.toContain("PENDING");
  });
});

describe("cancelado não infla o faturamento (AC-812)", () => {
  it("@spec:AC-812 dois cancelados em dez pedidos ficam fora do vendido, contados à parte, e a regra está escrita para o dono", () => {
    const resumo = resumirPeriodo([
      grupo("COMPLETED", 8, 40_000),
      grupo("CANCELLED", 2, 10_000),
    ]);

    expect(resumo.vendidoCentavos).toBe(40_000);
    expect(resumo.pedidos).toBe(8);
    expect(resumo.cancelados).toEqual({ quantidade: 2, totalCentavos: 10_000 });
    expect(REGRA_DE_VENDA).toContain("cancelado");
    expect(REGRA_DE_VENDA).toContain("aceitou");
  });

  it("@spec:AC-812 o pedido que abriu o WhatsApp sem confirmar fica fora e aparece à parte (AC-611); depois de aceito, é venda", () => {
    const resumo = resumirPeriodo([
      grupo("PENDING", 2, 4_000, { aguardandoConfirmacaoWhatsapp: true }),
      grupo("ACCEPTED", 1, 9_000, { aguardandoConfirmacaoWhatsapp: true }),
    ]);

    expect(resumo.naoConfirmados).toEqual({
      quantidade: 2,
      totalCentavos: 4_000,
    });
    expect(resumo.vendidoCentavos).toBe(9_000);
    expect(resumo.emAberto.quantidade).toBe(0);
  });

  it("a repartição bate com a régua do core em qualquer combinação de status e confirmação", () => {
    for (const status of STATUS_DO_PEDIDO) {
      for (const aguardando of [false, true]) {
        const pedido = {
          status,
          totalCentavos: 700,
          aguardandoConfirmacaoWhatsapp: aguardando,
        };
        const doCore = resumirVendas([pedido]);
        const daqui = resumirPeriodo([
          grupo(status, 1, 700, { aguardandoConfirmacaoWhatsapp: aguardando }),
        ]);
        expect(daqui.vendidoCentavos).toBe(doCore.faturamentoCentavos);
        expect(daqui.cancelados.quantidade).toBe(doCore.cancelados.quantidade);
        expect(daqui.naoConfirmados.quantidade).toBe(
          doCore.naoConfirmados.quantidade,
        );
        expect(daqui.emAberto.quantidade).toBe(doCore.aguardando.quantidade);
      }
    }
  });
});

describe("site e balcão somados, e divididos (AC-810)", () => {
  it("@spec:AC-810 o vendido soma os dois canais e a divisão mostra quanto é digital", () => {
    const resumo = resumirPeriodo([
      grupo("COMPLETED", 3, 9_000, { canal: "ONLINE" }),
      grupo("PREPARING", 2, 6_000, { canal: "MANUAL" }),
      grupo("CANCELLED", 1, 5_000, { canal: "MANUAL" }),
    ]);

    expect(resumo.vendidoCentavos).toBe(15_000);
    expect(resumo.porCanal.site).toEqual({
      quantidade: 3,
      totalCentavos: 9_000,
    });
    expect(resumo.porCanal.balcao).toEqual({
      quantidade: 2,
      totalCentavos: 6_000,
    });
    expect(
      resumo.porCanal.site.totalCentavos + resumo.porCanal.balcao.totalCentavos,
    ).toBe(resumo.vendidoCentavos);
  });
});

describe("comparação com o período anterior (AC-802)", () => {
  it("@spec:AC-802 R$ 500 hoje contra R$ 400 ontem é +R$ 100, subiu 25%", () => {
    const hoje = resumirPeriodo([grupo("COMPLETED", 5, 50_000)]);
    const ontem = resumirPeriodo([grupo("COMPLETED", 4, 40_000)]);
    const comparacao = compararPeriodos(hoje, ontem, {
      de: "2026-09-26",
      ate: "2026-09-26",
      fim: "2026-09-26T18:00:00.000Z",
      parcial: true,
    });

    expect(comparacao.vendidoCentavos).toEqual({
      atual: 50_000,
      anterior: 40_000,
      diferenca: 10_000,
      variacaoPorCento: 25,
      direcao: "subiu",
    });
    expect(comparacao.pedidos.direcao).toBe("subiu");
    expect(comparacao.periodoAnterior).toEqual({
      de: "2026-09-26",
      ate: "2026-09-26",
      fim: "2026-09-26T18:00:00.000Z",
      parcial: true,
    });
  });

  it("queda, empate e período anterior sem venda têm direção própria", () => {
    expect(variacao(30_000, 40_000)).toMatchObject({
      diferenca: -10_000,
      variacaoPorCento: -25,
      direcao: "caiu",
    });
    expect(variacao(400, 400)).toMatchObject({
      variacaoPorCento: 0,
      direcao: "igual",
    });
    expect(variacao(400, 0)).toMatchObject({
      variacaoPorCento: null,
      direcao: "sem-base",
    });
    expect(variacao(0, 0)).toMatchObject({ direcao: "igual" });
  });
});
