/**
 * Prova de que mudar o produto de categoria preserva o que foi preenchido
 * (AC-329), contra banco de verdade e pelas rotas do painel.
 *
 * A regra pura — o que é "usado na categoria atual", o que falta preencher e
 * qual vínculo troca — está provada em `mover-categoria.usecase.test.ts`. Aqui
 * se prova o caminho inteiro: o produto troca de seção na vitrine, os valores
 * antigos continuam no banco e à vista do dono, e só saem com confirmação.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import {
  caminhoDoPainel,
  catalogoPublico,
  criarCategoriaPeloPainel,
  criarProdutoPeloPainel,
  lojaComDonoNoPainel,
} from "./apoio-do-painel.ts";
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

type App = Awaited<ReturnType<typeof lojaComDonoNoPainel>>["app"];

interface EstadoDoProduto {
  readonly categoriaId: string | null;
  readonly campos: readonly {
    readonly especificacao: { readonly id: string; readonly nome: string };
    readonly valor: unknown;
  }[];
  readonly paraPreencher: readonly string[];
  readonly naoUsadas: readonly {
    readonly especificacaoId: string;
    readonly nome: string;
    readonly categoriaNome: string | null;
    readonly valor: unknown;
    readonly motivo: string;
  }[];
}

async function criarEspecificacao(
  app: App,
  loja: LojaDeTeste,
  categoriaId: string,
  dados: {
    readonly nome: string;
    readonly tipo: "texto" | "numero" | "lista";
    readonly opcoes?: readonly string[];
  },
): Promise<{ readonly id: string }> {
  const resposta = await request(app)
    .post(caminhoDoPainel(loja, `categorias/${categoriaId}/especificacoes`))
    .send({
      nome: dados.nome,
      tipo: dados.tipo,
      unidade: null,
      obrigatoria: true,
      filtravel: true,
      opcoes: dados.opcoes ?? [],
    });
  expect(resposta.status).toBe(201);
  return resposta.body as { readonly id: string };
}

async function estado(
  app: App,
  loja: LojaDeTeste,
  produtoId: string,
): Promise<EstadoDoProduto> {
  const resposta = await request(app).get(
    caminhoDoPainel(loja, `produtos/${produtoId}/especificacoes`),
  );
  expect(resposta.status).toBe(200);
  return resposta.body as EstadoDoProduto;
}

function mover(
  app: App,
  loja: LojaDeTeste,
  produtoId: string,
  categoriaId: string,
) {
  return request(app)
    .patch(caminhoDoPainel(loja, `produtos/${produtoId}`))
    .send({ categoriaId });
}

async function valoresGuardados(produtoId: string): Promise<string[]> {
  const resultado = await migrador.query<{ valor: string }>(
    `SELECT COALESCE(value_text, value_num::text) AS valor
       FROM app.product_attributes WHERE product_id = $1 ORDER BY 1`,
    [produtoId],
  );
  return resultado.rows.map((linha) => linha.valor);
}

/** Um pneu preenchido em Pneus, que também aparece em Promoções. */
async function pneuPreenchido() {
  const contexto = await lojaComDonoNoPainel(acesso);
  const { app, loja } = contexto;
  const pneus = await criarCategoriaPeloPainel(app, loja, "Pneus");
  const rodas = await criarCategoriaPeloPainel(app, loja, "Rodas");
  const promocoes = await criarCategoriaPeloPainel(app, loja, "Promoções");
  const aro = await criarEspecificacao(app, loja, pneus.id, {
    nome: "Aro",
    tipo: "lista",
    opcoes: ["13", "14", "15", "16"],
  });
  const largura = await criarEspecificacao(app, loja, pneus.id, {
    nome: "Largura",
    tipo: "numero",
  });
  const furacao = await criarEspecificacao(app, loja, rodas.id, {
    nome: "Furação",
    tipo: "texto",
  });
  const produto = await criarProdutoPeloPainel(app, loja, {
    categoriaId: pneus.id,
    nome: "Pneu 195/55 R15",
  });
  const preenchido = await request(app)
    .put(caminhoDoPainel(loja, `produtos/${produto.id}/especificacoes`))
    .send({ valores: { [aro.id]: "15", [largura.id]: 195 } });
  expect(preenchido.status).toBe(200);
  // A seção secundária entra direto no banco: o painel ainda não tem tela
  // para pôr um produto em duas categorias (Q-300 está aberta).
  await migrador.query(
    `INSERT INTO app.product_categories
       (store_id, product_id, category_id, is_primary)
     VALUES ($1, $2, $3, false)`,
    [loja.id, produto.id, promocoes.id],
  );
  return {
    ...contexto,
    pneus,
    rodas,
    promocoes,
    aro,
    largura,
    furacao,
    produto,
  };
}

