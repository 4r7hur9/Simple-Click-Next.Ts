/**
 * Prova da feature flag do próximo preço de ponta a ponta (card #140).
 *
 * Desligada (o padrão do `criarApp`), a página pública do produto é a de
 * sempre: a CHAVE `proximoPreco` nem existe. Ligada, ela anuncia só a próxima
 * QUEDA de preço dos próximos 7 dias — aumento agendado nunca sai. Nos dois
 * estados a resposta é conferida contra o OpenAPI publicado e contra o esquema
 * do contrato (o site valida estrito).
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { esquemaDoProduto } from "@simpleclick/contracts";
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

import {
  lerOpenApi,
  problemasDaResposta,
  type DocumentoOpenApi,
} from "./apoio-de-contrato.ts";
import { abrirAcessoDaAplicacao, ESPERA_LONGA } from "./apoio-de-isolamento.ts";
import {
  appDoDono,
  lojaQueVende,
  ORIGEM,
  type DonoDeTeste,
} from "./apoio-do-catalogo.ts";
import { criarApp } from "../src/app.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { flagsFixas } from "../src/core/flags.ts";
import { criarRotasDosPrecos } from "../src/modules/catalog/precos.routes.ts";
import { identificarLoja } from "../src/modules/storefront/resolver-loja.usecase.ts";

const CAMINHO = "/v1/vitrine/{apelido}/produto/{produtoId}";
const DIA = 24 * 60 * 60 * 1000;

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let desligada: ReturnType<typeof criarApp>;
let ligada: ReturnType<typeof criarApp>;
let painel: ReturnType<typeof appDoDono>;
let loja: LojaDeTeste;
let outraLoja: LojaDeTeste;
let categoria: CategoriaDeTeste;
let dono: DonoDeTeste;
let doc: DocumentoOpenApi;

beforeAll(async () => {
  doc = lerOpenApi();
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  // Sem `flags`: o padrão do app, tudo desligado.
  desligada = criarApp({ origens: [ORIGEM], vitrine: { acesso } });
  ligada = criarApp({
    origens: [ORIGEM],
    vitrine: { acesso },
    flags: flagsFixas({ "vitrine.proximo_preco": true }),
  });

  loja = await criarLoja({ nome: "Pastelaria do Próximo Preço" });
  outraLoja = await criarLoja({ nome: "Outra Loja do Próximo Preço" });
  const membro = await criarMembro({ loja });
  dono = { identidadeId: membro.identidade.id, papel: "OWNER" };
  categoria = await criarCategoria({ loja, nome: "Pastéis" });
  await lojaQueVende(migrador, loja);
  await lojaQueVende(migrador, outraLoja);

  painel = appDoDono(
    criarRotasDosPrecos({
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

async function produtoComBase(nome: string): Promise<ProdutoDeTeste> {
  const produto = await criarProduto({ loja, nome, precoCentavos: 2000 });
  await porProdutoNaCategoria({ loja, produto, categoria });
  return produto;
}

function cadastrar(produto: ProdutoDeTeste, preco: Record<string, unknown>) {
  return request(painel)
    .post(`/v1/lojas/${loja.apelido}/catalogo/produtos/${produto.id}/precos`)
    .send({
      tipo: "PROMO",
      rotulo: null,
      valorCentavos: 0,
      quantidadeMinima: 1,
      inicio: null,
      fim: null,
      ativo: true,
      ...preco,
    });
}

function pagina(app: ReturnType<typeof criarApp>, produto: ProdutoDeTeste) {
  return request(app).get(`/v1/vitrine/${loja.apelido}/produto/${produto.id}`);
}

/** A resposta confere com o OpenAPI publicado E com o esquema do contrato. */
function conforme(resposta: request.Response): void {
  expect(resposta.status, JSON.stringify(resposta.body)).toBe(200);
  expect(
    problemasDaResposta(doc, CAMINHO, "get", resposta.status, resposta.body),
  ).toEqual([]);
  expect(esquemaDoProduto.safeParse(resposta.body).success).toBe(true);
}

