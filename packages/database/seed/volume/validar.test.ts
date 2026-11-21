import { describe, expect, it, vi } from "vitest";

import { cenarioPadrao, contem, ENV_VALIDO, fabricaFalsa, SEMENTE } from "./apoio.ts";
import { INVARIANTES } from "./checagens.ts";
import { lerParametros } from "./parametros.ts";
import { validar } from "./validar.ts";

const params = lerParametros(["validar", "--semente", SEMENTE, "--referencia", "2026-11-01T18:00:00-03:00"]);

describe("validar", () => {
  it("[CA-5] reprova quando uma loja fica sem pedido de volume (LEFT JOIN a partir das 100 lojas) e lista a divergência", async () => {
    const { fabrica } = fabricaFalsa({ ...cenarioPadrao(), estado: "completa", lojasSemPedido: [5] });
    const r = await validar(ENV_VALIDO, params, { fabrica });
    expect(r.ok).toBe(false);
    expect(r.lojas).toHaveLength(100);
    expect(r.lojas[5]).toMatchObject({ codigo: "SIM-abcdef01-005", volume: 0 });
    expect(r.divergencias.join("\n")).toContain("SIM-abcdef01-005: 0 pedidos de volume");
    expect(r.totais.base).toBe(1000);
  });

  it("[CA-5] roda só leitura: BEGIN READ ONLY, default_transaction_read_only, ROLLBACK, nenhum DML e nenhum COMMIT", async () => {
    const { fabrica, registro } = fabricaFalsa({ ...cenarioPadrao(), estado: "completa" });
    await validar(ENV_VALIDO, params, { fabrica });
    const sqls = registro.consultas.map((c) => c.sql.replace(/\s+/g, " ").trim());
    expect(sqls).toContain("SET default_transaction_read_only = on");
    expect(sqls).toContain("BEGIN READ ONLY");
    expect(sqls).toContain("ROLLBACK");
    expect(sqls.some((q) => /^(INSERT|UPDATE|DELETE|COMMIT)/.test(q))).toBe(false);
    expect(sqls.indexOf("BEGIN READ ONLY")).toBeGreaterThan(sqls.indexOf("SET default_transaction_read_only = on"));
  });

  it("[CA-5] reconfere o marcador (pela guarda) e roda todas as invariantes SQL com a referência como parâmetro", async () => {
    const { fabrica, registro } = fabricaFalsa({ ...cenarioPadrao(), estado: "completa" });
    const r = await validar(ENV_VALIDO, params, { fabrica });
    expect(contem(registro, "shobj_description")).toBe(1);
    expect(r.invariantes).toHaveLength(INVARIANTES.length);
    const comReferencia = registro.consultas.find((c) => c.sql.includes("o.placed_at > $1::timestamptz"))!;
    expect(comReferencia.valores).toEqual(["2026-11-01T21:00:00.000Z"]);
  });

  it("[CA-5] mede o tamanho das tabelas envolvidas", async () => {
    const { fabrica, registro } = fabricaFalsa({ ...cenarioPadrao(), estado: "completa" });
    await validar(ENV_VALIDO, params, { fabrica });
    const consulta = registro.consultas.find((c) => c.sql.includes("pg_total_relation_size"))!;
    expect(consulta.sql).toContain("pg_relation_size");
    expect(consulta.sql).toContain("pg_indexes_size");
    expect(consulta.valores?.[0]).toEqual(["orders", "order_items", "order_item_options", "order_status_history", "order_contacts", "store_customers"]);
  });

  it("[CA-1] compara com a baseline da carga: impressão da base e hash do plano diferentes reprovam", async () => {
    const { fabrica } = fabricaFalsa({ ...cenarioPadrao(), estado: "completa" });
    const r = await validar(ENV_VALIDO, params, { fabrica, baseline: { impressaoDaBaseAntes: "outra", hashDoPlano: "outro" } });
    expect(r.comparouComABaseline).toBe(true);
    expect(r.divergencias.join("\n")).toMatch(/impressão da base do #135 mudou/);
    expect(r.divergencias.join("\n")).toMatch(/hash do plano mudou/);
  });

  it("[CA-3] não faz HTTP nem login (o validar do #135 faz; este não)", async () => {
    const espiao = vi.spyOn(globalThis, "fetch");
    const { fabrica } = fabricaFalsa({ ...cenarioPadrao(), estado: "completa" });
    await validar(ENV_VALIDO, params, { fabrica });
    expect(espiao).not.toHaveBeenCalled();
    espiao.mockRestore();
  });

  it("[CA-5] não vaza dado pessoal no relatório (só códigos de pedido, loja e contagens)", async () => {
    const { fabrica } = fabricaFalsa({ ...cenarioPadrao(), estado: "completa", lojasSemPedido: [1] });
    const r = await validar(ENV_VALIDO, params, { fabrica });
    const texto = JSON.stringify(r);
    expect(/@|\+55|eyJ/.test(texto)).toBe(false);
    // token público tem 40 hex exatos; as impressões são sha256 (64) e não contam
    expect(/(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/.test(texto)).toBe(false);
  });
});
