-- ===========================================================================
-- 0065 — Filtro "Atacado" no feed (card #59).
--
-- O cliente do /explorar pode pedir só produtos COM PREÇO DE ATACADO: ao menos
-- uma linha `WHOLESALE` ativa e vigente em `product_prices` (faixa com desconto
-- da 0064 ou atacado antigo de preço fixo). Opcional: pedido mínimo de até N
-- unidades (a menor faixa do produto).
--
-- `app.feed_produtos` ganha dois parâmetros no fim, com padrão (quem chama com
-- os 9 de antes continua igual), e duas colunas:
--   wholesale_min_quantity  pedido mínimo de atacado do produto (nulo = só varejo)
--   total_with_wholesale    a faceta: quantos do resultado SEM o filtro de
--                           atacado têm atacado — o número do chip não some
--                           quando o cliente o liga.
-- A subconsulta usa o índice product_prices_do_produto_idx (loja, produto,
-- tipo, quantidade). O corpo é o da 0050; muda só o que toca o atacado.
--
-- Idempotente: derruba as duas assinaturas e recria.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

DROP FUNCTION IF EXISTS app.feed_produtos(text, text[], text, text, double precision, double precision, text, integer, integer);
DROP FUNCTION IF EXISTS app.feed_produtos(text, text[], text, text, double precision, double precision, text, integer, integer, boolean, integer);
CREATE FUNCTION app.feed_produtos(
  p_busca text, p_tipos text[], p_categoria text, p_entrega text,
  p_lat double precision, p_lng double precision,
  p_ordem text, p_limite integer, p_deslocamento integer,
  p_atacado boolean DEFAULT false, p_pedido_minimo integer DEFAULT NULL)
RETURNS TABLE (
  product_id uuid, name text, description text, price_cents bigint,
  compare_at_cents bigint, image_url text, category_name text,
  store_slug text, store_name text, store_vertical text, store_logo text,
  store_city text, store_neighborhood text, store_fulfillment_modes text[],
  distance_km double precision, published_at timestamptz, total bigint,
  wholesale_min_quantity integer, total_with_wholesale bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  WITH consulta AS (
    SELECT CASE WHEN p_busca IS NULL THEN NULL
                ELSE plainto_tsquery('portuguese'::regconfig, app.sem_acento(p_busca)) END AS q
  ), base AS (
    SELECT p.id AS product_id, p.name,
           coalesce(nullif(p.short_description, ''), left(p.description, 280)) AS description,
           p.display_price_cents AS price_cents, p.compare_at_cents,
           (SELECT i.url FROM app.product_images i
             WHERE i.product_id = p.id AND i.store_id = p.store_id AND i.url IS NOT NULL
             ORDER BY i.is_primary DESC, i.sort_order, i.created_at LIMIT 1) AS image_url,
           (SELECT c.name FROM app.product_categories pc
              JOIN app.categories c ON c.id = pc.category_id
             WHERE pc.product_id = p.id AND pc.store_id = p.store_id AND c.deleted_at IS NULL
             ORDER BY pc.is_primary DESC, pc.sort_order LIMIT 1) AS category_name,
           s.slug AS store_slug, s.name AS store_name, s.vertical_code AS store_vertical,
           nullif(cfg.landing->>'logo', '') AS store_logo,
           s.city AS store_city, s.neighborhood AS store_neighborhood,
           s.fulfillment_modes AS store_fulfillment_modes,
           app.distancia_km(p_lat, p_lng, s.lat::double precision, s.lng::double precision) AS distance_km,
           fp.published_at,
           p.is_featured,
           (SELECT min(pp.min_quantity)::integer FROM app.product_prices pp
             WHERE pp.product_id = p.id AND pp.store_id = p.store_id
               AND pp.kind = 'WHOLESALE' AND pp.is_active
               AND (pp.starts_at IS NULL OR pp.starts_at <= now())
               AND (pp.ends_at IS NULL OR pp.ends_at > now())
               -- Como a regra do core: faixa que não baixa o preço não conta.
               AND NOT coalesce(
                     (pp.discount_kind = 'AMOUNT'
                        AND pp.discount_value >= p.display_price_cents)
                     OR (pp.discount_kind IS NULL
                        AND pp.amount_cents >= p.display_price_cents),
                     false)) AS wholesale_min_quantity,
           CASE WHEN (SELECT q FROM consulta) IS NULL THEN 0
                ELSE ts_rank(app.texto_de_busca(p.name, p.description), (SELECT q FROM consulta))
           END AS relevancia
      FROM app.feed_posts fp
      JOIN app.products p ON p.id = fp.product_id AND p.store_id = fp.store_id
      JOIN app.stores s ON s.id = p.store_id
      LEFT JOIN app.store_settings cfg ON cfg.store_id = s.id
     WHERE s.status = 'ACTIVE'
       AND s.deleted_at IS NULL
       AND s.feed_visible
       AND p.publish_to_feed
       AND p.deleted_at IS NULL
       AND p.status = 'PUBLISHED'
       AND p.is_available
       AND (p.unavailable_until IS NULL OR p.unavailable_until <= now())
       AND (p_tipos IS NULL OR cardinality(p_tipos) = 0 OR s.vertical_code = ANY (p_tipos))
       AND (p_entrega IS NULL OR p_entrega = ANY (s.fulfillment_modes))
       AND (p_categoria IS NULL OR EXISTS (
             SELECT 1 FROM app.product_categories pc
               JOIN app.categories c ON c.id = pc.category_id
              WHERE pc.product_id = p.id AND pc.store_id = p.store_id
                AND c.deleted_at IS NULL
                AND (lower(c.slug) = lower(p_categoria)
                     OR app.sem_acento(lower(c.name)) = app.sem_acento(lower(p_categoria)))))
       AND (p_busca IS NULL
            OR app.texto_de_busca(p.name, p.description) @@ (SELECT q FROM consulta)
            OR position(app.sem_acento(lower(p_busca)) IN app.sem_acento(lower(p.name))) > 0
            OR position(app.sem_acento(lower(p_busca)) IN app.sem_acento(lower(s.name))) > 0)
  ), filtrada AS (
    SELECT b.*,
           count(*) FILTER (WHERE b.wholesale_min_quantity IS NOT NULL) OVER () AS total_with_wholesale
      FROM base b
  )
  SELECT b.product_id, b.name, b.description, b.price_cents, b.compare_at_cents,
         b.image_url, b.category_name, b.store_slug, b.store_name,
         b.store_vertical, b.store_logo, b.store_city, b.store_neighborhood,
         b.store_fulfillment_modes, b.distance_km, b.published_at,
         count(*) OVER () AS total,
         b.wholesale_min_quantity, b.total_with_wholesale
    FROM filtrada b
   WHERE (NOT coalesce(p_atacado, false)
          OR (b.wholesale_min_quantity IS NOT NULL
              AND (p_pedido_minimo IS NULL OR b.wholesale_min_quantity <= p_pedido_minimo)))
   ORDER BY
     CASE WHEN p_ordem = 'PRECO_MENOR' THEN b.price_cents END ASC NULLS LAST,
     CASE WHEN p_ordem = 'PRECO_MAIOR' THEN b.price_cents END DESC NULLS LAST,
     CASE WHEN p_ordem = 'DISTANCIA' THEN b.distance_km END ASC NULLS LAST,
     CASE WHEN p_ordem = 'RECENTES' THEN b.published_at END DESC,
     b.relevancia DESC,
     b.is_featured DESC,
     b.published_at DESC,
     b.product_id
   LIMIT greatest(least(coalesce(p_limite, 20), 50), 1)
  OFFSET greatest(coalesce(p_deslocamento, 0), 0)
$$;
REVOKE ALL ON FUNCTION app.feed_produtos(text, text[], text, text, double precision, double precision, text, integer, integer, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.feed_produtos(text, text[], text, text, double precision, double precision, text, integer, integer, boolean, integer) TO sc_app;
