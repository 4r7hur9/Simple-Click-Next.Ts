/**
 * Prova do carrinho que vira pedido (AC-524, AC-516; dívida 95).
 *
 * O DEFEITO QUE ELA PRENDE: depois de pedir, o cliente voltava ao fechamento
 * com os mesmos itens, e um segundo "Fechar pedido" — chave de fechamento nova
 * — criava outro pedido igual. O carrinho precisa sair de cena NA MESMA
 * transação do pedido (`app.converter_carrinho`, migração 0043), e a sessão
 * seguinte começa vazia.
 *
 * E O QUE ELA NÃO PODE QUEBRAR: a nova tentativa com a MESMA chave (resposta
 * perdida na rede) continua recebendo o mesmo pedido, com os valores e a
 * mensagem dele — agora lidos do pedido guardado, porque o carrinho já não
 * existe para aquela sessão.
 */
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
  criarProduto,
} from "@simpleclick/testing";
import type { LojaDeTeste, ProdutoDeTeste } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import { criarApp } from "../src/app.ts";
import { COOKIE_DA_SESSAO } from "../src/core/sessao-do-carrinho.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

const ORIGEM = "https://app.exemplo.test";
const PRECO = 2000;

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let app: ReturnType<typeof criarApp>;
let loja: LojaDeTeste;
let lanche: ProdutoDeTeste;

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });
  app = criarApp({
    origens: [ORIGEM],
    vitrine: { acesso },
    carrinho: { acesso },
    pedidos: { acesso },
  });

  loja = await criarLoja({ nome: "Lanchonete do Pedido Único" });
  lanche = await criarProduto({
    loja,
    nome: "X-Burguer",
    precoCentavos: PRECO,
  });

  // Retirada com MÍNIMO: é o cenário em que reler um carrinho vazio na nova
  // tentativa recusaria por "mínimo não alcançado" um pedido que já existe.
  await migrador.query(
    `INSERT INTO app.store_settings (store_id, delivery, payment, whatsapp)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (store_id) DO UPDATE
       SET delivery = EXCLUDED.delivery, payment = EXCLUDED.payment,
           whatsapp = EXCLUDED.whatsapp`,
    [
      loja.id,
      JSON.stringify({
        taxaPadraoCents: 700,
        retiradaNoLocal: true,
        minimoRetiradaCents: 1000,
      }),
      JSON.stringify({ formas: ["PIX", "CASH"] }),
      JSON.stringify({ numero: "+5511911112222" }),
    ],
  );
  for (let dia = 0; dia <= 6; dia += 1) {
    await migrador.query(
      `INSERT INTO app.store_hours (store_id, weekday, opens_at, closes_at)
       VALUES ($1, $2, '00:00', '23:59')`,
      [loja.id, dia],
    );
  }
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/** Tira o token da sessão do cookie que a API emitiu. */
function sessaoDe(resposta: request.Response): string {
  const cabecalho = resposta.headers["set-cookie"];
  const cookies = Array.isArray(cabecalho) ? cabecalho : [cabecalho ?? ""];
  const nosso = cookies.find((c) => c.startsWith(`${COOKIE_DA_SESSAO}=`));
  const valor = nosso?.split(";")[0]?.split("=")[1];
  if (valor === undefined || valor === "") {
    throw new Error("a API não emitiu o cookie da sessão do carrinho");
  }
  return valor;
}

/** Põe um lanche num carrinho novo e devolve a sessão dele. */
async function carrinhoComUmLanche(): Promise<string> {
  const resposta = await request(app)
    .post(`/v1/vitrine/${loja.apelido}/carrinho/itens`)
    .set("Origin", ORIGEM)
    .send({ produtoId: lanche.id, quantidade: 1, escolhas: [] });
  expect(resposta.status).toBe(201);
  return sessaoDe(resposta);
}

function fechar(sessao: string, chave: string) {
  return request(app)
    .post(`/v1/vitrine/${loja.apelido}/pedidos`)
    .set("Origin", ORIGEM)
    .set("Cookie", `${COOKIE_DA_SESSAO}=${sessao}`)
    .send({
      contato: { nome: "Ana Paula", telefone: "11988887777" },
      entrega: "PICKUP",
      chaveDeIdempotencia: chave,
    });
}

function verCarrinho(sessao: string) {
  return request(app)
    .get(`/v1/vitrine/${loja.apelido}/carrinho`)
    .set("Origin", ORIGEM)
    .set("Cookie", `${COOKIE_DA_SESSAO}=${sessao}`);
}

function novaChave(): string {
  return `chave-${Math.random().toString(36).slice(2)}-convertido`;
}

