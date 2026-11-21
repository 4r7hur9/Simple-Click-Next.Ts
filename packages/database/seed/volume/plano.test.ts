import { describe, expect, it } from "vitest";

import { lojaDeTeste, REFERENCIA, SEMENTE } from "./apoio.ts";
import {
  JANELA_EM_DIAS,
  MAXIMO_POR_LOJA,
  MINIMO_POR_LOJA,
  PEDIDOS_DO_VOLUME,
  PEDIDOS_RECENTES_POR_LOJA,
  PRIMEIRO_NUMERO_DO_VOLUME,
} from "./parametros.ts";
import {
  caminhoDoPedido,
  caminhoEhValido,
  distribuirPedidos,
  hashDaLoja,
  hashDoPlano,
  idsDosPedidos,
  montarPlanoDaLoja,
  quantosClientes,
} from "./plano.ts";

const DIA = 86_400_000;

describe("distribuirPedidos", () => {
  it.each(["sc-2026", "outra", "x", "semente-longa-123"])(
    "[CA-1] soma exatamente 100.000, com 200 a 4.000 por loja (semente %s)",
    (semente) => {
      const q = distribuirPedidos(semente, 100);
      expect(q).toHaveLength(100);
      expect(q.reduce((a, b) => a + b, 0)).toBe(PEDIDOS_DO_VOLUME);
      expect(Math.min(...q)).toBeGreaterThanOrEqual(MINIMO_POR_LOJA);
      expect(Math.max(...q)).toBeLessThanOrEqual(MAXIMO_POR_LOJA);
    },
  );

  it("[CA-2] é determinística, e outra semente muda a distribuição", () => {
    expect(distribuirPedidos("sc-2026", 100)).toEqual(distribuirPedidos("sc-2026", 100));
    expect(distribuirPedidos("sc-2026", 100)).not.toEqual(distribuirPedidos("outra", 100));
  });

  it("[CA-1] respeita o limite superior mesmo com poucas lojas (trava e redistribui)", () => {
    const q = distribuirPedidos("a", 30, 100_000, 200, 4_000);
    expect(q.reduce((a, b) => a + b, 0)).toBe(100_000);
    expect(Math.max(...q)).toBeLessThanOrEqual(4_000);
    expect(() => distribuirPedidos("a", 10, 100_000, 200, 4_000)).toThrow(/impossível/);
  });
});

