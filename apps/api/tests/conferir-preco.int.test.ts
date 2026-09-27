/**
 * Prova da conferência contra o catálogo vivo (AC-503, AC-504, P-006).
 *
 * A comparação em si já está provada em `packages/core`. O que só o banco
 * prova é que o preço vem de LÁ: que mudar o produto no catálogo muda o que a
 * conferência devolve, e que produto tirado do ar deixa de ser comprável mesmo
 * continuando marcado como disponível.
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
import {
  acrescentarItem,
  verCarrinho,
} from "../src/modules/cart/carrinho.usecase.ts";
import { conferirAntesDeFechar } from "../src/modules/cart/conferir-preco.usecase.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let loja: LojaDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  loja = await criarLoja({ nome: "Padaria do Ponto" });
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

/** Monta um carrinho com um produto e devolve o que a conferência precisa. */
async function carrinhoCom(
  sessao: string,
  produto: ProdutoDeTeste,
  quantidade: number,
): Promise<{ carrinhoId: string; itemId: string }> {
  await comoVisitante(sessao, () =>
    acrescentarItem({ produtoId: produto.id, quantidade }),
  );
  const carrinho = await comoVisitante(sessao, verCarrinho);
  const item = carrinho.itens[0];
  if (item === undefined) throw new Error("o carrinho de apoio ficou vazio");
  return { carrinhoId: carrinho.id, itemId: item.id };
}

