/**
 * Prova da grade de variações de ponta a ponta na API (AC-316).
 *
 * A camiseta do critério, montada pelo CAMINHO DO DONO: os tamanhos P, M e G
 * são cadastrados pela rota do painel, com código de estoque e unidades de cada
 * um, e o M nasce zerado. O que se prova é o que o cliente encontra depois — a
 * página do produto e o carrinho —, contra o banco de verdade e com o
 * isolamento por linha ligado.
 *
 * POR QUE AS DUAS PONTAS. A página desabilitar o M é o que a pessoa vê; o
 * carrinho recusar o M é o que impede quem monta a requisição à mão de comprar a
 * peça que não existe. Só uma delas provada deixaria a outra livre para
 * regredir em silêncio.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarCategoria,
  criarGrupoDeEscolha,
  criarLoja,
  criarMembro,
  criarOpcao,
  criarProduto,
  porGrupoNoProduto,
  porProdutoNaCategoria,
} from "@simpleclick/testing";
import type {
  CategoriaDeTeste,
  GrupoDeTeste,
  LojaDeTeste,
  OpcaoDeTeste,
  ProdutoDeTeste,
} from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import {
  appDoDono,
  lojaQueVende,
  ORIGEM,
  Visitante,
  type DonoDeTeste,
} from "./apoio-do-catalogo.ts";
import { criarApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { criarRotasDasVariacoes } from "../src/modules/catalog/variacoes.routes.ts";
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

  loja = await criarLoja({ nome: "Malharia da Grade" });
  const membro = await criarMembro({ loja });
  dono = { identidadeId: membro.identidade.id, papel: "OWNER" };
  categoria = await criarCategoria({ loja, nome: "Camisetas" });
  await lojaQueVende(migrador, loja);

  painel = appDoDono(
    criarRotasDasVariacoes({
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

/** O eixo "Tamanho" ligado ao produto, com as opções P, M e G. */
interface Grade {
  readonly produto: ProdutoDeTeste;
  readonly tamanho: GrupoDeTeste;
  readonly p: OpcaoDeTeste;
  readonly m: OpcaoDeTeste;
  readonly g: OpcaoDeTeste;
}

async function camisetaComTamanhos(nome: string): Promise<Grade> {
  const produto = await criarProduto({ loja, nome });
  await porProdutoNaCategoria({ loja, produto, categoria });
  const tamanho = await criarGrupoDeEscolha({
    loja,
    nome: "Tamanho",
    minimo: 1,
    maximo: 1,
    eixoDeVariacao: true,
  });
  await porGrupoNoProduto({ loja, produto, grupo: tamanho });
  const p = await criarOpcao({ loja, grupo: tamanho, nome: "P" });
  const m = await criarOpcao({ loja, grupo: tamanho, nome: "M" });
  const g = await criarOpcao({ loja, grupo: tamanho, nome: "G" });
  return { produto, tamanho, p, m, g };
}

/** O dono cadastra uma variação pela rota do painel, como a grade faz. */
function cadastrarVariacao(
  grade: Grade,
  opcao: OpcaoDeTeste,
  campos: Partial<Record<string, unknown>> = {},
) {
  return request(painel)
    .post(
      `/v1/lojas/${loja.apelido}/catalogo/produtos/${grade.produto.id}/variacoes`,
    )
    .send({
      nome: `${grade.produto.nome} ${opcao.nome}`,
      sku: null,
      codigoDeBarras: null,
      precoCentavos: 4990,
      estoque: null,
      estoqueMinimo: null,
      pesoGramas: null,
      padrao: false,
      disponivel: true,
      combinacoes: [{ grupoId: grade.tamanho.id, opcaoId: opcao.id }],
      ...campos,
    });
}

/** A grade do critério: P e G com unidades, M zerado, cada um com seu código. */
async function gradeDoCriterio(nome: string, prefixo: string) {
  const grade = await camisetaComTamanhos(nome);
  const criadas = {
    p: await cadastrarVariacao(grade, grade.p, {
      sku: `${prefixo}-P`,
      estoque: 4,
      padrao: true,
    }),
    m: await cadastrarVariacao(grade, grade.m, {
      sku: `${prefixo}-M`,
      estoque: 0,
    }),
    g: await cadastrarVariacao(grade, grade.g, {
      sku: `${prefixo}-G`,
      estoque: 2,
    }),
  };
  for (const resposta of Object.values(criadas)) {
    expect(resposta.status).toBe(201);
  }
  return {
    grade,
    ids: {
      p: criadas.p.body.id as string,
      m: criadas.m.body.id as string,
      g: criadas.g.body.id as string,
    },
  };
}

/** A página pública do produto, como o navegador do cliente a pede. */
async function paginaDoProduto(produto: ProdutoDeTeste) {
  const resposta = await request(vitrine).get(
    `/v1/vitrine/${loja.apelido}/produto/${produto.id}`,
  );
  expect(resposta.status).toBe(200);
  return resposta.body as {
    grupos: {
      id: string;
      eixoDeVariacao: boolean;
      opcoes: { id: string; nome: string }[];
    }[];
    variacoes: {
      id: string;
      disponivel: boolean;
      valoresDosEixos: { grupoId: string; opcaoId: string }[];
    }[];
  };
}

/** Qual variação está à venda, pela opção do eixo que a identifica. */
function vendaPorTamanho(
  pagina: Awaited<ReturnType<typeof paginaDoProduto>>,
  grade: Grade,
): Record<string, boolean> {
  const nomePorOpcao = new Map([
    [grade.p.id, "P"],
    [grade.m.id, "M"],
    [grade.g.id, "G"],
  ]);
  const venda: Record<string, boolean> = {};
  for (const variacao of pagina.variacoes) {
    const valor = variacao.valoresDosEixos.find(
      (v) => v.grupoId === grade.tamanho.id,
    );
    const nome =
      valor === undefined ? undefined : nomePorOpcao.get(valor.opcaoId);
    if (nome !== undefined) venda[nome] = variacao.disponivel;
  }
  return venda;
}

