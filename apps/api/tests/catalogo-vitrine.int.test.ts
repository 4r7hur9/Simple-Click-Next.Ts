/**
 * Prova do catálogo público (AC-404, AC-406, AC-407, AC-417).
 *
 * CONTRA BANCO DE VERDADE, e com o isolamento por linha ligado. É a única forma
 * de provar o que este código promete: que categoria oculta não aparece PORQUE
 * A POLÍTICA a recusa, e não porque a consulta lembrou de filtrar. Um dublê
 * provaria que o TypeScript chama o dublê.
 *
 * A DIFERENÇA IMPORTA na próxima consulta que alguém escrever. Se a garantia
 * morasse no `WHERE`, a consulta seguinte nasceria sem ela e ninguém notaria;
 * morando na política, ela vale para toda consulta que existir depois.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarCategoria,
  criarLoja,
  criarProduto,
  porProdutoNaCategoria,
} from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import { catalogoDaVitrine } from "../src/modules/storefront/catalogo.usecase.ts";
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

/** Lê o catálogo como quem chega pelo endereço público: sem sessão, sem conta. */
function comoVisitante(loja: LojaDeTeste) {
  return comoRequisicao(acesso, { lojaId: loja.id, papel: "PUBLIC" }, () =>
    catalogoDaVitrine("1"),
  );
}

