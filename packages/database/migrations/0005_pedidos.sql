-- ===========================================================================
-- 0005 — Comprador da loja: os dois eixos de contexto.
--
-- Esta migração entrega o pedaço do domínio de pedidos de que as próximas
-- tarefas dependem: a projeção do comprador por loja e a função que resolve
-- "quais linhas de cliente são minhas". As tabelas de pedido em si — `orders`,
-- `order_contacts`, `order_items`, `order_item_options`,
-- `order_status_history`, `order_payments`, `carts`, `cart_items`,
-- `store_sequences`, `coupons` e `coupon_redemptions` — entram nas tarefas da
-- fatia de pedido (F1/F2), com o mesmo bloco canônico de políticas e mais as
-- travas de imutabilidade que o pedido exige.
--
-- `store_customers` já vem aqui porque é onde o vazamento REAL aconteceu na
-- validação do modelo, e porque é a tabela que ensina o padrão dos dois eixos:
-- políticas permissivas se combinam por OU, então um eixo sem porteiro de papel
-- soma visibilidade em vez de restringi-la.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- store_customers — o comprador visto pela loja
-- ---------------------------------------------------------------------------
-- Projeção por loja da identidade global: aqui mora o que o dono precisa para
-- entregar o pedido, e só isso. O e-mail, o hash de senha e o segundo fator
-- ficam em `identities`, fora do alcance de qualquer lojista.
CREATE TABLE IF NOT EXISTS app.store_customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  -- Nulo quando o dono cadastrou o cliente à mão: comprar sem conta é a
  -- maioria dos pedidos reais do público-alvo.
  identity_id   uuid REFERENCES app.identities (id),
  display_name  text,
  phone_e164    text,
  -- Reconciliação de histórico sem criar índice pesquisável de dado pessoal.
  phone_hmac    bytea,
  email         text,
  doc_number    text,
  birth_date    date,
  notes         text,
  orders_count  integer NOT NULL DEFAULT 0,
  total_spent_cents bigint NOT NULL DEFAULT 0,
  last_order_at timestamptz,
  anonymized_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_customers_total_ck CHECK (total_spent_cents >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS store_customers_store_identity_uk
  ON app.store_customers (store_id, identity_id) WHERE identity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS store_customers_store_telefone_ix
  ON app.store_customers (store_id, phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS store_customers_identidade_ix
  ON app.store_customers (identity_id) WHERE identity_id IS NOT NULL;

DROP TRIGGER IF EXISTS store_customers_touch ON app.store_customers;
CREATE TRIGGER store_customers_touch BEFORE UPDATE ON app.store_customers
  FOR EACH ROW EXECUTE FUNCTION app.tocar_atualizado_em();

ALTER TABLE app.store_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_customers FORCE  ROW LEVEL SECURITY;

-- Eixo 1 — o dono vê os clientes DA LOJA. O porteiro de papel é obrigatório:
-- sem ele, a compradora que navega no catálogo (e por isso tem contexto de
-- loja definido) passa a ver todos os clientes daquela loja.
CREATE POLICY sc_staff_select ON app.store_customers FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- Eixo 2 — o comprador vê a PRÓPRIA linha. O porteiro também é obrigatório
-- aqui, e este é o lado menos óbvio: sem ele, o dono da loja A que também é
-- cliente da loja B veria a própria linha de OUTRA loja entrar na listagem
-- "clientes da minha loja".
CREATE POLICY sc_self_select ON app.store_customers FOR SELECT TO sc_app
  USING ((SELECT app.current_role_name()) = 'CUSTOMER'
     AND identity_id IS NOT NULL
     AND identity_id = (SELECT app.current_user_id()));

CREATE POLICY sc_staff_insert ON app.store_customers FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- Autovínculo: só a si mesmo e só na loja corrente.
CREATE POLICY sc_self_insert ON app.store_customers FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND identity_id = (SELECT app.current_user_id()));

CREATE POLICY sc_staff_update ON app.store_customers FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY sc_staff_delete ON app.store_customers FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY sc_require_ctx ON app.store_customers AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY sc_admin_all ON app.store_customers FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Quais linhas de cliente são minhas
-- ---------------------------------------------------------------------------
-- Precisa dos direitos de quem a definiu porque uma política que consultasse
-- uma tabela protegida sofreria o isolamento DELA e devolveria zero linhas SEM
-- erro — negação silenciosa, o defeito mais caro de diagnosticar.
--
-- O tipo de retorno é arranjo de propósito: usado como `= ANY ((SELECT fn())
-- ::uuid[])`, vira plano inicial avaliado uma vez, e não uma chamada por linha.
CREATE OR REPLACE FUNCTION app.my_store_customer_ids() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT coalesce(array_agg(c.id), '{}'::uuid[])
     FROM app.store_customers c
    WHERE c.identity_id IS NOT NULL
      AND c.identity_id = app.current_user_id() $$;

REVOKE ALL ON FUNCTION app.my_store_customer_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.my_store_customer_ids() TO sc_app;
