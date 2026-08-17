-- ===========================================================================
-- 0006 — Trilha de auditoria.
--
-- `audit_log` entra na fundação porque decisão já tomada depende dela: alterar
-- o tipo de negócio de uma loja e trocar dado sensível como a chave PIX têm de
-- deixar registro. Uma trilha que nasce depois do sistema nasce incompleta.
--
-- Fica para a fase de impressão (F6), no mesmo desenho: `print_agents`,
-- `print_jobs` e `notification_outbox` — a fila vive no PostgreSQL, com
-- reivindicação por travamento e tentativa com espera crescente, para que a
-- cozinha continue recebendo pedido quando o cache cair.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

CREATE TABLE IF NOT EXISTS app.audit_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id     uuid NOT NULL REFERENCES app.stores (id),
  actor_id     uuid REFERENCES app.identities (id),
  -- Papel no momento do ato: quem era administrador ontem pode não ser hoje, e
  -- a trilha precisa dizer com que poder o ato foi praticado.
  actor_role   text NOT NULL,
  action       text NOT NULL,
  entity       text NOT NULL,
  entity_id    text,
  -- Antes e depois já sem dado pessoal: a trilha registra identificador, nunca
  -- o dado em si (P-009).
  before_data  jsonb,
  after_data   jsonb,
  ip_hmac      bytea,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_store_ix
  ON app.audit_log (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_store_acao_ix
  ON app.audit_log (store_id, action, created_at DESC);

ALTER TABLE app.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_log FORCE  ROW LEVEL SECURITY;

-- Quem escreve na trilha é qualquer caminho da loja corrente; quem lê é a
-- loja dona daquele registro.
CREATE POLICY audit_insert ON app.audit_log FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()));

-- A leitura existe também por um motivo prático: quem insere costuma pedir a
-- linha de volta, e tabela sem política de leitura faria a própria inserção
-- falhar por falta de permissão.
CREATE POLICY audit_staff_select ON app.audit_log FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY audit_require_ctx ON app.audit_log AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY audit_admin_insert ON app.audit_log FOR INSERT TO sc_admin
  WITH CHECK (true);
CREATE POLICY audit_admin_select ON app.audit_log FOR SELECT TO sc_admin
  USING (true);

-- Três camadas, porque "só acrescenta" por si só não prova que ninguém mexeu:
--   1. ausência de política de alteração e de remoção — negação por omissão;
--   2. retirada do privilégio — barra antes de a política ser consultada;
--   3. gatilho que levanta exceção — vale inclusive para script administrativo
--      rodando com a credencial de migração, que contorna o isolamento.
REVOKE UPDATE, DELETE ON app.audit_log FROM sc_app, sc_admin;

DROP TRIGGER IF EXISTS audit_log_append_only ON app.audit_log;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON app.audit_log
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();
