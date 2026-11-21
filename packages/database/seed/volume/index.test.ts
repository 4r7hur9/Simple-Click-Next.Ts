import { describe, expect, it, vi } from "vitest";

import { cenarioPadrao, ENV_VALIDO, fabricaFalsa, SEMENTE } from "./apoio.ts";
import { montarRelatorio, principal } from "./index.ts";

const REF = "2026-11-01T18:00:00-03:00";

describe("CLI seed:volume", () => {
  it("[CA-7] importar o módulo não executa nada (nem conecta, nem muda o código de saída)", async () => {
    const antes = process.exitCode;
    const modulo = await import("./index.ts");
    expect(typeof modulo.principal).toBe("function");
    expect(process.exitCode).toBe(antes);
  });

  it("[CA-3] parâmetros inválidos saem com 2 sem chamar a fábrica de conexões", async () => {
    const { fabrica, registro } = fabricaFalsa();
    const linhas: string[] = [];
    for (const argv of [[], ["carregar"], ["carregar", "--semente", SEMENTE], ["carregar", "--semente", SEMENTE, "--referencia", "ontem"], ["apagar", "--semente", "a", "--referencia", REF]]) {
      expect(await principal(argv, { env: ENV_VALIDO, fabrica, escrever: (l) => linhas.push(l), pasta: null })).toBe(2);
    }
    expect(registro.urls).toHaveLength(0);
    expect(linhas.length).toBe(5);
  });

  it("[CA-3] guarda recusada (produção) sai com 2 e não conecta", async () => {
    const { fabrica, registro } = fabricaFalsa();
    const codigo = await principal(["carregar", "--semente", SEMENTE, "--referencia", REF], { env: { ...ENV_VALIDO, NODE_ENV: "production" }, fabrica, escrever: () => {}, pasta: null });
    expect(codigo).toBe(2);
    expect(registro.urls).toHaveLength(0);
  });

  it("[CA-4] --falhar-na-loja sai com 3", async () => {
    const { fabrica } = fabricaFalsa();
    expect(await principal(["carregar", "--semente", SEMENTE, "--referencia", REF, "--falhar-na-loja", "0"], { env: ENV_VALIDO, fabrica, escrever: () => {}, pasta: null })).toBe(3);
  });

  it("[CA-4] --ensaio sai com 0 sem esperar autoanalyze nem validar", async () => {
    const { fabrica, registro } = fabricaFalsa();
    const linhas: string[] = [];
    const codigo = await principal(["carregar", "--semente", SEMENTE, "--referencia", REF, "--ensaio"], { env: ENV_VALIDO, fabrica, escrever: (l) => linhas.push(l), pasta: null });
    expect(codigo).toBe(0);
    expect(registro.consultas.some((c) => c.sql.includes("pg_stat_user_tables"))).toBe(false);
    expect(linhas.join("\n")).toMatch(/ensaio|carga \(ensaio\)/);
  });

  it("[CA-4] erro de execução sai com 1 e não imprime o texto do banco", async () => {
    const { fabrica } = fabricaFalsa({ ...cenarioPadrao(), falharNoInsert: 2 });
    const linhas: string[] = [];
    const codigo = await principal(["carregar", "--semente", SEMENTE, "--referencia", REF], { env: ENV_VALIDO, fabrica, escrever: (l) => linhas.push(l), pasta: null });
    expect(codigo).toBe(1);
    expect(linhas.join("\n")).toContain('Falha na etapa "loja 0" (código 23505)');
    expect(linhas.join("\n")).not.toMatch(/segredo-do-token|duplicate key/);
  });

  it("[CA-5] validar reprovado sai com 1", async () => {
    const { fabrica } = fabricaFalsa({ ...cenarioPadrao(), estado: "completa", lojasSemPedido: [2] });
    expect(await principal(["validar", "--semente", SEMENTE, "--referencia", REF], { env: ENV_VALIDO, fabrica, escrever: () => {}, pasta: null })).toBe(1);
  });

  it("[CA-7] o relatório em Markdown não contém dado pessoal nem token", () => {
    const md = montarRelatorio(
      { modo: "completa", ensaio: false, lojas: [], pedidosInseridos: 100000, pedidosPulados: 0, clientesInseridos: 1, hashDoPlano: "abc", impressaoDaBaseAntes: "d", impressaoDaBaseDepois: "d", tempos: { preparoMs: 1000, cargaMs: 2000, totalMs: 3000 }, inicioDaEscrita: null },
      { todasAtualizadas: true, tabelas: [], esperouMs: 5000 },
      null,
      null,
    );
    expect(md).toContain("modo: **completa**");
    expect(md).not.toMatch(/@|\+55|eyJ/);
    vi.restoreAllMocks();
  });
});
