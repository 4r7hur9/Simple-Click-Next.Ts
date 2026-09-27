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

-- ---------------------------------------------------------------------------
-- T-604 · Os pedidos da conta do cliente, em todas as lojas (AC-616)
-- ---------------------------------------------------------------------------
-- O cliente logado vê os pedidos DELE, em qualquer loja onde comprou, por um
-- caminho dedicado. As políticas de `app.orders` são todas por loja — e a
-- restritiva `orders_require_ctx` exige loja no contexto —, então nenhuma
-- consulta comum alcança pedidos de duas lojas de uma vez. É assim que deve
-- continuar: uma política "vê os meus em qualquer loja" abriria, no mesmo
-- comando, a porta para a loja A ler a linha da loja B.
--
-- A função corre com os direitos de quem a definiu (como
-- `app.my_store_customer_ids`, da 0005), e é ELA que fecha o escopo: só papel
-- CUSTOMER, só a identidade do contexto, só pedidos ligados a um cliente-da-loja
-- cujo `identity_id` é essa identidade. Não lê o contexto de loja de propósito.
-- Dono, equipe e vitrine pública a chamam e recebem zero linhas — e é a prova
-- de isolamento (P-003) que cobra isso.
--
-- `p_order_id` restringe a um pedido: é o detalhe. Pedido de outra pessoa e
-- pedido que não existe devolvem o mesmo vazio, para nem a diferença vazar.
CREATE OR REPLACE FUNCTION app.meus_pedidos(p_order_id uuid DEFAULT NULL)
RETURNS TABLE (
  order_id     uuid,
  store_id     uuid,
  store_name   text,
  store_slug   text,
  number       bigint,
  code         text,
  status       text,
  fulfillment  text,
  total_cents  bigint,
  placed_at    timestamptz,
  updated_at   timestamptz,
  public_token text,
  items_count  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT o.id,
         o.store_id,
         s.name,
         s.slug,
         o.number,
         o.code,
         o.status,
         o.fulfillment,
         o.total_cents,
         o.placed_at,
         o.updated_at,
         o.public_token,
         (SELECT count(*) FROM app.order_items i WHERE i.order_id = o.id)
    FROM app.orders o
    JOIN app.store_customers c ON c.id = o.store_customer_id
    JOIN app.stores s ON s.id = o.store_id
   WHERE app.current_role_name() = 'CUSTOMER'
     AND app.current_user_id() IS NOT NULL
     AND c.identity_id = app.current_user_id()
     AND (p_order_id IS NULL OR o.id = p_order_id)
   ORDER BY o.placed_at DESC, o.id DESC
$$;

REVOKE ALL ON FUNCTION app.meus_pedidos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.meus_pedidos(uuid) TO sc_app, sc_admin;

RESET ROLE;
