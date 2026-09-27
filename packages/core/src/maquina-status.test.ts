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

describe("o botão diz o que o passo faz", () => {
  it("@spec:AC-604 cada passo do caminho de entrega é oferecido com o verbo da ação", () => {
    expect(proximosStatus("PENDING", "DELIVERY")).toEqual([
      { status: "ACCEPTED", rotulo: "Aceito", acao: "Aceitar pedido" },
      { status: "CANCELLED", rotulo: "Cancelado", acao: "Recusar pedido" },
    ]);
    expect(
      proximosStatus("ACCEPTED", "DELIVERY").map((opcao) => opcao.acao),
    ).toEqual(["Iniciar preparo", "Cancelar pedido"]);
    expect(
      proximosStatus("OUT_FOR_DELIVERY", "DELIVERY").map((opcao) => opcao.acao),
    ).toEqual(["Concluir pedido", "Cancelar pedido"]);
  });

  it("@spec:AC-605 a retirada termina em pronto para retirada e depois concluído, sem entrega no caminho", () => {
    let atual = "PENDING";
    const visitados: string[] = [];
    for (const proximo of [
      "ACCEPTED",
      "PREPARING",
      "READY_FOR_PICKUP",
      "COMPLETED",
    ]) {
      const decisao = decidirTransicao(atual, proximo, "PICKUP");
      expect(decisao.ok, `${atual} → ${proximo}`).toBe(true);
      if (decisao.ok) atual = decisao.para;
      visitados.push(
        ...proximosStatus(atual, "PICKUP").map((opcao) => opcao.status),
      );
    }
    expect(visitados).not.toContain("OUT_FOR_DELIVERY");
  });

  it("@spec:AC-606 status desconhecido não é caminho, nem de ida nem de volta", () => {
    expect(decidirTransicao("PENDING", "ENTREGUE", "DELIVERY")).toEqual({
      ok: false,
      explicacao: "Este status não existe.",
    });
    expect(decidirTransicao("CANCELLED", "PENDING", "DELIVERY").ok).toBe(false);
    expect(proximosStatus("CANCELLED", "DELIVERY")).toEqual([]);
  });

  it("@spec:AC-607 motivo só com espaços não conta como motivo, e o motivo guardado vem aparado", () => {
    expect(
      decidirTransicao("PREPARING", "CANCELLED", "DELIVERY", "   ").ok,
    ).toBe(false);
    expect(
      decidirTransicao("PREPARING", "CANCELLED", "DELIVERY", "  Sem gás  "),
    ).toMatchObject({ ok: true, motivo: "Sem gás" });
    // Passo que não cancela não carrega motivo, mesmo que um tenha sido dado.
    expect(
      decidirTransicao("PENDING", "ACCEPTED", "DELIVERY", "qualquer coisa"),
    ).toMatchObject({ ok: true, motivo: null, contaComoVenda: true });
  });
});
