/**
 * O admin local do seed (card #3) chega em /admin pelo login de verdade, e
 * quem não é administração continua barrado. Aqui o `NODE_ENV` do processo é
 * `development`, como no `pnpm dev`: a API dispensa o segundo fator só nele.
 */
import { garantirAdministracaoLocal } from "@simpleclick/database/administracao-local";
import { bancoDoArquivo, conectar } from "@simpleclick/testing";
import { derivarUrlDePapel } from "@simpleclick/database";
import type { Express } from "express";
import type pg from "pg";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { derivarSenha } from "../src/modules/auth/senha.ts";
import {
  AMBIENTE_DE_PRODUCAO,
  entrar,
  montarApi,
} from "./apoio-das-rotas-de-identidade.ts";
import {
  comoPapel,
  ESPERA_DA_ADMINISTRACAO,
  montarApiDaAdministracao,
  type ApiDaAdministracao,
} from "./apoio-da-administracao.ts";
import { exigirVariavel } from "./apoio-de-isolamento.ts";

const EMAIL = "admin.local@exemplo.test";
const SENHA = "senha-local-de-prova-do-admin-1";
const CONTA_DONA_DA_DEMO = {
  email: "dona.comum@exemplo.test",
  senha: "senha-de-prova-da-dona-1",
};
const CONTA_CLIENTE = {
  email: "cliente.comum@exemplo.test",
  senha: "senha-de-prova-da-cliente-1",
};

let api: ApiDaAdministracao;
let identidade: Express;
let admin: pg.Client;

beforeAll(async () => {
  const base = bancoDoArquivo().url;
  admin = await conectar(
    derivarUrlDePapel(
      base,
      "sc_admin",
      exigirVariavel("SENHA_BANCO_ADMINISTRACAO"),
    ),
  );
  api = montarApiDaAdministracao();
  identidade = montarApi(api.acessoDaAplicacao, {
    fonte: { ...AMBIENTE_DE_PRODUCAO, JWT_SECRET: process.env.JWT_SECRET },
  });
  await garantirAdministracaoLocal(admin, {
    ambiente: {
      NODE_ENV: "development",
      ADMIN_LOCAL_EMAIL: EMAIL,
      ADMIN_LOCAL_SENHA: SENHA,
    },
    urlDoBanco: base,
    relatar: () => undefined,
    aceitarBancoDeTeste: true,
  });
  for (const conta of [CONTA_DONA_DA_DEMO, CONTA_CLIENTE]) {
    await admin.query(
      `INSERT INTO app.identities (email_norm, password_hash, email_verified_at, display_name)
       VALUES ($1, $2, now(), 'Conta comum')`,
      [conta.email, await derivarSenha(conta.senha)],
    );
  }
}, ESPERA_DA_ADMINISTRACAO);

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await api?.encerrar();
  await admin?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("admin local do seed", () => {
  it(
    "[CA-8] o login do admin local abre sessão ADMIN sem o aplicativo (development) e /v1/admin responde 200",
    async () => {
      vi.stubEnv("NODE_ENV", "development");
      const login = await entrar(identidade, EMAIL, SENHA);
      expect(login.body).toMatchObject({
        status: "SESSAO_CRIADA",
        papel: "ADMIN",
      });
      const lista = await request(api.app)
        .get("/v1/admin/lojas")
        .set("Authorization", `Bearer ${login.body.tokenDeAcesso}`);
      expect(lista.status).toBe(200);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-8] fora de development a mesma conta pede o aplicativo (sem sessão)",
    async () => {
      vi.stubEnv("NODE_ENV", "production");
      const login = await entrar(identidade, EMAIL, SENHA);
      expect(login.body.status).toBe("CONFIGURACAO_DO_APLICATIVO_OBRIGATORIA");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "[CA-9] Maria, a cliente e tokens de dono ou cliente continuam barrados em /v1/admin",
    async () => {
      vi.stubEnv("NODE_ENV", "development");
      for (const conta of [CONTA_DONA_DA_DEMO, CONTA_CLIENTE]) {
        const login = await entrar(identidade, conta.email, conta.senha);
        expect(login.body.status).toBe("SESSAO_CRIADA");
        expect(login.body.papel).not.toBe("ADMIN");
        const lista = await request(api.app)
          .get("/v1/admin/lojas")
          .set("Authorization", `Bearer ${login.body.tokenDeAcesso}`);
        expect(lista.status).toBe(403);
      }
      const id = (
        await admin.query(
          "SELECT id::text AS id FROM app.identities WHERE email_norm = $1",
          [CONTA_CLIENTE.email],
        )
      ).rows[0]!.id as string;
      for (const papel of ["OWNER", "CUSTOMER"] as const) {
        const lista = await request(api.app)
          .get("/v1/admin/lojas")
          .set(comoPapel(id, papel));
        expect(lista.status).toBe(403);
      }
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
