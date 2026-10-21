-- ===========================================================================
-- 0060 — Vídeo no produto e Stories de 24 horas (card #46).
--
-- O modelo social do SimpleClick: a LOJA é o perfil (foto de perfil, nome e
-- stories); o PRODUTO é o post (fotos e vídeos). A foto de perfil da loja já
-- existe — é a logo da aparência (`store_settings.landing->>'logo'`) — e as
-- leituras públicas daqui a devolvem.
--
--   product_videos   vídeos do produto (mp4/webm), PERSISTENTES. A ordem
--                    divide o mesmo `sort_order` das fotos (`product_images`):
--                    a galeria mistura foto e vídeo na ordem que o dono
--                    escolher. O arquivo mora no serviço de mídia; aqui ficam
--                    o endereço e a CHAVE que permite apagá-lo.
--   stories          foto ou vídeo vertical da LOJA (não do produto), que
--                    DURA 24 HORAS: `expires_at` nasce `created_at + 24h`.
--                    Toda leitura filtra por `expires_at > now()`, então o
--                    story some na hora certa; a limpeza (job da API) apaga
--                    depois o arquivo e a linha. Legenda e um link opcional
--                    (caminho do próprio site, ex.: a página da loja).
--   story_views      quem viu cada story (uma linha por pessoa), e
--                    `stories.views_count` é o contador que a loja vê.
--
-- LIMITE de stories ativos por loja: padrão da plataforma
-- (`platform_limit_defaults.max_active_stories_per_store`, 30) com ajuste por
-- loja (`store_limits.max_active_stories`), que só a administração escreve.
-- `app.medir_limite_de_stories()` trava e mede, como `medir_limite_da_loja`.
--
-- LEITURA PÚBLICA atravessa lojas (stories de todas as lojas no /explorar;
-- mídias dos produtos do feed), então é feita por funções com os direitos de
-- quem as definiu e lista fechada de campos — o arranjo de 0050.
--
-- Idempotente: IF NOT EXISTS, políticas e funções recriadas.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- product_videos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.product_videos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  product_id   uuid        NOT NULL REFERENCES app.products (id) ON DELETE CASCADE,
  url          text        NOT NULL,
  storage_key  text        NOT NULL,
  poster_url   text,
  poster_key   text,
  content_type text        NOT NULL,
  size_bytes   bigint      NOT NULL,
  duration_ms  integer,
  width        integer,
  height       integer,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_videos_tipo_ck CHECK (content_type IN ('video/mp4', 'video/webm')),
  CONSTRAINT product_videos_tamanho_ck CHECK (size_bytes > 0),
  CONSTRAINT product_videos_duracao_ck CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

CREATE INDEX IF NOT EXISTS product_videos_produto_ix
  ON app.product_videos (store_id, product_id, sort_order);

ALTER TABLE app.product_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.product_videos FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_videos_storefront_select ON app.product_videos;
CREATE POLICY product_videos_storefront_select ON app.product_videos FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER'));
DROP POLICY IF EXISTS product_videos_staff_select ON app.product_videos;
CREATE POLICY product_videos_staff_select ON app.product_videos FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS product_videos_staff_insert ON app.product_videos;
CREATE POLICY product_videos_staff_insert ON app.product_videos FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS product_videos_staff_update ON app.product_videos;
CREATE POLICY product_videos_staff_update ON app.product_videos FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS product_videos_staff_delete ON app.product_videos;
CREATE POLICY product_videos_staff_delete ON app.product_videos FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS product_videos_require_ctx ON app.product_videos;
CREATE POLICY product_videos_require_ctx ON app.product_videos AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);
DROP POLICY IF EXISTS product_videos_admin_all ON app.product_videos;
CREATE POLICY product_videos_admin_all ON app.product_videos FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- stories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.stories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  kind         text        NOT NULL,
  media_url    text        NOT NULL,
  storage_key  text        NOT NULL,
  poster_url   text,
  content_type text        NOT NULL,
  size_bytes   bigint      NOT NULL,
  duration_ms  integer,
  width        integer,
  height       integer,
  caption      text,
  link         text,
  views_count  integer     NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES app.identities (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT stories_tipo_ck CHECK (kind IN ('IMAGEM', 'VIDEO')),
  CONSTRAINT stories_conteudo_ck CHECK (content_type IN
    ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm')),
  CONSTRAINT stories_tamanho_ck CHECK (size_bytes > 0),
  CONSTRAINT stories_legenda_ck CHECK (caption IS NULL OR char_length(caption) <= 200),
  CONSTRAINT stories_link_ck CHECK (link IS NULL OR (char_length(link) <= 300 AND left(link, 1) = '/')),
  CONSTRAINT stories_visualizacoes_ck CHECK (views_count >= 0),
  CONSTRAINT stories_validade_ck CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS stories_ativos_ix
  ON app.stories (store_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS stories_vencimento_ix
  ON app.stories (expires_at);

ALTER TABLE app.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.stories FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stories_staff_select ON app.stories;
CREATE POLICY stories_staff_select ON app.stories FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS stories_staff_insert ON app.stories;
CREATE POLICY stories_staff_insert ON app.stories FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS stories_staff_update ON app.stories;
CREATE POLICY stories_staff_update ON app.stories FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS stories_staff_delete ON app.stories;
CREATE POLICY stories_staff_delete ON app.stories FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS stories_require_ctx ON app.stories;
CREATE POLICY stories_require_ctx ON app.stories AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);
DROP POLICY IF EXISTS stories_admin_all ON app.stories;
CREATE POLICY stories_admin_all ON app.stories FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- story_views — quem viu (da pessoa; a loja vê só o contador)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.story_views (
  story_id    uuid        NOT NULL REFERENCES app.stories (id) ON DELETE CASCADE,
  identity_id uuid        NOT NULL REFERENCES app.identities (id),
  store_id    uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  viewed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, identity_id)
);

CREATE INDEX IF NOT EXISTS story_views_pessoa_ix
  ON app.story_views (identity_id, story_id);
CREATE INDEX IF NOT EXISTS story_views_loja_ix
  ON app.story_views (store_id, story_id);

ALTER TABLE app.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.story_views FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS story_views_self_select ON app.story_views;
CREATE POLICY story_views_self_select ON app.story_views FOR SELECT TO sc_app
  USING (identity_id = (SELECT app.current_user_id())
         AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS story_views_self_insert ON app.story_views;
CREATE POLICY story_views_self_insert ON app.story_views FOR INSERT TO sc_app
  WITH CHECK (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS story_views_self_update ON app.story_views;
CREATE POLICY story_views_self_update ON app.story_views FOR UPDATE TO sc_app
  USING      (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())))
  WITH CHECK (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS story_views_self_delete ON app.story_views;
CREATE POLICY story_views_self_delete ON app.story_views FOR DELETE TO sc_app
  USING (identity_id = (SELECT app.current_user_id())
         AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS story_views_admin_all ON app.story_views;
CREATE POLICY story_views_admin_all ON app.story_views FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Limite de stories ativos
-- ---------------------------------------------------------------------------
ALTER TABLE app.platform_limit_defaults
  ADD COLUMN IF NOT EXISTS max_active_stories_per_store integer NOT NULL DEFAULT 30;
ALTER TABLE app.store_limits
  ADD COLUMN IF NOT EXISTS max_active_stories integer;

ALTER TABLE app.platform_limit_defaults
  DROP CONSTRAINT IF EXISTS platform_limit_defaults_stories_ck;
ALTER TABLE app.platform_limit_defaults
  ADD CONSTRAINT platform_limit_defaults_stories_ck CHECK (max_active_stories_per_store >= 0);
ALTER TABLE app.store_limits
  DROP CONSTRAINT IF EXISTS store_limits_stories_ck;
ALTER TABLE app.store_limits
  ADD CONSTRAINT store_limits_stories_ck CHECK (coalesce(max_active_stories, 0) >= 0);

-- Trava os stories da loja corrente até o fim da transação e devolve o
-- limite e quantos estão ativos agora. Quem recusa é a API (409).
CREATE OR REPLACE FUNCTION app.medir_limite_de_stories()
RETURNS TABLE (limite integer, uso integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_loja uuid := app.current_store_id();
BEGIN
  IF v_loja IS NULL OR NOT app.is_store_staff() THEN
    RAISE EXCEPTION 'medir limite de stories exige a equipe da loja no contexto'
      USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_loja::text || ':stories', 8310049));
  RETURN QUERY
    SELECT coalesce(sl.max_active_stories, d.max_active_stories_per_store)::integer,
           (SELECT count(*)::integer FROM app.stories s
             WHERE s.store_id = v_loja AND s.expires_at > now())
      FROM app.platform_limit_defaults d
      LEFT JOIN app.store_limits sl ON sl.store_id = v_loja
     WHERE d.id = 1;
END $$;

REVOKE ALL ON FUNCTION app.medir_limite_de_stories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.medir_limite_de_stories() TO sc_app;

-- ---------------------------------------------------------------------------
-- Leitura pública: stories ativos
-- ---------------------------------------------------------------------------
-- p_apelido nulo: todas as lojas ativas que aparecem no feed (o /explorar).
-- p_apelido dado: só aquela loja ativa (a vitrine), mesmo fora do feed.
-- Com sessão, cada story diz se a pessoa já viu e cada loja se é favorita.
DROP FUNCTION IF EXISTS app.stories_ativos(text);
CREATE FUNCTION app.stories_ativos(p_apelido text)
RETURNS TABLE (
  story_id uuid, kind text, media_url text, poster_url text,
  duration_ms integer, width integer, height integer, caption text,
  link text, created_at timestamptz, expires_at timestamptz,
  store_slug text, store_name text, store_logo text, accent_color text,
  favorited boolean, seen boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT st.id, st.kind, st.media_url, st.poster_url, st.duration_ms,
         st.width, st.height, st.caption, st.link, st.created_at, st.expires_at,
         s.slug, s.name,
         nullif(cfg.landing->>'logo', ''),
         CASE WHEN (cfg.theme->>'destaque') ~ '^#[0-9a-fA-F]{6}$'
              THEN cfg.theme->>'destaque' END,
         EXISTS (SELECT 1 FROM app.favorite_stores f
                  WHERE f.store_id = s.id AND f.identity_id = app.current_user_id()),
         EXISTS (SELECT 1 FROM app.story_views v
                  WHERE v.story_id = st.id AND v.identity_id = app.current_user_id())
    FROM app.stories st
    JOIN app.stores s ON s.id = st.store_id
    LEFT JOIN app.store_settings cfg ON cfg.store_id = s.id
   WHERE st.expires_at > now()
     AND s.status = 'ACTIVE'
     AND s.deleted_at IS NULL
     AND CASE WHEN p_apelido IS NULL THEN s.feed_visible
              ELSE lower(s.slug) = lower(p_apelido) END
   ORDER BY s.slug, st.created_at
   LIMIT 2000
$$;

REVOKE ALL ON FUNCTION app.stories_ativos(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.stories_ativos(text) TO sc_app;

-- Marca o story como visto pela pessoa da sessão. Conta UMA vez por pessoa.
-- Story vencido, de loja fora do ar ou inexistente: nenhuma linha.
DROP FUNCTION IF EXISTS app.marcar_story_visto(uuid);
CREATE FUNCTION app.marcar_story_visto(p_story uuid)
RETURNS TABLE (novo boolean, visualizacoes integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_pessoa uuid := app.current_user_id();
  v_loja uuid;
  v_inseridas integer;
BEGIN
  IF v_pessoa IS NULL THEN
    RAISE EXCEPTION 'marcar story visto exige sessão' USING ERRCODE = '42501';
  END IF;
  SELECT st.store_id INTO v_loja
    FROM app.stories st
    JOIN app.stores s ON s.id = st.store_id
   WHERE st.id = p_story AND st.expires_at > now()
     AND s.status = 'ACTIVE' AND s.deleted_at IS NULL;
  IF v_loja IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO app.story_views (story_id, identity_id, store_id)
  VALUES (p_story, v_pessoa, v_loja)
  ON CONFLICT (story_id, identity_id) DO NOTHING;
  GET DIAGNOSTICS v_inseridas = ROW_COUNT;
  IF v_inseridas > 0 THEN
    UPDATE app.stories SET views_count = views_count + 1 WHERE id = p_story;
  END IF;
  RETURN QUERY
    SELECT v_inseridas > 0, st.views_count FROM app.stories st WHERE st.id = p_story;
END $$;

REVOKE ALL ON FUNCTION app.marcar_story_visto(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.marcar_story_visto(uuid) TO sc_app;

-- ---------------------------------------------------------------------------
-- Leitura pública: mídias (fotos + vídeos) dos produtos do feed
-- ---------------------------------------------------------------------------
-- Só de produto publicado, de loja ativa. Ordem: a do dono (`sort_order`),
-- foto principal primeiro no empate.
DROP FUNCTION IF EXISTS app.midias_publicas_dos_produtos(uuid[]);
CREATE FUNCTION app.midias_publicas_dos_produtos(p_produtos uuid[])
RETURNS TABLE (
  product_id uuid, media_id uuid, kind text, url text, poster_url text,
  duration_ms integer, width integer, height integer, alt_text text,
  sort_order integer, is_primary boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  WITH produtos AS (
    SELECT p.id, p.store_id
      FROM app.products p
      JOIN app.stores s ON s.id = p.store_id
     WHERE p.id = ANY (p_produtos)
       AND p.deleted_at IS NULL AND p.status = 'PUBLISHED'
       AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
     LIMIT 200
  ), todas AS (
    SELECT i.product_id, i.id AS media_id, 'IMAGEM'::text AS kind, i.url,
           NULL::text AS poster_url, NULL::integer AS duration_ms,
           i.width, i.height, i.alt_text, i.sort_order, i.is_primary, i.created_at
      FROM app.product_images i
      JOIN produtos p ON p.id = i.product_id AND p.store_id = i.store_id
     WHERE i.url IS NOT NULL
    UNION ALL
    SELECT v.product_id, v.id, 'VIDEO', v.url, v.poster_url, v.duration_ms,
           v.width, v.height, NULL, v.sort_order, false, v.created_at
      FROM app.product_videos v
      JOIN produtos p ON p.id = v.product_id AND p.store_id = v.store_id
  )
  SELECT t.product_id, t.media_id, t.kind, t.url, t.poster_url, t.duration_ms,
         t.width, t.height, t.alt_text, t.sort_order, t.is_primary
    FROM todas t
   ORDER BY t.product_id, t.sort_order, t.is_primary DESC, t.created_at
$$;

REVOKE ALL ON FUNCTION app.midias_publicas_dos_produtos(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.midias_publicas_dos_produtos(uuid[]) TO sc_app;

RESET ROLE;
