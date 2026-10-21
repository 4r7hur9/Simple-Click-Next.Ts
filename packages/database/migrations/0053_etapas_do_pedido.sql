-- ===========================================================================
-- 0053 — As seis etapas do pedido (card #25).
--
-- O quadro (kanban) do painel tem seis colunas, e cada uma é um status que já
-- existia — nenhum código de status muda de nome:
--
--   PENDING           Pedido gerado
--   ACCEPTED          Confirmado
--   PREPARING         Em preparo
--   READY_FOR_PICKUP  Retirada (pronto para retirar) — só pedido de RETIRADA
--   OUT_FOR_DELIVERY  Saiu para entrega              — só pedido de ENTREGA
--   COMPLETED         Concluída
--   CANCELLED         Cancelado (fora do quadro)
--
-- O que esta migração acerta nos dados, sem perder nada:
--
--   1. `REJECTED` (recusado na chegada, vindo da carga de exemplo antiga) não
--      é etapa da máquina de status: vira `CANCELLED`, guardando quando e por
--      quê (`cancelled_at`, `cancel_reason`). O histórico ganha a passagem
--      REJECTED → CANCELLED, feita pelo sistema; as linhas antigas ficam.
--   2. Pedido de retirada parado em "saiu para entrega" vai para "retirada";
--      pedido de entrega parado em "retirada" vai para "saiu para entrega".
--      Também com a passagem registrada no histórico.
--   3. O banco passa a recusar as duas combinações impossíveis e o status
--      `REJECTED` — a máquina de status de `packages/core` já não as produz.
--
-- Idempotente: na segunda vez não há linha a acertar, e as restrições são
-- recriadas.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- 1. Recusado vira cancelado
WITH acertados AS (
  UPDATE app.orders o
     SET status = 'CANCELLED',
         cancelled_at = coalesce(o.cancelled_at, o.updated_at),
         cancel_reason = coalesce(nullif(btrim(o.cancel_reason), ''), 'Recusado pela loja.')
   WHERE o.status = 'REJECTED'
  RETURNING o.id, o.store_id
)
INSERT INTO app.order_status_history
  (store_id, order_id, from_status, to_status, actor_role, reason)
SELECT a.store_id, a.id, 'REJECTED', 'CANCELLED', 'SYSTEM',
       'Etapas do pedido: recusado passa a ser cancelado.'
  FROM acertados a;

-- 2. Retirada não sai para entrega; entrega não fica em retirada
WITH acertados AS (
  UPDATE app.orders o
     SET status = 'READY_FOR_PICKUP'
   WHERE o.fulfillment = 'PICKUP' AND o.status = 'OUT_FOR_DELIVERY'
  RETURNING o.id, o.store_id
)
INSERT INTO app.order_status_history
  (store_id, order_id, from_status, to_status, actor_role, reason)
SELECT a.store_id, a.id, 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'SYSTEM',
       'Etapas do pedido: retirada não passa por saiu para entrega.'
  FROM acertados a;

WITH acertados AS (
  UPDATE app.orders o
     SET status = 'OUT_FOR_DELIVERY'
   WHERE o.fulfillment = 'DELIVERY' AND o.status = 'READY_FOR_PICKUP'
  RETURNING o.id, o.store_id
)
INSERT INTO app.order_status_history
  (store_id, order_id, from_status, to_status, actor_role, reason)
SELECT a.store_id, a.id, 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'SYSTEM',
       'Etapas do pedido: entrega não passa por retirada.'
  FROM acertados a;

-- 3. O banco repete a regra
ALTER TABLE app.orders DROP CONSTRAINT IF EXISTS orders_status_conhecido;
ALTER TABLE app.orders
  ADD CONSTRAINT orders_status_conhecido CHECK (status IN (
    'PENDING', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP',
    'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'));

ALTER TABLE app.orders DROP CONSTRAINT IF EXISTS orders_etapa_da_entrega;
ALTER TABLE app.orders
  ADD CONSTRAINT orders_etapa_da_entrega CHECK (
    NOT (fulfillment = 'PICKUP' AND status = 'OUT_FOR_DELIVERY')
    AND NOT (fulfillment = 'DELIVERY' AND status = 'READY_FOR_PICKUP'));

RESET ROLE;
