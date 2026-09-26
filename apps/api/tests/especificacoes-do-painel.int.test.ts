/**
 * Prova do criador de especificações da categoria (AC-325, AC-326, AC-327,
 * AC-330), contra banco de verdade e pelas rotas do painel.
 *
 * As regras puras — tipo de valor, lista fechada, obrigatória, versão
 * histórica — já estão provadas em `especificacoes.usecase.test.ts`. O que só
 * esta prova mostra é o caminho inteiro: o dono cria dentro da categoria, o
 * produto herda, o valor fora da lista é recusado pela rota, e renomear ou
 * remover não mexe em produto preenchido nem em pedido já feito.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoDoArquivo, conectarNoBancoDoArquivo } from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import {
  caminhoDoPainel,
  criarCategoriaPeloPainel,
  criarProdutoPeloPainel,
  lojaComDonoNoPainel,
} from "./apoio-do-painel.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import { criarPedido } from "../src/modules/orders/criar-pedido.usecase.ts";
import { tokenPublico } from "../src/modules/orders/numero-pedido.ts";
import { congelarItens } from "../src/modules/orders/snapshot.ts";

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

interface EspecificacaoNoPainel {
  readonly id: string;
  readonly chave: string;
  readonly nome: string;
  readonly tipo: string;
  readonly unidade: string | null;
  readonly obrigatoria: boolean;
  readonly filtravel: boolean;
  readonly opcoes: readonly string[];
  readonly ordem: number;
  readonly produtos: number;
}

interface CampoDoProduto {
  readonly especificacao: EspecificacaoNoPainel;
  readonly valor: string | number | boolean | null;
}

function especificacoesDa(loja: LojaDeTeste, categoriaId: string): string {
  return caminhoDoPainel(loja, `categorias/${categoriaId}/especificacoes`);
}

async function criarEspecificacao(
  app: App,
  loja: LojaDeTeste,
  categoriaId: string,
  dados: {
    readonly nome: string;
    readonly tipo: "texto" | "numero" | "lista" | "booleano";
    readonly unidade?: string | null;
    readonly obrigatoria?: boolean;
    readonly filtravel?: boolean;
    readonly opcoes?: readonly string[];
  },
): Promise<EspecificacaoNoPainel> {
  const resposta = await request(app)
    .post(especificacoesDa(loja, categoriaId))
    .send({
      nome: dados.nome,
      tipo: dados.tipo,
      unidade: dados.unidade ?? null,
      obrigatoria: dados.obrigatoria ?? false,
      filtravel: dados.filtravel ?? false,
      opcoes: dados.opcoes ?? [],
    });
  expect(resposta.status).toBe(201);
  return resposta.body as EspecificacaoNoPainel;
}

async function listar(
  app: App,
  loja: LojaDeTeste,
  categoriaId: string,
): Promise<EspecificacaoNoPainel[]> {
  const resposta = await request(app).get(especificacoesDa(loja, categoriaId));
  expect(resposta.status).toBe(200);
  return (resposta.body as { especificacoes: EspecificacaoNoPainel[] })
    .especificacoes;
}

async function camposDoProduto(
  app: App,
  loja: LojaDeTeste,
  produtoId: string,
): Promise<CampoDoProduto[]> {
  const resposta = await request(app).get(
    caminhoDoPainel(loja, `produtos/${produtoId}/especificacoes`),
  );
  expect(resposta.status).toBe(200);
  return (resposta.body as { campos: CampoDoProduto[] }).campos;
}

function preencher(
  app: App,
  loja: LojaDeTeste,
  produtoId: string,
  valores: Record<string, string | number | boolean | null>,
) {
  return request(app)
    .put(caminhoDoPainel(loja, `produtos/${produtoId}/especificacoes`))
    .send({ valores });
}

/** A categoria Pneus com Aro (lista), Largura e Índice de carga. */
async function pneus() {
  const contexto = await lojaComDonoNoPainel(acesso);
  const { app, loja } = contexto;
  const categoria = await criarCategoriaPeloPainel(app, loja, "Pneus");
  const aro = await criarEspecificacao(app, loja, categoria.id, {
    nome: "Aro",
    tipo: "lista",
    unidade: "pol",
    obrigatoria: true,
    filtravel: true,
    opcoes: ["13", "14", "15", "16"],
  });
  const largura = await criarEspecificacao(app, loja, categoria.id, {
    nome: "Largura",
    tipo: "numero",
    unidade: "mm",
    obrigatoria: true,
  });
  const indice = await criarEspecificacao(app, loja, categoria.id, {
    nome: "Índice de carga",
    tipo: "numero",
  });
  return { ...contexto, categoria, aro, largura, indice };
}

