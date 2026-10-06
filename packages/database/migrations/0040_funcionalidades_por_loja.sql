-- ===========================================================================
-- 0040 — Funcionalidades liberadas por loja (feature admin-lojas, T-207).
--
-- A DECISÃO (03/10/2026): na versão 1 tudo nasce ligado, sem cobrança e sem
-- limite (AC-213). Planos e assinaturas ficam para depois; o que existe agora
-- são só as EXCEÇÕES por loja, gravadas pela administração (US-204, AC-212).
-- Sem linha aqui, a funcionalidade está ligada.
--
-- QUEM ESCREVE. Só a credencial da administração (`sc_admin`). A conexão das
-- lojas LÊ a linha da própria loja — o painel precisa saber o que esconder do
-- menu — e nada mais: o privilégio de escrita é retirado, para que o dono não
-- religue sozinho o que a administração desligou.
--
-- POR QUE UMA FUNÇÃO TAMBÉM. A trava das rotas (`exigirFuncionalidade`, na
-- API) roda antes de a rota saber quem chamou: o agente de impressão, por
-- exemplo, não é equipe da loja. `app.store_feature_enabled(chave)` responde
-- só um booleano, só para a loja do contexto, e com a regra do padrão ligado
-- dentro dela — o mesmo arranjo fechado de `tracked_order_store` (0039).
--
-- Compatível com a versão anterior: só acrescenta uma tabela e uma função. A
-- versão anterior não lê nenhuma das duas, e sem linha gravada tudo segue
-- ligado, como era.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

CREATE TABLE IF NOT EXISTS app.store_feature_overrides (
  store_id    uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  -- Chave do catálogo (`packages/core/src/funcionalidades.ts`). O formato é
  -- conferido aqui; o catálogo, na borda da API — chave nova não pede migração.
  feature_key text        NOT NULL,
  is_enabled  boolean     NOT NULL,
  -- Reservado para limite por loja (pedidos por mês…). NULL = sem limite.
  limit_value bigint,
  reason      text        NOT NULL,
  set_by      uuid        NOT NULL REFERENCES app.identities (id),
  set_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, feature_key),
  CONSTRAINT store_feature_overrides_chave_ck
    CHECK (feature_key ~ '^[a-z][a-z0-9_]{1,62}$'),
  CONSTRAINT store_feature_overrides_motivo_ck
    CHECK (char_length(reason) BETWEEN 3 AND 500),
  CONSTRAINT store_feature_overrides_limite_ck
    CHECK (limit_value IS NULL OR limit_value >= 0)
);

ALTER TABLE app.store_feature_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_feature_overrides FORCE  ROW LEVEL SECURITY;

-- A equipe lê as exceções da PRÓPRIA loja (vínculo conferido por
-- `is_store_staff`, 0041). Nenhuma política de escrita para `sc_app`.
DROP POLICY IF EXISTS sfo_staff_select ON app.store_feature_overrides;
CREATE POLICY sfo_staff_select ON app.store_feature_overrides FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- O cinto de contexto obrigatório, como nas outras tabelas de loja.
DROP POLICY IF EXISTS sfo_require_ctx ON app.store_feature_overrides;
CREATE POLICY sfo_require_ctx ON app.store_feature_overrides AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

DROP POLICY IF EXISTS sfo_admin_all ON app.store_feature_overrides;
CREATE POLICY sfo_admin_all ON app.store_feature_overrides FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- Duas camadas: a política nega por omissão, e o privilégio retirado barra
-- antes de a política ser consultada. O padrão do esquema concede escrita a
-- `sc_app` em toda tabela nova; aqui ela é desfeita.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app.store_feature_overrides FROM sc_app;
GRANT SELECT ON app.store_feature_overrides TO sc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.store_feature_overrides TO sc_admin;

-- A funcionalidade está ligada para a loja do contexto? Sem exceção gravada,
-- sim (AC-213). Sem loja no contexto, não há o que liberar: responde falso.
CREATE OR REPLACE FUNCTION app.store_feature_enabled(p_feature_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT app.current_store_id() IS NOT NULL
      AND coalesce(
            (SELECT o.is_enabled
               FROM app.store_feature_overrides o
              WHERE o.store_id    = app.current_store_id()
                AND o.feature_key = p_feature_key),
            true) $$;

REVOKE ALL ON FUNCTION app.store_feature_enabled(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.store_feature_enabled(text) TO sc_app, sc_admin;
