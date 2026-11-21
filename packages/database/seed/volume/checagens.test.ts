import { describe, expect, it } from "vitest";

import {
  divergenciasDoPedido,
  escolherAmostra,
  INVARIANTES,
  type ContextoDaChecagem,
  type LinhaDeHistorico,
  type LinhaDeItem,
  type LinhaDePedido,
} from "./checagens.ts";
import { lojaDeTeste, REFERENCIA, SEMENTE } from "./apoio.ts";
import { montarPlanoDaLoja } from "./plano.ts";

const t = (min: number): Date => new Date(REFERENCIA.getTime() - 3 * 86_400_000 + min * 60_000);
const aprovada = new Date(REFERENCIA.getTime() - 25 * 86_400_000);
const contexto = (convencao: "checkout" | "seed"): ContextoDaChecagem => ({ convencao, referencia: REFERENCIA, aprovadaEm: convencao === "checkout" ? aprovada : null });

function pedidoIntegro(): { pedido: LinhaDePedido; itens: LinhaDeItem[]; historico: LinhaDeHistorico[] } {
  return {
    pedido: {
      codigo: "A-1011", status: "COMPLETED", entrega: "DELIVERY", subtotal: 2 * 1300, itensTotal: 2 * 1300, frete: 600, desconto: 0, total: 2 * 1300 + 600,
      feitoEm: t(0), aceitoEm: t(5), concluidoEm: t(40), canceladoEm: null, atualizadoEm: t(40),
    },
    // checkout: 1.000 + 300 de acréscimo por unidade = 1.300; line = 1.300 × 2
    itens: [{ quantidade: 2, precoUnitario: 1300, totalDasOpcoes: 300, totalDaLinha: 2600 }],
    historico: [
      { de: null, para: "PENDING", quando: t(0) },
      { de: "PENDING", para: "ACCEPTED", quando: t(5) },
      { de: "ACCEPTED", para: "PREPARING", quando: t(15) },
      { de: "PREPARING", para: "OUT_FOR_DELIVERY", quando: t(25) },
      { de: "OUT_FOR_DELIVERY", para: "COMPLETED", quando: t(40) },
    ],
  };
}

