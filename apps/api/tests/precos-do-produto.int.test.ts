/**
 * Prova dos preços do produto de ponta a ponta na API (AC-309 a AC-312).
 *
 * A regra de escolha já tem prova pura em `packages/core`. O que SÓ esta prova
 * mostra é o caminho inteiro: o dono cadastra o preço pela rota do painel, a
 * vitrine anuncia, o carrinho cobra e o pedido guarda — e o número que o
 * cliente manda não entra em lugar nenhum dessa cadeia.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarCategoria,
  criarLoja,
  criarMembro,
  criarProduto,
  porProdutoNaCategoria,
} from "@simpleclick/testing";
import type {
  CategoriaDeTeste,
  LojaDeTeste,
  ProdutoDeTeste,
} from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import {
  appDoDono,
  capturarRegistro,
  lojaQueVende,
  ORIGEM,
  Visitante,
  type DonoDeTeste,
} from "./apoio-do-catalogo.ts";
import { criarApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { criarRotasDosPrecos } from "../src/modules/catalog/precos.routes.ts";
import { EVENTO_DE_DIVERGENCIA_NO_ITEM } from "../src/modules/cart/carrinho.routes.ts";
import { EVENTO_DE_DIVERGENCIA_NO_PEDIDO } from "../src/modules/orders/pedidos.routes.ts";
import { identificarLoja } from "../src/modules/storefront/resolver-loja.usecase.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let vitrine: ReturnType<typeof criarApp>;
let painel: ReturnType<typeof appDoDono>;
let loja: LojaDeTeste;
let categoria: CategoriaDeTeste;
let dono: DonoDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  vitrine = criarApp({
    origens: [ORIGEM],
    vitrine: { acesso },
    carrinho: { acesso },
    pedidos: { acesso },
  });

  loja = await criarLoja({ nome: "Pastelaria do Preço" });
  const membro = await criarMembro({ loja });
  dono = { identidadeId: membro.identidade.id, papel: "OWNER" };
  categoria = await criarCategoria({ loja, nome: "Pastéis" });
  await lojaQueVende(migrador, loja);

  painel = appDoDono(
    criarRotasDosPrecos({
      acesso,
      resolverLoja: identificarLoja,
      autenticar: () => dono,
    }),
  );
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/** Um produto publicado na categoria, com o preço base em centavos. */
async function produtoNaVitrine(
  nome: string,
  precoCentavos: number,
): Promise<ProdutoDeTeste> {
  const produto = await criarProduto({ loja, nome, precoCentavos });
  await porProdutoNaCategoria({ loja, produto, categoria });
  return produto;
}

/** O dono cadastra um preço nomeado pela rota do painel. */
function cadastrarPreco(
  produto: ProdutoDeTeste,
  preco: Partial<Record<string, unknown>>,
) {
  return request(painel)
    .post(`/v1/lojas/${loja.apelido}/catalogo/produtos/${produto.id}/precos`)
    .send({
      tipo: "PROMO",
      rotulo: null,
      valorCentavos: 0,
      quantidadeMinima: 1,
      inicio: null,
      fim: null,
      ativo: true,
      ...preco,
    });
}

/** O cartão do produto no catálogo público. */
async function cartaoNaVitrine(produto: ProdutoDeTeste) {
  const resposta = await request(vitrine).get(
    `/v1/vitrine/${loja.apelido}/catalogo`,
  );
  expect(resposta.status).toBe(200);
  const cartoes = (
    resposta.body.secoes as {
      produtos: { id: string; precoCentavos: number | null }[];
    }[]
  ).flatMap((secao) => secao.produtos);
  return cartoes.find((cartao) => cartao.id === produto.id) as
    | {
        precoCentavos: number | null;
        precoAnteriorCentavos: number | null;
      }
    | undefined;
}

