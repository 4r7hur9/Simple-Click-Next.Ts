-- ===========================================================================
-- 0054 — Dados da conta do cliente: CPF opcional e preferência de ofertas
-- (card #35). Só acrescenta colunas anuláveis/com padrão: nada que já existe
-- muda. A própria pessoa já edita a sua linha (política identities_self_update).
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

ALTER TABLE app.identities ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE app.identities ADD COLUMN IF NOT EXISTS accepts_offers boolean NOT NULL DEFAULT false;

ALTER TABLE app.identities DROP CONSTRAINT IF EXISTS identities_cpf_ck;
ALTER TABLE app.identities
  ADD CONSTRAINT identities_cpf_ck CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

RESET ROLE;
