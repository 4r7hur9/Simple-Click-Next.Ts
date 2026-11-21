/**
 * Checagens COMPARTILHADAS do volume (D-13): a carga (no `--ensaio`) e a
 * validação usam as mesmas regras, então não podem divergir.
 *
 * Duas famílias:
 *
 * - funções puras sobre linhas lidas do banco (`divergenciasDoPedido`), que
 *   recalculam dinheiro, datas e histórico SEM usar o montador do plano; e
 * - consultas de invariantes em SQL (`INVARIANTES`), que cobrem os 100.000
 *   pedidos de uma vez. Cada uma devolve a contagem de violações (esperado 0).
 *
 * Nada aqui abre transação: quem chama decide (a validação usa READ ONLY).
 *
 * Convenções de `order_items` (ver 09-volume.md):
 * - volume (checkout da vitrine): `line_total = unit_price × quantity`;
 * - base do #135 (seed): `line_total = unit_price × quantity + options_total`.
 */

import { proximosStatusDoPedido } from "../simulacao/transicoes.ts";
import { PRIMEIRO_NUMERO_DO_VOLUME, ULTIMO_NUMERO_DA_BASE } from "./parametros.ts";
import { semear } from "./plano.ts";

export type Convencao = "checkout" | "seed";

export interface LinhaDePedido {
  readonly codigo: string;
  readonly status: string;
  readonly entrega: string;
  readonly subtotal: number;
  readonly itensTotal: number;
  readonly frete: number;
  readonly desconto: number;
  readonly total: number;
  readonly feitoEm: Date;
  readonly aceitoEm: Date | null;
  readonly concluidoEm: Date | null;
  readonly canceladoEm: Date | null;
  readonly atualizadoEm: Date;
}

export interface LinhaDeItem {
  readonly quantidade: number;
  readonly precoUnitario: number;
  readonly totalDasOpcoes: number;
  readonly totalDaLinha: number;
}

export interface LinhaDeHistorico {
  readonly de: string | null;
  readonly para: string;
  readonly quando: Date;
}

export interface ContextoDaChecagem {
  readonly convencao: Convencao;
  readonly referencia: Date;
  /** Para pedidos do volume: nenhum é anterior à aprovação da loja. */
  readonly aprovadaEm: Date | null;
}

/** As regras de um pedido. Devolve mensagens (sem dado pessoal); vazio = íntegro. */
export function divergenciasDoPedido(
  pedido: LinhaDePedido,
  itens: readonly LinhaDeItem[],
  historico: readonly LinhaDeHistorico[],
  contexto: ContextoDaChecagem,
): string[] {
  const erros: string[] = [];
  const falha = (mensagem: string): void => {
    erros.push(`${pedido.codigo}: ${mensagem}`);
  };

  // Dinheiro, em centavos inteiros.
  if (itens.length < 1 || (itens.length > 3 && contexto.convencao === "checkout")) {
    falha(`quantidade de itens inesperada (${itens.length})`);
  }
  let soma = 0;
  for (const item of itens) {
    const esperada =
      contexto.convencao === "checkout"
        ? item.precoUnitario * item.quantidade
        : item.precoUnitario * item.quantidade + item.totalDasOpcoes;
    if (item.totalDaLinha !== esperada) falha("line_total diverge da convenção");
    if (item.quantidade < 1) falha("quantidade do item inválida");
    soma += item.totalDaLinha;
  }
  if (pedido.subtotal !== soma) falha("subtotal ≠ soma dos itens");
  if (pedido.itensTotal !== soma) falha("items_total ≠ soma dos itens");
  if (pedido.total !== pedido.subtotal + pedido.frete - pedido.desconto) {
    falha("total ≠ subtotal + frete − desconto");
  }

  // Histórico: começa em PENDING, encadeia transições permitidas e termina no status.
  const ordenado = [...historico].sort((a, b) => a.quando.getTime() - b.quando.getTime());
  if (ordenado.length === 0) {
    falha("sem histórico");
    return erros;
  }
  if (ordenado[0]!.de !== null || ordenado[0]!.para !== "PENDING") {
    falha("o histórico não começa em PENDING");
  }
  for (let i = 1; i < ordenado.length; i++) {
    const anterior = ordenado[i - 1]!;
    const atual = ordenado[i]!;
    if (atual.de !== anterior.para) falha("histórico sem encadeamento");
    if (!proximosStatusDoPedido(anterior.para, pedido.entrega).includes(atual.para)) {
      falha(`transição não permitida ${anterior.para} → ${atual.para}`);
    }
  }
  const ultimo = ordenado[ordenado.length - 1]!;
  if (ultimo.para !== pedido.status) falha("o histórico não termina no status do pedido");

  // Datas.
  const ref = contexto.referencia.getTime();
  if (ordenado.some((h) => h.quando.getTime() > ref)) falha("evento posterior à referência");
  if (pedido.feitoEm.getTime() > ref) falha("placed_at posterior à referência");
  if (contexto.aprovadaEm !== null && pedido.feitoEm.getTime() < contexto.aprovadaEm.getTime()) {
    falha("pedido anterior à aprovação da loja");
  }
  const momento = (estado: string): number | null =>
    ordenado.find((h) => h.para === estado)?.quando.getTime() ?? null;
  const igual = (a: Date | null, b: number | null): boolean =>
    (a === null ? null : a.getTime()) === b;
  // Os carimbos só são conferidos no volume. O seed do #135 grava `completed_at`
  // e `cancelled_at` um passo DEPOIS do evento do histórico (inconsistência da
  // base, registrada no doc 09): a base fica como está e não reprova o volume.
  if (contexto.convencao === "checkout") {
    if (!igual(pedido.aceitoEm, momento("ACCEPTED"))) falha("accepted_at ≠ evento ACCEPTED");
    if (!igual(pedido.concluidoEm, momento("COMPLETED"))) falha("completed_at ≠ evento COMPLETED");
    if (!igual(pedido.canceladoEm, momento("CANCELLED"))) falha("cancelled_at ≠ evento CANCELLED");
    if (pedido.atualizadoEm.getTime() !== ultimo.quando.getTime()) falha("updated_at ≠ último evento");
  }
  return erros;
}

