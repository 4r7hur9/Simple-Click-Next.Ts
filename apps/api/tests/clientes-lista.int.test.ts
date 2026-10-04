/**
 * Prova da lista de clientes do dono, contra PostgreSQL de verdade
 * (AC-700, AC-701).
 *
 * O cenário é montado pelos caminhos que o produto usa: o cliente é cadastrado
 * pela rota do painel, o pedido é lançado pela rota do pedido manual e
 * cancelado pela rota de status. A lista é lida pela rota da lista, com o token
 * do dono MEMBRO da loja. Nada é conferido no banco por fora: o que vale é o
 * que o dono vê.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esquemaDaListaDeClientes,
  type ClienteDaLojaNoContrato,
} from "@simpleclick/contracts";
import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";

import {
  aplicacaoDosClientes,
  ESPERA_DOS_CLIENTES,
  itemDoLanche,
  lancheComMolho,
  lojaComDono,
  Painel,
  type LancheComMolho,
} from "./apoio-de-clientes.ts";
import { abrirAcessoDaAplicacao } from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { chaveDoTelefone } from "../src/modules/customers/telefone-do-cliente.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let painel: Painel;
let lanche: LancheComMolho;
const ids: Record<string, string> = {};

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  const alvo = await lojaComDono(migrador, { nome: "Lanchonete da Praça" });
  painel = new Painel(aplicacaoDosClientes(acesso), alvo);
  lanche = await lancheComMolho(alvo.loja, 2000);

  const cadastros = [
    ["joao", { nome: "João Açaí", telefone: "(11) 98888-7777" }],
    ["maria", { nome: "Maria da Conceição", telefone: "11 97777-6666" }],
    ["ana", { nome: "Ana Paula", telefone: "+55 21 96666-5555" }],
  ] as const;
  for (const [chave, corpo] of cadastros) {
    const resposta = await painel.cadastrar(corpo);
    expect(resposta.status).toBe(201);
    ids[chave] = resposta.body.id as string;
  }

  // João: dois pedidos que valem (1 lanche de R$ 20,00 e 2 com mostarda,
  // 2 × R$ 21,50) e um cancelado, que não soma.
  const lancar = async (clienteId: string, item: Record<string, unknown>) => {
    const resposta = await painel.lancar({
      cliente: { tipo: "cadastrado", clienteId },
      itens: [item],
      entrega: "PICKUP",
      formaDePagamento: "CASH",
    });
    expect(resposta.status).toBe(201);
    return resposta.body.id as string;
  };
  await lancar(ids.joao as string, itemDoLanche(lanche));
  await lancar(ids.joao as string, itemDoLanche(lanche, lanche.mostarda, 2));
  const cancelado = await lancar(ids.joao as string, itemDoLanche(lanche));
  const cancelamento = await painel.mudarStatus(
    cancelado,
    "CANCELLED",
    "Cliente desistiu",
  );
  expect(cancelamento.status).toBe(200);

  // Maria: um pedido, lançado DEPOIS dos do João — é ela quem abre a lista.
  await lancar(ids.maria as string, itemDoLanche(lanche));
}, ESPERA_DOS_CLIENTES);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DOS_CLIENTES);

function porNome(
  clientes: readonly ClienteDaLojaNoContrato[],
): Record<string, ClienteDaLojaNoContrato> {
  return Object.fromEntries(clientes.map((c) => [c.nome, c]));
}

describe("a lista mostra o que importa para atender (AC-700)", () => {
  it(
    "@spec:AC-700 cada cliente vem com nome, telefone, total de pedidos, valor gasto e último pedido",
    async () => {
      const resposta = await painel.listar();

      expect(resposta.status).toBe(200);
      expect(resposta.headers["cache-control"]).toBe("no-store");
      // Esquema estrito: campo a mais (senha, identidade, endereço salvo da
      // conta) reprovaria aqui.
      const { clientes } = esquemaDaListaDeClientes.parse(resposta.body);
      const lista = porNome(clientes);

      expect(lista["João Açaí"]).toMatchObject({
        telefone: "+5511988887777",
        temConta: false,
        // O cancelado não entra nem na contagem nem no valor.
        totalDePedidos: 2,
        totalGastoCentavos: 2000 + 2 * 2150,
      });
      expect(lista["João Açaí"]?.ultimoPedidoEm).not.toBeNull();
      expect(lista["Maria da Conceição"]).toMatchObject({
        totalDePedidos: 1,
        totalGastoCentavos: 2000,
      });
      // Quem nunca comprou aparece, com zero e sem data — e não some da lista.
      expect(lista["Ana Paula"]).toMatchObject({
        telefone: "+5521966665555",
        totalDePedidos: 0,
        totalGastoCentavos: 0,
        ultimoPedidoEm: null,
      });
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-700 quem comprou por último abre a lista; quem nunca comprou fica no fim",
    async () => {
      const { clientes } = esquemaDaListaDeClientes.parse(
        (await painel.listar()).body,
      );
      expect(clientes.map((c) => c.nome)).toEqual([
        "Maria da Conceição",
        "João Açaí",
        "Ana Paula",
      ]);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-700 sem sessão de dono a lista não responde",
    async () => {
      const semSessao = await painel.listar().unset("Authorization");
      expect(semSessao.status).toBe(401);
    },
    ESPERA_DOS_CLIENTES,
  );
});

describe("a busca acha por nome e por telefone (AC-701)", () => {
  async function nomesDaBusca(busca: string): Promise<string[]> {
    const resposta = await painel.listar(busca);
    expect(resposta.status).toBe(200);
    return esquemaDaListaDeClientes
      .parse(resposta.body)
      .clientes.map((c) => c.nome)
      .sort();
  }

  it(
    "@spec:AC-701 parte do nome, sem acento e sem maiúscula, acha só quem corresponde",
    async () => {
      expect(await nomesDaBusca("conceicao")).toEqual(["Maria da Conceição"]);
      expect(await nomesDaBusca("AÇA")).toEqual(["João Açaí"]);
      expect(await nomesDaBusca("paula")).toEqual(["Ana Paula"]);
      expect(await nomesDaBusca("ninguém com esse nome")).toEqual([]);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-701 parte do telefone acha o cliente com qualquer pontuação digitada",
    async () => {
      // Cadastrado como "(11) 98888-7777", guardado como +5511988887777.
      expect(await nomesDaBusca("98888-7777")).toEqual(["João Açaí"]);
      expect(await nomesDaBusca("(11) 98888")).toEqual(["João Açaí"]);
      expect(await nomesDaBusca("+55 11 9888")).toEqual(["João Açaí"]);
      expect(await nomesDaBusca("119888877")).toEqual(["João Açaí"]);
      // Cadastrado com o código do país na frente; buscado sem ele.
      expect(await nomesDaBusca("21 96666")).toEqual(["Ana Paula"]);
      expect(await nomesDaBusca("977776666")).toEqual(["Maria da Conceição"]);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-701 a chave de telefone que o banco gera é a mesma que a API calcula",
    async () => {
      // Duas implementações da mesma regra só são aceitáveis se concordarem.
      const formas = [
        "(11) 98888-7777",
        "+55 11 98888-7777",
        "5511988887777",
        "+55 (21) 3333-4444",
        "2133334444",
        "551234",
        "+1 415 555 0100",
      ];
      for (const forma of formas) {
        const { rows } = await migrador.query<{ chave: string | null }>(
          "SELECT app.chave_de_telefone($1) AS chave",
          [forma],
        );
        expect(rows[0]?.chave, forma).toBe(chaveDoTelefone(forma));
      }
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    '@spec:AC-701 curinga digitado é texto, e não padrão: "%" não devolve a lista inteira',
    async () => {
      expect(await nomesDaBusca("%")).toEqual([]);
      expect(await nomesDaBusca("_")).toEqual([]);
    },
    ESPERA_DOS_CLIENTES,
  );
});
