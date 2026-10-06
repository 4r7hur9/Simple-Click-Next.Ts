-- ===========================================================================
-- 0035 · Clientes da loja (faixa B: T-700, T-702, T-703, T-704)
--
-- Cinco acréscimos, todos compatíveis com a versão anterior da aplicação
-- (AC-030): coluna nova que aceita nulo ou é gerada, função nova ou trocada
-- com a mesma assinatura, e índice novo. Nenhuma coluna muda de tipo, nome ou
-- nulidade.
--
-- 1. A CHAVE DE TELEFONE (`phone_key`). O dono digita "(11) 98888-7777" na
--    busca e o banco guarda "5511988887777" — ou "11988887777", quando o
--    cadastro veio do fechamento da vitrine, que ainda não punha o código do
--    país. Comparar texto com texto falharia nos dois sentidos. A coluna gerada
--    reduz qualquer forma à MESMA chave (só dígitos, sem o 55 da frente), e a
--    busca por parte do telefone (AC-701) e o aviso de telefone repetido
--    (AC-704) comparam chave com chave. Gerada pelo banco, e não escrita pela
--    aplicação, para que uma linha inserida por outro caminho nasça com a
--    chave certa.
--
-- 2. A REMOÇÃO COM RETENÇÃO (`removed_at`). Remover um cliente tira a ficha
--    das listagens e NÃO apaga a linha: os pedidos dele apontam para ela, as
--    métricas contam com ela, e o direito de exclusão da LGPD é atendido por
--    anonimização dentro do prazo (ASM-703), não por `DELETE`. Pedido antigo
--    continua íntegro com os dados que tinha na compra (AC-705).
--
-- 3. O ENDEREÇO DA FICHA (`address`). O cliente cadastrado no balcão não tem
--    conta na plataforma, então não tem `customer_addresses` (que é por
--    identidade). O endereço que o dono anota na ficha mora aqui, e é o que o
--    pedido manual copia para o contato quando é entrega (AC-703, AC-707).
--
-- 4. A BAIXA DE ESTOQUE DO PEDIDO MANUAL. A função da 0027 passa a aceitar o
--    canal MANUAL quando quem pede é da equipe da loja (AC-707, AC-710).
--
-- 5. O CLIENTE COM CONTA RECONHECIDO PELO E-MAIL, sem o dono enxergar a
--    identidade dele (AC-706).
-- ===========================================================================