describe("flag vitrine.proximo_preco", () => {
  it(
    "[CA-10] desligada: a chave não existe e o corpo é o de sempre, mesmo com queda agendada",
    async () => {
      const pastel = await produtoComBase("Pastel sem flag");
      const inicio = new Date(Date.now() + DIA).toISOString();
      expect(
        (await cadastrar(pastel, { valorCentavos: 1500, inicio })).status,
      ).toBe(201);

      const resposta = await pagina(desligada, pastel);

      conforme(resposta);
      expect(resposta.body).not.toHaveProperty("proximoPreco");
      // Ligada, o MESMO produto só ganha a chave: o resto do corpo é idêntico.
      const comFlag = await pagina(ligada, pastel);
      const { proximoPreco: _, ...semAChave } = comFlag.body;
      expect(resposta.body).toEqual(semAChave);
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-10] vitrine configurada à mão, sem flags, continua desligada",
    async () => {
      const pastel = await produtoComBase("Pastel vitrine solta");
      const app = criarApp({ origens: [ORIGEM], vitrine: { acesso } });
      const resposta = await pagina(app, pastel);
      conforme(resposta);
      expect(resposta.body).not.toHaveProperty("proximoPreco");
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-11] ligada: promoção que começa em 1 dia vira a próxima queda",
    async () => {
      const pastel = await produtoComBase("Pastel com promoção");
      const inicio = new Date(Date.now() + DIA);
      await cadastrar(pastel, {
        valorCentavos: 1500,
        inicio: inicio.toISOString(),
      });

      const resposta = await pagina(ligada, pastel);

      conforme(resposta);
      expect(resposta.body.precoCentavos).toBe(2000);
      expect(resposta.body.proximoPreco).toEqual({
        precoCentavos: 1500,
        aPartirDe: inicio.toISOString(),
      });
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-11] ligada: aumento agendado e produto sem mudança dão proximoPreco nulo",
    async () => {
      const aumento = await produtoComBase("Pastel com aumento");
      const preco = await cadastrar(aumento, {
        tipo: "BASE",
        valorCentavos: 2500,
        inicio: new Date(Date.now() + DIA).toISOString(),
      });
      // Sem encerrar o base antigo, o MENOR vence: não há mudança alguma.
      expect(preco.status).toBe(201);
      const comAumento = await pagina(ligada, aumento);
      conforme(comAumento);
      expect(comAumento.body.proximoPreco).toBeNull();

      const quieto = await produtoComBase("Pastel quieto");
      const semMudanca = await pagina(ligada, quieto);
      conforme(semMudanca);
      expect(semMudanca.body.proximoPreco).toBeNull();
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-11] ligada: queda além de 7 dias não é anunciada",
    async () => {
      const pastel = await produtoComBase("Pastel promoção distante");
      await cadastrar(pastel, {
        valorCentavos: 1500,
        inicio: new Date(Date.now() + 10 * DIA).toISOString(),
      });
      const resposta = await pagina(ligada, pastel);
      conforme(resposta);
      expect(resposta.body.proximoPreco).toBeNull();
    },
    ESPERA_LONGA,
  );

  it(
    "[CA-11] ligada: produto pedido pelo endereço de OUTRA loja responde 404 igual à vitrine desligada",
    async () => {
      const pastel = await produtoComBase("Pastel da loja certa");
      const pedir = (app: ReturnType<typeof criarApp>) =>
        request(app).get(
          `/v1/vitrine/${outraLoja.apelido}/produto/${pastel.id}`,
        );

      const comFlag = await pedir(ligada);
      const semFlag = await pedir(desligada);

      expect(comFlag.status).toBe(404);
      expect(semFlag.status).toBe(404);
      // Mesmo corpo; só a `referencia` (o id da requisição) muda por natureza.
      const semReferencia = (corpo: { erro: Record<string, unknown> }) => {
        const { referencia: _, ...resto } = corpo.erro;
        return resto;
      };
      expect(semReferencia(comFlag.body)).toEqual(semReferencia(semFlag.body));
      expect(comFlag.body).not.toHaveProperty("proximoPreco");
    },
    ESPERA_LONGA,
  );
});
