/**
 * Consultas agregadas do painel de crescimento. Só leitura, na transação do
 * administrador (credencial `sc_admin`, que enxerga todas as lojas). Cada
 * consulta devolve já agrupado: nada aqui traz linha de pedido para somar no
 * Node. O dia civil é o de Fortaleza.
 */
import { STATUS_DO_PEDIDO, situacaoNaVenda } from "@simpleclick/core";

import { transacaoAtual } from "../../core/db.ts";
import type { IntervaloDeDias } from "./periodo.ts";

export const FUSO_DO_PAINEL = "America/Fortaleza";
export const TAMANHO_DO_RANKING = 5;

/** Os status que são venda, derivados da mesma régua do painel do dono. */
export const STATUS_DE_VENDA: readonly string[] = STATUS_DO_PEDIDO.filter(
  (status) =>
    situacaoNaVenda({
      status,
      totalCentavos: 0,
      aguardandoConfirmacaoWhatsapp: false,
    }) === "VENDA",
);

export interface NumerosDoPeriodo {
  readonly lojasAtivas: number;
  readonly novasLojas: number;
  readonly pedidos: number;
  readonly faturamentoCentavos: number;
  readonly clientes: number;
  readonly novosClientes: number;
  readonly donos: number;
  readonly staff: number;
  readonly carrinhos: number;
  readonly carrinhosConvertidos: number;
}

export interface LojaDoRanking {
  readonly id: string;
  readonly nome: string;
  readonly apelido: string;
  readonly pedidos: number;
  readonly faturamentoCentavos: number;
}

export interface RepositorioDasMetricasDoAdmin {
  numerosDoPeriodo(periodo: IntervaloDeDias): Promise<NumerosDoPeriodo>;
  lojasPendentes(): Promise<number>;
  pedidosPorDia(
    periodo: IntervaloDeDias,
  ): Promise<{ dia: string; pedidos: number; faturamentoCentavos: number }[]>;
  lojasNovasPorSemana(
    periodo: IntervaloDeDias,
  ): Promise<{ semana: string; quantidade: number }[]>;
  clientesNovosPorSemana(
    periodo: IntervaloDeDias,
  ): Promise<{ semana: string; quantidade: number }[]>;
  porTipoDeNegocio(periodo: IntervaloDeDias): Promise<
    { codigo: string; nome: string; lojas: number; pedidos: number }[]
  >;
  ranking(
    periodo: IntervaloDeDias,
    ordem: "faturamento" | "pedidos",
  ): Promise<LojaDoRanking[]>;
  lojasMaisNovas(): Promise<
    {
      id: string;
      nome: string;
      apelido: string;
      tipoDeNegocio: string;
      status: string;
      criadaEm: string;
    }[]
  >;
  pedidosPorHora(
    periodo: IntervaloDeDias,
  ): Promise<{ hora: number; pedidos: number }[]>;
}

const numero = (valor: unknown): number => Number(valor ?? 0);

/**
 * `[inicio, fim+1)` como instantes: o dia civil de Fortaleza começa à meia-noite
 * dele, não à do servidor. Os dois textos já foram validados como datas.
 */
const COMECA = (p: IntervaloDeDias) => `${p.inicio}T00:00:00`;

