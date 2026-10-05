/**
 * Prova dos endereços salvos do comprador, contra PostgreSQL de verdade
 * (T-707: AC-509, AC-703).
 *
 * O ENDEREÇO É DA PESSOA, E NÃO DA LOJA: cadastrado uma vez, vale em qualquer
 * loja, e é o padrão dele que o fechamento pré-preenche (AC-509). As provas
 * passam pelas rotas da conta com o token de CLIENTE de verdade, e o
 * isolamento é conferido nos dois sentidos: a outra pessoa não alcança, e o
 * dono da loja — mesmo de loja onde a pessoa comprou — também não.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { esquemaDosEnderecosSalvos } from "@simpleclick/contracts";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarEnderecoDoCliente,
  criarIdentidade,
  criarProduto,
  type IdentidadeDeTeste,
} from "@simpleclick/testing";

import {
  aplicacaoDosClientes,
  ESPERA_DOS_CLIENTES,
  lojaComDono,
  ORIGEM_DO_PAINEL,
  Painel,
  type LojaComDono,
} from "./apoio-de-clientes.ts";
import { fecharPeloSite } from "./apoio-de-compra.ts";
import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
} from "./apoio-de-isolamento.ts";
import { comoPortador, tokenDeAcesso } from "./apoio-de-pedidos.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof aplicacaoDosClientes>;
let alvo: LojaComDono;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = aplicacaoDosClientes(acesso);
  alvo = await lojaComDono(migrador, { nome: "Empório Central" });
}, ESPERA_DOS_CLIENTES);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DOS_CLIENTES);

/** As chamadas da área da conta, com o token de cliente da pessoa. */
function conta(pessoa: IdentidadeDeTeste) {
  const autorizacao = comoPortador(tokenDeAcesso(pessoa.id, "CUSTOMER"));
  return {
    listar: () =>
      request(app).get("/v1/conta/enderecos").set("Authorization", autorizacao),
    salvar: (corpo: Record<string, unknown>) =>
      request(app)
        .post("/v1/conta/enderecos")
        .set("Origin", ORIGEM_DO_PAINEL)
        .set("Authorization", autorizacao)
        .send(corpo),
    trocar: (id: string, corpo: Record<string, unknown>) =>
      request(app)
        .put(`/v1/conta/enderecos/${id}`)
        .set("Origin", ORIGEM_DO_PAINEL)
        .set("Authorization", autorizacao)
        .send(corpo),
    apagar: (id: string) =>
      request(app)
        .delete(`/v1/conta/enderecos/${id}`)
        .set("Origin", ORIGEM_DO_PAINEL)
        .set("Authorization", autorizacao),
  };
}

async function enderecosDe(pessoa: IdentidadeDeTeste) {
  const resposta = await conta(pessoa).listar();
  expect(resposta.status).toBe(200);
  return esquemaDosEnderecosSalvos.parse(resposta.body).enderecos;
}

