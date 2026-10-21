-- ===========================================================================
-- 0059 — Os itens dos pedidos da conta do cliente (card #35), para as métricas
-- "produtos mais pedidos". Mesma porta de `app.meus_pedidos()` (0029): corre
-- com os direitos de quem a definiu e fecha o escopo sozinha — só papel
-- CUSTOMER, só a identidade do contexto, só pedidos ligados a ela. Outro papel
-- recebe zero linhas. Só cria função: nada que já existe muda.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

CREATE OR REPLACE FUNCTION app.meus_itens_de_pedidos()
RETURNS TABLE (
  order_id         uuid,
  store_slug       text,
  store_name       text,
  product_name     text,
  quantity         integer,
  line_total_cents bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT i.order_id,
         s.slug,
         s.name,
         i.product_name,
         i.quantity,
         i.line_total_cents
    FROM app.order_items i
    JOIN app.orders o ON o.id = i.order_id
    JOIN app.store_customers c ON c.id = o.store_customer_id
    JOIN app.stores s ON s.id = o.store_id
   WHERE app.current_role_name() = 'CUSTOMER'
     AND app.current_user_id() IS NOT NULL
     AND c.identity_id = app.current_user_id()
$$;

REVOKE ALL ON FUNCTION app.meus_itens_de_pedidos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.meus_itens_de_pedidos() TO sc_app, sc_admin;

RESET ROLE;
