/**
 * Prova de isolamento ENTRE DONOS (dívida 92 — AC-116, AC-010, P-003).
 *
 * O que se prova aqui é a pergunta que vem ANTES do isolamento por linha:
 * "este dono é desta loja?". As rotas do dono resolvem a loja pelo apelido da
 * URL e abrem a transação declarando o papel OWNER. Se ninguém cobrar a
 * resposta a essa pergunta, qualquer token de dono administra qualquer loja
 * ativa trocando o apelido — e o isolamento por linha, que separa as lojas
 * DENTRO da transação, não tem como ajudar, porque a transação foi aberta
 * declarando a loja errada.
 *
 * Duas lojas, A e B, montadas iguais. O dono da A é MEMBRO de verdade da A
 * (`store_members`). Com o token dele, CADA módulo de rota do dono responde na
 * A e recusa na B — e recusa pela mesma porta da vitrine: "não encontrado".
 * Nunca "existe, mas não é sua": distinguir os dois casos contaria a quem
 * tenta que o apelido existe, e é assim que se mapeia concorrente. E no banco,
 * nada da B muda.
 *
 * A prova passa pela aplicação montada — autenticação por token de verdade,
 * validação de borda, contexto da requisição e transação com a loja gravada —
 * porque é isso que o dono vive. O catálogo é montado à mão sobre o banco
 * descartável deste arquivo (as rotas do catálogo em `criarApp` leem o acesso
 * do ambiente); configuração, fila e administração vêm de `criarApp`.
 */
import type { Express, Request } from "express";
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarCategoria,
  criarIdentidade,
  criarLoja,
  criarMembro,
  criarProduto,
  criarVariacao,
  porProdutoNaCategoria,
} from "@simpleclick/testing";
import type { LojaDeTeste, MembroDeTeste } from "@simpleclick/testing";

import {
  montarAppDaConfiguracao,
  ORIGEM_DO_PAINEL,
  tokenDoDono,
} from "./apoio-de-configuracao.ts";
import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
  exigirVariavel,
} from "./apoio-de-isolamento.ts";
import { fazerPedido } from "./apoio-de-pedidos.ts";
import { appDoDono } from "./apoio-do-catalogo.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import {
  assinarTokenDeAcesso,
  tokenDoCabecalhoDeAutorizacao,
  verificarTokenDeAcesso,
} from "../src/modules/auth/token.ts";
import { criarRotasDasCategorias } from "../src/modules/catalog/categorias.routes.ts";
import { criarRotasDasEspecificacoes } from "../src/modules/catalog/especificacoes.routes.ts";
import { criarRotasDoEstoque } from "../src/modules/catalog/estoque.routes.ts";
import { criarRotasDasImagens } from "../src/modules/catalog/imagens.routes.ts";
import { criarRotasDosGruposDeEscolha } from "../src/modules/catalog/opcoes.routes.ts";
import { criarRotasDosPrecos } from "../src/modules/catalog/precos.routes.ts";
import { criarRotasDosProdutos } from "../src/modules/catalog/produtos.routes.ts";
import { criarRotasDasVariacoes } from "../src/modules/catalog/variacoes.routes.ts";
import { criarRotasDoCupom } from "../src/modules/printing/cupom.routes.ts";
import { normalizarConfiguracaoDeImpressao } from "../src/modules/stores/impressao-config.usecase.ts";
import { identificarLoja } from "../src/modules/storefront/resolver-loja.usecase.ts";

// ---------------------------------------------------------------------------
// A montagem
// ---------------------------------------------------------------------------

/** Uma loja com um exemplar de cada coisa que as rotas do dono alcançam. */
interface Montagem {
  readonly loja: LojaDeTeste;
  readonly categoriaId: string;
  readonly produtoId: string;
  readonly imagemId: string;
  readonly variacaoId: string;
  readonly pedidoId: string;
}

let migrador: pg.Client;
let acesso: AcessoAoBanco;
/** Configuração, fila e administração, por `criarApp`. */
let operacao: Express;
/** As rotas do catálogo e do cupom, sobre o banco deste arquivo. */
let catalogo: Express;
let A: Montagem;
let B: Montagem;
let donoDaA: MembroDeTeste;
let tokenDaA: string;
let retratoInicialDeB: unknown;

/**
 * O mesmo portão de token que `app.ts` põe diante de cada rota do dono:
 * token assinado com o segredo do ambiente, e só o papel OWNER passa.
 */
