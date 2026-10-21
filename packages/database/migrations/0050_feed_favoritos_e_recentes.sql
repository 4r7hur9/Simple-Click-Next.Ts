-- ===========================================================================
-- 0050 — Feed, favoritos e lojas recentes (card #25).
--
-- O FEED é a vitrine de várias lojas ao mesmo tempo (/explorar):
--
--   products.publish_to_feed   a marca "publicar no feed" do produto (padrão
--                              falso). Marcar — na criação ou depois — gera
--                              uma linha em `feed_posts`.
--   feed_posts                 o que foi publicado e quando. UMA linha por
--                              produto: publicar de novo só atualiza a data.
--   stores.feed_visible        a loja aparece no feed (padrão verdadeiro).
--   stores.feed_auto_publish_new
--                              produto novo já nasce marcado para o feed
--                              (padrão falso). Quem aplica é a API, quando o
--                              cadastro não diz nada sobre a marca.
--
-- A localização da loja já existia (`lat`, `lng`, `city`, `neighborhood`):
-- é ela que ordena por distância.
--
-- FAVORITOS e RECENTES são da PESSOA, e não da loja: cada um vê só os seus
-- (política pela identidade da sessão), atravessando lojas. Dentro de uma
-- transação com loja no contexto, a pessoa só alcança as linhas DAQUELA loja —
-- a mesma régua de isolamento das tabelas de loja.
--
-- A LEITURA PÚBLICA do feed atravessa lojas por natureza, então é feita por
-- funções com os direitos de quem as definiu e LISTA FECHADA de campos — o
-- mesmo arranjo de `app.resolve_store` (0003). Só loja ATIVA, não excluída e
-- que aceita aparecer no feed; só produto publicado, disponível e marcado.
--
-- Idempotente: colunas e tabelas com IF NOT EXISTS, políticas e funções
-- recriadas.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- Marcas e configuração
-- ---------------------------------------------------------------------------
ALTER TABLE app.products
  ADD COLUMN IF NOT EXISTS publish_to_feed boolean NOT NULL DEFAULT false;

ALTER TABLE app.stores
  ADD COLUMN IF NOT EXISTS feed_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS feed_auto_publish_new boolean NOT NULL DEFAULT false;

-- A configuração do feed é do dono (lista fechada de colunas, como em 0003).
GRANT UPDATE (feed_visible, feed_auto_publish_new) ON app.stores TO sc_app;

-- ---------------------------------------------------------------------------
-- feed_posts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.feed_posts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  product_id   uuid        NOT NULL REFERENCES app.products (id) ON DELETE CASCADE,
  kind         text        NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_posts_kind_ck CHECK (kind IN ('PRODUTO_NOVO', 'PRODUTO_PUBLICADO'))
);

CREATE UNIQUE INDEX IF NOT EXISTS feed_posts_produto_uk
  ON app.feed_posts (store_id, product_id);
CREATE INDEX IF NOT EXISTS feed_posts_recentes_ix
  ON app.feed_posts (published_at DESC);

ALTER TABLE app.feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.feed_posts FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feed_posts_staff_select ON app.feed_posts;
CREATE POLICY feed_posts_staff_select ON app.feed_posts FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS feed_posts_staff_insert ON app.feed_posts;
CREATE POLICY feed_posts_staff_insert ON app.feed_posts FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS feed_posts_staff_update ON app.feed_posts;
CREATE POLICY feed_posts_staff_update ON app.feed_posts FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS feed_posts_staff_delete ON app.feed_posts;
CREATE POLICY feed_posts_staff_delete ON app.feed_posts FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS feed_posts_require_ctx ON app.feed_posts;
CREATE POLICY feed_posts_require_ctx ON app.feed_posts AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);
DROP POLICY IF EXISTS feed_posts_admin_all ON app.feed_posts;
CREATE POLICY feed_posts_admin_all ON app.feed_posts FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- Marcar o produto publica. Gatilho, e não a rota: todo caminho que cria ou
-- edita produto (cadastro, duplicação, carga de exemplo) publica igual.
CREATE OR REPLACE FUNCTION app.publicar_produto_no_feed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  IF NOT NEW.publish_to_feed OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.publish_to_feed THEN
    RETURN NEW;
  END IF;
  INSERT INTO app.feed_posts (store_id, product_id, kind, published_at)
  VALUES (NEW.store_id, NEW.id,
          CASE WHEN TG_OP = 'INSERT' THEN 'PRODUTO_NOVO' ELSE 'PRODUTO_PUBLICADO' END,
          now())
  ON CONFLICT (store_id, product_id)
    DO UPDATE SET kind = 'PRODUTO_PUBLICADO', published_at = excluded.published_at;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION app.publicar_produto_no_feed() FROM PUBLIC;

