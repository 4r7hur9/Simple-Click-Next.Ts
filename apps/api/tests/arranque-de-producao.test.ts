/**
 * Prova do arranque de produção (T-024) num banco VAZIO de verdade: as
 * migrações com a credencial de arranque e a troca para a de migração
 * (AC-049), a primeira administração uma vez só (AC-050) e o primeiro acesso
 * dela, que só abre com o aplicativo autenticador (AC-051).
 *
 * O primeiro acesso passa pela API montada como em produção e chamada por
 * HTTP: é o mesmo login que a administração vai usar no painel.
 */
import type { Express } from "express";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  derivarUrlDePapel,
  exigirMigracoesEmDia,
  lerMigracoes,
} from "@simpleclick/database";
import { conectar } from "@simpleclick/testing";

import {
  ambienteDeArranque,
  apagarBanco,
  codigoDoAplicativo,
  criarBancoVazio,
  FRASE_DA_ADMINISTRACAO,
  rodarArranque,
  type ExecucaoDoArranque,
} from "./apoio-do-arranque.ts";
import {
  abrirAcessoDaAplicacao,
  ESPERA_LONGA,
  exigirVariavel,
} from "./apoio-de-isolamento.ts";
import {
  cookiesDa,
  entrar,
  enviar,
  montarApi,
} from "./apoio-das-rotas-de-identidade.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

const EMAIL = "primeira.administracao@exemplo.test";

let banco: { nome: string; url: string };
let primeiraVez: ExecucaoDoArranque;
let dono: pg.Client;
let acesso: AcessoAoBanco;
let app: Express;

beforeAll(async () => {
  banco = await criarBancoVazio("arranque");
  primeiraVez = await rodarArranque(
    ambienteDeArranque(banco.url, {
      PRIMEIRO_ADMIN_EMAIL: EMAIL,
      PRIMEIRO_ADMIN_SENHA: FRASE_DA_ADMINISTRACAO,
    }),
  );
  dono = await conectar(banco.url);
  acesso = abrirAcessoDaAplicacao(banco.url, { maxDeConexoes: 2 });
  app = montarApi(acesso);
}, ESPERA_LONGA * 2);

afterAll(async () => {
  await acesso?.encerrar();
  await dono?.end();
  if (banco !== undefined) await apagarBanco(banco.nome);
}, ESPERA_LONGA);

async function contar(sql: string, valores: unknown[] = []): Promise<number> {
  const { rows } = await dono.query<{ total: number }>(sql, valores);
  return rows[0]?.total ?? 0;
}

