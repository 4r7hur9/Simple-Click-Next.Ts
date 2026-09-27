/**
 * Prova da disponibilidade e da janela de venda de ponta a ponta na API
 * (AC-321, AC-322), contra o banco de verdade.
 *
 * O CAMINHO DO DONO: ele marca esgotado e cadastra a janela pelas rotas do
 * painel, como a tela faz. O QUE SE PROVA é o que o cliente encontra depois —
 * o cartão do catálogo, a página do produto e o carrinho — com o relógio da
 * vitrine fixado numa terça e num sábado, no fuso da loja.
 *
 * POR QUE O RELÓGIO É FIXADO. "No sábado ele volta a aparecer automaticamente,
 * sem eu mexer em nada" (AC-322) é afirmação sobre dois instantes; esperar por
 * eles não é prova. A vitrine aceita o instante por parâmetro justamente para
 * isto — e o dono não toca em nada entre uma leitura e a outra.
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
} from "@simpleclick/testing";
import type { CategoriaDeTeste, LojaDeTeste } from "@simpleclick/testing";

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
import { criarRotasDosProdutos } from "../src/modules/catalog/produtos.routes.ts";
import { identificarLoja } from "../src/modules/storefront/resolver-loja.usecase.ts";

/** Terça-feira, meio-dia em São Paulo (15h em UTC). */
const TERCA = new Date("2026-09-15T15:00:00.000Z");
/** Sábado, meio-dia em São Paulo. */
const SABADO = new Date("2026-09-19T15:00:00.000Z");
/** Sábado, 19h em São Paulo: já depois de a janela fechar. */
const SABADO_A_NOITE = new Date("2026-09-19T22:00:00.000Z");

