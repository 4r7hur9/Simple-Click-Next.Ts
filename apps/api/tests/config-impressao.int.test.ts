/**
 * Prova da configuração de impressão do cupom (T-906: AC-919, AC-920).
 *
 * O que se prova aqui é a CONFIGURAÇÃO: a largura escolhida é a que o gerador
 * do cupom recebe, e trocá-la troca para o próximo cupom da mesma loja; o
 * conteúdo opcional segue a escolha do dono, e o essencial não desliga. A
 * montagem do cupom em si, na largura recebida, é do gerador da T-605.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
} from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import {
  camposRecusados,
  gravarSecao,
  lerSecao,
  montarAppDaConfiguracao,
  tokenDoDono,
} from "./apoio-de-configuracao.ts";
import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof montarAppDaConfiguracao>;
let token: string;

const CONTEUDO_PADRAO = {
  pedido: true,
  itens: true,
  total: true,
  enderecoCliente: true,
  totalEmDestaque: false,
  observacoes: true,
};

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = montarAppDaConfiguracao(acesso);
  const dono = await criarIdentidade({ nome: "Dona Zica" });
  token = tokenDoDono(dono.id);
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

function salvarImpressao(loja: LojaDeTeste, corpo: unknown) {
  return gravarSecao(app, {
    apelido: loja.apelido,
    secao: "impressao",
    corpo,
    token,
  });
}

/** O documento de impressão como o gerador do cupom o lê do banco. */
async function impressaoGuardada(loja: LojaDeTeste) {
  const { rows } = await migrador.query<{ printing: Record<string, unknown> }>(
    `SELECT printing FROM app.store_settings WHERE store_id = $1`,
    [loja.id],
  );
  return rows[0]?.printing;
}

describe("a largura do papel é a do cupom (AC-919)", () => {
  it(
    "@spec:AC-919 papel de 58 mm configurado é o que o cupom recebe, e trocar para 80 mm vale para o mesmo pedido",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria da Térmica" });

      expect(
        (
          await salvarImpressao(loja, {
            larguraMm: 58,
            conteudo: CONTEUDO_PADRAO,
          })
        ).status,
      ).toBe(204);
      expect((await impressaoGuardada(loja))?.["larguraMm"]).toBe(58);
      expect(
        (await lerSecao(app, loja.apelido, "impressao", token)).body.larguraMm,
      ).toBe(58);

      await salvarImpressao(loja, { larguraMm: 80, conteudo: CONTEUDO_PADRAO });
      expect((await impressaoGuardada(loja))?.["larguraMm"]).toBe(80);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-919 largura que a impressora térmica não tem é recusada, e a anterior continua",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria do Rolo" });
      await salvarImpressao(loja, { larguraMm: 58, conteudo: CONTEUDO_PADRAO });

      const recusado = await salvarImpressao(loja, {
        larguraMm: 70,
        conteudo: CONTEUDO_PADRAO,
      });
      expect(recusado.status).toBe(400);
      expect(camposRecusados(recusado.body)).toEqual(["larguraMm"]);
      expect((await impressaoGuardada(loja))?.["larguraMm"]).toBe(58);
    },
    ESPERA_LONGA,
  );
});

describe("o dono escolhe o que aparece no cupom (AC-920)", () => {
  it(
    "@spec:AC-920 desligar o endereço e ligar o total em destaque vale para o cupom seguinte",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria do Cupom" });
      await salvarImpressao(loja, {
        larguraMm: 80,
        conteudo: {
          ...CONTEUDO_PADRAO,
          enderecoCliente: false,
          totalEmDestaque: true,
        },
      });

      expect((await impressaoGuardada(loja))?.["conteudo"]).toEqual({
        ...CONTEUDO_PADRAO,
        enderecoCliente: false,
        totalEmDestaque: true,
      });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-920 o essencial do pedido não desliga, nem se a requisição pedir",
    async () => {
      const loja = await criarLoja({ nome: "Pastelaria Essencial" });
      const resposta = await salvarImpressao(loja, {
        larguraMm: 58,
        conteudo: {
          pedido: false,
          itens: false,
          total: false,
          enderecoCliente: true,
          totalEmDestaque: false,
          observacoes: false,
        },
      });
      expect(resposta.status).toBe(204);

      const conteudo = (await impressaoGuardada(loja))?.["conteudo"];
      expect(conteudo).toMatchObject({
        pedido: true,
        itens: true,
        total: true,
        observacoes: false,
      });
    },
    ESPERA_LONGA,
  );
});
