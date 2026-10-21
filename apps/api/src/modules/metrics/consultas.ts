/**
 * As consultas de métrica ao banco — tudo pela transação da requisição, com
 * a loja no contexto (P-004, P-003).
 *
 * TODA CONSULTA FILTRA POR `store_id` além de correr sob a política. Não é
 * redundância: é o filtro que deixa o planejador usar o índice
 * `(store_id, placed_at)` da migração 0037 em vez de varrer a tabela e deixar
 * a política descartar o resto (AC-813).
 *
 * A CONVERSÃO DE FUSO É FEITA PELO BANCO (`AT TIME ZONE`), com o mesmo nome
 * de fuso que `periodo.ts` usa para calcular as pontas. As duas metades — a
 * ponta calculada no Node e o dia calculado no PostgreSQL — falam a mesma
 * base de fusos, e é isso que faz o pedido das 23:59 cair no dia certo nas
 * duas.
 */
import { transacaoAtual } from "../../core/db.ts";
import type { GrupoDePedidos } from "./faturamento.ts";
import { STATUS_QUE_CONTAM_COMO_VENDA } from "./faturamento.ts";
import type { PeriodoResolvido } from "./periodo.ts";

/** Quantos produtos a lista dos mais vendidos traz, por critério. */
export const TAMANHO_DO_RANKING = 10;

/**
 * A lista de status de venda como o SQL a recebe: um parâmetro de vetor de
 * texto (`status = ANY(${lista}::text[])`), o mesmo caminho que o resto do
 * repositório usa. O módulo de domínio não importa o cliente do banco (P-004,
 * tabela de fronteiras), então nada de fragmento de SQL montado fora daqui.
 */
const LISTA_DE_STATUS_DE_VENDA: string[] = [...STATUS_QUE_CONTAM_COMO_VENDA];

/**
 * A marca-d'água dos pedidos da loja: o instante da última alteração.
 *
 * É a chave da invalidação do cache (AC-814): qualquer pedido novo, mudança
 * de status ou confirmação no WhatsApp toca `updated_at`, e a marca muda.
 * Uma leitura pelo índice `(store_id, updated_at)`, e nada mais.
 */
export async function marcaDaguaDosPedidos(lojaId: string): Promise<string> {
  const linhas = await transacaoAtual().$queryRaw<
    { ultima: Date | null }[]
  >`SELECT max(updated_at) AS ultima FROM app.orders WHERE store_id = ${lojaId}::uuid`;
  const ultima = linhas[0]?.ultima ?? null;
  return ultima === null ? "nenhum" : String(ultima.getTime());
}

interface LinhaDeGrupo {
  readonly status: string;
  readonly aguardando_whatsapp: boolean;
  readonly channel: string;
  readonly quantidade: number;
  readonly total: bigint | number;
}

/** Os pedidos do período agrupados no que a régua de venda enxerga. */
export async function gruposDoPeriodo(
  lojaId: string,
  periodo: PeriodoResolvido,
): Promise<GrupoDePedidos[]> {
  const linhas = await transacaoAtual().$queryRaw<LinhaDeGrupo[]>`
    SELECT status,
           (whatsapp_clicked_at IS NOT NULL AND whatsapp_confirmed_at IS NULL)
             AS aguardando_whatsapp,
           channel,
           count(*)::int AS quantidade,
           coalesce(sum(total_cents), 0)::bigint AS total
      FROM app.orders
     WHERE store_id = ${lojaId}::uuid
       AND placed_at >= ${periodo.inicio}
       AND placed_at < ${periodo.fim}
     GROUP BY 1, 2, 3`;
  return linhas.map((linha) => ({
    status: linha.status,
    aguardandoConfirmacaoWhatsapp: linha.aguardando_whatsapp,
    canal: linha.channel,
    quantidade: Number(linha.quantidade),
    totalCentavos: Number(linha.total),
  }));
}

/** Um dia com venda, como o banco o devolve. */
export interface DiaComVenda {
  readonly dia: string;
  readonly pedidos: number;
  readonly vendidoCentavos: number;
}

