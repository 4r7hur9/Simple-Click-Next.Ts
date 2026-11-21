/**
 * As CONSULTAS QUENTES do volume (#138), com a origem de cada uma declarada.
 *
 * Duas origens, e o relatório nunca as confunde (D-8):
 *
 * - `literal`: a fonte da API é SQL cru (`$queryRaw`); o texto é copiado, com
 *   os parâmetros numerados no lugar dos `${…}`;
 * - `equivalente`: a fonte é Prisma (`findMany`/`findFirst`). O SQL abaixo
 *   reproduz select, where, ordem e limite do código, e as relações viram uma
 *   consulta por tabela filha (como o Prisma faz), com os ids REAIS da consulta
 *   pai. NÃO é o SQL capturado do Prisma: a captura por DEBUG foi descartada
 *   porque registraria tokens e erros completos em arquivo.
 *
 * O pacote do banco não importa `apps/api` (fronteira): por isso as cópias.
 */

export type Origem = "literal" | "equivalente";
export type PapelDoContexto = "OWNER" | "PUBLIC" | "CUSTOMER";

export interface ConsultaDoCenario {
  readonly id: string;
  readonly descricao: string;
  readonly origem: Origem;
  /** `arquivo:linha` da fonte copiada. */
  readonly fonte: string;
  readonly sql: string;
  /** Quando as linhas desta consulta viram os ids das filhas. */
  readonly alimenta?: "pedidos" | "itens";
}

// ---------------------------------------------------------------------------
// Dia da loja (literal) e quadro
// ---------------------------------------------------------------------------

/** `lerODiaDaLoja`: $1 = loja, $2 = dia (date ou NULL), $3 = dias de sobra. */
export const SQL_DIA_DA_LOJA = `
WITH base AS (
  SELECT s.timezone AS tz,
         coalesce($2::date, (now() AT TIME ZONE s.timezone)::date) AS alvo,
         (now() AT TIME ZONE s.timezone)::date AS hoje
    FROM app.stores s
   WHERE s.id = $1::uuid)
SELECT tz,
       to_char(alvo, 'YYYY-MM-DD') AS alvo,
       to_char(hoje, 'YYYY-MM-DD') AS hoje,
       (alvo::timestamp AT TIME ZONE tz) AS inicio,
       ((alvo + 1)::timestamp AT TIME ZONE tz) AS fim,
       ((alvo - $3::int)::timestamp AT TIME ZONE tz) AS limite_de_sobra
  FROM base`;

const COLUNAS_DO_QUADRO = `o.id, o.number, o.code, o.status, o.channel, o.fulfillment, o.total_cents,
       o.placed_at, o.whatsapp_clicked_at, o.whatsapp_confirmed_at, o.payment_method, o.cancel_reason`;

/** Quadro de um dia JÁ PASSADO (ramo histórico): $1 = loja, $2 = início, $3 = fim. */
export const SQL_QUADRO_DO_DIA = `
SELECT ${COLUNAS_DO_QUADRO}
  FROM app.orders o
 WHERE o.store_id = $1::uuid
   AND (o.placed_at >= $2::timestamptz AND o.placed_at < $3::timestamptz)
 ORDER BY o.placed_at ASC, o.number ASC`;

/**
 * Quadro de HOJE (ramo com as pendências dos dias anteriores): $4 = limite de
 * sobra. Só roda com `alvo = hoje` na API; aqui os instantes são fixos, a
 * partir da referência (a data real do servidor não é a do dataset).
 */
export const SQL_QUADRO_DE_HOJE = `
SELECT ${COLUNAS_DO_QUADRO}
  FROM app.orders o
 WHERE o.store_id = $1::uuid
   AND ((o.placed_at >= $2::timestamptz AND o.placed_at < $3::timestamptz)
     OR (o.placed_at >= $4::timestamptz AND o.placed_at < $2::timestamptz
         AND o.status NOT IN ('COMPLETED', 'CANCELLED')))
 ORDER BY o.placed_at ASC, o.number ASC`;

export const SQL_CONTATOS_DO_QUADRO = `
SELECT order_id, name, phone_e164 FROM app.order_contacts WHERE order_id = ANY($1::uuid[])`;

export const SQL_ITENS_DO_QUADRO = `
SELECT order_id, product_name, quantity, sort_order
  FROM app.order_items WHERE order_id = ANY($1::uuid[]) ORDER BY sort_order ASC`;

