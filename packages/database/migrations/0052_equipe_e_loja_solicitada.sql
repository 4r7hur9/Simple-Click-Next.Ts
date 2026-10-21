-- ===========================================================================
-- 0052 — Equipe gerenciada pelo dono e loja solicitada pelo lojista (#25).
--
-- EQUIPE. O dono cadastra a equipe (STAFF) da loja, respeitando o limite de
-- 0051. Duas situações:
--
--   - a pessoa ainda não tem conta: a conta nasce com a senha que o dono
--     definiu, já verificada, e o vínculo fica marcado `account_managed` —
--     só nesse caso o dono pode TROCAR a senha dela depois;
--   - a pessoa já tem conta (cliente, dono de outra loja): ela só ganha o
--     vínculo e entra com a senha dela. O dono nunca altera a senha de uma
--     conta que não criou.
--
-- Escrever em `store_members` passa a ser só do DONO (antes: qualquer equipe).
-- A API já confere a matriz de permissões; o banco repete a regra.
--
-- A identidade de outra pessoa não é legível pela credencial das lojas (só a
-- própria, 0044). A lista da equipe sai por `app.equipe_da_loja()`, com lista
-- fechada de campos e só para o dono da loja corrente.
--
-- LOJA SOLICITADA. Quem tem conta pode abrir a própria loja: ela nasce
-- AGUARDANDO APROVAÇÃO, com a pessoa como dona (vínculo aceito), e respeita o
-- limite de lojas por dono. A credencial das lojas não insere em `stores`
-- (0003); por isso a criação é uma função com os direitos de quem a definiu,
-- que só cria loja para a pessoa da sessão.
--
-- Idempotente: coluna com IF NOT EXISTS, políticas e funções recriadas.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- Vínculo de equipe com conta criada pela loja
-- ---------------------------------------------------------------------------
ALTER TABLE app.store_members
  ADD COLUMN IF NOT EXISTS account_managed boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Escrever na equipe é do dono
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS members_staff_insert ON app.store_members;
DROP POLICY IF EXISTS members_staff_update ON app.store_members;
DROP POLICY IF EXISTS members_staff_delete ON app.store_members;
DROP POLICY IF EXISTS members_owner_insert ON app.store_members;
DROP POLICY IF EXISTS members_owner_update ON app.store_members;
DROP POLICY IF EXISTS members_owner_delete ON app.store_members;

CREATE POLICY members_owner_insert ON app.store_members FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
              AND (SELECT app.is_store_staff())
              AND (SELECT app.current_role_name()) = 'OWNER');

CREATE POLICY members_owner_update ON app.store_members FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id())
              AND (SELECT app.is_store_staff())
              AND (SELECT app.current_role_name()) = 'OWNER')
  WITH CHECK (store_id = (SELECT app.current_store_id())
              AND (SELECT app.is_store_staff())
              AND (SELECT app.current_role_name()) = 'OWNER');

CREATE POLICY members_owner_delete ON app.store_members FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id())
         AND (SELECT app.is_store_staff())
         AND (SELECT app.current_role_name()) = 'OWNER');

-- ---------------------------------------------------------------------------
-- Quem é o dono desta requisição
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sou_dono_da_loja_corrente()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = app, pg_temp
AS $$ SELECT app.current_role_name() = 'OWNER' AND app.is_store_staff() $$;

REVOKE ALL ON FUNCTION app.sou_dono_da_loja_corrente() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.sou_dono_da_loja_corrente() TO sc_app;

