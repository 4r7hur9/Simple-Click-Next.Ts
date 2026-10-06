-- ===========================================================================
-- 0036 · Endereços salvos do cliente (faixa B: T-707, AC-509)
--
-- O endereço pertence à IDENTIDADE, e não à loja: a pessoa cadastra uma vez e
-- usa em qualquer loja onde compre (paridade com o concorrente examinado). Por
-- isso a tabela não tem `store_id`, e fica FORA do perímetro do dono — o
-- lojista recebe o endereço copiado no contato do pedido (`order_contacts`),
-- nunca a lista de endereços da pessoa.
--
-- O isolamento é por identidade: só o papel CUSTOMER, e só as próprias
-- linhas, em cada um dos quatro comandos. O gatilho de evento da 0001 já liga
-- e força o isolamento em tabela nova; aqui ele é escrito de novo para o
-- leitor não depender de lembrar disso.
--
-- Compatível com a versão anterior (AC-030): tabela nova, nada existente muda.
-- ===========================================================================

SET ROLE sc_migrator;

CREATE TABLE IF NOT EXISTS app.customer_addresses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id     uuid NOT NULL REFERENCES app.identities (id) ON DELETE CASCADE,
  -- "Casa", "Trabalho": o nome que a pessoa dá para escolher na lista.
  label           text,
  recipient_name  text,
  street          text NOT NULL,
  number          text,
  complement      text,
  neighborhood    text,
  city            text,
  uf              char(2),
  zip             text,
  reference_point text,
  is_default      boolean NOT NULL DEFAULT false,
  -- Exclusão LGPD é anonimização, nunca DELETE de pedido; aqui o endereço
  -- salvo pode ser apagado pela própria pessoa, e a anonimização cobre o
  -- caminho administrativo.
  anonymized_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- A lista da pessoa, com o padrão na frente.
CREATE INDEX IF NOT EXISTS customer_addresses_por_identidade_ix
  ON app.customer_addresses (identity_id, is_default DESC, created_at);

-- Um padrão só por pessoa: é o que o fechamento pré-preenche (AC-509). Índice
-- único PARCIAL, e não uma coluna na identidade, para que trocar o padrão seja
-- um `UPDATE` em duas linhas da mesma tabela.
CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_um_padrao_uk
  ON app.customer_addresses (identity_id)
  WHERE is_default;

DROP TRIGGER IF EXISTS customer_addresses_touch ON app.customer_addresses;
CREATE TRIGGER customer_addresses_touch BEFORE UPDATE ON app.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION app.tocar_atualizado_em();

ALTER TABLE app.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_addresses FORCE  ROW LEVEL SECURITY;

-- Só a própria pessoa, e só no papel de CLIENTE. O porteiro de papel é
-- obrigatório pelo mesmo motivo dos dois eixos de `store_customers` (0005): o
-- dono da loja A que também compra como cliente não pode, numa requisição do
-- painel, enxergar os próprios endereços misturados ao trabalho da loja.
CREATE POLICY customer_addresses_self_select ON app.customer_addresses FOR SELECT TO sc_app
  USING ((SELECT app.current_role_name()) = 'CUSTOMER'
     AND identity_id = (SELECT app.current_user_id()));

CREATE POLICY customer_addresses_self_insert ON app.customer_addresses FOR INSERT TO sc_app
  WITH CHECK ((SELECT app.current_role_name()) = 'CUSTOMER'
          AND identity_id = (SELECT app.current_user_id()));

CREATE POLICY customer_addresses_self_update ON app.customer_addresses FOR UPDATE TO sc_app
  USING      ((SELECT app.current_role_name()) = 'CUSTOMER'
          AND identity_id = (SELECT app.current_user_id()))
  WITH CHECK ((SELECT app.current_role_name()) = 'CUSTOMER'
          AND identity_id = (SELECT app.current_user_id()));

CREATE POLICY customer_addresses_self_delete ON app.customer_addresses FOR DELETE TO sc_app
  USING ((SELECT app.current_role_name()) = 'CUSTOMER'
     AND identity_id = (SELECT app.current_user_id()));

CREATE POLICY customer_addresses_admin_all ON app.customer_addresses FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

COMMENT ON TABLE app.customer_addresses IS
  'Endereços salvos do comprador, presos à identidade e não à loja: cadastra uma vez, usa em qualquer loja (AC-509, T-707).';

RESET ROLE;
