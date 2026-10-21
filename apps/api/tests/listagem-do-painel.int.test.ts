/**
 * Card #76 — as listas do catálogo no painel paginadas no banco: produtos
 * (busca sem acento, filtros, ordem, total e atalhos), Estoque (linhas por
 * variação e os números do topo somados pelo SQL), Variações e Opções. Contra
 * o banco real, com o isolamento por linha ligado.
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
  criarVariacao,
  porGrupoNoProduto,
  porProdutoNaCategoria,
} from "@simpleclick/testing";

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import { appDoDono, type DonoDeTeste } from "./apoio-do-catalogo.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { criarRotasDosProdutos } from "../src/modules/catalog/produtos.routes.ts";
import { criarRotasDaVisaoGeral } from "../src/modules/catalog/visao-geral.routes.ts";
import { identificarLoja } from "../src/modules/storefront/resolver-loja.usecase.ts";

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

interface ProdutoDaLista {
  readonly id: string;
  readonly nome: string;
  readonly precoCentavos: number | null;
}

async function montarLoja() {
  const loja = await criarLoja({ ramo: "roupas", nome: "Lista Paginada" });
  const outra = await criarLoja({ ramo: "roupas", nome: "Vizinha" });
  const membro = await criarMembro({ loja });
  const dono: DonoDeTeste = {
    identidadeId: membro.identidade.id,
    papel: "OWNER",
  };
  const rotas = { acesso, resolverLoja: identificarLoja, autenticar: () => dono };
  const painel = appDoDono(
    criarRotasDosProdutos(rotas),
    criarRotasDaVisaoGeral(rotas),
  );

  const pecas = await criarCategoria({ loja, nome: "Peças" });
  // Doze produtos simples, com preço crescente e ordem invertida.
  const simples = [];
  for (let i = 1; i <= 12; i += 1) {
    const produto = await criarProduto({
      loja,
      nome: `Filtro de óleo ${String(i).padStart(2, "0")}`,
      precoCentavos: i * 100,
      ordem: 100 - i,
    });
    await porProdutoNaCategoria({ loja, produto, categoria: pecas });
    simples.push(produto);
  }
  const rascunho = await criarProduto({
    loja,
    nome: "Amortecedor dianteiro",
    precoCentavos: 25_000,
    status: "DRAFT",
  });
  await migrador.query(
    `UPDATE app.products
        SET attributes = '{"marca":"Cofap","codigoDoFornecedor":"AMX-77"}'
      WHERE id = $1`,
    [rascunho.id],
  );

  // Camiseta com grade: P esgotada, M no aviso, G folgada.
  const camiseta = await criarProduto({ loja, nome: "Camiseta Açaí", precoCentavos: 5000 });
  const p = await criarVariacao({ loja, produto: camiseta, nome: "P", estoque: 0, precoCentavos: 5000 });
  const m = await criarVariacao({ loja, produto: camiseta, nome: "M", estoque: 2, precoCentavos: 5000 });
  await criarVariacao({
    loja,
    produto: camiseta,
    nome: "G",
    estoque: 10,
    precoCentavos: 6000,
    precoPromocionalCentavos: 5500,
  });
  await migrador.query(
    `UPDATE app.product_variants SET stock_min_alert = 3, sku = 'CAM-' || name
      WHERE product_id = $1`,
    [camiseta.id],
  );

  // Pastel: só a variação padrão, sem controle de estoque, com borda.
  const pastel = await criarProduto({ loja, nome: "Pastel de carne", precoCentavos: 1200 });
  await criarVariacao({ loja, produto: pastel, nome: "Padrão", padrao: true, precoCentavos: 1200 });
  const borda = await criarGrupoDeEscolha({ loja, nome: "Borda recheada", minimo: 1, maximo: 1 });
  await porGrupoNoProduto({ loja, produto: pastel, grupo: borda });
  await criarOpcao({ loja, grupo: borda, nome: "Catupiry" });

  // A vizinha não pode aparecer em lista nenhuma.
  await criarProduto({ loja: outra, nome: "Filtro de óleo da vizinha" });

  return { loja, painel, pecas, simples, rascunho, camiseta, pastel, p, m };
}

describe("lista de produtos paginada (card #76)", () => {
  it(
    "pagina, conta, busca sem acento e por código, filtra e ordena no banco",
    async () => {
      const { loja, painel, pecas, rascunho, camiseta } = await montarLoja();
      const lista = (consulta: string) =>
        request(painel).get(`/v1/lojas/${loja.apelido}/catalogo/produtos?${consulta}`);

      // Sem parâmetro: a lista inteira, como antes (cadastro e feed usam).
      const inteira = await request(painel).get(
        `/v1/lojas/${loja.apelido}/catalogo/produtos`,
      );
      expect(inteira.status).toBe(200);
      expect(inteira.body.produtos).toHaveLength(15);
      expect(inteira.body.total).toBeUndefined();

      const primeira = await lista("pagina=1&porPagina=10");
      expect(primeira.status).toBe(200);
      expect(primeira.body).toMatchObject({
        pagina: 1,
        porPagina: 10,
        total: 15,
        totalDePaginas: 2,
        resumo: { todos: 15, estoqueBaixo: 1, comAtacado: 0 },
        marcas: ["Cofap"],
      });
      expect(primeira.body.produtos).toHaveLength(10);
      expect(primeira.body.categorias).toEqual([
        { valor: pecas.id, rotulo: "Peças" },
        { valor: "sem", rotulo: "Sem categoria" },
      ]);
      const segunda = await lista("pagina=2&porPagina=10");
      expect(segunda.body.produtos).toHaveLength(5);
      const ids = new Set(
        [...primeira.body.produtos, ...segunda.body.produtos].map(
          (produto: ProdutoDaLista) => produto.id,
        ),
      );
      expect(ids.size).toBe(15);

      // Ordem por preço, do maior: o amortecedor (R$ 250) primeiro.
      const caros = await lista("pagina=1&porPagina=10&ordem=preco-desc");
      const precos = caros.body.produtos.map((p: ProdutoDaLista) => p.precoCentavos);
      expect(precos[0]).toBe(25_000);
      expect([...precos].sort((a, b) => b - a)).toEqual(precos);
      const baratos = await lista("pagina=1&porPagina=10&ordem=preco");
      expect(baratos.body.produtos[0].precoCentavos).toBe(100);

      // Busca: sem acento acha "Açaí"; pedaço do código acha o amortecedor.
      const acai = await lista("pagina=1&busca=acai");
      expect(acai.body.produtos.map((p: ProdutoDaLista) => p.id)).toEqual([
        camiseta.id,
      ]);
      const codigo = await lista("pagina=1&busca=amx-7");
      expect(codigo.body.produtos.map((p: ProdutoDaLista) => p.id)).toEqual([
        rascunho.id,
      ]);
      const sku = await lista("pagina=1&busca=cam-g");
      expect(sku.body.produtos.map((p: ProdutoDaLista) => p.id)).toEqual([
        camiseta.id,
      ]);
      // Caractere de expressão regular no termo não quebra nem casa tudo.
      const estranho = await lista("pagina=1&busca=(.*");
      expect(estranho.status).toBe(200);
      expect(estranho.body.total).toBe(0);
      // A vizinha nunca aparece.
      const oleo = await lista("pagina=1&busca=oleo&porPagina=50");
      expect(oleo.body.total).toBe(12);

      // Filtros.
      expect((await lista("pagina=1&situacao=rascunho")).body.total).toBe(1);
      expect((await lista("pagina=1&situacao=estoque-baixo")).body.produtos[0].id).toBe(
        camiseta.id,
      );
      expect((await lista("pagina=1&situacao=esgotado")).body.total).toBe(0);
      expect((await lista("pagina=1&marca=cofap")).body.total).toBe(1);
      expect((await lista(`pagina=1&categoria=${pecas.id}`)).body.total).toBe(12);
      expect((await lista("pagina=1&categoria=sem")).body.total).toBe(3);

      // Página depois do fim: vazia, mas com o total certo.
      const alem = await lista("pagina=9&porPagina=10");
      expect(alem.body.produtos).toEqual([]);
      expect(alem.body.total).toBe(15);
      // Consulta torta cai no padrão, sem 400.
      const torta = await lista("pagina=-3&porPagina=9999&ordem=xyz&situacao=zzz");
      expect(torta.status).toBe(200);
      expect(torta.body).toMatchObject({ pagina: 1, porPagina: 50, total: 15 });
    },
    ESPERA_LONGA,
  );
});

describe("Estoque, Variações e Opções paginados (card #76)", () => {
  it(
    "o estoque vem por linha, com os números do topo somados no banco",
    async () => {
      const { loja, painel, camiseta, p, m } = await montarLoja();
      const estoque = (consulta: string) =>
        request(painel).get(
          `/v1/lojas/${loja.apelido}/catalogo/visao-geral?recorte=estoque&${consulta}`,
        );

      const tudo = await estoque("porPagina=10");
      expect(tudo.status).toBe(200);
      // 12 simples + amortecedor (sem variação) + 3 da camiseta + 1 do pastel.
      expect(tudo.body).toMatchObject({ total: 17, totalDaLoja: 17, totalDePaginas: 2 });
      expect(tudo.body.linhas).toHaveLength(10);
      // O que precisa de atenção primeiro: a P em falta, depois a M baixa.
      expect(tudo.body.linhas.slice(0, 2)).toEqual([
        { produtoId: camiseta.id, variacaoId: p.id, unica: false, situacao: "falta" },
        { produtoId: camiseta.id, variacaoId: m.id, unica: false, situacao: "baixo" },
      ]);
      // Os produtos da página vêm junto, na forma da visão geral.
      expect(tudo.body.produtos.some((produto: { id: string }) => produto.id === camiseta.id)).toBe(true);
      // Unidades: 0 + 2 + 10; valor: 2 × 50 + 10 × 55 (a promoção vale).
      expect(tudo.body.indicadores).toEqual({
        emFalta: 1,
        estoqueBaixo: 1,
        totalDeItens: 12,
        valorEstimadoCentavos: 2 * 5000 + 10 * 5500,
      });

      const busca = await estoque("busca=acai%20g");
      expect(busca.body.linhas.map((l: { situacao: string }) => l.situacao)).toEqual([
        "normal",
      ]);
      const semControle = await estoque("situacao=sem-controle&porPagina=50");
      expect(semControle.body.total).toBe(14);
      // O filtro não muda os números da loja.
      expect(semControle.body.indicadores.totalDeItens).toBe(12);
      const maior = await estoque("ordem=maior-estoque");
      expect(maior.body.linhas[0].situacao).toBe("normal");
    },
    ESPERA_LONGA,
  );

  it(
    "variações e opções paginam por produto, com os próprios números",
    async () => {
      const { loja, painel, camiseta, pastel } = await montarLoja();
      const visao = (consulta: string) =>
        request(painel).get(`/v1/lojas/${loja.apelido}/catalogo/visao-geral?${consulta}`);

      const variacoes = await visao("recorte=variacoes");
      expect(variacoes.status).toBe(200);
      expect(variacoes.body.produtos.map((p: { id: string }) => p.id)).toEqual([camiseta.id]);
      expect(variacoes.body).toMatchObject({ total: 1, totalDaLoja: 15 });
      expect(variacoes.body.indicadores).toEqual({
        produtosComVariacoes: 1,
        variacoesCadastradas: 3,
        variacoesEmFalta: 1,
        produtosSemVariacoes: 14,
      });
      expect((await visao("recorte=variacoes&mostrar=sem")).body.total).toBe(14);
      expect((await visao("recorte=variacoes&mostrar=todos&busca=cam-m")).body.total).toBe(1);

      const opcoes = await visao("recorte=opcoes");
      expect(opcoes.body.produtos.map((p: { id: string }) => p.id)).toEqual([pastel.id]);
      expect(opcoes.body.indicadores).toEqual({
        produtosComOpcoes: 1,
        gruposDeOpcoes: 1,
        gruposObrigatorios: 1,
        opcoesCadastradas: 1,
      });
      expect((await visao("recorte=opcoes&busca=catupiry")).body.total).toBe(1);
      expect((await visao("recorte=opcoes&tipo=INGREDIENT")).body.total).toBe(0);

      // Sem recorte, a forma antiga e inteira continua.
      const inteira = await visao("");
      expect(inteira.body.produtos).toHaveLength(15);
      expect(inteira.body.total).toBeUndefined();
    },
    ESPERA_LONGA,
  );
});
