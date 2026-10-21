/**
 * Prova do atacado no carrinho e no pedido (card #57), contra o banco.
 *
 * A conta da faixa já está provada no core (`atacado.test.ts`). O que só o
 * banco prova: que a conferência LÊ a faixa gravada (`discount_kind`), que
 * abaixo do pedido mínimo vale o varejo, que a faixa do produto conta as peças
 * de todas as variações, e que o pedido congela a faixa em `order_items` — o
 * dono muda a faixa depois e o pedido continua dizendo qual valeu.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
  criarProduto,
  criarVariacao,
} from "@simpleclick/testing";
import type { LojaDeTeste, ProdutoDeTeste } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import {
  acrescentarItem,
  verCarrinho,
} from "../src/modules/cart/carrinho.usecase.ts";
import { conferirAntesDeFechar } from "../src/modules/cart/conferir-preco.usecase.ts";
import { criarPedido } from "../src/modules/orders/criar-pedido.usecase.ts";
import { lerFaixasDeAtacado } from "../src/modules/orders/atacado-do-pedido.ts";
import { congelarItens } from "../src/modules/orders/snapshot.ts";
import { tokenPublico } from "../src/modules/orders/numero-pedido.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let loja: LojaDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  loja = await criarLoja({ nome: "Atacadão do Bairro" });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

function comoVisitante<T>(sessao: string, acao: () => Promise<T>): Promise<T> {
  return comoRequisicao(
    acesso,
    { lojaId: loja.id, papel: "PUBLIC", sessaoDoCarrinho: sessao },
    () => acao(),
  );
}

/** Uma faixa com desconto (0064), direto no banco. */
async function faixa(
  produtoId: string,
  minimo: number,
  tipo: "PERCENT" | "AMOUNT",
  desconto: number,
  rotulo: string | null = null,
): Promise<void> {
  await migrador.query(
    `INSERT INTO app.product_prices
       (store_id, product_id, kind, amount_cents, min_quantity, discount_kind,
        discount_value, label)
     VALUES ($1, $2, 'WHOLESALE', 0, $3, $4, $5, $6)`,
    [loja.id, produtoId, minimo, tipo, desconto, rotulo],
  );
}

/** O preço BASE do produto na tabela de preços. */
async function base(produtoId: string, centavos: number): Promise<void> {
  await migrador.query(
    `INSERT INTO app.product_prices
       (store_id, product_id, kind, amount_cents, min_quantity)
     VALUES ($1, $2, 'BASE', $3, 1)`,
    [loja.id, produtoId, centavos],
  );
}

async function conferir(
  sessao: string,
  produto: ProdutoDeTeste,
  quantidade: number,
) {
  await comoVisitante(sessao, () =>
    acrescentarItem({ produtoId: produto.id, quantidade }),
  );
  const carrinho = await comoVisitante(sessao, verCarrinho);
  const conferencia = await comoVisitante(sessao, () =>
    conferirAntesDeFechar(carrinho.id),
  );
  const item = conferencia.itensQueSeguem[0];
  if (item === undefined) throw new Error("o carrinho de apoio ficou vazio");
  return {
    conferencia,
    item,
    preco: conferencia.precosDosItens.get(item.itemId),
  };
}