describe("o preço vem do catálogo, no momento de fechar (AC-504, P-006)", () => {
  it(
    "@spec:AC-504 @principle:P-006 mudar o preço no catálogo muda o total antes de fechar",
    async () => {
      const produto = await criarProduto({
        loja,
        nome: "Pão de queijo",
        precoCentavos: 500,
      });
      const { carrinhoId } = await carrinhoCom("sessao-preco", produto, 4);

      const antes = await comoVisitante("sessao-preco", () =>
        conferirAntesDeFechar(carrinhoId),
      );
      expect(antes.subtotalEmCentavos).toBe(2000);

      await migrador.query(
        `UPDATE app.products SET display_price_cents = $2 WHERE id = $1`,
        [produto.id, 650],
      );

      const depois = await comoVisitante("sessao-preco", () =>
        conferirAntesDeFechar(carrinhoId),
      );
      expect(depois.subtotalEmCentavos).toBe(2600);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-504 @principle:P-006 total enviado pelo cliente é descartado e a divergência fica marcada",
    async () => {
      const produto = await criarProduto({
        loja,
        nome: "Bolo de fubá",
        precoCentavos: 1200,
      });
      const { carrinhoId } = await carrinhoCom("sessao-divergente", produto, 2);

      const conferido = await comoVisitante("sessao-divergente", () =>
        conferirAntesDeFechar(carrinhoId, { totalEmCentavos: 100 }),
      );

      expect(conferido.subtotalEmCentavos).toBe(2400);
      expect(conferido.houveDivergencia).toBe(true);
    },
    ESPERA_LONGA,
  );
});

describe("o que mudou é conferido contra o catálogo vivo (AC-503)", () => {
  it(
    "@spec:AC-503 preço que mudou desde que a tela mostrou é avisado com os dois valores",
    async () => {
      const produto = await criarProduto({
        loja,
        nome: "Sonho de creme",
        precoCentavos: 700,
      });
      const { carrinhoId, itemId } = await carrinhoCom(
        "sessao-mudou",
        produto,
        1,
      );

      await migrador.query(
        `UPDATE app.products SET display_price_cents = $2 WHERE id = $1`,
        [produto.id, 900],
      );

      const conferido = await comoVisitante("sessao-mudou", () =>
        conferirAntesDeFechar(carrinhoId, { precosVistos: { [itemId]: 700 } }),
      );

      expect(conferido.precisaConfirmar).toBe(true);
      expect(conferido.mudancas[0]?.tipo).toBe("PRECO_SUBIU");
      expect(conferido.mudancas[0]?.explicacao).toContain("R$ 7,00");
      expect(conferido.mudancas[0]?.explicacao).toContain("R$ 9,00");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-503 produto esgotado sai do carrinho e o cliente é avisado pelo nome",
    async () => {
      const produto = await criarProduto({
        loja,
        nome: "Coxinha de frango",
        precoCentavos: 800,
      });
      const { carrinhoId } = await carrinhoCom("sessao-esgotou", produto, 3);

      await migrador.query(
        `UPDATE app.products SET is_available = false WHERE id = $1`,
        [produto.id],
      );

      const conferido = await comoVisitante("sessao-esgotou", () =>
        conferirAntesDeFechar(carrinhoId),
      );

      expect(conferido.mudancas[0]?.tipo).toBe("INDISPONIVEL");
      expect(conferido.mudancas[0]?.explicacao).toContain("Coxinha de frango");
      expect(conferido.itensQueSeguem).toEqual([]);
      expect(conferido.subtotalEmCentavos).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-503 produto arquivado some para o cliente, porque a vitrine só mostra publicado",
    async () => {
      // Quem tira o produto do ar não precisa mexer no interruptor de
      // disponibilidade: a política da vitrine já só expõe o que está
      // publicado. Para o cliente, o item simplesmente não está mais lá.
      const produto = await criarProduto({
        loja,
        nome: "Torta antiga",
        precoCentavos: 1500,
      });
      const { carrinhoId } = await carrinhoCom("sessao-arquivado", produto, 1);

      await migrador.query(
        `UPDATE app.products SET status = 'ARCHIVED', is_available = true WHERE id = $1`,
        [produto.id],
      );

      const conferido = await comoVisitante("sessao-arquivado", () =>
        conferirAntesDeFechar(carrinhoId),
      );

      expect(conferido.mudancas[0]?.tipo).toBe("SAIU_DO_CATALOGO");
      expect(conferido.itensQueSeguem).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-503 no balcão, onde o dono ENXERGA o arquivado, ele ainda assim não é vendável",
    async () => {
      // O dono vê rascunho e arquivado — é a loja dele. Sem a conferência de
      // situação no caso de uso, o pedido lançado no balcão venderia o que
      // acabou de sair do cardápio, e só a política do cliente estaria
      // protegendo o sistema. Aqui a segunda tranca é exercitada.
      const produto = await criarProduto({
        loja,
        nome: "Bolo esquecido",
        precoCentavos: 1100,
      });
      const { carrinhoId } = await carrinhoCom("sessao-balcao", produto, 1);

      await migrador.query(
        `UPDATE app.products SET status = 'ARCHIVED', is_available = true WHERE id = $1`,
        [produto.id],
      );

      const conferido = await comoRequisicao(
        acesso,
        {
          lojaId: loja.id,
          usuarioId: loja.dono.id,
          papel: "OWNER",
          sessaoDoCarrinho: "sessao-balcao",
        },
        () => conferirAntesDeFechar(carrinhoId),
      );

      expect(conferido.mudancas[0]?.tipo).toBe("INDISPONIVEL");
      expect(conferido.mudancas[0]?.explicacao).toContain("Bolo esquecido");
      expect(conferido.itensQueSeguem).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-503 produto apagado do catálogo é retirado sem quebrar o fechamento",
    async () => {
      const produto = await criarProduto({
        loja,
        nome: "Doce de leite",
        precoCentavos: 1000,
      });
      const outro = await criarProduto({
        loja,
        nome: "Café coado",
        precoCentavos: 400,
      });
      const sessao = "sessao-apagado";
      await comoVisitante(sessao, () =>
        acrescentarItem({ produtoId: produto.id, quantidade: 1 }),
      );
      await comoVisitante(sessao, () =>
        acrescentarItem({ produtoId: outro.id, quantidade: 2 }),
      );
      const carrinho = await comoVisitante(sessao, verCarrinho);

      await migrador.query(
        `UPDATE app.products SET deleted_at = now() WHERE id = $1`,
        [produto.id],
      );

      const conferido = await comoVisitante(sessao, () =>
        conferirAntesDeFechar(carrinho.id),
      );

      expect(conferido.mudancas[0]?.tipo).toBe("SAIU_DO_CATALOGO");
      expect(conferido.itensQueSeguem).toHaveLength(1);
      expect(conferido.subtotalEmCentavos).toBe(800);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-503 carrinho sem nada mudado segue direto, sem pedir confirmação",
    async () => {
      // Pedir confirmação quando nada mudou treinaria o cliente a clicar sem
      // ler, e aí o aviso deixaria de proteger justamente quando importa.
      const produto = await criarProduto({
        loja,
        nome: "Pão francês",
        precoCentavos: 100,
      });
      const { carrinhoId, itemId } = await carrinhoCom(
        "sessao-igual",
        produto,
        10,
      );

      const conferido = await comoVisitante("sessao-igual", () =>
        conferirAntesDeFechar(carrinhoId, { precosVistos: { [itemId]: 100 } }),
      );

      expect(conferido.mudancas).toEqual([]);
      expect(conferido.precisaConfirmar).toBe(false);
      expect(conferido.subtotalEmCentavos).toBe(1000);
    },
    ESPERA_LONGA,
  );
});
