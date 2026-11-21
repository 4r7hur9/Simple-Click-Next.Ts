/**
 * Leituras da base do #135 e do estado do volume (somente SELECT).
 *
 * Usadas pela carga (pré-voo), pela validação e pelo EXPLAIN. Recebem um
 * `ClienteSql` já guardado: nada aqui abre conexão.
 */

import { createHash } from "node:crypto";

import type { ClienteSql, LinhaDeConsulta } from "../../src/migrate.ts";
import { ErroDeGuarda } from "../simulacao/banco.ts";
import {
  LOJAS_DO_VOLUME,
  PEDIDOS_DA_BASE_POR_LOJA,
  PRIMEIRO_NUMERO_DO_VOLUME,
  ULTIMO_NUMERO_DA_BASE,
} from "./parametros.ts";
import type {
  Entrega,
  LojaDoBanco,
  ModeloDeItem,
  OpcaoDoModelo,
  Pagamento,
} from "./plano.ts";

export const texto = (l: LinhaDeConsulta, coluna: string): string => String(l[coluna]);
export const textoOuNulo = (l: LinhaDeConsulta, coluna: string): string | null =>
  l[coluna] === null || l[coluna] === undefined ? null : String(l[coluna]);
export const numero = (l: LinhaDeConsulta, coluna: string): number => Number(l[coluna]);

const PADRAO_DO_CODIGO = /^SIM-([0-9a-f]{8})-(\d{3})$/;