DROP TRIGGER IF EXISTS products_publica_no_feed ON app.products;
CREATE TRIGGER products_publica_no_feed
  AFTER INSERT OR UPDATE OF publish_to_feed ON app.products
  FOR EACH ROW EXECUTE FUNCTION app.publicar_produto_no_feed();

-- ---------------------------------------------------------------------------
-- Favoritos e recentes — da pessoa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.favorite_stores (
  identity_id uuid        NOT NULL REFERENCES app.identities (id),
  store_id    uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identity_id, store_id)
);

ALTER TABLE app.favorite_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.favorite_stores FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS favorite_stores_self_select ON app.favorite_stores;
CREATE POLICY favorite_stores_self_select ON app.favorite_stores FOR SELECT TO sc_app
  USING (identity_id = (SELECT app.current_user_id())
         AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS favorite_stores_self_insert ON app.favorite_stores;
CREATE POLICY favorite_stores_self_insert ON app.favorite_stores FOR INSERT TO sc_app
  WITH CHECK (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS favorite_stores_self_update ON app.favorite_stores;
CREATE POLICY favorite_stores_self_update ON app.favorite_stores FOR UPDATE TO sc_app
  USING      (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())))
  WITH CHECK (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS favorite_stores_self_delete ON app.favorite_stores;
CREATE POLICY favorite_stores_self_delete ON app.favorite_stores FOR DELETE TO sc_app
  USING (identity_id = (SELECT app.current_user_id())
         AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS favorite_stores_admin_all ON app.favorite_stores;
CREATE POLICY favorite_stores_admin_all ON app.favorite_stores FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS app.store_visits (
  identity_id      uuid        NOT NULL REFERENCES app.identities (id),
  store_id         uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  first_visited_at timestamptz NOT NULL DEFAULT now(),
  last_visited_at  timestamptz NOT NULL DEFAULT now(),
  visit_count      integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (identity_id, store_id),
  CONSTRAINT store_visits_contagem_ck CHECK (visit_count >= 1)
);

CREATE INDEX IF NOT EXISTS store_visits_recentes_ix
  ON app.store_visits (identity_id, last_visited_at DESC);

ALTER TABLE app.store_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_visits FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_visits_self_select ON app.store_visits;
CREATE POLICY store_visits_self_select ON app.store_visits FOR SELECT TO sc_app
  USING (identity_id = (SELECT app.current_user_id())
         AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS store_visits_self_insert ON app.store_visits;
CREATE POLICY store_visits_self_insert ON app.store_visits FOR INSERT TO sc_app
  WITH CHECK (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS store_visits_self_update ON app.store_visits;
CREATE POLICY store_visits_self_update ON app.store_visits FOR UPDATE TO sc_app
  USING      (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())))
  WITH CHECK (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS store_visits_self_delete ON app.store_visits;
CREATE POLICY store_visits_self_delete ON app.store_visits FOR DELETE TO sc_app
  USING (identity_id = (SELECT app.current_user_id())
         AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS store_visits_admin_all ON app.store_visits;
CREATE POLICY store_visits_admin_all ON app.store_visits FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Distância em quilômetros (fórmula de haversine)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.distancia_km(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision)
RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE
           WHEN p_lat1 IS NULL OR p_lng1 IS NULL OR p_lat2 IS NULL OR p_lng2 IS NULL
             THEN NULL
           ELSE 6371.0 * 2 * asin(sqrt(
                  power(sin(radians(p_lat2 - p_lat1) / 2), 2)
                  + cos(radians(p_lat1)) * cos(radians(p_lat2))
                    * power(sin(radians(p_lng2 - p_lng1) / 2), 2)))
         END
$$;

REVOKE ALL ON FUNCTION app.distancia_km(double precision, double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.distancia_km(double precision, double precision, double precision, double precision) TO sc_app, sc_admin;

-- ---------------------------------------------------------------------------
-- Leitura pública: lojas do feed
-- ---------------------------------------------------------------------------
-- p_escopo: 'TODAS' (o feed), 'FAVORITAS' ou 'RECENTES' (as da pessoa da
-- sessão; sem sessão, nada). Favorita e recente aparecem mesmo que a loja
-- tenha saído do feed — mas só se estiver ATIVA.
-- p_ordem: 'RELEVANCIA' (padrão), 'DISTANCIA', 'RECENTES', 'NOME'.
DROP FUNCTION IF EXISTS app.feed_lojas(text, text[], text, double precision, double precision, text, integer, integer, text);
CREATE FUNCTION app.feed_lojas(
  p_busca text, p_tipos text[], p_entrega text,
  p_lat double precision, p_lng double precision,
  p_ordem text, p_limite integer, p_deslocamento integer, p_escopo text)
RETURNS TABLE (
  slug text, name text, vertical_code text, vertical_label text,
  city text, neighborhood text, uf text, fulfillment_modes text[],
  logo text, cover text, accent_color text, distance_km double precision,
  feed_products integer, approved_at timestamptz, favorited_at timestamptz,
  last_visited_at timestamptz, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  WITH base AS (
    SELECT s.id, s.slug, s.name, s.vertical_code, v.label AS vertical_label,
           s.city, s.neighborhood, s.uf, s.fulfillment_modes,
           nullif(cfg.landing->>'logo', '') AS logo,
           nullif(cfg.landing->>'capa', '') AS cover,
           CASE WHEN (cfg.theme->>'destaque') ~ '^#[0-9a-fA-F]{6}$'
                THEN cfg.theme->>'destaque' END AS accent_color,
           app.distancia_km(p_lat, p_lng, s.lat::double precision, s.lng::double precision) AS distance_km,
           (SELECT count(*)::integer
              FROM app.products p
             WHERE p.store_id = s.id AND p.publish_to_feed
               AND p.deleted_at IS NULL AND p.status = 'PUBLISHED') AS feed_products,
           s.approved_at,
           f.created_at AS favorited_at,
           vis.last_visited_at,
           CASE WHEN p_busca IS NULL THEN 0
                ELSE public.similarity(app.sem_acento(lower(s.name)), app.sem_acento(lower(p_busca)))
           END AS relevancia
      FROM app.stores s
      JOIN app.vertical_presets v ON v.code = s.vertical_code
      LEFT JOIN app.store_settings cfg ON cfg.store_id = s.id
      LEFT JOIN app.favorite_stores f
             ON f.store_id = s.id AND f.identity_id = app.current_user_id()
      LEFT JOIN app.store_visits vis
             ON vis.store_id = s.id AND vis.identity_id = app.current_user_id()
     WHERE s.status = 'ACTIVE'
       AND s.deleted_at IS NULL
       AND CASE coalesce(p_escopo, 'TODAS')
             WHEN 'FAVORITAS' THEN f.identity_id IS NOT NULL
             WHEN 'RECENTES' THEN vis.identity_id IS NOT NULL
             ELSE s.feed_visible
           END
       AND (p_tipos IS NULL OR cardinality(p_tipos) = 0 OR s.vertical_code = ANY (p_tipos))
       AND (p_entrega IS NULL OR p_entrega = ANY (s.fulfillment_modes))
       AND (p_busca IS NULL
            OR position(app.sem_acento(lower(p_busca)) IN app.sem_acento(lower(s.name))) > 0
            OR position(app.sem_acento(lower(p_busca)) IN app.sem_acento(lower(v.label))) > 0
            OR position(app.sem_acento(lower(p_busca)) IN app.sem_acento(lower(coalesce(s.city, '')))) > 0
            OR position(app.sem_acento(lower(p_busca)) IN app.sem_acento(lower(coalesce(s.neighborhood, '')))) > 0)
  )
  SELECT b.slug, b.name, b.vertical_code, b.vertical_label, b.city,
         b.neighborhood, b.uf, b.fulfillment_modes, b.logo, b.cover,
         b.accent_color, b.distance_km, b.feed_products, b.approved_at,
         b.favorited_at, b.last_visited_at, count(*) OVER () AS total
    FROM base b
   ORDER BY
     CASE WHEN p_escopo = 'RECENTES' THEN b.last_visited_at END DESC NULLS LAST,
     CASE WHEN p_escopo = 'FAVORITAS' AND coalesce(p_ordem, 'RELEVANCIA') = 'RELEVANCIA'
          THEN b.favorited_at END DESC NULLS LAST,
     CASE WHEN p_ordem = 'DISTANCIA' THEN b.distance_km END ASC NULLS LAST,
     CASE WHEN p_ordem = 'RECENTES' THEN b.approved_at END DESC NULLS LAST,
     CASE WHEN p_ordem = 'NOME' THEN app.sem_acento(lower(b.name)) END ASC,
     b.relevancia DESC,
     b.feed_products DESC,
     b.approved_at DESC NULLS LAST,
     b.slug
   LIMIT greatest(least(coalesce(p_limite, 20), 50), 1)
  OFFSET greatest(coalesce(p_deslocamento, 0), 0)
$$;

REVOKE ALL ON FUNCTION app.feed_lojas(text, text[], text, double precision, double precision, text, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.feed_lojas(text, text[], text, double precision, double precision, text, integer, integer, text) TO sc_app;

-- ---------------------------------------------------------------------------
-- Leitura pública: produtos do feed
-- ---------------------------------------------------------------------------
-- p_categoria: nome ou apelido de categoria do produto (sem acento, sem
-- diferença de maiúscula).
-- p_ordem: 'RELEVANCIA' (padrão), 'DISTANCIA', 'PRECO_MENOR', 'PRECO_MAIOR',
-- 'RECENTES'.
DROP FUNCTION IF EXISTS app.feed_produtos(text, text[], text, text, double precision, double precision, text, integer, integer);
CREATE FUNCTION app.feed_produtos(
  p_busca text, p_tipos text[], p_categoria text, p_entrega text,
  p_lat double precision, p_lng double precision,
  p_ordem text, p_limite integer, p_deslocamento integer)
RETURNS TABLE (
  product_id uuid, name text, description text, price_cents bigint,
  compare_at_cents bigint, image_url text, category_name text,
  store_slug text, store_name text, store_vertical text, store_logo text,
  store_city text, store_neighborhood text, store_fulfillment_modes text[],
  distance_km double precision, published_at timestamptz, total bigint)
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
  )
  SELECT b.product_id, b.name, b.description, b.price_cents, b.compare_at_cents,
         b.image_url, b.category_name, b.store_slug, b.store_name,
         b.store_vertical, b.store_logo, b.store_city, b.store_neighborhood,
         b.store_fulfillment_modes, b.distance_km, b.published_at,
         count(*) OVER () AS total
    FROM base b
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

REVOKE ALL ON FUNCTION app.feed_produtos(text, text[], text, text, double precision, double precision, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.feed_produtos(text, text[], text, text, double precision, double precision, text, integer, integer) TO sc_app;

-- ---------------------------------------------------------------------------
-- Favoritar e registrar visita pelo apelido
-- ---------------------------------------------------------------------------
-- O apelido só leva a loja ATIVA: favoritar loja fora do ar não existe, e a
-- resposta não conta se ela existe. Devolve o identificador, ou nulo.
CREATE OR REPLACE FUNCTION app.loja_ativa_pelo_apelido(p_slug text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT s.id FROM app.stores s
   WHERE lower(s.slug) = lower(p_slug)
     AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.loja_ativa_pelo_apelido(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.loja_ativa_pelo_apelido(text) TO sc_app;

RESET ROLE;
