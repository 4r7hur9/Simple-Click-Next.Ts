/**
 * Apoio das provas do painel do catálogo (T-300 em diante).
 *
 * Monta, sobre o banco descartável do arquivo, as MESMAS rotas que `app.ts`
 * monta — gestão do dono e vitrine pública — com duas trocas só: o acesso ao
 * banco é o do arquivo de teste, e a autenticação devolve o dono que a prova
 * criou. Todo o resto é o caminho real: validação de borda, contexto da
 * requisição, transação com a loja gravada e isolamento por linha ligado.
 *
 * A PROVA PASSA PELA VITRINE DE VERDADE. "Aparece na vitrine" é afirmação sobre
 * o endereço que o cliente abre, e é esse endereço que a prova consulta — ler o
 * banco direto provaria o que o dono gravou, não o que o cliente vê.
 */
import express, { type Express } from "express";
import request from "supertest";
import { expect } from "vitest";

import {
  criarIdentidade,
  criarLoja,
  criarMembro,
  type LojaDeTeste,
} from "@simpleclick/testing";

import { criarRotasDasCategorias } from "../src/modules/catalog/categorias.routes.ts";
import { criarRotasDosProdutos } from "../src/modules/catalog/produtos.routes.ts";
import { criarRotasDasEspecificacoes } from "../src/modules/catalog/especificacoes.routes.ts";
import { manipuladorDeErros } from "../src/core/erros.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { horarioDaLoja } from "../src/modules/stores/horarios.usecase.ts";
import { identificarLoja } from "../src/modules/storefront/resolver-loja.usecase.ts";
import {
  criarRotasDaVitrine,
  PREFIXO_DA_VITRINE,
} from "../src/modules/storefront/vitrine.routes.ts";

/** Quem está logado no painel durante a prova. */
export interface DonoDaProva {
  readonly identidadeId: string;
}

/**
 * A aplicação da prova: painel do dono em `/v1/lojas` e vitrine pública.
 *
 * `dono` nulo simula quem chega sem sessão — é o que prova que a rota do
 * painel não responde a qualquer um.
 */
export function montarPainelDaProva(
  acesso: AcessoAoBanco,
  dono: DonoDaProva | null,
): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const autenticar = () =>
    dono === null
      ? null
      : { identidadeId: dono.identidadeId, papel: "OWNER" as const };

  app.use(
    "/v1/lojas",
    criarRotasDasCategorias({
      acesso,
      autenticar,
      resolverLoja: identificarLoja,
    }),
  );
  app.use(
    "/v1/lojas",
    criarRotasDosProdutos({
      acesso,
      autenticar,
      resolverLoja: identificarLoja,
    }),
  );
  app.use(
    "/v1/lojas",
    criarRotasDasEspecificacoes({
      acesso,
      autenticar,
      resolverLoja: identificarLoja,
    }),
  );
  app.use(
    PREFIXO_DA_VITRINE,
    criarRotasDaVitrine({ acesso, lerHorario: horarioDaLoja }),
  );
  app.use(manipuladorDeErros());
  return app;
}

// ---------------------------------------------------------------------------
// Atalhos das provas: o dono faz pelo painel o que faria na tela
// ---------------------------------------------------------------------------

/** Uma loja nova, com o dono membro dela e logado no painel. */
export async function lojaComDonoNoPainel(acesso: AcessoAoBanco) {
  const loja = await criarLoja();
  const identidade = await criarIdentidade();
  await criarMembro({ loja, identidade });
  const app = montarPainelDaProva(acesso, { identidadeId: identidade.id });
  return { loja, app, identidade };
}

/** O endereço de uma rota do painel do catálogo da loja. */
export function caminhoDoPainel(loja: LojaDeTeste, resto: string): string {
  return `/v1/lojas/${loja.apelido}/catalogo/${resto}`;
}

/** Cria a categoria pelo painel e devolve o que a rota respondeu. */
export async function criarCategoriaPeloPainel(
  app: Express,
  loja: LojaDeTeste,
  nome: string,
): Promise<{ readonly id: string; readonly nome: string }> {
  const resposta = await request(app)
    .post(caminhoDoPainel(loja, "categorias"))
    .send({ nome, descricao: null, visivel: true });
  expect(resposta.status).toBe(201);
  return resposta.body as { readonly id: string; readonly nome: string };
}

/** Cadastra o produto pelo painel, publicado e à venda, salvo quando dito. */
export async function criarProdutoPeloPainel(
  app: Express,
  loja: LojaDeTeste,
  dados: {
    readonly categoriaId: string;
    readonly nome: string;
    readonly descricao?: string | null;
    readonly precoCentavos?: number;
    readonly status?: "DRAFT" | "PUBLISHED";
  },
): Promise<{ readonly id: string; readonly apelido: string }> {
  const resposta = await request(app)
    .post(caminhoDoPainel(loja, "produtos"))
    .send({
      nome: dados.nome,
      descricao: dados.descricao ?? null,
      categoriaId: dados.categoriaId,
      precoCentavos: dados.precoCentavos ?? 1_000,
      status: dados.status ?? "PUBLISHED",
      disponivel: true,
    });
  expect(resposta.status).toBe(201);
  return resposta.body as { readonly id: string; readonly apelido: string };
}

/** O catálogo como o cliente o recebe pelo endereço público, sem sessão. */
export async function catalogoPublico(
  app: Express,
  loja: LojaDeTeste,
  consulta = "",
) {
  const resposta = await request(app).get(
    `/v1/vitrine/${loja.apelido}/catalogo${consulta}`,
  );
  expect(resposta.status).toBe(200);
  return resposta.body as {
    readonly secoes: readonly {
      readonly nome: string;
      readonly apelido: string;
      readonly produtos: readonly {
        readonly id: string;
        readonly nome: string;
        readonly imagem: string | null;
      }[];
    }[];
    readonly versao: string;
    readonly filtros?: readonly {
      readonly chave: string;
      readonly nome: string;
      readonly valores: readonly string[];
    }[];
  };
}