describe("a conferência aplica a faixa pela quantidade (card #57)", () => {
  it(
    "abaixo do pedido mínimo vale o varejo, e diz quanto falta",
    async () => {
      const produto = await criarProduto({
        loja,
        nome: "Copo descartável",
        precoCentavos: 2000,
      });
      await base(produto.id, 2000);
      await faixa(produto.id, 10, "PERCENT", 5);
      await faixa(produto.id, 50, "PERCENT", 10);

      const { item, preco } = await conferir("sessao-varejo", produto, 6);

      expect(item.precoUnitarioEmCentavos).toBe(2000);
      expect(item.totalDaLinhaEmCentavos).toBe(12_000);
      expect(preco?.tipo).toBe("BASE");
      expect(preco?.faixa).toBeNull();
      expect(preco?.varejoUnitarioEmCentavos).toBeNull();
      expect(preco?.atacado?.pedidoMinimo).toBe(10);
      expect(preco?.atacado?.faltamParaProxima).toBe(4);
      expect(preco?.atacado?.proximaFaixa?.unitarioEmCentavos).toBe(1900);
    },
    ESPERA_LONGA,
  );

  it(
    "na faixa, cobra o unitário com desconto e risca o varejo",
    async () => {
      const produto = await criarProduto({
        loja,
        nome: "Prato fundo",
        precoCentavos: 2000,
      });
      await base(produto.id, 2000);
      await faixa(produto.id, 10, "PERCENT", 5, "Caixa fechada");
      await faixa(produto.id, 50, "PERCENT", 10);

      const { item, preco, conferencia } = await conferir(
        "sessao-faixa",
        produto,
        12,
      );

      expect(item.precoUnitarioEmCentavos).toBe(1900);
      expect(conferencia.subtotalEmCentavos).toBe(1900 * 12);
      expect(preco?.tipo).toBe("WHOLESALE");
      expect(preco?.varejoUnitarioEmCentavos).toBe(2000);
      expect(preco?.faixa).toEqual({
        quantidadeMinima: 10,
        tipoDeDesconto: "PERCENTUAL",
        desconto: 5,
        rotulo: "Caixa fechada",
      });
      expect(preco?.atacado?.faltamParaProxima).toBe(38);
      expect(preco?.atacado?.economiaEmCentavos).toBe(100 * 12);
    },
    ESPERA_LONGA,
  );

  it(
    "faixa sem preço BASE na tabela incide sobre o preço do produto, e nunca vira zero",
    async () => {
      // A faixa guarda amount_cents = 0: lida como preço fixo, sairia de graça.
      const produto = await criarProduto({
        loja,
        nome: "Guardanapo",
        precoCentavos: 1000,
      });
      await faixa(produto.id, 5, "PERCENT", 20);

      const { item } = await conferir("sessao-sem-base", produto, 5);

      expect(item.precoUnitarioEmCentavos).toBe(800);
    },
    ESPERA_LONGA,
  );

  it(
    "a faixa do produto soma as peças de todas as variações",
    async () => {
      const produto = await criarProduto({
        loja,
        nome: "Camiseta lisa",
        precoCentavos: 3000,
      });
      const p = await criarVariacao({
        loja,
        produto,
        nome: "P",
        precoCentavos: 3000,
      });
      const g = await criarVariacao({
        loja,
        produto,
        nome: "G",
        precoCentavos: 3500,
      });
      await faixa(produto.id, 10, "AMOUNT", 500);

      const sessao = "sessao-variacoes";
      await comoVisitante(sessao, () =>
        acrescentarItem({
          produtoId: produto.id,
          variacaoId: p.id,
          quantidade: 6,
        }),
      );
      await comoVisitante(sessao, () =>
        acrescentarItem({
          produtoId: produto.id,
          variacaoId: g.id,
          quantidade: 4,
        }),
      );
      const carrinho = await comoVisitante(sessao, verCarrinho);
      const conferencia = await comoVisitante(sessao, () =>
        conferirAntesDeFechar(carrinho.id),
      );

      const unitarios = conferencia.itensQueSeguem
        .map((i) => i.precoUnitarioEmCentavos)
        .sort((a, b) => a - b);
      // R$ 5,00 a menos em cada, sobre o varejo de cada variação.
      expect(unitarios).toEqual([2500, 3000]);
      expect(conferencia.subtotalEmCentavos).toBe(2500 * 6 + 3000 * 4);
    },
    ESPERA_LONGA,
  );

  it(
    "o pedido manual lê as mesmas faixas, ligadas e dentro das datas",
    async () => {
      const produto = await criarProduto({
        loja,
        nome: "Sacola kraft",
        precoCentavos: 500,
      });
      await faixa(produto.id, 20, "PERCENT", 10, "Fardo");
      await migrador.query(
        `INSERT INTO app.product_prices
           (store_id, product_id, kind, amount_cents, min_quantity,
            discount_kind, discount_value, is_active)
         VALUES ($1, $2, 'WHOLESALE', 0, 100, 'PERCENT', 30, false)`,
        [loja.id, produto.id],
      );

      const faixas = await comoRequisicao(
        acesso,
        { lojaId: loja.id, papel: "PUBLIC" },
        () => lerFaixasDeAtacado([produto.id], new Date()),
      );

      expect(faixas.get(produto.id)).toEqual([
        {
          quantidadeMinima: 20,
          tipoDeDesconto: "PERCENTUAL",
          desconto: 10,
          rotulo: "Fardo",
        },
      ]);
    },
    ESPERA_LONGA,
  );
});

