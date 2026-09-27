/**
 * Prova do filtro por especificação na vitrine (AC-328), contra banco de
 * verdade e pelo endereço público do catálogo.
 *
 * O dono monta a categoria Pneus com Aro (filtrável) e Marca (não
 * filtrável) pelo painel; a prova abre a vitrine como o cliente abriria e
 * confere o que vira filtro, o que o filtro deixa passar — e o que ele NÃO
 * deixa vazar: valor de produto em rascunho não aparece como opção.
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

async function especificacao(
  app: App,
  loja: LojaDeTeste,
  categoriaId: string,
  dados: {
    readonly nome: string;
    readonly tipo: "texto" | "lista";
    readonly filtravel: boolean;
    readonly opcoes?: readonly string[];
  },
): Promise<string> {
  const resposta = await request(app)
    .post(caminhoDoPainel(loja, `categorias/${categoriaId}/especificacoes`))
    .send({
      nome: dados.nome,
      tipo: dados.tipo,
      unidade: null,
      obrigatoria: false,
      filtravel: dados.filtravel,
      opcoes: dados.opcoes ?? [],
    });
  expect(resposta.status).toBe(201);
  return (resposta.body as { id: string }).id;
}

async function pneu(
  app: App,
  loja: LojaDeTeste,
  categoriaId: string,
  dados: {
    readonly nome: string;
    readonly valores: Record<string, string>;
    readonly status?: "DRAFT" | "PUBLISHED";
  },
): Promise<string> {
  const produto = await criarProdutoPeloPainel(app, loja, {
    categoriaId,
    nome: dados.nome,
    ...(dados.status === undefined ? {} : { status: dados.status }),
  });
  const preenchido = await request(app)
    .put(caminhoDoPainel(loja, `produtos/${produto.id}/especificacoes`))
    .send({ valores: dados.valores });
  expect(preenchido.status).toBe(200);
  return produto.id;
}

/** Pneus: dois de aro 15, um de aro 16, um rascunho de aro 13; e Rodas. */
async function autopeca() {
  const contexto = await lojaComDonoNoPainel(acesso);
  const { app, loja } = contexto;
  const pneus = await criarCategoriaPeloPainel(app, loja, "Pneus");
  const rodas = await criarCategoriaPeloPainel(app, loja, "Rodas");
  const aro = await especificacao(app, loja, pneus.id, {
    nome: "Aro",
    tipo: "lista",
    filtravel: true,
    opcoes: ["13", "14", "15", "16"],
  });
  const marca = await especificacao(app, loja, pneus.id, {
    nome: "Marca",
    tipo: "texto",
    filtravel: false,
  });
  const furacao = await especificacao(app, loja, rodas.id, {
    nome: "Furação",
    tipo: "texto",
    filtravel: true,
  });
  await pneu(app, loja, pneus.id, {
    nome: "Pneu A",
    valores: { [aro]: "15", [marca]: "Pirelli" },
  });
  await pneu(app, loja, pneus.id, {
    nome: "Pneu B",
    valores: { [aro]: "16", [marca]: "Michelin" },
  });
  await pneu(app, loja, pneus.id, {
    nome: "Pneu C",
    valores: { [aro]: "15", [marca]: "Michelin" },
  });
  await pneu(app, loja, pneus.id, {
    nome: "Pneu de lançamento",
    valores: { [aro]: "13" },
    status: "DRAFT",
  });
  await pneu(app, loja, rodas.id, {
    nome: "Roda de liga",
    valores: { [furacao]: "4x100" },
  });
  return contexto;
}

function nomesDaSecao(
  catalogo: Awaited<ReturnType<typeof catalogoPublico>>,
  nome: string,
): string[] {
  return (
    catalogo.secoes
      .find((secao) => secao.nome === nome)
      ?.produtos.map((produto) => produto.nome)
      .sort() ?? []
  );
}

describe("especificação filtrável vira filtro na vitrine (AC-328)", () => {
  it(
    "@spec:AC-328 na categoria Pneus o cliente pode filtrar por Aro, e só por ela",
    async () => {
      const { app, loja } = await autopeca();

      const catalogo = await catalogoPublico(app, loja, "?categoria=pneus");

      // Marca não é filtrável; Furação é de outra categoria; o 13 é de um
      // rascunho, que o cliente não vê — e por isso não vira opção.
      expect(catalogo.filtros).toEqual([
        { chave: "aro", nome: "Aro", valores: ["15", "16"] },
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-328 escolhido o Aro 15, aparecem só os pneus de aro 15",
    async () => {
      const { app, loja } = await autopeca();

      const filtrado = await catalogoPublico(
        app,
        loja,
        "?categoria=pneus&filtro=aro%3D15",
      );

      expect(nomesDaSecao(filtrado, "Pneus")).toEqual(["Pneu A", "Pneu C"]);
      expect(filtrado.secoes.map((secao) => secao.nome)).toEqual(["Pneus"]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-328 especificação não filtrável não filtra nem pelo endereço",
    async () => {
      const { app, loja } = await autopeca();

      const tentativa = await catalogoPublico(
        app,
        loja,
        "?categoria=pneus&filtro=marca%3DPirelli",
      );

      // Ignorado: a vitrine sai inteira, e não vazia.
      expect(nomesDaSecao(tentativa, "Pneus")).toEqual([
        "Pneu A",
        "Pneu B",
        "Pneu C",
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-328 deixar de ser filtrável tira o filtro da vitrine na hora",
    async () => {
      const { app, loja } = await autopeca();
      const antes = await catalogoPublico(app, loja, "?categoria=pneus");
      expect(antes.filtros?.map((filtro) => filtro.chave)).toEqual(["aro"]);

      const lista = await request(app).get(caminhoDoPainel(loja, "categorias"));
      const pneus = (
        lista.body as { categorias: { id: string; nome: string }[] }
      ).categorias.find((categoria) => categoria.nome === "Pneus")!;
      const especificacoes = await request(app).get(
        caminhoDoPainel(loja, `categorias/${pneus.id}/especificacoes`),
      );
      const aro = (
        especificacoes.body as {
          especificacoes: { id: string; nome: string }[];
        }
      ).especificacoes.find((item) => item.nome === "Aro")!;
      const desligada = await request(app)
        .patch(
          caminhoDoPainel(
            loja,
            `categorias/${pneus.id}/especificacoes/${aro.id}`,
          ),
        )
        .send({ filtravel: false });
      expect(desligada.status).toBe(200);

      const depois = await catalogoPublico(app, loja, "?categoria=pneus");
      expect(depois.filtros).toEqual([]);
    },
    ESPERA_LONGA,
  );
});
