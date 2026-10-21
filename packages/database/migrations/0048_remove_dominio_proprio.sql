-- ===========================================================================
-- 0048 — Fim do domínio próprio do lojista: a loja é sempre /loja/<apelido>.
--
-- `app.store_domains` guardava o subdomínio, o domínio próprio e os apelidos
-- antigos da loja. Os dois primeiros deixaram de existir no produto; só o
-- terceiro continua útil (o link antigo de uma loja que trocou de apelido
-- ainda leva a ela, AC-208) e passa a morar numa coluna da própria loja.
--
--   1. `stores.slugs_antigos` recebe os apelidos antigos que estavam em
--      `store_domains` (tipo LEGACY_SLUG).
--   2. `resolve_store` perde o parâmetro do host: a loja se acha só pelo
--      apelido. `resolve_legacy_slug` passa a ler a coluna nova.
--   3. A tabela `store_domains` (e índices e políticas) sai.
--
-- Esta migração REMOVE uma tabela e troca a assinatura de uma função: o código
-- novo da API e do site vai junto no mesmo lançamento.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- 1. Apelidos antigos
ALTER TABLE app.stores
  ADD COLUMN IF NOT EXISTS slugs_antigos text[] NOT NULL DEFAULT '{}';

UPDATE app.stores s
   SET slugs_antigos = COALESCE((
         SELECT array_agg(DISTINCT lower(d.host))
           FROM app.store_domains d
          WHERE d.store_id = s.id AND d.kind = 'LEGACY_SLUG'), '{}')
 WHERE EXISTS (SELECT 1 FROM app.store_domains d
                WHERE d.store_id = s.id AND d.kind = 'LEGACY_SLUG');

CREATE INDEX IF NOT EXISTS stores_slugs_antigos_ix
  ON app.stores USING gin (slugs_antigos);

-- 2. Resolução só pelo apelido
DROP FUNCTION IF EXISTS app.resolve_store(text, text);

CREATE FUNCTION app.resolve_store(p_slug text)
RETURNS TABLE (
  id uuid, slug text, status text, vertical_code text,
  timezone text, catalog_version bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT s.id, s.slug, s.status, s.vertical_code, s.timezone, s.catalog_version
     FROM app.stores s
    WHERE s.deleted_at IS NULL
      AND p_slug IS NOT NULL
      AND lower(s.slug) = lower(p_slug)
    LIMIT 1 $$;

REVOKE ALL ON FUNCTION app.resolve_store(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_store(text) TO sc_app, sc_admin;

CREATE OR REPLACE FUNCTION app.resolve_legacy_slug(p_slug text)
RETURNS TABLE (slug text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$ SELECT s.slug
        FROM app.stores s
       WHERE p_slug IS NOT NULL
         AND lower(p_slug) = ANY (s.slugs_antigos)
         AND s.deleted_at IS NULL
         AND s.status = 'ACTIVE'
       LIMIT 1 $$;

-- 3. A tabela sai (índices e políticas vão junto)
DROP TABLE IF EXISTS app.store_domains;
