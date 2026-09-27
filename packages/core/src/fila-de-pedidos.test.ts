import { describe, expect, it } from "vitest";

import {
  agruparPedidosDaFila,
  atualizarFila,
  descreverEspera,
  deveTocarAlerta,
  minutosDeEspera,
  type PedidoDaFila,
} from "./fila-de-pedidos.ts";

function pedido(
  id: string,
  status: string,
  sobrescrita: Partial<PedidoDaFila> = {},
): PedidoDaFila {
  return {
    id,
    numero: Number(id),
    codigo: `A-${id.padStart(4, "0")}`,
    status,
    canal: "ONLINE",
    entrega: "DELIVERY",
    cliente: `Cliente ${id}`,
    totalCentavos: 1_000,
    criadoEm: "2026-09-22T12:00:00.000Z",
    aguardandoConfirmacaoWhatsapp: false,
    ...sobrescrita,
  };
}

const ids = (lista: readonly PedidoDaFila[]) => lista.map((p) => p.id);

describe("pedido novo aparece sem recarregar (AC-600)", () => {
  it("@spec:AC-600 a leitura seguinte aponta como novo só o pedido que não estava na anterior", () => {
    const resultado = atualizarFila(
      [pedido("1", "PREPARING")],
      [pedido("1", "PREPARING"), pedido("2", "PENDING")],
      true,
    );

    expect(ids(resultado.pedidos)).toEqual(["1", "2"]);
    expect(ids(resultado.novos)).toEqual(["2"]);
  });

  it("@spec:AC-600 a primeira leitura não dispara alerta para a fila que já estava lá", () => {
    // Tocar para a fila inteira ao abrir a tela ensinaria o dono a ignorar o som.
    const resultado = atualizarFila(
      [],
      [pedido("1", "PENDING"), pedido("2", "PENDING")],
      false,
    );

    expect(resultado.novos).toEqual([]);
    expect(resultado.pedidos).toHaveLength(2);
  });

  it("@spec:AC-600 pedido que mudou de status não é tratado como pedido novo", () => {
    const resultado = atualizarFila(
      [pedido("1", "PENDING")],
      [pedido("1", "ACCEPTED")],
      true,
    );

    expect(resultado.novos).toEqual([]);
  });
});

describe("a fila separa o que exige ação (AC-601)", () => {
  it("@spec:AC-601 o que aguarda o dono vem num grupo próprio, e os demais por status", () => {
    const grupos = agruparPedidosDaFila([
      pedido("1", "PREPARING"),
      pedido("2", "PENDING"),
      pedido("3", "OUT_FOR_DELIVERY"),
      pedido("4", "ACCEPTED"),
      pedido("5", "READY_FOR_PICKUP", { entrega: "PICKUP" }),
      pedido("6", "PENDING"),
    ]);

    expect(ids(grupos.aguardandoConfirmacao)).toEqual(["2", "6"]);
    expect(ids(grupos.emPreparo)).toEqual(["1", "4"]);
    expect(ids(grupos.prontoParaRetirada)).toEqual(["5"]);
    expect(ids(grupos.emEntrega)).toEqual(["3"]);
    expect(grupos.aguardandoWhatsapp).toEqual([]);
  });

  it("@spec:AC-601 concluído e cancelado não ocupam lugar na fila", () => {
    const grupos = agruparPedidosDaFila([
      pedido("1", "COMPLETED"),
      pedido("2", "CANCELLED"),
      pedido("3", "PENDING"),
    ]);

    const todos = Object.values(grupos).flat();
    expect(ids(todos)).toEqual(["3"]);
  });

  it("@spec:AC-601 status desconhecido aparece para o dono em vez de sumir", () => {
    const grupos = agruparPedidosDaFila([pedido("9", "STATUS_NOVO")]);

    expect(ids(grupos.aguardandoConfirmacao)).toEqual(["9"]);
  });

  it("@spec:AC-601 o tempo de espera é contado em minutos inteiros e dito em linguagem de balcão", () => {
    const agora = new Date("2026-09-22T13:05:30.000Z");

    expect(minutosDeEspera("2026-09-22T13:05:00.000Z", agora)).toBe(0);
    expect(minutosDeEspera("2026-09-22T13:04:00.000Z", agora)).toBe(1);
    expect(minutosDeEspera("2026-09-22T12:00:00.000Z", agora)).toBe(65);
    // Relógio da máquina atrasado não vira espera negativa.
    expect(minutosDeEspera("2026-09-22T14:00:00.000Z", agora)).toBe(0);

    expect(descreverEspera(0)).toBe("agora");
    expect(descreverEspera(1)).toBe("há 1 min");
    expect(descreverEspera(65)).toBe("há 1 h 05 min");
  });
});

describe("queda de conexão não perde pedido (AC-602)", () => {
  it("@spec:AC-602 a leitura depois da queda substitui a antiga e traz tudo o que entrou no intervalo", () => {
    const antesDaQueda = [pedido("1", "PENDING")];
    // Durante a queda, dois pedidos entraram e o primeiro foi aceito em outro
    // aparelho. A leitura seguinte é a fila INTEIRA, não um delta.
    const depois = [
      pedido("1", "ACCEPTED"),
      pedido("2", "PENDING"),
      pedido("3", "PENDING"),
    ];

    const resultado = atualizarFila(antesDaQueda, depois, true);

    expect(resultado.pedidos).toBe(depois);
    expect(ids(resultado.novos)).toEqual(["2", "3"]);
  });
});

describe("silenciar tira o som, não o alerta (AC-603)", () => {
  it("@spec:AC-603 com som ligado o pedido novo toca; silenciado não toca", () => {
    const novos = [pedido("2", "PENDING")];

    expect(deveTocarAlerta(novos, false)).toBe(true);
    expect(deveTocarAlerta(novos, true)).toBe(false);
  });

  it("@spec:AC-603 sem pedido novo nada toca, com som ligado ou não", () => {
    expect(deveTocarAlerta([], false)).toBe(false);
    expect(deveTocarAlerta([], true)).toBe(false);
  });
});

describe("pedido aguardando o WhatsApp fica à parte (AC-609)", () => {
  it("@spec:AC-609 o pedido que abriu a conversa sem confirmar fica separado dos confirmados", () => {
    const grupos = agruparPedidosDaFila([
      pedido("1", "PENDING", { aguardandoConfirmacaoWhatsapp: true }),
      pedido("2", "PENDING"),
    ]);

    expect(ids(grupos.aguardandoWhatsapp)).toEqual(["1"]);
    expect(ids(grupos.aguardandoConfirmacao)).toEqual(["2"]);
  });

  it("@spec:AC-609 depois que o dono aceita, o pedido segue o fluxo normal mesmo sem a confirmação", () => {
    // Aceitar é a decisão do dono de que o pedido é real.
    const grupos = agruparPedidosDaFila([
      pedido("1", "ACCEPTED", { aguardandoConfirmacaoWhatsapp: true }),
    ]);

    expect(ids(grupos.emPreparo)).toEqual(["1"]);
    expect(grupos.aguardandoWhatsapp).toEqual([]);
  });
});
