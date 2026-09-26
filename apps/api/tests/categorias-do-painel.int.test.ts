/**
 * Prova das categorias do dono (AC-300, AC-301, AC-302, AC-303).
 *
 * CONTRA BANCO DE VERDADE e pelas rotas de verdade: o dono cria, oculta,
 * reordena e apaga pelo painel, e a prova confere o resultado no endereço
 * público da vitrine — que é onde a promessa do critério é feita ao cliente.
 * Um dublê do banco provaria que a rota chama o dublê; aqui quem decide o que
 * o cliente vê é a política de isolamento, como em produção.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarIdentidade,
  criarLoja,
  criarMembro,
} from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import { montarPainelDaProva } from "./apoio-do-painel.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

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

interface CategoriaNoPainel {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly visivel: boolean;
  readonly ordem: number;
  readonly produtos: number;
}

interface SecaoNaVitrine {
  readonly nome: string;
  readonly produtos: readonly { readonly nome: string }[];
}

/** Uma loja nova, com o dono logado no painel. */
async function lojaComDono() {
  const loja = await criarLoja();
  const identidade = await criarIdentidade();
  await criarMembro({ loja, identidade });
  const app = montarPainelDaProva(acesso, { identidadeId: identidade.id });
  return { loja, app };
}

type App = Awaited<ReturnType<typeof lojaComDono>>["app"];

function caminho(loja: LojaDeTeste, resto: string): string {
  return `/v1/lojas/${loja.apelido}/catalogo/${resto}`;
}

async function criarCategoria(
  app: App,
  loja: LojaDeTeste,
  nome: string,
  extras: { descricao?: string | null; visivel?: boolean } = {},
): Promise<CategoriaNoPainel> {
  const resposta = await request(app)
    .post(caminho(loja, "categorias"))
    .send({
      nome,
      descricao: extras.descricao ?? null,
      visivel: extras.visivel ?? true,
    });
  expect(resposta.status).toBe(201);
  return resposta.body as CategoriaNoPainel;
}

async function criarProduto(
  app: App,
  loja: LojaDeTeste,
  categoriaId: string,
  nome: string,
): Promise<{ readonly id: string }> {
  const resposta = await request(app).post(caminho(loja, "produtos")).send({
    nome,
    descricao: null,
    categoriaId,
    precoCentavos: 1_000,
    status: "PUBLISHED",
    disponivel: true,
  });
  expect(resposta.status).toBe(201);
  return resposta.body as { readonly id: string };
}

async function categoriasDoPainel(
  app: App,
  loja: LojaDeTeste,
): Promise<CategoriaNoPainel[]> {
  const resposta = await request(app).get(caminho(loja, "categorias"));
  expect(resposta.status).toBe(200);
  return (resposta.body as { categorias: CategoriaNoPainel[] }).categorias;
}

/** O que o cliente vê ao abrir a vitrine — sem sessão, pelo endereço público. */
async function vitrine(app: App, loja: LojaDeTeste) {
  const resposta = await request(app).get(
    `/v1/vitrine/${loja.apelido}/catalogo`,
  );
  expect(resposta.status).toBe(200);
  return resposta.body as {
    readonly secoes: readonly SecaoNaVitrine[];
    readonly versao: string;
  };
}

/** Produtos da loja sem nenhuma categoria viva — o órfão que o AC-303 proíbe. */
async function produtosOrfaos(loja: LojaDeTeste): Promise<number> {
  const resultado = await migrador.query<{ total: string }>(
    `SELECT count(*) AS total
       FROM app.products p
      WHERE p.store_id = $1 AND p.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM app.product_categories pc
            JOIN app.categories c ON c.id = pc.category_id
           WHERE pc.product_id = p.id AND c.deleted_at IS NULL)`,
    [loja.id],
  );
  return Number(resultado.rows[0]?.total ?? 0);
}

