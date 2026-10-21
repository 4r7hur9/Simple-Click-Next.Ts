/**
 * Consultas de gestão da administração (card #29): números de uma loja, a
 * equipe de uma loja e as contas da plataforma.
 *
 * Tudo roda na transação da requisição, pela credencial `sc_admin`. Nada aqui
 * devolve dado de pedido além de contagem e soma: o que a administração vê de
 * uma loja é o tamanho dela, não os clientes dela.
 */

import {
  somenteDigitos,
  type ConsultaDeContasNoContrato,
  type ContaNaAdministracaoNoContrato,
  type EquipeDaLojaNaAdministracaoNoContrato,
  type ListaDeContasNoContrato,
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

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

interface LinhaDaConta {
  readonly id: string;
  readonly display_name: string | null;
  readonly email_norm: string;
  readonly phone_e164: string | null;
  readonly created_at: Date;
  readonly eh_dono: boolean;
  readonly lojas: unknown;
  readonly pendentes: number;
  readonly em_uso: number | null;
  readonly limite: number | null;
}

interface LojaAgregada {
  readonly id: string;
  readonly nome: string;
  readonly apelido: string;
  readonly status: ContaNaAdministracaoNoContrato["lojas"][number]["status"];
  readonly papel: "OWNER" | "STAFF";
}

function lojasAgregadas(bruto: unknown): LojaAgregada[] {
  const lido =
    typeof bruto === "string" ? (JSON.parse(bruto) as unknown) : bruto;
  return Array.isArray(lido) ? (lido as LojaAgregada[]) : [];
}

function contaDaLinha(linha: LinhaDaConta): ContaNaAdministracaoNoContrato {
  return {
    identidadeId: linha.id,
    nome: linha.display_name,
    email: linha.email_norm,
    telefone: linha.phone_e164,
    criadaEm: linha.created_at.toISOString(),
    tipo: linha.eh_dono ? "DONO" : "EQUIPE",
    lojas: lojasAgregadas(linha.lojas),
    pendentes: Number(linha.pendentes),
    lojasEmUso: Number(linha.em_uso ?? 0),
    limiteDeLojas: linha.eh_dono ? Number(linha.limite ?? 0) : null,
  };
}

/**
 * As contas que têm vínculo com alguma loja (que não foi excluída): donos de
 * um lado, equipe do outro. Quem é dono de uma loja e equipe de outra conta
 * como dono. A conta de cliente puro não aparece aqui: ela não administra nada.
 */
export async function listarContas(
  consulta: ConsultaDeContasNoContrato,
): Promise<ListaDeContasNoContrato> {
  const texto = (consulta.busca ?? "").trim().toLowerCase();
  const trecho = `%${texto}%`;
  const digitos = somenteDigitos(texto);
  const telefone = digitos.length >= 3 ? `%${digitos}%` : null;
  const dono = consulta.tipo === "donos";
  const tx = transacaoAtual();

  const linhas = await tx.$queryRaw<(LinhaDaConta & { total: number })[]>`
    WITH base AS (
      SELECT i.id, i.display_name, i.email_norm, i.phone_e164, i.created_at,
             bool_or(m.role = 'OWNER') AS eh_dono,
             jsonb_agg(jsonb_build_object(
               'id', s.id::text, 'nome', s.name, 'apelido', s.slug,
               'status', s.status, 'papel', m.role)
               ORDER BY s.created_at DESC) AS lojas,
             count(*) FILTER (WHERE m.role = 'OWNER'
                                AND s.status = 'PENDING_APPROVAL')::int AS pendentes
        FROM app.identities i
        JOIN app.store_members m ON m.identity_id = i.id AND m.revoked_at IS NULL
        JOIN app.stores s ON s.id = m.store_id AND s.deleted_at IS NULL
       WHERE i.anonymized_at IS NULL
         AND (${texto} = ''
              OR app.sem_acento(lower(coalesce(i.display_name, ''))) LIKE app.sem_acento(${trecho})
              OR i.email_norm LIKE ${trecho}
              OR (${telefone}::text IS NOT NULL AND i.phone_e164 LIKE ${telefone}::text))
       GROUP BY i.id
    ),
    filtradas AS (SELECT * FROM base WHERE eh_dono = ${dono}),
    contagem AS (SELECT count(*)::int AS total FROM filtradas),
    pagina AS (
      SELECT f.*, v.limite, v.uso AS em_uso
        FROM filtradas f
        LEFT JOIN LATERAL app.limite_de_lojas_do_dono(f.id) v ON f.eh_dono
       ORDER BY f.pendentes DESC, f.created_at DESC, f.id
       LIMIT ${consulta.porPagina} OFFSET ${(consulta.pagina - 1) * consulta.porPagina}
    )
    SELECT pagina.*, contagem.total
      FROM contagem LEFT JOIN pagina ON true`;

  const [contagens] = await tx.$queryRaw<{ donos: number; equipe: number }[]>`
    WITH base AS (
      SELECT i.id, bool_or(m.role = 'OWNER') AS eh_dono
        FROM app.identities i
        JOIN app.store_members m ON m.identity_id = i.id AND m.revoked_at IS NULL
        JOIN app.stores s ON s.id = m.store_id AND s.deleted_at IS NULL
       WHERE i.anonymized_at IS NULL
         AND (${texto} = ''
              OR app.sem_acento(lower(coalesce(i.display_name, ''))) LIKE app.sem_acento(${trecho})
              OR i.email_norm LIKE ${trecho}
              OR (${telefone}::text IS NOT NULL AND i.phone_e164 LIKE ${telefone}::text))
       GROUP BY i.id
    )
    SELECT count(*) FILTER (WHERE eh_dono)::int AS donos,
           count(*) FILTER (WHERE NOT eh_dono)::int AS equipe
      FROM base`;

  return {
    contas: linhas.flatMap((linha) =>
      linha.id === null ? [] : [contaDaLinha(linha)],
    ),
    total: linhas[0]?.total ?? 0,
    pagina: consulta.pagina,
    porPagina: consulta.porPagina,
    contagens: {
      donos: Number(contagens?.donos ?? 0),
      equipe: Number(contagens?.equipe ?? 0),
    },
  };
}

/** Uma conta com as lojas dela; `null` quando não há conta com vínculo. */
export async function lerConta(
  identidadeId: string,
): Promise<ContaNaAdministracaoNoContrato | null> {
  const [linha] = await transacaoAtual().$queryRaw<LinhaDaConta[]>`
    SELECT i.id::text AS id, i.display_name, i.email_norm, i.phone_e164,
           i.created_at,
           coalesce(bool_or(m.role = 'OWNER'), false) AS eh_dono,
           coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id::text, 'nome', s.name, 'apelido', s.slug,
               'status', s.status, 'papel', m.role)
               ORDER BY s.created_at DESC) FILTER (WHERE s.id IS NOT NULL),
             '[]'::jsonb) AS lojas,
           (count(*) FILTER (WHERE m.role = 'OWNER'
                              AND s.status = 'PENDING_APPROVAL'))::int AS pendentes,
           (SELECT v.uso FROM app.limite_de_lojas_do_dono(i.id) v) AS em_uso,
           (SELECT v.limite FROM app.limite_de_lojas_do_dono(i.id) v) AS limite
      FROM app.identities i
      LEFT JOIN app.store_members m
        ON m.identity_id = i.id AND m.revoked_at IS NULL
      LEFT JOIN app.stores s ON s.id = m.store_id AND s.deleted_at IS NULL
     WHERE i.id = ${identidadeId}::uuid AND i.anonymized_at IS NULL
     GROUP BY i.id`;
  if (linha === undefined) return null;
  const conta = contaDaLinha(linha);
  return conta.lojas.length === 0 ? null : conta;
}
