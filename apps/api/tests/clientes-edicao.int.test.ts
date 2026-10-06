/**
 * Prova da correção e da remoção do cadastro sem afetar os pedidos, contra
 * PostgreSQL de verdade (AC-705).
 *
 * O pedido guarda cópia do contato do momento da compra (P-010). A prova
 * confere isso onde o dono o encontra: no detalhe do pedido da fila, antes e
 * depois de mexer na ficha.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { esquemaDaListaDeClientes } from "@simpleclick/contracts";
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

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let painel: Painel;
let lanche: LancheComMolho;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  const alvo = await lojaComDono(migrador, { nome: "Marmitaria da Esquina" });
  painel = new Painel(aplicacaoDosClientes(acesso), alvo);
  lanche = await lancheComMolho(alvo.loja, 2500);
}, ESPERA_DOS_CLIENTES);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DOS_CLIENTES);

/** Um cliente com um pedido de entrega no endereço da ficha. */
async function clienteComPedido(
  nome: string,
  telefone: string,
): Promise<{ clienteId: string; pedidoId: string }> {
  const cadastro = await painel.cadastrar({
    nome,
    telefone,
    endereco: { logradouro: "Rua Antiga", numero: "10", bairro: "Centro" },
  });
  expect(cadastro.status).toBe(201);
  const pedido = await painel.lancar({
    cliente: { tipo: "cadastrado", clienteId: cadastro.body.id },
    itens: [itemDoLanche(lanche)],
    entrega: "DELIVERY",
    formaDePagamento: "CASH",
  });
  expect(pedido.status).toBe(201);
  return { clienteId: cadastro.body.id, pedidoId: pedido.body.id };
}

async function nomesNaLista(busca?: string): Promise<string[]> {
  const resposta = await painel.listar(busca);
  return esquemaDaListaDeClientes
    .parse(resposta.body)
    .clientes.map((c) => c.nome);
}

describe("a correção do cadastro aparece e não mexe nos pedidos (AC-705)", () => {
  it(
    "@spec:AC-705 corrigir nome, telefone e endereço muda a lista, e o pedido antigo guarda o contato da compra",
    async () => {
      const { clienteId, pedidoId } = await clienteComPedido(
        "Kátia Antes",
        "(11) 96543-2100",
      );

      const edicao = await painel.editar(clienteId, {
        nome: "Kátia Depois",
        telefone: "11 96543-9999",
        endereco: { logradouro: "Rua Nova", numero: "200" },
      });
      expect(edicao.status).toBe(200);
      expect(edicao.body).toMatchObject({
        nome: "Kátia Depois",
        telefone: "+5511965439999",
        endereco: { logradouro: "Rua Nova", numero: "200" },
      });

      const lista = await nomesNaLista("Kátia");
      expect(lista).toEqual(["Kátia Depois"]);

      // O pedido de antes continua com o contato de antes (P-010).
      const pedido = await painel.pedido(pedidoId);
      expect(pedido.status).toBe(200);
      expect(pedido.body.pedido.contato).toMatchObject({
        nome: "Kátia Antes",
        telefone: "+5511965432100",
        endereco: { logradouro: "Rua Antiga", numero: "10" },
      });
      // E continua ligado à ficha: o histórico dela ainda o mostra.
      const ficha = await painel.ficha(clienteId);
      expect(ficha.body.pedidos.map((p: { id: string }) => p.id)).toEqual([
        pedidoId,
      ]);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-705 corrigir para o telefone de outro cliente é recusado apontando o outro",
    async () => {
      const outro = await painel.cadastrar({
        nome: "Lucas Dono do Número",
        telefone: "11 94321-0000",
      });
      const eu = await painel.cadastrar({
        nome: "Mário Quer o Número",
        telefone: "11 94321-1111",
      });

      const edicao = await painel.editar(eu.body.id as string, {
        telefone: "(11) 94321-0000",
      });
      expect(edicao.status).toBe(409);
      expect(edicao.body.clienteId).toBe(outro.body.id);

      // Corrigir só o nome não acusa o cliente de repetir a si mesmo.
      const soNome = await painel.editar(eu.body.id as string, {
        nome: "Mário Corrigido",
      });
      expect(soNome.status).toBe(200);
    },
    ESPERA_DOS_CLIENTES,
  );
});

describe("a remoção tira das listagens e preserva os pedidos (AC-705)", () => {
  it(
    "@spec:AC-705 remover some com a ficha da lista, da busca e do acesso direto",
    async () => {
      const { clienteId, pedidoId } = await clienteComPedido(
        "Nair Removida",
        "(11) 91234-0001",
      );
      expect(await nomesNaLista("Nair")).toEqual(["Nair Removida"]);

      const remocao = await painel.remover(clienteId);
      expect(remocao.status).toBe(204);

      expect(await nomesNaLista()).not.toContain("Nair Removida");
      expect(await nomesNaLista("Nair")).toEqual([]);
      expect(await nomesNaLista("91234-0001")).toEqual([]);
      expect((await painel.ficha(clienteId)).status).toBe(404);
      // Remover de novo é remover o que não existe mais.
      expect((await painel.remover(clienteId)).status).toBe(404);

      // O pedido continua inteiro, com os dados da compra, e na fila.
      const pedido = await painel.pedido(pedidoId);
      expect(pedido.status).toBe(200);
      expect(pedido.body.pedido).toMatchObject({
        totalCentavos: 2500 + 700,
        contato: { nome: "Nair Removida", telefone: "+5511912340001" },
      });
      const fila = await painel.fila();
      expect(fila.body.pedidos.map((p: { id: string }) => p.id)).toContain(
        pedidoId,
      );
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-705 a linha fica no banco: a remoção é ocultação com retenção, e não apagamento",
    async () => {
      const { clienteId, pedidoId } = await clienteComPedido(
        "Olga Retida",
        "(11) 91234-0002",
      );
      expect((await painel.remover(clienteId)).status).toBe(204);

      const linha = await migrador.query<{
        removed_at: Date | null;
        display_name: string;
      }>(
        `SELECT removed_at, display_name FROM app.store_customers WHERE id = $1`,
        [clienteId],
      );
      expect(linha.rows[0]?.removed_at).not.toBeNull();
      expect(linha.rows[0]?.display_name).toBe("Olga Retida");

      const pedido = await migrador.query<{ store_customer_id: string }>(
        `SELECT store_customer_id FROM app.orders WHERE id = $1`,
        [pedidoId],
      );
      expect(pedido.rows[0]?.store_customer_id).toBe(clienteId);

      // Removido não conta como repetido: o dono cadastra de novo sem beco.
      const deNovo = await painel.cadastrar({
        nome: "Olga Voltou",
        telefone: "(11) 91234-0002",
      });
      expect(deNovo.status).toBe(201);
    },
    ESPERA_DOS_CLIENTES,
  );
});