export const repositorioDasMetricasDoAdmin: RepositorioDasMetricasDoAdmin = {
  async numerosDoPeriodo(periodo) {
    const de = COMECA(periodo);
    const ate = `${periodo.fim}T00:00:00`;
    const linhas = await transacaoAtual().$queryRaw<Record<string, unknown>[]>`
      WITH limites AS (
        SELECT (${de}::timestamp AT TIME ZONE ${FUSO_DO_PAINEL}) AS de,
               ((${ate}::timestamp + interval '1 day')
                  AT TIME ZONE ${FUSO_DO_PAINEL}) AS ate
      )
      SELECT
        (SELECT count(*) FROM app.stores s, limites l
          WHERE s.deleted_at IS NULL AND s.status = 'ACTIVE'
            AND s.created_at < l.ate)::int AS lojas_ativas,
        (SELECT count(*) FROM app.stores s, limites l
          WHERE s.deleted_at IS NULL
            AND s.created_at >= l.de AND s.created_at < l.ate)::int AS novas_lojas,
        (SELECT count(*) FROM app.orders o, limites l
          WHERE o.status = ANY(${STATUS_DE_VENDA}::text[])
            AND o.placed_at >= l.de AND o.placed_at < l.ate)::int AS pedidos,
        (SELECT COALESCE(sum(o.total_cents), 0) FROM app.orders o, limites l
          WHERE o.status = ANY(${STATUS_DE_VENDA}::text[])
            AND o.placed_at >= l.de AND o.placed_at < l.ate)::float8 AS faturamento,
        (SELECT count(*) FROM app.identities i, limites l
          WHERE i.anonymized_at IS NULL AND i.created_at < l.ate
            AND NOT EXISTS (SELECT 1 FROM app.store_members m
                             WHERE m.identity_id = i.id)
            AND NOT EXISTS (SELECT 1 FROM app.platform_admins a
                             WHERE a.identity_id = i.id))::int AS clientes,
        (SELECT count(*) FROM app.identities i, limites l
          WHERE i.anonymized_at IS NULL
            AND i.created_at >= l.de AND i.created_at < l.ate
            AND NOT EXISTS (SELECT 1 FROM app.store_members m
                             WHERE m.identity_id = i.id)
            AND NOT EXISTS (SELECT 1 FROM app.platform_admins a
                             WHERE a.identity_id = i.id))::int AS novos_clientes,
        (SELECT count(DISTINCT m.identity_id) FROM app.store_members m, limites l
          WHERE m.role = 'OWNER' AND m.revoked_at IS NULL
            AND m.created_at < l.ate)::int AS donos,
        (SELECT count(DISTINCT m.identity_id) FROM app.store_members m, limites l
          WHERE m.role = 'STAFF' AND m.revoked_at IS NULL
            AND m.created_at < l.ate)::int AS staff,
        (SELECT count(*) FROM app.carts c, limites l
          WHERE c.created_at >= l.de AND c.created_at < l.ate)::int AS carrinhos,
        (SELECT count(*) FROM app.carts c, limites l
          WHERE c.created_at >= l.de AND c.created_at < l.ate
            AND c.converted_at IS NOT NULL)::int AS convertidos`;
    const l = linhas[0] ?? {};
    return {
      lojasAtivas: numero(l.lojas_ativas),
      novasLojas: numero(l.novas_lojas),
      pedidos: numero(l.pedidos),
      faturamentoCentavos: Math.round(numero(l.faturamento)),
      clientes: numero(l.clientes),
      novosClientes: numero(l.novos_clientes),
      donos: numero(l.donos),
      staff: numero(l.staff),
      carrinhos: numero(l.carrinhos),
      carrinhosConvertidos: numero(l.convertidos),
    };
  },

  async lojasPendentes() {
    const linhas = await transacaoAtual().$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM app.stores
       WHERE status = 'PENDING_APPROVAL' AND deleted_at IS NULL`;
    return numero(linhas[0]?.total);
  },

  async pedidosPorDia(periodo) {
    const linhas = await transacaoAtual().$queryRaw<
      { dia: string; pedidos: number; faturamento: number }[]
    >`
      WITH dias AS (
        SELECT d::date AS dia
          FROM generate_series(${periodo.inicio}::date, ${periodo.fim}::date,
                               interval '1 day') AS d
      ), vendas AS (
        SELECT (o.placed_at AT TIME ZONE ${FUSO_DO_PAINEL})::date AS dia,
               count(*)::int AS pedidos,
               COALESCE(sum(o.total_cents), 0)::float8 AS faturamento
          FROM app.orders o
         WHERE o.status = ANY(${STATUS_DE_VENDA}::text[])
           AND o.placed_at >= (${COMECA(periodo)}::timestamp AT TIME ZONE ${FUSO_DO_PAINEL})
           AND o.placed_at < ((${periodo.fim}::date + 1)::timestamp AT TIME ZONE ${FUSO_DO_PAINEL})
         GROUP BY 1
      )
      SELECT to_char(dias.dia, 'YYYY-MM-DD') AS dia,
             COALESCE(vendas.pedidos, 0) AS pedidos,
             COALESCE(vendas.faturamento, 0) AS faturamento
        FROM dias LEFT JOIN vendas USING (dia)
       ORDER BY dias.dia`;
    return linhas.map((l) => ({
      dia: l.dia,
      pedidos: numero(l.pedidos),
      faturamentoCentavos: Math.round(numero(l.faturamento)),
    }));
  },

  async lojasNovasPorSemana(periodo) {
    const linhas = await transacaoAtual().$queryRaw<
      { semana: string; quantidade: number }[]
    >`
      WITH semanas AS (
        SELECT d::date AS semana
          FROM generate_series(date_trunc('week', ${periodo.inicio}::date),
                               ${periodo.fim}::date, interval '1 week') AS d
      ), novas AS (
        SELECT date_trunc('week', s.created_at AT TIME ZONE ${FUSO_DO_PAINEL})::date AS semana,
               count(*)::int AS quantidade
          FROM app.stores s
         WHERE s.deleted_at IS NULL
           AND s.created_at >= (date_trunc('week', ${periodo.inicio}::date)::timestamp AT TIME ZONE ${FUSO_DO_PAINEL})
           AND s.created_at < ((${periodo.fim}::date + 1)::timestamp AT TIME ZONE ${FUSO_DO_PAINEL})
         GROUP BY 1
      )
      SELECT to_char(semanas.semana, 'YYYY-MM-DD') AS semana,
             COALESCE(novas.quantidade, 0) AS quantidade
        FROM semanas LEFT JOIN novas USING (semana)
       ORDER BY semanas.semana`;
    return linhas.map((l) => ({
      semana: l.semana,
      quantidade: numero(l.quantidade),
    }));
  },

  async clientesNovosPorSemana(periodo) {
    const linhas = await transacaoAtual().$queryRaw<
      { semana: string; quantidade: number }[]
    >`
      WITH semanas AS (
        SELECT d::date AS semana
          FROM generate_series(date_trunc('week', ${periodo.inicio}::date),
                               ${periodo.fim}::date, interval '1 week') AS d
      ), novos AS (
        SELECT date_trunc('week', i.created_at AT TIME ZONE ${FUSO_DO_PAINEL})::date AS semana,
               count(*)::int AS quantidade
          FROM app.identities i
         WHERE i.anonymized_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM app.store_members m WHERE m.identity_id = i.id)
           AND NOT EXISTS (SELECT 1 FROM app.platform_admins a WHERE a.identity_id = i.id)
           AND i.created_at >= (date_trunc('week', ${periodo.inicio}::date)::timestamp AT TIME ZONE ${FUSO_DO_PAINEL})
           AND i.created_at < ((${periodo.fim}::date + 1)::timestamp AT TIME ZONE ${FUSO_DO_PAINEL})
         GROUP BY 1
      )
      SELECT to_char(semanas.semana, 'YYYY-MM-DD') AS semana,
             COALESCE(novos.quantidade, 0) AS quantidade
        FROM semanas LEFT JOIN novos USING (semana)
       ORDER BY semanas.semana`;
    return linhas.map((l) => ({
      semana: l.semana,
      quantidade: numero(l.quantidade),
    }));
  },

  async porTipoDeNegocio(periodo) {
    const linhas = await transacaoAtual().$queryRaw<
      { codigo: string; nome: string; lojas: number; pedidos: number }[]
    >`
      WITH lim AS (
        SELECT (${COMECA(periodo)}::timestamp AT TIME ZONE ${FUSO_DO_PAINEL}) AS de,
               ((${periodo.fim}::date + 1)::timestamp AT TIME ZONE ${FUSO_DO_PAINEL}) AS ate
      )
      SELECT p.code AS codigo, p.label AS nome,
             (SELECT count(*) FROM app.stores s
               WHERE s.vertical_code = p.code AND s.deleted_at IS NULL
                 AND s.status = 'ACTIVE')::int AS lojas,
             (SELECT count(*) FROM app.orders o
                JOIN app.stores s ON s.id = o.store_id, lim
               WHERE s.vertical_code = p.code
                 AND o.status = ANY(${STATUS_DE_VENDA}::text[])
                 AND o.placed_at >= lim.de AND o.placed_at < lim.ate)::int AS pedidos
        FROM app.vertical_presets p
       ORDER BY lojas DESC, pedidos DESC, p.label`;
    return linhas
      .map((l) => ({
        codigo: l.codigo,
        nome: l.nome,
        lojas: numero(l.lojas),
        pedidos: numero(l.pedidos),
      }))
      .filter((l) => l.lojas > 0 || l.pedidos > 0);
  },

  async ranking(periodo, ordem) {
    const linhas = await transacaoAtual().$queryRaw<
      {
        id: string;
        nome: string;
        apelido: string;
        pedidos: number;
        faturamento: number;
      }[]
    >`
      SELECT s.id::text AS id, s.name AS nome, s.slug AS apelido,
             count(*)::int AS pedidos,
             COALESCE(sum(o.total_cents), 0)::float8 AS faturamento
        FROM app.orders o
        JOIN app.stores s ON s.id = o.store_id
       WHERE o.status = ANY(${STATUS_DE_VENDA}::text[])
         AND o.placed_at >= (${COMECA(periodo)}::timestamp AT TIME ZONE ${FUSO_DO_PAINEL})
         AND o.placed_at < ((${periodo.fim}::date + 1)::timestamp AT TIME ZONE ${FUSO_DO_PAINEL})
       GROUP BY s.id, s.name, s.slug
       ORDER BY CASE WHEN ${ordem} = 'pedidos' THEN count(*) END DESC,
                COALESCE(sum(o.total_cents), 0) DESC, s.name
       LIMIT ${TAMANHO_DO_RANKING}`;
    return linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      apelido: l.apelido,
      pedidos: numero(l.pedidos),
      faturamentoCentavos: Math.round(numero(l.faturamento)),
    }));
  },

  async lojasMaisNovas() {
    const linhas = await transacaoAtual().$queryRaw<
      {
        id: string;
        nome: string;
        apelido: string;
        tipo: string;
        status: string;
        criada_em: Date;
      }[]
    >`
      SELECT s.id::text AS id, s.name AS nome, s.slug AS apelido,
             p.label AS tipo, s.status, s.created_at AS criada_em
        FROM app.stores s
        JOIN app.vertical_presets p ON p.code = s.vertical_code
       WHERE s.deleted_at IS NULL
       ORDER BY s.created_at DESC, s.code DESC
       LIMIT ${TAMANHO_DO_RANKING}`;
    return linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      apelido: l.apelido,
      tipoDeNegocio: l.tipo,
      status: l.status,
      criadaEm: l.criada_em.toISOString(),
    }));
  },

  async pedidosPorHora(periodo) {
    const linhas = await transacaoAtual().$queryRaw<
      { hora: number; pedidos: number }[]
    >`
      SELECT h AS hora, COALESCE(v.pedidos, 0)::int AS pedidos
        FROM generate_series(0, 23) AS h
        LEFT JOIN (
          SELECT extract(hour FROM o.placed_at AT TIME ZONE ${FUSO_DO_PAINEL})::int AS hora,
                 count(*) AS pedidos
            FROM app.orders o
           WHERE o.status = ANY(${STATUS_DE_VENDA}::text[])
             AND o.placed_at >= (${COMECA(periodo)}::timestamp AT TIME ZONE ${FUSO_DO_PAINEL})
             AND o.placed_at < ((${periodo.fim}::date + 1)::timestamp AT TIME ZONE ${FUSO_DO_PAINEL})
           GROUP BY 1
        ) v ON v.hora = h
       ORDER BY h`;
    return linhas.map((l) => ({ hora: numero(l.hora), pedidos: numero(l.pedidos) }));
  },
};
