/**
 * A administração permanente de staging e produção contra PostgreSQL de
 * verdade (card #3): cria uma vez, nunca recria nem promove, deixa uma linha
 * na trilha, e a conta criada entra pelo login real com o aplicativo.
 *
 * A ORDEM IMPORTA: o primeiro caso precisa de `platform_admins` vazia (a trilha
 * é append-only, então não há como "limpar" depois), e os seguintes partem do
 * que ele deixou.
 */
import type { Express } from "express";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoDoArquivo, conectar } from "@simpleclick/testing";
import { derivarUrlDePapel } from "@simpleclick/database";

import {
  type ConexaoAberta,
  executarAdministracaoPermanente,
} from "../src/administracao-permanente.ts";
import {
  criarCifradorDeSegredos,
  CONTEXTO_DO_TOTP,
} from "../src/core/cifra.ts";
import { lerPedidoDaAdministracaoPermanente } from "../src/core/env.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import type { Registrador } from "../src/core/log.ts";
import { senhaConfere } from "../src/modules/auth/senha.ts";
import { CHAVE_DA_PROVA } from "./apoio-da-identidade.ts";
import {
  abrirAcessoDaAplicacao,
  ESPERA_LONGA,
  exigirVariavel,
} from "./apoio-de-isolamento.ts";
import {
  caixaDeEmail,
  entrar,
  enviar,
  montarApi,
} from "./apoio-das-rotas-de-identidade.ts";
import { codigoDoAplicativo } from "./apoio-do-arranque.ts";

const EMAIL = "administracao.permanente@exemplo.test";
const SENHA = "senha-de-prova-da-administracao-1";
const SEGREDO = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const OUTRO_SEGREDO = "KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU";

let donoDoBanco: pg.Client;
let urlAdmin: string;
let acesso: AcessoAoBanco;
let app: Express;
const caixa = caixaDeEmail();

function fonteDoServico(
  extra: Record<string, string> = {},
): Record<string, string> {
  const base = bancoDoArquivo().url;
  return {
    NODE_ENV: "production",
    DATABASE_URL: derivarUrlDePapel(
      base,
      "sc_app",
      exigirVariavel("SENHA_BANCO_APLICACAO"),
    ),
    SENHA_BANCO_ADMINISTRACAO: exigirVariavel("SENHA_BANCO_ADMINISTRACAO"),
    CHAVE_CIFRA_TOTP: CHAVE_DA_PROVA,
    ADMIN_EMAIL: EMAIL,
    ADMIN_SENHA: SENHA,
    ADMIN_TOTP_SEGREDO: SEGREDO,
    ...extra,
  };
}

function registroMudo(): Registrador {
  const nada = () => undefined;
  return {
    depuracao: nada,
    info: nada,
    aviso: nada,
    erro: nada,
    fatal: nada,
  } as Registrador;
}

async function subir(extra: Record<string, string> = {}) {
  const fonte = fonteDoServico(extra);
  return executarAdministracaoPermanente({
    pedido: lerPedidoDaAdministracaoPermanente(fonte),
    fonte,
    registro: registroMudo(),
    conectar: async () =>
      (await conectar(urlAdmin)) as unknown as ConexaoAberta,
  });
}

async function contar(sql: string, valores: unknown[] = []): Promise<number> {
  const { rows } = await donoDoBanco.query<{ n: number }>(sql, valores);
  return rows[0]?.n ?? 0;
}

const TOTAIS = `SELECT (SELECT count(*) FROM app.identities)::int
               + (SELECT count(*) FROM app.platform_admins)::int
               + (SELECT count(*) FROM app.totp_credentials)::int
               + (SELECT count(*) FROM app.audit_platform)::int AS n`;

beforeAll(async () => {
  const base = bancoDoArquivo().url;
  donoDoBanco = await conectar(base);
  urlAdmin = derivarUrlDePapel(
    base,
    "sc_admin",
    exigirVariavel("SENHA_BANCO_ADMINISTRACAO"),
  );
  acesso = abrirAcessoDaAplicacao(base, { maxDeConexoes: 2 });
  app = montarApi(acesso, { caixa });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await donoDoBanco?.end();
}, ESPERA_LONGA);

