/**
 * A trava de produção do seed de demonstração (M-2 da revisão #149).
 *
 * O `demo` cria contas com senha pública (contas.ts), donas de lojas. Só o
 * rótulo `NODE_ENV` não basta: quem esquece de defini-lo num servidor teria
 * contas conhecidas plantadas lá. A guarda soma o destino (banco só local) e
 * os marcadores de hospedagem. Pura: não abre conexão.
 *
 * Desde o card #163 a demonstração também não concede administração da
 * plataforma: a varredura no fim deste arquivo reprova qualquer escrita que
 * ATIVE `platform_admins` no código da carga.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ErroDeAmbienteDeProducao } from "../index.ts";
import { exigirDestinoLocalDaDemonstracao } from "./index.ts";

const LOCAL = "postgresql://migracao:trocar@localhost:5432/simpleclick_dev";

describe("guarda do seed de demonstração", () => {
  it("[M-2] aceita banco local sem marcador de hospedagem", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(() =>
        exigirDestinoLocalDaDemonstracao(
          { NODE_ENV: "development" },
          `postgresql://u:s@${host}:5432/simpleclick_dev`,
        ),
      ).not.toThrow();
    }
  });

  it("[M-2] recusa NODE_ENV=production, como antes", () => {
    expect(() =>
      exigirDestinoLocalDaDemonstracao({ NODE_ENV: "production" }, LOCAL),
    ).toThrow(ErroDeAmbienteDeProducao);
  });

  it("[M-2] recusa banco remoto mesmo SEM NODE_ENV (o caso do rótulo esquecido)", () => {
    expect(() =>
      exigirDestinoLocalDaDemonstracao(
        {},
        "postgresql://u:s@db.exemplo.railway.internal:5432/railway",
      ),
    ).toThrow(/não é local/);
  });

  it("[M-2] recusa quando o processo roda num provedor de hospedagem", () => {
    for (const marcador of ["RAILWAY_ENVIRONMENT", "VERCEL", "RENDER"]) {
      expect(() =>
        exigirDestinoLocalDaDemonstracao({ [marcador]: "production" }, LOCAL),
      ).toThrow(new RegExp(marcador));
    }
  });

  it("[M-2] a recusa não repete a URL (que leva usuário e senha)", () => {
    const url = "postgresql://usuario:senha-secreta@10.0.0.9:5432/x";
    try {
      exigirDestinoLocalDaDemonstracao({}, url);
      expect.unreachable("deveria recusar");
    } catch (erro) {
      expect(String(erro)).not.toContain("senha-secreta");
    }
  });
});

// ---------------------------------------------------------------------------
// Card #163 (D-5): a demonstração nunca concede administração
// ---------------------------------------------------------------------------

const PASTA_DA_DEMO = fileURLToPath(new URL(".", import.meta.url));

/** O código da carga: todo .ts de seed/demo (com subpastas), menos os testes. */
function codigoDaCarga(pasta = PASTA_DA_DEMO): { arquivo: string; texto: string }[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) return codigoDaCarga(caminho);
    if (!entrada.name.endsWith(".ts") || entrada.name.endsWith(".test.ts")) return [];
    return [{ arquivo: caminho.slice(PASTA_DA_DEMO.length), texto: readFileSync(caminho, "utf8") }];
  });
}

describe("[CA-7] a demonstração não ativa platform_admins", () => {
  const codigo = codigoDaCarga();

  it("[CA-7] varre o código da carga (contas.ts e index.ts entre eles)", () => {
    const arquivos = codigo.map((c) => c.arquivo);
    expect(arquivos).toContain("contas.ts");
    expect(arquivos).toContain("index.ts");
  });

  it("[CA-7] nenhum INSERT em platform_admins nem gravação pela tabela", () => {
    for (const { arquivo, texto } of codigo) {
      expect(texto, arquivo).not.toMatch(/INSERT\s+INTO\s+(app\.)?platform_admins/i);
      expect(texto, arquivo).not.toMatch(/["'`]platform_admins["'`]/);
    }
  });

  it("[CA-7] todo UPDATE em platform_admins só revoga (nunca volta revoked_at a NULL)", () => {
    const atualizacoes = codigo.flatMap(({ arquivo, texto }) =>
      [...texto.matchAll(/UPDATE\s+(?:app\.)?platform_admins\b[^`"]*/gi)].map((m) => ({
        arquivo,
        sql: m[0],
      })),
    );
    // A revogação existe: a varredura não passa por estar vazia.
    expect(atualizacoes.length).toBeGreaterThan(0);
    for (const { arquivo, sql } of atualizacoes) {
      expect(sql, arquivo).not.toMatch(/revoked_at\s*=\s*NULL/i);
      expect(sql, arquivo).toMatch(/SET\s+revoked_at\s*=\s*now\(\)/i);
      expect(sql, arquivo).toMatch(/revoked_at\s+IS\s+NULL/i);
    }
  });
});