describe("preço base e promocional (AC-309)", () => {
  it(
    "@spec:AC-309 promoção ativa aparece como preço com o base riscado, e o carrinho cobra a promoção",
    async () => {
      const pastel = await produtoNaVitrine("Pastel de queijo", 2000);

      const criado = await cadastrarPreco(pastel, {
        tipo: "PROMO",
        rotulo: "Promoção da semana",
        valorCentavos: 1500,
      });
      expect(criado.status).toBe(201);

      // A vitrine: R$ 15,00 a pagar e R$ 20,00 riscado ao lado.
      const cartao = await cartaoNaVitrine(pastel);
      expect(cartao?.precoCentavos).toBe(1500);
      expect(cartao?.precoAnteriorCentavos).toBe(2000);

      const pagina = await request(vitrine).get(
        `/v1/vitrine/${loja.apelido}/produto/${pastel.id}`,
      );
      expect(pagina.body.precoCentavos).toBe(1500);
      expect(pagina.body.precoAnteriorCentavos).toBe(2000);

      // O carrinho usa R$ 15,00 no cálculo.
      const visitante = new Visitante(vitrine, loja.apelido);
      expect(
        (await visitante.acrescentar({ produtoId: pastel.id, quantidade: 2 }))
          .status,
      ).toBe(201);
      const conferido = await visitante.conferir();
      expect(conferido.body.itens[0].precoUnitarioCentavos).toBe(1500);
      expect(conferido.body.subtotalCentavos).toBe(3000);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-309 desativar a promoção devolve o preço base, sem nada riscado",
    async () => {
      const pastel = await produtoNaVitrine("Pastel de carne", 2000);
      const promocao = await cadastrarPreco(pastel, { valorCentavos: 1500 });

      const desativada = await request(painel)
        .patch(
          `/v1/lojas/${loja.apelido}/catalogo/produtos/${pastel.id}/precos/${promocao.body.id}`,
        )
        .send({ ativo: false });
      expect(desativada.status).toBe(200);

      const cartao = await cartaoNaVitrine(pastel);
      expect(cartao?.precoCentavos).toBe(2000);
      expect(cartao?.precoAnteriorCentavos).toBeNull();

      const visitante = new Visitante(vitrine, loja.apelido);
      await visitante.acrescentar({ produtoId: pastel.id, quantidade: 1 });
      expect((await visitante.conferir()).body.subtotalCentavos).toBe(2000);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-309 a lista do painel mostra os preços em centavos inteiros, com o base criado junto",
    async () => {
      const pastel = await produtoNaVitrine("Pastel de palmito", 2000);
      await cadastrarPreco(pastel, { valorCentavos: 1500 });

      const lista = await request(painel).get(
        `/v1/lojas/${loja.apelido}/catalogo/produtos/${pastel.id}/precos`,
      );

      expect(lista.status).toBe(200);
      const precos = lista.body.precos as {
        tipo: string;
        valorCentavos: number;
      }[];
      expect(precos.map((p) => [p.tipo, p.valorCentavos])).toEqual([
        ["BASE", 2000],
        ["PROMO", 1500],
      ]);
    },
    ESPERA_LONGA,
  );
});

describe("preço nomeado pelo dono é oferecido na compra (AC-310)", () => {
  it(
    "@spec:AC-310 seis unidades recebem o preço de atacado sozinhas, e a conferência diz qual e por quê",
    async () => {
      const coxinha = await produtoNaVitrine("Coxinha", 2000);
      const atacado = await cadastrarPreco(coxinha, {
        tipo: "WHOLESALE",
        rotulo: "Atacado",
        valorCentavos: 1500,
        quantidadeMinima: 6,
      });
      expect(atacado.status).toBe(201);

      // A vitrine continua anunciando o preço de uma unidade.
      expect((await cartaoNaVitrine(coxinha))?.precoCentavos).toBe(2000);

      const visitante = new Visitante(vitrine, loja.apelido);
      await visitante.acrescentar({ produtoId: coxinha.id, quantidade: 6 });
      const conferido = await visitante.conferir();

      expect(conferido.status).toBe(200);
      const item = conferido.body.itens[0];
      expect(item.precoUnitarioCentavos).toBe(1500);
      expect(item.totalDaLinhaCentavos).toBe(9000);
      expect(item.precoAplicado.rotulo).toBe("Atacado");
      expect(item.precoAplicado.motivo).toContain("a partir de 6 unidades");

      // E o pedido guarda o preço de atacado, calculado no servidor.
      const pedido = await visitante.fechar();
      expect(pedido.status).toBe(201);
      expect(pedido.body.subtotalCentavos).toBe(9000);
      const itens = await migrador.query<{ unit_price_cents: string }>(
        `SELECT unit_price_cents FROM app.order_items WHERE order_id = $1`,
        [pedido.body.id],
      );
      expect(Number(itens.rows[0]?.unit_price_cents)).toBe(1500);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-310 abaixo da quantidade mínima vale o preço base, sem explicação a mostrar",
    async () => {
      const esfiha = await produtoNaVitrine("Esfiha", 2000);
      await cadastrarPreco(esfiha, {
        tipo: "WHOLESALE",
        rotulo: "Atacado",
        valorCentavos: 1500,
        quantidadeMinima: 6,
      });

      const visitante = new Visitante(vitrine, loja.apelido);
      await visitante.acrescentar({ produtoId: esfiha.id, quantidade: 5 });
      const item = (await visitante.conferir()).body.itens[0];

      expect(item.precoUnitarioCentavos).toBe(2000);
      expect(item.precoAplicado).toBeNull();
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-310 atacado de uma unidade só é recusado na borda",
    async () => {
      const quibe = await produtoNaVitrine("Quibe", 2000);
      const resposta = await cadastrarPreco(quibe, {
        tipo: "WHOLESALE",
        valorCentavos: 1500,
        quantidadeMinima: 1,
      });

      expect(resposta.status).toBe(400);
    },
    ESPERA_LONGA,
  );
});

describe("valor monetário nunca perde centavo (AC-311)", () => {
  it(
    "@spec:AC-311 @principle:P-005 três unidades de R$ 19,99 fecham em R$ 59,97 exatos no servidor e no banco",
    async () => {
      const suco = await produtoNaVitrine("Suco natural", 1999);
      const visitante = new Visitante(vitrine, loja.apelido);
      await visitante.acrescentar({ produtoId: suco.id, quantidade: 3 });

      const conferido = await visitante.conferir();
      expect(conferido.body.subtotalCentavos).toBe(5997);

      const pedido = await visitante.fechar();
      expect(pedido.status).toBe(201);
      expect(pedido.body.totalCentavos).toBe(5997);

      const guardado = await migrador.query<{
        subtotal_cents: string;
        total_cents: string;
      }>(`SELECT subtotal_cents, total_cents FROM app.orders WHERE id = $1`, [
        pedido.body.id,
      ]);
      // A coluna é inteira (bigint), e o valor é o exato: 5997 centavos.
      expect(guardado.rows[0]?.subtotal_cents).toBe("5997");
      expect(guardado.rows[0]?.total_cents).toBe("5997");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-311 valor quebrado é recusado na borda do painel, e nunca gravado",
    async () => {
      const bolo = await produtoNaVitrine("Bolo", 1000);
      const resposta = await cadastrarPreco(bolo, { valorCentavos: 1998.99 });

      expect(resposta.status).toBe(400);
    },
    ESPERA_LONGA,
  );
});

describe("preço enviado pelo cliente é ignorado (AC-312)", () => {
  it(
    "@spec:AC-312 @principle:P-006 total forjado ao adicionar é descartado e fica no registro de segurança",
    async () => {
      const pastel = await produtoNaVitrine("Pastel de frango", 2000);
      const registro = capturarRegistro();
      try {
        const visitante = new Visitante(vitrine, loja.apelido);
        const resposta = await visitante.acrescentar({
          produtoId: pastel.id,
          quantidade: 2,
          totalVistoCentavos: 1,
        });
        expect(resposta.status).toBe(201);

        // O valor do banco é o que vale.
        expect((await visitante.conferir()).body.subtotalCentavos).toBe(4000);

        const tentativa = registro.linhas.find(
          (linha) => linha.evento === EVENTO_DE_DIVERGENCIA_NO_ITEM,
        );
        expect(tentativa?.nivel).toBe("aviso");
        expect(tentativa?.dados?.["detalhe"]).toEqual({
          totalDoServidorEmCentavos: 4000,
          totalEnviadoEmCentavos: 1,
        });
      } finally {
        registro.devolver();
      }
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-312 @principle:P-006 o pedido nasce com o preço do banco mesmo com total forjado, e a tentativa é registrada",
    async () => {
      const pastel = await produtoNaVitrine("Pastel de pizza", 2000);
      const visitante = new Visitante(vitrine, loja.apelido);
      await visitante.acrescentar({ produtoId: pastel.id, quantidade: 1 });

      const registro = capturarRegistro();
      try {
        const pedido = await visitante.fechar({ totalVistoCentavos: 1 });
        expect(pedido.status).toBe(201);
        expect(pedido.body.totalCentavos).toBe(2000);

        const guardado = await migrador.query<{ total_cents: string }>(
          `SELECT total_cents FROM app.orders WHERE id = $1`,
          [pedido.body.id],
        );
        expect(guardado.rows[0]?.total_cents).toBe("2000");

        const tentativa = registro.linhas.find(
          (linha) => linha.evento === EVENTO_DE_DIVERGENCIA_NO_PEDIDO,
        );
        expect(tentativa?.nivel).toBe("aviso");
        expect(tentativa?.dados?.["detalhe"]).toEqual({
          totalDoServidorEmCentavos: 2000,
          totalEnviadoEmCentavos: 1,
        });
      } finally {
        registro.devolver();
      }
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-312 @principle:P-006 preço por item no corpo não tem onde entrar: a borda recusa e o carrinho não muda",
    async () => {
      const pastel = await produtoNaVitrine("Pastel de vento", 2000);
      const visitante = new Visitante(vitrine, loja.apelido);

      const forjado = await visitante.acrescentar({
        produtoId: pastel.id,
        quantidade: 1,
        precoCentavos: 1,
      });
      expect(forjado.status).toBe(400);

      const conferido = await visitante.conferir();
      expect(conferido.body.itens).toEqual([]);
      expect(conferido.body.subtotalCentavos).toBe(0);
    },
    ESPERA_LONGA,
  );
});
