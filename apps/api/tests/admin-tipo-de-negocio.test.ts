/**
 * A administração troca o tipo de negócio de uma loja (AC-214).
 *
 * Uma lanchonete com cardápio montado vira loja de roupas, pela rota da
 * administração, contra o banco de verdade. O que se prova é o que a troca
 * promete, cada coisa onde ela é vista:
 *
 * - o vocabulário e o layout na VITRINE, que é o que as telas da loja leem
 *   (o catálogo deixa de ser cardápio, a grade ganha destaque, os
 *   ingredientes saem de cena);
 * - o controle de estoque no PAINEL DO DONO, pela rota da grade de variações;
 * - o "nada se perde" no BANCO, pelo retrato inteiro das tabelas do catálogo;
 * - a trilha, com quem trocou e de qual tipo para qual.
 *
 * O lado do dono — a recusa quando ele tenta pela configuração da loja — está
 * provado em `vertical-somente-admin.test.ts` (AC-323). Aqui entra a recusa
 * pela PRÓPRIA rota da administração e pela coluna no banco.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { esquemaDaFichaDaLoja } from "@simpleclick/contracts";
import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarAdministradorDaPlataforma,
  criarCategoria,
  criarGrupoDeEscolha,
  criarLoja,
  criarMembro,
  criarOpcao,
  criarProduto,
  criarVariacao,
  porGrupoNoProduto,
  porProdutoNaCategoria,
  type IdentidadeDeTeste,
  type LojaDeTeste,
  type MembroDeTeste,
} from "@simpleclick/testing";

import {
  comoPapel,
  ESPERA_DA_ADMINISTRACAO,
  montarApiDaAdministracao,
  retratoDoCatalogo,
  type ApiDaAdministracao,
} from "./apoio-da-administracao.ts";
import { appDoDono } from "./apoio-do-catalogo.ts";
import {
  abrirAcessoDaAplicacao,
  codigoDoPostgres,
  comoRequisicao,
  RECUSA_DE_PERMISSAO,
} from "./apoio-de-isolamento.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { criarRotasDasVariacoes } from "../src/modules/catalog/variacoes.routes.ts";
import { identificarLoja } from "../src/modules/storefront/resolver-loja.usecase.ts";

let migrador: pg.Client;
let api: ApiDaAdministracao;
let acessoDoPainel: AcessoAoBanco;
let administradora: IdentidadeDeTeste;
let loja: LojaDeTeste;
let dono: MembroDeTeste;
let painel: ReturnType<typeof appDoDono>;
let produtoId: string;

/** O que a vitrine e o painel mostravam, e o banco guardava, ANTES da troca. */
let antes: {
  vitrine: request.Response;
  grade: request.Response;
  catalogo: Record<string, unknown[]>;
};
/** A resposta da troca. */
let troca: request.Response;

function vitrine() {
  return request(api.app).get(`/v1/vitrine/${loja.apelido}`);
}

function grade() {
  return request(painel).get(
    `/v1/lojas/${loja.apelido}/catalogo/produtos/${produtoId}/variacoes`,
  );
}

function trocarTipo(tipoDeNegocio: string, identidade = administradora.id) {
  return request(api.app)
    .put(`/v1/admin/lojas/${loja.id}/tipo-de-negocio`)
    .set(
      comoPapel(
        identidade,
        identidade === administradora.id ? "ADMIN" : "OWNER",
      ),
    )
    .send({ tipoDeNegocio });
}

async function linhasDaTroca() {
  const { rows } = await migrador.query<{
    actor_id: string;
    actor_role: string;
    before_data: unknown;
    after_data: unknown;
  }>(
    `SELECT actor_id::text AS actor_id, actor_role, before_data, after_data
       FROM app.audit_log
      WHERE store_id = $1 AND action = 'TIPO_DE_NEGOCIO_ALTERADO'
      ORDER BY id`,
    [loja.id],
  );
  return rows;
}