describe("administração permanente", () => {
  it(
    "[CA-13] duas partidas ao mesmo tempo criam UMA administração",
    async () => {
      const resultados = await Promise.all([subir(), subir()]);
      expect(resultados.filter((r) => r === "criada")).toHaveLength(1);
      expect(resultados.filter((r) => r !== "criada")).toHaveLength(1);
      expect(
        await contar(
          "SELECT count(*)::int AS n FROM app.identities WHERE email_norm = $1",
          [EMAIL],
        ),
      ).toBe(1);
      expect(
        await contar("SELECT count(*)::int AS n FROM app.platform_admins"),
      ).toBe(1);
      expect(
        await contar("SELECT count(*)::int AS n FROM app.totp_credentials"),
      ).toBe(1);
      expect(
        await contar(
          "SELECT count(*)::int AS n FROM app.audit_platform WHERE action = 'ADMINISTRACAO_PERMANENTE_CRIADA'",
        ),
      ).toBe(1);
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-12] o que foi gravado: hash que confere, e-mail verificado, TOTP cifrado que decifra, auditoria sem dado pessoal",
    async () => {
      const conta = (
        await donoDoBanco.query(
          "SELECT id::text AS id, password_hash, email_verified_at FROM app.identities WHERE email_norm = $1",
          [EMAIL],
        )
      ).rows[0]!;
      expect(await senhaConfere(SENHA, String(conta.password_hash))).toBe(true);
      expect(conta.email_verified_at).not.toBeNull();
      const grant = (
        await donoDoBanco.query(
          "SELECT granted_by, revoked_at FROM app.platform_admins WHERE identity_id = $1::uuid",
          [conta.id],
        )
      ).rows[0]!;
      expect(grant.granted_by).toBeNull();
      expect(grant.revoked_at).toBeNull();
      const totp = (
        await donoDoBanco.query(
          "SELECT secret_enc, confirmed_at, last_used_step FROM app.totp_credentials WHERE identity_id = $1::uuid",
          [conta.id],
        )
      ).rows[0]!;
      expect(String(totp.secret_enc)).toMatch(/^v1\./);
      expect(totp.confirmed_at).not.toBeNull();
      expect(totp.last_used_step).toBeNull();
      expect(
        await criarCifradorDeSegredos(
          CHAVE_DA_PROVA,
          CONTEXTO_DO_TOTP,
        ).decifrar(String(totp.secret_enc)),
      ).toBe(SEGREDO);
      const trilha = (
        await donoDoBanco.query(
          "SELECT actor_id, actor_role, entity, entity_id, before_data, after_data FROM app.audit_platform WHERE action = 'ADMINISTRACAO_PERMANENTE_CRIADA'",
        )
      ).rows[0]!;
      expect(trilha.actor_id).toBeNull();
      expect(trilha.actor_role).toBe("SYSTEM");
      expect(trilha.entity).toBe("identity");
      expect(trilha.entity_id).toBe(conta.id);
      const bruto = JSON.stringify(trilha);
      for (const proibido of [EMAIL, SENHA, SEGREDO])
        expect(bruto).not.toContain(proibido);
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-16] o login pede a senha e o código do aplicativo, e só então abre sessão ADMIN",
    async () => {
      const login = await entrar(app, EMAIL, SENHA);
      expect(login.body).toMatchObject({
        status: "DESAFIO_DE_SEGUNDO_FATOR",
        canal: "TOTP",
      });
      const aceito = await enviar(app, "/segundo-fator", {
        desafioId: login.body.desafioId,
        codigo: codigoDoAplicativo(SEGREDO),
      });
      expect(aceito.body.status).toBe("SESSAO_CRIADA");
      expect(
        await contar(
          `SELECT count(*)::int AS n FROM app.sessions s JOIN app.identities i ON i.id = s.identity_id
            WHERE i.email_norm = $1 AND s.role_at_issue = 'ADMIN'`,
          [EMAIL],
        ),
      ).toBe(1);
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-16] redefinir a senha pelo link não entrega sessão ADMIN sem o segundo fator",
    async () => {
      const esqueci = await enviar(app, "/senha/esqueci", { email: EMAIL });
      expect(esqueci.status).toBeLessThan(300);
      const nova = "outra-senha-de-prova-da-administracao-2";
      const redefinida = await enviar(app, "/senha/redefinir", {
        token: caixa.ultimoToken(EMAIL),
        senha: nova,
      });
      expect(redefinida.status).toBeLessThan(300);
      expect(JSON.stringify(redefinida.body)).not.toContain("SESSAO_CRIADA");
      const login = await entrar(app, EMAIL, nova);
      expect(login.body.status).toBe("DESAFIO_DE_SEGUNDO_FATOR");
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-26] com as variáveis ainda no serviço e o aplicativo do segredo ainda ativo, avisa; depois de trocar o aplicativo, não",
    async () => {
      const antes = await contar(TOTAIS);
      expect(await subir()).toBe("segredo_de_bootstrap_ainda_ativo");
      expect(await contar(TOTAIS)).toBe(antes);

      const id = (
        await donoDoBanco.query(
          "SELECT id::text AS id FROM app.identities WHERE email_norm = $1",
          [EMAIL],
        )
      ).rows[0]!.id;
      const cifrado = await criarCifradorDeSegredos(
        CHAVE_DA_PROVA,
        CONTEXTO_DO_TOTP,
      ).cifrar(OUTRO_SEGREDO);
      await donoDoBanco.query(
        "UPDATE app.totp_credentials SET disabled_at = now() WHERE identity_id = $1::uuid",
        [id],
      );
      await donoDoBanco.query(
        "INSERT INTO app.totp_credentials (identity_id, secret_enc, confirmed_at) VALUES ($1::uuid, $2, now())",
        [id, cifrado],
      );
      expect(await subir()).toBe("ja_existia");
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-14] e-mail diferente, grant revogado ou conta comum: nada muda e nenhuma auditoria nova",
    async () => {
      const antes = await contar(TOTAIS);
      // Outro e-mail com administração já existente (e depois revogada).
      expect(await subir({ ADMIN_EMAIL: "outra.pessoa@exemplo.test" })).toBe(
        "ja_ha_administracao",
      );
      await donoDoBanco.query(
        "UPDATE app.platform_admins SET revoked_at = now() WHERE identity_id = (SELECT id FROM app.identities WHERE email_norm = $1)",
        [EMAIL],
      );
      expect(await subir({ ADMIN_EMAIL: "outra.pessoa@exemplo.test" })).toBe(
        "ja_ha_administracao",
      );
      expect(await subir()).toBe("administracao_revogada");
      await donoDoBanco.query(
        "INSERT INTO app.identities (email_norm, display_name, email_verified_at) VALUES ('comum@exemplo.test','Comum', now())",
      );
      expect(await subir({ ADMIN_EMAIL: "comum@exemplo.test" })).toBe(
        "conta_sem_administracao",
      );
      expect(await contar(TOTAIS)).toBe(antes + 1); // só a identidade comum que o próprio teste criou
      expect(
        await contar(
          "SELECT count(*)::int AS n FROM app.platform_admins WHERE revoked_at IS NULL",
        ),
      ).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-16] administração sem aplicativo não abre sessão: pede a configuração do aplicativo",
    async () => {
      const id = (
        await donoDoBanco.query(
          "SELECT id::text AS id FROM app.identities WHERE email_norm = 'comum@exemplo.test'",
        )
      ).rows[0]!.id;
      await enviar(app, "/senha/esqueci", { email: "comum@exemplo.test" });
      const nova = "senha-de-prova-da-conta-comum-3";
      await enviar(app, "/senha/redefinir", {
        token: caixa.ultimoToken("comum@exemplo.test"),
        senha: nova,
      });
      await donoDoBanco.query(
        "INSERT INTO app.platform_admins (identity_id) VALUES ($1::uuid)",
        [id],
      );
      const login = await entrar(app, "comum@exemplo.test", nova);
      expect(login.body.status).toBe("CONFIGURACAO_DO_APLICATIVO_OBRIGATORIA");
      expect(login.headers["set-cookie"]).toBeUndefined();
    },
    ESPERA_LONGA,
  );
});
