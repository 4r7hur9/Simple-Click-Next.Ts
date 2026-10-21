/**
 * Card #54 — cadastro das faixas de atacado no painel, contra o banco.
 *
 * O dono lê e regrava a lista inteira pela rota `/atacado` do produto, ou
 * junto com o cadastro do produto (`faixasDeAtacado`). As travas do card #53
 * valem no servidor; a faixa é do produto e aparece, já em preço, em cada
 * variação; a rota genérica dos preços não enxerga a faixa; e a loja vizinha
 * não lê nem grava as faixas de outra.
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
import { appDoDono, type DonoDeTeste } from "./apoio-do-catalogo.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { criarRotasDosPrecos } from "../src/modules/catalog/precos.routes.ts";
import { criarRotasDosProdutos } from "../src/modules/catalog/produtos.routes.ts";
import { criarRotasDasVariacoes } from "../src/modules/catalog/variacoes.routes.ts";
import { identificarLoja } from "../src/modules/storefront/resolver-loja.usecase.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let painel: ReturnType<typeof appDoDono>;
let loja: LojaDeTeste;
let vizinha: LojaDeTeste;
let categoria: CategoriaDeTeste;
let dono: DonoDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });

  loja = await criarLoja({ nome: "Distribuidora do Atacado" });
  vizinha = await criarLoja({ nome: "Mercearia Vizinha" });
  const membro = await criarMembro({ loja });
  dono = { identidadeId: membro.identidade.id, papel: "OWNER" };
  categoria = await criarCategoria({ loja, nome: "Bebidas" });

  const opcoes = {
    acesso,
    resolverLoja: identificarLoja,
    autenticar: () => dono,
  };
  painel = appDoDono(
    criarRotasDosPrecos(opcoes),
    criarRotasDosProdutos(opcoes),
    criarRotasDasVariacoes(opcoes),
  );
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

async function produtoDe(
  nome: string,
  precoCentavos: number,
): Promise<ProdutoDeTeste> {
  const produto = await criarProduto({ loja, nome, precoCentavos });
  await porProdutoNaCategoria({ loja, produto, categoria });
  return produto;
}

const caminho = (produtoId: string, apelido = loja.apelido) =>
  `/v1/lojas/${apelido}/catalogo/produtos/${produtoId}`;

function salvarFaixas(produtoId: string, faixas: unknown[], apelido?: string) {
  return request(painel)
    .put(`${caminho(produtoId, apelido)}/atacado`)
    .send({ faixas });
}

const crescente = [
  { quantidadeMinima: 50, tipoDeDesconto: "PERCENTUAL", desconto: 10 },
  { quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 5 },
  {
    quantidadeMinima: 100,
    tipoDeDesconto: "PERCENTUAL",
    desconto: 15,
    rotulo: "Palete",
  },
];

/** As faixas como estão no banco, sem passar pela API. */
async function faixasNoBanco(produtoId: string) {
  const linhas = await migrador.query<{
    min_quantity: number;
    discount_kind: string;
    discount_value: string;
    amount_cents: string;
    variant_id: string | null;
  }>(
    `SELECT min_quantity, discount_kind, discount_value, amount_cents, variant_id
       FROM app.product_prices
      WHERE product_id = $1 AND kind = 'WHOLESALE'
      ORDER BY min_quantity`,
    [produtoId],
  );
  return linhas.rows;
}

