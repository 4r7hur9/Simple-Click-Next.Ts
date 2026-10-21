/**
 * Prova do pedido só com conta: sem sessão, 401 `conta_obrigatoria`; com
 * sessão, o pedido usa nome, e-mail e telefone da CONTA, e o endereço da
 * entrega é um salvo (`enderecoId`) ou um novo (`endereco`), que fica salvo.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarEnderecoDoCliente,
  criarIdentidade,
  criarLoja,
  criarProduto,
} from "@simpleclick/testing";
import type {
  IdentidadeDeTeste,
  LojaDeTeste,
  ProdutoDeTeste,
} from "@simpleclick/testing";

import { prepararParaVender, tentarFecharPeloSite } from "./apoio-de-compra.ts";
import { abrirAcessoDaAplicacao } from "./apoio-de-isolamento.ts";
import {
  aplicacaoDaOperacao,
  comoPortador,
  ESPERA_DA_OPERACAO,
  tokenDeAcesso,
} from "./apoio-de-pedidos.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof aplicacaoDaOperacao>;
let loja: LojaDeTeste;
let produto: ProdutoDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = aplicacaoDaOperacao(acesso);
  loja = await criarLoja({ nome: "Lanchonete da Conta" });
  await prepararParaVender(migrador, loja);
  produto = await criarProduto({ loja, nome: "X-salada", precoCentavos: 2500 });
}, ESPERA_DA_OPERACAO);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DA_OPERACAO);

function comoConta(identidade: IdentidadeDeTeste): string {
  return comoPortador(tokenDeAcesso(identidade.id, "CUSTOMER"));
}

async function contatoDoPedido(id: string) {
  const { rows } = await migrador.query<{
    customer_name: string;
    customer_phone_e164: string;
    customer_email: string | null;
    address_street: string | null;
    address_number: string | null;
  }>(
    `SELECT name AS customer_name, phone_e164 AS customer_phone_e164,
            email AS customer_email, street AS address_street,
            number AS address_number
       FROM app.order_contacts WHERE order_id = $1`,
    [id],
  );
  return rows[0];
}

async function enderecosDe(identidade: IdentidadeDeTeste) {
  const { rows } = await migrador.query<{ street: string }>(
    `SELECT street FROM app.customer_addresses WHERE identity_id = $1`,
    [identidade.id],
  );
  return rows.map((linha) => linha.street);
}

describe("o pedido exige conta logada", () => {
  it(
    "sem sessão responde 401 conta_obrigatoria",
    async () => {
      const resposta = await tentarFecharPeloSite(app, loja, produto, {
        corpo: {
          contato: { nome: "Ana Paula", telefone: "11988887777" },
          entrega: "PICKUP",
        },
      });
      expect(resposta.status).toBe(401);
      expect(resposta.body.erro).toBe("conta_obrigatoria");
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "com sessão, nome, e-mail e telefone vêm da conta",
    async () => {
      const bia = await criarIdentidade({
        nome: "Bia da Conta",
        telefone: "+5511944443333",
      });
      const resposta = await tentarFecharPeloSite(app, loja, produto, {
        autorizacao: comoConta(bia),
        corpo: { entrega: "PICKUP" },
      });
      expect(resposta.status).toBe(201);
      expect(await contatoDoPedido(resposta.body.id)).toMatchObject({
        customer_name: "Bia da Conta",
        customer_phone_e164: "+5511944443333",
        customer_email: bia.email,
        address_street: null,
      });
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "conta sem telefone: o pedido pede o telefone e o grava na conta",
    async () => {
      const caio = await criarIdentidade({ nome: "Caio Sem Telefone" });
      const sem = await tentarFecharPeloSite(app, loja, produto, {
        autorizacao: comoConta(caio),
        corpo: { entrega: "PICKUP" },
      });
      expect(sem.status).toBe(422);
      expect(sem.body.erro).toBe("telefone_obrigatorio");

      const com = await tentarFecharPeloSite(app, loja, produto, {
        autorizacao: comoConta(caio),
        corpo: { entrega: "PICKUP", telefone: "(11) 93333-2222" },
      });
      expect(com.status).toBe(201);
      const { rows } = await migrador.query<{ phone_e164: string }>(
        `SELECT phone_e164 FROM app.identities WHERE id = $1`,
        [caio.id],
      );
      expect(rows[0]?.phone_e164).toBe("+5511933332222");
    },
    ESPERA_DA_OPERACAO,
  );

  it(
    "entrega com endereço salvo, com endereço novo (que fica salvo) e sem endereço",
    async () => {
      const dani = await criarIdentidade({
        nome: "Dani Entrega",
        telefone: "+5511922221111",
      });
      const salvo = await criarEnderecoDoCliente({
        identidade: dani,
        logradouro: "Rua das Flores",
        numero: "10",
        padrao: true,
      });

      const semEndereco = await tentarFecharPeloSite(app, loja, produto, {
        autorizacao: comoConta(dani),
        corpo: { entrega: "DELIVERY" },
      });
      expect(semEndereco.status).toBe(422);
      expect(semEndereco.body.erro).toBe("endereco_obrigatorio");

      const deOutro = await tentarFecharPeloSite(app, loja, produto, {
        autorizacao: comoConta(dani),
        corpo: { entrega: "DELIVERY", enderecoId: crypto.randomUUID() },
      });
      expect(deOutro.status).toBe(422);
      expect(deOutro.body.erro).toBe("endereco_nao_encontrado");

      const peloSalvo = await tentarFecharPeloSite(app, loja, produto, {
        autorizacao: comoConta(dani),
        corpo: { entrega: "DELIVERY", enderecoId: salvo.id },
      });
      expect(peloSalvo.status).toBe(201);
      expect(await contatoDoPedido(peloSalvo.body.id)).toMatchObject({
        address_street: "Rua das Flores",
        address_number: "10",
      });

      const novo = {
        logradouro: "Avenida Nova",
        numero: "200",
        bairro: "Centro",
      };
      for (let vez = 0; vez < 2; vez += 1) {
        const pedido = await tentarFecharPeloSite(app, loja, produto, {
          autorizacao: comoConta(dani),
          corpo: { entrega: "DELIVERY", endereco: novo },
        });
        expect(pedido.status).toBe(201);
      }
      // O endereço novo fica salvo — uma vez só, mesmo usado duas vezes.
      expect((await enderecosDe(dani)).sort()).toEqual([
        "Avenida Nova",
        "Rua das Flores",
      ]);
    },
    ESPERA_DA_OPERACAO,
  );
});
