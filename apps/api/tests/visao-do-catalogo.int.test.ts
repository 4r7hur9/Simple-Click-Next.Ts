/**
 * Card #52 — a visão geral do catálogo (Estoque, Variações, Opções) e o
 * "avisar abaixo de" do produto inteiro, contra o banco real com o
 * isolamento por linha ligado.
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

import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import { appDoDono, type DonoDeTeste } from "./apoio-do-catalogo.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { criarRotasDoEstoque } from "../src/modules/catalog/estoque.routes.ts";
import { criarRotasDasVariacoes } from "../src/modules/catalog/variacoes.routes.ts";
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

interface Variacao {
  readonly id: string;
  readonly nome: string;
  readonly precoCentavos: number | null;
  readonly quantidade: number | null;
  readonly minimoAlerta: number | null;
  readonly estoqueBaixo: boolean;
}

describe("visão geral do catálogo (card #52)", () => {
  it(
    "traz todos os produtos com variações, saldo, preço e grupos; o alerta vale para o produto inteiro",
    async () => {
      const loja = await criarLoja({ ramo: "roupas", nome: "Visão Geral" });
      const membro = await criarMembro({ loja });
      const dono: DonoDeTeste = {
        identidadeId: membro.identidade.id,
        papel: "OWNER",
      };
      const rotas = {
        acesso,
        resolverLoja: identificarLoja,
        autenticar: () => dono,
      };
      const painel = appDoDono(
        criarRotasDasVariacoes(rotas),
        criarRotasDoEstoque(rotas),
        criarRotasDaVisaoGeral(rotas),
      );

      const produto = await criarProduto({ loja, nome: "Camiseta" });
      const categoria = await criarCategoria({ loja, nome: "Roupas" });
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

      const base = `/v1/lojas/${loja.apelido}/catalogo/produtos/${produto.id}`;
      for (const [opcao, estoque] of [
        [p, 2],
        [m, 9],
      ] as const) {
        const criada = await request(painel)
          .post(`${base}/variacoes`)
          .send({
            nome: opcao.nome,
            sku: null,
            codigoDeBarras: null,
            precoCentavos: 4990,
            estoque,
            estoqueMinimo: null,
            pesoGramas: null,
            padrao: false,
            disponivel: true,
            combinacoes: [{ grupoId: tamanho.id, opcaoId: opcao.id }],
          });
        expect(criada.status).toBe(201);
      }

      const alerta = await request(painel)
        .put(`${base}/estoque/alerta`)
        .send({ minimoAlerta: 3 });
      expect(alerta.status).toBe(200);
      expect(alerta.body.variacoesAtualizadas).toBeGreaterThanOrEqual(2);

      const visao = await request(painel).get(
        `/v1/lojas/${loja.apelido}/catalogo/visao-geral`,
      );
      expect(visao.status).toBe(200);
      const achado = (
        visao.body.produtos as {
          id: string;
          categoriaNome: string | null;
          variacoes: Variacao[];
          grupos: {
            nome: string;
            eixoDeVariacao: boolean;
            opcoes: unknown[];
          }[];
        }[]
      ).find((linha) => linha.id === produto.id);
      expect(achado?.categoriaNome).toBe("Roupas");
      const porNome = new Map(achado?.variacoes.map((v) => [v.nome, v]));
      expect(porNome.get("P")).toMatchObject({
        precoCentavos: 4990,
        quantidade: 2,
        minimoAlerta: 3,
        estoqueBaixo: true,
      });
      expect(porNome.get("M")).toMatchObject({
        quantidade: 9,
        minimoAlerta: 3,
        estoqueBaixo: false,
      });
      expect(achado?.grupos).toEqual([
        expect.objectContaining({
          nome: "Tamanho",
          eixoDeVariacao: true,
          opcoes: expect.arrayContaining([
            expect.objectContaining({ nome: "P" }),
          ]),
        }),
      ]);

      // Nulo desliga o aviso.
      await request(painel)
        .put(`${base}/estoque/alerta`)
        .send({ minimoAlerta: null })
        .expect(200);
      const depois = await request(painel).get(
        `/v1/lojas/${loja.apelido}/catalogo/visao-geral`,
      );
      const semAviso = (
        depois.body.produtos as { id: string; variacoes: Variacao[] }[]
      ).find((linha) => linha.id === produto.id);
      expect(semAviso?.variacoes.every((v) => !v.estoqueBaixo)).toBe(true);

      await request(painel)
        .put(`${base}/estoque/alerta`)
        .send({ minimoAlerta: -1 })
        .expect(400);
    },
    ESPERA_LONGA,
  );
});