describe("o endereço salvo é da pessoa e vale em qualquer loja (AC-509)", () => {
  it(
    "@spec:AC-509 o primeiro endereço salvo nasce padrão, e o padrão vem primeiro na lista",
    async () => {
      const ana = await criarIdentidade({ nome: "Ana Endereços" });
      const casa = await conta(ana).salvar({
        rotulo: "Casa",
        logradouro: "Rua das Flores",
        numero: "123",
        bairro: "Vila Mariana",
        cidade: "São Paulo",
        estado: "sp",
        cep: "04110-000",
      });
      expect(casa.status).toBe(201);
      expect(casa.body).toMatchObject({
        rotulo: "Casa",
        estado: "SP",
        cep: "04110000",
        padrao: true,
      });

      const trabalho = await conta(ana).salvar({
        rotulo: "Trabalho",
        logradouro: "Avenida Paulista",
        numero: "1000",
      });
      expect(trabalho.body.padrao).toBe(false);

      const lista = await enderecosDe(ana);
      expect(lista.map((e) => [e.rotulo, e.padrao])).toEqual([
        ["Casa", true],
        ["Trabalho", false],
      ]);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-509 marcar outro como padrão deixa um padrão só, e apagar o padrão promove o que sobra",
    async () => {
      const bruno = await criarIdentidade({ nome: "Bruno Endereços" });
      const primeiro = await criarEnderecoDoCliente({
        identidade: bruno,
        rotulo: "Casa",
        padrao: true,
      });
      const segundo = await criarEnderecoDoCliente({
        identidade: bruno,
        rotulo: "Sítio",
      });

      const troca = await conta(bruno).trocar(segundo.id, {
        rotulo: "Sítio",
        logradouro: "Estrada do Sítio",
        padrao: true,
      });
      expect(troca.status).toBe(200);
      expect((await enderecosDe(bruno)).map((e) => [e.id, e.padrao])).toEqual([
        [segundo.id, true],
        [primeiro.id, false],
      ]);

      expect((await conta(bruno).apagar(segundo.id)).status).toBe(204);
      expect((await enderecosDe(bruno)).map((e) => [e.id, e.padrao])).toEqual([
        [primeiro.id, true],
      ]);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-509 cadastrado uma vez, o endereço continua o mesmo depois de a pessoa comprar em duas lojas",
    async () => {
      const carla = await criarIdentidade({ nome: "Carla Duas Lojas" });
      await conta(carla).salvar({ logradouro: "Rua Única", numero: "1" });

      const outra = await lojaComDono(migrador, { nome: "Outra Loja" });
      for (const loja of [alvo, outra]) {
        const produto = await criarProduto({ loja: loja.loja });
        await fecharPeloSite(app, loja.loja, produto, {
          autorizacao: comoPortador(tokenDeAcesso(carla.id, "CUSTOMER")),
          contato: { nome: "Carla Duas Lojas", telefone: "11 93000-0000" },
        });
      }

      const lista = await enderecosDe(carla);
      expect(lista).toHaveLength(1);
      expect(lista[0]).toMatchObject({ logradouro: "Rua Única", padrao: true });
    },
    ESPERA_DOS_CLIENTES,
  );
});

describe("ninguém além da pessoa alcança os endereços dela (AC-509)", () => {
  it(
    "@spec:AC-509 @principle:P-003 a outra pessoa não lista, não troca e não apaga o endereço alheio",
    async () => {
      const dona = await criarIdentidade({ nome: "Dora Dona" });
      const intrusa = await criarIdentidade({ nome: "Iara Intrusa" });
      const daDona = await criarEnderecoDoCliente({
        identidade: dona,
        logradouro: "Rua da Dora",
        padrao: true,
      });

      expect(await enderecosDe(intrusa)).toEqual([]);
      expect(
        (await conta(intrusa).trocar(daDona.id, { logradouro: "Rua Trocada" }))
          .status,
      ).toBe(404);
      expect((await conta(intrusa).apagar(daDona.id)).status).toBe(404);

      const daDonaDepois = await enderecosDe(dona);
      expect(daDonaDepois).toEqual([
        expect.objectContaining({ id: daDona.id, logradouro: "Rua da Dora" }),
      ]);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-509 @principle:P-003 o dono da loja onde a pessoa comprou não alcança os endereços salvos dela",
    async () => {
      const elisa = await criarIdentidade({ nome: "Elisa Compradora" });
      await criarEnderecoDoCliente({ identidade: elisa, padrao: true });
      const produto = await criarProduto({ loja: alvo.loja });
      await fecharPeloSite(app, alvo.loja, produto, {
        autorizacao: comoPortador(tokenDeAcesso(elisa.id, "CUSTOMER")),
        contato: { nome: "Elisa Compradora", telefone: "11 93100-0000" },
      });

      // Pela porta da conta, sessão de dono não entra.
      const pelaConta = await request(app)
        .get("/v1/conta/enderecos")
        .set("Authorization", alvo.autorizacao);
      expect(pelaConta.status).toBe(401);

      // E no banco, no contexto do painel da loja, a tabela é vazia para ele.
      const vistas = await comoRequisicao(
        acesso,
        {
          lojaId: alvo.loja.id,
          usuarioId: alvo.dono.identidade.id,
          papel: "OWNER",
        },
        (tx) =>
          tx.$queryRaw<{ id: string }[]>`SELECT id FROM app.customer_addresses`,
      );
      expect(vistas).toEqual([]);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-509 sem sessão de cliente a área de endereços não responde",
    async () => {
      const semSessao = await request(app).get("/v1/conta/enderecos");
      expect(semSessao.status).toBe(401);
    },
    ESPERA_DOS_CLIENTES,
  );
});

describe("o endereço da ficha é da loja, separado do da conta (AC-703)", () => {
  it(
    "@spec:AC-703 o endereço que o dono anota na ficha não mexe nos endereços salvos da pessoa, e vice-versa",
    async () => {
      const fabio = await criarIdentidade({ nome: "Fábio Ficha" });
      await criarEnderecoDoCliente({
        identidade: fabio,
        logradouro: "Rua Salva na Conta",
        padrao: true,
      });
      const produto = await criarProduto({ loja: alvo.loja });
      await fecharPeloSite(app, alvo.loja, produto, {
        autorizacao: comoPortador(tokenDeAcesso(fabio.id, "CUSTOMER")),
        contato: { nome: "Fábio Ficha", telefone: "11 93200-0000" },
      });

      const painel = new Painel(app, alvo);
      const lista = await painel.listar("Fábio");
      const clienteId = lista.body.clientes[0]?.id as string;
      // A ficha nasce SEM endereço: o salvo na conta não vaza para o dono.
      const ficha = await painel.ficha(clienteId);
      expect(ficha.body.cliente.endereco).toBeNull();

      const edicao = await painel.editar(clienteId, {
        endereco: { logradouro: "Rua Anotada pelo Dono", numero: "9" },
      });
      expect(edicao.status).toBe(200);
      expect(edicao.body.endereco).toMatchObject({
        logradouro: "Rua Anotada pelo Dono",
      });

      expect(await enderecosDe(fabio)).toEqual([
        expect.objectContaining({ logradouro: "Rua Salva na Conta" }),
      ]);
    },
    ESPERA_DOS_CLIENTES,
  );
});
