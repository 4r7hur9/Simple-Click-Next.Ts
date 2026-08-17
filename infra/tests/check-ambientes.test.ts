import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

/**
 * O verificador de ambientes é um script de shell, então a prova roda o script
 * de verdade: o que interessa é o veredito que ele devolve ao portão de
 * qualidade, não a forma como ele foi escrito por dentro.
 */
const SCRIPT = fileURLToPath(
  new URL("../scripts/check-ambientes.sh", import.meta.url),
);

/** Códigos de saída combinados com o portão de qualidade. */
const SEPARADOS = 0;
const MESMO_DESTINO = 1;
const CONFIGURACAO_INCOMPLETA = 2;

const CONEXAO_DA_APLICACAO =
  "postgresql://aplicacao:trocar@db.interno:5432/simpleclick";
const CONEXAO_DE_TESTE =
  "postgresql://aplicacao:trocar@db.interno:5432/simpleclick_test";
const CACHE_DA_APLICACAO = "redis://cache.interno:6379/0";
const CACHE_DE_TESTE = "redis://cache.interno:6379/1";

interface Veredito {
  readonly codigo: number;
  readonly texto: string;
}

/** Ambiente com produção e teste corretamente separados. */
function ambienteSeparado(): Record<string, string> {
  return {
    DATABASE_URL: CONEXAO_DA_APLICACAO,
    DATABASE_URL_DIRETA: CONEXAO_DA_APLICACAO,
    DATABASE_URL_TEST: CONEXAO_DE_TESTE,
    REDIS_URL: CACHE_DA_APLICACAO,
    REDIS_URL_TEST: CACHE_DE_TESTE,
  };
}

/**
 * Roda o script com um ambiente enxuto: herdar o ambiente da máquina faria o
 * resultado depender de quem executa a suíte.
 */
function verificar(
  variaveis: Record<string, string>,
  ...argumentos: readonly string[]
): Veredito {
  const execucao = spawnSync("bash", [SCRIPT, ...argumentos], {
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", ...variaveis },
    encoding: "utf8",
  });

  return {
    codigo: execucao.status ?? -1,
    texto: `${execucao.stdout ?? ""}${execucao.stderr ?? ""}`,
  };
}

const temporarios: string[] = [];

afterAll(() => {
  for (const pasta of temporarios)
    rmSync(pasta, { recursive: true, force: true });
});

/** Escreve um arquivo de ambiente descartável e devolve o caminho dele. */
function arquivoDeAmbiente(linhas: readonly string[]): string {
  const pasta = mkdtempSync(join(tmpdir(), "simpleclick-ambientes-"));
  temporarios.push(pasta);
  const caminho = join(pasta, ".env");
  writeFileSync(caminho, `${linhas.join("\n")}\n`, "utf8");
  return caminho;
}

