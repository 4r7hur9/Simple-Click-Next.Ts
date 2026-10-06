/**
 * Trocar o tipo de negócio preserva o que já foi cadastrado (AC-320).
 *
 * Uma lanchonete com produto de ingredientes vira restaurante pela troca que
 * a administração faz (T-203, `PUT /v1/admin/lojas/:id/tipo-de-negocio`) — a
 * mesma rota, o mesmo banco. A prova é do catálogo:
 *
 * - NENHUM PRODUTO PERDE DADO: o retrato inteiro das tabelas do catálogo,
 *   coluna por coluna, é o mesmo antes e depois; e a página pública do
 *   produto é a mesma, byte a byte;
 * - OS GRUPOS CONTINUAM FUNCIONANDO: o ingrediente escolhido entra no
 *   carrinho e cobra o acréscimo, depois da troca como antes;
 * - SÓ O VOCABULÁRIO E A DISPOSIÇÃO MUDAM: "Ingredientes" vira
 *   "Acompanhamentos", "Sabor" vira "Porção", e a composição do cadastro do
 *   produto passa a ser a do restaurante.
 *
 * É o produto guardar o ramo com que nasceu (`products.vertical_code`) que
 * permite isto — trocar a loja não invalida o que já está cadastrado.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  criarCategoria,
  criarGrupoDeEscolha,
  criarLoja,
  criarOpcao,
  criarProduto,
  porGrupoNoProduto,
  porProdutoNaCategoria,
  type GrupoDeTeste,
  type IdentidadeDeTeste,
  type LojaDeTeste,
  type OpcaoDeTeste,
  type ProdutoDeTeste,
} from "@simpleclick/testing";

import {
  comoPapel,
  ESPERA_DA_ADMINISTRACAO,
  montarApiDaAdministracao,
  ORIGEM_DA_ADMINISTRACAO,
  retratoDoCatalogo,
  type ApiDaAdministracao,
} from "./apoio-da-administracao.ts";
import { lojaQueVende, ORIGEM, Visitante } from "./apoio-do-catalogo.ts";
import { abrirAcessoDaAplicacao } from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

const PRECO_DO_X_TUDO = 2_600;
const ACRESCIMO_DO_OVO = 250;

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let api: ApiDaAdministracao;
let administradora: IdentidadeDeTeste;
let loja: LojaDeTeste;
let xTudo: ProdutoDeTeste;
let ingredientes: GrupoDeTeste;
let ovo: OpcaoDeTeste;

/** O que a loja mostrava, e o banco guardava, ANTES da troca. */
let antes: {
  vitrine: request.Response;
  produto: request.Response;
  catalogo: Record<string, unknown[]>;
  subtotal: number;
};
let troca: request.Response;

function vitrine() {
  return request(api.app).get(`/v1/vitrine/${loja.apelido}`);
}

function paginaDoProduto() {
  return request(api.app).get(
    `/v1/vitrine/${loja.apelido}/produto/${xTudo.id}`,
  );
}