/** As vendas somadas por dia da loja. Dia sem venda não vem: quem zera é o caso de uso. */
export async function vendasPorDia(
  lojaId: string,
  periodo: PeriodoResolvido,
): Promise<DiaComVenda[]> {
  const linhas = await transacaoAtual().$queryRaw<
    { dia: string; pedidos: number; total: bigint | number }[]
  >`
    SELECT to_char((placed_at AT TIME ZONE ${periodo.fuso})::date, 'YYYY-MM-DD') AS dia,
           count(*)::int AS pedidos,
           coalesce(sum(total_cents), 0)::bigint AS total
      FROM app.orders
     WHERE store_id = ${lojaId}::uuid
       AND placed_at >= ${periodo.inicio}
       AND placed_at < ${periodo.fim}
       AND status = ANY(${LISTA_DE_STATUS_DE_VENDA}::text[])
     GROUP BY 1
     ORDER BY 1`;
  return linhas.map((linha) => ({
    dia: linha.dia,
    pedidos: Number(linha.pedidos),
    vendidoCentavos: Number(linha.total),
  }));
}

/** Uma hora com venda, como o banco a devolve. */
export interface HoraComVenda {
  readonly hora: number;
  readonly pedidos: number;
  readonly vendidoCentavos: number;
}

/** As vendas somadas por hora do dia da loja, no período inteiro. */
export async function vendasPorHora(
  lojaId: string,
  periodo: PeriodoResolvido,
): Promise<HoraComVenda[]> {
  const linhas = await transacaoAtual().$queryRaw<
    { hora: number; pedidos: number; total: bigint | number }[]
  >`
    SELECT extract(hour FROM (placed_at AT TIME ZONE ${periodo.fuso}))::int AS hora,
           count(*)::int AS pedidos,
           coalesce(sum(total_cents), 0)::bigint AS total
      FROM app.orders
     WHERE store_id = ${lojaId}::uuid
       AND placed_at >= ${periodo.inicio}
       AND placed_at < ${periodo.fim}
       AND status = ANY(${LISTA_DE_STATUS_DE_VENDA}::text[])
     GROUP BY 1
     ORDER BY 1`;
  return linhas.map((linha) => ({
    hora: Number(linha.hora),
    pedidos: Number(linha.pedidos),
    vendidoCentavos: Number(linha.total),
  }));
}

/** Um produto somado nos itens das vendas do período. */
export interface ProdutoVendido {
  readonly produtoId: string | null;
  readonly nome: string;
  readonly quantidade: number;
  readonly totalCentavos: number;
}

interface LinhaDeProduto {
  readonly product_id: string | null;
  readonly product_name: string;
  readonly quantidade: number;
  readonly total: bigint | number;
}

/**
 * Os produtos mais vendidos por um critério: quantidade ou valor.
 *
 * O item é a cópia congelada do momento da compra (P-010): o nome vem do
 * item, e não do produto de hoje, para que renomear um produto não apague o
 * histórico do que foi vendido com o nome antigo.
 *
 * O critério entra como PARÂMETRO, e não como pedaço de SQL: a ordenação
 * pergunta a ele qual soma vem primeiro. Assim o texto da consulta é um só,
 * sem montagem de fragmento fora de `core/db.ts`.
 */
export async function produtosMaisVendidos(
  lojaId: string,
  periodo: PeriodoResolvido,
  criterio: "quantidade" | "valor",
): Promise<ProdutoVendido[]> {
  const porValor = criterio === "valor";
  const linhas = await transacaoAtual().$queryRaw<LinhaDeProduto[]>`
    SELECT i.product_id,
           i.product_name,
           sum(i.quantity)::int AS quantidade,
           coalesce(sum(i.line_total_cents), 0)::bigint AS total
      FROM app.order_items i
      JOIN app.orders o ON o.id = i.order_id AND o.store_id = i.store_id
     WHERE o.store_id = ${lojaId}::uuid
       AND i.store_id = ${lojaId}::uuid
       AND o.placed_at >= ${periodo.inicio}
       AND o.placed_at < ${periodo.fim}
       AND o.status = ANY(${LISTA_DE_STATUS_DE_VENDA}::text[])
     GROUP BY i.product_id, i.product_name
     ORDER BY CASE WHEN ${porValor}::boolean THEN coalesce(sum(i.line_total_cents), 0)
                   ELSE sum(i.quantity) END DESC,
              CASE WHEN ${porValor}::boolean THEN sum(i.quantity)
                   ELSE coalesce(sum(i.line_total_cents), 0) END DESC,
              i.product_name ASC
     LIMIT ${TAMANHO_DO_RANKING}`;
  return linhas.map((linha) => ({
    produtoId: linha.product_id,
    nome: linha.product_name,
    quantidade: Number(linha.quantidade),
    totalCentavos: Number(linha.total),
  }));
}

