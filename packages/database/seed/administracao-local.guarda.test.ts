/**
 * As recusas e o "sem variáveis" da administração local do seed (card #3),
 * provados SEM banco: um cliente de mentira registra o que lhe foi pedido.
 * O que grava de verdade é provado em `administracao-local.test.ts`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ErroDaAdministracaoLocalDoSeed,
  garantirAdministracaoLocal,
  garantirAdministracaoLocalSemFalhar,
  senhaConfereComOHash,
} from "./administracao-local.ts";
import { ErroDeAmbienteDeProducao } from "./destino-local.ts";
import { derivarSenha } from "./demo/contas.ts";

const URL_LOCAL =
  "postgresql://migracao:segredo-da-url@localhost:5432/simpleclick_dev";
const EMAIL = "pessoa.de.teste@exemplo.invalido";
const SENHA = "senha-de-prova-deste-teste-1";

function clienteDeMentira(banco = "simpleclick_dev") {
  const consultas: string[] = [];
  return {
    consultas,
    cliente: {
      query: (texto: string) => {
        consultas.push(texto);
        if (texto.includes("current_database")) {
          return Promise.resolve({ rows: [{ banco }], rowCount: 1 });
        }
        return Promise.reject(new Error("não deveria gravar"));
      },
    },
  };
}

const AMBIENTE = {
  NODE_ENV: "development",
  ADMIN_LOCAL_EMAIL: EMAIL,
  ADMIN_LOCAL_SENHA: SENHA,
} as const;

async function recusa(
  ambiente: Record<string, string | undefined>,
  opcoes: { url?: string; banco?: string } = {},
): Promise<{ erro: unknown; consultas: string[] }> {
  const { cliente, consultas } = clienteDeMentira(opcoes.banco);
  const linhas: string[] = [];
  try {
    await garantirAdministracaoLocal(cliente, {
      ambiente,
      urlDoBanco: opcoes.url ?? URL_LOCAL,
      relatar: (linha) => linhas.push(linha),
    });
  } catch (erro) {
    return { erro, consultas };
  }
  throw new Error("deveria ter recusado");
}

describe("administração local do seed: sem variáveis", () => {
  it("[CA-3] sem e-mail ou sem senha não toca o banco e avisa em uma linha com os NOMES", async () => {
    for (const ambiente of [
      { NODE_ENV: "development" },
      { NODE_ENV: "development", ADMIN_LOCAL_EMAIL: EMAIL },
      { NODE_ENV: "development", ADMIN_LOCAL_SENHA: SENHA },
    ]) {
      const { cliente, consultas } = clienteDeMentira();
      const linhas: string[] = [];
      const situacao = await garantirAdministracaoLocal(cliente, {
        ambiente,
        urlDoBanco: URL_LOCAL,
        relatar: (linha) => linhas.push(linha),
      });
      expect(situacao).toBe("sem_variaveis");
      expect(consultas).toEqual([]);
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toContain("ADMIN_LOCAL_EMAIL");
      expect(linhas[0]).toContain("ADMIN_LOCAL_SENHA");
      expect(linhas[0]).not.toContain(SENHA);
    }
  });
});

describe("administração local do seed: recusas antes de gravar", () => {
  it("[CA-4] recusa produção, marcador de hospedagem, host remoto e ?host=", async () => {
    const casos: [Record<string, string>, string | undefined][] = [
      [{ ...AMBIENTE, NODE_ENV: "production" }, undefined],
      [{ ...AMBIENTE, RAILWAY_ENVIRONMENT_NAME: "producao" }, undefined],
      [{ ...AMBIENTE, HEROKU_APP_NAME: "x" }, undefined],
      [
        { ...AMBIENTE },
        "postgresql://u:segredo-da-url@db.exemplo.internal:5432/railway",
      ],
      [
        { ...AMBIENTE },
        "postgresql://u:segredo-da-url@localhost/simpleclick?host=10.0.0.9",
      ],
      [
        { ...AMBIENTE },
        "postgresql://u:segredo-da-url@localhost/simpleclick?hostaddr=10.0.0.9",
      ],
    ];
    for (const [ambiente, url] of casos) {
      const { erro, consultas } = await recusa(ambiente, url ? { url } : {});
      expect(erro).toBeInstanceOf(ErroDeAmbienteDeProducao);
      expect(consultas).toEqual([]);
      expect(String(erro)).not.toContain("segredo-da-url");
      expect(String(erro)).not.toContain(SENHA);
    }
  });

  it("[CA-4] recusa banco fora da lista local (túnel para produção com nome comum)", async () => {
    const { erro, consultas } = await recusa(AMBIENTE, { banco: "producao" });
    expect(erro).toBeInstanceOf(ErroDaAdministracaoLocalDoSeed);
    expect(consultas.every((c) => c.includes("current_database"))).toBe(true);
  });

  it("[CA-4] banco de teste só com a opção interna dos testes", async () => {
    const { erro } = await recusa(AMBIENTE, { banco: "sc_teste_qualquer" });
    expect(erro).toBeInstanceOf(ErroDaAdministracaoLocalDoSeed);
  });

  it("[CA-4] recusa e-mail de conta pública e senha pública ou curta, sem repetir a senha", async () => {
    const casos: Record<string, string>[] = [
      { ...AMBIENTE, ADMIN_LOCAL_EMAIL: "maria.card6@exemplo.test" },
      { ...AMBIENTE, ADMIN_LOCAL_EMAIL: "dono.demo@simpleclick.test" },
      { ...AMBIENTE, ADMIN_LOCAL_EMAIL: "ana.ribeiro@cliente.test" },
      { ...AMBIENTE, ADMIN_LOCAL_EMAIL: "marina@pastelariadavila.test" },
      { ...AMBIENTE, ADMIN_LOCAL_SENHA: "DemoSimpleClick2026" },
      { ...AMBIENTE, ADMIN_LOCAL_SENHA: "curta" },
      { ...AMBIENTE, ADMIN_LOCAL_EMAIL: "sem-arroba" },
    ];
    for (const ambiente of casos) {
      const { erro, consultas } = await recusa(ambiente);
      expect(erro).toBeInstanceOf(ErroDaAdministracaoLocalDoSeed);
      expect(consultas).toEqual([]);
      expect(String(erro)).not.toContain(String(ambiente.ADMIN_LOCAL_SENHA));
    }
  });

  it("[CA-6] a versão 'sem falhar' transforma a recusa em aviso", async () => {
    const { cliente } = clienteDeMentira();
    const linhas: string[] = [];
    await garantirAdministracaoLocalSemFalhar(cliente, {
      ambiente: { ...AMBIENTE, NODE_ENV: "production" },
      urlDoBanco: URL_LOCAL,
      relatar: (linha) => linhas.push(linha),
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toContain("não criada");
  });
});

describe("administração local do seed: hash e código", () => {
  it("[CA-1] senhaConfereComOHash confere o formato argon2id da API", async () => {
    const hash = await derivarSenha(SENHA);
    expect(senhaConfereComOHash(SENHA, hash)).toBe(true);
    expect(senhaConfereComOHash(`${SENHA}x`, hash)).toBe(false);
    expect(senhaConfereComOHash(SENHA, "argon2id$m=1,t=1,p=1$a$b")).toBe(false);
    expect(senhaConfereComOHash(SENHA, "texto-qualquer")).toBe(false);
  });

  it("[CA-5] o módulo não escreve e-mail nem senha de administração", () => {
    const codigo = readFileSync(
      fileURLToPath(new URL("./administracao-local.ts", import.meta.url)),
      "utf8",
    );
    expect(codigo).not.toMatch(/ADMIN_LOCAL_(EMAIL|SENHA)\s*=\s*["'`]/);
    expect(codigo).not.toMatch(/senha:\s*["'`][^"'`]{6,}["'`]/i);
  });
});