/** A janela do critério: só no sábado, das 9h às 18h, no relógio da loja. */
const FIM_DE_SEMANA = [{ diaDaSemana: 6, abre: "09:00", fecha: "18:00" }];

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let vitrine: ReturnType<typeof criarApp>;
let painel: ReturnType<typeof appDoDono>;
let loja: LojaDeTeste;
let categoria: CategoriaDeTeste;
let dono: DonoDeTeste;
/** O relógio da vitrine; cada prova o põe no instante que quer ver. */
let relogio = TERCA;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  vitrine = criarApp({
    origens: [ORIGEM],
    vitrine: { acesso, agora: () => relogio },
    carrinho: { acesso, agora: () => relogio },
    pedidos: { acesso, agora: () => relogio },
  });

  loja = await criarLoja({
    nome: "Cantina da Feijoada",
    fusoHorario: "America/Sao_Paulo",
  });
  const membro = await criarMembro({ loja });
  dono = { identidadeId: membro.identidade.id, papel: "OWNER" };
  categoria = await criarCategoria({ loja, nome: "Pratos" });
  await lojaQueVende(migrador, loja);

  painel = appDoDono(
    criarRotasDosProdutos({
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

interface ProdutoNoPainel {
  readonly id: string;
  readonly disponivel: boolean;
  readonly janelas: readonly {
    readonly diaDaSemana: number;
    readonly abre: string;
    readonly fecha: string;
  }[];
}

/** O dono cadastra o produto pelo painel, publicado, como a tela faz. */
async function cadastrar(
  nome: string,
  campos: Record<string, unknown> = {},
): Promise<ProdutoNoPainel> {
  const resposta = await request(painel)
    .post(`/v1/lojas/${loja.apelido}/catalogo/produtos`)
    .send({
      nome,
      descricao: null,
      categoriaId: categoria.id,
      precoCentavos: 4_990,
      status: "PUBLISHED",
      disponivel: true,
      ...campos,
    });
  expect(resposta.status).toBe(201);
  return resposta.body as ProdutoNoPainel;
}

/** O dono altera o produto pelo painel. */
function alterar(produtoId: string, campos: Record<string, unknown>) {
  return request(painel)
    .patch(`/v1/lojas/${loja.apelido}/catalogo/produtos/${produtoId}`)
    .send(campos);
}

interface Cartao {
  readonly id: string;
  readonly disponivel: boolean;
  readonly motivoIndisponivel: string | null;
}

/** O cartão do produto no catálogo público, no instante do relógio. */
async function cartaoNoCatalogo(produtoId: string): Promise<Cartao> {
  const resposta = await request(vitrine).get(
    `/v1/vitrine/${loja.apelido}/catalogo`,
  );
  expect(resposta.status).toBe(200);
  const secoes = resposta.body.secoes as { produtos: Cartao[] }[];
  const cartao = secoes
    .flatMap((secao) => secao.produtos)
    .find((produto) => produto.id === produtoId);
  if (cartao === undefined) throw new Error("o produto sumiu do catálogo");
  return cartao;
}

/** A página do produto, como o navegador do cliente a pede. */
async function paginaDoProduto(produtoId: string): Promise<Cartao> {
  const resposta = await request(vitrine).get(
    `/v1/vitrine/${loja.apelido}/produto/${produtoId}`,
  );
  expect(resposta.status).toBe(200);
  return resposta.body as Cartao;
}

/** O que o cliente vê, nos dois endereços, no instante dado. */
async function visto(produtoId: string, instante: Date) {
  relogio = instante;
  const [cartao, pagina] = await Promise.all([
    cartaoNoCatalogo(produtoId),
    paginaDoProduto(produtoId),
  ]);
  return {
    cartao: {
      disponivel: cartao.disponivel,
      motivo: cartao.motivoIndisponivel,
    },
    pagina: {
      disponivel: pagina.disponivel,
      motivo: pagina.motivoIndisponivel,
    },
  };
}

const A_VENDA = { disponivel: true, motivo: null };
const ESGOTADO = { disponivel: false, motivo: "ESGOTADO" };
const FORA_DO_HORARIO = { disponivel: false, motivo: "FORA_DO_HORARIO" };

describe("produto esgotado aparece sem poder ser comprado (AC-321)", () => {
  it(
    "@spec:AC-321 marcado como esgotado pelo painel, o produto continua na vitrine com o motivo, e o carrinho o recusa",
    async () => {
      const coxinha = await cadastrar("Coxinha de frango");
      expect(await visto(coxinha.id, TERCA)).toEqual({
        cartao: A_VENDA,
        pagina: A_VENDA,
      });

      const marcado = await alterar(coxinha.id, { disponivel: false });
      expect(marcado.status).toBe(200);
      expect(marcado.body.disponivel).toBe(false);

      // O cartão CONTINUA LÁ, marcado — e não some: quem procurava a coxinha
      // precisa saber que ela existe e acabou.
      expect(await visto(coxinha.id, TERCA)).toEqual({
        cartao: ESGOTADO,
        pagina: ESGOTADO,
      });

      // O botão não funcionar é a tela; o carrinho recusar é o que impede quem
      // monta a requisição à mão de comprar o que acabou.
      const cliente = new Visitante(vitrine, loja.apelido);
      const recusado = await cliente.acrescentar({
        produtoId: coxinha.id,
        quantidade: 1,
        escolhas: [],
      });
      expect(recusado.status).toBe(409);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-321 voltar a marcar como disponível libera o produto na hora, e o cadastro continua o mesmo",
    async () => {
      const pastel = await cadastrar("Pastel de queijo", { disponivel: false });
      expect(await visto(pastel.id, TERCA)).toEqual({
        cartao: ESGOTADO,
        pagina: ESGOTADO,
      });

      const liberado = await alterar(pastel.id, { disponivel: true });
      expect(liberado.status).toBe(200);

      expect(await visto(pastel.id, TERCA)).toEqual({
        cartao: A_VENDA,
        pagina: A_VENDA,
      });
      const cliente = new Visitante(vitrine, loja.apelido);
      const aceito = await cliente.acrescentar({
        produtoId: pastel.id,
        quantidade: 1,
        escolhas: [],
      });
      expect(aceito.status).toBe(201);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-321 esgotado vence a janela: no sábado, dentro da faixa, o produto esgotado continua esgotado",
    async () => {
      const feijoada = await cadastrar("Feijoada esgotada", {
        janelas: FIM_DE_SEMANA,
        disponivel: false,
      });
      expect(await visto(feijoada.id, SABADO)).toEqual({
        cartao: ESGOTADO,
        pagina: ESGOTADO,
      });
      // Reativar devolve a janela ao comando: sábado libera, terça não.
      expect((await alterar(feijoada.id, { disponivel: true })).status).toBe(
        200,
      );
      expect(await visto(feijoada.id, SABADO)).toEqual({
        cartao: A_VENDA,
        pagina: A_VENDA,
      });
      expect(await visto(feijoada.id, TERCA)).toEqual({
        cartao: FORA_DO_HORARIO,
        pagina: FORA_DO_HORARIO,
      });
    },
    ESPERA_LONGA,
  );
});

describe("produto pode ficar disponível só em certos dias e horários (AC-322)", () => {
  it(
    "@spec:AC-322 a janela cadastrada pelo painel fica gravada no produto e volta na lista do dono",
    async () => {
      const feijoada = await cadastrar("Feijoada completa", {
        janelas: FIM_DE_SEMANA,
      });
      expect(feijoada.janelas).toEqual(FIM_DE_SEMANA);

      const lista = await request(painel).get(
        `/v1/lojas/${loja.apelido}/catalogo/produtos`,
      );
      expect(lista.status).toBe(200);
      const gravado = (lista.body.produtos as ProdutoNoPainel[]).find(
        (produto) => produto.id === feijoada.id,
      );
      expect(gravado?.janelas).toEqual(FIM_DE_SEMANA);

      // A janela é editável como o resto: trocada pelo painel, a nova vale.
      const trocada = await alterar(feijoada.id, {
        janelas: [{ diaDaSemana: 0, abre: "11:00", fecha: "15:00" }],
      });
      expect(trocada.status).toBe(200);
      expect(trocada.body.janelas).toEqual([
        { diaDaSemana: 0, abre: "11:00", fecha: "15:00" },
      ]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-322 na terça o produto de fim de semana não é comprável; no sábado ele volta sozinho, sem o dono mexer",
    async () => {
      const feijoada = await cadastrar("Feijoada de sábado", {
        janelas: FIM_DE_SEMANA,
      });

      expect(await visto(feijoada.id, TERCA)).toEqual({
        cartao: FORA_DO_HORARIO,
        pagina: FORA_DO_HORARIO,
      });
      // Nada muda no cadastro entre uma leitura e a outra: só o relógio anda.
      expect(await visto(feijoada.id, SABADO)).toEqual({
        cartao: A_VENDA,
        pagina: A_VENDA,
      });
      // A HORA É A DA LOJA: às 19h de São Paulo a janela já fechou, mesmo
      // que em UTC ainda sejam 22h do mesmo sábado.
      expect(await visto(feijoada.id, SABADO_A_NOITE)).toEqual({
        cartao: FORA_DO_HORARIO,
        pagina: FORA_DO_HORARIO,
      });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-322 a janela que fecha depois de adicionar impede o fechamento do pedido",
    async () => {
      const feijoada = await cadastrar("Feijoada no carrinho", {
        janelas: FIM_DE_SEMANA,
      });
      const cliente = new Visitante(vitrine, loja.apelido);
      relogio = SABADO;
      const adicionado = await cliente.acrescentar({
        produtoId: feijoada.id,
        quantidade: 1,
      });
      expect(adicionado.status, JSON.stringify(adicionado.body)).toBe(201);
      expect((await cliente.conferir()).body.itens).toHaveLength(1);

      relogio = SABADO_A_NOITE;
      const conferencia = await cliente.conferir();
      expect(conferencia.status).toBe(200);
      expect(conferencia.body.itens).toEqual([]);
      expect(conferencia.body.mudancas).toEqual([
        expect.objectContaining({
          nome: "Feijoada no carrinho",
          tipo: "INDISPONIVEL",
        }),
      ]);
      expect(conferencia.body.subtotalCentavos).toBe(0);
      expect((await cliente.fechar()).status).toBe(409);

      const vendidos = await migrador.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM app.order_items WHERE product_id = $1`,
        [feijoada.id],
      );
      expect(vendidos.rows[0]?.total).toBe(0);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-322 produto sem janela vende em qualquer dia, e a faixa que fecha antes de abrir é recusada",
    async () => {
      const semJanela = await cadastrar("Pão de queijo");
      expect(semJanela.janelas).toEqual([]);
      expect(await visto(semJanela.id, TERCA)).toEqual({
        cartao: A_VENDA,
        pagina: A_VENDA,
      });

      const invertida = await alterar(semJanela.id, {
        janelas: [{ diaDaSemana: 6, abre: "18:00", fecha: "09:00" }],
      });
      expect(invertida.status).toBe(400);
      expect(invertida.body).toEqual({ erro: "janela_invalida" });

      const diaInexistente = await alterar(semJanela.id, {
        janelas: [{ diaDaSemana: 7, abre: "09:00", fecha: "18:00" }],
      });
      expect(diaInexistente.status).toBe(400);
      expect(diaInexistente.body).toEqual({ erro: "janela_invalida" });

      // Nada do que foi recusado ficou gravado.
      expect(await visto(semJanela.id, TERCA)).toEqual({
        cartao: A_VENDA,
        pagina: A_VENDA,
      });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-322 o banco recusa janelas incompletas ou nulas sem liberar o produto fora do horário",
    async () => {
      const feijoada = await cadastrar("Feijoada com janela protegida", {
        janelas: FIM_DE_SEMANA,
      });
      const invalidas = [
        [{}],
        [{ abre: "09:00", fecha: "18:00" }],
        [{ diaDaSemana: 6, fecha: "18:00" }],
        [{ diaDaSemana: 6, abre: "09:00" }],
        [{ diaDaSemana: null, abre: "09:00", fecha: "18:00" }],
        [{ diaDaSemana: 6, abre: null, fecha: "18:00" }],
        [{ diaDaSemana: 6, abre: "09:00", fecha: null }],
        [null],
      ];

      for (const invalida of invalidas) {
        await expect(
          migrador.query(
            `UPDATE app.products SET sale_windows = $2::jsonb WHERE id = $1`,
            [feijoada.id, JSON.stringify(invalida)],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      }

      expect(await visto(feijoada.id, TERCA)).toEqual({
        cartao: FORA_DO_HORARIO,
        pagina: FORA_DO_HORARIO,
      });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-322 a forma da janela é conferida pelo próprio banco, e não só pela borda",
    async () => {
      const feijoada = await cadastrar("Feijoada guardada");
      // Gravação por fora da aplicação, com o papel do migrador: a
      // verificação da coluna (migração 0028) é a última trava.
      await expect(
        migrador.query(
          `UPDATE app.products SET sale_windows = $2::jsonb WHERE id = $1`,
          [
            feijoada.id,
            JSON.stringify([{ diaDaSemana: 6, abre: "25:00", fecha: "26:00" }]),
          ],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        migrador.query(
          `UPDATE app.products SET sale_windows = $2::jsonb WHERE id = $1`,
          [feijoada.id, JSON.stringify({ diaDaSemana: 6 })],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await migrador.query(
        `UPDATE app.products SET sale_windows = $2::jsonb WHERE id = $1`,
        [feijoada.id, JSON.stringify(FIM_DE_SEMANA)],
      );
      expect(await visto(feijoada.id, TERCA)).toEqual({
        cartao: FORA_DO_HORARIO,
        pagina: FORA_DO_HORARIO,
      });
    },
    ESPERA_LONGA,
  );
});
