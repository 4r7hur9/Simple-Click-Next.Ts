-- 0012 — o carrinho é de quem o montou
--
-- DUAS FALHAS NUMA SÓ. As políticas de `carts` e `cart_items` da migração 0008
-- se chamam `_staff_` e NÃO conferem se quem escreve é da equipe: elas pedem só
-- que exista loja no contexto. Isso significa que qualquer visitante anônimo da
-- vitrine — que tem contexto de loja por definição, é assim que ele vê os
-- produtos — pode hoje:
--
--   * LER o carrinho de todos os outros visitantes daquela loja, isto é, o que
--     cada pessoa está prestes a comprar;
--   * ALTERAR o carrinho de qualquer um deles;
--   * APAGAR o carrinho de qualquer um deles, esvaziando a loja inteira.
--
-- O nome da política escondeu o problema: quem lê `carts_staff_select` assume
-- que a conferência de equipe está ali. Não estava. Nas tabelas de pedido, na
-- mesma migração, ela está — o que sugere descuido de repetição, e não decisão.
--
-- ESTA MIGRAÇÃO FAZ DUAS COISAS. Primeiro, os nomes passam a ser verdade: as
-- políticas de equipe passam a cobrar `app.is_store_staff()`. Segundo, o
-- visitante ganha o caminho que precisa, e só ele: pode mexer no PRÓPRIO
-- carrinho, identificado pelo token de sessão que ele declara na transação —
-- mesmo desenho do token de acompanhamento do pedido (migração 0009).
--
-- O que o visitante NÃO ganha é o direito de apagar o carrinho. Carrinho
-- fechado é o rastro de quem chegou perto de comprar, e o dono precisa dele
-- para saber quanto está perdendo no fim do funil. Tirar um ITEM continua
-- possível — é isso que o cliente faz quando desiste de um produto.

SET ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- Os nomes passam a ser verdade
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS carts_staff_select ON app.carts;
CREATE POLICY carts_staff_select ON app.carts FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.is_store_staff()));

DROP POLICY IF EXISTS carts_staff_insert ON app.carts;
CREATE POLICY carts_staff_insert ON app.carts FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND (SELECT app.is_store_staff()));

DROP POLICY IF EXISTS carts_staff_update ON app.carts;
CREATE POLICY carts_staff_update ON app.carts FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id())
          AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND (SELECT app.is_store_staff()));

DROP POLICY IF EXISTS carts_staff_delete ON app.carts;
CREATE POLICY carts_staff_delete ON app.carts FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.is_store_staff()));

DROP POLICY IF EXISTS cart_items_staff_select ON app.cart_items;
CREATE POLICY cart_items_staff_select ON app.cart_items FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.is_store_staff()));

DROP POLICY IF EXISTS cart_items_staff_insert ON app.cart_items;
CREATE POLICY cart_items_staff_insert ON app.cart_items FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND (SELECT app.is_store_staff()));

DROP POLICY IF EXISTS cart_items_staff_update ON app.cart_items;
CREATE POLICY cart_items_staff_update ON app.cart_items FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id())
          AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND (SELECT app.is_store_staff()));

DROP POLICY IF EXISTS cart_items_staff_delete ON app.cart_items;
CREATE POLICY cart_items_staff_delete ON app.cart_items FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.is_store_staff()));

-- ---------------------------------------------------------------------------
-- O visitante mexe no próprio carrinho, e só nele
--
-- `converted_at IS NULL` aparece em toda condição: carrinho que virou pedido
-- sai do alcance do visitante. Sem isso, alguém poderia editar o carrinho
-- depois de o pedido ter sido criado a partir dele — e o rastro deixaria de
-- corresponder ao que foi comprado.
-- ---------------------------------------------------------------------------

CREATE POLICY carts_visitante_select ON app.carts FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND converted_at IS NULL
     AND session_token = nullif(current_setting('app.cart_session', true), ''));

CREATE POLICY carts_visitante_insert ON app.carts FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND converted_at IS NULL
          AND channel = 'ONLINE'
          AND session_token = nullif(current_setting('app.cart_session', true), ''));

-- Sem `FOR DELETE`: carrinho fechado é o rastro de quem chegou perto de
-- comprar, e o dono precisa dele para saber onde está perdendo venda.
CREATE POLICY carts_visitante_update ON app.carts FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id())
          AND converted_at IS NULL
          AND session_token = nullif(current_setting('app.cart_session', true), ''))
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND converted_at IS NULL
          AND session_token = nullif(current_setting('app.cart_session', true), ''));

CREATE POLICY cart_items_visitante_select ON app.cart_items FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND EXISTS (
       SELECT 1 FROM app.carts c
        WHERE c.id = app.cart_items.cart_id
          AND c.store_id = (SELECT app.current_store_id())
          AND c.converted_at IS NULL
          AND c.session_token = nullif(current_setting('app.cart_session', true), '')));

CREATE POLICY cart_items_visitante_insert ON app.cart_items FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND EXISTS (
            SELECT 1 FROM app.carts c
             WHERE c.id = app.cart_items.cart_id
               AND c.store_id = (SELECT app.current_store_id())
               AND c.converted_at IS NULL
               AND c.session_token = nullif(current_setting('app.cart_session', true), '')));

CREATE POLICY cart_items_visitante_update ON app.cart_items FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id())
          AND EXISTS (
            SELECT 1 FROM app.carts c
             WHERE c.id = app.cart_items.cart_id
               AND c.converted_at IS NULL
               AND c.session_token = nullif(current_setting('app.cart_session', true), '')))
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND EXISTS (
            SELECT 1 FROM app.carts c
             WHERE c.id = app.cart_items.cart_id
               AND c.converted_at IS NULL
               AND c.session_token = nullif(current_setting('app.cart_session', true), '')));

-- Tirar item do carrinho é o que o cliente faz quando desiste de um produto.
CREATE POLICY cart_items_visitante_delete ON app.cart_items FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND EXISTS (
       SELECT 1 FROM app.carts c
        WHERE c.id = app.cart_items.cart_id
          AND c.store_id = (SELECT app.current_store_id())
          AND c.converted_at IS NULL
          AND c.session_token = nullif(current_setting('app.cart_session', true), '')));

RESET ROLE;
