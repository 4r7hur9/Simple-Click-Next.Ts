import { describe, expect, it } from "vitest";

import { ErroDeGuarda } from "../simulacao/banco.ts";
import { cenarioPadrao, contem, ENV_VALIDO, fabricaFalsa, lojaDeTeste, REFERENCIA, SEMENTE } from "./apoio.ts";
import { carregar, ErroDoVolume, FalhaInduzida, inserirLoja, esperarAutoanalyze, TRAVA_DO_VOLUME } from "./carga.ts";
import { lerParametros, PEDIDOS_DO_VOLUME } from "./parametros.ts";
import { montarPlanoDaLoja } from "./plano.ts";

const params = (extra: string[] = []) =>
  lerParametros(["carregar", "--semente", SEMENTE, "--referencia", "2026-11-01T18:00:00-03:00", ...extra]);

const comandos = (registro: ReturnType<typeof fabricaFalsa>["registro"]): string[] =>
  registro.consultas.map((c) => c.sql.replace(/\s+/g, " ").trim()).filter((s) => /^(BEGIN|COMMIT|ROLLBACK)/.test(s));

describe("carregar", () => {
  it("[CA-4] pega a trava advisory (duas partes inteiras) numa conexão própria, antes de qualquer leitura de pré-voo", async () => {
    const { fabrica, registro } = fabricaFalsa({ ...cenarioPadrao(), estado: "completa" });
    await carregar(ENV_VALIDO, params(), { fabrica });
    const primeira = registro.consultas.findIndex((c) => c.sql.includes("pg_try_advisory_lock"));
    const preVoo = registro.consultas.findIndex((c) => c.sql.includes("pg_stat_activity"));
    expect(primeira).toBeGreaterThanOrEqual(0);
    expect(primeira).toBeLessThan(preVoo);
    expect(registro.consultas[primeira]!.valores).toEqual([...TRAVA_DO_VOLUME]);
    expect(contem(registro, "pg_advisory_unlock")).toBe(1);
    // trava e trabalho em conexões diferentes: dois logins sc_admin.
    expect(registro.urls).toHaveLength(2);
  });

  it("[CA-4] trava ocupada aborta antes do pré-voo e sem escrever", async () => {
    const { fabrica, registro } = fabricaFalsa({ ...cenarioPadrao(), lockOk: false });
    await expect(carregar(ENV_VALIDO, params(), { fabrica })).rejects.toThrow(/trava advisory/);
    expect(contem(registro, "pg_stat_activity")).toBe(0);
    expect(comandos(registro)).toEqual([]);
    expect(registro.inserts).toHaveLength(0);
  });

  it("[CA-4] recusa quando há outro client backend no banco (e a consulta exclui os pids próprios)", async () => {
    const { fabrica, registro } = fabricaFalsa({ ...cenarioPadrao(), sessoesAlheias: 2 });
    await expect(carregar(ENV_VALIDO, params(), { fabrica })).rejects.toThrow(/outra\(s\) sessão/);
    const consulta = registro.consultas.find((c) => c.sql.includes("FROM pg_stat_activity"))!;
    expect(consulta.sql).toContain("backend_type = 'client backend'");
    expect(consulta.valores?.[0]).toHaveLength(2);
    expect(registro.inserts).toHaveLength(0);
  });

  it("[CA-4] loja com contagem parcial recusa tudo, sem escrever e sem reparar", async () => {
    const { fabrica, registro } = fabricaFalsa({ ...cenarioPadrao(), estado: "parcial" });
    await expect(carregar(ENV_VALIDO, params(), { fabrica })).rejects.toThrow(/fora do estado esperado/);
    expect(comandos(registro)).toEqual([]);
    expect(registro.inserts).toHaveLength(0);
  });

  it("[CA-4] reexecução com o volume completo insere zero (sem-efeito) e não abre transação", async () => {
    const { fabrica, registro } = fabricaFalsa({ ...cenarioPadrao(), estado: "completa" });
    const r = await carregar(ENV_VALIDO, params(), { fabrica });
    expect(r.modo).toBe("sem-efeito");
    expect(r.pedidosInseridos).toBe(0);
    expect(r.pedidosPulados).toBe(PEDIDOS_DO_VOLUME);
    expect(r.lojas.every((l) => l.resultado === "pulada")).toBe(true);
    expect(comandos(registro)).toEqual([]);
    expect(r.impressaoDaBaseAntes).toBe(r.impressaoDaBaseDepois);
  });

  it("[CA-4] --ensaio carrega a 1ª loja, confere e DESFAZ: ROLLBACK, nenhum COMMIT, recontagem volta ao inicial", async () => {
    const { fabrica, registro } = fabricaFalsa();
    const r = await carregar(ENV_VALIDO, params(["--ensaio"]), { fabrica });
    expect(r.modo).toBe("ensaio");
    expect(r.lojas).toHaveLength(1);
    expect(r.lojas[0]).toMatchObject({ indice: 0, resultado: "ensaiada" });
    expect(r.pedidosInseridos).toBe(0);
    expect(comandos(registro)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(registro.pedidosDeInsert).toBe(r.lojas[0]!.quantidade);
    // as invariantes SQL rodam DENTRO da transação do ensaio
    const iBegin = registro.consultas.findIndex((c) => c.sql.trim() === "BEGIN");
    const iRollback = registro.consultas.findIndex((c) => c.sql.trim() === "ROLLBACK");
    const invariantes = registro.consultas.map((c, i) => ({ c, i })).filter(({ c, i }) => c.sql.includes("AS n") && i > iBegin && i < iRollback);
    expect(invariantes.length).toBeGreaterThanOrEqual(12);
  });

  it("[CA-4] falha induzida na loja N desfaz a loja inteira: ROLLBACK, nenhum COMMIT e erro tipado", async () => {
    const { fabrica, registro } = fabricaFalsa();
    const erro = await carregar(ENV_VALIDO, params(["--falhar-na-loja", "0"]), { fabrica }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FalhaInduzida);
    expect(comandos(registro)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(registro.inserts.length).toBeGreaterThanOrEqual(6); // a loja foi inserida e depois desfeita
    expect(contem(registro, "pg_advisory_unlock")).toBe(1);
  });

  it("[CA-4] erro no 3º INSERT faz ROLLBACK sem COMMIT e o erro NÃO carrega o texto do banco", async () => {
    const { fabrica, registro } = fabricaFalsa({ ...cenarioPadrao(), falharNoInsert: 3 });
    const erro = (await carregar(ENV_VALIDO, params(), { fabrica }).catch((e: unknown) => e)) as Error;
    expect(erro).toBeInstanceOf(ErroDoVolume);
    expect((erro as ErroDoVolume).codigo).toBe("23505");
    expect((erro as ErroDoVolume).etapa).toBe("loja 0");
    expect(`${erro.message}${erro.stack ?? ""}`).not.toContain("segredo-do-token");
    expect(comandos(registro)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(registro.inserts.length).toBe(2); // o 3º não chegou a ser registrado
  });

  it("[CA-1] a impressão da base do #135 mudando durante a carga derruba a execução", async () => {
    const { fabrica } = fabricaFalsa({ ...cenarioPadrao(), mudarImpressao: true });
    await expect(carregar(ENV_VALIDO, params(["--ensaio"]), { fabrica })).rejects.toThrow(/impressão da base/);
  });

  it("[CA-3] nunca emite DDL, GRANT, ALTER ROLE, DISABLE TRIGGER, session_replication_role nem row_security", async () => {
    const { fabrica, registro } = fabricaFalsa();
    await carregar(ENV_VALIDO, params(["--ensaio"]), { fabrica });
    const tudo = registro.consultas.map((c) => c.sql).join("\n");
    expect(tudo).not.toMatch(/\b(CREATE|DROP|ALTER|GRANT|TRUNCATE|DELETE)\b/i);
    expect(tudo).not.toMatch(/DISABLE TRIGGER|session_replication_role|row_security/i);
    expect(tudo).not.toMatch(/ON CONFLICT/i);
    expect(tudo).not.toMatch(/\bANALYZE\b/i);
    for (const url of registro.urls) expect(new URL(url).username).toBe("sc_admin");
  });
});

describe("inserirLoja", () => {
  it("[CA-4] manda arrays de comprimento igual por tabela e as contagens batem com o plano", async () => {
    const loja = lojaDeTeste(2);
    const plano = montarPlanoDaLoja(SEMENTE, REFERENCIA, loja, 300);
    const { fabrica, registro } = fabricaFalsa();
    const conexao = await fabrica("postgresql://sc_admin:x@localhost:5432/simpleclick_simulacao");
    const { clientes } = await inserirLoja(conexao, plano, SEMENTE);
    expect(clientes).toBe(plano.clientes.length);

    const por = Object.fromEntries(registro.inserts.map((i) => [i.tabela, i]));
    expect(Object.keys(por).sort()).toEqual(["order_contacts", "order_item_options", "order_items", "order_status_history", "orders", "store_customers"]);
    for (const insert of registro.inserts) {
      const tamanhos = new Set(insert.valores.map((a) => a.length));
      expect(tamanhos.size).toBe(1);
    }
    expect(por["orders"]!.valores[0]).toHaveLength(300);
    expect(por["order_contacts"]!.valores[0]).toHaveLength(300);
    expect(por["order_items"]!.valores[0]).toHaveLength(plano.pedidos.reduce((s, p) => s + p.itens.length, 0));
    expect(por["order_item_options"]!.valores[0]).toHaveLength(plano.pedidos.reduce((s, p) => s + p.itens.reduce((x, i) => x + i.opcoes.length, 0), 0));
    expect(por["order_status_history"]!.valores[0]).toHaveLength(plano.pedidos.reduce((s, p) => s + p.historico.length, 0));
    expect(por["store_customers"]!.valores[0]).toHaveLength(plano.clientes.length);
    // convenção do checkout: price_delta_cents das opções = 0 e canal ONLINE
    const opcoes = registro.consultas.find((c) => c.sql.includes("INSERT INTO app.order_item_options"))!;
    expect(opcoes.sql).toContain('"price_delta_cents"');
    const delta = (por["order_item_options"]!.valores[10] as number[]);
    expect(delta.every((v) => v === 0)).toBe(true);
    // todos os valores vão ligados (nunca concatenados no SQL)
    const sqls = registro.consultas.filter((c) => c.sql.includes("INSERT INTO app.")).map((c) => c.sql).join("\n");
    expect(sqls).not.toContain(plano.pedidos[0]!.token);
    expect(sqls).not.toContain(loja.id);
    // a sequência termina em 1010 + N
    const seq = registro.consultas.find((c) => c.sql.includes("UPDATE app.store_sequences"))!;
    expect(seq.valores).toEqual([loja.id, 1010 + 300]);
  });
});

describe("esperarAutoanalyze", () => {
  it("[CA-6] espera até todas as tabelas de pedido terem estatística recente, sem ANALYZE manual", async () => {
    const desde = new Date("2026-11-20T10:00:00Z");
    let chamadas = 0;
    const cliente = {
      async query(sql: string) {
        chamadas++;
        expect(sql).not.toMatch(/^\s*ANALYZE/i);
        const ultimo = chamadas < 3 ? "2026-11-20T09:00:00Z" : "2026-11-20T10:05:00Z";
        return { rows: ["order_contacts", "order_item_options", "order_items", "order_status_history", "orders", "store_customers"].map((relname) => ({ relname, ultimo })), rowCount: 6 };
      },
    };
    const sono: number[] = [];
    const r = await esperarAutoanalyze(cliente, desde, 900_000, 10_000, async (ms) => { sono.push(ms); });
    expect(r.todasAtualizadas).toBe(true);
    expect(sono).toEqual([10_000, 10_000]);
  });

  it("[CA-6] desiste no limite e declara que as estatísticas podem estar defasadas", async () => {
    const cliente = { async query() { return { rows: [], rowCount: 0 }; } };
    const r = await esperarAutoanalyze(cliente, new Date(), 0, 1, async () => {});
    expect(r.todasAtualizadas).toBe(false);
  });
});

describe("erros", () => {
  it("[CA-3] ErroDeGuarda atravessa a carga sem ser reembrulhado", async () => {
    const cenario = cenarioPadrao();
    cenario.identidade = { ...cenario.identidade, superusuario: true };
    const { fabrica } = fabricaFalsa(cenario);
    await expect(carregar(ENV_VALIDO, params(), { fabrica })).rejects.toBeInstanceOf(ErroDeGuarda);
  });
});
