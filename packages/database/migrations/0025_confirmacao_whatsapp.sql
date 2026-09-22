-- 0025 — confirmação explícita da mensagem do pedido pelo WhatsApp.
--
-- O cliente pode declarar dois fatos diferentes: abriu a conversa e realmente
-- enviou a mensagem. Eles não podem ser um único booleano, porque abrir a
-- conversa sem enviar é justamente o pedido fantasma que o painel precisa
-- separar.
--
-- A API chama esta função com o token declarado no contexto da requisição. A
-- função é a única porta pública para atualizar estas duas colunas: não damos
-- UPDATE amplo ao cliente, que poderia alterar preço, status ou total.
SET ROLE sc_migrator;

CREATE OR REPLACE FUNCTION app.registrar_whatsapp_do_pedido(
  p_confirmado boolean,
  p_ocorrido_em timestamptz
)
RETURNS TABLE (
  order_id uuid,
  whatsapp_clicked_at timestamptz,
  whatsapp_confirmed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  IF app.current_store_id() IS NULL
     OR app.current_order_token() IS NULL
     OR p_ocorrido_em IS NULL
  THEN
    RETURN;
  END IF;

  IF p_confirmado THEN
    RETURN QUERY
    UPDATE app.orders
       SET whatsapp_clicked_at = COALESCE(whatsapp_clicked_at, p_ocorrido_em),
           whatsapp_confirmed_at = COALESCE(whatsapp_confirmed_at, p_ocorrido_em),
           updated_at = p_ocorrido_em
     WHERE store_id = app.current_store_id()
       AND public_token = app.current_order_token()
     RETURNING id, whatsapp_clicked_at, whatsapp_confirmed_at;
  ELSE
    RETURN QUERY
    UPDATE app.orders
       SET whatsapp_clicked_at = COALESCE(whatsapp_clicked_at, p_ocorrido_em),
           updated_at = p_ocorrido_em
     WHERE store_id = app.current_store_id()
       AND public_token = app.current_order_token()
     RETURNING id, whatsapp_clicked_at, whatsapp_confirmed_at;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app.registrar_whatsapp_do_pedido(boolean, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.registrar_whatsapp_do_pedido(boolean, timestamptz)
  TO sc_app, sc_admin;

RESET ROLE;
