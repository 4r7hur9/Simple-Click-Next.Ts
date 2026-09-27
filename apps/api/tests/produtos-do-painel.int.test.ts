/**
 * Prova do ciclo de vida do produto pelo painel (AC-304, AC-307, AC-308),
 * contra banco de verdade.
 *
 * O dono cadastra, edita, duplica, remove e guarda em rascunho pelas rotas do
 * painel; a prova confere o resultado no endereço público — a lista da
 * vitrine, a página do produto e a busca. "Não aparece de forma alguma" é
 * afirmação sobre esses três caminhos, e é neles que ela é cobrada.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import {
  caminhoDoPainel,
  catalogoPublico,
  criarCategoriaPeloPainel,
  criarProdutoPeloPainel,
  lojaComDonoNoPainel,
} from "./apoio-do-painel.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { criarPedido } from "../src/modules/orders/criar-pedido.usecase.ts";
import { tokenPublico } from "../src/modules/orders/numero-pedido.ts";
import { congelarItens } from "../src/modules/orders/snapshot.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

type App = Awaited<ReturnType<typeof lojaComDonoNoPainel>>["app"];

const FOTO_DO_PASTEL =
  "https://res.cloudinary.com/simpleclick/image/upload/v1/pastel.jpg";

interface ProdutoNoPainel {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly categoriaId: string | null;
  readonly categoriaNome: string | null;
  readonly precoCentavos: number | null;
  readonly status: string;
  readonly disponivel: boolean;
}

async function produtosDoPainel(
  app: App,
  loja: LojaDeTeste,
): Promise<ProdutoNoPainel[]> {
  const resposta = await request(app).get(caminhoDoPainel(loja, "produtos"));
  expect(resposta.status).toBe(200);
  return (resposta.body as { produtos: ProdutoNoPainel[] }).produtos;
}

function paginaPublica(app: App, loja: LojaDeTeste, produtoId: string) {
  return request(app).get(`/v1/vitrine/${loja.apelido}/produto/${produtoId}`);
}

function nomesNaVitrine(
  catalogo: Awaited<ReturnType<typeof catalogoPublico>>,
): string[] {
  return catalogo.secoes.flatMap((secao) =>
    secao.produtos.map((produto) => produto.nome),
  );
}

async function comFoto(app: App, loja: LojaDeTeste, produtoId: string) {
  const resposta = await request(app)
    .post(caminhoDoPainel(loja, `produtos/${produtoId}/imagens`))
    .send({ url: FOTO_DO_PASTEL, altText: null, principal: true });
  expect(resposta.status).toBe(201);
}

describe("produto novo nasce completo e visível na vitrine (AC-304)", () => {
  it(
    "@spec:AC-304 cadastrado com nome, descrição, categoria, preço e imagem, aparece na lista do dono e na vitrine dentro da categoria",
    async () => {
      const { app, loja } = await lojaComDonoNoPainel(acesso);
      const bebidas = await criarCategoriaPeloPainel(app, loja, "Bebidas");
      const pasteis = await criarCategoriaPeloPainel(app, loja, "Pastéis");

      const produto = await criarProdutoPeloPainel(app, loja, {
        categoriaId: pasteis.id,
        nome: "Pastel de queijo",
        descricao: "Massa crocante e queijo derretido.",
        precoCentavos: 1_990,
      });
      await comFoto(app, loja, produto.id);

      expect(await produtosDoPainel(app, loja)).toEqual([
        expect.objectContaining({
          nome: "Pastel de queijo",
          descricao: "Massa crocante e queijo derretido.",
          categoriaId: pasteis.id,
          categoriaNome: "Pastéis",
          precoCentavos: 1_990,
          status: "PUBLISHED",
          disponivel: true,
        }),
      ]);

      const vitrine = await catalogoPublico(app, loja);
      const secao = vitrine.secoes.find((item) => item.nome === "Pastéis");
      expect(secao?.produtos).toEqual([
        expect.objectContaining({
          id: produto.id,
          nome: "Pastel de queijo",
          imagem: FOTO_DO_PASTEL,
        }),
      ]);
      expect(
        vitrine.secoes.find((item) => item.nome === bebidas.nome)?.produtos,
      ).toEqual([]);

      const pagina = await paginaPublica(app, loja, produto.id);
      expect(pagina.status).toBe(200);
      expect(JSON.stringify(pagina.body)).toContain(
        "Massa crocante e queijo derretido.",
      );
    },
    ESPERA_LONGA,
  );
});

describe("produto pode ser editado, duplicado e removido (AC-307)", () => {
  it(
    "@spec:AC-307 a alteração feita pelo dono aparece na vitrine",
    async () => {
      const { app, loja } = await lojaComDonoNoPainel(acesso);
      const categoria = await criarCategoriaPeloPainel(app, loja, "Pastéis");
      const produto = await criarProdutoPeloPainel(app, loja, {
        categoriaId: categoria.id,
        nome: "Pastel de queijo",
        precoCentavos: 1_990,
      });

      const editado = await request(app)
        .patch(caminhoDoPainel(loja, `produtos/${produto.id}`))
        .send({ nome: "Pastel de queijo especial", precoCentavos: 2_190 });
      expect(editado.status).toBe(200);

      const vitrine = await catalogoPublico(app, loja);
      expect(vitrine.secoes[0]?.produtos).toEqual([
        expect.objectContaining({
          nome: "Pastel de queijo especial",
          precoCentavos: 2_190,
        }),
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-307 a duplicata nasce rascunho oculto com os mesmos dados, fotos e especificações",
    async () => {
      const { app, loja } = await lojaComDonoNoPainel(acesso);
      const categoria = await criarCategoriaPeloPainel(app, loja, "Pastéis");
      const recheio = await request(app)
        .post(
          caminhoDoPainel(loja, `categorias/${categoria.id}/especificacoes`),
        )
        .send({
          nome: "Recheio",
          tipo: "texto",
          unidade: null,
          obrigatoria: false,
          filtravel: false,
          opcoes: [],
        });
      expect(recheio.status).toBe(201);
      const original = await criarProdutoPeloPainel(app, loja, {
        categoriaId: categoria.id,
        nome: "Pastel de queijo",
        descricao: "Massa crocante.",
        precoCentavos: 1_990,
      });
      await comFoto(app, loja, original.id);
      const preenchido = await request(app)
        .put(caminhoDoPainel(loja, `produtos/${original.id}/especificacoes`))
        .send({
          valores: { [(recheio.body as { id: string }).id]: "Muçarela" },
        });
      expect(preenchido.status).toBe(200);

      const duplicada = await request(app).post(
        caminhoDoPainel(loja, `produtos/${original.id}/duplicar`),
      );
      expect(duplicada.status).toBe(201);
      const copia = duplicada.body as ProdutoNoPainel;
      expect(copia).toMatchObject({
        nome: "Pastel de queijo (cópia)",
        descricao: "Massa crocante.",
        categoriaId: categoria.id,
        precoCentavos: 1_990,
        status: "DRAFT",
        disponivel: false,
      });
      expect(copia.id).not.toBe(original.id);

      const fotos = await request(app).get(
        caminhoDoPainel(loja, `produtos/${copia.id}/imagens`),
      );
      expect(
        (fotos.body as { imagens: { url: string; principal: boolean }[] })
          .imagens,
      ).toEqual([
        expect.objectContaining({ url: FOTO_DO_PASTEL, principal: true }),
      ]);
      const especificacoes = await request(app).get(
        caminhoDoPainel(loja, `produtos/${copia.id}/especificacoes`),
      );
      expect(
        (especificacoes.body as { campos: { valor: unknown }[] }).campos.map(
          (campo) => campo.valor,
        ),
      ).toEqual(["Muçarela"]);

      // Oculta de verdade: nem na lista da vitrine, nem pelo endereço direto.
      expect(nomesNaVitrine(await catalogoPublico(app, loja))).toEqual([
        "Pastel de queijo",
      ]);
      expect((await paginaPublica(app, loja, copia.id)).status).toBe(404);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-307 remover tira o produto da vitrine sem mexer no pedido que já o incluiu",
    async () => {
      const { app, loja } = await lojaComDonoNoPainel(acesso);
      const categoria = await criarCategoriaPeloPainel(app, loja, "Pastéis");
      const produto = await criarProdutoPeloPainel(app, loja, {
        categoriaId: categoria.id,
        nome: "Pastel de carne",
        precoCentavos: 1_790,
      });

      const { itens, subtotalEmCentavos } = congelarItens([
        {
          produto: {
            id: produto.id,
            nome: "Pastel de carne",
            precoEmCentavos: 1_790,
          },
          quantidade: 2,
          opcoes: [],
        },
      ]);
      const pedido = await comoRequisicao(
        acesso,
        { lojaId: loja.id, papel: "CUSTOMER", tokenDoPedido: tokenPublico() },
        () =>
          criarPedido(
            {
              lojaId: loja.id,
              contato: { nome: "Cliente", telefoneE164: "5511977776666" },
              itens,
              entrega: "PICKUP",
              subtotalEmCentavos,
              taxaDeEntregaEmCentavos: 0,
              totalEmCentavos: subtotalEmCentavos,
            },
            { aberta: true },
          ),
      );
      if (!pedido.ok) throw new Error("o pedido de apoio não foi criado");

      const removido = await request(app).delete(
        caminhoDoPainel(loja, `produtos/${produto.id}`),
      );
      expect(removido.status).toBe(204);

      expect(nomesNaVitrine(await catalogoPublico(app, loja))).toEqual([]);
      expect((await paginaPublica(app, loja, produto.id)).status).toBe(404);
      expect(await produtosDoPainel(app, loja)).toEqual([]);

      const item = await migrador.query<{
        product_id: string;
        product_name: string;
        unit_price_cents: string;
        line_total_cents: string;
      }>(
        `SELECT product_id, product_name, unit_price_cents, line_total_cents
           FROM app.order_items WHERE order_id = $1`,
        [pedido.pedido.id],
      );
      expect(item.rows).toEqual([
        {
          product_id: produto.id,
          product_name: "Pastel de carne",
          unit_price_cents: "1790",
          line_total_cents: "3580",
        },
      ]);
    },
    ESPERA_LONGA,
  );
});

describe("produto pode ficar rascunho antes de ir ao ar (AC-308)", () => {
  it(
    "@spec:AC-308 rascunho aparece na gestão e não aparece na vitrine, nem na busca, nem pelo endereço direto",
    async () => {
      const { app, loja } = await lojaComDonoNoPainel(acesso);
      const categoria = await criarCategoriaPeloPainel(app, loja, "Pastéis");
      const rascunho = await criarProdutoPeloPainel(app, loja, {
        categoriaId: categoria.id,
        nome: "Pastel de camarão",
        status: "DRAFT",
      });

      expect(await produtosDoPainel(app, loja)).toEqual([
        expect.objectContaining({
          nome: "Pastel de camarão",
          status: "DRAFT",
        }),
      ]);
      expect(nomesNaVitrine(await catalogoPublico(app, loja))).toEqual([]);
      expect(
        nomesNaVitrine(await catalogoPublico(app, loja, "?busca=camarao")),
      ).toEqual([]);
      expect((await paginaPublica(app, loja, rascunho.id)).status).toBe(404);

      // Publicar é o que o leva ao ar — e aí os três caminhos o mostram.
      const publicado = await request(app)
        .patch(caminhoDoPainel(loja, `produtos/${rascunho.id}`))
        .send({ status: "PUBLISHED" });
      expect(publicado.status).toBe(200);
      expect(nomesNaVitrine(await catalogoPublico(app, loja))).toEqual([
        "Pastel de camarão",
      ]);
      expect((await paginaPublica(app, loja, rascunho.id)).status).toBe(200);
    },
    ESPERA_LONGA,
  );
});
