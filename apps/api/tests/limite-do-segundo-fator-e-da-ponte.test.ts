/**
 * Prova de dois furos do limite de tentativas achados na revisão da faixa de
 * produção (T-112):
 *
 * 1. Segundo fator por CONTA, e não por desafio (AC-107). Quem tem a senha
 *    vazada recomeçava o login e ganhava um desafio novo, com mais cinco
 *    chances, sem fim. Agora os erros de código somam na conta dona do
 *    desafio, e o décimo erro bloqueia o segundo fator dela por um tempo que
 *    cresce — mesmo com o código certo num desafio novo.
 * 2. Endereço real que chega pela ponte do site (AC-120). O navegador entra
 *    pelo servidor do site, então a API via sempre o endereço do site: todo
 *    visitante caía num balde de origem só, e sessenta logins errados por
 *    minuto trancavam o login de todo mundo. Agora o site informa o endereço
 *    do visitante num cabeçalho, e a API só acredita nele com o segredo
 *    compartilhado da ponte (`SEGREDO_DA_PONTE`).
 *
 * Contra PostgreSQL de verdade e, na primeira, contra o Redis de prova de
 * verdade (`REDIS_URL_TEST`), porque o que está sob prova é a contagem.
 */
import { createHash, randomInt } from "node:crypto";

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";

import {
  AMBIENTE_DE_PRODUCAO,
  cacheDoLimiteDeProva,
  caixaDeEmail,
  enviar,
  entrar,
  montarApi,
} from "./apoio-das-rotas-de-identidade.ts";
import {
  codigoDiferente,
  donaComSenha,
  sessoesDe,
} from "./apoio-do-segundo-fator.ts";
import {
  abrirAcessoDaAplicacao,
  ESPERA_LONGA,
  exigirVariavel,
} from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import {
  conectarNoCacheDoLimite,
  type CacheDoLimiteAberto,
} from "../src/core/limite.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let redis: CacheDoLimiteAberto;
const caixa = caixaDeEmail();

/** O segredo da ponte nesta prova: sorteado, nunca do disco. */
const SEGREDO_DA_PONTE = createHash("sha256")
  .update(`ponte-da-prova-${randomInt(1e9)}`)
  .digest("base64url");

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  const url = exigirVariavel("REDIS_URL_TEST");
  if (url === process.env.REDIS_URL?.trim()) {
    throw new Error("REDIS_URL_TEST aponta para o Redis de desenvolvimento.");
  }
  redis = await conectarNoCacheDoLimite(url);
}, ESPERA_LONGA);

afterAll(async () => {
  await redis?.encerrar();
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/** Um endereço só desta execução, para o balde de origem não ser dividido. */
function enderecoDaProva(): string {
  return `198.51.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

/** O balde do limite, como `core/limite.ts` o nomeia. */
function balde(prefixo: string, escopo: string, identificador: string) {
  const resumo = createHash("sha256")
    .update(identificador)
    .digest("base64url")
    .slice(0, 32);
  return `${prefixo}:${escopo}:${resumo}`;
}

describe("segundo fator limitado pela conta, não pelo desafio", () => {
  it(
    "@spec:AC-107 dez códigos errados espalhados por desafios novos bloqueiam o segundo fator da conta, mesmo com o código certo",
    async () => {
      const app = montarApi(acesso, {
        caixa,
        limite: { cache: redis, chaves: [], estado: { barrar: false } },
      });
      const dona = await donaComSenha(migrador);
      const borda = { "X-Forwarded-For": enderecoDaProva() };

      // Duas rodadas de login com a senha certa e cinco códigos errados cada:
      // o desafio bloqueia na quinta, e a pessoa recomeça o login.
      for (let rodada = 0; rodada < 2; rodada += 1) {
        const login = await entrar(app, dona.email, undefined, borda);
        expect(login.body.status).toBe("DESAFIO_DE_SEGUNDO_FATOR");
        const desafioId = login.body.desafioId as string;
        const errado = codigoDiferente(caixa.ultimoCodigo(dona.email));
        for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
          const resposta = await enviar(
            app,
            "/segundo-fator",
            { desafioId, codigo: errado },
            borda,
          );
          expect(resposta.status).toBe(200);
          expect(resposta.body.status).toBe(
            tentativa < 5 ? "CODIGO_INCORRETO" : "BLOQUEADO",
          );
        }
      }

      // Terceiro desafio, com o código CERTO: a conta já está bloqueada.
      const login = await entrar(app, dona.email, undefined, borda);
      const desafioId = login.body.desafioId as string;
      const certo = caixa.ultimoCodigo(dona.email);
      const barrada = await enviar(
        app,
        "/segundo-fator",
        { desafioId, codigo: certo },
        borda,
      );
      expect(barrada.status).toBe(429);
      expect(barrada.body).toMatchObject({
        erro: "muitas_tentativas",
        escopo: "conta",
      });
      expect(await sessoesDe(migrador, dona.id)).toHaveLength(0);
    },
    ESPERA_LONGA,
  );
});

describe("endereço real do visitante pela ponte do site", () => {
  const VISITANTE = "198.51.100.23";
  const DO_SITE = "203.0.113.50";

  function loginPelaPonte(
    fonte: Record<string, string | undefined>,
    segredoInformado: string | undefined,
    enderecoInformado = VISITANTE,
  ) {
    const limite = cacheDoLimiteDeProva();
    const app = montarApi(acesso, { caixa, limite, fonte });
    const cabecalhos: Record<string, string> = {
      "X-Forwarded-For": DO_SITE,
      "x-simpleclick-endereco-do-cliente": enderecoInformado,
    };
    if (segredoInformado !== undefined) {
      cabecalhos["x-simpleclick-ponte"] = segredoInformado;
    }
    return entrar(
      app,
      "ninguem@exemplo.test",
      "senha errada da prova",
      cabecalhos,
    ).then(() => limite.chaves);
  }

  const comPonte = { ...AMBIENTE_DE_PRODUCAO, SEGREDO_DA_PONTE };
  const origem = (endereco: string) =>
    balde("sc:limite:login", "origem", endereco);

  it(
    "@spec:AC-120 com o segredo da ponte, o balde de origem é o do visitante, não o do servidor do site",
    async () => {
      const chaves = await loginPelaPonte(comPonte, SEGREDO_DA_PONTE);
      expect(chaves).toContain(origem(VISITANTE));
      expect(chaves).not.toContain(origem(DO_SITE));
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-120 sem o segredo certo, ou sem ponte configurada, o endereço informado é ignorado",
    async () => {
      const casos = [
        await loginPelaPonte(comPonte, "segredo-errado-de-quem-chama-direto"),
        await loginPelaPonte(comPonte, undefined),
        await loginPelaPonte(AMBIENTE_DE_PRODUCAO, SEGREDO_DA_PONTE),
        await loginPelaPonte(comPonte, SEGREDO_DA_PONTE, "nao-e-endereco"),
      ];
      for (const chaves of casos) {
        expect(chaves).toContain(origem(DO_SITE));
        expect(chaves).not.toContain(origem(VISITANTE));
      }
    },
    ESPERA_LONGA,
  );
});
