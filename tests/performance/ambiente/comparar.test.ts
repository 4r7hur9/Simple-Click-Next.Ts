/**
 * [CA-6] O comparar.ts só aceita antes (0029) × depois (0074) no MESMO harness,
 * perfil, semente, k6 e volume, com a 0074 como única migração a mais e o mesmo
 * trabalho fixo. Roda com `node --test`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { montarTabela, motivosDeRecusa, type Execucao } from "./comparar.ts";

const MIGRACOES = ["0001_extensoes_e_roles.sql", "0073_aceites_legais.sql"];

function execucao(rotulo: string, corpo: "0029" | "0074", extra: Partial<{ harness: string; chamadas: number; migracoes: string[]; p95: number }> = {}): Execucao {
  const migracoes = extra.migracoes ?? (corpo === "0074" ? [...MIGRACOES, "0074_meus_pedidos_por_loja.sql"] : MIGRACOES);
  return {
    rotulo,
    metadados: {
      seed: { semente: "sc-2026", dataDeReferencia: "2026-11-01T18:00:00-03:00" },
      revisao: { sha12: "69cf0958ae92", hashDoHarness: extra.harness ?? "h1" },
      banco: { migracoes, corpoVigenteDeMeusPedidos: corpo },
      volume: { carregado: true, pedidos: 100000 },
    },
    k6: { versao: "k6 v1.3.0", perfil: "completo" },
    resumo: {
      operacoes: { meus_pedidos: { requisicoes: 1500, porSegundo: 5, p50: 1, p95: extra.p95 ?? 100, p99: 1, falhasHttp: 0 } },
      validade: { ok: true },
      metasDeP95: { ok: corpo === "0074" },
      trabalhoFixo: { iteracoesDaConta: extra.chamadas ?? 1500, descartadasDaConta: 0, linhasPorChamada: {} },
      taxaDeFalhasInesperadas: 0,
    },
    reconciliacao: { aprovada: true, pedidosIniciais: 101000, pedidosNovosNoBanco: 300, classes: {} },
    gargalo: { corpoVigente: corpo, medidas: [] },
  };
}

describe("[CA-6] comparação antes × depois", () => {
  it("[CA-6] aceita 0029 × 0074 no mesmo harness e trabalho fixo", () => {
    assert.deepEqual(motivosDeRecusa([execucao("a1", "0029"), execucao("a2", "0029")], [execucao("d1", "0074", { chamadas: 1501 })]), []);
  });
  it("[CA-6] recusa o depois com o corpo antigo (mesma impressão do antes)", () => {
    const m = motivosDeRecusa([execucao("a1", "0029")], [execucao("d1", "0029", { migracoes: MIGRACOES })]);
    assert.ok(m.some((x) => x.includes("corpo da 0074")));
  });
  it("[CA-6] recusa harness diferente", () => {
    const m = motivosDeRecusa([execucao("a1", "0029")], [execucao("d1", "0074", { harness: "h2" })]);
    assert.ok(m.some((x) => x.includes("harness")));
  });
  it("[CA-6] recusa migração a mais que não seja a 0074", () => {
    const m = motivosDeRecusa([execucao("a1", "0029")], [execucao("d1", "0074", { migracoes: [...MIGRACOES, "0074_meus_pedidos_por_loja.sql", "0075_outra.sql"] })]);
    assert.ok(m.some((x) => x.includes("migrações diferem")));
  });
  it("[CA-6] recusa trabalho fixo diferente (mais de 1 chamada)", () => {
    const m = motivosDeRecusa([execucao("a1", "0029")], [execucao("d1", "0074", { chamadas: 1400 })]);
    assert.ok(m.some((x) => x.includes("cenário conta")));
  });
  it("[CA-6] recusa execução inválida como medida", () => {
    const ruim = execucao("d1", "0074");
    ruim.resumo!.validade = { ok: false };
    assert.ok(motivosDeRecusa([execucao("a1", "0029")], [ruim]).some((x) => x.includes("válida")));
  });
  it("[CA-6] a tabela usa a mediana de cada lado", () => {
    const { linhas } = montarTabela(
      [execucao("a1", "0029", { p95: 900 }), execucao("a2", "0029", { p95: 1100 })],
      [execucao("d1", "0074", { p95: 10 }), execucao("d2", "0074", { p95: 20 })],
    );
    const meus = linhas.find((l) => l.op === "meus_pedidos")!;
    assert.equal(meus.p95Antes, 1000);
    assert.equal(meus.p95Depois, 15);
  });
});
