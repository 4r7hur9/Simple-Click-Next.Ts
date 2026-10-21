-- ===========================================================================
-- 0061 — Favoritos de PRODUTO e recentes com janela de tempo (card #45).
--
-- favorite_products   o produto que a pessoa favoritou (cliente ↔ produto),
--                     com a loja ao lado para a régua de isolamento. Uma
--                     linha por produto: favoritar de novo não duplica. Não
--                     expira — só sai quando a pessoa tira.
--
-- As políticas são as mesmas de `favorite_stores` (0050): cada um vê e mexe
-- só nos seus; dentro de uma transação com loja no contexto, só nas linhas
-- DAQUELA loja.
--
-- A leitura atravessa lojas, então passa por funções com os direitos de quem
-- as definiu e lista fechada de campos (o arranjo de `app.feed_produtos`):
--
--   app.produto_favoritavel(id)     a loja do produto publicado, não excluído,
--                                   de loja ATIVA; nulo nos outros casos.
--   app.produtos_favoritos()        os favoritos da pessoa da sessão com o que
--                                   o cartão mostra. Produto excluído, fora de
--                                   publicação ou de loja que saiu do ar fica
--                                   de fora (a linha continua: se a loja
--                                   voltar, o favorito volta). Indisponível
--                                   aparece, marcado.
--   app.limpar_visitas_antigas(d)   apaga as visitas da pessoa da sessão mais
--                                   velhas que `d` dias (recentes têm janela).
--
-- Idempotente.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

CREATE TABLE IF NOT EXISTS app.favorite_products (
  identity_id uuid        NOT NULL REFERENCES app.identities (id),
  store_id    uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  product_id  uuid        NOT NULL REFERENCES app.products (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identity_id, product_id)
);

CREATE INDEX IF NOT EXISTS favorite_products_recentes_ix
  ON app.favorite_products (identity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS favorite_products_loja_ix
  ON app.favorite_products (store_id);

ALTER TABLE app.favorite_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.favorite_products FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS favorite_products_self_select ON app.favorite_products;
CREATE POLICY favorite_products_self_select ON app.favorite_products FOR SELECT TO sc_app
  USING (identity_id = (SELECT app.current_user_id())
         AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS favorite_products_self_insert ON app.favorite_products;
CREATE POLICY favorite_products_self_insert ON app.favorite_products FOR INSERT TO sc_app
  WITH CHECK (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS favorite_products_self_update ON app.favorite_products;
CREATE POLICY favorite_products_self_update ON app.favorite_products FOR UPDATE TO sc_app
  USING      (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())))
  WITH CHECK (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS favorite_products_self_delete ON app.favorite_products;
CREATE POLICY favorite_products_self_delete ON app.favorite_products FOR DELETE TO sc_app
  USING (identity_id = (SELECT app.current_user_id())
         AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS favorite_products_admin_all ON app.favorite_products;
CREATE POLICY favorite_products_admin_all ON app.favorite_products FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- O produto que dá para favoritar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.produto_favoritavel(p_produto uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT p.store_id FROM app.products p
    JOIN app.stores s ON s.id = p.store_id
   WHERE p.id = p_produto
     AND p.deleted_at IS NULL AND p.status = 'PUBLISHED'
     AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.produto_favoritavel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.produto_favoritavel(uuid) TO sc_app;

-- ---------------------------------------------------------------------------
-- Os produtos favoritos da pessoa da sessão
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS app.produtos_favoritos(integer);
CREATE FUNCTION app.produtos_favoritos(p_limite integer)
RETURNS TABLE (
  product_id uuid, name text, price_cents bigint, compare_at_cents bigint,
  image_url text, available boolean, unavailable_until timestamptz,
  store_slug text, store_name text, store_vertical text, store_logo text,
  store_city text, store_neighborhood text, store_fulfillment_modes text[],
  favorited_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT p.id, p.name, p.display_price_cents, p.compare_at_cents,
         (SELECT i.url FROM app.product_images i
           WHERE i.product_id = p.id AND i.store_id = p.store_id AND i.url IS NOT NULL
           ORDER BY i.is_primary DESC, i.sort_order, i.created_at LIMIT 1),
         p.is_available AND (p.unavailable_until IS NULL OR p.unavailable_until <= now()),
         CASE WHEN p.unavailable_until > now() THEN p.unavailable_until END,
         s.slug, s.name, s.vertical_code,
         nullif(cfg.landing->>'logo', ''),
         s.city, s.neighborhood, s.fulfillment_modes,
         f.created_at
    FROM app.favorite_products f
    JOIN app.products p ON p.id = f.product_id AND p.store_id = f.store_id
    JOIN app.stores s ON s.id = p.store_id
    LEFT JOIN app.store_settings cfg ON cfg.store_id = s.id
   WHERE f.identity_id = app.current_user_id()
     AND p.deleted_at IS NULL AND p.status = 'PUBLISHED'
     AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
   ORDER BY f.created_at DESC, p.id
   LIMIT greatest(least(coalesce(p_limite, 100), 200), 1)
$$;

REVOKE ALL ON FUNCTION app.produtos_favoritos(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.produtos_favoritos(integer) TO sc_app;

-- ---------------------------------------------------------------------------
-- Limpeza das visitas antigas (da pessoa da sessão)
-- ---------------------------------------------------------------------------
-- Sem direitos especiais: a política de `store_visits` já limita a pessoa às
-- suas linhas.
CREATE OR REPLACE FUNCTION app.limpar_visitas_antigas(p_dias integer)
RETURNS integer
LANGUAGE sql VOLATILE
SET search_path = app, pg_temp
AS $$
  WITH apagadas AS (
    DELETE FROM app.store_visits
     WHERE identity_id = app.current_user_id()
       AND last_visited_at < now() - make_interval(days => greatest(p_dias, 1))
    RETURNING 1
  )
  SELECT count(*)::integer FROM apagadas
$$;

REVOKE ALL ON FUNCTION app.limpar_visitas_antigas(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.limpar_visitas_antigas(integer) TO sc_app;

RESET ROLE;
