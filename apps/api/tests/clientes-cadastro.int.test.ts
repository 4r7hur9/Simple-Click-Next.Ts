/**
 * Prova do cadastro manual de cliente pelo dono, contra PostgreSQL de verdade
 * (AC-703, AC-704, AC-706).
 *
 * O cliente com conta é criado pelo caminho de verdade: a pessoa compra na
 * vitrine logada, e o fechamento liga a compra à conta dela (AC-616). Só então
 * o dono tenta cadastrá-la à mão — que é a situação do critério.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esquemaDaFichaDoCliente,
  esquemaDaListaDeClientes,
  esquemaDoClienteExistente,
} from "@simpleclick/contracts";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarProduto,
  type IdentidadeDeTeste,
} from "@simpleclick/testing";

import {
  aplicacaoDosClientes,
  ESPERA_DOS_CLIENTES,
  itemDoLanche,
  lancheComMolho,
  lojaComDono,
  Painel,
  type LojaComDono,
} from "./apoio-de-clientes.ts";
import { fecharPeloSite } from "./apoio-de-compra.ts";
import { abrirAcessoDaAplicacao } from "./apoio-de-isolamento.ts";
import { comoPortador, tokenDeAcesso } from "./apoio-de-pedidos.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof aplicacaoDosClientes>;
let alvo: LojaComDono;
let painel: Painel;
let comConta: IdentidadeDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = aplicacaoDosClientes(acesso);
  alvo = await lojaComDono(migrador, { nome: "Açaí do Bairro" });
  painel = new Painel(app, alvo);

  // Uma pessoa com conta na plataforma, que já comprou nesta loja logada.
  comConta = await criarIdentidade({
    nome: "Fernanda Conta",
    email: "fernanda.conta@exemplo.test",
  });
  const produto = await criarProduto({ loja: alvo.loja, nome: "Açaí 500ml" });
  await fecharPeloSite(app, alvo.loja, produto, {
    autorizacao: comoPortador(tokenDeAcesso(comConta.id, "CUSTOMER")),
    contato: { nome: "Fernanda Conta", telefone: "(11) 91111-2222" },
  });
}, ESPERA_DOS_CLIENTES);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DOS_CLIENTES);

async function quantosNaLista(busca: string): Promise<number> {
  const resposta = await painel.listar(busca);
  return esquemaDaListaDeClientes.parse(resposta.body).clientes.length;
}

describe("o cadastro manual cria o cliente com o mínimo (AC-703)", () => {
  it(
    "@spec:AC-703 nome e telefone bastam: o cliente nasce na loja, sem conta, e aparece na lista",
    async () => {
      const resposta = await painel.cadastrar({
        nome: "Gabriel Balcão",
        telefone: "(11) 93456-7890",
      });

      expect(resposta.status).toBe(201);
      const ficha = esquemaDaFichaDoCliente.parse(resposta.body);
      expect(ficha).toMatchObject({
        nome: "Gabriel Balcão",
        // Guardado conferido, em E.164, como o WhatsApp e o cupom usam.
        telefone: "+5511934567890",
        email: null,
        temConta: false,
        endereco: null,
        observacao: null,
      });
      expect(await quantosNaLista("Gabriel")).toBe(1);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-703 e-mail, endereço e observação opcionais ficam na ficha",
    async () => {
      const resposta = await painel.cadastrar({
        nome: "Helena Completa",
        telefone: "11 93333-4444",
        email: "Helena@Exemplo.test",
        endereco: {
          logradouro: "Rua das Palmeiras",
          numero: "45",
          bairro: "Centro",
          cidade: "São Paulo",
          estado: "SP",
        },
        observacao: "Portão azul, tocar a campainha.",
      });

      expect(resposta.status).toBe(201);
      const ficha = await painel.ficha(resposta.body.id as string);
      expect(ficha.status).toBe(200);
      expect(ficha.body.cliente).toMatchObject({
        email: "helena@exemplo.test",
        endereco: {
          logradouro: "Rua das Palmeiras",
          numero: "45",
          bairro: "Centro",
          cidade: "São Paulo",
          estado: "SP",
        },
        observacao: "Portão azul, tocar a campainha.",
      });
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-703 o cliente cadastrado já pode receber pedido manual, mesmo sem conta",
    async () => {
      const cadastro = await painel.cadastrar({
        nome: "Igor Sem Conta",
        telefone: "11 95555-1212",
      });
      expect(cadastro.status).toBe(201);
      const lanche = await lancheComMolho(alvo.loja);

      const pedido = await painel.lancar({
        cliente: { tipo: "cadastrado", clienteId: cadastro.body.id },
        itens: [itemDoLanche(lanche)],
        entrega: "PICKUP",
        formaDePagamento: "CASH",
      });
      expect(pedido.status).toBe(201);
      expect(pedido.body.clienteId).toBe(cadastro.body.id);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-703 sem telefone, ou com telefone impossível, o cadastro é recusado dizendo o que falta",
    async () => {
      const semTelefone = await painel.cadastrar({ nome: "Sem Telefone" });
      expect(semTelefone.status).toBe(400);

      const impossivel = await painel.cadastrar({
        nome: "Telefone Curto",
        telefone: "1234-5678",
      });
      expect(impossivel.status).toBe(400);
      expect(impossivel.body.campos[0]).toMatchObject({ caminho: "telefone" });
      expect(impossivel.body.campos[0].mensagem).toMatch(/dígitos/);
      expect(await quantosNaLista("Telefone Curto")).toBe(0);
    },
    ESPERA_DOS_CLIENTES,
  );
});

describe("telefone repetido na mesma loja é apontado (AC-704)", () => {
  it(
    "@spec:AC-704 o mesmo telefone com outra pontuação é recusado, apontando o cadastro existente para abrir",
    async () => {
      const primeiro = await painel.cadastrar({
        nome: "Joana Primeira",
        telefone: "(21) 98765-4321",
      });
      expect(primeiro.status).toBe(201);

      const repetido = await painel.cadastrar({
        nome: "Joana de Novo",
        telefone: "+55 21 987654321",
      });

      expect(repetido.status).toBe(409);
      expect(esquemaDoClienteExistente.parse(repetido.body)).toEqual({
        erro: "cliente_existente",
        clienteId: primeiro.body.id,
        nome: "Joana Primeira",
        motivo: "TELEFONE",
        vinculo: "MANUAL",
      });
      // O identificador devolvido abre a ficha existente — é o "abrir o
      // cadastro" que a tela oferece.
      expect((await painel.ficha(repetido.body.clienteId)).status).toBe(200);
      // E nada foi duplicado.
      expect(await quantosNaLista("98765-4321")).toBe(1);
    },
    ESPERA_DOS_CLIENTES,
  );
});

describe("cliente com conta é reconhecido, não duplicado (AC-706)", () => {
  it(
    "@spec:AC-706 o telefone de quem já comprou com conta aponta o vínculo existente",
    async () => {
      expect(await quantosNaLista("Fernanda")).toBe(1);

      const resposta = await painel.cadastrar({
        nome: "Fernanda à mão",
        telefone: "11911112222",
      });

      expect(resposta.status).toBe(409);
      const existente = esquemaDoClienteExistente.parse(resposta.body);
      expect(existente).toMatchObject({
        nome: "Fernanda Conta",
        motivo: "TELEFONE",
        vinculo: "CONTA",
      });
      expect(await quantosNaLista("Fernanda")).toBe(1);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-706 o e-mail da conta também aponta o vínculo, sem o dono enxergar a identidade",
    async () => {
      const resposta = await painel.cadastrar({
        nome: "Fernanda por E-mail",
        // Outro telefone: é o e-mail da CONTA que precisa reconhecê-la.
        telefone: "11 97777-0000",
        email: "FERNANDA.CONTA@exemplo.test",
      });

      expect(resposta.status).toBe(409);
      expect(esquemaDoClienteExistente.parse(resposta.body)).toMatchObject({
        nome: "Fernanda Conta",
        motivo: "EMAIL",
        vinculo: "CONTA",
      });
      expect(await quantosNaLista("Fernanda")).toBe(1);
      // A lista mostra que ela tem conta, e nada da conta além disso.
      const { clientes } = esquemaDaListaDeClientes.parse(
        (await painel.listar("Fernanda")).body,
      );
      expect(clientes[0]).toMatchObject({ temConta: true, email: null });
    },
    ESPERA_DOS_CLIENTES,
  );
});