// ---------------------------------------------------------------------------
// Fila (equivalente)
// ---------------------------------------------------------------------------

/** `lerFilaDaLoja`: pedidos em aberto (STATUS_FORA_DA_FILA = COMPLETED, CANCELLED). $1 = loja. */
export const SQL_FILA = `
SELECT o.id, o.number, o.code, o.status, o.channel, o.fulfillment, o.total_cents, o.placed_at,
       o.whatsapp_clicked_at, o.whatsapp_confirmed_at
  FROM app.orders o
 WHERE o.store_id = $1::uuid AND o.status NOT IN ('COMPLETED', 'CANCELLED')
 ORDER BY o.placed_at ASC, o.number ASC`;

export const SQL_CONTATOS_DA_FILA = `
SELECT order_id, name FROM app.order_contacts WHERE order_id = ANY($1::uuid[])`;

// ---------------------------------------------------------------------------
// Histórico do cliente (equivalente)
// ---------------------------------------------------------------------------

/** A ficha (`lerFichaAtiva`): $1 = cliente. */
export const SQL_FICHA_DO_CLIENTE = `
SELECT id, display_name, orders_count, total_spent_cents, last_order_at
  FROM app.store_customers WHERE id = $1::uuid`;

/** `historicoDoCliente`: LIMITE_DO_HISTORICO = 100. $1 = cliente. */
export const SQL_HISTORICO_DO_CLIENTE = `
SELECT o.id, o.number, o.code, o.status, o.channel, o.fulfillment, o.total_cents, o.placed_at
  FROM app.orders o
 WHERE o.store_customer_id = $1::uuid
 ORDER BY o.placed_at DESC, o.number DESC
 LIMIT 100`;

export const SQL_ITENS_DO_HISTORICO = `
SELECT id, order_id, product_id, variant_id, product_name, variant_name, quantity, line_total_cents, note, sort_order
  FROM app.order_items WHERE order_id = ANY($1::uuid[]) ORDER BY sort_order ASC`;

export const SQL_OPCOES_DO_HISTORICO = `
SELECT order_item_id, group_name_snapshot, option_name_snapshot, quantity, sort_order
  FROM app.order_item_options WHERE order_item_id = ANY($1::uuid[]) ORDER BY sort_order ASC`;

// ---------------------------------------------------------------------------
// Conta do cliente: app.meus_pedidos (literal)
// ---------------------------------------------------------------------------

/** A chamada, como a API a faz (a função é SECURITY DEFINER: o plano interno fica escondido). */
export const SQL_MEUS_PEDIDOS_CHAMADA = `SELECT * FROM app.meus_pedidos(NULL::uuid)`;

/** O CORPO da função (migração 0029), com `p_order_id = NULL`. */
export const SQL_MEUS_PEDIDOS_CORPO = `
SELECT o.id, o.store_id, s.name, s.slug, o.number, o.code, o.status, o.fulfillment,
       o.total_cents, o.placed_at, o.updated_at, o.public_token,
       (SELECT count(*) FROM app.order_items i WHERE i.order_id = o.id)
  FROM app.orders o
  JOIN app.store_customers c ON c.id = o.store_customer_id
  JOIN app.stores s ON s.id = o.store_id
 WHERE app.current_role_name() = 'CUSTOMER'
   AND app.current_user_id() IS NOT NULL
   AND c.identity_id = app.current_user_id()
   AND (NULL::uuid IS NULL OR o.id = NULL::uuid)
 ORDER BY o.placed_at DESC, o.id DESC`;

// ---------------------------------------------------------------------------
// Catálogo da vitrine (literal): resumo por seção e página
// ---------------------------------------------------------------------------

/** `resumoDoCatalogo`: $1 = ids (uuid[]), $2 = filtrando, $3 = ordenar pelos acertos, $4 = corte. */
export const SQL_CATALOGO_RESUMO = `
WITH acerto AS (
  SELECT a.id, a.pos
    FROM unnest($1::uuid[]) WITH ORDINALITY AS a(id, pos)
)
SELECT x.category_id::text AS categoria,
       x.product_id::text AS produto,
       x.posicao::int AS posicao,
       x.total::int AS total
  FROM (
    SELECT pc.category_id,
           pc.product_id,
           row_number() OVER (
             PARTITION BY pc.category_id
             ORDER BY CASE WHEN $3::boolean THEN r.pos END,
                      pc.sort_order, p.name, p.id
           ) AS posicao,
           count(*) OVER (PARTITION BY pc.category_id) AS total
      FROM app.product_categories pc
      JOIN app.products p ON p.id = pc.product_id
      JOIN app.categories c ON c.id = pc.category_id
      LEFT JOIN acerto r ON r.id = pc.product_id
     WHERE (NOT $2::boolean OR r.id IS NOT NULL)
  ) x
 WHERE x.posicao <= $4::int
 ORDER BY x.category_id, x.posicao`;