describe("montarPlanoDaLoja", () => {
  const loja = lojaDeTeste(7);
  const plano = montarPlanoDaLoja(SEMENTE, REFERENCIA, loja, 500);

  it("[CA-2] mesmos parâmetros dão o mesmo hash; outra semente ou referência mudam", () => {
    expect(hashDaLoja(montarPlanoDaLoja(SEMENTE, REFERENCIA, loja, 500))).toBe(hashDaLoja(plano));
    expect(hashDaLoja(montarPlanoDaLoja("outra", REFERENCIA, loja, 500))).not.toBe(hashDaLoja(plano));
    expect(hashDaLoja(montarPlanoDaLoja(SEMENTE, new Date(REFERENCIA.getTime() + 3_600_000), loja, 500))).not.toBe(hashDaLoja(plano));
    expect(hashDoPlano(["a", "b"])).toBe(hashDoPlano(["a", "b"]));
  });

  it("[CA-1] gera exatamente a quantidade pedida, numerada de 1011 em diante e em ordem cronológica", () => {
    expect(plano.pedidos).toHaveLength(500);
    expect(plano.pedidos.map((p) => p.numero)).toEqual(Array.from({ length: 500 }, (_v, i) => PRIMEIRO_NUMERO_DO_VOLUME + i));
    const tempos = plano.pedidos.map((p) => p.feitoEm.getTime());
    expect([...tempos].sort((a, b) => a - b)).toEqual(tempos);
    expect(new Set(idsDosPedidos(plano)).size).toBe(500);
    expect(new Set(plano.pedidos.map((p) => p.token)).size).toBe(500);
    expect(new Set(plano.pedidos.map((p) => p.codigo)).size).toBe(500);
    expect(plano.pedidos[0]!.codigo).toBe("A-1011");
  });

  it("[CA-2] a janela é [ref − 19 d, ref) e nada é anterior à aprovação da loja nem posterior à referência", () => {
    const inicio = REFERENCIA.getTime() - JANELA_EM_DIAS * DIA;
    for (const p of plano.pedidos) {
      expect(p.feitoEm.getTime()).toBeGreaterThanOrEqual(inicio);
      expect(p.feitoEm.getTime()).toBeGreaterThanOrEqual(loja.aprovadaEm.getTime());
      for (const h of p.historico) expect(h.quando.getTime()).toBeLessThanOrEqual(REFERENCIA.getTime());
      expect(p.atualizadoEm.getTime()).toBeLessThanOrEqual(REFERENCIA.getTime());
    }
  });

  it("[CA-2] o histórico começa em PENDING, encadeia transições permitidas e termina no status do pedido", () => {
    for (const p of plano.pedidos) {
      const caminho = p.historico.map((h) => h.para);
      expect(p.historico[0]!.de).toBeNull();
      expect(caminho[0]).toBe("PENDING");
      expect(caminhoEhValido(caminho, p.entrega)).toBe(true);
      expect(caminho[caminho.length - 1]).toBe(p.status);
      p.historico.slice(1).forEach((h, i) => expect(h.de).toBe(p.historico[i]!.para));
      expect(p.aceitoEm?.getTime() ?? null).toBe(p.historico.find((h) => h.para === "ACCEPTED")?.quando.getTime() ?? null);
      expect(p.concluidoEm?.getTime() ?? null).toBe(p.historico.find((h) => h.para === "COMPLETED")?.quando.getTime() ?? null);
      expect(p.canceladoEm?.getTime() ?? null).toBe(p.historico.find((h) => h.para === "CANCELLED")?.quando.getTime() ?? null);
    }
  });

  it("[CA-6] deixa 10 pedidos em andamento (fila) nas últimas 6 h e os demais terminam", () => {
    const abertos = plano.pedidos.filter((p) => !["COMPLETED", "CANCELLED"].includes(p.status));
    expect(abertos).toHaveLength(PEDIDOS_RECENTES_POR_LOJA);
    for (const p of abertos) {
      expect(REFERENCIA.getTime() - p.feitoEm.getTime()).toBeLessThanOrEqual(6 * 3_600_000);
    }
    const terminais = plano.pedidos.filter((p) => ["COMPLETED", "CANCELLED"].includes(p.status));
    const cancelados = terminais.filter((p) => p.status === "CANCELLED").length;
    expect(cancelados / terminais.length).toBeGreaterThan(0.04);
    expect(cancelados / terminais.length).toBeLessThan(0.2);
  });

  it("[CA-2] itens na convenção do checkout: unit = produto + acréscimos, line = unit × quantidade, sem WHOLESALE", () => {
    for (const p of plano.pedidos) {
      expect(p.itens.length).toBeGreaterThanOrEqual(1);
      expect(p.itens.length).toBeLessThanOrEqual(3);
      for (const i of p.itens) {
        expect(i.quantidade).toBeGreaterThanOrEqual(1);
        expect(i.quantidade).toBeLessThanOrEqual(3);
        expect(i.precoUnitario).toBe(i.modelo.precoBase + i.acrescimoPorUnidade);
        expect(i.total).toBe(i.precoUnitario * i.quantidade);
        expect(Number.isInteger(i.total)).toBe(true);
      }
      expect(p.subtotal).toBe(p.itens.reduce((s, i) => s + i.total, 0));
      expect(p.total).toBe(p.subtotal + p.frete);
      expect(p.frete).toBe(p.entrega === "DELIVERY" ? loja.frete : 0);
    }
  });

  it("[CA-2] cria clientes sintéticos (mínimo 30), agregados batem e a identidade liga só 1 cliente nas 5 primeiras lojas", () => {
    expect(plano.clientes).toHaveLength(quantosClientes(500));
    expect(quantosClientes(100)).toBe(30);
    expect(quantosClientes(4000)).toBe(667);
    const ids = new Set(plano.clientes.map((c) => c.id));
    expect(ids.size).toBe(plano.clientes.length);
    expect(new Set(plano.clientes.map((c) => c.telefone)).size).toBe(plano.clientes.length);
    for (const c of plano.clientes) {
      expect(c.telefone).toMatch(/^\+5585977\d{6}$/);
      if (c.email !== null) expect(c.email).toMatch(/@volume\.simulacao\.test$/);
    }
    for (const c of plano.clientes) {
      const meus = plano.pedidos.filter((p) => p.clienteId === c.id);
      expect(c.pedidos).toBe(meus.filter((p) => p.status !== "CANCELLED").length);
      expect(c.gasto).toBe(meus.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.total, 0));
    }
    expect(plano.clientes.filter((c) => c.identidade !== null)).toHaveLength(0); // loja 7: fora das 5 primeiras
    const comIdentidade = montarPlanoDaLoja(SEMENTE, REFERENCIA, lojaDeTeste(3), 500);
    expect(comIdentidade.clientes.filter((c) => c.identidade !== null)).toHaveLength(1);
    const semIdentidade = montarPlanoDaLoja(SEMENTE, REFERENCIA, lojaDeTeste(50), 300);
    expect(semIdentidade.clientes.every((c) => c.identidade === null)).toBe(true);
  });

  it("[CA-2] recusa loja sem item-modelo", () => {
    expect(() => montarPlanoDaLoja(SEMENTE, REFERENCIA, lojaDeTeste(1, { modelos: [] }), 300)).toThrow(/item-modelo/);
  });

  it("[CA-2] respeita a forma de entrega e o pagamento que a loja oferece", () => {
    const soRetirada = montarPlanoDaLoja(SEMENTE, REFERENCIA, lojaDeTeste(2, { entregas: ["PICKUP"], pagamentos: ["CASH"] }), 300);
    expect(soRetirada.pedidos.every((p) => p.entrega === "PICKUP" && p.frete === 0 && p.pagamento === "CASH")).toBe(true);
    for (const p of soRetirada.pedidos.filter((x) => x.pagamento === "CASH")) expect(p.troco! % 5000).toBe(0);
  });
});

describe("caminho de status", () => {
  it("[CA-2] respeita a retirada (sem 'saiu para entrega') e rejeita atalhos", () => {
    expect(caminhoDoPedido("COMPLETED", "PICKUP", true)).toEqual(["PENDING", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "COMPLETED"]);
    expect(caminhoDoPedido("COMPLETED", "DELIVERY", true)).toContain("OUT_FOR_DELIVERY");
    expect(caminhoEhValido(["PENDING", "COMPLETED"], "DELIVERY")).toBe(false);
    expect(caminhoEhValido(["PENDING", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP"], "DELIVERY")).toBe(false);
    expect(() => caminhoDoPedido("REJECTED", "DELIVERY", true)).toThrow(/desconhecido/);
  });
});