/** Um cliente novo leva o X-Tudo com ovo e confere quanto deu. */
async function subtotalComOvo(): Promise<number> {
  const cliente = new Visitante(api.app, loja.apelido);
  const acrescentado = await cliente.acrescentar({
    produtoId: xTudo.id,
    quantidade: 1,
    escolhas: [{ grupoId: ingredientes.id, opcaoId: ovo.id, quantidade: 1 }],
  });
  expect(acrescentado.status, JSON.stringify(acrescentado.body)).toBe(201);
  expect(acrescentado.body.itens[0]?.opcoes).toEqual([
    { grupoNome: "Ingredientes", opcaoNome: "Ovo", quantidade: 1 },
  ]);
  const conferido = await cliente.conferir();
  expect(conferido.status).toBe(200);
  return Number(conferido.body.subtotalCentavos);
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  // As duas origens: a da vitrine, para o carrinho, e a da administração,
  // para a troca.
  api = montarApiDaAdministracao({
    origens: [ORIGEM, ORIGEM_DA_ADMINISTRACAO],
    carrinho: { acesso },
    pedidos: { acesso },
  });
  administradora = await criarAdministradorDaPlataforma({
    nome: "Administradora geral",
  });

  loja = await criarLoja({ ramo: "lanchonete", nome: "Lanchonete da Praça" });
  await lojaQueVende(migrador, loja);
  const categoria = await criarCategoria({ loja, nome: "Lanches" });
  xTudo = await criarProduto({
    loja,
    nome: "X-Tudo",
    descricao: "Pão, hambúrguer, queijo, presunto e salada.",
    precoCentavos: PRECO_DO_X_TUDO,
  });
  await porProdutoNaCategoria({ loja, produto: xTudo, categoria });
  ingredientes = await criarGrupoDeEscolha({
    loja,
    nome: "Ingredientes",
    maximo: 2,
  });
  ovo = await criarOpcao({
    loja,
    grupo: ingredientes,
    nome: "Ovo",
    acrescimoCentavos: ACRESCIMO_DO_OVO,
  });
  await criarOpcao({ loja, grupo: ingredientes, nome: "Sem cebola" });
  await porGrupoNoProduto({ loja, produto: xTudo, grupo: ingredientes });

  antes = {
    vitrine: await vitrine(),
    produto: await paginaDoProduto(),
    catalogo: await retratoDoCatalogo(migrador, loja.id),
    subtotal: await subtotalComOvo(),
  };

  troca = await request(api.app)
    .put(`/v1/admin/lojas/${loja.id}/tipo-de-negocio`)
    .set(comoPapel(administradora.id, "ADMIN"))
    .send({ tipoDeNegocio: "FOOD_RESTAURANT" });
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await api?.encerrar();
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("a lanchonete vira restaurante e nada se perde (AC-320)", () => {
  it(
    "@spec:AC-320 nenhum produto perde dado: o catálogo no banco e a página pública do produto são os mesmos depois da troca",
    async () => {
      expect(troca.status).toBe(200);
      expect(troca.body.tipoDeNegocio.codigo).toBe("FOOD_RESTAURANT");

      expect(await retratoDoCatalogo(migrador, loja.id)).toEqual(
        antes.catalogo,
      );
      // O retrato não é vazio: havia o que perder.
      expect(antes.catalogo["products"]).toHaveLength(1);
      expect(antes.catalogo["option_items"]).toHaveLength(2);

      // O produto continua com o ramo com que nasceu — é o que o protege.
      const { rows } = await migrador.query<{ vertical_code: string }>(
        "SELECT vertical_code FROM app.products WHERE id = $1",
        [xTudo.id],
      );
      expect(rows[0]?.vertical_code).toBe("FOOD_SNACK");

      expect(antes.produto.status).toBe(200);
      const depois = await paginaDoProduto();
      expect(depois.status).toBe(200);
      expect(depois.body).toEqual(antes.produto.body);
      expect(depois.body.descricao).toBe(
        "Pão, hambúrguer, queijo, presunto e salada.",
      );
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-320 os grupos existentes continuam funcionando: o ingrediente entra no carrinho e cobra o acréscimo como antes",
    async () => {
      const depois = await paginaDoProduto();
      const grupos = depois.body.grupos as {
        nome: string;
        opcoes: { nome: string }[];
      }[];
      expect(grupos.map((grupo) => grupo.nome)).toEqual(["Ingredientes"]);
      expect(grupos[0]?.opcoes.map((opcao) => opcao.nome)).toEqual(
        expect.arrayContaining(["Ovo", "Sem cebola"]),
      );

      expect(antes.subtotal).toBe(PRECO_DO_X_TUDO + ACRESCIMO_DO_OVO);
      expect(await subtotalComOvo()).toBe(antes.subtotal);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-320 só o vocabulário e a disposição das telas mudam para o ramo novo",
    async () => {
      expect(antes.vitrine.body.loja).toMatchObject({
        ramo: "FOOD_SNACK",
        rotulos: {
          catalogo: "Cardápio",
          grupoOpcao: "Ingredientes",
          variacao: "Sabor",
        },
      });
      expect(antes.vitrine.body.loja.blocos.cadastroProduto).toContain(
        "ingredientes",
      );

      const depois = await vitrine();
      expect(depois.status).toBe(200);
      expect(depois.body.loja).toMatchObject({
        ramo: "FOOD_RESTAURANT",
        // Continua sendo comida, e o catálogo continua sendo um cardápio.
        alimentacao: true,
        rotulos: {
          catalogo: "Cardápio",
          grupoOpcao: "Acompanhamentos",
          variacao: "Porção",
        },
      });
      expect(depois.body.loja.blocos.cadastroProduto).toEqual([
        "identificacao",
        "preco",
        "acompanhamentos",
        "tempo_preparo",
      ]);
      // O resto da apresentação é o mesmo: nome, boas-vindas, horário.
      expect(depois.body.loja.nome).toBe(antes.vitrine.body.loja.nome);
      expect(depois.body.abertura).toEqual(antes.vitrine.body.abertura);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
