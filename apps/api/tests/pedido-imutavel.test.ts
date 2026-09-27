/**
 * Prova de que o pedido não muda (AC-515, P-010), contra PostgreSQL de verdade.
 *
 * O congelamento em memória já está provado em
 * `apps/api/src/modules/orders/snapshot.test.ts`. Aqui está a afirmação que só
 * o banco sustenta, e que é a que importa: mesmo que alguém escreva o código
 * errado amanhã, o pedido continua sendo o que foi combinado. Imutabilidade por
 * convenção dura até a primeira pressa; imutabilidade por política dura.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
  criarProduto,
} from "@simpleclick/testing";
import type { LojaDeTeste, ProdutoDeTeste } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import { criarPedido } from "../src/modules/orders/criar-pedido.usecase.ts";
import { congelarItens } from "../src/modules/orders/snapshot.ts";
import { tokenPublico } from "../src/modules/orders/numero-pedido.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let loja: LojaDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  loja = await criarLoja({ nome: "Cantina do Porto" });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/** O item do pedido, como o banco o guardou. */
interface ItemGuardado {
  readonly id: string;
  readonly product_name: string;
  readonly unit_price_cents: string;
  readonly line_total_cents: string;
}

/**
 * O primeiro item do pedido, ou falha alto.
 *
 * Não é zelo excessivo: sem isto, um pedido sem itens deixaria o identificador
 * `undefined` chegar ao `where` da tentativa de alteração. O comando afetaria
 * zero linhas por não ter alvo, a asserção `count === 0` passaria — e a prova
 * de que o banco RECUSA a alteração estaria provando outra coisa.
 */
async function exigirPrimeiroItem(pedidoId: string): Promise<ItemGuardado> {
  const itens = await itensDoPedido(pedidoId);
  const primeiro = itens[0];
  if (primeiro === undefined) {
    throw new Error(`o pedido ${pedidoId} foi criado sem nenhum item`);
  }
  return primeiro;
}

async function itensDoPedido(pedidoId: string): Promise<ItemGuardado[]> {
  const resultado = await migrador.query<ItemGuardado>(
    `SELECT id, product_name, unit_price_cents, line_total_cents
       FROM app.order_items WHERE order_id = $1 ORDER BY created_at`,
    [pedidoId],
  );
  return resultado.rows;
}