/** `amostra` números distintos em [1011, 1010 + quantidade], escolhidos pela semente (determinístico). */
export function escolherAmostra(
  semente: string,
  codigoDaLoja: string,
  quantidade: number,
  tamanho = 10,
): number[] {
  const sorteio = semear(`${semente}|amostra|${codigoDaLoja}`);
  const escolhidos = new Set<number>();
  const alvo = Math.min(tamanho, quantidade);
  while (escolhidos.size < alvo) {
    escolhidos.add(PRIMEIRO_NUMERO_DO_VOLUME + Math.floor(sorteio() * quantidade));
  }
  return [...escolhidos].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Invariantes em SQL (todos os pedidos do volume)
// ---------------------------------------------------------------------------

export interface Invariante {
  readonly nome: string;
  /** Devolve uma linha com `n`: o número de violações (esperado 0). */
  readonly sql: string;
  /** Usa o parâmetro $1 (referência ISO)? */
  readonly usaReferencia?: boolean;
}

const LOJAS_SIM = `(SELECT id FROM app.stores WHERE code LIKE 'SIM-%')`;
const volumeDe = (alias: string): string =>
  `${alias}.number > ${ULTIMO_NUMERO_DA_BASE} AND ${alias}.store_id IN ${LOJAS_SIM}`;
const DO_VOLUME = volumeDe("o");
/** Os ids dos pedidos do volume, para semi-join (vira hash join em vez de uma sub-consulta por pedido). */
const IDS_DO_VOLUME = `(SELECT v.id FROM app.orders v WHERE ${volumeDe("v")})`;

/** Pares (de, para, entrega) permitidos, a partir da mesma tabela do núcleo. */
function transicoesEmValues(): string {
  const linhas: string[] = [];
  for (const entrega of ["DELIVERY", "PICKUP"]) {
    for (const de of [
      "PENDING",
      "ACCEPTED",
      "PREPARING",
      "READY_FOR_PICKUP",
      "OUT_FOR_DELIVERY",
    ]) {
      for (const para of proximosStatusDoPedido(de, entrega)) {
        linhas.push(`('${de}','${para}','${entrega}')`);
      }
    }
  }
  return linhas.join(",");
}

export const INVARIANTES: readonly Invariante[] = [
  {
    nome: "line_total = unit_price × quantity (checkout)",
    sql: `SELECT count(*)::int AS n FROM app.order_items i
           WHERE i.order_id IN ${IDS_DO_VOLUME}
             AND i.line_total_cents <> i.unit_price_cents * i.quantity`,
  },
  {
    nome: "subtotal e items_total = soma das linhas",
    sql: `SELECT count(*)::int AS n FROM app.orders o
            LEFT JOIN (SELECT order_id, sum(line_total_cents) AS soma FROM app.order_items GROUP BY order_id) s
              ON s.order_id = o.id
           WHERE ${DO_VOLUME}
             AND (o.subtotal_cents <> coalesce(s.soma, 0) OR o.items_total_cents <> coalesce(s.soma, 0))`,
  },
  {
    nome: "total = subtotal + frete − descontos",
    sql: `SELECT count(*)::int AS n FROM app.orders o WHERE ${DO_VOLUME}
             AND o.total_cents <> o.subtotal_cents + o.delivery_fee_cents - o.discount_cents
                                  - o.coupon_discount_cents - o.pickup_discount_cents`,
  },
  {
    nome: "pedido sem itens, sem histórico, sem contato ou sem cliente",
    sql: `SELECT (
             (SELECT count(*) FROM app.orders o WHERE ${DO_VOLUME}
                 AND NOT EXISTS (SELECT 1 FROM app.order_items i WHERE i.order_id = o.id))
           + (SELECT count(*) FROM app.orders o WHERE ${DO_VOLUME}
                 AND NOT EXISTS (SELECT 1 FROM app.order_status_history h WHERE h.order_id = o.id))
           + (SELECT count(*) FROM app.orders o WHERE ${DO_VOLUME}
                 AND NOT EXISTS (SELECT 1 FROM app.order_contacts c WHERE c.order_id = o.id))
           + (SELECT count(*) FROM app.orders o WHERE ${DO_VOLUME} AND o.store_customer_id IS NULL))::int AS n`,
  },
  {
    nome: "filho de outra loja (itens, opções, histórico, contato)",
    sql: `SELECT (
             (SELECT count(*) FROM app.order_items i JOIN app.orders o ON o.id = i.order_id
               WHERE ${DO_VOLUME} AND i.store_id <> o.store_id)
           + (SELECT count(*) FROM app.order_item_options x
                JOIN app.order_items i ON i.id = x.order_item_id JOIN app.orders o ON o.id = i.order_id
               WHERE ${DO_VOLUME} AND x.store_id <> o.store_id)
           + (SELECT count(*) FROM app.order_status_history h JOIN app.orders o ON o.id = h.order_id
               WHERE ${DO_VOLUME} AND h.store_id <> o.store_id)
           + (SELECT count(*) FROM app.order_contacts c JOIN app.orders o ON o.id = c.order_id
               WHERE ${DO_VOLUME} AND c.store_id <> o.store_id))::int AS n`,
  },
  {
    nome: "cliente ou opção de outra loja",
    sql: `SELECT (
             (SELECT count(*) FROM app.orders o JOIN app.store_customers c ON c.id = o.store_customer_id
               WHERE ${DO_VOLUME} AND c.store_id <> o.store_id)
           + (SELECT count(*) FROM app.order_item_options x
                JOIN app.order_items i ON i.id = x.order_item_id JOIN app.orders o ON o.id = i.order_id
                JOIN app.option_items oi ON oi.id = x.option_item_id
               WHERE ${DO_VOLUME} AND oi.store_id <> o.store_id))::int AS n`,
  },
  {
    nome: "histórico: início fora de PENDING ou transição não permitida",
    sql: `SELECT (
             (SELECT count(*) FROM app.orders o WHERE ${DO_VOLUME})
           - (SELECT count(DISTINCT h.order_id) FROM app.order_status_history h
               WHERE h.from_status IS NULL AND h.to_status = 'PENDING' AND h.order_id IN ${IDS_DO_VOLUME})
           + (SELECT count(*) FROM app.order_status_history h JOIN app.orders o ON o.id = h.order_id
               WHERE ${DO_VOLUME} AND h.from_status IS NOT NULL
                 AND (h.from_status, h.to_status, o.fulfillment) NOT IN (VALUES ${transicoesEmValues()})))::int AS n`,
  },
  {
    nome: "status ≠ último evento do histórico",
    sql: `SELECT count(*)::int AS n FROM app.orders o
            JOIN (SELECT DISTINCT ON (h.order_id) h.order_id, h.to_status
                    FROM app.order_status_history h WHERE h.order_id IN ${IDS_DO_VOLUME}
                   ORDER BY h.order_id, h.occurred_at DESC) u ON u.order_id = o.id
           WHERE ${DO_VOLUME} AND o.status <> u.to_status`,
  },
  {
    nome: "accepted_at/completed_at/cancelled_at/updated_at ≠ eventos",
    sql: `SELECT count(*)::int AS n FROM app.orders o
            LEFT JOIN (SELECT h.order_id,
                              max(h.occurred_at) FILTER (WHERE h.to_status = 'ACCEPTED') AS aceito,
                              max(h.occurred_at) FILTER (WHERE h.to_status = 'COMPLETED') AS concluido,
                              max(h.occurred_at) FILTER (WHERE h.to_status = 'CANCELLED') AS cancelado,
                              max(h.occurred_at) AS ultimo
                         FROM app.order_status_history h WHERE h.order_id IN ${IDS_DO_VOLUME}
                        GROUP BY h.order_id) e ON e.order_id = o.id
           WHERE ${DO_VOLUME}
             AND (o.accepted_at IS DISTINCT FROM e.aceito OR o.completed_at IS DISTINCT FROM e.concluido
               OR o.cancelled_at IS DISTINCT FROM e.cancelado OR o.updated_at IS DISTINCT FROM e.ultimo)`,
  },
  {
    nome: "pedido anterior à aprovação da loja ou evento posterior à referência",
    usaReferencia: true,
    sql: `SELECT (
             (SELECT count(*) FROM app.orders o JOIN app.stores s ON s.id = o.store_id
               WHERE ${DO_VOLUME}
                 AND (o.placed_at < s.approved_at OR o.placed_at > $1::timestamptz OR o.updated_at > $1::timestamptz))
           + (SELECT count(*) FROM app.order_status_history h
               WHERE h.order_id IN ${IDS_DO_VOLUME} AND h.occurred_at > $1::timestamptz))::int AS n`,
  },
  {
    nome: "sequência atrás do maior número",
    sql: `SELECT count(*)::int AS n FROM app.stores s
            LEFT JOIN app.store_sequences q ON q.store_id = s.id AND q.kind = 'order'
           WHERE s.code LIKE 'SIM-%'
             AND coalesce(q.last_value, 0) < (SELECT coalesce(max(o.number), 0) FROM app.orders o WHERE o.store_id = s.id)`,
  },
  {
    nome: "agregados dos clientes do volume ≠ pedidos",
    sql: `SELECT count(*)::int AS n FROM app.store_customers c
            JOIN (SELECT o.store_customer_id AS id,
                         count(*) FILTER (WHERE o.status <> 'CANCELLED')::int AS pedidos,
                         coalesce(sum(o.total_cents) FILTER (WHERE o.status = 'COMPLETED'), 0) AS gasto,
                         max(o.placed_at) AS ultimo
                    FROM app.orders o WHERE ${DO_VOLUME} GROUP BY o.store_customer_id) t ON t.id = c.id
           WHERE c.orders_count <> t.pedidos OR c.total_spent_cents <> t.gasto
              OR c.last_order_at IS DISTINCT FROM t.ultimo`,
  },
  {
    nome: "pedido do volume com canal ou atacado fora do checkout (ONLINE, sem faixa de atacado)",
    sql: `SELECT (
             (SELECT count(*) FROM app.orders o WHERE ${DO_VOLUME} AND o.channel <> 'ONLINE')
           + (SELECT count(*) FROM app.order_items i JOIN app.orders o ON o.id = i.order_id
               WHERE ${DO_VOLUME} AND (i.wholesale_min_quantity IS NOT NULL OR i.wholesale_discount_kind IS NOT NULL))
           + (SELECT count(*) FROM app.order_item_options x JOIN app.order_items i ON i.id = x.order_item_id
                JOIN app.orders o ON o.id = i.order_id
               WHERE ${DO_VOLUME} AND (x.price_delta_cents <> 0 OR x.action <> 'ADD')))::int AS n`,
  },
];
