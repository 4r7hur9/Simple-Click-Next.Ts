-- 0011 — os índices cobridores incluem a coluna que a busca do fechamento cita
--
-- A guarda G5 acusou, e está certa. Sob isolamento por linha, o conjunto de
-- colunas de um índice cobridor é a UNIÃO das colunas da consulta com as
-- colunas que as POLÍTICAS daquela tabela citam: a reconferência do isolamento
-- roda em toda leitura, e o que ela não achar no índice ela busca no disco.
--
-- A política `orders_checkout_lookup` (migração 0010) cita `idempotency_key`.
-- Como ela é permissiva e vale para toda leitura de `app.orders`, os dois
-- índices que declaram intenção de cobrir passaram a precisar dessa coluna —
-- inclusive o do painel do dono, que nunca vai filtrar por ela. Não é
-- desperdício: sem ela, a consulta do painel deixa de ser leitura direta pelo
-- índice e volta a buscar no disco, que foi a diferença de 18 vezes em tempo
-- medida quando esta guarda nasceu.
--
-- Os índices são recriados porque `INCLUDE` não se acrescenta a um índice
-- existente. `CONCURRENTLY` fica de fora de propósito: ele não roda dentro de
-- transação, e o aplicador de migrações mantém cada arquivo numa transação só —
-- trocar isso para ganhar tempo numa tabela que ainda não tem volume seria
-- pagar com a garantia de que uma migração pela metade não sobrevive.

SET ROLE sc_migrator;

DROP INDEX IF EXISTS app.orders_painel_idx;
CREATE INDEX orders_painel_idx
  ON app.orders (store_id, status, placed_at DESC)
  INCLUDE (number, code, total_cents, cost_total_cents, channel,
           public_token, store_customer_id, idempotency_key);

DROP INDEX IF EXISTS app.orders_do_cliente_idx;
CREATE INDEX orders_do_cliente_idx
  ON app.orders (store_id, store_customer_id, placed_at DESC)
  INCLUDE (number, status, total_cents, public_token, idempotency_key);

RESET ROLE;
