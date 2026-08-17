-- ===========================================================================
-- 0002 — Identidade global de acesso.
--
-- `identities` guarda a informação pessoal de autenticação e é GLOBAL: uma
-- pessoa tem uma conta na plataforma inteira, não uma por loja. É o que permite
-- histórico em várias lojas com um login só sem multiplicar dado pessoal.
--
-- Aqui não existe coluna de loja de propósito. O dono de loja nunca enxerga
-- esta tabela: o que ele precisa para operar mora na projeção por loja
-- (`store_customers`, migração 0005).
--
-- Fica para as próximas tarefas, no mesmo desenho: `sessions`,
-- `verification_codes`, `totp_credentials`, `recovery_codes` e
-- `customer_addresses` (feature identidade-acesso).
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- identities — informação pessoal de autenticação
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.identities (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Guardado já normalizado porque comparação de e-mail não pode depender de
  -- quem digitou com maiúscula.
  email_norm         text        NOT NULL,
  -- Nulo para o comprador que entra por código de uso único: conta sem senha
  -- não é conta incompleta, é uma decisão de produto.
  password_hash      text,
  email_verified_at  timestamptz,
  phone_e164         text,
  display_name       text,
  locale             text        NOT NULL DEFAULT 'pt-BR',
  failed_login_count integer     NOT NULL DEFAULT 0,
  locked_until       timestamptz,
  -- Exclusão de dado pessoal é anonimização, nunca remoção de linha: apagar
  -- destruiria a retenção fiscal e as métricas de quem não cometeu infração.
  anonymized_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identities_email_norm_ck CHECK (email_norm = lower(btrim(email_norm)))
);

-- Única chave única global de informação pessoal do projeto. É enumerável por
-- desenho, e a mitigação é de aplicação: limite de tentativas e resposta
-- genérica no cadastro. Está na lista fechada da guarda de estrutura.
CREATE UNIQUE INDEX IF NOT EXISTS identities_email_uk
  ON app.identities (email_norm);

-- Reconhecer comprador recorrente pelo telefone sem indexar quem não tem.
CREATE INDEX IF NOT EXISTS identities_phone_ix
  ON app.identities (phone_e164) WHERE phone_e164 IS NOT NULL;

DROP TRIGGER IF EXISTS identities_touch ON app.identities;
CREATE TRIGGER identities_touch BEFORE UPDATE ON app.identities
  FOR EACH ROW EXECUTE FUNCTION app.tocar_atualizado_em();

ALTER TABLE app.identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.identities FORCE  ROW LEVEL SECURITY;

-- Cada pessoa enxerga a si mesma, e mais ninguém. Sem contexto de usuário a
-- comparação vira nula e a consulta devolve zero linhas.
CREATE POLICY identities_self_select ON app.identities FOR SELECT TO sc_app
  USING (id = (SELECT app.current_user_id()));

CREATE POLICY identities_self_update ON app.identities FOR UPDATE TO sc_app
  USING      (id = (SELECT app.current_user_id()))
  WITH CHECK (id = (SELECT app.current_user_id()));

-- Não existe política de inserção nem de remoção para o tempo de execução: o
-- cadastro e o login precisam consultar por e-mail ANTES de existir sessão, e
-- isso é papel de função dedicada da feature de identidade — não de uma
-- política que teria de liberar leitura por e-mail para quem não é ninguém.
CREATE POLICY identities_admin_all ON app.identities FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- platform_admins — quem administra a plataforma
-- ---------------------------------------------------------------------------
-- Tabela separada, e não uma coluna de papel na identidade, para que o papel de
-- plataforma não seja alcançável por uma alteração numa rota de loja. Promover
-- alguém a administrador exige a credencial de administração.
CREATE TABLE IF NOT EXISTS app.platform_admins (
  identity_id uuid PRIMARY KEY REFERENCES app.identities (id),
  granted_by  uuid REFERENCES app.identities (id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

CREATE INDEX IF NOT EXISTS platform_admins_ativos_ix
  ON app.platform_admins (identity_id) WHERE revoked_at IS NULL;

ALTER TABLE app.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.platform_admins FORCE  ROW LEVEL SECURITY;

-- Nenhuma política para `sc_app`: a credencial das lojas não lê nem escreve
-- quem é administrador, em nenhuma circunstância.
CREATE POLICY platform_admins_admin_all ON app.platform_admins FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);