/** Um pedido de verdade, gravado pelo mesmo caso de uso do fechamento. */
async function pedidoDe(
  loja: LojaDeTeste,
  produto: { readonly id: string },
  nome: string,
) {
  const { itens, subtotalEmCentavos } = congelarItens([
    {
      produto: { id: produto.id, nome, precoEmCentavos: 30_000 },
      quantidade: 1,
      opcoes: [],
    },
  ]);
  const resultado = await comoRequisicao(
    acesso,
    { lojaId: loja.id, papel: "CUSTOMER", tokenDoPedido: tokenPublico() },
    () =>
      criarPedido(
        {
          lojaId: loja.id,
          contato: { nome: "Cliente da prova", telefoneE164: "5511977776666" },
          itens,
          entrega: "PICKUP",
          subtotalEmCentavos,
          taxaDeEntregaEmCentavos: 0,
          totalEmCentavos: subtotalEmCentavos,
        },
        { aberta: true },
      ),
  );
  if (!resultado.ok) throw new Error("o pedido de apoio não foi criado");
  return resultado.pedido;
}

async function especificacoesCongeladas(pedidoId: string) {
  const resultado = await migrador.query<{ attributes_snapshot: unknown }>(
    `SELECT attributes_snapshot FROM app.order_items WHERE order_id = $1`,
    [pedidoId],
  );
  const congelado = resultado.rows[0]?.attributes_snapshot as
    { especificacoes?: { nome: string; valor: unknown }[] } | undefined;
  return congelado?.especificacoes ?? [];
}