describe("check-ambientes.sh", () => {
  it("@spec:AC-031 aprova quando teste tem banco e cache próprios", () => {
    const veredito = verificar(ambienteSeparado());

    expect(veredito.codigo).toBe(SEPARADOS);
    expect(veredito.texto).toContain("separados");
  });

  it("@spec:AC-031 reprova quando o banco de teste é o mesmo banco de produção", () => {
    const variaveis = ambienteSeparado();
    variaveis.DATABASE_URL_TEST = CONEXAO_DA_APLICACAO;

    const veredito = verificar(variaveis);

    expect(veredito.codigo).toBe(MESMO_DESTINO);
    expect(veredito.texto).toContain("DATABASE_URL_TEST");
    expect(veredito.texto).toContain("mesmo banco");
  });

  it("@spec:AC-031 reprova o mesmo banco disfarçado por credencial e parâmetro diferentes", () => {
    const variaveis = ambienteSeparado();
    // Outro usuário, outra senha, outro parâmetro — mesmíssimo banco.
    variaveis.DATABASE_URL_TEST =
      "postgres://outro_usuario:outra@db.interno:5432/simpleclick?sslmode=require";

    const veredito = verificar(variaveis);

    expect(veredito.codigo).toBe(MESMO_DESTINO);
    expect(veredito.texto).toContain("mesmo banco");
  });

  it("@spec:AC-031 reprova o mesmo banco escrito com outro apelido da mesma máquina", () => {
    const conexaoLocal = "postgresql://aplicacao:trocar@localhost:5432/sc";
    const variaveis = ambienteSeparado();
    variaveis.DATABASE_URL = conexaoLocal;
    variaveis.DATABASE_URL_DIRETA = conexaoLocal;
    variaveis.DATABASE_URL_TEST =
      "postgresql://aplicacao:trocar@127.0.0.1:5432/sc";

    const veredito = verificar(variaveis);

    expect(veredito.codigo).toBe(MESMO_DESTINO);
  });

  it("@spec:AC-031 reprova quando o teste aponta para a conexão direta do banco de produção", () => {
    const variaveis = ambienteSeparado();
    variaveis.DATABASE_URL =
      "postgresql://aplicacao:trocar@agrupador:6432/simpleclick";
    variaveis.DATABASE_URL_DIRETA = CONEXAO_DA_APLICACAO;
    variaveis.DATABASE_URL_TEST = CONEXAO_DA_APLICACAO;

    const veredito = verificar(variaveis);

    expect(veredito.codigo).toBe(MESMO_DESTINO);
    expect(veredito.texto).toContain("DATABASE_URL_DIRETA");
  });

  it("@spec:AC-031 reprova quando o cache de teste é o mesmo cache de produção", () => {
    const variaveis = ambienteSeparado();
    // Sem índice explícito o cliente usa o índice 0 — o mesmo do de produção.
    variaveis.REDIS_URL_TEST = "redis://cache.interno:6379";

    const veredito = verificar(variaveis);

    expect(veredito.codigo).toBe(MESMO_DESTINO);
    expect(veredito.texto).toContain("mesmo cache");
  });

  it("@spec:AC-031 aprova índices diferentes do mesmo servidor de cache, que são caches distintos", () => {
    const variaveis = ambienteSeparado();
    variaveis.REDIS_URL = "redis://cache.interno:6379/3";
    variaveis.REDIS_URL_TEST = "redis://cache.interno:6379/4";

    expect(verificar(variaveis).codigo).toBe(SEPARADOS);
  });

  it("@spec:AC-031 reprova quando a conexão de teste não está configurada", () => {
    const variaveis = ambienteSeparado();
    delete variaveis.DATABASE_URL_TEST;

    const veredito = verificar(variaveis);

    expect(veredito.codigo).toBe(CONFIGURACAO_INCOMPLETA);
    expect(veredito.texto).toContain("DATABASE_URL_TEST");
  });

  it("@spec:AC-031 reprova cadeia de conexão irreconhecível em vez de deixar passar", () => {
    const variaveis = ambienteSeparado();
    variaveis.DATABASE_URL_TEST = "simpleclick_test";

    const veredito = verificar(variaveis);

    expect(veredito.codigo).toBe(CONFIGURACAO_INCOMPLETA);
    expect(veredito.texto).toContain("DATABASE_URL_TEST");
  });

  it("@spec:AC-031 verifica também um arquivo de ambiente informado no comando", () => {
    const caminho = arquivoDeAmbiente([
      "# ambiente de exemplo",
      `DATABASE_URL=${CONEXAO_DA_APLICACAO}`,
      `DATABASE_URL_DIRETA=${CONEXAO_DA_APLICACAO}`,
      `DATABASE_URL_TEST=${CONEXAO_DA_APLICACAO}`,
      `REDIS_URL=${CACHE_DA_APLICACAO}`,
      `REDIS_URL_TEST=${CACHE_DE_TESTE}`,
    ]);

    const veredito = verificar({}, caminho);

    expect(veredito.codigo).toBe(MESMO_DESTINO);
    expect(veredito.texto).toContain("mesmo banco");
  });

  it("@spec:AC-031 aprova um arquivo de ambiente com os ambientes separados", () => {
    const caminho = arquivoDeAmbiente([
      `DATABASE_URL="${CONEXAO_DA_APLICACAO}"`,
      `export DATABASE_URL_DIRETA=${CONEXAO_DA_APLICACAO}`,
      `DATABASE_URL_TEST=${CONEXAO_DE_TESTE}`,
      `REDIS_URL=${CACHE_DA_APLICACAO}`,
      `REDIS_URL_TEST=${CACHE_DE_TESTE}`,
    ]);

    expect(verificar({}, caminho).codigo).toBe(SEPARADOS);
  });
});