describe("variação com estoque zerado fica indisponível na vitrine (AC-316)", () => {
  it(
    "@spec:AC-316 com o M zerado, a página mostra o M indisponível e o P e o G à venda",
    async () => {
      const { grade } = await gradeDoCriterio("Camiseta Básica", "CAM-BAS");

      const pagina = await paginaDoProduto(grade.produto);

      // O M APARECE — indisponível não é sumido: a pessoa precisa saber que o
      // tamanho existe e acabou, e não achar que a loja não trabalha com ele.
      const eixo = pagina.grupos.find((g) => g.id === grade.tamanho.id);
      expect(eixo?.eixoDeVariacao).toBe(true);
      expect(eixo?.opcoes.map((o) => o.nome)).toEqual(["P", "M", "G"]);
      expect(vendaPorTamanho(pagina, grade)).toEqual({
        P: true,
        M: false,
        G: true,
      });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-316 o M não pode ser escolhido: o carrinho recusa a variação zerada e aceita o P",
    async () => {
      const { grade, ids } = await gradeDoCriterio("Camiseta Gola V", "CAM-GV");
      const cliente = new Visitante(vitrine, loja.apelido);

      const recusado = await cliente.acrescentar({
        produtoId: grade.produto.id,
        variacaoId: ids.m,
        quantidade: 1,
        escolhas: [],
      });
      expect(recusado.status).toBe(409);

      const aceito = await cliente.acrescentar({
        produtoId: grade.produto.id,
        variacaoId: ids.p,
        quantidade: 1,
        escolhas: [],
      });
      expect(aceito.status).toBe(201);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-316 repor o M pelo painel o devolve à venda, sem mexer nos outros tamanhos",
    async () => {
      const { grade, ids } = await gradeDoCriterio(
        "Camiseta Raglan",
        "CAM-RAG",
      );

      const reposta = await request(painel)
        .patch(
          `/v1/lojas/${loja.apelido}/catalogo/produtos/${grade.produto.id}/variacoes/${ids.m}`,
        )
        .send({ estoque: 3 });
      expect(reposta.status).toBe(200);

      const pagina = await paginaDoProduto(grade.produto);
      expect(vendaPorTamanho(pagina, grade)).toEqual({
        P: true,
        M: true,
        G: true,
      });
    },
    ESPERA_LONGA,
  );
});

describe("cada variação tem o próprio código de estoque (AC-316)", () => {
  it(
    "@spec:AC-316 o código informado pelo dono fica em cada variação, e não no produto",
    async () => {
      const { grade, ids } = await gradeDoCriterio("Camiseta Polo", "CAM-POL");

      const resposta = await request(painel).get(
        `/v1/lojas/${loja.apelido}/catalogo/produtos/${grade.produto.id}/variacoes`,
      );
      expect(resposta.status).toBe(200);

      const skuPorId = new Map(
        (resposta.body.variacoes as { id: string; sku: string | null }[]).map(
          (v) => [v.id, v.sku],
        ),
      );
      expect(skuPorId.get(ids.p)).toBe("CAM-POL-P");
      expect(skuPorId.get(ids.m)).toBe("CAM-POL-M");
      expect(skuPorId.get(ids.g)).toBe("CAM-POL-G");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-316 o código não se repete na loja: criar ou trocar para um código em uso é recusado",
    async () => {
      const { grade, ids } = await gradeDoCriterio("Camiseta Longa", "CAM-LON");
      // O conflito vale na LOJA, e não só no produto: o código de estoque é o
      // que a pessoa bipa no balcão, e dois produtos com o mesmo código fariam
      // a leitura baixar a peça errada.
      const outra = await camisetaComTamanhos("Regata");

      const repetidaNoutroProduto = await cadastrarVariacao(outra, outra.p, {
        sku: "CAM-LON-P",
      });
      expect(repetidaNoutroProduto.status).toBe(409);
      expect(repetidaNoutroProduto.body).toEqual({ erro: "sku_duplicado" });

      const troca = await request(painel)
        .patch(
          `/v1/lojas/${loja.apelido}/catalogo/produtos/${outra.produto.id}/variacoes/${ids.g}`,
        )
        .send({ sku: "CAM-LON-P" });
      // A variação G não é do produto "Regata": o endereço não a alcança.
      expect(troca.status).toBe(404);

      const trocaNoMesmoProduto = await request(painel)
        .patch(
          `/v1/lojas/${loja.apelido}/catalogo/produtos/${grade.produto.id}/variacoes/${ids.g}`,
        )
        .send({ sku: "CAM-LON-P" });
      expect(trocaNoMesmoProduto.status).toBe(409);
      expect(trocaNoMesmoProduto.body).toEqual({ erro: "sku_duplicado" });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-316 o código é opcional: variações sem código convivem sem se acusarem de repetidas",
    async () => {
      const grade = await camisetaComTamanhos("Camiseta Lisa");

      const semCodigoP = await cadastrarVariacao(grade, grade.p, { sku: null });
      const semCodigoM = await cadastrarVariacao(grade, grade.m, { sku: null });

      expect(semCodigoP.status).toBe(201);
      expect(semCodigoM.status).toBe(201);
      expect(semCodigoP.body.sku).toBeNull();
      expect(semCodigoM.body.sku).toBeNull();
    },
    ESPERA_LONGA,
  );
});
