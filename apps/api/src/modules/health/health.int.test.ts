import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoDoArquivo } from "@simpleclick/testing";

import { criarAcessoAoBanco, type AcessoAoBanco } from "../../core/db.ts";
import { criarRegistrador, definirRegistrador } from "../../core/log.ts";
import { cacheResponde } from "./health.cache.ts";
import { CAMINHO_PRONTO, criarRotasDeSaude } from "./health.routes.ts";

/**
 * O outro lado de AC-023: com banco e cache DE VERDADE respondendo, a
 * verificação de pronto passa.
 *
 * `health.test.ts` prova o lado triste com um banco inalcançável de verdade e
 * um cache de mentira. Este arquivo prova o lado feliz contra o PostgreSQL
 * descartável do arquivo e contra o Redis do ambiente — porque "o cache
 * respondeu" é uma afirmação sobre o Redis, e um substituto simulado provaria
 * apenas que o substituto concorda com o teste.
 *
 * Este teste NÃO pode ser pulado. Sem ambiente, ele falha dizendo o que fazer:
 * prova que não roda não é prova.
 */

const RAIZ_DO_REPOSITORIO = fileURLToPath(
  new URL("../../../../../", import.meta.url),
);

const ARQUIVO_DE_AMBIENTE = join(RAIZ_DO_REPOSITORIO, ".env");
if (existsSync(ARQUIVO_DE_AMBIENTE)) process.loadEnvFile(ARQUIVO_DE_AMBIENTE);

/** Variável obrigatória, com recusa que ensina o caminho de volta. */
function exigirVariavel(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (valor === undefined || valor === "") {
    throw new Error(
      [
        `${nome} não está definida, e sem ela não há como provar que a verificação de PRONTO passa contra dependências reais.`,
        "Este teste NÃO pode ser pulado — prova que não roda não é prova.",
        "Suba o ambiente e preencha o arquivo de ambiente:",
        "  bash infra/scripts/up.sh core test",
        "  cp .env.example .env   # e complete as senhas dos papéis de banco",
      ].join("\n"),
    );
  }
  return valor;
}

/** Senha do papel `sc_app` — o único que atende requisição. */
const SENHA_DA_APLICACAO = exigirVariavel("SENHA_BANCO_APLICACAO");

/** O cache do ambiente. O de teste vive em outro índice do mesmo servidor. */
const CACHE = exigirVariavel("REDIS_URL_TEST");

const ESPERA_LONGA = 120_000;

let acesso: AcessoAoBanco;

/** A cadeia do banco descartável do arquivo, autenticando como `sc_app`. */
function urlDaAplicacao(url: string): string {
  const destino = new URL(url);
  destino.username = "sc_app";
  destino.password = SENHA_DA_APLICACAO;
  return destino.toString();
}

beforeAll(() => {
  definirRegistrador(
    criarRegistrador({
      nivel: "debug",
      ambiente: "test",
      destino: { write() {} },
    }),
  );
  acesso = criarAcessoAoBanco({
    urlDaAplicacao: urlDaAplicacao(bancoDoArquivo().url),
  });
}, ESPERA_LONGA);

afterAll(async () => {
  definirRegistrador(undefined);
  await acesso?.encerrar();
}, ESPERA_LONGA);

describe("pronto contra banco e cache reais", () => {
  it(
    "@spec:AC-023 o cache do ambiente responde ao PING pelo caminho da verificação",
    async () => {
      const respondeu = await cacheResponde(CACHE, 5_000);

      expect(
        respondeu,
        [
          `O cache em ${new URL(CACHE).host} não respondeu.`,
          "Suba o ambiente antes: bash infra/scripts/up.sh core",
        ].join(" "),
      ).toBe(true);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-023 com banco e cache respondendo, a verificação de pronto passa",
    async () => {
      const app = express();
      app.use(
        "/v1/health",
        criarRotasDeSaude({
          acesso,
          urlDoCache: CACHE,
          esperaMaximaMs: 10_000,
        }),
      );

      const resposta = await request(app).get(`/v1/health${CAMINHO_PRONTO}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toEqual({
        pronto: true,
        dependencias: { banco: "ok", cache: "ok" },
      });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-023 a consulta de saúde passa pelo caminho único até o banco",
    async () => {
      // A verificação abre transação por `core/db.ts`, com o contexto gravado
      // nela (P-004). Se ela falasse com o banco por fora, diria que o PostgreSQL
      // está de pé sem dizer nada sobre a API conseguir usá-lo — que é a única
      // pergunta que a verificação de PRONTO faz.
      let papelNaTransacao: unknown;

      const espiao: AcessoAoBanco = {
        emTransacao: (acao) =>
          acesso.emTransacao(async (tx) => {
            papelNaTransacao = await tx.$queryRaw`
            SELECT current_setting('app.role', true) AS papel`;
            return acao(tx);
          }),
        encerrar: () => acesso.encerrar(),
      };

      const app = express();
      app.use(
        "/v1/health",
        criarRotasDeSaude({
          acesso: espiao,
          urlDoCache: CACHE,
          esperaMaximaMs: 10_000,
        }),
      );

      const resposta = await request(app).get(`/v1/health${CAMINHO_PRONTO}`);

      expect(resposta.status).toBe(200);
      // Contexto gravado na transação, e no menor privilégio: a verificação de
      // saúde não é uma porta lateral para o banco.
      expect(papelNaTransacao).toEqual([{ papel: "PUBLIC" }]);
    },
    ESPERA_LONGA,
  );
});