/** Total de itens (unidades) vendidos no período. */
export async function itensVendidos(
  lojaId: string,
  periodo: PeriodoResolvido,
): Promise<number> {
  const linhas = await transacaoAtual().$queryRaw<{ total: bigint | number }[]>`
    SELECT coalesce(sum(i.quantity), 0)::bigint AS total
      FROM app.order_items i
      JOIN app.orders o ON o.id = i.order_id AND o.store_id = i.store_id
     WHERE o.store_id = ${lojaId}::uuid
       AND i.store_id = ${lojaId}::uuid
       AND o.placed_at >= ${periodo.inicio}
       AND o.placed_at < ${periodo.fim}
       AND o.status = ANY(${LISTA_DE_STATUS_DE_VENDA}::text[])`;
  return Number(linhas[0]?.total ?? 0);
}

/**
 * Clientes com venda no período: novos (a primeira venda deles é no período)
 * e recorrentes (já tinham venda antes).
 */
export async function clientesDoPeriodo(
  lojaId: string,
  periodo: PeriodoResolvido,
): Promise<{ novos: number; recorrentes: number }> {
  const linhas = await transacaoAtual().$queryRaw<
    { novos: number; recorrentes: number }[]
  >`
    WITH do_periodo AS (
      SELECT DISTINCT store_customer_id AS cliente
        FROM app.orders
       WHERE store_id = ${lojaId}::uuid
         AND store_customer_id IS NOT NULL
         AND placed_at >= ${periodo.inicio}
         AND placed_at < ${periodo.fim}
         AND status = ANY(${LISTA_DE_STATUS_DE_VENDA}::text[])
    )
    SELECT count(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM app.orders a
              WHERE a.store_id = ${lojaId}::uuid
                AND a.store_customer_id = d.cliente
                AND a.placed_at < ${periodo.inicio}
                AND a.status = ANY(${LISTA_DE_STATUS_DE_VENDA}::text[])))::int AS novos,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM app.orders a
              WHERE a.store_id = ${lojaId}::uuid
                AND a.store_customer_id = d.cliente
                AND a.placed_at < ${periodo.inicio}
                AND a.status = ANY(${LISTA_DE_STATUS_DE_VENDA}::text[])))::int AS recorrentes
      FROM do_periodo d`;
  return {
    novos: Number(linhas[0]?.novos ?? 0),
    recorrentes: Number(linhas[0]?.recorrentes ?? 0),
  };
}

/** Vendas por forma de pagamento. */
export async function vendasPorPagamento(
  lojaId: string,
  periodo: PeriodoResolvido,
): Promise<{ forma: string | null; pedidos: number; vendidoCentavos: number }[]> {
  const linhas = await transacaoAtual().$queryRaw<
    { forma: string | null; pedidos: number; total: bigint | number }[]
  >`
    SELECT payment_method AS forma,
           count(*)::int AS pedidos,
           coalesce(sum(total_cents), 0)::bigint AS total
      FROM app.orders
     WHERE store_id = ${lojaId}::uuid
       AND placed_at >= ${periodo.inicio}
       AND placed_at < ${periodo.fim}
       AND status = ANY(${LISTA_DE_STATUS_DE_VENDA}::text[])
     GROUP BY 1
     ORDER BY 3 DESC`;
  return linhas.map((l) => ({
    forma: l.forma,
    pedidos: Number(l.pedidos),
    vendidoCentavos: Number(l.total),
  }));
}

/** Vendas por entrega ou retirada. */
export async function vendasPorEntrega(
  lojaId: string,
  periodo: PeriodoResolvido,
): Promise<{ tipo: string; pedidos: number; vendidoCentavos: number }[]> {
  const linhas = await transacaoAtual().$queryRaw<
    { tipo: string; pedidos: number; total: bigint | number }[]
  >`
    SELECT fulfillment AS tipo,
           count(*)::int AS pedidos,
           coalesce(sum(total_cents), 0)::bigint AS total
      FROM app.orders
     WHERE store_id = ${lojaId}::uuid
       AND placed_at >= ${periodo.inicio}
       AND placed_at < ${periodo.fim}
       AND status = ANY(${LISTA_DE_STATUS_DE_VENDA}::text[])
     GROUP BY 1
     ORDER BY 3 DESC`;
  return linhas.map((l) => ({
    tipo: l.tipo,
    pedidos: Number(l.pedidos),
    vendidoCentavos: Number(l.total),
  }));
}

