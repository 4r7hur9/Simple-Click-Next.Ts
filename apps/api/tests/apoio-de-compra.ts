/**
 * Apoio das provas que compram pelo SITE de verdade (T-604).
 *
 * `fazerPedido` (apoio-de-pedidos.ts) cria o pedido pelo caso de uso, que é o
 * bastante para provar a fila e a máquina de status. O histórico da conta,
 * não: o que liga o pedido à conta acontece na ROTA do fechamento, quando o
 * cliente chega com sessão. Provar isso exige o caminho inteiro — carrinho,
 * fechamento e a sessão do cliente — como ela chega de verdade: no cookie
 * `sc_access`, quando é o navegador (que não lê o token), ou no cabeçalho de
 * autorização, quando é um cliente nativo.
 *
 * A loja de teste nasce sem entrega configurada e sem horário: sem os dois, o
 * fechamento recusa com "loja fechada", que é o comportamento certo da loja e
 * o motivo errado para uma prova falhar.
 */
import type { Express } from "express";
import type pg from "pg";
import request from "supertest";

import type { LojaDeTeste, ProdutoDeTeste } from "@simpleclick/testing";

import {
  autorizacaoDoComprador,
  ORIGEM_DO_PAINEL,
} from "./apoio-de-pedidos.ts";
import { COOKIE_DA_SESSAO } from "../src/core/sessao-do-carrinho.ts";

/** O que o fechamento devolve ao cliente. */
export interface PedidoFechado {
  readonly id: string;
  readonly numero: number;
  readonly codigo: string;
  readonly tokenPublico: string;
  readonly status: string;
}

/** A loja precisa poder vender: entrega configurada e aberta o dia todo. */
export async function prepararParaVender(
  migrador: pg.Client,
  alvo: LojaDeTeste,
): Promise<void> {
  await migrador.query(
    `UPDATE app.store_settings
        SET delivery = $2, payment = $3
      WHERE store_id = $1`,
    [
      alvo.id,
      JSON.stringify({ taxaPadraoCents: 700, retiradaNoLocal: true }),
      JSON.stringify({ formas: ["PIX", "CASH"] }),
    ],
  );
  for (let dia = 0; dia <= 6; dia += 1) {
    await migrador.query(
      `INSERT INTO app.store_hours (store_id, weekday, opens_at, closes_at)
       VALUES ($1, $2, '00:00', '23:59')`,
      [alvo.id, dia],
    );
  }
}

/** Tira o token da sessão do carrinho do cookie que a API emitiu. */
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

export interface OpcoesDaCompra {
  /** O cabeçalho `Authorization` de um cliente logado (cliente nativo). */
  readonly autorizacao?: string | undefined;
  /**
   * O token de acesso no cookie `sc_access`, como o NAVEGADOR o leva: a página
   * não lê o token (HttpOnly) e não monta cabeçalho nenhum. Sem esta opção e
   * sem `autorizacao`, a compra é de convidado.
   */
  readonly cookieDeAcesso?: string | undefined;
  readonly contato?: { readonly nome: string; readonly telefone: string };
  /** Sem conta nenhuma: para provar o 401 `conta_obrigatoria`. */
  readonly semConta?: boolean | undefined;
}

/**
 * Monta o carrinho e fecha o pedido, como a vitrine faz.
 *
 * Com `cookieDeAcesso` (navegador) ou `autorizacao` (nativo), a compra é de um
 * cliente logado e o pedido nasce ligado à conta dele (AC-616). Sem nenhum
 * dos dois, é a compra de convidado da ASM-103.
 */
export async function fecharPeloSite(
  app: Express,
  alvo: LojaDeTeste,
  item: ProdutoDeTeste,
  opcoes: OpcoesDaCompra = {},
): Promise<PedidoFechado> {
  const acrescentado = await request(app)
    .post(`/v1/vitrine/${alvo.apelido}/carrinho/itens`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .send({ produtoId: item.id, quantidade: 1, escolhas: [] });
  if (acrescentado.status !== 201) {
    throw new Error(
      `o carrinho não aceitou o item: ${acrescentado.status} ${JSON.stringify(acrescentado.body)}`,
    );
  }
  const sessao = sessaoDe(acrescentado);

  let fechamento = request(app)
    .post(`/v1/vitrine/${alvo.apelido}/pedidos`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .set(
      "Cookie",
      opcoes.cookieDeAcesso === undefined
        ? `${COOKIE_DA_SESSAO}=${sessao}`
        : `${COOKIE_DA_SESSAO}=${sessao}; sc_access=${encodeURIComponent(opcoes.cookieDeAcesso)}`,
    );
  // O pedido exige conta: sem sessão escolhida, compra a conta da prova.
  if (opcoes.autorizacao !== undefined) {
    fechamento = fechamento.set("Authorization", opcoes.autorizacao);
  } else if (opcoes.cookieDeAcesso === undefined && opcoes.semConta !== true) {
    fechamento = fechamento.set(
      "Authorization",
      await autorizacaoDoComprador(),
    );
  }
  const fechado = await fechamento.send({
    contato: opcoes.contato ?? { nome: "Ana Paula", telefone: "11988887777" },
    entrega: "PICKUP",
    chaveDeIdempotencia: `chave-${Math.random().toString(36).slice(2)}-teste`,
  });
  if (fechado.status !== 201) {
    throw new Error(
      `o fechamento recusou o pedido: ${fechado.status} ${JSON.stringify(fechado.body)}`,
    );
  }
  return fechado.body as PedidoFechado;
}

/**
 * Monta o carrinho e manda o fechamento com o corpo dado, devolvendo a
 * resposta crua — para as provas que olham a recusa (401, 422).
 */
export async function tentarFecharPeloSite(
  app: Express,
  alvo: LojaDeTeste,
  item: ProdutoDeTeste,
  envio: {
    readonly autorizacao?: string | undefined;
    readonly corpo: Record<string, unknown>;
  },
): Promise<request.Response> {
  const acrescentado = await request(app)
    .post(`/v1/vitrine/${alvo.apelido}/carrinho/itens`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .send({ produtoId: item.id, quantidade: 1, escolhas: [] });
  let fechamento = request(app)
    .post(`/v1/vitrine/${alvo.apelido}/pedidos`)
    .set("Origin", ORIGEM_DO_PAINEL)
    .set("Cookie", `${COOKIE_DA_SESSAO}=${sessaoDe(acrescentado)}`);
  if (envio.autorizacao !== undefined) {
    fechamento = fechamento.set("Authorization", envio.autorizacao);
  }
  return fechamento.send({
    chaveDeIdempotencia: `chave-${Math.random().toString(36).slice(2)}-teste`,
    ...envio.corpo,
  });
}
