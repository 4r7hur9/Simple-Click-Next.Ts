-- ===========================================================================
-- 0044 — Persistência da identidade de produção (T-111, AC-129 a AC-131).
--
-- Os casos de uso de cadastro, verificação, login, segundo fator, sessão,
-- recuperação de senha, aplicativo autenticador e convite existiam com
-- duplos em memória. Esta migração cria o que faltava para eles gravarem no
-- banco — as quatro tabelas que 0002 deixou anunciadas — e as duas funções
-- auxiliares de papel e de aplicativo ativo. As funções que os passos
-- ANTERIORES à sessão usam vêm logo depois, em 0045 (cadastro, login,
-- verificação, recuperação) e 0046 (segundo fator, sessão, convite).
--
-- O DESENHO DE ACESSO, em duas metades, e o motivo de cada uma:
--
-- 1. Antes de existir sessão (cadastro, login, conferir o link de
--    verificação, pedir e consumir recuperação, desafio do segundo fator,
--    renovar o token, aceitar convite) ninguém é ninguém: não há identidade no
--    contexto para uma política conferir. Liberar leitura por e-mail ou por
--    resumo de token numa política seria liberar para todo visitante. O modelo
--    de dados já decidiu: "cadastro e login: função SECURITY DEFINER dedicada".
--    Cada função faz UM passo, devolve a lista fechada de campos de que o passo
--    precisa e roda com caminho de busca fixo (G10).
-- 2. Depois da sessão (ativar o aplicativo, gerar códigos de recuperação,
--    sair, encerrar todas) a pessoa é alguém, e a política "só a própria
--    identidade" basta. Função dedicada ali seria abrir mão de uma camada.
--
-- O QUE NUNCA ENTRA NO BANCO: token de renovação, link de verificação, link de
-- recuperação e código de recuperação vão como resumo SHA-256; código de seis
-- dígitos do e-mail vai derivado com Argon2id; o segredo do aplicativo vai
-- cifrado com AES-256-GCM e chave do ambiente (P-002). As verificações de
-- formato abaixo fazem o banco recusar o valor cru que um defeito da aplicação
-- tentasse gravar.
--
-- O BANCO CONFERE O QUE A APLICAÇÃO TAMBÉM CONFERE, para que um defeito numa
-- delas não vire falha de segurança:
--   - o papel gravado na sessão é o papel real da identidade (administração
--     ativa, vínculo de dono aceito, ou cliente);
--   - código por e-mail não vale para quem tem aplicativo ativo (AC-121) nem
--     para a administração (AC-122);
--   - revogação, consumo de token e desativação de segredo não voltam atrás;
--   - o passo do aplicativo só anda para a frente (AC-124).
--
-- Diferenças em relação ao rascunho de `.spec/design/modelo-de-dados.md`:
-- resumo de token em texto hexadecimal (e não `bytea`), para a verificação de
-- formato poder recusar o token cru; sem endereço, aparelho nem navegador na
-- sessão (P-009: só entram com a tela de dispositivos conectados, se ela
-- vier); o desafio do segundo fator mora em `verification_codes` com canal
-- EMAIL ou TOTP.
--
-- Compatível com a versão anterior: só cria tabela e função. Nada que já
-- existe muda de forma.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- Gatilhos: o que já aconteceu não desacontece
-- ---------------------------------------------------------------------------
-- Valem inclusive para o migrador, que contorna o isolamento: é a única camada
-- que o alcança. Um "desrevogar" por engano de manutenção reabriria a sessão
-- de um token roubado.
CREATE OR REPLACE FUNCTION app.sessao_sem_volta() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'sessao revogada nao volta a valer' USING ERRCODE = '23514';
  END IF;
  IF OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at THEN
    RAISE EXCEPTION 'token de renovacao consumido nao volta a valer' USING ERRCODE = '23514';
  END IF;
  IF NEW.token_sha256 IS DISTINCT FROM OLD.token_sha256
     OR NEW.identity_id IS DISTINCT FROM OLD.identity_id
     OR NEW.family_id IS DISTINCT FROM OLD.family_id
     OR NEW.role_at_issue IS DISTINCT FROM OLD.role_at_issue THEN
    RAISE EXCEPTION 'sessao nao troca de dono, de familia, de papel nem de token' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.segredo_totp_sem_volta() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.disabled_at IS NOT NULL AND NEW.disabled_at IS DISTINCT FROM OLD.disabled_at THEN
    RAISE EXCEPTION 'segredo desativado nao volta a valer' USING ERRCODE = '23514';
  END IF;
  IF OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN
    RAISE EXCEPTION 'confirmacao do aplicativo nao muda' USING ERRCODE = '23514';
  END IF;
  IF OLD.last_used_step IS NOT NULL
     AND (NEW.last_used_step IS NULL OR NEW.last_used_step < OLD.last_used_step) THEN
    RAISE EXCEPTION 'passo do aplicativo so anda para a frente' USING ERRCODE = '23514';
  END IF;
  IF NEW.secret_enc IS DISTINCT FROM OLD.secret_enc
     OR NEW.identity_id IS DISTINCT FROM OLD.identity_id THEN
    RAISE EXCEPTION 'segredo do aplicativo nao troca de valor nem de dono' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- sessions — famílias de token de renovação (AC-109, AC-110, AC-112, AC-113)
