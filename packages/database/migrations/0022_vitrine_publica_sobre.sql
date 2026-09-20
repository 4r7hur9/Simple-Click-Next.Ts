-- 0022 — a página Sobre recebe apenas os contatos explicitamente públicos.
SET ROLE sc_migrator;

DROP FUNCTION IF EXISTS app.storefront_settings();

CREATE FUNCTION app.storefront_settings()
RETURNS TABLE (landing jsonb, theme jsonb, whatsapp jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT s.landing, s.theme, s.whatsapp
     FROM app.store_settings s
     JOIN app.stores l ON l.id = s.store_id
    WHERE s.store_id = app.current_store_id()
      AND l.status = 'ACTIVE'
      AND l.deleted_at IS NULL $$;

REVOKE ALL ON FUNCTION app.storefront_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.storefront_settings() TO sc_app, sc_admin;

RESET ROLE;