/**
 * `paginaDoCatalogo` (ordem por menor preço, que exercita o preço vigente por
 * produto): $1 = ids (uuid[]), $2 = filtrando, $3 = ordem, $4 = apelido da
 * categoria (ou NULL), $5 = agora, $6 = ordenar pelos acertos, $7 = limite,
 * $8 = posição.
 */
export const SQL_CATALOGO_PAGINA = `
WITH acerto AS (
  SELECT a.id, a.pos
    FROM unnest($1::uuid[]) WITH ORDINALITY AS a(id, pos)
),
lista AS (
  SELECT pc.product_id, min(pc.sort_order) AS ordem
    FROM app.product_categories pc
    JOIN app.categories c ON c.id = pc.category_id
   WHERE ($4::text IS NULL OR c.slug = $4::text)
   GROUP BY pc.product_id
)
SELECT p.id::text AS id, count(*) OVER ()::int AS total
  FROM lista l
  JOIN app.products p ON p.id = l.product_id
  LEFT JOIN acerto r ON r.id = p.id
  LEFT JOIN LATERAL (
    SELECT CASE WHEN $3::text IN ('menor-preco', 'maior-preco', 'maior-desconto-atacado')
           THEN (
    SELECT CASE WHEN count(*) = 0 THEN p.display_price_cents
                ELSE coalesce(
                  min(pp.amount_cents) FILTER (
                    WHERE pp.kind = 'PROMO' AND pp.is_active
                      AND pp.min_quantity <= 1
                      AND (pp.starts_at IS NULL OR pp.starts_at <= $5::timestamptz)
                      AND (pp.ends_at IS NULL OR pp.ends_at > $5::timestamptz)),
                  min(pp.amount_cents) FILTER (
                    WHERE pp.kind = 'BASE' AND pp.is_active
                      AND pp.min_quantity <= 1
                      AND (pp.starts_at IS NULL OR pp.starts_at <= $5::timestamptz)
                      AND (pp.ends_at IS NULL OR pp.ends_at > $5::timestamptz)))
           END
      FROM app.product_prices pp
     WHERE pp.product_id = p.id
       AND pp.store_id = p.store_id
       AND pp.variant_id IS NULL
           ) END AS varejo
  ) pr ON true
  LEFT JOIN LATERAL (
    SELECT CASE WHEN $3::text = 'maior-desconto-atacado' THEN (
      SELECT max((pr.varejo - u.unitario)::numeric / NULLIF(pr.varejo, 0))
        FROM app.product_prices w
       CROSS JOIN LATERAL (
         SELECT CASE w.discount_kind
                  WHEN 'PERCENT' THEN (pr.varejo * (100 - w.discount_value) + 50) / 100
                  WHEN 'AMOUNT' THEN pr.varejo - w.discount_value
                  ELSE w.amount_cents
                END AS unitario) u
       WHERE w.product_id = p.id
         AND w.store_id = p.store_id
         AND w.variant_id IS NULL
         AND w.kind = 'WHOLESALE'
         AND w.is_active
         AND w.min_quantity >= 2
         AND (w.starts_at IS NULL OR w.starts_at <= $5::timestamptz)
         AND (w.ends_at IS NULL OR w.ends_at > $5::timestamptz)
         AND pr.varejo > 0
         AND u.unitario >= 1
         AND u.unitario < pr.varejo
    ) END AS desconto
  ) de ON true
 WHERE (NOT $2::boolean OR r.id IS NOT NULL)
 ORDER BY
   CASE WHEN $3::text = 'menor-preco' THEN pr.varejo END ASC NULLS LAST,
   CASE WHEN $3::text = 'maior-preco' THEN pr.varejo END DESC NULLS LAST,
   CASE WHEN $3::text = 'maior-desconto-atacado' THEN de.desconto END DESC NULLS LAST,
   CASE WHEN $3::text = 'lancamentos' THEN p.created_at END DESC,
   CASE WHEN $3::text = 'lancamentos' THEN p.id END DESC,
   CASE WHEN $3::text = 'a-z' THEN lower(app.sem_acento(p.name)) END ASC,
   CASE WHEN $6::boolean AND $3::text = 'relevancia' THEN r.pos END ASC,
   CASE WHEN $4::text IS NULL THEN p.sort_order ELSE l.ordem END ASC,
   p.name ASC,
   p.id ASC
 LIMIT $7::int OFFSET $8::int`;

