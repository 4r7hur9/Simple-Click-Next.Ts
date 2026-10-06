/**
 * Prova do histórico do cliente e da repetição de pedido, contra PostgreSQL
 * de verdade (AC-711, AC-712, AC-713).
 *
 * Os pedidos são lançados pela rota do pedido manual, um depois do outro. O
 * catálogo muda DEPOIS, pela credencial de migração — preço novo, produto
 * apagado, opção retirada —, que é exatamente o que acontece na vida da loja
 * entre a compra antiga e o dia em que o dono abre a ficha.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esquemaDaFichaComHistorico,
  esquemaDaRepeticaoDoPedido,
} from "@simpleclick/contracts";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarProduto,
  type ProdutoDeTeste,
} from "@simpleclick/testing";

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
let batata: ProdutoDeTeste;
let clienteId: string;
const pedidos: { id: string; numero: number }[] = [];

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  const alvo = await lojaComDono(migrador, { nome: "Lanches do Largo" });
  painel = new Painel(aplicacaoDosClientes(acesso), alvo);
  lanche = await lancheComMolho(alvo.loja, 2000);
  batata = await criarProduto({
    loja: alvo.loja,
    nome: "Batata frita",
    precoCentavos: 900,
  });

  const cadastro = await painel.cadastrar({
    nome: "Rosa Freguesa",
    telefone: "(11) 97654-3210",
  });
  expect(cadastro.status).toBe(201);
  clienteId = cadastro.body.id as string;

  const lancar = async (itens: Record<string, unknown>[]) => {
    const resposta = await painel.lancar({
      cliente: { tipo: "cadastrado", clienteId },
      itens,
      entrega: "PICKUP",
      formaDePagamento: "CASH",
    });
    expect(resposta.status).toBe(201);
    pedidos.push({ id: resposta.body.id, numero: resposta.body.numero });
  };

  // 1º: lanche com ketchup e uma batata. 2º: dois lanches com mostarda.
  // 3º: um lanche com ketchup, depois aceito.
  await lancar([
    itemDoLanche(lanche, lanche.ketchup),
    { produtoId: batata.id, quantidade: 1 },
  ]);
  await lancar([itemDoLanche(lanche, lanche.mostarda, 2)]);
  await lancar([itemDoLanche(lanche, lanche.ketchup)]);
  expect(
    (await painel.mudarStatus(pedidos[2]?.id as string, "ACCEPTED")).status,
  ).toBe(200);

  // A vida da loja depois das compras: o lanche subiu para R$ 25,00, a batata
  // saiu do cardápio e a mostarda acabou de vez.
  await migrador.query(
    `UPDATE app.products
        SET display_price_cents = 2500, price_min_cents = 2500, price_max_cents = 2500
      WHERE id = $1`,
    [lanche.produto.id],
  );
  await migrador.query(
    `UPDATE app.products SET deleted_at = now() WHERE id = $1`,
    [batata.id],
  );
  await migrador.query(
    `UPDATE app.option_items SET deleted_at = now() WHERE id = $1`,
    [lanche.mostarda.id],
  );
}, ESPERA_DOS_CLIENTES);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DOS_CLIENTES);

describe("a ficha mostra o histórico completo (AC-711)", () => {
  it(
    "@spec:AC-711 os pedidos vêm do mais recente para o mais antigo, com número, data, itens, valor e status",
    async () => {
      const resposta = await painel.ficha(clienteId);
      expect(resposta.status).toBe(200);
      const { cliente, pedidos: historico } = esquemaDaFichaComHistorico.parse(
        resposta.body,
      );

      expect(cliente.nome).toBe("Rosa Freguesa");
      expect(historico.map((p) => p.numero)).toEqual(
        [...pedidos].reverse().map((p) => p.numero),
      );
      const datas = historico.map((p) => Date.parse(p.criadoEm));
      expect([...datas].sort((a, b) => b - a)).toEqual(datas);

      const [terceiro, segundo] = historico;
      expect(terceiro).toMatchObject({
        status: "ACCEPTED",
        canal: "MANUAL",
        totalCentavos: 2000,
      });
      expect(segundo).toMatchObject({
        status: "PENDING",
        totalCentavos: 2 * 2150,
        itens: [
          {
            nome: "X-Salada",
            quantidade: 2,
            totalCentavos: 2 * 2150,
            opcoes: [{ grupo: "Molho", nome: "Mostarda", quantidade: 1 }],
          },
        ],
      });
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-711 cliente sem pedido abre a ficha com o histórico vazio",
    async () => {
      const novo = await painel.cadastrar({
        nome: "Sílvio Novo",
        telefone: "11 97654-0000",
      });
      const ficha = await painel.ficha(novo.body.id as string);
      expect(ficha.status).toBe(200);
      expect(ficha.body.pedidos).toEqual([]);
    },
    ESPERA_DOS_CLIENTES,
  );
});

describe("a ficha alerta o que não existe mais (AC-713)", () => {
  it(
    "@spec:AC-713 o produto removido aparece com o nome e o preço da época, marcado como indisponível, sem quebrar a ficha",
    async () => {
      const resposta = await painel.ficha(clienteId);
      expect(resposta.status).toBe(200);
      const { pedidos: historico } = esquemaDaFichaComHistorico.parse(
        resposta.body,
      );
      const primeiro = historico.find((p) => p.id === pedidos[0]?.id);

      expect(primeiro?.itens).toEqual([
        expect.objectContaining({
          nome: "X-Salada",
          // O preço da ÉPOCA, e não os R$ 25,00 de hoje.
          totalCentavos: 2000,
          indisponivel: false,
        }),
        expect.objectContaining({
          nome: "Batata frita",
          totalCentavos: 900,
          indisponivel: true,
        }),
      ]);
      expect(primeiro?.totalCentavos).toBe(2900);
    },
    ESPERA_DOS_CLIENTES,
  );
});

describe("repetir um pedido monta o novo pronto (AC-712)", () => {
  it(
    "@spec:AC-712 mesmos itens e opções, preço de agora, e o que saiu do catálogo apontado",
    async () => {
      const resposta = await painel.repetir(pedidos[0]?.id as string);
      expect(resposta.status).toBe(200);
      const repeticao = esquemaDaRepeticaoDoPedido.parse(resposta.body);

      expect(repeticao).toMatchObject({
        pedidoOriginal: { id: pedidos[0]?.id },
        clienteId,
        entrega: "PICKUP",
        itens: [
          {
            produtoId: lanche.produto.id,
            nome: "X-Salada",
            quantidade: 1,
            escolhas: [
              { grupoId: lanche.molho.id, opcaoId: lanche.ketchup.id },
            ],
            precoUnitarioCentavos: 2500,
            totalDaLinhaCentavos: 2500,
            precoUnitarioDaEpocaCentavos: 2000,
            pendencias: [],
          },
        ],
        indisponiveis: [
          {
            nome: "Batata frita",
            quantidade: 1,
            precoUnitarioDaEpocaCentavos: 900,
            motivo: "FORA_DO_CATALOGO",
          },
        ],
        subtotalCentavos: 2500,
      });
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-712 a opção que sumiu é apontada no item, com o grupo que ficou pendente",
    async () => {
      const resposta = await painel.repetir(pedidos[1]?.id as string);
      expect(resposta.status).toBe(200);
      const repeticao = esquemaDaRepeticaoDoPedido.parse(resposta.body);

      expect(repeticao.indisponiveis).toEqual([]);
      expect(repeticao.itens[0]?.escolhas).toEqual([]);
      expect(repeticao.itens[0]?.pendencias).toEqual([
        "Mostarda (Molho) não está mais disponível.",
        "Escolha 1 opção em Molho.",
      ]);
    },
    ESPERA_DOS_CLIENTES,
  );

  it(
    "@spec:AC-712 a repetição confirmada vira pedido novo com os preços atuais, e o antigo fica como estava",
    async () => {
      const repeticao = esquemaDaRepeticaoDoPedido.parse(
        (await painel.repetir(pedidos[0]?.id as string)).body,
      );

      const novo = await painel.lancar({
        cliente: { tipo: "cadastrado", clienteId },
        itens: repeticao.itens.map((item) => ({
          produtoId: item.produtoId,
          variacaoId: item.variacaoId,
          quantidade: item.quantidade,
          escolhas: item.escolhas,
        })),
        entrega: "PICKUP",
        formaDePagamento: "CASH",
      });
      expect(novo.status).toBe(201);
      expect(novo.body.totalCentavos).toBe(repeticao.subtotalCentavos);

      const ficha = esquemaDaFichaComHistorico.parse(
        (await painel.ficha(clienteId)).body,
      );
      expect(ficha.pedidos[0]?.id).toBe(novo.body.id);
      const antigo = ficha.pedidos.find((p) => p.id === pedidos[0]?.id);
      expect(antigo?.totalCentavos).toBe(2900);
    },
    ESPERA_DOS_CLIENTES,
  );
});
