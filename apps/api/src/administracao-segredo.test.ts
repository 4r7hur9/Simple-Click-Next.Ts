/**
 * O gerador do segredo da administração permanente (card #3, CA-17), com um
 * terminal de mentira: nada de segredo real em saída nem em snapshot.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { executarGeradorDeSegredo } from "./administracao-segredo.ts";
import { gerarCodigoTotp } from "./modules/auth/totp.usecase.ts";

const PASTA_DA_API = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BYTES = Uint8Array.from({ length: 20 }, (_, i) => (i * 7 + 3) % 256);
const AGORA = new Date("2026-11-23T12:00:00Z");

function extrairChave(linhas: string[]): string {
  const linha = linhas.find((l) => l.includes("chave:")) ?? "";
  return linha.split("chave:")[1]!.replace(/\s+/g, "");
}

async function rodar(codigoDe: (chave: string) => string, interativo = true) {
  const linhas: string[] = [];
  const codigo = await executarGeradorDeSegredo({
    escrever: (l) => linhas.push(l),
    lerCodigo: () => Promise.resolve(codigoDe(extrairChave(linhas))),
    terminalInterativo: interativo,
    agora: () => AGORA,
    gerarBytes: () => BYTES,
  });
  return { codigo, linhas };
}

describe("administracao:segredo", () => {
  it("[CA-17] imprime a chave base32 de 32 caracteres e o link otpauth, e confirma o código do app (±1 passo)", async () => {
    for (const deslocamento of [-1, 0, 1]) {
      const { codigo, linhas } = await rodar((chave) =>
        gerarCodigoTotp(
          chave,
          new Date(AGORA.getTime() + deslocamento * 30_000),
        ),
      );
      expect(codigo).toBe(0);
      expect(extrairChave(linhas)).toMatch(/^[A-Z2-7]{32}$/);
      expect(linhas.join("\n")).toContain("otpauth://totp/");
      expect(linhas.at(-1)).toContain("ADMIN_TOTP_SEGREDO");
    }
  });

  it("[CA-17] código errado não aprova a chave", async () => {
    const { codigo, linhas } = await rodar(() => "000000");
    expect(codigo).toBe(1);
    expect(linhas.at(-1)).toContain("Não use esta chave");
    expect(linhas.join("\n")).not.toContain("use como ADMIN_TOTP_SEGREDO");
  });

  it("[CA-17] sem terminal recusa e não imprime chave", async () => {
    const { codigo, linhas } = await rodar(() => "123456", false);
    expect(codigo).toBe(2);
    expect(linhas.join("\n")).not.toContain("otpauth");
  });

  it("[CA-17] não abre banco nem lê a chave de cifra, e fica fora do build", () => {
    const origem =
      ts.sys.readFile(resolve(PASTA_DA_API, "src/administracao-segredo.ts")) ??
      "";
    expect(origem).not.toMatch(/from "pg"|core\/(cifra|db)\.ts|process\.env/);
    const configuracao = ts.readConfigFile(
      resolve(PASTA_DA_API, "tsconfig.build.json"),
      ts.sys.readFile,
    );
    const lido = ts.parseJsonConfigFileContent(
      configuracao.config,
      ts.sys,
      PASTA_DA_API,
    );
    const arquivos = lido.fileNames.map((nome) => nome.replace(/\\/g, "/"));
    expect(
      arquivos.some((n) => n.endsWith("src/administracao-segredo.ts")),
    ).toBe(false);
    expect(
      arquivos.some((n) => n.endsWith("src/administracao-permanente.ts")),
    ).toBe(true);
  });
});