async function tipoGravado(): Promise<string | undefined> {
  const { rows } = await migrador.query<{ vertical_code: string }>(
    "SELECT vertical_code FROM app.stores WHERE id = $1",
    [loja.id],
  );
  return rows[0]?.vertical_code;
}

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  api = montarApiDaAdministracao();
  acessoDoPainel = abrirAcessoDaAplicacao(bancoDoArquivo().url, {
    maxDeConexoes: 4,
  });
  administradora = await criarAdministradorDaPlataforma({
    nome: "Administradora geral",
  });

  // Uma lanchonete com cardápio de verdade: seção, produto, ingredientes com
  // acréscimo e uma variação com preço.
  loja = await criarLoja({ ramo: "lanchonete", nome: "Lanches do Zé" });
  dono = await criarMembro({ loja });
  const categoria = await criarCategoria({ loja, nome: "Lanches" });
  const produto = await criarProduto({ loja, nome: "X-Salada" });
  produtoId = produto.id;
  await porProdutoNaCategoria({ loja, produto, categoria });
  const ingredientes = await criarGrupoDeEscolha({
    loja,
    nome: "Ingredientes",
    maximo: 3,
  });
  await criarOpcao({
    loja,
    grupo: ingredientes,
    nome: "Bacon",
    acrescimoCentavos: 300,
  });
  await criarOpcao({ loja, grupo: ingredientes, nome: "Sem cebola" });
  await porGrupoNoProduto({ loja, produto, grupo: ingredientes });
  await criarVariacao({
    loja,
    produto,
    nome: "Simples",
    precoCentavos: 1_800,
    padrao: true,
  });

  // O painel do dono, com a identidade de um MEMBRO da loja.
  painel = appDoDono(
    criarRotasDasVariacoes({
      acesso: acessoDoPainel,
      resolverLoja: identificarLoja,
      autenticar: () => ({
        identidadeId: dono.identidade.id,
        papel: "OWNER" as const,
      }),
    }),
  );

  antes = {
    vitrine: await vitrine(),
    grade: await grade(),
    catalogo: await retratoDoCatalogo(migrador, loja.id),
  };
  troca = await trocarTipo("APPAREL");
}, ESPERA_DA_ADMINISTRACAO);

afterAll(async () => {
  await acessoDoPainel?.encerrar();
  await api?.encerrar();
  await migrador?.end();
}, ESPERA_DA_ADMINISTRACAO);