/** As 100 lojas do #135, exatamente (códigos SIM-<impressão>-000..099, uma só impressão). */
export async function lerLojasDaBase(cliente: ClienteSql): Promise<LojaDoBanco[]> {
  const lojas = await cliente.query(
    `SELECT id, code, approved_at FROM app.stores WHERE code LIKE 'SIM-%' ORDER BY code`,
  );
  if (lojas.rows.length !== LOJAS_DO_VOLUME) {
    throw new ErroDeGuarda(
      `A base tem ${lojas.rows.length} lojas SIM-, e o volume espera ${LOJAS_DO_VOLUME}.`,
    );
  }
  const impressoes = new Set<string>();
  const base = lojas.rows.map((l, posicao) => {
    const m = PADRAO_DO_CODIGO.exec(texto(l, "code"));
    if (m === null || Number(m[2]) !== posicao) {
      throw new ErroDeGuarda("Os códigos das lojas não seguem SIM-<impressão>-000..099.");
    }
    impressoes.add(m[1]!);
    return {
      id: texto(l, "id"),
      codigo: texto(l, "code"),
      indice: posicao,
      aprovadaEm: new Date(texto(l, "approved_at")),
    };
  });
  if (impressoes.size !== 1) {
    throw new ErroDeGuarda("As lojas SIM- misturam impressões de perfil diferentes.");
  }
  const ids = base.map((l) => l.id);

  const pedidos = await cliente.query(
    `SELECT store_id, fulfillment, payment_method, delivery_fee_cents,
            pix_key_snapshot, pix_holder_snapshot, pix_key_type_snapshot
       FROM app.orders
      WHERE store_id = ANY($1::uuid[]) AND number <= ${ULTIMO_NUMERO_DA_BASE}
      ORDER BY store_id, number`,
    [ids],
  );
  const itens = await cliente.query(
    `SELECT o.store_id, o.number, i.id, i.product_id, i.variant_id, i.product_name,
            i.variant_name, i.sku_snapshot, i.unit_price_cents, i.compare_at_cents,
            i.unit_cost_cents, i.price_kind_snapshot
       FROM app.order_items i JOIN app.orders o ON o.id = i.order_id
      WHERE o.store_id = ANY($1::uuid[]) AND o.number <= ${ULTIMO_NUMERO_DA_BASE}
        AND i.wholesale_min_quantity IS NULL
      ORDER BY o.store_id, o.number, i.sort_order`,
    [ids],
  );
  const opcoes = await cliente.query(
    `SELECT oio.order_item_id, oio.option_group_id, oio.option_item_id,
            oio.group_name_snapshot, oio.option_name_snapshot, oio.kind_snapshot,
            oio.price_delta_cents
       FROM app.order_item_options oio
       JOIN app.order_items i ON i.id = oio.order_item_id
       JOIN app.orders o ON o.id = i.order_id
      WHERE o.store_id = ANY($1::uuid[]) AND o.number <= ${ULTIMO_NUMERO_DA_BASE}
        AND i.wholesale_min_quantity IS NULL AND oio.action = 'ADD'
      ORDER BY oio.order_item_id, oio.sort_order`,
    [ids],
  );
  const donas = await cliente.query(
    `SELECT DISTINCT ON (h.store_id) h.store_id, h.changed_by_identity_id
       FROM app.order_status_history h
       JOIN app.orders o ON o.id = h.order_id
      WHERE h.store_id = ANY($1::uuid[]) AND o.number <= ${ULTIMO_NUMERO_DA_BASE}
        AND h.changed_by_identity_id IS NOT NULL
      ORDER BY h.store_id, h.occurred_at`,
    [ids],
  );

  const opcoesPorItem = new Map<string, OpcaoDoModelo[]>();
  for (const o of opcoes.rows) {
    const lista = opcoesPorItem.get(texto(o, "order_item_id")) ?? [];
    lista.push({
      grupoId: textoOuNulo(o, "option_group_id"),
      itemId: textoOuNulo(o, "option_item_id"),
      grupo: texto(o, "group_name_snapshot"),
      opcao: texto(o, "option_name_snapshot"),
      tipo: textoOuNulo(o, "kind_snapshot"),
      acrescimo: numero(o, "price_delta_cents"),
    });
    opcoesPorItem.set(texto(o, "order_item_id"), lista);
  }

  return base.map((loja) => {
    const meus = pedidos.rows.filter((p) => texto(p, "store_id") === loja.id);
    const entregas = [...new Set(meus.map((p) => texto(p, "fulfillment")))] as Entrega[];
    const pagamentos = [
      ...new Set(meus.map((p) => textoOuNulo(p, "payment_method")).filter((x) => x !== null)),
    ] as Pagamento[];
    const comPix = meus.find((p) => textoOuNulo(p, "pix_key_snapshot") !== null);
    const frete = Math.max(
      0,
      ...meus.filter((p) => texto(p, "fulfillment") === "DELIVERY").map((p) => numero(p, "delivery_fee_cents")),
    );

    const modelos = new Map<string, ModeloDeItem>();
    for (const i of itens.rows.filter((x) => texto(x, "store_id") === loja.id)) {
      const op = opcoesPorItem.get(texto(i, "id")) ?? [];
      const chave = [textoOuNulo(i, "product_id"), textoOuNulo(i, "variant_id"), ...op.map((o) => o.itemId)].join("|");
      if (modelos.has(chave)) continue;
      modelos.set(chave, {
        produtoId: textoOuNulo(i, "product_id"),
        varianteId: textoOuNulo(i, "variant_id"),
        produto: texto(i, "product_name"),
        variante: textoOuNulo(i, "variant_name"),
        sku: textoOuNulo(i, "sku_snapshot"),
        precoBase: numero(i, "unit_price_cents"),
        comparadoCom: i["compare_at_cents"] === null ? null : numero(i, "compare_at_cents"),
        custo: i["unit_cost_cents"] === null ? null : numero(i, "unit_cost_cents"),
        tipoDePreco: textoOuNulo(i, "price_kind_snapshot"),
        opcoes: op,
      });
    }
    return {
      ...loja,
      modelos: [...modelos.values()],
      frete,
      entregas: entregas.length > 0 ? entregas : ["PICKUP"],
      pagamentos: pagamentos.length > 0 ? pagamentos : ["CASH"],
      pix:
        comPix === undefined
          ? null
          : {
              chave: texto(comPix, "pix_key_snapshot"),
              titular: textoOuNulo(comPix, "pix_holder_snapshot") ?? "",
              tipo: textoOuNulo(comPix, "pix_key_type_snapshot") ?? "RANDOM",
            },
      quemMudaStatus:
        textoOuNulo(donas.rows.find((d) => texto(d, "store_id") === loja.id) ?? {}, "changed_by_identity_id"),
    };
  });
}

// ---------------------------------------------------------------------------
// Estado do volume por loja
// ---------------------------------------------------------------------------

export interface EstadoDaLoja {
  readonly lojaId: string;
  readonly pedidosDaBase: number;
  /** Pedidos com number > 1010 (volume ou estranhos). */
  readonly pedidosAcima: number;
  /** Dos `pedidosAcima`, quantos têm id planejado e number em 1011..1010+N. */
  readonly pedidosDoPlano: number;
  readonly numeroMaximo: number;
  readonly ultimaSequencia: number | null;
}

export async function lerEstadoDaLoja(
  cliente: ClienteSql,
  lojaId: string,
  idsPlanejados: readonly string[],
  quantidade: number,
): Promise<EstadoDaLoja> {
  const r = await cliente.query(
    `SELECT count(*) FILTER (WHERE number <= ${ULTIMO_NUMERO_DA_BASE})::int AS base,
            count(*) FILTER (WHERE number > ${ULTIMO_NUMERO_DA_BASE})::int AS acima,
            count(*) FILTER (WHERE number BETWEEN ${PRIMEIRO_NUMERO_DO_VOLUME}
                                   AND ${ULTIMO_NUMERO_DA_BASE} + $3::int
                               AND id = ANY($2::uuid[]))::int AS do_plano,
            coalesce(max(number), 0)::bigint AS maximo,
            (SELECT last_value FROM app.store_sequences
              WHERE store_id = $1 AND kind = 'order') AS sequencia
       FROM app.orders WHERE store_id = $1`,
    [lojaId, idsPlanejados, quantidade],
  );
  const l = r.rows[0]!;
  return {
    lojaId,
    pedidosDaBase: numero(l, "base"),
    pedidosAcima: numero(l, "acima"),
    pedidosDoPlano: numero(l, "do_plano"),
    numeroMaximo: numero(l, "maximo"),
    ultimaSequencia: l["sequencia"] === null ? null : numero(l, "sequencia"),
  };
}