-- ---------------------------------------------------------------------------
-- Uma linha por token de renovação emitido. A família é um login num
-- aparelho: cada renovação consome a linha atual (`used_at`) e cria a filha
-- (`parent_id`). Token consumido apresentado de novo é cópia — a família
-- inteira cai (RFC 9700). O token de acesso não é guardado: vale 15 minutos e
-- é conferido pela assinatura.
CREATE TABLE IF NOT EXISTS app.sessions (
  id             uuid PRIMARY KEY,
  identity_id    uuid        NOT NULL REFERENCES app.identities (id),
  family_id      uuid        NOT NULL,
  parent_id      uuid        REFERENCES app.sessions (id),
  token_sha256   text        NOT NULL,
  role_at_issue  text        NOT NULL,
  client_kind    text        NOT NULL,
  issued_at      timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz,
  revoked_at     timestamptz,
  revoked_reason text,
  CONSTRAINT sessions_token_ck  CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT sessions_role_ck   CHECK (role_at_issue IN ('CUSTOMER', 'OWNER', 'ADMIN')),
  CONSTRAINT sessions_client_ck CHECK (client_kind IN ('WEB', 'NATIVE')),
  CONSTRAINT sessions_prazo_ck  CHECK (expires_at > issued_at),
  CONSTRAINT sessions_motivo_ck CHECK (
    (revoked_at IS NULL AND revoked_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_reason IN
        ('LOGOUT', 'LOGOUT_ALL', 'REUSE_DETECTED', 'PASSWORD_CHANGED', 'ROLE_CHANGED', 'ADMIN_REVOKED')))
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_uk ON app.sessions (token_sha256);
CREATE INDEX IF NOT EXISTS sessions_family_ix ON app.sessions (family_id);
CREATE INDEX IF NOT EXISTS sessions_identity_ix
  ON app.sessions (identity_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_expires_ix ON app.sessions (expires_at);

DROP TRIGGER IF EXISTS sessions_sem_volta ON app.sessions;
CREATE TRIGGER sessions_sem_volta BEFORE UPDATE ON app.sessions
  FOR EACH ROW EXECUTE FUNCTION app.sessao_sem_volta();

ALTER TABLE app.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sessions FORCE  ROW LEVEL SECURITY;

-- A pessoa logada enxerga e encerra as próprias sessões, e só elas. Criar e
-- renovar acontecem antes de haver identidade no contexto: função dedicada.
CREATE POLICY sessions_self_select ON app.sessions FOR SELECT TO sc_app
  USING (identity_id = (SELECT app.current_user_id()));
CREATE POLICY sessions_self_update ON app.sessions FOR UPDATE TO sc_app
  USING      (identity_id = (SELECT app.current_user_id()))
  WITH CHECK (identity_id = (SELECT app.current_user_id()));
CREATE POLICY sessions_admin_all ON app.sessions FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- Por coluna: encerrar é a única alteração que a credencial das lojas faz.
REVOKE INSERT, UPDATE, DELETE ON app.sessions FROM sc_app;
GRANT UPDATE (revoked_at, revoked_reason) ON app.sessions TO sc_app;

-- ---------------------------------------------------------------------------
-- verification_codes — códigos e links de uso único
-- ---------------------------------------------------------------------------
-- Link de verificação de e-mail (AC-103, AC-104), link de recuperação de senha
-- (AC-114, AC-115) e desafio do segundo fator (AC-105 a AC-107). O desafio
-- pelo aplicativo autenticador não tem código próprio — o código é o do
-- aplicativo —, por isso `code_hash` é nulo só nele.
CREATE TABLE IF NOT EXISTS app.verification_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id   uuid        NOT NULL REFERENCES app.identities (id),
  purpose       text        NOT NULL,
  channel       text        NOT NULL DEFAULT 'EMAIL',
  code_hash     text,
  expires_at    timestamptz NOT NULL,
  attempt_count integer     NOT NULL DEFAULT 0,
  consumed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_codes_purpose_ck
    CHECK (purpose IN ('EMAIL_VERIFY', 'PASSWORD_RESET', 'LOGIN_OTP')),
  CONSTRAINT verification_codes_channel_ck CHECK (channel IN ('EMAIL', 'TOTP')),
  CONSTRAINT verification_codes_hash_ck CHECK (
    (channel = 'TOTP' AND purpose = 'LOGIN_OTP' AND code_hash IS NULL)
    OR (channel = 'EMAIL' AND code_hash IS NOT NULL AND length(code_hash) >= 40)),
  -- O código de seis dígitos só entra derivado: seis dígitos cabem em força
  -- bruta de qualquer resumo rápido.
  CONSTRAINT verification_codes_otp_ck CHECK (
    purpose <> 'LOGIN_OTP' OR channel = 'TOTP' OR code_hash LIKE 'argon2id$%'),
  CONSTRAINT verification_codes_tentativas_ck CHECK (attempt_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS verification_codes_hash_uk
  ON app.verification_codes (code_hash) WHERE code_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS verification_codes_identity_ix
  ON app.verification_codes (identity_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS verification_codes_expires_ix
  ON app.verification_codes (expires_at);

ALTER TABLE app.verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.verification_codes FORCE  ROW LEVEL SECURITY;

-- Nenhuma política para a credencial das lojas, nem de leitura da própria
-- linha: código de uso único só é tocado pelas funções do passo que o usa.
CREATE POLICY verification_codes_admin_all ON app.verification_codes FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);
REVOKE ALL ON app.verification_codes FROM sc_app;

-- ---------------------------------------------------------------------------
-- totp_credentials — segredo do aplicativo autenticador (AC-121 a AC-124)
-- ---------------------------------------------------------------------------
-- Cifrado, e não resumido, porque precisa ser lido para conferir o código.
-- `v1.` é o prefixo do formato da cifra (`apps/api/src/core/cifra.ts`); o
-- alfabeto do segredo em claro (base32, maiúsculas) não tem como começar
-- assim, então o segredo cru é recusado pelo próprio banco.
CREATE TABLE IF NOT EXISTS app.totp_credentials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id    uuid        NOT NULL REFERENCES app.identities (id),
  secret_enc     text        NOT NULL,
  digits         smallint    NOT NULL DEFAULT 6,
  period_seconds smallint    NOT NULL DEFAULT 30,
  algorithm      text        NOT NULL DEFAULT 'SHA1',
  last_used_step bigint,
  confirmed_at   timestamptz,
  disabled_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT totp_credentials_cifra_ck CHECK (secret_enc LIKE 'v1.%'),
  -- O conferidor da API só fala este dialeto (RFC 6238 no padrão dos
  -- aplicativos): outro valor aqui seria um segredo que nunca confere.
  CONSTRAINT totp_credentials_dialeto_ck
    CHECK (digits = 6 AND period_seconds = 30 AND algorithm = 'SHA1')
);

-- Um aplicativo ativo e, no máximo, um aguardando confirmação: trocar de
-- aparelho (AC-123) prepara o novo sem derrubar o antigo antes da hora.
CREATE UNIQUE INDEX IF NOT EXISTS totp_credentials_ativo_uk
  ON app.totp_credentials (identity_id)
  WHERE disabled_at IS NULL AND confirmed_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS totp_credentials_pendente_uk
  ON app.totp_credentials (identity_id)
  WHERE disabled_at IS NULL AND confirmed_at IS NULL;

DROP TRIGGER IF EXISTS totp_credentials_sem_volta ON app.totp_credentials;
CREATE TRIGGER totp_credentials_sem_volta BEFORE UPDATE ON app.totp_credentials
  FOR EACH ROW EXECUTE FUNCTION app.segredo_totp_sem_volta();

ALTER TABLE app.totp_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.totp_credentials FORCE  ROW LEVEL SECURITY;

CREATE POLICY totp_self_select ON app.totp_credentials FOR SELECT TO sc_app
  USING (identity_id = (SELECT app.current_user_id()));
CREATE POLICY totp_self_insert ON app.totp_credentials FOR INSERT TO sc_app
  WITH CHECK (identity_id = (SELECT app.current_user_id()));
CREATE POLICY totp_self_update ON app.totp_credentials FOR UPDATE TO sc_app
  USING      (identity_id = (SELECT app.current_user_id()))
  WITH CHECK (identity_id = (SELECT app.current_user_id()));
CREATE POLICY totp_admin_all ON app.totp_credentials FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

REVOKE UPDATE, DELETE ON app.totp_credentials FROM sc_app;
GRANT UPDATE (last_used_step, confirmed_at, disabled_at) ON app.totp_credentials TO sc_app;

-- ---------------------------------------------------------------------------
-- recovery_codes — códigos de recuperação do segundo fator (AC-123)
-- ---------------------------------------------------------------------------
-- 40 bits por código, mostrados uma vez; o resumo SHA-256 basta porque o
-- código só vale contra uma identidade e uma vez.
CREATE TABLE IF NOT EXISTS app.recovery_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid        NOT NULL REFERENCES app.identities (id),
  code_sha256 text        NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recovery_codes_resumo_ck CHECK (code_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS recovery_codes_identity_code_uk
  ON app.recovery_codes (identity_id, code_sha256);

ALTER TABLE app.recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.recovery_codes FORCE  ROW LEVEL SECURITY;

-- Gerar um jogo novo (que substitui os não usados) é de quem está logado;
-- consumir acontece no login, antes da sessão, por função dedicada.
CREATE POLICY recovery_self_select ON app.recovery_codes FOR SELECT TO sc_app
  USING (identity_id = (SELECT app.current_user_id()));
CREATE POLICY recovery_self_insert ON app.recovery_codes FOR INSERT TO sc_app
  WITH CHECK (identity_id = (SELECT app.current_user_id()));
CREATE POLICY recovery_self_delete ON app.recovery_codes FOR DELETE TO sc_app
  USING (identity_id = (SELECT app.current_user_id()) AND used_at IS NULL);
CREATE POLICY recovery_admin_all ON app.recovery_codes FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

REVOKE UPDATE ON app.recovery_codes FROM sc_app;

-- ===========================================================================
-- Funções auxiliares das funções de acesso de 0045 e 0046
-- ===========================================================================
-- Dono migrador (este arquivo roda com SET LOCAL ROLE sc_migrator), caminho de
-- busca fixo, sem execução pública.

-- Papel real de uma identidade, do ponto de vista do acesso: administração
-- ativa, dono com vínculo aceito numa loja não excluída, ou cliente. Auxiliar
-- interna (roda com os direitos de quem chama; só as funções de 0045 e 0046 a
-- chamam).
CREATE OR REPLACE FUNCTION app.auth_papel_da_identidade(p_identidade uuid)
RETURNS text
LANGUAGE sql STABLE
SET search_path = app, pg_temp
AS $$
  SELECT CASE
           WHEN EXISTS (SELECT 1 FROM app.platform_admins a
                         WHERE a.identity_id = p_identidade AND a.revoked_at IS NULL)
             THEN 'ADMIN'
           WHEN EXISTS (SELECT 1
                          FROM app.store_members m
                          JOIN app.stores s ON s.id = m.store_id
                         WHERE m.identity_id = p_identidade
                           AND m.role = 'OWNER'
                           AND m.invite_accepted_at IS NOT NULL
                           AND m.revoked_at IS NULL
                           AND s.deleted_at IS NULL)
             THEN 'OWNER'
           ELSE 'CUSTOMER'
         END $$;

REVOKE ALL ON FUNCTION app.auth_papel_da_identidade(uuid) FROM PUBLIC;

-- Aplicativo autenticador ativo da identidade. Auxiliar interna.
CREATE OR REPLACE FUNCTION app.auth_tem_totp_ativo(p_identidade uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = app, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM app.totp_credentials t
                  WHERE t.identity_id = p_identidade
                    AND t.confirmed_at IS NOT NULL
                    AND t.disabled_at IS NULL) $$;

REVOKE ALL ON FUNCTION app.auth_tem_totp_ativo(uuid) FROM PUBLIC;

RESET ROLE;