describe("a administração troca a lanchonete para loja de roupas (AC-214)", () => {
  it(
    "@spec:AC-214 a vitrine passa a usar o vocabulário e o layout do ramo novo: o catálogo deixa de ser cardápio, a grade ganha destaque e os ingredientes saem de cena",
    async () => {
      expect(antes.vitrine.status).toBe(200);
      expect(antes.vitrine.body.loja).toMatchObject({
        ramo: "FOOD_SNACK",
        alimentacao: true,
        rotulos: { catalogo: "Cardápio", grupoOpcao: "Ingredientes" },
      });
      expect(antes.vitrine.body.loja.blocos.detalheProduto).toContain(
        "ingredientes",
      );

      expect(troca.status).toBe(200);
      const depois = await vitrine();
      expect(depois.status).toBe(200);
      expect(depois.body.loja).toMatchObject({
        ramo: "APPAREL",
        alimentacao: false,
        rotulos: {
          catalogo: "Catálogo",
          grupoOpcao: "Especificações",
          variacao: "Tamanho",
        },
      });
      const { blocos } = depois.body.loja as {
        blocos: Record<string, string[]>;
      };
      expect(blocos["detalheProduto"]).toContain("grade");
      expect(blocos["cadastroProduto"]).toEqual(
        expect.arrayContaining(["grade", "estoque"]),
      );
      for (const tela of Object.values(blocos)) {
        expect(tela).not.toContain("ingredientes");
      }
      expect(JSON.stringify(depois.body)).not.toContain("Cardápio");
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-214 nenhum produto, categoria, grupo, variação ou preço perde dado, e o controle de estoque do ramo novo passa a valer no painel do dono",
    async () => {
      expect(await retratoDoCatalogo(migrador, loja.id)).toEqual(
        antes.catalogo,
      );
      // O retrato não é vazio: havia o que perder.
      expect(antes.catalogo["products"]).toHaveLength(1);
      expect(antes.catalogo["option_items"]).toHaveLength(2);
      expect(antes.catalogo["product_prices"]).toHaveLength(1);

      expect(antes.grade.status).toBe(200);
      expect(antes.grade.body.controlaEstoque).toBe(false);
      const depois = await grade();
      expect(depois.status).toBe(200);
      expect(depois.body.controlaEstoque).toBe(true);
      // A variação que já existia continua lá, sem saldo inventado.
      expect(depois.body.variacoes).toHaveLength(1);
      expect(depois.body.variacoes[0]).toMatchObject({
        nome: "Simples",
        estoque: null,
      });
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-214 a troca fica no histórico de auditoria com quem alterou, de qual tipo para qual",
    async () => {
      const ficha = esquemaDaFichaDaLoja.parse(troca.body);
      expect(ficha.tipoDeNegocio).toEqual({
        codigo: "APPAREL",
        nome: "Roupas",
        controlaEstoque: true,
      });
      const [registro] = ficha.historico;
      expect(registro?.acao).toBe("TIPO_DE_NEGOCIO_ALTERADO");
      expect(registro?.quem).toEqual({
        id: administradora.id,
        nome: "Administradora geral",
      });
      expect(registro?.campos).toEqual(
        expect.arrayContaining([
          { campo: "tipoDeNegocio", antes: "FOOD_SNACK", depois: "APPAREL" },
          { campo: "controlaEstoque", antes: false, depois: true },
        ]),
      );

      const linhas = await linhasDaTroca();
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatchObject({
        actor_id: administradora.id,
        actor_role: "ADMIN",
      });
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-214 o dono é recusado mesmo chamando a rota da administração direto, e a credencial das lojas não escreve na coluna",
    async () => {
      const pelaRota = await trocarTipo("FOOD_RESTAURANT", dono.identidade.id);
      expect(pelaRota.status).toBe(403);
      expect(pelaRota.body.mensagem).toContain(
        "feito pela administração da plataforma",
      );

      // Mesmo que alguma rota do dono tentasse, o privilégio da coluna não
      // existe para a credencial das lojas (migração 0003).
      let codigo: string | undefined;
      try {
        await comoRequisicao(
          acessoDoPainel,
          { lojaId: loja.id, usuarioId: dono.identidade.id, papel: "OWNER" },
          (tx) =>
            tx.$executeRaw`UPDATE app.stores SET vertical_code = 'FOOD_RESTAURANT'
                            WHERE id = ${loja.id}::uuid`,
        );
      } catch (erro) {
        codigo = codigoDoPostgres(erro);
      }
      expect(codigo).toBe(RECUSA_DE_PERMISSAO);

      expect(await tipoGravado()).toBe("APPAREL");
      expect(await linhasDaTroca()).toHaveLength(1);
    },
    ESPERA_DA_ADMINISTRACAO,
  );

  it(
    "@spec:AC-214 tipo inexistente é recusado sem mudar nada, e pedir o tipo que a loja já tem não cria linha nova",
    async () => {
      const inexistente = await trocarTipo("NAVE_ESPACIAL");
      expect(inexistente.status).toBe(400);
      expect(inexistente.body.erro).toBe("tipo_desconhecido");

      const mesmo = await trocarTipo("APPAREL");
      expect(mesmo.status).toBe(200);

      expect(await tipoGravado()).toBe("APPAREL");
      expect(await linhasDaTroca()).toHaveLength(1);
    },
    ESPERA_DA_ADMINISTRACAO,
  );
});