export type SituacaoDaLoja = "vazia" | "completa" | "divergente";

/** Vazia (só a base), completa (exatamente o plano) ou divergente (qualquer outra coisa). */
export function situacaoDaLoja(e: EstadoDaLoja, quantidade: number): SituacaoDaLoja {
  if (e.pedidosDaBase !== PEDIDOS_DA_BASE_POR_LOJA) return "divergente";
  if (e.pedidosAcima === 0) {
    return e.numeroMaximo === ULTIMO_NUMERO_DA_BASE && e.ultimaSequencia === ULTIMO_NUMERO_DA_BASE
      ? "vazia"
      : "divergente";
  }
  return e.pedidosAcima === quantidade &&
    e.pedidosDoPlano === quantidade &&
    e.numeroMaximo === ULTIMO_NUMERO_DA_BASE + quantidade &&
    e.ultimaSequencia === ULTIMO_NUMERO_DA_BASE + quantidade
    ? "completa"
    : "divergente";
}

// ---------------------------------------------------------------------------
// Impressão da base do #135 (number <= 1010), à prova do volume
// ---------------------------------------------------------------------------

/**
 * Hash do que o #135 criou: pedidos com number <= 1010, seus filhos e os
 * clientes que NÃO são do volume. Inserir linhas do volume não o altera. A
 * `impressoesDoBanco` do #135 não serve: ela cobre todos os pedidos SIM-.
 */
export async function impressaoDaBase(
  cliente: ClienteSql,
  clientesDoVolume: readonly string[],
): Promise<string> {
  const base = `FROM app.orders o JOIN app.stores s ON s.id = o.store_id
                 WHERE s.code LIKE 'SIM-%' AND o.number <= ${ULTIMO_NUMERO_DA_BASE}`;
  const consultas: readonly [string, string, unknown[]][] = [
    [
      "pedidos",
      `SELECT coalesce(string_agg(concat_ws('|', o.id, o.number, o.code, o.status, o.subtotal_cents,
                o.total_cents, o.placed_at, o.store_customer_id), E'\\n' ORDER BY o.id), '') AS t ${base}`,
      [],
    ],
    [
      "itens",
      `SELECT coalesce(string_agg(concat_ws('|', i.id, i.order_id, i.product_id, i.quantity,
                i.unit_price_cents, i.options_total_cents, i.line_total_cents), E'\\n' ORDER BY i.id), '') AS t
         FROM app.order_items i WHERE i.order_id IN (SELECT o.id ${base})`,
      [],
    ],
    [
      "opcoes",
      `SELECT coalesce(string_agg(concat_ws('|', x.id, x.order_item_id, x.option_item_id, x.price_delta_cents),
                E'\\n' ORDER BY x.id), '') AS t
         FROM app.order_item_options x
        WHERE x.order_item_id IN (SELECT i.id FROM app.order_items i WHERE i.order_id IN (SELECT o.id ${base}))`,
      [],
    ],
    [
      "historico",
      `SELECT coalesce(string_agg(concat_ws('|', h.id, h.order_id, h.from_status, h.to_status, h.occurred_at),
                E'\\n' ORDER BY h.id), '') AS t
         FROM app.order_status_history h WHERE h.order_id IN (SELECT o.id ${base})`,
      [],
    ],
    [
      "clientes",
      `SELECT coalesce(string_agg(concat_ws('|', c.id, c.display_name, c.phone_e164, c.orders_count,
                c.total_spent_cents, c.last_order_at, c.identity_id), E'\\n' ORDER BY c.id), '') AS t
         FROM app.store_customers c JOIN app.stores s ON s.id = c.store_id
        WHERE s.code LIKE 'SIM-%' AND NOT (c.id = ANY($1::uuid[]))`,
      [clientesDoVolume],
    ],
  ];
  const partes: string[] = [];
  for (const [nome, sql, valores] of consultas) {
    const r = await cliente.query(sql, valores);
    partes.push(`${nome}:${texto(r.rows[0]!, "t")}`);
  }
  return createHash("sha256").update(partes.join("\n--\n")).digest("hex");
}
