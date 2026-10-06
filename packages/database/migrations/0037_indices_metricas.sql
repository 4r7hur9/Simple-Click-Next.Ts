-- ===========================================================================
-- 0037 · Índices das métricas do painel (faixa B-dashboard-metricas, T-802)
--
-- O painel corta os pedidos da loja por PERÍODO (`placed_at`), e nenhum índice
-- existente serve a esse corte: `orders_painel_idx` tem `status` antes de
-- `placed_at`, o que obriga o planejador a varrer todos os status para
-- encontrar uma semana — com dezenas de milhares de pedidos, é a diferença
-- entre um painel que abre e um que faz o dono esperar (AC-813).
--
-- DOIS ÍNDICES, e não um:
--
-- 1. `orders_por_periodo_idx` — (store_id, placed_at). Cobre o resumo, a
--    série por dia, a série por hora e a exportação, todos filtrados por loja
--    e intervalo de `placed_at`. As colunas incluídas são as que essas
--    consultas leem E as que as políticas de isolamento citam no `USING`
--    (`public_token`, `store_customer_id`, `idempotency_key`): sem elas a
--    reconferência do isolamento vai ao disco e a leitura direta pelo índice
--    se perde — achado medido na 0008 e cobrado pela guarda G5.
--
-- 2. `orders_por_atualizacao_idx` — (store_id, updated_at). É o índice da
--    MARCA-D'ÁGUA do cache (T-807): `max(updated_at)` da loja precisa custar
--    uma leitura, porque acontece em TODA abertura do painel, inclusive quando
--    o resultado vem do cache. Sem colunas incluídas de propósito: é uma linha
--    só, e a guarda G5 só cobra índice que declara intenção de cobrir.
--
-- O ranking dos mais vendidos junta `order_items` ao pedido por
-- `(store_id, order_id)`, que `order_items_do_pedido_idx` (0008) já cobre,
-- inclusive com `product_name`, `quantity` e `line_total_cents` incluídos.
--
-- Compatível com a versão anterior: só acrescenta índice, e `IF NOT EXISTS`
-- deixa a reaplicação inofensiva (AC-030, AC-033).
-- ===========================================================================

SET ROLE sc_migrator;

CREATE INDEX IF NOT EXISTS orders_por_periodo_idx
  ON app.orders (store_id, placed_at)
  INCLUDE (status, channel, total_cents,
           whatsapp_clicked_at, whatsapp_confirmed_at,
           public_token, store_customer_id, idempotency_key);

CREATE INDEX IF NOT EXISTS orders_por_atualizacao_idx
  ON app.orders (store_id, updated_at DESC);

COMMENT ON INDEX app.orders_por_periodo_idx IS
  'Corte por período das métricas do painel (T-802). Inclui as colunas das políticas para leitura direta pelo índice (G5).';
COMMENT ON INDEX app.orders_por_atualizacao_idx IS
  'Marca-d''água do cache das métricas: max(updated_at) da loja (T-807).';

RESET ROLE;
