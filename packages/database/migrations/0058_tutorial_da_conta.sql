-- ===========================================================================
-- 0058 — Tutorial de primeiro acesso (card #39): quais tutoriais a conta já
-- viu ou pulou. Um por papel ('cliente', 'dono', 'equipe'): quem é cliente e
-- depois abre uma loja vê o do painel na primeira vez que entrar nele.
-- Só acrescenta uma coluna com padrão: nada que já existe muda. A própria
-- pessoa já edita a sua linha (política identities_self_update).
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

ALTER TABLE app.identities
  ADD COLUMN IF NOT EXISTS tutorials_seen text[] NOT NULL DEFAULT '{}';

ALTER TABLE app.identities DROP CONSTRAINT IF EXISTS identities_tutorials_seen_ck;
ALTER TABLE app.identities
  ADD CONSTRAINT identities_tutorials_seen_ck
  CHECK (tutorials_seen <@ ARRAY['cliente', 'dono', 'equipe']::text[]);

RESET ROLE;