describe("rota /atacado do produto", () => {
  it(
    "grava faixas crescentes, devolve em ordem e com o preço de cada uma",
    async () => {
      const agua = await produtoDe("Água mineral", 2000);

      const salvo = await salvarFaixas(agua.id, crescente);
      expect(salvo.status).toBe(200);
      expect(salvo.body.precoDeVarejoCentavos).toBe(2000);
      expect(
        salvo.body.faixas.map(
          (f: { quantidadeMinima: number; desconto: number }) => [
            f.quantidadeMinima,
            f.desconto,
          ],
        ),
      ).toEqual([
        [10, 5],
        [50, 10],
        [100, 15],
      ]);
      expect(salvo.body.faixas[2].rotulo).toBe("Palete");
      expect(salvo.body.atacado.pedidoMinimo).toBe(10);
      expect(
        salvo.body.atacado.faixas.map(
          (f: { unitarioCentavos: number }) => f.unitarioCentavos,
        ),
      ).toEqual([1900, 1800, 1700]);

      const lido = await request(painel).get(`${caminho(agua.id)}/atacado`);
      expect(lido.status).toBe(200);
      expect(lido.body).toEqual(salvo.body);

      // No banco: faixas do produto, sem preço próprio.
      const banco = await faixasNoBanco(agua.id);
      expect(banco).toHaveLength(3);
      for (const linha of banco) {
        expect(linha.discount_kind).toBe("PERCENT");
        expect(linha.amount_cents).toBe("0");
        expect(linha.variant_id).toBeNull();
      }
    },
    ESPERA_LONGA,
  );

  it(
    "faixa única é uma lista de um item; regravar troca tudo; lista vazia apaga",
    async () => {
      const refri = await produtoDe("Refrigerante", 800);
      await salvarFaixas(refri.id, crescente);

      const unica = await salvarFaixas(refri.id, [
        { quantidadeMinima: 12, tipoDeDesconto: "VALOR", desconto: 100 },
      ]);
      expect(unica.status).toBe(200);
      expect(unica.body.faixas).toHaveLength(1);
      expect(unica.body.atacado.faixas[0].unitarioCentavos).toBe(700);

      const vazia = await salvarFaixas(refri.id, []);
      expect(vazia.status).toBe(200);
      expect(vazia.body).toMatchObject({ faixas: [], atacado: null });
      const semAtacado = await request(painel).get(
        `/v1/lojas/${loja.apelido}/catalogo/produtos`,
      );
      expect(
        (
          semAtacado.body.produtos as {
            id: string;
            pedidoMinimoDeAtacado: number | null;
          }[]
        ).find((p) => p.id === refri.id)?.pedidoMinimoDeAtacado,
      ).toBeNull();
      expect(await faixasNoBanco(refri.id)).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "recusa com 422 e aponta a linha: quantidade repetida, desconto que não cresce, reais acima do preço",
    async () => {
      const suco = await produtoDe("Suco", 500);
      await salvarFaixas(suco.id, [
        { quantidadeMinima: 6, tipoDeDesconto: "PERCENTUAL", desconto: 5 },
      ]);

      const repetida = await salvarFaixas(suco.id, [
        { quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 5 },
        { quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 8 },
      ]);
      expect(repetida.status).toBe(422);
      expect(repetida.body).toEqual({
        erro: "faixas_invalidas",
        problemas: [
          { indice: 1, mensagem: "Já existe uma faixa com essa quantidade." },
        ],
      });

      const decrescente = await salvarFaixas(suco.id, [
        { quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 10 },
        { quantidadeMinima: 20, tipoDeDesconto: "PERCENTUAL", desconto: 5 },
      ]);
      expect(decrescente.status).toBe(422);
      expect(decrescente.body.problemas[0].indice).toBe(1);

      const caro = await salvarFaixas(suco.id, [
        { quantidadeMinima: 10, tipoDeDesconto: "VALOR", desconto: 500 },
      ]);
      expect(caro.status).toBe(422);
      expect(caro.body.problemas[0].mensagem).toBe(
        "O desconto em reais precisa ser menor que o preço do produto.",
      );

      // Nada mudou: a faixa de antes continua lá.
      const banco = await faixasNoBanco(suco.id);
      expect(banco.map((l) => l.min_quantity)).toEqual([6]);
    },
    ESPERA_LONGA,
  );

  it(
    "corpo fora do formato é 400; produto de outra loja é 404 e não é tocado",
    async () => {
      const cha = await produtoDe("Chá gelado", 900);
      expect(
        (
          await request(painel)
            .put(`${caminho(cha.id)}/atacado`)
            .send([])
        ).status,
      ).toBe(400);

      const deFora = await criarProduto({
        loja: vizinha,
        nome: "Produto da vizinha",
        precoCentavos: 1000,
      });
      const pelaMinhaLoja = await salvarFaixas(deFora.id, crescente);
      expect(pelaMinhaLoja.status).toBe(404);
      expect(
        (await request(painel).get(`${caminho(deFora.id)}/atacado`)).status,
      ).toBe(404);
      expect(await faixasNoBanco(deFora.id)).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "a rota genérica dos preços não lista nem altera as faixas",
    async () => {
      const cafe = await produtoDe("Café", 1500);
      const salvo = await salvarFaixas(cafe.id, [
        { quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 5 },
      ]);
      const faixaId = salvo.body.faixas[0].id as string;

      const lista = await request(painel).get(`${caminho(cafe.id)}/precos`);
      expect(lista.status).toBe(200);
      expect(
        (lista.body.precos as { id: string; tipo: string }[]).map(
          (p) => p.tipo,
        ),
      ).toEqual(["BASE"]);

      const alterado = await request(painel)
        .patch(`${caminho(cafe.id)}/precos/${faixaId}`)
        .send({ valorCentavos: 100 });
      expect(alterado.status).toBe(404);
      const apagado = await request(painel).delete(
        `${caminho(cafe.id)}/precos/${faixaId}`,
      );
      expect(apagado.status).toBe(404);
      expect(await faixasNoBanco(cafe.id)).toHaveLength(1);
    },
    ESPERA_LONGA,
  );
});

describe("faixas no cadastro do produto", () => {
  it(
    "cria com faixas, lista com faixas, edita só as faixas e duplica levando as faixas",
    async () => {
      const criado = await request(painel)
        .post(`/v1/lojas/${loja.apelido}/catalogo/produtos`)
        .send({
          nome: "Cerveja lata",
          descricao: null,
          categoriaId: categoria.id,
          precoCentavos: 450,
          status: "PUBLISHED",
          disponivel: true,
          faixasDeAtacado: [
            { quantidadeMinima: 12, tipoDeDesconto: "VALOR", desconto: 50 },
            { quantidadeMinima: 24, tipoDeDesconto: "VALOR", desconto: 80 },
          ],
        });
      expect(criado.status).toBe(201);
      expect(criado.body.faixasDeAtacado).toHaveLength(2);
      const id = criado.body.id as string;

      const lista = await request(painel).get(
        `/v1/lojas/${loja.apelido}/catalogo/produtos`,
      );
      const naLista = (
        lista.body.produtos as { id: string; faixasDeAtacado: unknown[] }[]
      ).find((p) => p.id === id);
      expect(naLista?.faixasDeAtacado).toHaveLength(2);
      expect(criado.body.pedidoMinimoDeAtacado).toBe(12);
      expect(
        (
          lista.body.produtos as {
            id: string;
            pedidoMinimoDeAtacado: unknown;
          }[]
        ).find((p) => p.id === id)?.pedidoMinimoDeAtacado,
      ).toBe(12);

      const editado = await request(painel)
        .patch(caminho(id))
        .send({
          faixasDeAtacado: [
            { quantidadeMinima: 6, tipoDeDesconto: "PERCENTUAL", desconto: 3 },
          ],
        });
      expect(editado.status).toBe(200);
      expect(editado.body.pedidoMinimoDeAtacado).toBe(6);
      expect(editado.body.faixasDeAtacado).toEqual([
        expect.objectContaining({
          quantidadeMinima: 6,
          tipoDeDesconto: "PERCENTUAL",
          desconto: 3,
          ativo: true,
        }),
      ]);

      const duplicado = await request(painel).post(`${caminho(id)}/duplicar`);
      expect(duplicado.status).toBe(201);
      expect(duplicado.body.faixasDeAtacado).toEqual([
        expect.objectContaining({ quantidadeMinima: 6, desconto: 3 }),
      ]);
      expect(await faixasNoBanco(duplicado.body.id)).toHaveLength(1);
      // As linhas são novas: apagar as da duplicata não mexe no original.
      await salvarFaixas(duplicado.body.id, []);
      expect(await faixasNoBanco(id)).toHaveLength(1);
    },
    ESPERA_LONGA,
  );

  it(
    "faixa inválida no cadastro é 422 e o produto não nasce",
    async () => {
      const recusado = await request(painel)
        .post(`/v1/lojas/${loja.apelido}/catalogo/produtos`)
        .send({
          nome: "Produto recusado pelo atacado",
          descricao: null,
          categoriaId: categoria.id,
          precoCentavos: 300,
          status: "DRAFT",
          disponivel: true,
          faixasDeAtacado: [
            { quantidadeMinima: 10, tipoDeDesconto: "VALOR", desconto: 300 },
          ],
        });
      expect(recusado.status).toBe(422);
      expect(recusado.body.erro).toBe("faixas_invalidas");
      const contagem = await migrador.query<{ n: string }>(
        `SELECT count(*) AS n FROM app.products WHERE name = $1`,
        ["Produto recusado pelo atacado"],
      );
      expect(contagem.rows[0]?.n).toBe("0");
    },
    ESPERA_LONGA,
  );

  it(
    "baixar o preço abaixo de um desconto em reais é recusado; preço que comporta passa",
    async () => {
      const biscoito = await produtoDe("Biscoito", 600);
      await salvarFaixas(biscoito.id, [
        { quantidadeMinima: 10, tipoDeDesconto: "VALOR", desconto: 200 },
      ]);

      const barato = await request(painel)
        .patch(caminho(biscoito.id))
        .send({ precoCentavos: 200 });
      expect(barato.status).toBe(422);
      expect(barato.body.problemas[0].mensagem).toBe(
        "O desconto em reais precisa ser menor que o preço do produto.",
      );

      const certo = await request(painel)
        .patch(caminho(biscoito.id))
        .send({ precoCentavos: 500 });
      expect(certo.status).toBe(200);
      expect(certo.body.precoCentavos).toBe(500);

      // Trocar o preço e as faixas juntos confere as faixas contra o preço novo.
      const juntos = await request(painel)
        .patch(caminho(biscoito.id))
        .send({
          precoCentavos: 150,
          faixasDeAtacado: [
            { quantidadeMinima: 10, tipoDeDesconto: "VALOR", desconto: 100 },
          ],
        });
      expect(juntos.status).toBe(200);
      expect(juntos.body.faixasDeAtacado[0].desconto).toBe(100);
    },
    ESPERA_LONGA,
  );
});

describe("faixas e variações", () => {
  function cadastrarVariacao(
    produto: ProdutoDeTeste,
    nome: string,
    precoCentavos: number | null,
  ) {
    return request(painel)
      .post(`${caminho(produto.id)}/variacoes`)
      .send({
        nome,
        sku: null,
        codigoDeBarras: null,
        precoCentavos,
        estoque: null,
        estoqueMinimo: null,
        pesoGramas: null,
        padrao: false,
        disponivel: true,
        combinacoes: [],
      });
  }

  it(
    "cada variação mostra o atacado sobre o próprio preço",
    async () => {
      const camiseta = await produtoDe("Camiseta", 4000);
      const p = await cadastrarVariacao(camiseta, "Camiseta P", 3000);
      const g = await cadastrarVariacao(camiseta, "Camiseta G", 5000);
      expect(p.status).toBe(201);
      expect(g.status).toBe(201);
      expect(p.body.atacado).toBeNull();

      await salvarFaixas(camiseta.id, [
        { quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 10 },
      ]);

      const lista = await request(painel).get(
        `${caminho(camiseta.id)}/variacoes`,
      );
      expect(lista.status).toBe(200);
      const porNome = new Map(
        (
          lista.body.variacoes as {
            nome: string;
            atacado: {
              pedidoMinimo: number;
              faixas: { unitarioCentavos: number }[];
            } | null;
          }[]
        ).map((v) => [v.nome, v.atacado]),
      );
      expect(porNome.get("Camiseta P")?.pedidoMinimo).toBe(10);
      expect(porNome.get("Camiseta P")?.faixas[0]?.unitarioCentavos).toBe(2700);
      expect(porNome.get("Camiseta G")?.faixas[0]?.unitarioCentavos).toBe(4500);
    },
    ESPERA_LONGA,
  );

  it(
    "variação com preço menor ou igual ao desconto em reais é recusada",
    async () => {
      const bermuda = await produtoDe("Bermuda", 5000);
      const m = await cadastrarVariacao(bermuda, "Bermuda M", 5000);
      await salvarFaixas(bermuda.id, [
        { quantidadeMinima: 5, tipoDeDesconto: "VALOR", desconto: 1000 },
      ]);

      const barata = await request(painel)
        .patch(`${caminho(bermuda.id)}/variacoes/${m.body.id}`)
        .send({ precoCentavos: 1000 });
      expect(barata.status).toBe(422);
      expect(barata.body.erro).toBe("faixas_invalidas");

      const nova = await cadastrarVariacao(bermuda, "Bermuda PP", 900);
      expect(nova.status).toBe(422);

      const certa = await request(painel)
        .patch(`${caminho(bermuda.id)}/variacoes/${m.body.id}`)
        .send({ precoCentavos: 4000 });
      expect(certa.status).toBe(200);
      expect(certa.body.atacado.faixas[0].unitarioCentavos).toBe(3000);
    },
    ESPERA_LONGA,
  );
});