// ---------------------------------------------------------------------------
// Pedido pelo token (equivalente + função dedicada)
// ---------------------------------------------------------------------------

/** `acompanharPedido`: $1 = token (valor ligado, nunca impresso). */
export const SQL_PEDIDO_PELO_TOKEN = `
SELECT o.id, o.number, o.code, o.status, o.fulfillment, o.payment_method, o.total_cents, o.placed_at,
       o.whatsapp_confirmed_at
  FROM app.orders o WHERE o.public_token = $1 LIMIT 1`;

export const SQL_CONTATO_DO_TOKEN = `
SELECT order_id, name, phone_e164 FROM app.order_contacts WHERE order_id = ANY($1::uuid[])`;

export const SQL_ITENS_DO_TOKEN = `
SELECT id, order_id, product_name, variant_name, quantity, line_total_cents, sort_order
  FROM app.order_items WHERE order_id = ANY($1::uuid[]) ORDER BY sort_order ASC`;

export const SQL_OPCOES_DO_TOKEN = `
SELECT order_item_id, group_name_snapshot, option_name_snapshot, quantity, sort_order
  FROM app.order_item_options WHERE order_item_id = ANY($1::uuid[]) ORDER BY sort_order ASC`;

export const SQL_HISTORICO_DO_TOKEN = `
SELECT order_id, from_status, to_status, reason, occurred_at
  FROM app.order_status_history WHERE order_id = ANY($1::uuid[]) ORDER BY occurred_at ASC`;

/** A função dedicada (migração 0039). */
export const SQL_LOJA_DO_TOKEN = `SELECT name, whatsapp FROM app.tracked_order_store()`;

// ---------------------------------------------------------------------------
// Apoio da escolha de cenários
// ---------------------------------------------------------------------------

/** O dia (local) de maior movimento de uma loja, entre os do volume. $1 = loja. */
export const SQL_DIA_DE_PICO = `
SELECT to_char((o.placed_at AT TIME ZONE s.timezone)::date, 'YYYY-MM-DD') AS dia, count(*)::int AS n
  FROM app.orders o JOIN app.stores s ON s.id = o.store_id
 WHERE o.store_id = $1::uuid AND o.number > 1010
 GROUP BY 1 ORDER BY n DESC, dia DESC LIMIT 1`;

/** O cliente mais movimentado do volume na loja. $1 = loja. */
export const SQL_CLIENTE_MAIS_MOVIMENTADO = `
SELECT c.id, c.identity_id FROM app.store_customers c
 WHERE c.store_id = $1::uuid AND c.orders_count > 0
 ORDER BY c.orders_count DESC, c.id ASC LIMIT 1`;

/** Um pedido recente da loja (para a consulta pelo token). $1 = loja. */
export const SQL_PEDIDO_RECENTE = `
SELECT o.id, o.public_token FROM app.orders o
 WHERE o.store_id = $1::uuid AND o.number > 1010
 ORDER BY o.placed_at DESC, o.id DESC LIMIT 1`;

