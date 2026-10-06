/**
 * Prova das recusas da primeira administração (T-024, AC-050 e AC-051): o
 * que o arranque NÃO pode fazer. Roda no banco descartável do arquivo, já
 * migrado e sem administração — o estado de um banco recém-arrancado.
 *
 * Toda recusa termina com a mesma conferência: nenhuma linha de identidade,
 * administração, aplicativo ou código de recuperação foi gravada.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";

import {
  ambienteDeArranque,
  codigoDoAplicativo,
  FRASE_DA_ADMINISTRACAO,
  rodarArranque,
} from "./apoio-do-arranque.ts";
import { ESPERA_LONGA } from "./apoio-de-isolamento.ts";

let dono: pg.Client;

beforeAll(async () => {
  dono = await conectarNoBancoDoArquivo();
}, ESPERA_LONGA);

afterAll(async () => {
  await dono?.end();
});

/** Linhas que a criação da administração gravaria. */
async function linhasDaIdentidade(): Promise<number> {
  const { rows } = await dono.query<{ total: number }>(
    `SELECT ((SELECT count(*) FROM app.identities)
           + (SELECT count(*) FROM app.platform_admins)
           + (SELECT count(*) FROM app.totp_credentials)
           + (SELECT count(*) FROM app.recovery_codes))::int AS total`,
  );
  return rows[0]?.total ?? 0;
}

function pedido(email: string, extra: Record<string, string | undefined> = {}) {
  return ambienteDeArranque(bancoDoArquivo().url, {
    PRIMEIRO_ADMIN_EMAIL: email,
    PRIMEIRO_ADMIN_SENHA: FRASE_DA_ADMINISTRACAO,
    ...extra,
  });
}

describe("recusas da primeira administração", () => {
  it(
    "@spec:AC-050 e-mail de uma conta comum não vira administração",
    async () => {
      const email = "cliente.comum@exemplo.test";
      await dono.query(
        `INSERT INTO app.identities (email_norm, email_verified_at) VALUES ($1, now())`,
        [email],
      );
      const antes = await linhasDaIdentidade();

      const recusa = await rodarArranque(pedido(email));
      expect(recusa.codigo).toBe(1);
      expect(recusa.saida.join("\n")).toMatch(/não é administração/);
      expect(await linhasDaIdentidade()).toBe(antes);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-050 senha fraca, e-mail inválido ou chave de cifra ausente recusam antes de tocar o banco",
    async () => {
      const antes = await linhasDaIdentidade();
      const fraca = await rodarArranque(
        pedido("adm.fraca@exemplo.test", { PRIMEIRO_ADMIN_SENHA: "senha123" }),
      );
      expect(fraca.codigo).toBe(1);
      expect(fraca.saida.join("\n")).toMatch(/senha/i);

      const invalido = await rodarArranque(pedido("sem-arroba"));
      expect(invalido.codigo).toBe(1);
      expect(invalido.saida.join("\n")).toMatch(/e-mail/);

      const semChave = await rodarArranque(
        pedido("adm.sem.chave@exemplo.test", { CHAVE_CIFRA_TOTP: undefined }),
      );
      expect(semChave.codigo).toBe(2);
      expect(semChave.saida.join("\n")).toContain("CHAVE_CIFRA_TOTP");

      for (const execucao of [fraca, invalido, semChave]) {
        expect(execucao.convites).toHaveLength(0);
        // Nem o banco foi tocado: a saída não fala de migração.
        expect(execucao.saida.join("\n")).not.toMatch(/migração/);
      }
      expect(await linhasDaIdentidade()).toBe(antes);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-051 código errado do aplicativo não grava a administração",
    async () => {
      const antes = await linhasDaIdentidade();
      const recusa = await rodarArranque(
        pedido("adm.codigo.errado@exemplo.test"),
        (convite) => {
          // Um código fora da janela que o arranque aceita (passo -1, 0, +1).
          const aceitos = [-1, 0, 1].map((passo) =>
            codigoDoAplicativo(convite.chave, passo),
          );
          return (
            ["000000", "111111", "222222", "333333"].find(
              (codigo) => !aceitos.includes(codigo),
            ) ?? "444444"
          );
        },
      );
      expect(recusa.convites).toHaveLength(1);
      expect(recusa.codigo).toBe(1);
      expect(recusa.saida.join("\n")).toMatch(/não confere/);
      expect(await linhasDaIdentidade()).toBe(antes);
    },
    ESPERA_LONGA,
  );
});
