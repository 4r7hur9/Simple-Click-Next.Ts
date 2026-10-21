-- ===========================================================================
-- 0067 — As faixas de atacado dos posts do feed (card #56).
--
-- O post do /explorar mostra o varejo e o atacado juntos: "R$ 10,00 · Atacado
-- a partir de 10 un.: R$ 9,50". O feed atravessa lojas e não lê
-- `product_prices` direto (a RLS é por loja); como as mídias da 0060, ele lê
-- por uma função de lista fechada.
--
-- Só sai o que o carrinho já usa para cobrar o atacado — as linhas
-- `WHOLESALE` do produto (`variant_id` nulo), ligadas e dentro da janela de
-- datas, de produto publicado em loja ativa. Nada de custo (`COST`), base ou
-- promoção: o varejo o feed já tem em `display_price_cents`. A conta (qual
-- faixa cabe no preço, o unitário e a economia) é a do core, na API.
--
-- Idempotente.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

DROP FUNCTION IF EXISTS app.atacado_publico_dos_produtos(uuid[]);
CREATE FUNCTION app.atacado_publico_dos_produtos(p_produtos uuid[])
RETURNS TABLE (
  product_id uuid, min_quantity integer, amount_cents bigint,
  discount_kind text, discount_value bigint, label text,
  starts_at timestamptz, ends_at timestamptz)
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
  )
  SELECT pp.product_id, pp.min_quantity, pp.amount_cents, pp.discount_kind,
         pp.discount_value, pp.label, pp.starts_at, pp.ends_at
    FROM app.product_prices pp
    JOIN produtos p ON p.id = pp.product_id AND p.store_id = pp.store_id
   WHERE pp.kind = 'WHOLESALE'
     AND pp.variant_id IS NULL
     AND pp.is_active
     AND (pp.starts_at IS NULL OR pp.starts_at <= now())
     AND (pp.ends_at IS NULL OR pp.ends_at > now())
   ORDER BY pp.product_id, pp.min_quantity, pp.created_at
$$;

REVOKE ALL ON FUNCTION app.atacado_publico_dos_produtos(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.atacado_publico_dos_produtos(uuid[]) TO sc_app;

RESET ROLE;