/** As consultas na ordem em que o relatório as lista (para o índice do doc 09). */
export const CATALOGO_DE_CONSULTAS: readonly ConsultaDoCenario[] = [
  { id: "dia-da-loja", descricao: "Dia da loja (início e fim no fuso dela)", origem: "literal", fonte: "apps/api/src/modules/orders/quadro.usecase.ts:129", sql: SQL_DIA_DA_LOJA },
  { id: "quadro-do-dia", descricao: "Quadro de um dia já passado", origem: "equivalente", fonte: "apps/api/src/modules/orders/quadro.usecase.ts:151", sql: SQL_QUADRO_DO_DIA, alimenta: "pedidos" },
  { id: "quadro-de-hoje", descricao: "Quadro de hoje, com pendências de dias anteriores (datas fixas)", origem: "equivalente", fonte: "apps/api/src/modules/orders/quadro.usecase.ts:151", sql: SQL_QUADRO_DE_HOJE, alimenta: "pedidos" },
  { id: "quadro-contatos", descricao: "Contatos dos pedidos do quadro", origem: "equivalente", fonte: "apps/api/src/modules/orders/quadro.usecase.ts:151", sql: SQL_CONTATOS_DO_QUADRO },
  { id: "quadro-itens", descricao: "Itens dos pedidos do quadro", origem: "equivalente", fonte: "apps/api/src/modules/orders/quadro.usecase.ts:151", sql: SQL_ITENS_DO_QUADRO },
  { id: "fila", descricao: "Fila de pedidos em aberto", origem: "equivalente", fonte: "apps/api/src/modules/orders/fila.usecase.ts:64", sql: SQL_FILA, alimenta: "pedidos" },
  { id: "fila-contatos", descricao: "Contatos da fila", origem: "equivalente", fonte: "apps/api/src/modules/orders/fila.usecase.ts:64", sql: SQL_CONTATOS_DA_FILA },
  { id: "historico-ficha", descricao: "Ficha do cliente", origem: "equivalente", fonte: "apps/api/src/modules/customers/historico.usecase.ts:62", sql: SQL_FICHA_DO_CLIENTE },
  { id: "historico-pedidos", descricao: "Histórico do cliente (limite 100)", origem: "equivalente", fonte: "apps/api/src/modules/customers/historico.usecase.ts:62", sql: SQL_HISTORICO_DO_CLIENTE, alimenta: "pedidos" },
  { id: "historico-itens", descricao: "Itens do histórico", origem: "equivalente", fonte: "apps/api/src/modules/customers/historico.usecase.ts:62", sql: SQL_ITENS_DO_HISTORICO, alimenta: "itens" },
  { id: "historico-opcoes", descricao: "Opções dos itens do histórico", origem: "equivalente", fonte: "apps/api/src/modules/customers/historico.usecase.ts:62", sql: SQL_OPCOES_DO_HISTORICO },
  { id: "meus-pedidos-chamada", descricao: "app.meus_pedidos (chamada: Function Scan oculta o plano interno)", origem: "literal", fonte: "packages/database/migrations/0029_operacao_do_pedido.sql:91", sql: SQL_MEUS_PEDIDOS_CHAMADA },
  { id: "meus-pedidos-corpo", descricao: "Corpo de app.meus_pedidos (medido como sc_admin)", origem: "literal", fonte: "packages/database/migrations/0029_operacao_do_pedido.sql:91", sql: SQL_MEUS_PEDIDOS_CORPO },
  { id: "catalogo-resumo", descricao: "Resumo do catálogo por seção", origem: "literal", fonte: "apps/api/src/modules/storefront/catalogo-paginado.usecase.ts:133", sql: SQL_CATALOGO_RESUMO },
  { id: "catalogo-pagina", descricao: "Página do catálogo (menor preço)", origem: "literal", fonte: "apps/api/src/modules/storefront/catalogo-paginado.usecase.ts:284", sql: SQL_CATALOGO_PAGINA },
  { id: "token-pedido", descricao: "Pedido pelo token público", origem: "equivalente", fonte: "apps/api/src/modules/orders/acompanhar.usecase.ts:41", sql: SQL_PEDIDO_PELO_TOKEN, alimenta: "pedidos" },
  { id: "token-contato", descricao: "Contato do pedido do token", origem: "equivalente", fonte: "apps/api/src/modules/orders/acompanhar.usecase.ts:41", sql: SQL_CONTATO_DO_TOKEN },
  { id: "token-itens", descricao: "Itens do pedido do token", origem: "equivalente", fonte: "apps/api/src/modules/orders/acompanhar.usecase.ts:41", sql: SQL_ITENS_DO_TOKEN, alimenta: "itens" },
  { id: "token-opcoes", descricao: "Opções dos itens do pedido do token", origem: "equivalente", fonte: "apps/api/src/modules/orders/acompanhar.usecase.ts:41", sql: SQL_OPCOES_DO_TOKEN },
  { id: "token-historico", descricao: "Histórico do pedido do token", origem: "equivalente", fonte: "apps/api/src/modules/orders/acompanhar.usecase.ts:41", sql: SQL_HISTORICO_DO_TOKEN },
  { id: "token-loja", descricao: "Loja do pedido (função dedicada)", origem: "literal", fonte: "packages/database/migrations/0039_acompanhamento_de_loja_suspensa.sql:29", sql: SQL_LOJA_DO_TOKEN },
];
