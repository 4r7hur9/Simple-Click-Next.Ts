/**
 * Apoio das provas das métricas do painel contra PostgreSQL de verdade
 * (T-800 a T-808).
 *
 * Três coisas que todas as provas das métricas repetiriam:
 *
 * - a aplicação inteira montada sobre o banco descartável do arquivo, com o
 *   relógio travado quando a prova precisa de um "hoje" fixo e um cache em
 *   memória no lugar do Redis — o cache sob prova é a regra de
 *   `metrics/cache.ts`, e não o servidor de cache;
 * - pedidos gravados com o instante exato em que foram feitos. O fechamento
 *   de verdade grava `placed_at = now()`, e a prova do fuso precisa do pedido
 *   das 23:59 de um dia escolhido — então o pedido entra pela credencial de
 *   migração, com o horário que a prova manda;
 * - o token de um dono de verdade, membro da loja, para atravessar a
 *   autenticação e o vínculo que `core/db.ts` confere.
 */
import { randomBytes } from "node:crypto";

import type pg from "pg";
import request from "supertest";

import { esquemaDasMetricas } from "@simpleclick/contracts";
import { criarLoja, type LojaDeTeste } from "@simpleclick/testing";

import { criarApp } from "../src/app.ts";
import {
  criarCache,
  type Cache,
  type ClienteDeCache,
} from "../src/core/cache.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";
import {
  comoPortador,
  ORIGEM_DO_PAINEL,
  tokenDeAcesso,
} from "./apoio-de-pedidos.ts";

/** O fuso padrão das lojas de teste. */
export const SAO_PAULO = "America/Sao_Paulo";

/** Um instante no relógio de São Paulo (UTC-3, sem horário de verão). */
export function sp(horario: string): Date {
  return new Date(`${horario}-03:00`);
}

/** O "agora" travado das provas: domingo, 27/09/2026, 14h32 em São Paulo. */
export const AGORA = sp("2026-09-27T14:32:00");

/** Uma loja nova e o token do dono com que ela nasceu (membro OWNER dela). */
export async function lojaComDono(
  nome: string,
  fusoHorario = SAO_PAULO,
): Promise<{ loja: LojaDeTeste; token: string }> {
  const loja = await criarLoja({ nome, fusoHorario });
  return { loja, token: tokenDoDonoDasMetricas(loja.dono.id) };
}

/** O corpo da resposta, conferido contra o contrato publicado. */
export function noContrato(corpo: unknown) {
  return esquemaDasMetricas.parse(corpo);
}

/** As métricas como o contrato as descreve. */
export type MetricasDaResposta = ReturnType<typeof noContrato>;

/** Um cache de verdade (`core/cache.ts`) sobre um cliente em memória. */
export function cacheEmMemoria(): Cache {
  const guardado = new Map<string, { valor: string; venceEm: number }>();
  const cliente: ClienteDeCache = {
    async buscar(chave) {
      const entrada = guardado.get(chave);
      if (entrada === undefined) return undefined;
      if (entrada.venceEm <= Date.now()) {
        guardado.delete(chave);
        return undefined;
      }
      return entrada.valor;
    },
    async guardar(chave, valor, ttl) {
      guardado.set(chave, { valor, venceEm: Date.now() + ttl * 1000 });
    },
    async remover(chaves) {
      let removidas = 0;
      for (const chave of chaves) if (guardado.delete(chave)) removidas += 1;
      return removidas;
    },
    async listarPorPrefixo(prefixo) {
      return [...guardado.keys()].filter((chave) => chave.startsWith(prefixo));
    },
    async encerrar() {},
  };
  return criarCache({ cliente });
}

export interface OpcoesDoAppDasMetricas {
  /** O relógio da API. Sem ele, vale o relógio da máquina. */
  readonly agora?: () => Date;
  readonly cache?: Cache;
}

/** A aplicação inteira, com as métricas sobre o banco descartável do arquivo. */
export function appDasMetricas(
  acesso: AcessoAoBanco,
  opcoes: OpcoesDoAppDasMetricas = {},
) {
  return criarApp({
    origens: [ORIGEM_DO_PAINEL],
    vitrine: { acesso },
    carrinho: { acesso },
    pedidos: { acesso },
    fila: { acesso },
    metricas: {
      acesso,
      cache: opcoes.cache ?? cacheEmMemoria(),
      ...(opcoes.agora === undefined ? {} : { agora: opcoes.agora }),
    },
  });
}