async function pedidosDaLoja(): Promise<number> {
  const linhas = await migrador.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM app.orders WHERE store_id = $1`,
    [loja.id],
  );
  return Number(linhas.rows[0]?.total ?? 0);
}

describe("o carrinho que virou pedido sai de cena (AC-524)", () => {
  it(
    "@spec:AC-524 depois de pedir, a mesma sessão volta a um carrinho vazio e um segundo fechamento não cria outro pedido igual",
    async () => {
      const sessao = await carrinhoComUmLanche();
      const antes = await pedidosDaLoja();

      const primeiro = await fechar(sessao, novaChave());
      expect(primeiro.status).toBe(201);

      // O carrinho que virou o pedido está marcado, e na mesma transação.
      const marcado = await migrador.query<{ convertido: boolean }>(
        `SELECT converted_at IS NOT NULL AS convertido
           FROM app.carts WHERE store_id = $1 AND session_token = $2`,
        [loja.id, sessao],
      );
      expect(marcado.rows.map((l) => l.convertido)).toEqual([true]);

      // A mesma sessão volta ao fechamento: carrinho novo, vazio.
      const depois = await verCarrinho(sessao);
      expect(depois.status).toBe(200);
      expect(depois.body.totalDeItens).toBe(0);
      expect(depois.body.itens).toEqual([]);

      // O segundo "Fechar pedido" (chave nova) não tem o que fechar.
      const segundo = await fechar(sessao, novaChave());
      expect(segundo.status).toBe(409);
      expect(await pedidosDaLoja()).toBe(antes + 1);

      // E a compra seguinte, na mesma sessão, nasce só com o que foi posto.
      const acrescentado = await request(app)
        .post(`/v1/vitrine/${loja.apelido}/carrinho/itens`)
        .set("Origin", ORIGEM)
        .set("Cookie", `${COOKIE_DA_SESSAO}=${sessao}`)
        .send({ produtoId: lanche.id, quantidade: 2, escolhas: [] });
      expect(acrescentado.status).toBe(201);
      expect(acrescentado.body.totalDeItens).toBe(2);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-524 o carrinho de outra sessão, de outra loja ou já convertido não é convertido",
    async () => {
      const sessao = await carrinhoComUmLanche();
      const fechado = await fechar(sessao, novaChave());
      expect(fechado.status).toBe(201);

      const outraSessao = await carrinhoComUmLanche();
      const carrinhos = await migrador.query<{ id: string; sessao: string }>(
        `SELECT id, session_token AS sessao FROM app.carts
          WHERE store_id = $1 AND session_token = ANY($2)`,
        [loja.id, [sessao, outraSessao]],
      );
      const doPedido = carrinhos.rows.find((c) => c.sessao === sessao)?.id;
      const alheio = carrinhos.rows.find((c) => c.sessao === outraSessao)?.id;
      const outraLoja = await criarLoja({ nome: "Outra Loja" });

      const converter = (dados: {
        lojaId: string;
        sessao: string;
        carrinho: string | undefined;
      }) =>
        comoRequisicao(
          acesso,
          {
            papel: "PUBLIC",
            lojaId: dados.lojaId,
            sessaoDoCarrinho: dados.sessao,
            tokenDoPedido: fechado.body.tokenPublico,
          },
          async (tx) => {
            const linhas = await tx.$queryRaw<{ convertido: boolean }[]>`
              SELECT app.converter_carrinho(${dados.carrinho}::uuid, ${fechado.body.id}::uuid) AS convertido`;
            return linhas[0]?.convertido;
          },
        );

      // Já convertido: a segunda conversão perde (é o que desfaz a corrida).
      expect(
        await converter({ lojaId: loja.id, sessao, carrinho: doPedido }),
      ).toBe(false);
      // O carrinho de outra pessoa, mesmo com o token do pedido em mãos.
      expect(
        await converter({ lojaId: loja.id, sessao, carrinho: alheio }),
      ).toBe(false);
      // Outra loja no contexto.
      expect(
        await converter({
          lojaId: outraLoja.id,
          sessao: outraSessao,
          carrinho: alheio,
        }),
      ).toBe(false);

      const intacto = await migrador.query<{ convertido: boolean }>(
        `SELECT converted_at IS NOT NULL AS convertido FROM app.carts WHERE id = $1`,
        [alheio],
      );
      expect(intacto.rows[0]?.convertido).toBe(false);
    },
    ESPERA_LONGA,
  );
});

describe("a nova tentativa com a mesma chave depois da conversão (AC-516)", () => {
  it(
    "@spec:AC-516 a mesma chave devolve o mesmo pedido, com os valores e a mensagem do pedido guardado",
    async () => {
      const sessao = await carrinhoComUmLanche();
      const chave = novaChave();

      const primeira = await fechar(sessao, chave);
      expect(primeira.status).toBe(201);

      const segunda = await fechar(sessao, chave);
      expect(segunda.status).toBe(200);
      expect(segunda.body.jaExistia).toBe(true);
      expect(segunda.body.id).toBe(primeira.body.id);
      expect(segunda.body.numero).toBe(primeira.body.numero);
      expect(segunda.body.tokenPublico).toBe(primeira.body.tokenPublico);
      expect(segunda.body.subtotalCentavos).toBe(PRECO);
      expect(segunda.body.totalCentavos).toBe(PRECO);
      expect(segunda.body.taxaDeEntregaCentavos).toBe(0);

      const texto = segunda.body.whatsapp.texto as string;
      expect(texto).toContain(primeira.body.codigo);
      expect(texto).toContain("X-Burguer");
      expect(texto).toContain("Ana Paula");
      expect(segunda.body.whatsapp.endereco).toContain(
        "https://wa.me/5511911112222",
      );
    },
    ESPERA_LONGA,
  );
});