describe("categoria criada aparece na vitrine na posição escolhida (AC-300)", () => {
  it(
    "@spec:AC-300 a categoria criada entra na lista do dono e na vitrine, na ordem que ele definiu",
    async () => {
      const { loja, app } = await lojaComDono();

      const lanches = await criarCategoria(app, loja, "Lanches", {
        descricao: "Feitos na hora",
      });
      const bebidas = await criarCategoria(app, loja, "Bebidas");
      // O dono escolhe a posição: Bebidas primeiro.
      const ordem = await request(app)
        .put(caminho(loja, "categorias"))
        .send({ ids: [bebidas.id, lanches.id] });
      expect(ordem.status).toBe(204);

      const doPainel = await categoriasDoPainel(app, loja);
      expect(doPainel.map((categoria) => categoria.nome)).toEqual([
        "Bebidas",
        "Lanches",
      ]);
      expect(doPainel[1]).toMatchObject({
        descricao: "Feitos na hora",
        visivel: true,
        produtos: 0,
      });

      const publica = await vitrine(app, loja);
      expect(publica.secoes.map((secao) => secao.nome)).toEqual([
        "Bebidas",
        "Lanches",
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-300 criada como oculta, fica só na gestão; sem sessão o painel não responde",
    async () => {
      const { loja, app } = await lojaComDono();

      await criarCategoria(app, loja, "Natal", { visivel: false });

      expect(
        (await categoriasDoPainel(app, loja)).map((categoria) => [
          categoria.nome,
          categoria.visivel,
        ]),
      ).toEqual([["Natal", false]]);
      expect((await vitrine(app, loja)).secoes).toEqual([]);

      const anonimo = montarPainelDaProva(acesso, null);
      const recusada = await request(anonimo)
        .post(caminho(loja, "categorias"))
        .send({ nome: "Invasora", descricao: null, visivel: true });
      expect(recusada.status).toBe(401);
      expect(await categoriasDoPainel(app, loja)).toHaveLength(1);
    },
    ESPERA_LONGA,
  );
});

describe("categoria oculta desaparece da vitrine sem perder produtos (AC-301)", () => {
  it(
    "@spec:AC-301 ocultar tira a seção e os produtos da vitrine, mantém na gestão e não apaga nada",
    async () => {
      const { loja, app } = await lojaComDono();
      const natal = await criarCategoria(app, loja, "Natal");
      await criarProduto(app, loja, natal.id, "Panetone");
      await criarProduto(app, loja, natal.id, "Chocotone");

      const antes = await vitrine(app, loja);
      expect(antes.secoes.map((secao) => secao.nome)).toEqual(["Natal"]);
      expect(antes.secoes[0]?.produtos).toHaveLength(2);

      const ocultada = await request(app)
        .patch(caminho(loja, `categorias/${natal.id}`))
        .send({ visivel: false });
      expect(ocultada.status).toBe(200);

      const depois = await vitrine(app, loja);
      expect(depois.secoes).toEqual([]);
      const nomesNaVitrine = depois.secoes.flatMap((secao) =>
        secao.produtos.map((produto) => produto.nome),
      );
      expect(nomesNaVitrine).not.toContain("Panetone");

      const naGestao = await categoriasDoPainel(app, loja);
      expect(naGestao).toEqual([
        expect.objectContaining({ nome: "Natal", visivel: false, produtos: 2 }),
      ]);
      const produtos = await request(app).get(caminho(loja, "produtos"));
      expect(
        (produtos.body as { produtos: { nome: string }[] }).produtos
          .map((produto) => produto.nome)
          .sort(),
      ).toEqual(["Chocotone", "Panetone"]);

      // Mostrar de novo devolve a seção inteira: ocultar nunca apagou.
      await request(app)
        .patch(caminho(loja, `categorias/${natal.id}`))
        .send({ visivel: true });
      expect((await vitrine(app, loja)).secoes[0]?.produtos).toHaveLength(2);
    },
    ESPERA_LONGA,
  );
});

describe("reordenar categorias muda a vitrine na hora (AC-302)", () => {
  it(
    "@spec:AC-302 Sobremesas vai para o topo na próxima visita, sem mexer em produto nenhum",
    async () => {
      const { loja, app } = await lojaComDono();
      const lanches = await criarCategoria(app, loja, "Lanches");
      const bebidas = await criarCategoria(app, loja, "Bebidas");
      const sobremesas = await criarCategoria(app, loja, "Sobremesas");
      await criarProduto(app, loja, lanches.id, "X-Salada");
      await criarProduto(app, loja, bebidas.id, "Suco de laranja");
      await criarProduto(app, loja, sobremesas.id, "Pudim");

      const antes = await vitrine(app, loja);
      expect(antes.secoes.map((secao) => secao.nome)).toEqual([
        "Lanches",
        "Bebidas",
        "Sobremesas",
      ]);
      const produtosAntes = await migrador.query(
        `SELECT id, updated_at FROM app.products WHERE store_id = $1 ORDER BY id`,
        [loja.id],
      );

      const reordenada = await request(app)
        .put(caminho(loja, "categorias"))
        .send({ ids: [sobremesas.id, lanches.id, bebidas.id] });
      expect(reordenada.status).toBe(204);

      const depois = await vitrine(app, loja);
      expect(depois.secoes.map((secao) => secao.nome)).toEqual([
        "Sobremesas",
        "Lanches",
        "Bebidas",
      ]);
      // A versão muda: a cópia guardada da vitrine vence na próxima visita.
      expect(BigInt(depois.versao)).toBeGreaterThan(BigInt(antes.versao));
      const produtosDepois = await migrador.query(
        `SELECT id, updated_at FROM app.products WHERE store_id = $1 ORDER BY id`,
        [loja.id],
      );
      expect(produtosDepois.rows).toEqual(produtosAntes.rows);
    },
    ESPERA_LONGA,
  );
});

describe("apagar categoria com produtos exige destino (AC-303)", () => {
  async function categoriaComCincoProdutos() {
    const contexto = await lojaComDono();
    const { loja, app } = contexto;
    const lanches = await criarCategoria(app, loja, "Lanches");
    const salgados = await criarCategoria(app, loja, "Salgados");
    await criarProduto(app, loja, salgados.id, "Coxinha");
    for (const nome of ["Pastel", "Esfiha", "Quibe", "Empada", "Enroladinho"]) {
      await criarProduto(app, loja, lanches.id, nome);
    }
    return { ...contexto, lanches, salgados };
  }

  it(
    "@spec:AC-303 sem destino, o pedido é recusado com a contagem e nada muda",
    async () => {
      const { loja, app, lanches } = await categoriaComCincoProdutos();

      const recusada = await request(app).delete(
        caminho(loja, `categorias/${lanches.id}`),
      );

      expect(recusada.status).toBe(409);
      expect(recusada.body).toMatchObject({
        erro: "categoria_com_produtos",
        produtos: 5,
      });
      expect(
        (await categoriasDoPainel(app, loja)).find(
          (categoria) => categoria.id === lanches.id,
        ),
      ).toMatchObject({ visivel: true, produtos: 5 });
      expect(await produtosOrfaos(loja)).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-303 mover leva os cinco produtos para o destino e só então a categoria sai",
    async () => {
      const { loja, app, lanches, salgados } =
        await categoriaComCincoProdutos();

      const invalida = await request(app)
        .delete(caminho(loja, `categorias/${lanches.id}`))
        .send({ destino: { acao: "mover", categoriaId: lanches.id } });
      expect(invalida.status).toBe(400);

      const movida = await request(app)
        .delete(caminho(loja, `categorias/${lanches.id}`))
        .send({ destino: { acao: "mover", categoriaId: salgados.id } });
      expect(movida.status).toBe(200);
      expect(movida.body).toEqual({ resultado: "movida", produtos: 5 });

      const naGestao = await categoriasDoPainel(app, loja);
      expect(naGestao.map((categoria) => categoria.nome)).toEqual(["Salgados"]);
      expect(naGestao[0]?.produtos).toBe(6);

      const publica = await vitrine(app, loja);
      expect(publica.secoes.map((secao) => secao.nome)).toEqual(["Salgados"]);
      // Os que já estavam ficam na frente; os movidos entram na ordem que tinham.
      expect(
        publica.secoes[0]?.produtos.map((produto) => produto.nome),
      ).toEqual([
        "Coxinha",
        "Pastel",
        "Esfiha",
        "Quibe",
        "Empada",
        "Enroladinho",
      ]);
      expect(await produtosOrfaos(loja)).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-303 ocultar mantém a categoria e os produtos, só fora da vitrine",
    async () => {
      const { loja, app, lanches } = await categoriaComCincoProdutos();

      const ocultada = await request(app)
        .delete(caminho(loja, `categorias/${lanches.id}`))
        .send({ destino: { acao: "ocultar" } });
      expect(ocultada.status).toBe(200);
      expect(ocultada.body).toEqual({ resultado: "ocultada", produtos: 5 });

      expect(
        (await categoriasDoPainel(app, loja)).find(
          (categoria) => categoria.id === lanches.id,
        ),
      ).toMatchObject({ visivel: false, produtos: 5 });
      expect(
        (await vitrine(app, loja)).secoes.map((secao) => secao.nome),
      ).toEqual(["Salgados"]);
      expect(await produtosOrfaos(loja)).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-303 categoria vazia sai sem perguntar, e produto sem categoria não nasce",
    async () => {
      const { loja, app } = await lojaComDono();
      const vazia = await criarCategoria(app, loja, "Temporária");

      const apagada = await request(app).delete(
        caminho(loja, `categorias/${vazia.id}`),
      );
      expect(apagada.status).toBe(200);
      expect(apagada.body).toEqual({ resultado: "apagada", produtos: 0 });
      expect(await categoriasDoPainel(app, loja)).toEqual([]);

      const semCategoria = await request(app)
        .post(caminho(loja, "produtos"))
        .send({
          nome: "Órfão",
          descricao: null,
          precoCentavos: 500,
          status: "PUBLISHED",
          disponivel: true,
        });
      expect(semCategoria.status).toBe(400);
      const naApagada = await request(app)
        .post(caminho(loja, "produtos"))
        .send({
          nome: "Órfão",
          descricao: null,
          categoriaId: vazia.id,
          precoCentavos: 500,
          status: "PUBLISHED",
          disponivel: true,
        });
      expect(naApagada.status).toBe(400);
      expect(await produtosOrfaos(loja)).toBe(0);
    },
    ESPERA_LONGA,
  );
});