/** O token de dono da identidade informada. */
export function tokenDoDonoDasMetricas(identidadeId: string): string {
  return tokenDeAcesso(identidadeId, "OWNER");
}

/** `GET /v1/lojas/:apelido/metricas` com a sessão do dono. */
export function lerMetricas(
  app: ReturnType<typeof criarApp>,
  apelido: string,
  token: string,
  query: Record<string, string> = {},
) {
  return request(app)
    .get(`/v1/lojas/${apelido}/metricas`)
    .query(query)
    .set("Authorization", comoPortador(token));
}

/** `GET /v1/lojas/:apelido/metricas/exportar` com a sessão do dono. */
export function exportarMetricas(
  app: ReturnType<typeof criarApp>,
  apelido: string,
  token: string,
  query: Record<string, string> = {},
) {
  return request(app)
    .get(`/v1/lojas/${apelido}/metricas/exportar`)
    .query(query)
    .set("Authorization", comoPortador(token));
}

/** Um item do pedido gravado pela prova. */
export interface ItemDeMetrica {
  readonly nome: string;
  readonly quantidade: number;
  readonly totalCentavos: number;
}

/** Um pedido como a prova o descreve: quando, em que estado, quanto. */
export interface PedidoDeMetrica {
  readonly colocadoEm: Date | string;
  readonly totalCentavos: number;
  readonly status?: string;
  readonly canal?: "ONLINE" | "MANUAL";
  /** "aguardando": abriu o WhatsApp e não confirmou o envio (AC-611). */
  readonly whatsapp?: "aguardando" | "confirmado";
  readonly itens?: readonly ItemDeMetrica[];
  readonly cliente?: {
    readonly nome: string;
    readonly telefone: string;
    readonly rua: string;
  };
}

/** O pedido gravado. */
export interface PedidoGravado {
  readonly id: string;
  readonly numero: number;
}

/**
 * Grava o pedido pela credencial de migração, com o instante que a prova
 * manda. O número segue o maior da loja; o código e o token de
 * acompanhamento são únicos como os de verdade.
 */
export async function inserirPedido(
  migrador: pg.Client,
  lojaId: string,
  pedido: PedidoDeMetrica,
): Promise<PedidoGravado> {
  const colocadoEm = new Date(pedido.colocadoEm);
  const clicado = pedido.whatsapp === undefined ? null : colocadoEm;
  const confirmado = pedido.whatsapp === "confirmado" ? colocadoEm : null;
  const { rows } = await migrador.query<{ id: string; number: string }>(
    `WITH proximo AS (
       SELECT coalesce(max(number), 0) + 1 AS n FROM app.orders WHERE store_id = $1
     )
     INSERT INTO app.orders
       (store_id, number, code, public_token, status, channel, total_cents,
        subtotal_cents, items_total_cents, placed_at,
        whatsapp_clicked_at, whatsapp_confirmed_at, fulfillment)
     SELECT $1, n, 'M' || n, $2, $3, $4, $5, $5, $5, $6, $7, $8, $9 FROM proximo
     RETURNING id, number`,
    [
      lojaId,
      randomBytes(16).toString("hex"),
      pedido.status ?? "ACCEPTED",
      pedido.canal ?? "ONLINE",
      pedido.totalCentavos,
      colocadoEm,
      clicado,
      confirmado,
      // Pedido em "Retirada" só existe para retirada (0053, card #25).
      pedido.status === "READY_FOR_PICKUP" ? "PICKUP" : "DELIVERY",
    ],
  );
  const gravado = rows[0];
  if (gravado === undefined) throw new Error("o pedido de apoio não entrou");

  const itens = pedido.itens ?? [
    {
      nome: "Item da prova",
      quantidade: 1,
      totalCentavos: pedido.totalCentavos,
    },
  ];
  for (const [ordem, item] of itens.entries()) {
    await migrador.query(
      `INSERT INTO app.order_items
         (store_id, order_id, product_name, quantity, unit_price_cents,
          line_total_cents, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        lojaId,
        gravado.id,
        item.nome,
        item.quantidade,
        Math.round(item.totalCentavos / item.quantidade),
        item.totalCentavos,
        ordem,
      ],
    );
  }

  if (pedido.cliente !== undefined) {
    await migrador.query(
      `INSERT INTO app.order_contacts (order_id, store_id, name, phone_e164, street)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        gravado.id,
        lojaId,
        pedido.cliente.nome,
        pedido.cliente.telefone,
        pedido.cliente.rua,
      ],
    );
  }

  return { id: gravado.id, numero: Number(gravado.number) };
}