describe("divergenciasDoPedido", () => {
  it("[CA-2] aceita um pedido íntegro na convenção do checkout", () => {
    const p = pedidoIntegro();
    expect(divergenciasDoPedido(p.pedido, p.itens, p.historico, contexto("checkout"))).toEqual([]);
  });

  it("[CA-2] as duas convenções de order_items se distinguem (quantidade ≥ 2 e acréscimo > 0), nos dois sentidos", () => {
    // checkout: line = unit × qty. seed: line = unit × qty + options_total.
    const checkout: LinhaDeItem = { quantidade: 2, precoUnitario: 1300, totalDasOpcoes: 300, totalDaLinha: 2600 };
    const seed: LinhaDeItem = { quantidade: 2, precoUnitario: 1000, totalDasOpcoes: 600, totalDaLinha: 2600 };
    const montar = (item: LinhaDeItem) => {
      const p = pedidoIntegro();
      return divergenciasDoPedido(p.pedido, [item], p.historico, { ...contexto("checkout") });
    };
    const montarSeed = (item: LinhaDeItem) => {
      const p = pedidoIntegro();
      return divergenciasDoPedido(p.pedido, [item], p.historico, contexto("seed"));
    };
    expect(montar(checkout)).toEqual([]);
    expect(montar(seed).join()).toMatch(/line_total diverge/);
    expect(montarSeed(seed)).toEqual([]);
    expect(montarSeed(checkout).join()).toMatch(/line_total diverge/);
  });

  it.each([
    ["centavo divergente no subtotal", (p: ReturnType<typeof pedidoIntegro>) => { p.pedido = { ...p.pedido, subtotal: p.pedido.subtotal + 1 }; }, /subtotal/],
    ["total que não fecha", (p: ReturnType<typeof pedidoIntegro>) => { p.pedido = { ...p.pedido, total: p.pedido.total + 1 }; }, /total/],
    ["histórico que não começa em PENDING", (p: ReturnType<typeof pedidoIntegro>) => { p.historico = p.historico.slice(1); }, /PENDING/],
    ["transição proibida", (p: ReturnType<typeof pedidoIntegro>) => { p.historico = [p.historico[0]!, { de: "PENDING", para: "COMPLETED", quando: t(5) }]; }, /transição/],
    ["status ≠ último evento", (p: ReturnType<typeof pedidoIntegro>) => { p.pedido = { ...p.pedido, status: "CANCELLED" }; }, /não termina/],
    ["pedido anterior à aprovação da loja", (p: ReturnType<typeof pedidoIntegro>) => { p.pedido = { ...p.pedido, feitoEm: new Date(aprovada.getTime() - 1000) }; }, /aprovação/],
    ["evento posterior à referência", (p: ReturnType<typeof pedidoIntegro>) => { p.historico = [...p.historico.slice(0, 4), { de: "OUT_FOR_DELIVERY", para: "COMPLETED", quando: new Date(REFERENCIA.getTime() + 1000) }]; }, /posterior/],
    ["completed_at diferente do evento", (p: ReturnType<typeof pedidoIntegro>) => { p.pedido = { ...p.pedido, concluidoEm: t(41) }; }, /completed_at/],
    ["sem histórico", (p: ReturnType<typeof pedidoIntegro>) => { p.historico = []; }, /sem histórico/],
  ])("[CA-5] detecta %s", (_nome, estragar, padrao) => {
    const p = pedidoIntegro();
    estragar(p);
    expect(divergenciasDoPedido(p.pedido, p.itens, p.historico, contexto("checkout")).join(" | ")).toMatch(padrao);
  });

  it("[CA-5] na convenção do seed (base do #135) os carimbos fora do histórico não reprovam, mas dinheiro e cadeia de status sim", () => {
    const p = pedidoIntegro();
    // o seed grava completed_at um passo depois do evento COMPLETED
    const comCarimboDefasado = { ...p.pedido, concluidoEm: t(46), atualizadoEm: t(46) };
    expect(divergenciasDoPedido(comCarimboDefasado, [{ quantidade: 2, precoUnitario: 1000, totalDasOpcoes: 600, totalDaLinha: 2600 }], p.historico, contexto("seed"))).toEqual([]);
    expect(divergenciasDoPedido(comCarimboDefasado, p.itens, p.historico, contexto("checkout")).join()).toMatch(/completed_at/);
    const centavo = { ...p.pedido, total: p.pedido.total + 1 };
    expect(divergenciasDoPedido(centavo, [{ quantidade: 2, precoUnitario: 1000, totalDasOpcoes: 600, totalDaLinha: 2600 }], p.historico, contexto("seed")).join()).toMatch(/total/);
  });

  it("[CA-2] todo pedido do plano passa nas checagens recalculadas a partir das linhas", () => {
    const loja = lojaDeTeste(4);
    const plano = montarPlanoDaLoja(SEMENTE, REFERENCIA, loja, 400);
    for (const p of plano.pedidos) {
      const erros = divergenciasDoPedido(
        { codigo: p.codigo, status: p.status, entrega: p.entrega, subtotal: p.subtotal, itensTotal: p.subtotal, frete: p.frete, desconto: 0, total: p.total, feitoEm: p.feitoEm, aceitoEm: p.aceitoEm, concluidoEm: p.concluidoEm, canceladoEm: p.canceladoEm, atualizadoEm: p.atualizadoEm },
        p.itens.map((i) => ({ quantidade: i.quantidade, precoUnitario: i.precoUnitario, totalDasOpcoes: i.acrescimoPorUnidade, totalDaLinha: i.total })),
        p.historico.map((h) => ({ de: h.de, para: h.para, quando: h.quando })),
        { convencao: "checkout", referencia: REFERENCIA, aprovadaEm: loja.aprovadaEm },
      );
      expect(erros).toEqual([]);
    }
  });
});

describe("escolherAmostra", () => {
  it("[CA-5] escolhe 10 números distintos e determinísticos dentro do volume", () => {
    const a = escolherAmostra(SEMENTE, "SIM-abcdef01-001", 500);
    expect(a).toHaveLength(10);
    expect(new Set(a).size).toBe(10);
    expect(a).toEqual(escolherAmostra(SEMENTE, "SIM-abcdef01-001", 500));
    expect(a).not.toEqual(escolherAmostra(SEMENTE, "SIM-abcdef01-002", 500));
    for (const n of a) {
      expect(n).toBeGreaterThanOrEqual(1011);
      expect(n).toBeLessThanOrEqual(1510);
    }
    expect(escolherAmostra(SEMENTE, "x", 5)).toHaveLength(5);
  });
});

describe("INVARIANTES", () => {
  it("[CA-5] todas devolvem `n`, só olham pedidos acima de 1010 e a referência é parâmetro, nunca texto", () => {
    expect(INVARIANTES.length).toBeGreaterThanOrEqual(12);
    for (const inv of INVARIANTES) {
      expect(inv.sql).toMatch(/AS n/);
      expect(inv.sql).not.toMatch(/\bnow\(\)/);
      if (inv.usaReferencia === true) expect(inv.sql).toContain("$1");
      else expect(inv.sql).not.toContain("$1");
    }
    expect(INVARIANTES.filter((i) => i.sql.includes("> 1010")).length).toBeGreaterThanOrEqual(10);
  });
});