function autenticarPorToken(requisicao: Request) {
  const token = tokenDoCabecalhoDeAutorizacao(requisicao.headers.authorization);
  if (token === undefined) return null;
  try {
    const alegacoes = verificarTokenDeAcesso(
      token,
      exigirVariavel("JWT_SECRET"),
    );
    if (alegacoes.papel !== "OWNER") return null;
    return { identidadeId: alegacoes.identidadeId, papel: "OWNER" as const };
  } catch {
    return null;
  }
}

function montarCatalogo(): Express {
  const comum = {
    acesso,
    autenticar: autenticarPorToken,
    resolverLoja: identificarLoja,
  };
  return appDoDono(
    criarRotasDasCategorias(comum),
    criarRotasDosProdutos(comum),
    criarRotasDasEspecificacoes(comum),
    criarRotasDasImagens(comum),
    criarRotasDosPrecos(comum),
    criarRotasDosGruposDeEscolha(comum),
    criarRotasDasVariacoes(comum),
    criarRotasDoEstoque(comum),
    criarRotasDoCupom({
      ...comum,
      lerConfiguracaoDoCupom: normalizarConfiguracaoDeImpressao,
    }),
  );
}

async function montar(nome: string): Promise<Montagem> {
  // Roupa porque o ramo controla estoque, e o ajuste de estoque precisa de
  // variação com quantidade.
  const loja = await criarLoja({ nome: `Loja ${nome}`, ramo: "roupas" });
  const categoria = await criarCategoria({ loja, nome: `Seção de ${nome}` });
  const produto = await criarProduto({ loja, nome: `Produto de ${nome}` });
  await porProdutoNaCategoria({ loja, produto, categoria });
  const variacao = await criarVariacao({
    loja,
    produto,
    nome: `Tamanho único de ${nome}`,
    precoCentavos: 1_000,
    estoque: 5,
  });
  const imagem = await migrador.query<{ id: string }>(
    `INSERT INTO app.product_images (store_id, product_id, url, alt_text)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [
      loja.id,
      produto.id,
      `https://exemplo.test/${loja.apelido}.jpg`,
      `Imagem de ${nome}`,
    ],
  );
  const imagemId = imagem.rows[0]?.id;
  if (imagemId === undefined) throw new Error("a imagem de apoio não entrou");
  const pedido = await fazerPedido(acesso, loja);
  return {
    loja,
    categoriaId: categoria.id,
    produtoId: produto.id,
    imagemId,
    variacaoId: variacao.id,
    pedidoId: pedido.id,
  };
}

/**
 * Tudo da loja que uma escrita do dono poderia mudar, visto pela credencial
 * de migração — a única que enxerga sem depender do isolamento sob prova.
 */
async function retratoDe(m: Montagem): Promise<unknown> {
  const { rows } = await migrador.query(
    `SELECT (SELECT count(*)::int FROM app.categories WHERE store_id = $1) AS categorias,
            (SELECT count(*)::int FROM app.products WHERE store_id = $1) AS produtos,
            (SELECT count(*)::int FROM app.attribute_definitions WHERE store_id = $1) AS especificacoes,
            (SELECT count(*)::int FROM app.product_prices WHERE store_id = $1) AS precos,
            (SELECT count(*)::int FROM app.option_groups WHERE store_id = $1) AS grupos,
            (SELECT count(*)::int FROM app.product_variants WHERE store_id = $1) AS variacoes,
            (SELECT count(*)::int FROM app.stock_movements WHERE store_id = $1) AS movimentos,
            (SELECT count(*)::int FROM app.store_members WHERE store_id = $1) AS membros,
            (SELECT count(*)::int FROM app.audit_log WHERE store_id = $1) AS auditoria,
            (SELECT stock_quantity FROM app.product_variants WHERE id = $2) AS estoque,
            (SELECT is_primary FROM app.product_images WHERE id = $3) AS imagem_principal,
            (SELECT delivery::text FROM app.store_settings WHERE store_id = $1) AS entrega,
            (SELECT status FROM app.orders WHERE id = $4) AS status_do_pedido,
            (SELECT print_count FROM app.orders WHERE id = $4) AS vias`,
    [m.loja.id, m.variacaoId, m.imagemId, m.pedidoId],
  );
  return rows[0];
}

type Metodo = "get" | "post" | "put" | "patch";

/** Uma chamada a uma rota do dono. Sem token, vai o do dono da loja A. */
interface Chamada {
  readonly app: Express;
  readonly metodo: Metodo;
  readonly caminho: string;
  readonly corpo?: unknown;
  readonly token?: string;
}

