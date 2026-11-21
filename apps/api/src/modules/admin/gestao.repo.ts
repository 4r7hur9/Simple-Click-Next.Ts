/**
 * Consultas de gestão da administração (card #29): números de uma loja e a
 * equipe de uma loja. As contas da plataforma agora são as Pessoas
 * (`pessoas.repo.ts`, card #170).
 *
 * Tudo roda na transação da requisição, pela credencial `sc_admin`. Nada aqui
 * devolve dado de pedido além de contagem e soma: o que a administração vê de
 * uma loja é o tamanho dela, não os clientes dela.
 */

import {
  type EquipeDaLojaNaAdministracaoNoContrato,
  type MetricasDaLojaNoContrato,
} from "@simpleclick/contracts";
import { situacaoNaVenda, STATUS_DO_PEDIDO } from "@simpleclick/core";

import { transacaoAtual } from "../../core/db.ts";

const STATUS_DE_VENDA: string[] = STATUS_DO_PEDIDO.filter(
  (status) =>
    situacaoNaVenda({
      status,
      totalCentavos: 0,
      aguardandoConfirmacaoWhatsapp: false,
    }) === "VENDA",
);

interface LinhaDasMetricas {
  readonly criada_em: Date;
  readonly pedidos_total: number;
  readonly pedidos_periodo: number;
  readonly vendas_total: number;
  readonly vendas_periodo: number;
  readonly fat_total: bigint | number;
  readonly fat_periodo: bigint | number;
  readonly ultimo: Date | null;
  readonly clientes: number;
  readonly produtos: number;
  readonly categorias: number;
}

/** Os números de uma loja; `null` quando ela não existe. */
export async function lerMetricasDaLoja(
  lojaId: string,
  dias: number,
  agora: Date,
): Promise<MetricasDaLojaNoContrato | null> {
  const desde = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);
  const [linha] = await transacaoAtual().$queryRaw<LinhaDasMetricas[]>`
    SELECT s.created_at AS criada_em,
           (SELECT count(*)::int FROM app.orders o
             WHERE o.store_id = s.id AND o.status <> 'CANCELLED') AS pedidos_total,
           (SELECT count(*)::int FROM app.orders o
             WHERE o.store_id = s.id AND o.status <> 'CANCELLED'
               AND o.placed_at >= ${desde}) AS pedidos_periodo,
           (SELECT count(*)::int FROM app.orders o
             WHERE o.store_id = s.id
               AND o.status = ANY(${STATUS_DE_VENDA}::text[])) AS vendas_total,
           (SELECT count(*)::int FROM app.orders o
             WHERE o.store_id = s.id
               AND o.status = ANY(${STATUS_DE_VENDA}::text[])
               AND o.placed_at >= ${desde}) AS vendas_periodo,
           (SELECT coalesce(sum(o.total_cents), 0)::bigint FROM app.orders o
             WHERE o.store_id = s.id
               AND o.status = ANY(${STATUS_DE_VENDA}::text[])) AS fat_total,
           (SELECT coalesce(sum(o.total_cents), 0)::bigint FROM app.orders o
             WHERE o.store_id = s.id
               AND o.status = ANY(${STATUS_DE_VENDA}::text[])
               AND o.placed_at >= ${desde}) AS fat_periodo,
           (SELECT max(o.placed_at) FROM app.orders o
             WHERE o.store_id = s.id AND o.status <> 'CANCELLED') AS ultimo,
           (SELECT count(*)::int FROM app.store_customers c
             WHERE c.store_id = s.id AND c.removed_at IS NULL
               AND c.anonymized_at IS NULL) AS clientes,
           (SELECT count(*)::int FROM app.products p
             WHERE p.store_id = s.id AND p.deleted_at IS NULL) AS produtos,
           (SELECT count(*)::int FROM app.categories c
             WHERE c.store_id = s.id AND c.deleted_at IS NULL) AS categorias
      FROM app.stores s
     WHERE s.id = ${lojaId}::uuid`;
  if (linha === undefined) return null;
  const faturamentoTotal = Number(linha.fat_total);
  const vendasTotal = Number(linha.vendas_total);
  return {
    dias,
    faturamento: {
      totalCentavos: faturamentoTotal,
      periodoCentavos: Number(linha.fat_periodo),
    },
    pedidos: {
      total: Number(linha.pedidos_total),
      periodo: Number(linha.pedidos_periodo),
    },
    vendas: {
      total: vendasTotal,
      periodo: Number(linha.vendas_periodo),
    },
    clientes: Number(linha.clientes),
    produtos: Number(linha.produtos),
    categorias: Number(linha.categorias),
    ticketMedioCentavos:
      vendasTotal === 0 ? null : Math.round(faturamentoTotal / vendasTotal),
    ultimoPedidoEm: linha.ultimo?.toISOString() ?? null,
    cadastradaEm: linha.criada_em.toISOString(),
  };
}

/** Quem tem acesso à loja, dono e equipe, inclusive os acessos retirados. */
export async function lerEquipeDaLoja(
  lojaId: string,
): Promise<EquipeDaLojaNaAdministracaoNoContrato | null> {
  const tx = transacaoAtual();
  const existe = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM app.stores WHERE id = ${lojaId}::uuid`;
  if (existe.length === 0) return null;
  const linhas = await tx.$queryRaw<
    {
      id: string;
      identity_id: string;
      display_name: string | null;
      email_norm: string;
      role: string;
      revogado: boolean;
      aceito: boolean;
      created_at: Date;
    }[]
  >`
    SELECT m.id::text AS id, m.identity_id::text AS identity_id, i.display_name,
           i.email_norm, m.role, m.revoked_at IS NOT NULL AS revogado,
           m.invite_accepted_at IS NOT NULL AS aceito, m.created_at
      FROM app.store_members m
      JOIN app.identities i ON i.id = m.identity_id
     WHERE m.store_id = ${lojaId}::uuid
     ORDER BY (m.role = 'OWNER') DESC, m.revoked_at NULLS FIRST, m.created_at`;
  return {
    membros: linhas.map((linha) => ({
      id: linha.id,
      identidadeId: linha.identity_id,
      nome: linha.display_name,
      email: linha.email_norm,
      papel: linha.role === "OWNER" ? "OWNER" : "STAFF",
      ativo: !linha.revogado,
      conviteAceito: linha.aceito,
      desde: linha.created_at.toISOString(),
    })),
  };
}
