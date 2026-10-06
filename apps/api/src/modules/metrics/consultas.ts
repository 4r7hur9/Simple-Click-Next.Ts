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
