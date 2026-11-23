/**
 * A administração local do seed contra PostgreSQL de verdade (card #3).
 * Cada banco desta prova é criado e apagado aqui: o de desenvolvimento nunca é
 * tocado. As recusas sem banco estão em `administracao-local.guarda.test.ts`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { aplicarMigracoes, derivarUrlDePapel } from "../src/migrate.ts";
import {
  garantirAdministracaoLocal,
  senhaConfereComOHash,
} from "./administracao-local.ts";
import { CONTA_DONA_DA_DEMO, garantirConta } from "./demo/contas.ts";
import { PESSOAS } from "./lojas.ts";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const ARQUIVO_DE_AMBIENTE = join(RAIZ, ".env");
if (existsSync(ARQUIVO_DE_AMBIENTE)) process.loadEnvFile(ARQUIVO_DE_AMBIENTE);

function exigir(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (valor === undefined || valor === "") {
    throw new Error(
      `${nome} não está definida: suba o banco descartável (bash infra/scripts/up.sh core test) e preencha o .env`,
    );
  }
  return valor;
}

const URL_ADMINISTRATIVA = exigir("DATABASE_URL_TEST");
const SEGREDOS = {
  SENHA_BANCO_MIGRADOR: exigir("SENHA_BANCO_MIGRADOR"),
  SENHA_BANCO_APLICACAO: exigir("SENHA_BANCO_APLICACAO"),
  SENHA_BANCO_ADMINISTRACAO: exigir("SENHA_BANCO_ADMINISTRACAO"),
};
const ESPERA_LONGA = 180_000;

const EMAIL = "pessoa.de.teste@exemplo.invalido";
const SENHA = "senha-de-prova-deste-teste-1";
const SENHA_NOVA = "outra-senha-de-prova-deste-teste-2";

async function conectar(url: string): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  return cliente;
}

function urlDoBanco(nome: string): string {
  const destino = new URL(URL_ADMINISTRATIVA);
  destino.pathname = `/${nome}`;
  return destino.toString();
}

async function comServidor<T>(acao: (c: pg.Client) => Promise<T>): Promise<T> {
  const cliente = await conectar(URL_ADMINISTRATIVA);
  try {
    return await acao(cliente);
  } finally {
    await cliente.end();
  }
}

let nomeDoBanco = "";
let administracao: pg.Client;

beforeAll(async () => {
  nomeDoBanco = `sc_teste_admlocal_${Date.now().toString(36)}`;
  await comServidor((c) =>
    c.query(`CREATE DATABASE ${nomeDoBanco} TEMPLATE template0`),
  );
  const migrador = await conectar(urlDoBanco(nomeDoBanco));
  try {
    await aplicarMigracoes({ cliente: migrador, segredos: SEGREDOS });
  } finally {
    await migrador.end();
  }
  administracao = await conectar(
    derivarUrlDePapel(
      urlDoBanco(nomeDoBanco),
      "sc_admin",
      SEGREDOS.SENHA_BANCO_ADMINISTRACAO,
    ),
  );
}, ESPERA_LONGA);

afterAll(async () => {
  await administracao?.end().catch(() => {});
  await comServidor((c) =>
    c.query(`DROP DATABASE IF EXISTS ${nomeDoBanco} WITH (FORCE)`),
  );
}, ESPERA_LONGA);

function ambiente(extra: Record<string, string> = {}) {
  return {
    NODE_ENV: "development",
    ADMIN_LOCAL_EMAIL: EMAIL,
    ADMIN_LOCAL_SENHA: SENHA,
    ...extra,
  };
}

async function rodar(extra: Record<string, string> = {}) {
  const linhas: string[] = [];
  const situacao = await garantirAdministracaoLocal(administracao, {
    ambiente: ambiente(extra),
    urlDoBanco: urlDoBanco(nomeDoBanco),
    relatar: (linha) => linhas.push(linha),
    aceitarBancoDeTeste: true,
  });
  return { situacao, linhas };
}

async function contar(sql: string, valores: unknown[] = []): Promise<number> {
  const r = await administracao.query(sql, valores);
  return Number(r.rows[0]?.n ?? 0);
}

describe("administração local do seed (banco de verdade)", () => {
  it("[CA-1] cria a identidade com hash argon2id, e-mail verificado, grant ativo e nenhum aceite", async () => {
    const { situacao } = await rodar();
    expect(situacao).toBe("criada");
    const conta = (
      await administracao.query(
        `SELECT id::text AS id, password_hash, email_verified_at FROM app.identities WHERE email_norm = $1`,
        [EMAIL],
      )
    ).rows[0]!;
    expect(senhaConfereComOHash(SENHA, String(conta.password_hash))).toBe(true);
    expect(conta.email_verified_at).not.toBeNull();
    expect(
      await contar(
        `SELECT count(*)::int AS n FROM app.platform_admins WHERE identity_id = $1::uuid AND revoked_at IS NULL`,
        [conta.id],
      ),
    ).toBe(1);
    expect(
      await contar(
        `SELECT count(*)::int AS n FROM app.legal_acceptances WHERE identity_id = $1::uuid`,
        [conta.id],
      ),
    ).toBe(0);
  });

  it("[CA-2] repetir não duplica nada e não mexe no hash nem nas sessões", async () => {
    const antes = (
      await administracao.query(
        `SELECT password_hash FROM app.identities WHERE email_norm = $1`,
        [EMAIL],
      )
    ).rows[0]!.password_hash;
    const { situacao } = await rodar();
    expect(situacao).toBe("ja_existia");
    expect(
      await contar(`SELECT count(*)::int AS n FROM app.identities WHERE email_norm = $1`, [EMAIL]),
    ).toBe(1);
    expect(await contar(`SELECT count(*)::int AS n FROM app.platform_admins`)).toBe(1);
    const depois = (
      await administracao.query(
        `SELECT password_hash FROM app.identities WHERE email_norm = $1`,
        [EMAIL],
      )
    ).rows[0]!.password_hash;
    expect(depois).toBe(antes);
  });

  it("[CA-2] senha nova troca o hash; grant revogado volta", async () => {
    await administracao.query(
      `UPDATE app.platform_admins SET revoked_at = now()
        WHERE identity_id = (SELECT id FROM app.identities WHERE email_norm = $1)`,
      [EMAIL],
    );
    const { situacao } = await rodar({ ADMIN_LOCAL_SENHA: SENHA_NOVA });
    expect(situacao).toBe("atualizada");
    const hash = String(
      (
        await administracao.query(
          `SELECT password_hash FROM app.identities WHERE email_norm = $1`,
          [EMAIL],
        )
      ).rows[0]!.password_hash,
    );
    expect(senhaConfereComOHash(SENHA_NOVA, hash)).toBe(true);
    expect(
      await contar(`SELECT count(*)::int AS n FROM app.platform_admins WHERE revoked_at IS NULL`),
    ).toBe(1);
  });

  it("[CA-3] sem variáveis nada muda no banco", async () => {
    const antes = [
      await contar(`SELECT count(*)::int AS n FROM app.identities`),
      await contar(`SELECT count(*)::int AS n FROM app.platform_admins`),
    ];
    const linhas: string[] = [];
    const situacao = await garantirAdministracaoLocal(administracao, {
      ambiente: { NODE_ENV: "development" },
      urlDoBanco: urlDoBanco(nomeDoBanco),
      relatar: (l) => linhas.push(l),
      aceitarBancoDeTeste: true,
    });
    expect(situacao).toBe("sem_variaveis");
    expect(linhas).toHaveLength(1);
    expect([
      await contar(`SELECT count(*)::int AS n FROM app.identities`),
      await contar(`SELECT count(*)::int AS n FROM app.platform_admins`),
    ]).toEqual(antes);
  });

  it("[CA-4] não promove conta comum nem conta pública (Maria) e não deixa grant", async () => {
    await garantirConta(administracao, CONTA_DONA_DA_DEMO);
    await expect(
      rodar({ ADMIN_LOCAL_EMAIL: CONTA_DONA_DA_DEMO.email }),
    ).rejects.toThrow();
    await administracao.query(
      `INSERT INTO app.identities (email_norm, display_name, email_verified_at)
       VALUES ('comum@exemplo.invalido', 'Comum', now())`,
    );
    await expect(
      rodar({ ADMIN_LOCAL_EMAIL: "comum@exemplo.invalido" }),
    ).rejects.toThrow(/nunca foi administração/);
    expect(
      await contar(
        `SELECT count(*)::int AS n FROM app.platform_admins a
           JOIN app.identities i ON i.id = a.identity_id
          WHERE i.email_norm IN ($1, 'comum@exemplo.invalido')`,
        [CONTA_DONA_DA_DEMO.email],
      ),
    ).toBe(0);
  });

  it("[CA-5] só a conta do .env tem grant ativo; a administração do seed original sem senha não ganha nada sozinha", async () => {
    expect(PESSOAS.administracao.email).toContain("@");
    expect(
      await contar(`SELECT count(*)::int AS n FROM app.platform_admins WHERE revoked_at IS NULL`),
    ).toBe(1);
  });
});
