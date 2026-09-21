-- 0024 — baixa atômica de estoque no fechamento do pedido.
--
-- O cliente público pode criar o pedido, mas não recebe UPDATE em
-- product_variants: a RLS precisa continuar impedindo que uma requisição
-- altere catálogo. Esta função é a única exceção estreita: roda como o
-- migrador, confere o contexto/token/pedido/item e faz a baixa condicional
-- que o PostgreSQL serializa por linha.
SET ROLE sc_migrator;

CREATE OR REPLACE FUNCTION app.reservar_estoque_do_pedido(
  p_store_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_order_id uuid
)
RETURNS TABLE (quantity_before integer, quantity_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_before integer;
  v_after integer;
BEGIN
  IF p_quantity <= 0
     OR p_store_id IS NULL
     OR p_variant_id IS NULL
     OR p_order_id IS NULL
     OR p_store_id <> app.current_store_id()
  THEN
    RETURN;
  END IF;

  -- O pedido precisa ser o pedido público desta requisição. Isso impede que
  -- uma chamada forjada use o definer para mexer no estoque de outro pedido.
  IF NOT EXISTS (
    SELECT 1
      FROM app.orders o
     WHERE o.id = p_order_id
       AND o.store_id = p_store_id
       AND o.public_token = nullif(current_setting('app.order_token', true), '')
       AND o.status = 'PENDING'
       AND o.channel = 'ONLINE'
  ) THEN
    RETURN;
  END IF;

  -- A quantidade vem do snapshot do pedido, não do corpo do cliente. Agrupar
  -- linhas iguais na aplicação e conferir a soma aqui fecham os dois caminhos.
  IF NOT EXISTS (
    SELECT 1
      FROM app.order_items i
     WHERE i.order_id = p_order_id
       AND i.store_id = p_store_id
       AND i.variant_id = p_variant_id
     GROUP BY i.order_id, i.variant_id
    HAVING sum(i.quantity) >= p_quantity
  ) THEN
    RETURN;
  END IF;

  -- O predicado stock_quantity >= p_quantity e o UPDATE formam uma única
  -- operação. Em concorrência, a segunda transação espera a trava da linha e
  -- reavalia o predicado já com o saldo novo; não há saldo negativo nem duplo
  -- sucesso para a última unidade.
  UPDATE app.product_variants
     SET stock_quantity = stock_quantity - p_quantity,
         updated_at = now()
   WHERE id = p_variant_id
     AND store_id = p_store_id
     AND deleted_at IS NULL
     AND stock_quantity IS NOT NULL
     AND stock_quantity >= p_quantity
  RETURNING stock_quantity + p_quantity, stock_quantity
       INTO v_before, v_after;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO app.stock_movements (
    store_id,
    variant_id,
    quantity_before,
    quantity_delta,
    quantity_after,
    reason,
    origin,
    order_id,
    actor_id
  ) VALUES (
    p_store_id,
    p_variant_id,
    v_before,
    -p_quantity,
    v_after,
    'Baixa automática do pedido',
    'PEDIDO',
    p_order_id,
    NULL
  );

  RETURN QUERY SELECT v_before, v_after;
END;
$$;

REVOKE ALL ON FUNCTION app.reservar_estoque_do_pedido(uuid, uuid, integer, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reservar_estoque_do_pedido(uuid, uuid, integer, uuid)
  TO sc_app, sc_admin;

RESET ROLE;
