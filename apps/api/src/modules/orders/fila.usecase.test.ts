import { describe, expect, it } from "vitest";

import {
  agruparPedidosDaFila,
  atualizarFila,
  deveTocarAlerta,
  type PedidoDaFila,
} from "./fila.usecase.ts";

const agora = (id: string, status: string): PedidoDaFila => ({
  id,
  numero: Number(id),
  codigo: `SC-${id}`,
  status,
  canal: "ONLINE",
  entrega: "DELIVERY",
  cliente: `Cliente ${id}`,
  totalCentavos: 1_000,
  criadoEm: "2026-09-22T12:00:00.000Z",
  aguardandoConfirmacaoWhatsapp: false,
});

describe("fila de pedidos", () => {
  it("@spec:AC-600 identifica pedido novo sem depender de recarregar a página", () => {
    const resultado = atualizarFila(
      [agora("1", "PREPARING")],
      [agora("1", "PREPARING"), agora("2", "PENDING")],
      true,
    );

    expect(resultado.novos.map((pedido) => pedido.id)).toEqual(["2"]);
  });

  it("@spec:AC-601 separa ação, preparo e entrega preservando a ordem", () => {
    const grupos = agruparPedidosDaFila([
      agora("1", "PREPARING"),
      agora("2", "PENDING"),
      agora("3", "OUT_FOR_DELIVERY"),
    ]);

    expect(grupos.aguardandoAcao.map((pedido) => pedido.id)).toEqual(["2"]);
    expect(grupos.emPreparo.map((pedido) => pedido.id)).toEqual(["1"]);
    expect(grupos.emEntrega.map((pedido) => pedido.id)).toEqual(["3"]);
  });

  it("@spec:AC-602 substitui a leitura antiga e recupera o pedido que chegou na queda", () => {
    const resultado = atualizarFila(
      [agora("1", "PENDING")],
      [agora("1", "PENDING"), agora("2", "PENDING")],
      true,
    );

    expect(resultado.pedidos).toHaveLength(2);
    expect(resultado.novos).toHaveLength(1);
  });

  it("@spec:AC-603 silenciar remove apenas o som, não o alerta visual", () => {
    const novos = [agora("2", "PENDING")];

    expect(deveTocarAlerta(novos, false)).toBe(true);
    expect(deveTocarAlerta(novos, true)).toBe(false);
    expect(novos).toHaveLength(1);
  });
});