describe("o pedido congela a faixa que valeu (card #57)", () => {
  it(
    "order_items guarda o unitário da faixa, o varejo, o tipo e a faixa — e mudar a faixa depois não muda o pedido",
    async () => {
      const produto = await criarProduto({
        loja,
        nome: "Caixa de papelão",
        precoCentavos: 2000,
      });
      await faixa(produto.id, 10, "PERCENT", 5, "Caixa fechada");

      const { itens, subtotalEmCentavos } = congelarItens([
        {
          produto: {
            id: produto.id,
            nome: produto.nome,
            precoEmCentavos: 1900,
            tipoDePreco: "WHOLESALE",
            precoDeVarejoEmCentavos: 2000,
            faixaDeAtacado: {
              quantidadeMinima: 10,
              tipoDeDesconto: "PERCENTUAL",
              desconto: 5,
              rotulo: "Caixa fechada",
            },
          },
          quantidade: 12,
        },
      ]);

      const resultado = await comoRequisicao(
        acesso,
        { lojaId: loja.id, papel: "CUSTOMER", tokenDoPedido: tokenPublico() },
        () =>
          criarPedido(
            {
              lojaId: loja.id,
              contato: { nome: "Rita Lopes", telefoneE164: "5585977776666" },
              itens,
              entrega: "PICKUP",
              subtotalEmCentavos,
              taxaDeEntregaEmCentavos: 0,
              totalEmCentavos: subtotalEmCentavos,
            },
            { aberta: true },
          ),
      );
      if (!resultado.ok) throw new Error("o pedido de apoio não foi criado");

      // O dono muda a faixa depois da compra.
      await migrador.query(
        `UPDATE app.product_prices SET discount_value = 15
          WHERE product_id = $1 AND kind = 'WHOLESALE'`,
        [produto.id],
      );

      const { rows } = await migrador.query<Record<string, unknown>>(
        `SELECT unit_price_cents, line_total_cents, compare_at_cents,
                price_kind_snapshot, wholesale_min_quantity,
                wholesale_discount_kind, wholesale_discount_value,
                wholesale_label
           FROM app.order_items WHERE order_id = $1`,
        [resultado.pedido.id],
      );

      expect(rows).toEqual([
        {
          unit_price_cents: "1900",
          line_total_cents: "22800",
          compare_at_cents: "2000",
          price_kind_snapshot: "WHOLESALE",
          wholesale_min_quantity: 10,
          wholesale_discount_kind: "PERCENT",
          wholesale_discount_value: "5",
          wholesale_label: "Caixa fechada",
        },
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "o banco recusa faixa incoerente no item (desconto sem tipo)",
    async () => {
      const produto = await criarProduto({ loja, nome: "Fita adesiva" });
      const { rows } = await migrador.query<{ id: string }>(
        `SELECT id FROM app.orders WHERE store_id = $1 LIMIT 1`,
        [loja.id],
      );
      const pedidoId = rows[0]?.id;
      if (pedidoId === undefined) throw new Error("sem pedido de apoio");

      await expect(
        migrador.query(
          `INSERT INTO app.order_items
             (store_id, order_id, product_id, product_name, quantity,
              unit_price_cents, line_total_cents, wholesale_min_quantity,
              wholesale_discount_value)
           VALUES ($1, $2, $3, 'Fita', 10, 100, 1000, 10, 5)`,
          [loja.id, pedidoId, produto.id],
        ),
      ).rejects.toThrow(/order_items_atacado_coerente/);
    },
    ESPERA_LONGA,
  );
});
