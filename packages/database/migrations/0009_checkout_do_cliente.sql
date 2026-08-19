-- 0009 — o cliente consegue fechar o pedido
--
-- POR QUE ESTA MIGRAÇÃO EXISTE. A 0008 escreveu o lado da LOJA e esqueceu o do
-- CLIENTE. Toda política de inserção nas tabelas de pedido exige
-- `app.is_store_staff()`, isto é, papel OWNER ou STAFF. O resultado é que o
-- dono consegue lançar um pedido de balcão e o cliente não consegue fechar
-- nenhum — que é o produto inteiro. O engano é fácil de entender: as políticas
-- de LEITURA por token de acompanhamento foram escritas com cuidado, então o
-- caminho do cliente parecia coberto. Só que ler não é escrever.
--
-- O QUE AUTORIZA O CLIENTE A ESCREVER é o token de acompanhamento que ele
-- acabou de declarar na transação (`app.order_token`). Não é "qualquer um pode
-- inserir na loja X": é "quem declarou o token T pode criar o pedido cujo
-- endereço público é T, e mais nada". O token tem 128 bits e nasce no servidor,
-- então declará-lo é, na prática, provar que aquele pedido é o seu.
--
-- Três restrições fecham o resto do buraco:
--   1. status inicial obrigatório — o cliente não cria pedido já aceito, o que
--      o faria pular a fila e a confirmação do dono;
--   2. canal ONLINE obrigatório — pedido de balcão é lançamento do dono, e
--      deixar o cliente marcá-lo assim sujaria as métricas do painel;
--   3. contexto de loja obrigatório — herdado das políticas restritivas da
--      0008, que continuam valendo por cima destas.
--
-- Carrinho NÃO entra aqui. A mesma lacuna existe em `carts` e `cart_items`, e
-- está anotada em `docs/pendencias.md` para a tarefa T-500: escrever política
-- sem teste que a exercite é escrever no escuro, e o carrinho ainda não tem
-- caso de uso.

SET ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- O pedido
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS orders_checkout_insert ON app.orders;
CREATE POLICY orders_checkout_insert ON app.orders FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND public_token = nullif(current_setting('app.order_token', true), '')
          AND status = 'PENDING'
          AND channel = 'ONLINE');

-- ---------------------------------------------------------------------------
-- O que pendura no pedido
--
-- Cada uma confere que o pedido pai é o do token declarado. Sem esse `EXISTS`,
-- quem declarasse um token qualquer poderia pendurar item no pedido de outra
-- pessoa da mesma loja — e o dono veria uma comanda adulterada.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS order_contacts_checkout_insert ON app.order_contacts;
CREATE POLICY order_contacts_checkout_insert ON app.order_contacts FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND EXISTS (
            SELECT 1 FROM app.orders o
             WHERE o.id = app.order_contacts.order_id
               AND o.store_id = (SELECT app.current_store_id())
               AND o.public_token = nullif(current_setting('app.order_token', true), '')));

DROP POLICY IF EXISTS order_items_checkout_insert ON app.order_items;
CREATE POLICY order_items_checkout_insert ON app.order_items FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND EXISTS (
            SELECT 1 FROM app.orders o
             WHERE o.id = app.order_items.order_id
               AND o.store_id = (SELECT app.current_store_id())
               AND o.public_token = nullif(current_setting('app.order_token', true), '')));

DROP POLICY IF EXISTS order_item_options_checkout_insert ON app.order_item_options;
CREATE POLICY order_item_options_checkout_insert ON app.order_item_options FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND EXISTS (
            SELECT 1 FROM app.order_items i
             JOIN app.orders o ON o.id = i.order_id
             WHERE i.id = app.order_item_options.order_item_id
               AND i.store_id = (SELECT app.current_store_id())
               AND o.public_token = nullif(current_setting('app.order_token', true), '')));

-- O primeiro passo do histórico nasce junto com o pedido, e só ele: o cliente
-- não move o próprio pedido para "aceito" nem para "entregue".
DROP POLICY IF EXISTS order_status_history_checkout_insert ON app.order_status_history;
CREATE POLICY order_status_history_checkout_insert ON app.order_status_history FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND from_status IS NULL
          AND to_status = 'PENDING'
          AND EXISTS (
            SELECT 1 FROM app.orders o
             WHERE o.id = app.order_status_history.order_id
               AND o.store_id = (SELECT app.current_store_id())
               AND o.public_token = nullif(current_setting('app.order_token', true), '')));

-- ---------------------------------------------------------------------------
-- Leitura de volta pelo token
--
-- `INSERT ... RETURNING` é uma leitura, e o isolamento por linha se aplica a
-- ela. Sem estas duas, a inserção passaria e a devolução do identificador
-- falharia — um erro difícil de ler, porque a mensagem falaria de SELECT numa
-- linha de código que só escreve. A 0008 já criou as equivalentes para
-- `orders`, `order_items` e `order_status_history`; faltaram estas duas.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS order_contacts_track_select ON app.order_contacts;
CREATE POLICY order_contacts_track_select ON app.order_contacts FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND EXISTS (
       SELECT 1 FROM app.orders o
        WHERE o.id = app.order_contacts.order_id
          AND o.store_id = (SELECT app.current_store_id())
          AND o.public_token = nullif(current_setting('app.order_token', true), '')));

DROP POLICY IF EXISTS order_item_options_track_select ON app.order_item_options;
CREATE POLICY order_item_options_track_select ON app.order_item_options FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND EXISTS (
       SELECT 1 FROM app.order_items i
        JOIN app.orders o ON o.id = i.order_id
        WHERE i.id = app.order_item_options.order_item_id
          AND i.store_id = (SELECT app.current_store_id())
          AND o.public_token = nullif(current_setting('app.order_token', true), '')));

RESET ROLE;
