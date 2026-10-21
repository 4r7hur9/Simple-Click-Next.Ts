-- ===========================================================================
-- 0051 — Limites controlados pela administração (card #25).
--
-- Três camadas, da mais geral para a mais específica:
--
--   platform_limit_defaults  UMA linha com os padrões da plataforma: lojas por
--                            dono (2), equipe por loja (1), produtos (500),
--                            categorias (50) e clientes (5000) por loja.
--   store_limits             o ajuste de UMA loja. Coluna nula = vale o padrão.
--   owner_limits             o ajuste de UM dono (quantas lojas ele abre).
--
-- Só a administração escreve (credencial `sc_admin`). A credencial das lojas
-- LÊ o padrão e o ajuste da PRÓPRIA loja — é o que o painel mostra em "uso e
-- limites" e o que a API confere antes de criar.
--
-- A CONFERÊNCIA mora em `app.medir_limite_da_loja(recurso)`: ela trava o
-- recurso da loja corrente até o fim da transação (duas criações ao mesmo
-- tempo não passam juntas do limite) e devolve o limite e o uso. Quem decide
-- recusar é a API, com `409 limite_atingido {recurso, limite, uso}`.
--
-- `audit_platform` é a trilha do que não é de loja nenhuma (padrões da
-- plataforma e limite de dono): `audit_log` exige loja. Mesmas três camadas
-- de imutabilidade de `audit_log` (G9).
--
-- Idempotente: tabelas e índices com IF NOT EXISTS, políticas recriadas.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- Padrões da plataforma
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.platform_limit_defaults (
  id                       smallint    PRIMARY KEY DEFAULT 1,
  max_stores_per_owner     integer     NOT NULL DEFAULT 2,
  max_staff_per_store      integer     NOT NULL DEFAULT 1,
  max_products_per_store   integer     NOT NULL DEFAULT 500,
  max_categories_per_store integer     NOT NULL DEFAULT 50,
  max_customers_per_store  integer     NOT NULL DEFAULT 5000,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid REFERENCES app.identities (id),
  CONSTRAINT platform_limit_defaults_uma_linha CHECK (id = 1),
  CONSTRAINT platform_limit_defaults_nao_negativos CHECK (
    max_stores_per_owner >= 0 AND max_staff_per_store >= 0
    AND max_products_per_store >= 0 AND max_categories_per_store >= 0
    AND max_customers_per_store >= 0)
);

INSERT INTO app.platform_limit_defaults (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS platform_limit_defaults_touch ON app.platform_limit_defaults;
CREATE TRIGGER platform_limit_defaults_touch BEFORE UPDATE ON app.platform_limit_defaults
  FOR EACH ROW EXECUTE FUNCTION app.tocar_atualizado_em();

ALTER TABLE app.platform_limit_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.platform_limit_defaults FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS limit_defaults_select ON app.platform_limit_defaults;
CREATE POLICY limit_defaults_select ON app.platform_limit_defaults FOR SELECT TO sc_app
  USING (true);
DROP POLICY IF EXISTS limit_defaults_admin_all ON app.platform_limit_defaults;
CREATE POLICY limit_defaults_admin_all ON app.platform_limit_defaults FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON app.platform_limit_defaults FROM sc_app;

-- ---------------------------------------------------------------------------
-- Ajuste por loja
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.store_limits (
  store_id       uuid PRIMARY KEY REFERENCES app.stores (id) ON DELETE CASCADE,
  max_staff      integer,
  max_products   integer,
  max_categories integer,
  max_customers  integer,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES app.identities (id),
  CONSTRAINT store_limits_nao_negativos CHECK (
    coalesce(max_staff, 0) >= 0 AND coalesce(max_products, 0) >= 0
    AND coalesce(max_categories, 0) >= 0 AND coalesce(max_customers, 0) >= 0)
);

DROP TRIGGER IF EXISTS store_limits_touch ON app.store_limits;
CREATE TRIGGER store_limits_touch BEFORE UPDATE ON app.store_limits
  FOR EACH ROW EXECUTE FUNCTION app.tocar_atualizado_em();

ALTER TABLE app.store_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_limits FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_limits_staff_select ON app.store_limits;
CREATE POLICY store_limits_staff_select ON app.store_limits FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS store_limits_require_ctx ON app.store_limits;
CREATE POLICY store_limits_require_ctx ON app.store_limits AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);
DROP POLICY IF EXISTS store_limits_admin_all ON app.store_limits;
CREATE POLICY store_limits_admin_all ON app.store_limits FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON app.store_limits FROM sc_app;

-- ---------------------------------------------------------------------------
-- Ajuste por dono
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.owner_limits (
  identity_id uuid PRIMARY KEY REFERENCES app.identities (id),
  max_stores  integer,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES app.identities (id),
  CONSTRAINT owner_limits_nao_negativo CHECK (coalesce(max_stores, 0) >= 0)
);

DROP TRIGGER IF EXISTS owner_limits_touch ON app.owner_limits;
CREATE TRIGGER owner_limits_touch BEFORE UPDATE ON app.owner_limits
  FOR EACH ROW EXECUTE FUNCTION app.tocar_atualizado_em();

ALTER TABLE app.owner_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.owner_limits FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_limits_self_select ON app.owner_limits;
CREATE POLICY owner_limits_self_select ON app.owner_limits FOR SELECT TO sc_app
  USING (identity_id = (SELECT app.current_user_id()));
DROP POLICY IF EXISTS owner_limits_admin_all ON app.owner_limits;
CREATE POLICY owner_limits_admin_all ON app.owner_limits FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON app.owner_limits FROM sc_app;

-- ---------------------------------------------------------------------------
-- Trilha da plataforma (o que não é de loja nenhuma)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.audit_platform (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    uuid REFERENCES app.identities (id),
  actor_role  text        NOT NULL,
  action      text        NOT NULL,
  entity      text        NOT NULL,
  entity_id   text,
  before_data jsonb,
  after_data  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_platform_criado_ix
  ON app.audit_platform (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_platform_entidade_ix
  ON app.audit_platform (entity, entity_id, created_at DESC);

ALTER TABLE app.audit_platform ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_platform FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_platform_admin_insert ON app.audit_platform;
CREATE POLICY audit_platform_admin_insert ON app.audit_platform FOR INSERT TO sc_admin
  WITH CHECK (true);
DROP POLICY IF EXISTS audit_platform_admin_select ON app.audit_platform;
CREATE POLICY audit_platform_admin_select ON app.audit_platform FOR SELECT TO sc_admin
  USING (true);

REVOKE ALL ON app.audit_platform FROM sc_app;
REVOKE UPDATE, DELETE ON app.audit_platform FROM sc_admin;

DROP TRIGGER IF EXISTS audit_platform_append_only ON app.audit_platform;
CREATE TRIGGER audit_platform_append_only BEFORE UPDATE OR DELETE ON app.audit_platform
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();

-- ---------------------------------------------------------------------------
-- Uso e limite de uma loja
-- ---------------------------------------------------------------------------
-- Roda com os direitos de quem chama: pela credencial das lojas enxerga só a
-- própria loja (as contagens de outra dariam zero e o ajuste dela não
-- apareceria); pela da administração, qualquer uma. Os recursos:
--   staff       vínculos de equipe (STAFF) ativos
--   produtos    produtos não removidos
--   categorias  categorias não removidas
--   clientes    clientes da loja não removidos nem anonimizados
CREATE OR REPLACE FUNCTION app.limites_da_loja(p_loja uuid)
RETURNS TABLE (recurso text, limite integer, uso integer)
LANGUAGE sql STABLE
SET search_path = app, pg_temp
AS $$
  WITH padrao AS (SELECT * FROM app.platform_limit_defaults WHERE id = 1),
       ajuste AS (SELECT * FROM app.store_limits WHERE store_id = p_loja)
  SELECT 'staff',
         coalesce((SELECT max_staff FROM ajuste), (SELECT max_staff_per_store FROM padrao), 1),
         (SELECT count(*)::integer FROM app.store_members m
           WHERE m.store_id = p_loja AND m.role = 'STAFF' AND m.revoked_at IS NULL)
  UNION ALL
  SELECT 'produtos',
         coalesce((SELECT max_products FROM ajuste), (SELECT max_products_per_store FROM padrao), 500),
         (SELECT count(*)::integer FROM app.products p
           WHERE p.store_id = p_loja AND p.deleted_at IS NULL)
  UNION ALL
  SELECT 'categorias',
         coalesce((SELECT max_categories FROM ajuste), (SELECT max_categories_per_store FROM padrao), 50),
         (SELECT count(*)::integer FROM app.categories c
           WHERE c.store_id = p_loja AND c.deleted_at IS NULL)
  UNION ALL
  SELECT 'clientes',
         coalesce((SELECT max_customers FROM ajuste), (SELECT max_customers_per_store FROM padrao), 5000),
         (SELECT count(*)::integer FROM app.store_customers c
           WHERE c.store_id = p_loja AND c.removed_at IS NULL AND c.anonymized_at IS NULL)
$$;

REVOKE ALL ON FUNCTION app.limites_da_loja(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.limites_da_loja(uuid) TO sc_app, sc_admin;

-- Trava o recurso da loja CORRENTE até o fim da transação e devolve limite e
-- uso. A trava é consultiva e por (loja, recurso): duas criações simultâneas
-- de produto na mesma loja esperam uma pela outra; lojas diferentes, não.
CREATE OR REPLACE FUNCTION app.medir_limite_da_loja(p_recurso text)
RETURNS TABLE (limite integer, uso integer)
LANGUAGE plpgsql VOLATILE
SET search_path = app, pg_temp
AS $$
BEGIN
  IF app.current_store_id() IS NULL THEN
    RAISE EXCEPTION 'medir limite exige loja no contexto' USING ERRCODE = '42501';
  END IF;
  IF p_recurso NOT IN ('staff', 'produtos', 'categorias', 'clientes') THEN
    RAISE EXCEPTION 'recurso de limite desconhecido: %', p_recurso USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(app.current_store_id()::text || ':' || p_recurso, 8310049));
  RETURN QUERY
    SELECT l.limite, l.uso
      FROM app.limites_da_loja(app.current_store_id()) l
     WHERE l.recurso = p_recurso;
END $$;

REVOKE ALL ON FUNCTION app.medir_limite_da_loja(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.medir_limite_da_loja(text) TO sc_app, sc_admin;

-- Quantas lojas o dono tem e quantas pode ter. Conta loja aguardando
-- aprovação, ativa e desativada; recusada e excluída não ocupam vaga.
-- Atravessa lojas por natureza, então roda com os direitos de quem a definiu
-- e só responde pela própria pessoa — ou pela administração.
CREATE OR REPLACE FUNCTION app.limite_de_lojas_do_dono(p_identidade uuid)
RETURNS TABLE (limite integer, uso integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  IF session_user <> 'sc_admin'
     AND p_identidade IS DISTINCT FROM app.current_user_id() THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT coalesce(
             (SELECT o.max_stores FROM app.owner_limits o WHERE o.identity_id = p_identidade),
             (SELECT d.max_stores_per_owner FROM app.platform_limit_defaults d WHERE d.id = 1),
             2),
           (SELECT count(*)::integer
              FROM app.store_members m
              JOIN app.stores s ON s.id = m.store_id
             WHERE m.identity_id = p_identidade
               AND m.role = 'OWNER'
               AND m.revoked_at IS NULL
               AND s.deleted_at IS NULL
               AND s.status IN ('PENDING_APPROVAL', 'ACTIVE', 'INACTIVE'));
END $$;

REVOKE ALL ON FUNCTION app.limite_de_lojas_do_dono(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.limite_de_lojas_do_dono(uuid) TO sc_app, sc_admin;

RESET ROLE;
