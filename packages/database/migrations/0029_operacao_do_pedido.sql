-- ===========================================================================
-- 0029 · Operação do pedido (faixa F4: T-602, T-604)
--
-- Um arquivo por faixa, em seções por tarefa. Cada seção só substitui ou
-- acrescenta função: nenhuma coluna muda, e a versão anterior da aplicação
-- continua funcionando sobre o banco migrado (AC-030).
-- ===========================================================================

SET ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- T-602 · A confirmação do WhatsApp nunca funcionou
-- ---------------------------------------------------------------------------
-- A função da 0025 declara as colunas de SAÍDA com os mesmos nomes das colunas
-- da tabela (`whatsapp_clicked_at`, `whatsapp_confirmed_at`). Em PL/pgSQL, a
-- coluna de saída é também uma variável, e toda referência sem qualificação
-- dentro do UPDATE ficou ambígua: o PostgreSQL recusa com 42702 ("column
-- reference is ambiguous") em TODA chamada. O clique e o "já enviei" do
-- cliente respondiam erro interno, e nenhum pedido saía do "aguardando".
--
-- Só a prova contra o banco de verdade mostrou isso — o teste de unidade da
-- regra passava, porque ele nunca chamava a função.
--
-- A correção mantém a assinatura, o contrato e os privilégios; muda só a
-- regra de resolução de nomes (`#variable_conflict use_column`: dentro do
-- comando, o nome é a COLUNA da tabela) e qualifica cada referência pelo
-- apelido da tabela, para que a leitura não dependa de lembrar da diretiva.
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
#variable_conflict use_column
BEGIN
  IF app.current_store_id() IS NULL
     OR app.current_order_token() IS NULL
     OR p_ocorrido_em IS NULL
  THEN
    RETURN;
  END IF;

  -- Os instantes só são preenchidos na PRIMEIRA vez: tocar de novo não apaga
  -- nem adianta o que já foi registrado (AC-610).
  RETURN QUERY
  UPDATE app.orders AS o
     SET whatsapp_clicked_at = COALESCE(o.whatsapp_clicked_at, p_ocorrido_em),
         whatsapp_confirmed_at = CASE
           WHEN p_confirmado
             THEN COALESCE(o.whatsapp_confirmed_at, p_ocorrido_em)
           ELSE o.whatsapp_confirmed_at
         END,
         updated_at = p_ocorrido_em
   WHERE o.store_id = app.current_store_id()
     AND o.public_token = app.current_order_token()
  RETURNING o.id, o.whatsapp_clicked_at, o.whatsapp_confirmed_at;
END;
$$;

REVOKE ALL ON FUNCTION app.registrar_whatsapp_do_pedido(boolean, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.registrar_whatsapp_do_pedido(boolean, timestamptz)
  TO sc_app, sc_admin;

RESET ROLE;