SET ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- A chave de telefone
-- ---------------------------------------------------------------------------
-- IMUTÁVEL por construção: só `regexp_replace`, `length`, `left` e `substr`,
-- que são funções puras do catálogo. É o que permite usá-la numa coluna gerada
-- e num índice.
--
-- Doze ou treze dígitos começando por 55 é o Brasil na frente (DDD de dois
-- dígitos mais oito ou nove do assinante); qualquer outra forma fica como está.
CREATE OR REPLACE FUNCTION app.chave_de_telefone(entrada text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT nullif(
           CASE
             WHEN length(digitos) IN (12, 13) AND left(digitos, 2) = '55'
               THEN substr(digitos, 3)
             ELSE digitos
           END,
           ''
         )
    FROM (SELECT regexp_replace(coalesce(entrada, ''), '[^0-9]', '', 'g') AS digitos) AS d
$$;

ALTER TABLE app.store_customers
  ADD COLUMN IF NOT EXISTS phone_key text
    GENERATED ALWAYS AS (app.chave_de_telefone(phone_e164)) STORED,
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS address jsonb;

COMMENT ON COLUMN app.store_customers.phone_key IS
  'Telefone reduzido a dígitos, sem o código do país: é por ela que a busca e o aviso de repetido comparam (AC-701, AC-704).';
COMMENT ON COLUMN app.store_customers.removed_at IS
  'Quando o dono tirou a ficha das listagens. A linha fica, porque os pedidos e as métricas apontam para ela (AC-705, ASM-703).';
COMMENT ON COLUMN app.store_customers.address IS
  'Endereço anotado na ficha pelo dono, para o cliente sem conta na plataforma (AC-703).';

-- A busca por telefone (AC-701) e o aviso de repetido (AC-704) andam por aqui.
-- Parcial: cliente sem telefone não entra, e o índice fica do tamanho do que
-- a busca de fato percorre.
CREATE INDEX IF NOT EXISTS store_customers_chave_de_telefone_ix
  ON app.store_customers (store_id, phone_key)
  WHERE phone_key IS NOT NULL;

-- A busca por parte do nome, sem acento e sem maiúscula (AC-701). Trigrama
-- porque "parte do nome" é `LIKE '%ana%'`, que um índice comum não atende.
-- `app.sem_acento` é a mesma função da busca da vitrine (0021): uma regra só
-- para "ignorar acento" no produto inteiro.
CREATE INDEX IF NOT EXISTS store_customers_busca_por_nome_ix
  ON app.store_customers
  USING gin (app.sem_acento(lower(coalesce(display_name, ''))) gin_trgm_ops);

-- A listagem ordena por último pedido, que é lido de `orders` por cliente. O
-- índice `orders_do_cliente_idx` (0008) já cobre `(store_id, store_customer_id,
-- placed_at DESC)` incluindo `status` e `total_cents`: nada a acrescentar.

-- ---------------------------------------------------------------------------
-- 4. A baixa de estoque do pedido manual (AC-707, AC-710)
-- ---------------------------------------------------------------------------
-- O pedido que o dono lança no balcão passa pelo MESMO caminho de criação do
-- pedido do site, e por isso precisa passar pela mesma baixa: vender pelo
-- telefone a última camiseta G e deixá-la à venda na vitrine seria vender duas
-- vezes a mesma peça. A função da 0027 só aceitava o canal do site; aqui ela
-- passa a aceitar também o canal MANUAL, e SÓ quando quem pede é da equipe da
-- loja do contexto. Todo o resto é a 0027 sem mudança: o pedido tem de ser o
-- desta requisição (token declarado), ainda aguardando, com a quantidade
-- conferida contra os itens gravados e a baixa sob trava de linha.
--
-- Compatível com a versão anterior: mesma assinatura e mesmo retorno. O código
-- antigo nunca chama a função com pedido manual, e o do site segue igual.
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

  -- O pedido precisa ser o pedido desta requisição. Isso impede que
  -- uma chamada forjada use o definer para mexer no estoque de outro pedido.
  IF NOT EXISTS (
    SELECT 1
      FROM app.orders o
     WHERE o.id = p_order_id
       AND o.store_id = p_store_id
       AND o.public_token = nullif(current_setting('app.order_token', true), '')
       AND o.status = 'PENDING'
       -- O pedido do site, ou o pedido que o PRÓPRIO dono lançou (0035).
       AND (o.channel = 'ONLINE'
            OR (o.channel = 'MANUAL' AND app.is_store_staff()))
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

  -- Variação viva desta loja que NÃO controla estoque: nada a baixar, e o
  -- pedido segue. A linha de nulos é o "siga" — sem ela, a aplicação leria
  -- "acabou".
  IF EXISTS (
    SELECT 1
      FROM app.product_variants v
     WHERE v.id = p_variant_id
       AND v.store_id = p_store_id
       AND v.deleted_at IS NULL
       AND v.stock_quantity IS NULL
  ) THEN
    RETURN QUERY SELECT NULL::integer, NULL::integer;
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

-- ---------------------------------------------------------------------------
-- 5. O cliente com conta, reconhecido pelo e-mail (AC-706)
-- ---------------------------------------------------------------------------
-- Quem comprou na loja logado tem a linha em `store_customers` ligada à
-- identidade, mas o e-mail dele mora em `identities` — fora do alcance de
-- qualquer lojista, e é certo que continue assim. Para o dono que tenta
-- cadastrar à mão "a Ana, ana@exemplo" ouvir "ela já é sua cliente", sem
-- enxergar a identidade dela, esta função responde UMA pergunta: qual cliente
-- DESTA loja tem conta com este e-mail. Devolve o identificador da linha da
-- loja, e nada da identidade.
--
-- Precisa dos direitos de quem a definiu pelo mesmo motivo de
-- `my_store_customer_ids` (0005): consultar `identities` pela credencial da
-- aplicação sofreria o isolamento dela e devolveria nada, SEM erro. O alcance
-- continua o do contexto: só a equipe da loja corrente, e só clientes dela.
CREATE OR REPLACE FUNCTION app.cliente_da_loja_pelo_email(p_email text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT c.id
    FROM app.store_customers c
    JOIN app.identities i ON i.id = c.identity_id
   WHERE app.is_store_staff()
     AND c.store_id = app.current_store_id()
     AND c.removed_at IS NULL
     AND i.email_norm = lower(btrim(p_email))
   ORDER BY c.created_at
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.cliente_da_loja_pelo_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.cliente_da_loja_pelo_email(text) TO sc_app;


RESET ROLE;