describe("produto que muda de categoria não perde o que foi preenchido (AC-329)", () => {
  it(
    "@spec:AC-329 os valores anteriores ficam guardados e marcados como não usados, e as especificações da nova aparecem para preencher",
    async () => {
      const { app, loja, rodas, promocoes, furacao, produto } =
        await pneuPreenchido();

      const movido = await mover(app, loja, produto.id, rodas.id);
      expect(movido.status).toBe(200);
      expect(movido.body).toMatchObject({ categoriaId: rodas.id });

      const depois = await estado(app, loja, produto.id);
      expect(depois.categoriaId).toBe(rodas.id);
      expect(depois.campos.map((campo) => campo.especificacao.nome)).toEqual([
        "Furação",
      ]);
      expect(depois.paraPreencher).toEqual([furacao.id]);
      expect(
        depois.naoUsadas.map((item) => [
          item.nome,
          item.valor,
          item.categoriaNome,
          item.motivo,
        ]),
      ).toEqual(
        expect.arrayContaining([
          ["Aro", "15", "Pneus", "outra_categoria"],
          ["Largura", 195, "Pneus", "outra_categoria"],
        ]),
      );
      expect(await valoresGuardados(produto.id)).toEqual(["15", "195"]);

      // Na vitrine ele muda de seção; a seção secundária continua.
      const vitrine = await catalogoPublico(app, loja);
      const secoesDoProduto = vitrine.secoes
        .filter((secao) =>
          secao.produtos.some((item) => item.id === produto.id),
        )
        .map((secao) => secao.nome)
        .sort();
      expect(secoesDoProduto).toEqual(["Promoções", "Rodas"]);
      const vinculos = await migrador.query<{ category_id: string }>(
        `SELECT category_id FROM app.product_categories WHERE product_id = $1`,
        [produto.id],
      );
      expect(vinculos.rows.map((linha) => linha.category_id)).toContain(
        promocoes.id,
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-329 nada é apagado sem confirmar; o descarte confirmado apaga só aquele valor e fica na trilha",
    async () => {
      const { app, loja, rodas, aro, furacao, produto } =
        await pneuPreenchido();
      await mover(app, loja, produto.id, rodas.id);
      const endereco = caminhoDoPainel(
        loja,
        `produtos/${produto.id}/especificacoes/${aro.id}`,
      );

      const aviso = await request(app).delete(endereco).send({});
      expect(aviso.status).toBe(409);
      expect((aviso.body as { aviso: string }).aviso).toContain(
        "Aro (Pneus): 15",
      );
      expect(await valoresGuardados(produto.id)).toEqual(["15", "195"]);

      const descartado = await request(app)
        .delete(endereco)
        .send({ confirmado: true });
      expect(descartado.status).toBe(200);
      expect(
        (descartado.body as EstadoDoProduto).naoUsadas.map((item) => item.nome),
      ).toEqual(["Largura"]);
      expect(await valoresGuardados(produto.id)).toEqual(["195"]);

      const trilha = await migrador.query<{ action: string }>(
        `SELECT action FROM app.audit_log WHERE entity_id = $1`,
        [aro.id],
      );
      expect(trilha.rows.map((linha) => linha.action)).toContain(
        "ESPECIFICACAO_VALOR_DESCARTADO",
      );

      // Valor EM USO não se descarta por aqui: limpa-se pelo preenchimento.
      await request(app)
        .put(caminhoDoPainel(loja, `produtos/${produto.id}/especificacoes`))
        .send({ valores: { [furacao.id]: "4x100" } });
      const emUso = await request(app)
        .delete(
          caminhoDoPainel(
            loja,
            `produtos/${produto.id}/especificacoes/${furacao.id}`,
          ),
        )
        .send({ confirmado: true });
      expect(emUso.status).toBe(400);
      expect(emUso.body).toEqual({ erro: "valor_em_uso" });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-329 voltar para a categoria anterior reaproveita os valores guardados",
    async () => {
      const { app, loja, pneus, rodas, produto } = await pneuPreenchido();

      await mover(app, loja, produto.id, rodas.id);
      const devolvido = await mover(app, loja, produto.id, pneus.id);
      expect(devolvido.status).toBe(200);

      const deVolta = await estado(app, loja, produto.id);
      expect(deVolta.campos.map((campo) => campo.valor)).toEqual(["15", 195]);
      expect(deVolta.paraPreencher).toEqual([]);
      expect(deVolta.naoUsadas).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-329 salvar o produto sem mudar a categoria não mexe em vínculo nenhum",
    async () => {
      const { app, loja, pneus, produto } = await pneuPreenchido();
      const antes = await migrador.query(
        `SELECT id, category_id, is_primary, sort_order
           FROM app.product_categories WHERE product_id = $1 ORDER BY id`,
        [produto.id],
      );

      const salvo = await request(app)
        .patch(caminhoDoPainel(loja, `produtos/${produto.id}`))
        .send({ nome: "Pneu 195/55 R15 aro de aço", categoriaId: pneus.id });
      expect(salvo.status).toBe(200);

      const depois = await migrador.query(
        `SELECT id, category_id, is_primary, sort_order
           FROM app.product_categories WHERE product_id = $1 ORDER BY id`,
        [produto.id],
      );
      expect(depois.rows).toEqual(antes.rows);
    },
    ESPERA_LONGA,
  );
});