describe("banco vazio", () => {
  it(
    "@spec:AC-049 o arranque leva o banco vazio ao estado do código, e daí em diante a credencial de migração basta",
    async () => {
      expect(primeiraVez.codigo).toBe(0);
      const aplicadas = await contar(
        "SELECT count(*)::int AS total FROM migracao.aplicadas",
      );
      expect(aplicadas).toBe(lerMigracoes().length);

      // A publicação seguinte só tem a credencial de migração: ela confere.
      const migrador = await conectar(
        derivarUrlDePapel(
          banco.url,
          "sc_migrator",
          exigirVariavel("SENHA_BANCO_MIGRADOR"),
        ),
      );
      try {
        await expect(exigirMigracoesEmDia(migrador)).resolves.toBeUndefined();
      } finally {
        await migrador.end();
      }

      const deNovo = await rodarArranque(ambienteDeArranque(banco.url));
      expect(deNovo.codigo).toBe(0);
      expect(deNovo.saida.join("\n")).toMatch(/0 migração\(ões\) aplicada/);
      expect(
        await contar("SELECT count(*)::int AS total FROM migracao.aplicadas"),
      ).toBe(aplicadas);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-049 com conexão ou cache de teste no ambiente, recusa nomeando a variável sem tocar o banco",
    async () => {
      const intocado = await criarBancoVazio("arranque_recusa");
      try {
        for (const variavel of ["DATABASE_URL_TEST", "REDIS_URL_TEST"]) {
          const recusa = await rodarArranque(
            ambienteDeArranque(intocado.url, { [variavel]: "postgresql://x" }),
          );
          expect(recusa.codigo).toBe(1);
          expect(recusa.saida.join("\n")).toContain(variavel);
        }
        const cliente = await conectar(intocado.url);
        try {
          const { rows } = await cliente.query(
            "SELECT to_regclass('migracao.aplicadas') IS NULL AS vazio",
          );
          expect(rows[0]?.vazio).toBe(true);
        } finally {
          await cliente.end();
        }
      } finally {
        await apagarBanco(intocado.nome);
      }
    },
    ESPERA_LONGA,
  );
});

describe("primeira administração", () => {
  it(
    "@spec:AC-050 nasce com e-mail confirmado e administração ativa, sem a senha na saída, e rodar de novo não muda nada",
    async () => {
      const { rows } = await dono.query(
        `SELECT i.id::text AS id, i.email_verified_at IS NOT NULL AS confirmado,
                a.granted_by, a.revoked_at
           FROM app.identities i JOIN app.platform_admins a ON a.identity_id = i.id
          WHERE i.email_norm = $1`,
        [EMAIL],
      );
      expect(rows).toEqual([
        expect.objectContaining({
          confirmado: true,
          granted_by: null,
          revoked_at: null,
        }),
      ]);
      expect(primeiraVez.saida.join("\n")).not.toContain(
        FRASE_DA_ADMINISTRACAO,
      );

      const linhas = () =>
        contar(
          `SELECT (SELECT count(*) FROM app.identities)
                + (SELECT count(*) FROM app.platform_admins)
                + (SELECT count(*) FROM app.totp_credentials)
                + (SELECT count(*) FROM app.recovery_codes) AS total`,
        );
      const antes = await linhas();
      const repetido = await rodarArranque(
        ambienteDeArranque(banco.url, {
          PRIMEIRO_ADMIN_EMAIL: ` ${EMAIL.toUpperCase()} `,
          PRIMEIRO_ADMIN_SENHA: FRASE_DA_ADMINISTRACAO,
        }),
      );
      expect(repetido.codigo).toBe(0);
      expect(repetido.convites).toHaveLength(0);
      expect(repetido.saida.join("\n")).toMatch(/já existe/);
      expect(await linhas()).toBe(antes);

      const outra = await rodarArranque(
        ambienteDeArranque(banco.url, {
          PRIMEIRO_ADMIN_EMAIL: "segunda.administracao@exemplo.test",
          PRIMEIRO_ADMIN_SENHA: FRASE_DA_ADMINISTRACAO,
        }),
      );
      expect(outra.codigo).toBe(1);
      expect(outra.saida.join("\n")).toMatch(/já tem administração/);
      expect(await linhas()).toBe(antes);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-051 o segredo do aplicativo vai cifrado, os códigos de recuperação saem uma vez e a senha sozinha não abre sessão",
    async () => {
      const [convite] = primeiraVez.convites;
      expect(convite).toBeDefined();
      const chave = convite?.chave as string;

      const { rows } = await dono.query(
        `SELECT t.secret_enc
           FROM app.totp_credentials t JOIN app.identities i ON i.id = t.identity_id
          WHERE i.email_norm = $1 AND t.confirmed_at IS NOT NULL`,
        [EMAIL],
      );
      expect(rows).toHaveLength(1);
      expect(String(rows[0]?.secret_enc)).toMatch(/^v1\./);
      expect(String(rows[0]?.secret_enc)).not.toContain(chave);
      expect(
        await contar(
          `SELECT count(*)::int AS total FROM app.recovery_codes r
             JOIN app.identities i ON i.id = r.identity_id WHERE i.email_norm = $1`,
          [EMAIL],
        ),
      ).toBe(10);
      expect(
        primeiraVez.saida.filter((linha) =>
          /^\s+[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(linha),
        ),
      ).toHaveLength(10);

      const login = await entrar(app, EMAIL, FRASE_DA_ADMINISTRACAO);
      expect(login.body).toMatchObject({
        status: "DESAFIO_DE_SEGUNDO_FATOR",
        canal: "TOTP",
      });
      expect(cookiesDa(login)).toEqual([]);

      // O código digitado no arranque já foi usado: não vale de novo.
      const repetido = await enviar(app, "/segundo-fator", {
        desafioId: login.body.desafioId,
        codigo: primeiraVez.digitados[0],
      });
      expect(repetido.body.status).not.toBe("SESSAO_CRIADA");

      const novoLogin = await entrar(app, EMAIL, FRASE_DA_ADMINISTRACAO);
      const aceito = await enviar(app, "/segundo-fator", {
        desafioId: novoLogin.body.desafioId,
        codigo: codigoDoAplicativo(chave, 1),
      });
      expect(aceito.body.status).toBe("SESSAO_CRIADA");
      expect(
        await contar(
          `SELECT count(*)::int AS total FROM app.sessions s
             JOIN app.identities i ON i.id = s.identity_id
            WHERE i.email_norm = $1 AND s.role_at_issue = 'ADMIN'`,
          [EMAIL],
        ),
      ).toBe(1);
    },
    ESPERA_LONGA,
  );
});
