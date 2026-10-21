-- ===========================================================================
-- 0072 — Origem do cliente (card #77).
--
-- O filtro "importados" da lista de clientes precisa saber quem veio de
-- planilha. `origin` fica nulo para quem se cadastrou pelo site ou foi
-- cadastrado pelo dono, e recebe 'IMPORT' do importador. Só se lê para
-- filtrar; nada depende dela para funcionar.
--
-- Idempotente. Aplicada à mão em dev (o livro de dev está fora de ordem).
-- ===========================================================================

SET ROLE sc_migrator;

ALTER TABLE app.store_customers ADD COLUMN IF NOT EXISTS origin text;

CREATE INDEX IF NOT EXISTS store_customers_origem_ix
  ON app.store_customers (store_id, created_at DESC)
  WHERE origin IS NOT NULL;

RESET ROLE;