/** Chama uma rota como o painel chama: portador do token e origem confiável. */
function chamar(chamada: Chamada): request.Test {
  const agente = request(chamada.app);
  const pedido = agente[chamada.metodo](chamada.caminho)
    .set("Authorization", `Bearer ${chamada.token ?? tokenDaA}`)
    .set("Origin", ORIGEM_DO_PAINEL);
  return chamada.corpo === undefined
    ? pedido
    : pedido.send(chamada.corpo as object);
}

// ---------------------------------------------------------------------------
// As portas do dono: uma leitura e uma escrita por módulo
// ---------------------------------------------------------------------------

interface Escrita {
  readonly metodo: Exclude<Metodo, "get">;
  readonly caminho: string;
  readonly corpo?: unknown;
  /** O que a própria loja responde quando a escrita entra. */
  readonly sucesso: number;
}

interface Porta {
  readonly modulo: string;
  readonly app: () => Express;
  /** O caminho de leitura do módulo. O cupom só tem escrita. */
  readonly leitura?: (m: Montagem) => string;
  readonly escrita: (m: Montagem) => Escrita;
}

const ENTREGA_VALIDA = {
  aceitaEntrega: true,
  aceitaRetirada: true,
  taxaCentavos: 800,
  nomeDaTaxa: "Motoboy",
  gratisAcimaDeCentavos: 6_000,
  minimoParaEntregaCentavos: 2_500,
  minimoParaRetiradaCentavos: null,
  prazoMinutos: 40,
};

const lojas = (m: Montagem) => `/v1/lojas/${m.loja.apelido}`;
const produto = (m: Montagem) => `${lojas(m)}/catalogo/produtos/${m.produtoId}`;

const PORTAS: readonly Porta[] = [
  {
    modulo: "catálogo: categorias",
    app: () => catalogo,
    leitura: (m) => `${lojas(m)}/catalogo/categorias`,
    escrita: (m) => ({
      metodo: "post",
      caminho: `${lojas(m)}/catalogo/categorias`,
      corpo: { nome: "Seção nova", descricao: null, visivel: true },
      sucesso: 201,
    }),
  },
  {
    modulo: "catálogo: especificações",
    app: () => catalogo,
    leitura: (m) =>
      `${lojas(m)}/catalogo/categorias/${m.categoriaId}/especificacoes`,
    escrita: (m) => ({
      metodo: "post",
      caminho: `${lojas(m)}/catalogo/categorias/${m.categoriaId}/especificacoes`,
      corpo: {
        nome: "Cor",
        tipo: "texto",
        unidade: null,
        obrigatoria: false,
        filtravel: false,
        opcoes: [],
      },
      sucesso: 201,
    }),
  },
  {
    modulo: "catálogo: produtos",
    app: () => catalogo,
    leitura: (m) => `${lojas(m)}/catalogo/produtos`,
    escrita: (m) => ({
      metodo: "post",
      caminho: `${lojas(m)}/catalogo/produtos`,
      corpo: {
        nome: "Produto novo",
        descricao: null,
        categoriaId: m.categoriaId,
        precoCentavos: 1_990,
        status: "PUBLISHED",
        disponivel: true,
      },
      sucesso: 201,
    }),
  },
  {
    modulo: "catálogo: imagens",
    app: () => catalogo,
    leitura: (m) => `${produto(m)}/imagens`,
    escrita: (m) => ({
      metodo: "patch",
      caminho: `${produto(m)}/imagens/${m.imagemId}`,
      corpo: { principal: true },
      sucesso: 200,
    }),
  },
  {
    modulo: "catálogo: preços",
    app: () => catalogo,
    leitura: (m) => `${produto(m)}/precos`,
    escrita: (m) => ({
      metodo: "post",
      caminho: `${produto(m)}/precos`,
      corpo: {
        tipo: "BASE",
        rotulo: null,
        valorCentavos: 1_500,
        quantidadeMinima: 1,
        inicio: null,
        fim: null,
        ativo: true,
      },
      sucesso: 201,
    }),
  },
  {
    modulo: "catálogo: grupos de escolha",
    app: () => catalogo,
    leitura: (m) => `${produto(m)}/opcoes`,
    escrita: (m) => ({
      metodo: "post",
      caminho: `${produto(m)}/opcoes`,
      corpo: {
        nome: "Adicionais",
        descricao: null,
        tipo: "ADDON",
        minimo: 0,
        maximo: null,
        permiteRepetir: false,
        ativo: true,
      },
      sucesso: 201,
    }),
  },
  {
    modulo: "catálogo: variações",
    app: () => catalogo,
    leitura: (m) => `${produto(m)}/variacoes`,
    escrita: (m) => ({
      metodo: "post",
      caminho: `${produto(m)}/variacoes`,
      corpo: {
        nome: "Tamanho novo",
        sku: null,
        codigoDeBarras: null,
        precoCentavos: 1_200,
        estoque: 3,
        estoqueMinimo: null,
        pesoGramas: null,
        padrao: false,
        disponivel: true,
        combinacoes: [],
      },
      sucesso: 201,
    }),
  },
  {
    modulo: "catálogo: estoque",
    app: () => catalogo,
    leitura: (m) => `${produto(m)}/estoque`,
    escrita: (m) => ({
      metodo: "post",
      caminho: `${produto(m)}/variacoes/${m.variacaoId}/estoque`,
      corpo: { quantidadeAlvo: 2, motivo: "Contagem do fim do dia" },
      sucesso: 201,
    }),
  },
  {
    modulo: "configurações",
    app: () => operacao,
    leitura: (m) => `${lojas(m)}/configuracao/entrega`,
    escrita: (m) => ({
      metodo: "put",
      caminho: `${lojas(m)}/configuracao/entrega`,
      corpo: ENTREGA_VALIDA,
      sucesso: 204,
    }),
  },
  {
    modulo: "fila de pedidos",
    app: () => operacao,
    leitura: (m) => `${lojas(m)}/pedidos`,
    escrita: (m) => ({
      metodo: "patch",
      caminho: `${lojas(m)}/pedidos/${m.pedidoId}/status`,
      corpo: { status: "ACCEPTED" },
      sucesso: 200,
    }),
  },
  {
    modulo: "cupom do pedido",
    app: () => catalogo,
    escrita: (m) => ({
      metodo: "post",
      caminho: `${lojas(m)}/pedidos/${m.pedidoId}/cupom`,
      sucesso: 200,
    }),
  },
];

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  operacao = montarAppDaConfiguracao(acesso, { fila: { acesso } });
  catalogo = montarCatalogo();

  A = await montar("A");
  B = await montar("B");
  donoDaA = await criarMembro({ loja: A.loja });
  tokenDaA = tokenDoDono(donoDaA.identidade.id);
  retratoInicialDeB = await retratoDe(B);
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