-- ---------------------------------------------------------------------------
-- A equipe da loja corrente, para o dono
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS app.equipe_da_loja();
CREATE FUNCTION app.equipe_da_loja()
RETURNS TABLE (
  member_id uuid, identity_id uuid, display_name text, email text,
  role text, account_managed boolean, invite_accepted boolean,
  revoked_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT m.id, m.identity_id, i.display_name, i.email_norm, m.role,
         m.account_managed, m.invite_accepted_at IS NOT NULL,
         m.revoked_at, m.created_at
    FROM app.store_members m
    JOIN app.identities i ON i.id = m.identity_id
   WHERE app.current_store_id() IS NOT NULL
     AND m.store_id = app.current_store_id()
     AND app.sou_dono_da_loja_corrente()
     AND i.anonymized_at IS NULL
   ORDER BY m.role, m.revoked_at NULLS FIRST, i.display_name, m.created_at
$$;

REVOKE ALL ON FUNCTION app.equipe_da_loja() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.equipe_da_loja() TO sc_app;

-- ---------------------------------------------------------------------------
-- A conta da pessoa da equipe: a que existe, ou uma nova
-- ---------------------------------------------------------------------------
-- Devolve o id da conta e se ela foi criada agora — ou id nulo quando a conta
-- não existe e não veio senha. Só o dono da loja corrente chama; a senha chega
-- já derivada, nunca em claro.
DROP FUNCTION IF EXISTS app.equipe_conta_para_vinculo(text, text, text);
CREATE FUNCTION app.equipe_conta_para_vinculo(
  p_email text, p_nome text, p_senha_hash text)
RETURNS TABLE (identity_id uuid, created boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_id uuid;
BEGIN
  IF NOT app.sou_dono_da_loja_corrente() THEN
    RAISE EXCEPTION 'so o dono da loja cadastra a equipe' USING ERRCODE = '42501';
  END IF;
  SELECT i.id INTO v_id FROM app.identities i
   WHERE i.email_norm = lower(btrim(p_email)) AND i.anonymized_at IS NULL;
  IF FOUND THEN
    RETURN QUERY SELECT v_id, false;
    RETURN;
  END IF;
  -- Conta nova sem senha: nada é criado, e quem chama pede a senha.
  IF p_senha_hash IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false;
    RETURN;
  END IF;
  IF p_senha_hash NOT LIKE 'argon2id$%' THEN
    RAISE EXCEPTION 'conta nova exige a senha derivada' USING ERRCODE = '22023';
  END IF;
  INSERT INTO app.identities (email_norm, display_name, password_hash, email_verified_at)
  VALUES (lower(btrim(p_email)), nullif(btrim(p_nome), ''), p_senha_hash, now())
  RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, true;
END $$;

REVOKE ALL ON FUNCTION app.equipe_conta_para_vinculo(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.equipe_conta_para_vinculo(text, text, text) TO sc_app;

-- ---------------------------------------------------------------------------
-- Troca de senha de quem a loja cadastrou
-- ---------------------------------------------------------------------------
-- Só vínculo de EQUIPE desta loja, com conta criada por ela, e de pessoa que
-- não é dona de loja nenhuma nem administra a plataforma. Derruba as sessões
-- abertas da pessoa. Devolve falso quando não pode.
CREATE OR REPLACE FUNCTION app.equipe_trocar_senha(
  p_vinculo uuid, p_senha_hash text, p_agora timestamptz)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_identidade uuid;
BEGIN
  IF NOT app.sou_dono_da_loja_corrente() THEN
    RETURN false;
  END IF;
  IF p_senha_hash IS NULL OR p_senha_hash NOT LIKE 'argon2id$%' THEN
    RAISE EXCEPTION 'troca exige a senha derivada' USING ERRCODE = '22023';
  END IF;
  SELECT m.identity_id INTO v_identidade
    FROM app.store_members m
   WHERE m.id = p_vinculo
     AND m.store_id = app.current_store_id()
     AND m.role = 'STAFF'
     AND m.account_managed
     AND m.revoked_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM app.platform_admins a
              WHERE a.identity_id = v_identidade AND a.revoked_at IS NULL)
     OR EXISTS (SELECT 1 FROM app.store_members o
                 WHERE o.identity_id = v_identidade AND o.role = 'OWNER'
                   AND o.revoked_at IS NULL) THEN
    RETURN false;
  END IF;
  UPDATE app.identities i
     SET password_hash = p_senha_hash, failed_login_count = 0, locked_until = NULL
   WHERE i.id = v_identidade AND i.anonymized_at IS NULL;
  UPDATE app.sessions s
     SET revoked_at = p_agora, revoked_reason = 'PASSWORD_CHANGED'
   WHERE s.identity_id = v_identidade AND s.revoked_at IS NULL;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION app.equipe_trocar_senha(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.equipe_trocar_senha(uuid, text, timestamptz) TO sc_app;

-- ---------------------------------------------------------------------------
-- A loja que o próprio lojista abre
-- ---------------------------------------------------------------------------
-- O apelido está livre (nem atual nem antigo de loja nenhuma)? Só diz sim ou
-- não, para o cadastro sugerir um endereço.
CREATE OR REPLACE FUNCTION app.apelido_livre(p_slug text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT p_slug IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM app.stores s
     WHERE lower(s.slug) = lower(p_slug)
        OR lower(p_slug) = ANY (s.slugs_antigos))
$$;

REVOKE ALL ON FUNCTION app.apelido_livre(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.apelido_livre(text) TO sc_app;

-- resultado: 'CRIADA', 'SEM_SESSAO', 'TIPO_DESCONHECIDO', 'APELIDO_EM_USO' ou
-- 'LIMITE_ATINGIDO' (com limite e uso).
DROP FUNCTION IF EXISTS app.solicitar_loja(text, text, text, text, text, text);
CREATE FUNCTION app.solicitar_loja(
  p_nome text, p_slug text, p_vertical text,
  p_whatsapp text, p_cidade text, p_uf text)
RETURNS TABLE (
  resultado text, store_id uuid, code text, slug text, status text,
  limite integer, uso integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_pessoa  uuid := app.current_user_id();
  v_limite  integer;
  v_uso     integer;
  v_preset  record;
  v_loja    record;
BEGIN
  IF v_pessoa IS NULL OR NOT EXISTS (
       SELECT 1 FROM app.identities i
        WHERE i.id = v_pessoa AND i.anonymized_at IS NULL) THEN
    RETURN QUERY SELECT 'SEM_SESSAO'::text, NULL::uuid, NULL::text, NULL::text,
                        NULL::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  SELECT p.code, p.schema_version INTO v_preset
    FROM app.vertical_presets p WHERE p.code = p_vertical;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'TIPO_DESCONHECIDO'::text, NULL::uuid, NULL::text,
                        NULL::text, NULL::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  -- Uma pessoa pedindo duas lojas ao mesmo tempo não passa do limite.
  PERFORM pg_advisory_xact_lock(hashtextextended('lojas-do-dono:' || v_pessoa::text, 8310052));
  SELECT l.limite, l.uso INTO v_limite, v_uso FROM app.limite_de_lojas_do_dono(v_pessoa) l;
  IF v_uso >= v_limite THEN
    RETURN QUERY SELECT 'LIMITE_ATINGIDO'::text, NULL::uuid, NULL::text,
                        NULL::text, NULL::text, v_limite, v_uso;
    RETURN;
  END IF;

  IF NOT app.apelido_livre(p_slug) THEN
    RETURN QUERY SELECT 'APELIDO_EM_USO'::text, NULL::uuid, NULL::text,
                        NULL::text, NULL::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  INSERT INTO app.stores
    (code, name, slug, status, vertical_code, vertical_schema_version,
     whatsapp_e164, city, uf, created_by)
  VALUES (app.proximo_codigo_de_loja(), btrim(p_nome), lower(p_slug),
          'PENDING_APPROVAL', v_preset.code, v_preset.schema_version,
          nullif(btrim(p_whatsapp), ''), nullif(btrim(p_cidade), ''),
          nullif(upper(btrim(p_uf)), ''), v_pessoa)
  RETURNING stores.id, stores.code, stores.slug, stores.status INTO v_loja;

  INSERT INTO app.store_settings (store_id) VALUES (v_loja.id);
  INSERT INTO app.store_members (store_id, identity_id, role, invite_accepted_at)
  VALUES (v_loja.id, v_pessoa, 'OWNER', now());
  INSERT INTO app.audit_log
    (store_id, actor_id, actor_role, action, entity, entity_id, after_data)
  VALUES (v_loja.id, v_pessoa, 'OWNER', 'LOJA_SOLICITADA', 'stores', v_loja.id::text,
          jsonb_build_object('codigo', v_loja.code, 'apelido', v_loja.slug,
                             'tipoDeNegocio', v_preset.code, 'status', v_loja.status));

  RETURN QUERY SELECT 'CRIADA'::text, v_loja.id, v_loja.code, v_loja.slug,
                      v_loja.status, v_limite, v_uso + 1;
END $$;

REVOKE ALL ON FUNCTION app.solicitar_loja(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.solicitar_loja(text, text, text, text, text, text) TO sc_app;

RESET ROLE;