describe("a vitrine lista as seções na ordem do dono (AC-404)", () => {
  it(
    "@spec:AC-404 mostra as categorias visíveis na ordem definida, com seus produtos",
    async () => {
      const loja = await criarLoja({ nome: "Lanchonete da Esquina" });

      // Criadas fora de ordem DE PROPÓSITO: se o teste as criasse já ordenadas,
      // ele passaria mesmo que o código ordenasse pela data de criação.
      const bebidas = await criarCategoria({
        loja,
        nome: "Bebidas",
        ordem: 2,
      });
      const lanches = await criarCategoria({ loja, nome: "Lanches", ordem: 1 });

      const xis = await criarProduto({ loja, nome: "X-Salada" });
      const guarana = await criarProduto({ loja, nome: "Guaraná" });
      await porProdutoNaCategoria({ loja, produto: xis, categoria: lanches });
      await porProdutoNaCategoria({
        loja,
        produto: guarana,
        categoria: bebidas,
      });

      const catalogo = await comoVisitante(loja);

      expect(catalogo.secoes.map((secao) => secao.nome)).toEqual([
        "Lanches",
        "Bebidas",
      ]);
      expect(catalogo.secoes[0]?.produtos.map((p) => p.nome)).toEqual([
        "X-Salada",
      ]);
      expect(catalogo.secoes[1]?.produtos.map((p) => p.nome)).toEqual([
        "Guaraná",
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-404 categoria oculta não aparece, nem com os produtos dela",
    async () => {
      const loja = await criarLoja({ nome: "Padaria do Zé" });

      const natal = await criarCategoria({
        loja,
        nome: "Natal",
        visivel: false,
      });
      const panetone = await criarProduto({ loja, nome: "Panetone" });
      await porProdutoNaCategoria({
        loja,
        produto: panetone,
        categoria: natal,
      });

      const catalogo = await comoVisitante(loja);

      // A seção some inteira: não é "aparece vazia", é não aparece.
      expect(catalogo.secoes.map((secao) => secao.nome)).not.toContain("Natal");
      expect(catalogo.secoes).toHaveLength(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-404 produto em rascunho não entra na seção, e a seção não fica com buraco",
    async () => {
      const loja = await criarLoja({ nome: "Autopeças Central" });
      const filtros = await criarCategoria({ loja, nome: "Filtros" });

      const publicado = await criarProduto({ loja, nome: "Filtro de óleo" });
      const rascunho = await criarProduto({
        loja,
        nome: "Filtro que ainda não estreou",
        status: "DRAFT",
      });
      await porProdutoNaCategoria({
        loja,
        produto: publicado,
        categoria: filtros,
      });
      await porProdutoNaCategoria({
        loja,
        produto: rascunho,
        categoria: filtros,
      });

      const catalogo = await comoVisitante(loja);

      // O vínculo do rascunho existe e é legível; o produto não é. O que se prova
      // aqui é que isso vira uma lista de um item, e não uma lista com um vazio.
      expect(catalogo.secoes[0]?.produtos.map((p) => p.nome)).toEqual([
        "Filtro de óleo",
      ]);
    },
    ESPERA_LONGA,
  );
});

describe("os destaques têm área própria (AC-406)", () => {
  it(
    "@spec:AC-406 destaque aparece na lista de destaques, mesmo sem categoria",
    async () => {
      const loja = await criarLoja({ nome: "Boutique da Ana" });

      const vestido = await criarProduto({
        loja,
        nome: "Vestido de verão",
        destaque: true,
      });
      await criarProduto({ loja, nome: "Camiseta comum" });

      const catalogo = await comoVisitante(loja);

      expect(catalogo.destaques.map((p) => p.nome)).toEqual([vestido.nome]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-406 o destaque que está em duas seções aparece UMA vez nos destaques",
    async () => {
      const loja = await criarLoja({ nome: "Mercadinho do Bairro" });

      const promocoes = await criarCategoria({
        loja,
        nome: "Promoções",
        ordem: 1,
      });
      const mercearia = await criarCategoria({
        loja,
        nome: "Mercearia",
        ordem: 2,
      });
      const arroz = await criarProduto({
        loja,
        nome: "Arroz 5kg",
        destaque: true,
      });

      await porProdutoNaCategoria({
        loja,
        produto: arroz,
        categoria: promocoes,
      });
      await porProdutoNaCategoria({
        loja,
        produto: arroz,
        categoria: mercearia,
      });

      const catalogo = await comoVisitante(loja);

      // É por isso que os destaques vêm de consulta própria, e não de filtrar as
      // seções: filtrando, ele apareceria uma vez por seção em que estivesse.
      expect(catalogo.destaques).toHaveLength(1);
      // E continua aparecendo nas DUAS seções, que é o motivo de o vínculo ser N:M.
      expect(catalogo.secoes.map((s) => s.produtos.length)).toEqual([1, 1]);
    },
    ESPERA_LONGA,
  );
});

describe("loja sem catálogo não parece quebrada (AC-407)", () => {
  it(
    "@spec:AC-407 loja recém-criada devolve listas vazias, e não erro",
    async () => {
      const loja = await criarLoja({ nome: "Loja Recém-Nascida" });

      const catalogo = await comoVisitante(loja);

      // Vazio é uma resposta, e é o que deixa a tela dizer "estamos montando o
      // catálogo" em vez de mostrar erro para um cliente que não fez nada errado.
      expect(catalogo.secoes).toEqual([]);
      expect(catalogo.destaques).toEqual([]);
    },
    ESPERA_LONGA,
  );
});

describe("a versão do catálogo sobe a cada mudança (AC-417)", () => {
  /** A versão que o banco guarda para a loja, no momento da leitura. */
  async function versaoNoBanco(loja: LojaDeTeste): Promise<bigint> {
    const { rows } = await migrador.query<{ catalog_version: string }>(
      "SELECT catalog_version FROM app.stores WHERE id = $1",
      [loja.id],
    );
    const linha = rows[0];
    if (linha === undefined) throw new Error("loja de apoio sumiu");
    return BigInt(linha.catalog_version);
  }

  it(
    "@spec:AC-417 publicar produto novo sobe a versão",
    async () => {
      const loja = await criarLoja({ nome: "Pizzaria do Centro" });
      const antes = await versaoNoBanco(loja);

      await criarProduto({ loja, nome: "Pizza calabresa" });

      expect(await versaoNoBanco(loja)).toBeGreaterThan(antes);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-417 mexer só na categoria também sobe a versão",
    async () => {
      const loja = await criarLoja({ nome: "Doceria da Vila" });
      const antes = await versaoNoBanco(loja);

      // ESTE É O CASO QUE FALTAVA até a migração 0017. O gatilho só existia em
      // `products`, então ocultar uma seção ou reordenar a vitrine não contava
      // como mudança — e o cache serviria a vitrine antiga por tempo
      // indeterminado, sem o dono ter como saber por quê.
      await criarCategoria({ loja, nome: "Bolos" });

      expect(await versaoNoBanco(loja)).toBeGreaterThan(antes);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-417 a versão volta na resposta, para quem guarda saber quando venceu",
    async () => {
      const loja = await criarLoja({ nome: "Empório do Sul" });

      const catalogo = await comoRequisicao(
        acesso,
        { lojaId: loja.id, papel: "PUBLIC" },
        () => catalogoDaVitrine("42"),
      );

      // Texto, e não número: quem recebe isto é JSON, que não tem `bigint`.
      expect(catalogo.versao).toBe("42");
    },
    ESPERA_LONGA,
  );
});
