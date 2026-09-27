/**
 * O login local de desenvolvimento entra como um dono DE VERDADE (dívida 92).
 *
 * Antes, o token do usuário de teste dizia "sou dono" com um sujeito que não
 * era identidade nenhuma — e funcionava porque o banco só olhava o papel.
 * Desde a migração 0041 a equipe só alcança a loja de que é membro; então o
 * login local precisa produzir uma identidade em `app.identities` e um vínculo
 * OWNER aceito com a loja do painel local. É o que `pnpm dev` precisa para
 * continuar entrando, e é isto que esta prova cobra, contra PostgreSQL de
 * verdade e pela rota montada.
 */
import express, { type Express } from "express";
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
} from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import { abrirAcessoDaAdministracao } from "./apoio-da-administracao.ts";
import { lerSecao, montarAppDaConfiguracao } from "./apoio-de-configuracao.ts";
import {
  abrirAcessoDaAplicacao,
  ESPERA_LONGA,
  exigirVariavel,
} from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { manipuladorDeErros } from "../src/core/erros.ts";
import { criarRotasDeAutenticacaoDeDesenvolvimento } from "../src/modules/auth/desenvolvimento.routes.ts";
import { verificarTokenDeAcesso } from "../src/modules/auth/token.ts";

const EMAIL = "Teste.Local@Exemplo.test";
const FRASE = "uma frase longa só do ambiente local";
const FORMATO_DE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let migrador: pg.Client;
let acessoDaAdministracao: AcessoAoBanco;
let acessoDaAplicacao: AcessoAoBanco;
let lojaLocal: LojaDeTeste;
let outraLoja: LojaDeTeste;
let login: Express;
let painel: ReturnType<typeof montarAppDaConfiguracao>;

/** A rota do login local montada sobre o ambiente informado. */
function montarLogin(fonte: Record<string, string | undefined>): Express {
  const app = express();
  app.use(express.json());
  app.use(
    "/v1/auth",
    criarRotasDeAutenticacaoDeDesenvolvimento(fonte, {
      acesso: () => acessoDaAdministracao,
    }),
  );
  app.use(manipuladorDeErros());
  return app;
}

function entrar(app: Express, senha = FRASE) {
  return request(app).post("/v1/auth/login").send({ email: EMAIL, senha });
}

async function vinculosDe(identidadeId: string) {
  const { rows } = await migrador.query<{
    store_id: string;
    role: string;
    aceito: boolean;
    revogado: boolean;
  }>(
    `SELECT store_id, role, invite_accepted_at IS NOT NULL AS aceito,
            revoked_at IS NOT NULL AS revogado
       FROM app.store_members WHERE identity_id = $1`,
    [identidadeId],
  );
  return rows;
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acessoDaAdministracao = abrirAcessoDaAdministracao();
  acessoDaAplicacao = abrirAcessoDaAplicacao(bancoDoArquivo().url, {
    maxDeConexoes: 4,
  });
  lojaLocal = await criarLoja({ nome: "Pastelaria Local" });
  outraLoja = await criarLoja({ nome: "Loja de Outra Pessoa" });
  login = montarLogin({
    NODE_ENV: "test",
    SIMPLECLICK_DEV_TEST_EMAIL: EMAIL,
    SIMPLECLICK_DEV_TEST_PHRASE: FRASE,
    JWT_SECRET: exigirVariavel("JWT_SECRET"),
    NEXT_PUBLIC_DEV_STORE_SLUG: lojaLocal.apelido,
  });
  painel = montarAppDaConfiguracao(acessoDaAplicacao);
}, ESPERA_LONGA);

afterAll(async () => {
  await acessoDaAplicacao?.encerrar();
  await acessoDaAdministracao?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

describe("o usuário de teste local é dono de verdade da loja local", () => {
  it(
    "@spec:AC-116 @principle:P-003 entrar cria a identidade pelo e-mail, vincula como OWNER da loja local, e o token abre o painel dela — e só dela",
    async () => {
      const resposta = await entrar(login);
      expect(resposta.status).toBe(200);

      const token = resposta.body.tokenDeAcesso as string;
      const alegacoes = verificarTokenDeAcesso(
        token,
        exigirVariavel("JWT_SECRET"),
      );
      expect(alegacoes.papel).toBe("OWNER");
      expect(alegacoes.identidadeId).toMatch(FORMATO_DE_UUID);

      const identidade = await migrador.query<{ email_norm: string }>(
        `SELECT email_norm FROM app.identities WHERE id = $1`,
        [alegacoes.identidadeId],
      );
      expect(identidade.rows).toEqual([{ email_norm: EMAIL.toLowerCase() }]);
      expect(await vinculosDe(alegacoes.identidadeId)).toEqual([
        {
          store_id: lojaLocal.id,
          role: "OWNER",
          aceito: true,
          revogado: false,
        },
      ]);

      // O que importa para `pnpm dev`: o painel da loja local responde a
      // esse token pela mesma guarda que recusa qualquer outra loja.
      const propria = await lerSecao(
        painel,
        lojaLocal.apelido,
        "entrega",
        token,
      );
      expect(propria.status).toBe(200);
      const alheia = await lerSecao(
        painel,
        outraLoja.apelido,
        "entrega",
        token,
      );
      expect(alheia.status).toBe(404);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-116 entrar de novo reaproveita a mesma identidade e não duplica o vínculo",
    async () => {
      const primeira = await entrar(login);
      const segunda = await entrar(login);
      const segredo = exigirVariavel("JWT_SECRET");
      const sujeito = (resposta: request.Response) =>
        verificarTokenDeAcesso(resposta.body.tokenDeAcesso as string, segredo)
          .identidadeId;

      expect(sujeito(segunda)).toBe(sujeito(primeira));
      expect(await vinculosDe(sujeito(segunda))).toHaveLength(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-116 frase errada continua sendo recusada, e não cria identidade nenhuma",
    async () => {
      const antes = await migrador.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM app.identities`,
      );
      const recusada = await entrar(login, "frase errada");
      expect(recusada.status).toBe(401);
      const depois = await migrador.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM app.identities`,
      );
      expect(depois.rows[0]?.total).toBe(antes.rows[0]?.total);
    },
    ESPERA_LONGA,
  );

  it(
    "sem credencial de teste no ambiente a rota não existe",
    async () => {
      const semCredencial = montarLogin({ NODE_ENV: "test" });
      expect((await entrar(semCredencial)).status).toBe(404);
    },
    ESPERA_LONGA,
  );
});
