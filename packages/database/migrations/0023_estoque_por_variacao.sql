-- 0023 — histórico imutável de ajustes de estoque por variação.
SET ROLE sc_migrator;

CREATE TABLE IF NOT EXISTS app.stock_movements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  variant_id       uuid NOT NULL REFERENCES app.product_variants (id) ON DELETE CASCADE,
  quantity_before  integer NOT NULL,
  quantity_delta   integer NOT NULL,
  quantity_after   integer NOT NULL,
  reason           text NOT NULL,
  origin           text NOT NULL DEFAULT 'MANUAL',
  order_id         uuid REFERENCES app.orders (id) ON DELETE SET NULL,
  actor_id         uuid REFERENCES app.identities (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_movements_quantidades_nao_negativas CHECK (
    quantity_before >= 0 AND quantity_after >= 0
  ),
  CONSTRAINT stock_movements_delta_coerente CHECK (
    quantity_after = quantity_before + quantity_delta
  ),
  CONSTRAINT stock_movements_delta_nao_zero CHECK (quantity_delta <> 0),
  CONSTRAINT stock_movements_origem_conhecida CHECK (
    origin IN ('MANUAL', 'PEDIDO', 'CANCELAMENTO', 'IMPORTACAO')
  )
);

CREATE INDEX IF NOT EXISTS stock_movements_da_variacao_idx
  ON app.stock_movements (store_id, variant_id, created_at DESC)
  INCLUDE (quantity_before, quantity_delta, quantity_after, reason, origin, actor_id);

ALTER TABLE app.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.stock_movements FORCE ROW LEVEL SECURITY;

CREATE POLICY stock_movements_staff_select ON app.stock_movements FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY stock_movements_staff_insert ON app.stock_movements FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY stock_movements_require_ctx ON app.stock_movements AS RESTRICTIVE FOR ALL TO sc_app
  USING ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY stock_movements_admin_all ON app.stock_movements FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT ON app.stock_movements TO sc_app, sc_admin;

RESET ROLE;
