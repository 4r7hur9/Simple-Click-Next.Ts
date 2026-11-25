/**
 * Apoio das provas do card #25: a API COMPLETA (`criarApp`, com o portão da
 * equipe e todas as rotas) sobre o banco descartável do arquivo de teste.
 *
 * As rotas do painel usam o acesso padrão (`banco()`), lido do ambiente na
 * primeira chamada. Por isso a montagem aponta `DATABASE_URL` (credencial das
 * lojas) e `DATABASE_URL_ADMINISTRACAO` para o banco do arquivo antes de a
 * primeira requisição acontecer — e o encerramento fecha os dois agrupadores.
 */

import request from "supertest";
import { bancoDoArquivo } from "@simpleclick/testing";

import { criarApp, type OpcoesDoApp } from "../src/app.ts";
import { encerrarBanco, encerrarBancoDaAdministracao } from "../src/core/db.ts";
import type { PapelDaSessao } from "../src/modules/auth/token.ts";
import { ORIGEM_DA_ADMINISTRACAO, tokenDe } from "./apoio-da-administracao.ts";
import { exigirVariavel, SENHA_DA_APLICACAO } from "./apoio-de-isolamento.ts";

export { ORIGEM_DA_ADMINISTRACAO as ORIGEM } from "./apoio-da-administracao.ts";

export interface ApiCompleta {
  readonly app: ReturnType<typeof criarApp>;
  encerrar(): Promise<void>;
}

/**
 * Monta a API inteira sobre o banco do arquivo. Chame no `beforeAll`. As
 * `opcoes` completam as de sempre (`administracao` é mesclada em profundidade;
 * `origens` fica fixa); sem argumento, o comportamento é o de antes.
 */
export function montarApiCompleta(
  opcoes: Partial<OpcoesDoApp> = {},
): ApiCompleta {
  const url = new URL(bancoDoArquivo().url);
  const daAplicacao = new URL(url);
  daAplicacao.username = "sc_app";
  daAplicacao.password = SENHA_DA_APLICACAO;
  const daAdministracao = new URL(url);
  daAdministracao.username = "sc_admin";
  daAdministracao.password = exigirVariavel("SENHA_BANCO_ADMINISTRACAO");
  process.env.DATABASE_URL = daAplicacao.toString();
  process.env.DATABASE_URL_ADMINISTRACAO = daAdministracao.toString();

  const app = criarApp({
    ...opcoes,
    origens: [ORIGEM_DA_ADMINISTRACAO],
    administracao: { enviarConvite: async () => {}, ...opcoes.administracao },
  });
  return {
    app,
    encerrar: async () => {
      await encerrarBanco();
      await encerrarBancoDaAdministracao();
    },
  };
}

/** Cabeçalhos de uma sessão do papel dado, com a origem autorizada. */
export function sessao(
  identidadeId: string,
  papel: PapelDaSessao = "CUSTOMER",
): { authorization: string; origin: string } {
  return {
    authorization: `Bearer ${tokenDe(identidadeId, papel)}`,
    origin: ORIGEM_DA_ADMINISTRACAO,
  };
}

/** Atalhos de requisição sobre a API montada. */
export function cliente(api: ApiCompleta) {
  return {
    get: (caminho: string, cabecalhos: Record<string, string> = {}) =>
      request(api.app).get(caminho).set(cabecalhos),
    post: (
      caminho: string,
      corpo: object,
      cabecalhos: Record<string, string> = {},
    ) =>
      request(api.app)
        .post(caminho)
        .set({ origin: ORIGEM_DA_ADMINISTRACAO, ...cabecalhos })
        .send(corpo),
    put: (
      caminho: string,
      corpo: object,
      cabecalhos: Record<string, string> = {},
    ) =>
      request(api.app)
        .put(caminho)
        .set({ origin: ORIGEM_DA_ADMINISTRACAO, ...cabecalhos })
        .send(corpo),
    patch: (
      caminho: string,
      corpo: object,
      cabecalhos: Record<string, string> = {},
    ) =>
      request(api.app)
        .patch(caminho)
        .set({ origin: ORIGEM_DA_ADMINISTRACAO, ...cabecalhos })
        .send(corpo),
    delete: (caminho: string, cabecalhos: Record<string, string> = {}) =>
      request(api.app)
        .delete(caminho)
        .set({ origin: ORIGEM_DA_ADMINISTRACAO, ...cabecalhos }),
  };
}
