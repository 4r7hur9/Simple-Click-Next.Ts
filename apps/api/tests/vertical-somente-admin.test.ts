/**
 * Prova de que o tipo de negócio é da administração, e não do dono (AC-323).
 *
 * A RECUSA JÁ EXISTIA (AC-921): esquema estrito nas seções e rota inexistente
 * para o que é da plataforma. O que o AC-323 cobra a mais é a EXPLICAÇÃO — o
 * dono que tenta, inclusive montando a requisição à mão, precisa ouvir que
 * esse ajuste é feito pela administração, e não um "campo desconhecido" que o
 * faria tentar de novo com outro nome.
 *
 * Contra o banco de verdade, pela aplicação montada, e conferindo no banco que
 * nada mudou — recusa que responde certo e grava assim mesmo não é recusa.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
} from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import {
  gravarSecao,
  montarAppDaConfiguracao,
  ORIGEM_DO_PAINEL,
  tokenDoDono,
} from "./apoio-de-configuracao.ts";
import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof montarAppDaConfiguracao>;
let loja: LojaDeTeste;
let token: string;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = montarAppDaConfiguracao(acesso);
  loja = await criarLoja({ ramo: "lanchonete", nome: "Lanches do Tipo" });
  const dono = await criarIdentidade({ nome: "Dono do Tipo" });
  token = tokenDoDono(dono.id);
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/** O tipo de negócio gravado na loja, lido fora do isolamento. */
async function tipoDaLoja(): Promise<string | undefined> {
  const { rows } = await migrador.query<{ vertical_code: string }>(
    "SELECT vertical_code FROM app.stores WHERE id = $1",
    [loja.id],
  );
  return rows[0]?.vertical_code;
}

describe("o dono não muda o tipo de negócio (AC-323)", () => {
  it(
    "@spec:AC-323 mandar o tipo de negócio dentro de uma seção é negado com a explicação, e a loja continua lanchonete",
    async () => {
      for (const campo of ["verticalCode", "tipoDeNegocio", "ramo"]) {
        const resposta = await gravarSecao(app, {
          apelido: loja.apelido,
          secao: "aparencia",
          corpo: {
            nome: "Lanches do Tipo",
            boasVindas: "Bem-vindo!",
            sobre: null,
            logo: null,
            capa: null,
            corPrimaria: null,
            [campo]: "APPAREL",
          },
          token,
        });

        expect(resposta.status, campo).toBe(400);
        expect(resposta.body.erro, campo).toBe("campo_da_plataforma");
        expect(resposta.body.mensagem, campo).toContain(
          "feito pela administração da plataforma",
        );
        expect(resposta.body.mensagem, campo).toContain("tipo de negócio");
      }

      expect(await tipoDaLoja()).toBe(loja.ramoCodigo);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-323 pedir a alteração direto no endereço do tipo de negócio também é negado com a explicação",
    async () => {
      const endereco = `/v1/lojas/${loja.apelido}/configuracao/tipo-de-negocio`;
      const cliente = request(app);
      const pedidos = {
        put: () => cliente.put(endereco),
        patch: () => cliente.patch(endereco),
        post: () => cliente.post(endereco),
      };
      for (const metodo of ["put", "patch", "post"] as const) {
        const resposta = await pedidos[metodo]()
          .set("Origin", ORIGEM_DO_PAINEL)
          .set("Authorization", `Bearer ${token}`)
          .send({ tipoDeNegocio: "APPAREL" });

        // Continua sem rota (AC-921) — e agora diz por quê.
        expect(resposta.status, metodo).toBe(404);
        expect(resposta.body.mensagem, metodo).toContain(
          "feito pela administração da plataforma",
        );
      }

      expect(await tipoDaLoja()).toBe(loja.ramoCodigo);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-323 a seção do dono sem campo da plataforma continua sendo aceita",
    async () => {
      // A recusa é do CAMPO, e não da seção: o dono que só mexe na
      // apresentação não pode ser barrado por causa da regra nova.
      const resposta = await gravarSecao(app, {
        apelido: loja.apelido,
        secao: "aparencia",
        corpo: {
          nome: "Lanches do Tipo",
          boasVindas: "Bem-vindo à lanchonete!",
          sobre: null,
          logo: null,
          capa: null,
          corPrimaria: null,
        },
        token,
      });

      expect(resposta.status).toBe(204);
      expect(await tipoDaLoja()).toBe(loja.ramoCodigo);
    },
    ESPERA_LONGA,
  );
});
