-- ===========================================================================
-- 0049 — A loja nasce aguardando aprovação (card #25).
--
-- A situação da loja passa a falar a língua do fluxo de aprovação:
--
--   PENDING_APPROVAL  loja nova: não aparece na vitrine nem no feed; o painel
--                     mostra "aguardando aprovação".
--   ACTIVE            aprovada e no ar.
--   REJECTED          recusada pela administração, com motivo (na trilha).
--   INACTIVE          desativada pela administração: some da vitrine e do
--                     feed e não recebe pedido novo. Quem já pediu continua
--                     acompanhando (Q-203).
--   DELETED           excluída, restaurável por prazo (inalterado).
--
-- O QUE MUDA NOS DADOS: `PENDING` vira `PENDING_APPROVAL` e `SUSPENDED` vira
-- `INACTIVE`. Nada mais é tocado. A trilha (`audit_log`) é imutável e continua
-- com os nomes antigos nos atos já registrados; quem a lê traduz.
--
-- `approved_at` guarda quando a loja entrou no ar pela primeira vez — é o que o
-- feed usa para mostrar "lojas novas". As lojas já ativas recebem a data de
-- criação.
--
-- Idempotente: as atualizações não fazem nada na segunda vez, a restrição é
-- recriada e a função é substituída.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

ALTER TABLE app.stores DROP CONSTRAINT IF EXISTS stores_status_ck;

UPDATE app.stores SET status = 'PENDING_APPROVAL' WHERE status = 'PENDING';
UPDATE app.stores SET status = 'INACTIVE' WHERE status = 'SUSPENDED';

ALTER TABLE app.stores ALTER COLUMN status SET DEFAULT 'PENDING_APPROVAL';

ALTER TABLE app.stores
  ADD CONSTRAINT stores_status_ck CHECK (
    status IN ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'INACTIVE', 'DELETED'));

ALTER TABLE app.stores ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE app.stores
   SET approved_at = created_at
 WHERE approved_at IS NULL
   AND status IN ('ACTIVE', 'INACTIVE');

-- O acompanhamento do pedido enxerga a loja desativada (antes: suspensa).
CREATE OR REPLACE FUNCTION app.tracked_order_store()
RETURNS TABLE (name text, whatsapp jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT l.name, s.whatsapp
     FROM app.orders o
     JOIN app.stores l ON l.id = o.store_id
     LEFT JOIN app.store_settings s ON s.store_id = l.id
    WHERE o.store_id = app.current_store_id()
      AND app.current_order_token() IS NOT NULL
      AND o.public_token = app.current_order_token()
      AND l.status IN ('ACTIVE', 'INACTIVE')
      AND l.deleted_at IS NULL
    LIMIT 1 $$;

REVOKE ALL ON FUNCTION app.tracked_order_store() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tracked_order_store() TO sc_app, sc_admin;

RESET ROLE;