describe("a categoria tem seu próprio criador de especificações (AC-325)", () => {
  it(
    "@spec:AC-325 o dono cria especificações dos quatro tipos, com unidade, obrigatoriedade e filtro",
    async () => {
      const { app, loja } = await lojaComDonoNoPainel(acesso);
      const categoria = await criarCategoriaPeloPainel(app, loja, "Pneus");
      const rodas = await criarCategoriaPeloPainel(app, loja, "Rodas");

      await criarEspecificacao(app, loja, categoria.id, {
        nome: "Aro",
        tipo: "lista",
        unidade: "pol",
        obrigatoria: true,
        filtravel: true,
        opcoes: ["13", "14", "15", "16"],
      });
      await criarEspecificacao(app, loja, categoria.id, {
        nome: "Largura",
        tipo: "numero",
        unidade: "mm",
        obrigatoria: true,
      });
      await criarEspecificacao(app, loja, categoria.id, {
        nome: "Marca",
        tipo: "texto",
      });
      await criarEspecificacao(app, loja, categoria.id, {
        nome: "Run flat",
        tipo: "booleano",
        filtravel: true,
      });

      const criadas = await listar(app, loja, categoria.id);
      expect(
        criadas.map((item) => [
          item.nome,
          item.tipo,
          item.unidade,
          item.obrigatoria,
          item.filtravel,
        ]),
      ).toEqual([
        ["Aro", "lista", "pol", true, true],
        ["Largura", "numero", "mm", true, false],
        ["Marca", "texto", null, false, false],
        ["Run flat", "booleano", null, false, true],
      ]);
      expect(criadas[0]?.opcoes).toEqual(["13", "14", "15", "16"]);
      expect(criadas[0]?.chave).toBe("aro");

      // A especificação é da CATEGORIA: Rodas continua sem nenhuma.
      expect(await listar(app, loja, rodas.id)).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-325 lista sem opção e tipo desconhecido são recusados, e outra loja não alcança a categoria",
    async () => {
      const { app, loja } = await lojaComDonoNoPainel(acesso);
      const categoria = await criarCategoriaPeloPainel(app, loja, "Camisetas");

      const listaVazia = await request(app)
        .post(especificacoesDa(loja, categoria.id))
        .send({
          nome: "Tamanho",
          tipo: "lista",
          unidade: null,
          obrigatoria: true,
          filtravel: true,
          opcoes: [],
        });
      expect(listaVazia.status).toBe(400);
      const tipoDesconhecido = await request(app)
        .post(especificacoesDa(loja, categoria.id))
        .send({
          nome: "Tamanho",
          tipo: "data",
          unidade: null,
          obrigatoria: false,
          filtravel: false,
          opcoes: [],
        });
      expect(tipoDesconhecido.status).toBe(400);

      // O dono de outra loja, pelo apelido DELE, não enxerga esta categoria.
      const outra = await lojaComDonoNoPainel(acesso);
      const invasao = await request(outra.app)
        .post(especificacoesDa(outra.loja, categoria.id))
        .send({
          nome: "Invasora",
          tipo: "texto",
          unidade: null,
          obrigatoria: false,
          filtravel: false,
          opcoes: [],
        });
      expect(invasao.status).toBe(404);
      expect(await listar(app, loja, categoria.id)).toEqual([]);
    },
    ESPERA_LONGA,
  );
});

describe("o produto herda as especificações da categoria (AC-326)", () => {
  it(
    "@spec:AC-326 o formulário do produto traz as especificações na ordem definida, e a obrigatória impede salvar em branco",
    async () => {
      const { app, loja, categoria, aro, largura, indice } = await pneus();

      // O dono decide a ordem: Largura, Aro, Índice de carga.
      const ordem = await request(app)
        .put(especificacoesDa(loja, categoria.id))
        .send({ ids: [largura.id, aro.id, indice.id] });
      expect(ordem.status).toBe(200);

      const produto = await criarProdutoPeloPainel(app, loja, {
        categoriaId: categoria.id,
        nome: "Pneu 195/55",
      });
      const herdadas = await camposDoProduto(app, loja, produto.id);
      expect(herdadas.map((campo) => campo.especificacao.nome)).toEqual([
        "Largura",
        "Aro",
        "Índice de carga",
      ]);
      expect(herdadas.map((campo) => campo.valor)).toEqual([null, null, null]);

      const semAro = await preencher(app, loja, produto.id, {
        [largura.id]: 195,
      });
      expect(semAro.status).toBe(400);
      expect(semAro.body).toMatchObject({
        erro: "especificacoes_invalidas",
        erros: [expect.objectContaining({ especificacaoId: aro.id })],
      });
      // Recusado é recusado inteiro: nem a Largura foi gravada.
      expect(
        (await camposDoProduto(app, loja, produto.id)).map((c) => c.valor),
      ).toEqual([null, null, null]);

      const completo = await preencher(app, loja, produto.id, {
        [largura.id]: 195,
        [aro.id]: "15",
      });
      expect(completo.status).toBe(200);
      expect(
        (await camposDoProduto(app, loja, produto.id)).map((c) => c.valor),
      ).toEqual([195, "15", null]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-326 especificação de outra categoria não entra pelo preenchimento do produto",
    async () => {
      const { app, loja, categoria } = await pneus();
      const rodas = await criarCategoriaPeloPainel(app, loja, "Rodas");
      const furacao = await criarEspecificacao(app, loja, rodas.id, {
        nome: "Furação",
        tipo: "texto",
      });
      const produto = await criarProdutoPeloPainel(app, loja, {
        categoriaId: categoria.id,
        nome: "Pneu 175/70",
      });

      const estranha = await preencher(app, loja, produto.id, {
        [furacao.id]: "4x100",
      });
      expect(estranha.status).toBe(400);
      expect(estranha.body).toMatchObject({
        erro: "especificacao_fora_da_categoria",
      });
    },
    ESPERA_LONGA,
  );
});

describe("a lista só aceita os valores cadastrados (AC-327)", () => {
  it(
    "@spec:AC-327 o 17 é recusado explicando os aceitos, e passa a valer depois que o dono o acrescenta",
    async () => {
      const { app, loja, categoria, aro, largura } = await pneus();
      const produto = await criarProdutoPeloPainel(app, loja, {
        categoriaId: categoria.id,
        nome: "Pneu aro 17",
      });

      const recusado = await preencher(app, loja, produto.id, {
        [largura.id]: 225,
        [aro.id]: "17",
      });
      expect(recusado.status).toBe(400);
      const [erro] = (recusado.body as { erros: { mensagem: string }[] }).erros;
      expect(erro?.mensagem).toContain("13, 14, 15, 16");

      const acrescentada = await request(app)
        .post(`${especificacoesDa(loja, categoria.id)}/${aro.id}/opcoes`)
        .send({ valor: "17" });
      expect(acrescentada.status).toBe(200);
      expect((acrescentada.body as EspecificacaoNoPainel).opcoes).toEqual([
        "13",
        "14",
        "15",
        "16",
        "17",
      ]);

      const aceito = await preencher(app, loja, produto.id, {
        [largura.id]: 225,
        [aro.id]: "17",
      });
      expect(aceito.status).toBe(200);
    },
    ESPERA_LONGA,
  );
});

describe("alterar ou remover especificação não corrompe produto nem pedido (AC-330)", () => {
  /** Vinte pneus com Aro preenchido e um pedido antigo de um deles. */
  async function vintePneusEUmPedido() {
    const contexto = await pneus();
    const { app, loja, categoria, aro, largura } = contexto;
    const produtos: { id: string }[] = [];
    for (let numero = 1; numero <= 20; numero += 1) {
      const produto = await criarProdutoPeloPainel(app, loja, {
        categoriaId: categoria.id,
        nome: `Pneu modelo ${numero}`,
      });
      const preenchido = await preencher(app, loja, produto.id, {
        [largura.id]: 185,
        [aro.id]: "15",
      });
      expect(preenchido.status).toBe(200);
      produtos.push(produto);
    }
    const pedido = await pedidoDe(loja, produtos[0]!, "Pneu modelo 1");
    return { ...contexto, produtos, pedido };
  }

  it(
    "@spec:AC-330 renomear avisa quantos produtos serão afetados, e só aplica confirmado; o pedido antigo guarda o nome da época",
    async () => {
      const { app, loja, categoria, aro, produtos, pedido } =
        await vintePneusEUmPedido();

      expect(await especificacoesCongeladas(pedido.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ nome: "Aro", valor: "15" }),
        ]),
      );

      const aviso = await request(app)
        .patch(`${especificacoesDa(loja, categoria.id)}/${aro.id}`)
        .send({ nome: "Diâmetro do aro" });
      expect(aviso.status).toBe(409);
      expect(aviso.body).toMatchObject({
        erro: "confirmacao_necessaria",
        impacto: { produtosAfetados: 20 },
      });
      expect((await listar(app, loja, categoria.id))[0]?.nome).toBe("Aro");

      const confirmada = await request(app)
        .patch(`${especificacoesDa(loja, categoria.id)}/${aro.id}`)
        .send({ nome: "Diâmetro do aro", confirmado: true });
      expect(confirmada.status).toBe(200);
      expect(confirmada.body).toMatchObject({
        nome: "Diâmetro do aro",
        chave: "aro",
        versao: 2,
      });

      // O produto mantém o valor, agora sob o nome novo.
      const campos = await camposDoProduto(app, loja, produtos[5]!.id);
      expect(
        campos.find((campo) => campo.especificacao.id === aro.id),
      ).toMatchObject({
        valor: "15",
        especificacao: { nome: "Diâmetro do aro" },
      });
      // O pedido antigo continua com o nome da época.
      expect(await especificacoesCongeladas(pedido.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ nome: "Aro", valor: "15" }),
        ]),
      );
      // E a mudança fica na trilha, com o nome anterior.
      const trilha = await migrador.query<{ before_data: { nome: string } }>(
        `SELECT before_data FROM app.audit_log
          WHERE entity_id = $1 AND action = 'ESPECIFICACAO_RENOMEADA'`,
        [aro.id],
      );
      expect(trilha.rows.map((linha) => linha.before_data.nome)).toEqual([
        "Aro",
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-330 remover avisa antes, tira da categoria e preserva os valores e o pedido",
    async () => {
      const { app, loja, categoria, aro, pedido } = await vintePneusEUmPedido();

      const aviso = await request(app)
        .delete(`${especificacoesDa(loja, categoria.id)}/${aro.id}`)
        .send({});
      expect(aviso.status).toBe(409);
      expect(aviso.body).toMatchObject({
        impacto: { produtosAfetados: 20 },
      });
      expect((aviso.body as { aviso: string }).aviso).toContain(
        "20 produto(s)",
      );

      const removida = await request(app)
        .delete(`${especificacoesDa(loja, categoria.id)}/${aro.id}`)
        .send({ confirmado: true });
      expect(removida.status).toBe(200);

      expect(
        (await listar(app, loja, categoria.id)).map((item) => item.nome),
      ).toEqual(["Largura", "Índice de carga"]);
      const valores = await migrador.query<{ total: string }>(
        `SELECT count(*) AS total FROM app.product_attributes
          WHERE definition_id = $1 AND value_text = '15'`,
        [aro.id],
      );
      expect(Number(valores.rows[0]?.total)).toBe(20);
      const definicao = await migrador.query<{ deprecated_at: Date | null }>(
        `SELECT deprecated_at FROM app.attribute_definitions WHERE id = $1`,
        [aro.id],
      );
      expect(definicao.rows[0]?.deprecated_at).not.toBeNull();
      expect(await especificacoesCongeladas(pedido.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ nome: "Aro", valor: "15" }),
        ]),
      );
    },
    ESPERA_LONGA,
  );
});
