import { describe, expect, it } from "vitest";

import {
  acrescentarHistorico,
  decidirTransicao,
  proximosStatus,
} from "./maquina-status.ts";

describe("máquina de status do pedido", () => {
  it("@spec:AC-604 percorre o caminho normal de entrega até concluir", () => {
    let atual = "PENDING";
    for (const proximo of [
      "ACCEPTED",
      "PREPARING",
      "OUT_FOR_DELIVERY",
      "COMPLETED",
    ]) {
      const decisao = decidirTransicao(atual, proximo, "DELIVERY");
      expect(decisao.ok).toBe(true);
      if (decisao.ok) atual = decisao.para;
    }
    expect(atual).toBe("COMPLETED");
  });

  it("@spec:AC-605 oferece pronto para retirada e não entrega para retirada local", () => {
    const opcoes = proximosStatus("PREPARING", "PICKUP");

    expect(opcoes.map((opcao) => opcao.status)).toEqual([
      "READY_FOR_PICKUP",
      "CANCELLED",
    ]);
  });

  it("@spec:AC-606 recusa voltar de concluído e mantém o caminho encerrado", () => {
    const decisao = decidirTransicao("COMPLETED", "PREPARING", "DELIVERY");

    expect(decisao).toEqual({
      ok: false,
      explicacao: "Não é possível mudar de Concluído para Em preparo.",
    });
    expect(proximosStatus("COMPLETED", "DELIVERY")).toEqual([]);
  });

  it("@spec:AC-607 exige motivo para cancelar e retira o pedido das vendas", () => {
    expect(decidirTransicao("PENDING", "CANCELLED", "DELIVERY")).toMatchObject({
      ok: false,
    });
    expect(
      decidirTransicao("PENDING", "CANCELLED", "DELIVERY", "Sem estoque"),
    ).toMatchObject({ ok: true, para: "CANCELLED", contaComoVenda: false });
  });

  it("@spec:AC-608 acrescenta histórico sem alterar entradas anteriores", () => {
    const anterior = [{ de: null, para: "PENDING" as const }];
    const depois = acrescentarHistorico(anterior, {
      de: "PENDING",
      para: "ACCEPTED",
    });

    expect(anterior).toHaveLength(1);
    expect(depois).toHaveLength(2);
    expect(depois[0]).toEqual(anterior[0]);
  });
});