/** Cria um pedido com um item que aponta para um produto de verdade. */
async function pedidoComProduto(
  produto: ProdutoDeTeste,
  precoCentavos: number,
) {
  const { itens, subtotalEmCentavos } = congelarItens([
    {
      produto: {
        id: produto.id,
        nome: produto.nome,
        precoEmCentavos: precoCentavos,
      },
      quantidade: 2,
      opcoes: [
        // Sem referência ao catálogo de propósito: é o caso da escolha
        // combinada na hora, e prova que o nome sozinho basta para a comanda.
        { grupoNome: "Ponto da carne", opcaoNome: "Ao ponto" },
      ],
    },
  ]);

  const resultado = await comoRequisicao(
    acesso,
    { lojaId: loja.id, papel: "CUSTOMER", tokenDoPedido: tokenPublico() },
    () =>
      criarPedido(
        {
          lojaId: loja.id,
          contato: { nome: "João Paulo", telefoneE164: "5511977776666" },
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
  return resultado.pedido;
}

describe("mudar o catálogo não muda o pedido (AC-515)", () => {
  it(
    "@spec:AC-515 @principle:P-010 renomear e reprecificar o produto deixa o pedido intacto",
    async () => {
      // É o cenário real: o dono corrige o preço da marmita na terça, e o
      // pedido de segunda não pode passar a valer outro valor. Ninguém percebe
      // na hora — percebe no fechamento do mês, quando a soma não bate.
      const produto = await criarProduto({
        loja,
        nome: "Filé à parmegiana",
        precoCentavos: 4500,
      });
      const pedido = await pedidoComProduto(produto, 4500);

      const antes = await itensDoPedido(pedido.id);
      expect(antes[0]?.product_name).toBe("Filé à parmegiana");
      expect(antes[0]?.unit_price_cents).toBe("4500");
      expect(antes[0]?.line_total_cents).toBe("9000");

      // O catálogo muda. Só o catálogo.
      await migrador.query(
        `UPDATE app.products
            SET name = $2, display_price_cents = $3, price_min_cents = $3,
                price_max_cents = $3
          WHERE id = $1`,
        [produto.id, "Filé à parmegiana ESPECIAL", 5900],
      );

      const depois = await itensDoPedido(pedido.id);
      expect(depois[0]?.product_name).toBe("Filé à parmegiana");
      expect(depois[0]?.unit_price_cents).toBe("4500");
      expect(depois[0]?.line_total_cents).toBe("9000");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-515 @principle:P-010 apagar o produto do catálogo não apaga o item do pedido",
    async () => {
      // Se o item sumisse junto, o dono perderia o histórico de tudo que já
      // vendeu de um produto descontinuado — e o faturamento do mês encolheria
      // sozinho, retroativamente.
      const produto = await criarProduto({
        loja,
        nome: "Bacalhau do dia",
        precoCentavos: 8900,
      });
      const pedido = await pedidoComProduto(produto, 8900);

      await migrador.query(`DELETE FROM app.products WHERE id = $1`, [
        produto.id,
      ]);

      const itens = await itensDoPedido(pedido.id);
      expect(itens).toHaveLength(1);
      expect(itens[0]?.product_name).toBe("Bacalhau do dia");
      expect(itens[0]?.unit_price_cents).toBe("8900");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-515 @principle:P-010 a opção escolhida continua com o nome do momento da compra",
    async () => {
      const produto = await criarProduto({ loja, nome: "Picanha na chapa" });
      const pedido = await pedidoComProduto(produto, 6900);

      const opcoes = await migrador.query<{
        group_name_snapshot: string;
        option_name_snapshot: string;
      }>(
        `SELECT o.group_name_snapshot, o.option_name_snapshot
           FROM app.order_item_options o
           JOIN app.order_items i ON i.id = o.order_item_id
          WHERE i.order_id = $1`,
        [pedido.id],
      );

      expect(opcoes.rows[0]?.group_name_snapshot).toBe("Ponto da carne");
      expect(opcoes.rows[0]?.option_name_snapshot).toBe("Ao ponto");
    },
    ESPERA_LONGA,
  );
});

describe("o banco recusa alterar o item vendido (P-010)", () => {
  it(
    "@principle:P-010 nem o dono da loja consegue mudar o preço de um item já vendido",
    async () => {
      // A tentativa roda com o papel de DONO, que é o mais poderoso que a
      // aplicação oferece. Se ele não consegue, ninguém pela aplicação consegue.
      const produto = await criarProduto({ loja, nome: "Camarão na moranga" });
      const pedido = await pedidoComProduto(produto, 7500);
      const item = await exigirPrimeiroItem(pedido.id);

      const alteradas = await comoRequisicao(
        acesso,
        { lojaId: loja.id, usuarioId: loja.dono.id, papel: "OWNER" },
        (tx) =>
          tx.orderItem.updateMany({
            where: { id: item.id },
            data: { unitPriceCents: 1n },
          }),
      );

      // Sem política de alteração, o isolamento por linha não levanta erro: ele
      // simplesmente não enxerga a linha, e o comando responde "zero". É por
      // isso que a prova conta linhas em vez de esperar exceção — e é por isso
      // que o repositório converte zero em "não encontrado" em toda alteração.
      expect(alteradas.count).toBe(0);

      const depois = await itensDoPedido(pedido.id);
      expect(depois[0]?.unit_price_cents).toBe("7500");
    },
    ESPERA_LONGA,
  );

  it(
    "@principle:P-010 nem o dono da loja consegue apagar um item já vendido",
    async () => {
      const produto = await criarProduto({ loja, nome: "Moqueca de peixe" });
      const pedido = await pedidoComProduto(produto, 8200);
      const item = await exigirPrimeiroItem(pedido.id);

      const apagadas = await comoRequisicao(
        acesso,
        { lojaId: loja.id, usuarioId: loja.dono.id, papel: "OWNER" },
        (tx) => tx.orderItem.deleteMany({ where: { id: item.id } }),
      );

      expect(apagadas.count).toBe(0);
      expect(await itensDoPedido(pedido.id)).toHaveLength(1);
    },
    ESPERA_LONGA,
  );

  it(
    "@principle:P-010 o cliente com o link do pedido também não altera nada",
    async () => {
      // O outro lado da mesma porta: quem tem o endereço público consegue LER o
      // pedido, e é só isso que ele consegue.
      const produto = await criarProduto({ loja, nome: "Bobó de camarão" });
      const pedido = await pedidoComProduto(produto, 7100);
      const item = await exigirPrimeiroItem(pedido.id);

      const alteradas = await comoRequisicao(
        acesso,
        {
          lojaId: loja.id,
          papel: "CUSTOMER",
          tokenDoPedido: pedido.tokenPublico,
        },
        (tx) =>
          tx.orderItem.updateMany({
            where: { id: item.id },
            data: { quantity: 99 },
          }),
      );

      expect(alteradas.count).toBe(0);
      expect((await itensDoPedido(pedido.id))[0]?.line_total_cents).toBe(
        "14200",
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@principle:P-010 o pedido MUDA de estado, e é isso que o distingue do item",
    async () => {
      // A distinção que o projeto faz de propósito: o pedido caminha pela fila
      // (aguardando, aceito, pronto, entregue) e por isso aceita alteração; o
      // item vendido não caminha para lugar nenhum. Sem esta prova, "nada muda"
      // viraria uma regra que também travaria a operação da loja.
      const produto = await criarProduto({ loja, nome: "Risoto de funghi" });
      const pedido = await pedidoComProduto(produto, 5400);

      const alteradas = await comoRequisicao(
        acesso,
        { lojaId: loja.id, usuarioId: loja.dono.id, papel: "OWNER" },
        (tx) =>
          tx.order.updateMany({
            where: { id: pedido.id },
            data: { status: "ACCEPTED" },
          }),
      );

      expect(alteradas.count).toBe(1);
    },
    ESPERA_LONGA,
  );
});
