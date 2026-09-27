/**
 * Executa cenários de navegador num PostgreSQL descartável.
 *
 * A integração pode ter migrações diferentes das já aplicadas ao banco local.
 * Este comando cria um banco vazio com as migrações da branch, planta a carga
 * de exemplo, executa os cenários pedidos e remove o banco mesmo na falha.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const arquivoDeAmbiente = join(raiz, ".env");
if (existsSync(arquivoDeAmbiente)) process.loadEnvFile(arquivoDeAmbiente);

const origem = process.env.DATABASE_URL_TEST;
const senhaDaAplicacao = process.env.SENHA_BANCO_APLICACAO;
if (!origem || !senhaDaAplicacao) {
  throw new Error("DATABASE_URL_TEST e SENHA_BANCO_APLICACAO são obrigatórias");
}

const nome = `sc_e2e_${randomBytes(5).toString("hex")}`;
const enderecoDireto = new URL(origem);
enderecoDireto.pathname = `/${nome}`;
const enderecoAplicacao = new URL(enderecoDireto);
enderecoAplicacao.username = "sc_app";
enderecoAplicacao.password = senhaDaAplicacao;

const ambiente = {
  ...process.env,
  DATABASE_URL_DIRETA: enderecoDireto.toString(),
  DATABASE_URL: enderecoAplicacao.toString(),
  ...(process.platform === "win32" && !process.env.PLAYWRIGHT_CHANNEL
    ? { PLAYWRIGHT_CHANNEL: "chrome" }
    : {}),
};

async function executar(argumentos) {
  const codigo = await new Promise((resolver, rejeitar) => {
    const filho = spawn(process.execPath, argumentos, {
      cwd: raiz,
      env: ambiente,
      stdio: "inherit",
    });
    filho.on("error", rejeitar);
    filho.on("exit", (saida) => resolver(saida ?? 1));
  });
  if (codigo !== 0) {
    throw new Error(`comando terminou com código ${codigo}`);
  }
}

const administrativa = new pg.Client({ connectionString: origem });
await administrativa.connect();
try {
  process.stdout.write(`Banco descartável ${nome}: criando\n`);
  await administrativa.query(`CREATE DATABASE ${nome} TEMPLATE template0`);
  await executar(["packages/database/src/migrate.ts", "aplicar"]);
  await executar(["packages/database/seed/index.ts"]);
  await executar([
    resolve(raiz, "e2e/node_modules/@playwright/test/cli.js"),
    "test",
    "--config=e2e/playwright.config.ts",
    ...process.argv.slice(2),
  ]);
} finally {
  try {
    await administrativa.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
    process.stdout.write(`Banco descartável ${nome}: removido\n`);
  } finally {
    await administrativa.end();
  }
}