/** Vendas por categoria (a principal do produto, ou "Sem categoria"). */
export async function vendasPorCategoria(
  lojaId: string,
  periodo: PeriodoResolvido,
): Promise<{ nome: string; quantidade: number; totalCentavos: number }[]> {
  const linhas = await transacaoAtual().$queryRaw<
    { nome: string; quantidade: number; total: bigint | number }[]
  >`
    SELECT coalesce(c.name, 'Sem categoria') AS nome,
           sum(i.quantity)::int AS quantidade,
           coalesce(sum(i.line_total_cents), 0)::bigint AS total
      FROM app.order_items i
      JOIN app.orders o ON o.id = i.order_id AND o.store_id = i.store_id
      LEFT JOIN app.product_categories pc
             ON pc.product_id = i.product_id AND pc.store_id = i.store_id
            AND pc.is_primary
      LEFT JOIN app.categories c ON c.id = pc.category_id AND c.store_id = pc.store_id
     WHERE o.store_id = ${lojaId}::uuid
       AND i.store_id = ${lojaId}::uuid
       AND o.placed_at >= ${periodo.inicio}
       AND o.placed_at < ${periodo.fim}
       AND o.status = ANY(${LISTA_DE_STATUS_DE_VENDA}::text[])
     GROUP BY 1
     ORDER BY 3 DESC, 1 ASC
     LIMIT ${TAMANHO_DO_RANKING}`;
  return linhas.map((l) => ({
    nome: l.nome,
    quantidade: Number(l.quantidade),
    totalCentavos: Number(l.total),
  }));
}

/** Pedidos agora em cada etapa do quadro (as que ainda não terminaram). */
export async function pedidosPorEtapaAgora(
  lojaId: string,
  etapas: readonly string[],
): Promise<{ status: string; quantidade: number }[]> {
  const lista = [...etapas];
  const linhas = await transacaoAtual().$queryRaw<
    { status: string; quantidade: number }[]
  >`
    SELECT status, count(*)::int AS quantidade
      FROM app.orders
     WHERE store_id = ${lojaId}::uuid
       AND status = ANY(${lista}::text[])
     GROUP BY 1`;
  return linhas.map((l) => ({
    status: l.status,
    quantidade: Number(l.quantidade),
  }));
}

/** Um pedido do período, como a exportação o escreve (AC-815). */
export interface PedidoParaExportar {
  readonly id: string;
  readonly numero: number;
  readonly codigo: string;
  readonly colocadoEm: Date;
  readonly cliente: string | null;
  readonly canal: string;
  readonly status: string;
  readonly aguardandoConfirmacaoWhatsapp: boolean;
  readonly totalCentavos: number;
  readonly itens: readonly { nome: string; quantidade: number }[];
}

/**
 * Os pedidos do período, um por linha, com os itens já agrupados.
 *
 * SÓ O QUE O DONO VÊ NA TELA (AC-816): número, data, nome de quem pediu,
 * canal, itens, status e valor. Nem telefone, nem endereço, nem documento —
 * a planilha vai por e-mail ao contador, e dado pessoal fora do sistema não
 * tem como ser apagado depois.
 */
export async function pedidosDoPeriodo(
  lojaId: string,
  periodo: PeriodoResolvido,
): Promise<PedidoParaExportar[]> {
  const pedidos = await transacaoAtual().order.findMany({
    where: {
      storeId: lojaId,
      placedAt: { gte: periodo.inicio, lt: periodo.fim },
    },
    orderBy: [{ placedAt: "asc" }, { number: "asc" }],
    select: {
      id: true,
      number: true,
      code: true,
      placedAt: true,
      channel: true,
      status: true,
      totalCents: true,
      whatsappClickedAt: true,
      whatsappConfirmedAt: true,
      contato: { select: { name: true } },
      itens: {
        orderBy: { sortOrder: "asc" },
        select: { productName: true, variantName: true, quantity: true },
      },
    },
  });
  return pedidos.map((pedido) => ({
    id: pedido.id,
    numero: Number(pedido.number),
    codigo: pedido.code,
    colocadoEm: pedido.placedAt,
    cliente: pedido.contato?.name ?? null,
    canal: pedido.channel,
    status: pedido.status,
    aguardandoConfirmacaoWhatsapp:
      pedido.whatsappClickedAt !== null && pedido.whatsappConfirmedAt === null,
    totalCentavos: Number(pedido.totalCents),
    itens: pedido.itens.map((item) => ({
      nome:
        item.variantName === null || item.variantName === ""
          ? item.productName
          : `${item.productName} (${item.variantName})`,
      quantidade: item.quantity,
    })),
  }));
}
