/**
 * Prova a baixa do estoque no mesmo caminho transacional do checkout
 * (AC-333). O teste usa duas conexões da credencial da aplicação: se a
 * proteção dependesse apenas de uma leitura anterior, as duas confirmariam a
 * última peça.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarProduto, criarLoja, comoLoja } from "@simpleclick/testing";
import type { LojaDeTeste, ProdutoDeTeste } from "@simpleclick/testing";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";
import {
  comoRequisicao,
  abrirAcessoDaAplicacao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import { criarPedido } from "../src/modules/orders/criar-pedido.usecase.ts";
import { reservarEstoque } from "../src/modules/orders/reservar-estoque.ts";
import { tokenPublico } from "../src/modules/orders/numero-pedido.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { ErroDeDominio } from "../src/core/erros.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let loja: LojaDeTeste;
let produto: ProdutoDeTeste;
let variacaoId: string;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  loja = await criarLoja({ ramo: "roupas" });
  produto = await criarProduto({
    loja,
    nome: "Camiseta concorrente",
    precoCentavos: 1_000,
  });
  variacaoId = await comoLoja(loja, async (tx) => {
    const linha = await tx.query<{ id: string }>(
      `INSERT INTO app.product_variants
         (store_id, product_id, name, sku, stock_quantity, stock_reserved,
          is_default, is_available)
       VALUES ($1, $2, 'Tamanho M', 'CONCORRENTE-M', 1, 0, true, true)
       RETURNING id`,
      [loja.id, produto.id],
    );
    const id = linha.rows[0]?.id;
    if (id === undefined) throw new Error("variação de teste não criada");
    return id;
  });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

function entradaDoPedido() {
  return {
    lojaId: loja.id,
    contato: { nome: "Cliente concorrente", telefoneE164: "5511999999999" },
    itens: [
      {
        produtoId: produto.id,
        variacaoId,
        nomeDoProduto: produto.nome,
        nomeDaVariacao: "Tamanho M",
        sku: "CONCORRENTE-M",
        quantidade: 1,
        precoUnitarioEmCentavos: 1_000,
        totalDaLinhaEmCentavos: 1_000,
      },
    ],
    entrega: "PICKUP" as const,
    subtotalEmCentavos: 1_000,
    taxaDeEntregaEmCentavos: 0,
    totalEmCentavos: 1_000,
  };
}

async function fecharUmaCompra() {
  return comoRequisicao(
    acesso,
    { lojaId: loja.id, papel: "PUBLIC", tokenDoPedido: tokenPublico() },
    async () => {
      const criado = await criarPedido(entradaDoPedido(), { aberta: true });
      if (!criado.ok) throw new Error(criado.recusa.causa);
      await reservarEstoque({
        lojaId: loja.id,
        pedidoId: criado.pedido.id,
        itens: entradaDoPedido().itens,
      });
      return criado;
    },
  );
}

describe("baixa concorrente no checkout", () => {
  it(
    "@spec:AC-333 aceita uma compra, recusa a outra e não deixa saldo negativo",
    async () => {
      const resultados = await Promise.all([
        fecharUmaCompra().then(
          (valor) => ({ ok: true as const, valor }),
          (erro: unknown) => ({ ok: false as const, erro }),
        ),
        fecharUmaCompra().then(
          (valor) => ({ ok: true as const, valor }),
          (erro: unknown) => ({ ok: false as const, erro }),
        ),
      ]);

      expect(resultados.filter((resultado) => resultado.ok)).toHaveLength(1);
      const falha = resultados.find((resultado) => !resultado.ok);
      expect(falha?.ok).toBe(false);
      if (falha?.ok === false) {
        expect(falha.erro).toBeInstanceOf(ErroDeDominio);
        expect((falha.erro as ErroDeDominio).codigo).toBe("conflito");
      }

      const saldo = await migrador.query<{ stock_quantity: number }>(
        `SELECT stock_quantity FROM app.product_variants WHERE id = $1`,
        [variacaoId],
      );
      expect(saldo.rows[0]?.stock_quantity).toBe(0);

      const pedidos = await migrador.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM app.order_items
          WHERE store_id = $1 AND variant_id = $2`,
        [loja.id, variacaoId],
      );
      expect(Number(pedidos.rows[0]?.n ?? "0")).toBe(1);

      const movimentos = await migrador.query<{
        quantity_before: number;
        quantity_delta: number;
        quantity_after: number;
        origin: string;
      }>(
        `SELECT quantity_before, quantity_delta, quantity_after, origin
           FROM app.stock_movements
          WHERE store_id = $1 AND variant_id = $2`,
        [loja.id, variacaoId],
      );
      expect(movimentos.rows).toEqual([
        {
          quantity_before: 1,
          quantity_delta: -1,
          quantity_after: 0,
          origin: "PEDIDO",
        },
      ]);
    },
    ESPERA_LONGA,
  );
});