// ---------------------------------------------------------------------------
// AC-116 — o dono da A alcança a A, e a B "não existe" para ele
// ---------------------------------------------------------------------------

describe("o dono da loja A, membro dela, diante de cada porta do painel", () => {
  it.each(PORTAS)(
    "@spec:AC-116 @spec:AC-010 @principle:P-003 $modulo: responde na própria loja, e na loja B sai por 'não encontrado' sem mudar nada dela",
    async (porta) => {
      const app = porta.app();
      const antes = await retratoDe(B);

      // A própria loja: leitura e escrita entram. Sem este contraste, "não
      // alcança a B" poderia ser só uma porta que não alcança nada.
      if (porta.leitura !== undefined) {
        const lidaNaA = await chamar({
          app,
          metodo: "get",
          caminho: porta.leitura(A),
        });
        expect(lidaNaA.status, `${porta.modulo}: leitura na loja A`).toBe(200);
      }
      const escritaNaA = porta.escrita(A);
      const gravadaNaA = await chamar({ app, ...escritaNaA });
      expect(gravadaNaA.status, `${porta.modulo}: escrita na loja A`).toBe(
        escritaNaA.sucesso,
      );

      // A loja B, pelo apelido dela na URL: a MESMA porta de "não existe".
      if (porta.leitura !== undefined) {
        const lidaNaB = await chamar({
          app,
          metodo: "get",
          caminho: porta.leitura(B),
        });
        expect(lidaNaB.status, `${porta.modulo}: leitura na loja B`).toBe(404);
        expect(JSON.stringify(lidaNaB.body)).not.toMatch(/ de B\b|Loja B/);
      }

      const escritaNaB = porta.escrita(B);
      const gravadaNaB = await chamar({ app, ...escritaNaB });
      expect(gravadaNaB.status, `${porta.modulo}: escrita na loja B`).toBe(404);
      expect(JSON.stringify(gravadaNaB.body)).not.toMatch(/ de B\b|Loja B/);

      // E no banco, nada da B mudou — nem contagem, nem estado.
      expect(await retratoDe(B), `${porta.modulo}: a loja B mudou`).toEqual(
        antes,
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-116 @principle:P-003 as rotas da administração não aceitam o dono, seja de qual loja for",
    async () => {
      const resposta = await chamar({
        app: operacao,
        metodo: "get",
        caminho: "/v1/admin/lojas",
      });
      expect(resposta.status).toBe(403);
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// Quem tem o papel no token e não tem o vínculo no banco
// ---------------------------------------------------------------------------

describe("token de dono sem vínculo ativo", () => {
  /** As portas com leitura: é por leitura que se prova "não alcança". */
  const comLeitura = () =>
    PORTAS.filter(
      (porta): porta is Porta & { readonly leitura: (m: Montagem) => string } =>
        porta.leitura !== undefined,
    );

  /** A leitura de cada porta, nas duas lojas, com o token informado. */
  async function statusDeCadaPorta(token: string): Promise<string[]> {
    const vistos: string[] = [];
    for (const porta of comLeitura()) {
      for (const m of [A, B]) {
        const resposta = await chamar({
          app: porta.app(),
          metodo: "get",
          caminho: porta.leitura(m),
          token,
        });
        vistos.push(`${porta.modulo} @ ${m.loja.nome}: ${resposta.status}`);
      }
    }
    return vistos;
  }

  const todas404 = () =>
    comLeitura().flatMap((porta) =>
      [A, B].map((m) => `${porta.modulo} @ ${m.loja.nome}: 404`),
    );

  it(
    "@spec:AC-116 @principle:P-003 identidade com papel OWNER no token e sem linha em store_members não alcança loja nenhuma",
    async () => {
      const semLoja = await criarIdentidade({ nome: "Dono de nada" });
      expect(await statusDeCadaPorta(tokenDoDono(semLoja.id))).toEqual(
        todas404(),
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-116 @principle:P-003 membro revogado deixa de alcançar a loja que era dele",
    async () => {
      const revogado = await criarMembro({ loja: A.loja });
      await migrador.query(
        `UPDATE app.store_members SET revoked_at = now() WHERE id = $1`,
        [revogado.id],
      );
      expect(
        await statusDeCadaPorta(tokenDoDono(revogado.identidade.id)),
      ).toEqual(todas404());
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-116 @principle:P-003 convite ainda não aceito não é vínculo",
    async () => {
      const convidado = await criarMembro({ loja: A.loja });
      await migrador.query(
        `UPDATE app.store_members SET invite_accepted_at = NULL WHERE id = $1`,
        [convidado.id],
      );
      expect(
        await statusDeCadaPorta(tokenDoDono(convidado.identidade.id)),
      ).toEqual(todas404());
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-116 @principle:P-003 sujeito que não é uma identidade (o antigo usuário de teste local) sai por 'não encontrado', e não por erro interno",
    async () => {
      const forjado = assinarTokenDeAcesso(
        {
          identidadeId: "usuario-de-teste-local",
          papel: "OWNER",
          sessaoId: "sessao-forjada",
          familiaId: "familia-forjada",
        },
        exigirVariavel("JWT_SECRET"),
      );
      expect(await statusDeCadaPorta(forjado)).toEqual(todas404());
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// A equipe (STAFF): existe no banco, e alcança só a própria loja
// ---------------------------------------------------------------------------

describe("membro da equipe (STAFF)", () => {
  // Na versão 1 a API só emite sessão de DONO (Q-101 da identidade: um
  // acesso por loja); STAFF é papel do banco, alcançado pelo caminho único.
  // A regra é a mesma do dono: o vínculo decide, não o papel.
  it(
    "@spec:AC-116 @spec:AC-010 @principle:P-003 lê a própria loja pelo caminho único, e a loja B responde 'não encontrado' pela mesma porta",
    async () => {
      const equipe = await criarMembro({ loja: A.loja, papel: "STAFF" });
      const contexto = (m: Montagem) => ({
        lojaId: m.loja.id,
        usuarioId: equipe.identidade.id,
        papel: "STAFF" as const,
      });

      const daPropria = await comoRequisicao(acesso, contexto(A), (tx) =>
        tx.category.findMany({ select: { name: true } }),
      );
      expect(daPropria.map((c) => c.name)).toContain("Seção de A");

      await expect(
        comoRequisicao(acesso, contexto(B), (tx) =>
          tx.category.findMany({ select: { name: true } }),
        ),
      ).rejects.toMatchObject({ codigo: "nao_encontrado" });
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// Ao fim de tudo, a loja B está exatamente como nasceu
// ---------------------------------------------------------------------------

describe("a loja B depois de todas as tentativas", () => {
  it(
    "@spec:AC-116 @spec:AC-010 @principle:P-003 não mudou em nada desde a montagem",
    async () => {
      expect(await retratoDe(B)).toEqual(retratoInicialDeB);
    },
    ESPERA_LONGA,
  );
});
