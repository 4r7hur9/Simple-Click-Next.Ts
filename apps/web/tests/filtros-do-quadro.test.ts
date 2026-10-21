import { describe, expect, it } from "vitest";

import { lerReais } from "../src/lib/filtros-do-painel.ts";
import {
  SEM_FILTROS_DO_QUADRO,
  filtrarPedidos,
  filtrosLigados,
  type PedidoDoQuadro,
} from "../src/lib/quadro-de-pedidos.ts";

function pedido(extra: Partial<PedidoDoQuadro>): PedidoDoQuadro {
  return {
    id: "p",
    numero: 1,
    codigo: "PED-0001",
    status: "PENDING",
    canal: "ONLINE",
    entrega: "DELIVERY",
    cliente: "Maria Conceição",
    buscaTelefone: "5511988887777",
    totalCentavos: 5000,
    criadoEm: "2026-10-19T12:00:00.000Z",
    aguardandoConfirmacaoWhatsapp: false,
    pagamento: "PIX",
    itens: [],
    itensAMais: 0,
    motivoCancelamento: null,
    deOutroDia: false,
    ...extra,
  };
}

const DIA = [
  pedido({ id: "a", numero: 41 }),
  pedido({
    id: "b",
    numero: 42,
    cliente: "João Pereira",
    buscaTelefone: "5521977776666",
    entrega: "PICKUP",
    pagamento: "CASH",
    totalCentavos: 12000,
    status: "COMPLETED",
  }),
  pedido({
    id: "c",
    numero: 43,
    cliente: "Ana",
    buscaTelefone: null,
    pagamento: null,
    totalCentavos: 800,
    status: "CANCELLED",
  }),
];

const ids = (filtros: Partial<typeof SEM_FILTROS_DO_QUADRO>) =>
  filtrarPedidos(DIA, { ...SEM_FILTROS_DO_QUADRO, ...filtros }).map((p) => p.id);

describe("lerReais", () => {
  it("lê reais digitados de vários jeitos", () => {
    expect(lerReais("12,50")).toBe(1250);
    expect(lerReais("12.5")).toBe(1250);
    expect(lerReais("R$ 1.250,00")).toBe(125000);
    expect(lerReais("7")).toBe(700);
    expect(lerReais("")).toBeNull();
    expect(lerReais("abc")).toBeNull();
  });
});

describe("filtrarPedidos (card #77)", () => {
  it("sem filtro devolve tudo", () => {
    expect(ids({})).toEqual(["a", "b", "c"]);
    expect(filtrosLigados(SEM_FILTROS_DO_QUADRO)).toBe(0);
  });

  it("busca por número (com ou sem #), nome sem acento e telefone", () => {
    expect(ids({ busca: "42" })).toEqual(["b"]);
    expect(ids({ busca: "#43" })).toEqual(["c"]);
    expect(ids({ busca: "conceicao" })).toEqual(["a"]);
    expect(ids({ busca: "(21) 97777" })).toEqual(["b"]);
    expect(ids({ busca: "zzz" })).toEqual([]);
  });

  it("filtra por tipo, pagamento, etapa e faixa de valor", () => {
    expect(ids({ tipo: "PICKUP" })).toEqual(["b"]);
    expect(ids({ pagamento: "CASH" })).toEqual(["b"]);
    expect(ids({ pagamento: "a-combinar" })).toEqual(["c"]);
    expect(ids({ etapa: "CANCELLED" })).toEqual(["c"]);
    expect(ids({ valorMin: "60" })).toEqual(["b"]);
    expect(ids({ valorMax: "50" })).toEqual(["a", "c"]);
    expect(ids({ valorMin: "10", valorMax: "60" })).toEqual(["a"]);
    expect(
      filtrosLigados({ ...SEM_FILTROS_DO_QUADRO, tipo: "PICKUP", valorMin: "1" }),
    ).toBe(2);
  });
});
