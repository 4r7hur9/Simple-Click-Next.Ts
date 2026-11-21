import { describe, expect, it } from "vitest";

import { ErroDeGuarda } from "../simulacao/banco.ts";
import { cenarioPadrao, ENV_VALIDO, fabricaFalsa } from "./apoio.ts";
import { abrirConexaoGuardada, urlDoPapel, VARIAVEIS_PG_PROIBIDAS } from "./guarda.ts";

/** Cada recusa precisa acontecer ANTES de chamar a fábrica de conexões. */
async function recusa(env: Record<string, string | undefined>, padrao: RegExp): Promise<void> {
  const { fabrica, registro } = fabricaFalsa();
  await expect(abrirConexaoGuardada(env, "sc_admin", fabrica)).rejects.toThrow(padrao);
  expect(registro.urls).toHaveLength(0);
}

describe("guarda única do volume", () => {
  it("[CA-3] recusa produção sem conectar", async () => {
    await recusa({ ...ENV_VALIDO, NODE_ENV: "production" }, /produção/);
  });

  it("[CA-3] recusa host que não é local", async () => {
    await recusa({ ...ENV_VALIDO, DATABASE_URL_DIRETA: "postgresql://u:x@db.exemplo.com:5432/simpleclick_dev" }, /local/);
  });

  it("[CA-3] recusa quando o ambiente não traz as credenciais dos papéis", async () => {
    await recusa({ ...ENV_VALIDO, SENHA_BANCO_ADMINISTRACAO: undefined }, /SENHA_BANCO_ADMINISTRACAO/);
  });

  it("[CA-3] recusa URL com query string e a porta do agrupador", async () => {
    await recusa({ ...ENV_VALIDO, DATABASE_URL_DIRETA: `${ENV_VALIDO["DATABASE_URL_DIRETA"]}?options=-csearch_path%3Dpublic` }, /query string/);
    await recusa({ ...ENV_VALIDO, DATABASE_URL_DIRETA: "postgresql://u:x@localhost:6432/simpleclick_dev" }, /6432/);
  });

  it.each(VARIAVEIS_PG_PROIBIDAS)("[CA-3] recusa %s no ambiente", async (nome) => {
    await recusa({ ...ENV_VALIDO, [nome]: "qualquer" }, new RegExp(nome));
  });

  it("[CA-3] só monta URL para sc_admin e sc_app, sempre na base simpleclick_simulacao e sem query string", () => {
    const admin = new URL(urlDoPapel(ENV_VALIDO, "sc_admin"));
    const app = new URL(urlDoPapel(ENV_VALIDO, "sc_app"));
    expect(admin.username).toBe("sc_admin");
    expect(app.username).toBe("sc_app");
    for (const u of [admin, app]) {
      expect(u.pathname).toBe("/simpleclick_simulacao");
      expect(u.search).toBe("");
      expect(u.port).toBe("5432");
    }
  });

  it("[CA-3] confere banco, marcador e papel: abre, fixa o search_path e devolve a conexão", async () => {
    const { fabrica, registro } = fabricaFalsa();
    const conexao = await abrirConexaoGuardada(ENV_VALIDO, "sc_app", fabrica);
    expect(conexao).toBeDefined();
    expect(registro.urls).toHaveLength(1);
    const sqls = registro.consultas.map((c) => c.sql.replace(/\s+/g, " ").trim());
    expect(sqls.some((q) => q.includes("shobj_description"))).toBe(true);
    expect(sqls).toContain("SET search_path = app, pg_catalog");
    expect(sqls.findIndex((q) => q.includes("shobj_description"))).toBeLessThan(sqls.indexOf("SET search_path = app, pg_catalog"));
  });

  it("[CA-3] recusa banco sem o marcador do seed de simulação", async () => {
    const cenario = cenarioPadrao();
    cenario.identidade = { ...cenario.identidade, marcador: null };
    const { fabrica } = fabricaFalsa(cenario);
    await expect(abrirConexaoGuardada(ENV_VALIDO, "sc_admin", fabrica)).rejects.toThrow(/marcador/);
  });

  it.each([
    ["superusuário", { superusuario: true }, /superusuário/],
    ["BYPASSRLS", { contornaRls: true }, /BYPASSRLS/],
    ["pertencer a outro papel", { membros: 1 }, /pg_auth_members/],
  ])("[CA-3] recusa papel com %s", async (_nome, mudanca, padrao) => {
    const cenario = cenarioPadrao();
    cenario.identidade = { ...cenario.identidade, ...mudanca };
    const { fabrica } = fabricaFalsa(cenario);
    const erro = abrirConexaoGuardada(ENV_VALIDO, "sc_admin", fabrica);
    await expect(erro).rejects.toThrow(ErroDeGuarda);
    await expect(abrirConexaoGuardada(ENV_VALIDO, "sc_admin", fabricaFalsa(cenario).fabrica)).rejects.toThrow(padrao);
  });
});
