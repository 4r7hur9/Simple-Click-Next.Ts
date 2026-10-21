-- ===========================================================================
-- 0068 — O cupom do agente de impressão marca o item vendido no atacado
-- (card #58).
--
-- A impressão por clique lê o item pelo cliente tipado; o agente recebe os
-- mesmos campos por `app.cupom_do_trabalho` (0034). Para os dois caminhos
-- imprimirem o mesmo cupom, a função passa a devolver também o preço
-- congelado do item e a faixa de atacado que valeu (0066):
-- `unitPriceCents`, `priceKindSnapshot`, `wholesaleMinQuantity` e
-- `wholesaleLabel`. O resto da função é o da 0034, sem mudança.
--
-- Idempotente (CREATE OR REPLACE com a mesma assinatura).
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

CREATE OR REPLACE FUNCTION app.cupom_do_trabalho(p_trabalho uuid, p_agente uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_loja   uuid := app.current_store_id();
  v_pedido uuid;
  v_via    integer;
BEGIN
  IF app.current_role_name() <> 'PRINT_AGENT' OR v_loja IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT j.order_id INTO v_pedido
    FROM app.print_jobs j
   WHERE j.id = p_trabalho
     AND j.store_id = v_loja
     AND j.agent_id = p_agente
     AND j.status = 'LEASED'
     AND j.blocks IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE app.orders o
     SET print_count = o.print_count + 1,
         last_printed_at = now()
   WHERE o.id = v_pedido
     AND o.store_id = v_loja
   RETURNING o.print_count INTO v_via;
  IF v_via IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'via', v_via,
    'loja', (SELECT s.name FROM app.stores s WHERE s.id = v_loja),
    'configuracao', (SELECT ss.printing FROM app.store_settings ss WHERE ss.store_id = v_loja),
    'pedido', (
      SELECT jsonb_build_object(
        'code', o.code,
        'channel', o.channel,
        'fulfillment', o.fulfillment,
        'paymentMethod', o.payment_method,
        'changeForCents', o.change_for_cents,
        'subtotalCents', o.subtotal_cents,
        'deliveryFeeCents', o.delivery_fee_cents,
        'deliveryFeeMode', o.delivery_fee_mode,
        'discountCents', o.discount_cents,
        'pickupDiscountCents', o.pickup_discount_cents,
        'totalCents', o.total_cents,
        'customerNote', o.customer_note,
        'storeTimezone', o.store_timezone,
        'placedAt', to_char(o.placed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'contato', (
          SELECT jsonb_build_object(
            'name', c.name,
            'phoneE164', c.phone_e164,
            'recipientName', c.recipient_name,
            'street', c.street,
            'number', c.number,
            'complement', c.complement,
            'neighborhood', c.neighborhood,
            'city', c.city,
            'uf', c.uf,
            'zip', c.zip,
            'referencePoint', c.reference_point)
            FROM app.order_contacts c
           WHERE c.order_id = o.id
             AND c.store_id = o.store_id),
        'itens', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'productName', i.product_name,
                   'variantName', i.variant_name,
                   'quantity', i.quantity,
                   'lineTotalCents', i.line_total_cents,
                   'note', i.note,
                   'unitPriceCents', i.unit_price_cents,
                   'priceKindSnapshot', i.price_kind_snapshot,
                   'wholesaleMinQuantity', i.wholesale_min_quantity,
                   'wholesaleLabel', i.wholesale_label,
                   'opcoes', coalesce((
                     SELECT jsonb_agg(jsonb_build_object(
                              'groupNameSnapshot', op.group_name_snapshot,
                              'optionNameSnapshot', op.option_name_snapshot,
                              'action', op.action,
                              'quantity', op.quantity,
                              'priceDeltaCents', op.price_delta_cents)
                            ORDER BY op.sort_order, op.created_at, op.id)
                       FROM app.order_item_options op
                      WHERE op.order_item_id = i.id
                        AND op.store_id = i.store_id), '[]'::jsonb))
                 ORDER BY i.sort_order, i.created_at, i.id)
            FROM app.order_items i
           WHERE i.order_id = o.id
             AND i.store_id = o.store_id), '[]'::jsonb))
        FROM app.orders o
       WHERE o.id = v_pedido
         AND o.store_id = v_loja)
  );
END $$;

REVOKE ALL ON FUNCTION app.cupom_do_trabalho(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.cupom_do_trabalho(uuid, uuid) TO sc_app;

RESET ROLE;
