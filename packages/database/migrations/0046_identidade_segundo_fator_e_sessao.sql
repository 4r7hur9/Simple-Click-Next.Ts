-- ===========================================================================
-- 0046 — Funções de acesso do segundo fator, da sessão e do convite do dono
-- (T-111, AC-105 a AC-107, AC-109 a AC-113, AC-121 a AC-124, AC-129, AC-131),
-- e as lojas da sessão para a rota "quem sou eu" (T-115, AC-134 a AC-136).
--
-- Continuação de 0044 (tabelas e desenho de acesso) e 0045 (cadastro, login,
-- verificação e recuperação). Aqui ficam os passos que ainda acontecem sem
-- identidade no contexto: desafio depois da senha, conferência do aplicativo
-- autenticador no login, consumo de código de recuperação, abertura,
-- renovação e encerramento da sessão pelo token, e aceite do convite. Mesmas
-- regras: um passo por função, lista fechada de campos, caminho de busca fixo
-- (G10), dono migrador, execução só pela credencial que atende requisição.
--
-- Compatível com a versão anterior: só cria função. Nada que já existe muda.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- Desafio do segundo fator (AC-105 a AC-107, AC-121, AC-122, AC-124)
-- ---------------------------------------------------------------------------
-- Um desafio aberto por identidade: começar outro login invalida o anterior.
-- O canal é decidido pela aplicação e conferido aqui.
CREATE OR REPLACE FUNCTION app.auth_criar_desafio(
  p_id uuid, p_identidade uuid, p_canal text, p_resumo text,
  p_expira_em timestamptz, p_agora timestamptz)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_totp boolean;
BEGIN
  PERFORM 1 FROM app.identities i
   WHERE i.id = p_identidade AND i.anonymized_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'identidade inexistente para o desafio' USING ERRCODE = 'P0002';
  END IF;

  v_totp := app.auth_tem_totp_ativo(p_identidade);
  IF p_canal = 'EMAIL' AND v_totp THEN
    RAISE EXCEPTION 'com o aplicativo autenticador ativo, o codigo por e-mail nao vale (AC-121)'
      USING ERRCODE = '42501';
  END IF;
  IF p_canal = 'EMAIL' AND app.auth_papel_da_identidade(p_identidade) = 'ADMIN' THEN
    RAISE EXCEPTION 'a administracao nao entra por codigo de e-mail (AC-122)'
      USING ERRCODE = '42501';
  END IF;
  IF p_canal = 'TOTP' AND NOT v_totp THEN
    RAISE EXCEPTION 'desafio pelo aplicativo sem aplicativo ativo' USING ERRCODE = '42501';
  END IF;

  UPDATE app.verification_codes vc
     SET consumed_at = p_agora
   WHERE vc.identity_id = p_identidade
     AND vc.purpose = 'LOGIN_OTP'
     AND vc.consumed_at IS NULL;
  INSERT INTO app.verification_codes
    (id, identity_id, purpose, channel, code_hash, expires_at, created_at)
  VALUES (p_id, p_identidade, 'LOGIN_OTP', p_canal,
          CASE WHEN p_canal = 'TOTP' THEN NULL ELSE p_resumo END,
          p_expira_em, p_agora);
END $$;

-- Primeira metade da conferência: trava o desafio (e o segredo, no canal do
-- aplicativo) e devolve o que a aplicação precisa para comparar. A segunda
-- metade registra o desfecho na mesma transação.
CREATE OR REPLACE FUNCTION app.auth_desafio_para_conferir(p_id uuid)
RETURNS TABLE (identidade_id uuid, canal text, resumo text, tentativas integer,
               expira_em timestamptz, consumido_em timestamptz,
               credencial_id uuid, segredo_cifrado text, ultimo_passo bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_desafio    record;
  v_credencial uuid;
  v_cifrado    text;
  v_passo      bigint;
BEGIN
  SELECT vc.identity_id, vc.channel, vc.code_hash, vc.attempt_count,
         vc.expires_at, vc.consumed_at
    INTO v_desafio
    FROM app.verification_codes vc
   WHERE vc.id = p_id AND vc.purpose = 'LOGIN_OTP'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_desafio.channel = 'TOTP' THEN
    SELECT t.id, t.secret_enc, t.last_used_step INTO v_credencial, v_cifrado, v_passo
      FROM app.totp_credentials t
     WHERE t.identity_id = v_desafio.identity_id
       AND t.confirmed_at IS NOT NULL
       AND t.disabled_at IS NULL
     FOR UPDATE;
  END IF;

  RETURN QUERY SELECT v_desafio.identity_id, v_desafio.channel, v_desafio.code_hash,
                      v_desafio.attempt_count, v_desafio.expires_at, v_desafio.consumed_at,
                      v_credencial, v_cifrado, v_passo;
END $$;

CREATE OR REPLACE FUNCTION app.auth_registrar_conferencia_do_desafio(
  p_id uuid, p_aceito boolean, p_passo bigint, p_maximo integer,
  p_agora timestamptz)
RETURNS TABLE (status text, tentativas_restantes integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_desafio    record;
  v_tentativas integer;
  v_aceito     boolean := coalesce(p_aceito, false);
BEGIN
  SELECT vc.identity_id, vc.channel, vc.attempt_count INTO v_desafio
    FROM app.verification_codes vc
   WHERE vc.id = p_id AND vc.purpose = 'LOGIN_OTP'
     AND vc.consumed_at IS NULL AND vc.expires_at > p_agora
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALIDO'::text, 0;
    RETURN;
  END IF;

  IF v_aceito THEN
    IF v_desafio.channel = 'TOTP' THEN
      -- O passo só anda para a frente: o mesmo código não vale duas vezes
      -- (AC-124), nem em duas conferências simultâneas.
      UPDATE app.totp_credentials t
         SET last_used_step = p_passo
       WHERE t.identity_id = v_desafio.identity_id
         AND t.confirmed_at IS NOT NULL
         AND t.disabled_at IS NULL
         AND (t.last_used_step IS NULL OR t.last_used_step < p_passo);
      IF NOT FOUND THEN
        v_aceito := false;
      END IF;
    END IF;
  END IF;

  IF v_aceito THEN
    UPDATE app.verification_codes vc SET consumed_at = p_agora WHERE vc.id = p_id;
    RETURN QUERY SELECT 'ACEITO'::text, 0;
    RETURN;
  END IF;

  v_tentativas := v_desafio.attempt_count + 1;
  IF v_tentativas >= p_maximo THEN
    UPDATE app.verification_codes vc
       SET attempt_count = v_tentativas, consumed_at = p_agora
     WHERE vc.id = p_id;
    RETURN QUERY SELECT 'BLOQUEADO'::text, 0;
    RETURN;
  END IF;
  UPDATE app.verification_codes vc SET attempt_count = v_tentativas WHERE vc.id = p_id;
  RETURN QUERY SELECT 'CODIGO_INCORRETO'::text, p_maximo - v_tentativas;
END $$;

-- ---------------------------------------------------------------------------
-- Aplicativo autenticador no login, sem desafio (AC-124)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.auth_totp_para_conferir(p_identidade uuid)
RETURNS TABLE (credencial_id uuid, segredo_cifrado text, ultimo_passo bigint)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT t.id, t.secret_enc, t.last_used_step
    FROM app.totp_credentials t
   WHERE t.identity_id = p_identidade
     AND t.confirmed_at IS NOT NULL
     AND t.disabled_at IS NULL
   FOR UPDATE $$;

CREATE OR REPLACE FUNCTION app.auth_totp_registrar_passo(p_credencial uuid, p_passo bigint)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  UPDATE app.totp_credentials t
     SET last_used_step = p_passo
   WHERE t.id = p_credencial
     AND t.confirmed_at IS NOT NULL
     AND t.disabled_at IS NULL
     AND (t.last_used_step IS NULL OR t.last_used_step < p_passo);
  RETURN FOUND;
END $$;

-- ---------------------------------------------------------------------------
-- Código de recuperação no login (AC-123)
-- ---------------------------------------------------------------------------
-- Uma instrução só: duas tentativas simultâneas com o mesmo código não
-- consomem duas vezes.
CREATE OR REPLACE FUNCTION app.auth_consumir_codigo_de_recuperacao(
  p_identidade uuid, p_resumo text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  UPDATE app.recovery_codes r
     SET used_at = now()
   WHERE r.identity_id = p_identidade
     AND r.code_sha256 = p_resumo
     AND r.used_at IS NULL
     AND EXISTS (SELECT 1 FROM app.identities i
                  WHERE i.id = r.identity_id AND i.anonymized_at IS NULL);
  RETURN FOUND;
END $$;

-- ---------------------------------------------------------------------------
-- Sessão (AC-109 a AC-113)
-- ---------------------------------------------------------------------------
-- O papel gravado é conferido com o papel real: um defeito que assinasse ADMIN
-- para quem não é administração para aqui.
CREATE OR REPLACE FUNCTION app.auth_criar_sessao(
  p_id uuid, p_familia uuid, p_identidade uuid, p_papel text, p_cliente text,
  p_resumo text, p_criada_em timestamptz, p_expira_em timestamptz)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM app.identities i
   WHERE i.id = p_identidade AND i.anonymized_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'identidade inexistente para a sessao' USING ERRCODE = 'P0002';
  END IF;
  IF app.auth_papel_da_identidade(p_identidade) IS DISTINCT FROM p_papel THEN
    RAISE EXCEPTION 'o papel da sessao nao confere com o papel da identidade'
      USING ERRCODE = '42501';
  END IF;
  INSERT INTO app.sessions
    (id, identity_id, family_id, token_sha256, role_at_issue, client_kind,
     issued_at, expires_at)
  VALUES (p_id, p_identidade, p_familia, p_resumo, p_papel, p_cliente,
          p_criada_em, p_expira_em);
END $$;

-- Consome o token atual e cria o sucessor numa transação. Token já consumido
-- é cópia: a família inteira cai, e quem chama sabe se ela já estava caída
-- (para não mandar um e-mail por repetição do mesmo token roubado). Papel que
-- mudou desde o login (vínculo revogado, administração retirada) também
-- derruba a família: o token novo não pode carregar um poder que acabou.
CREATE OR REPLACE FUNCTION app.auth_rotacionar_sessao(
  p_resumo text, p_nova_id uuid, p_novo_resumo text,
  p_criada_em timestamptz, p_expira_em timestamptz, p_agora timestamptz)
RETURNS TABLE (estado text, identidade_id uuid, familia_id uuid, papel text,
               cliente text, anterior_id uuid, anterior_emitida_em timestamptz,
               anterior_expira_em timestamptz, nova_emitida_em timestamptz,
               nova_expira_em timestamptz, familia_ja_revogada boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_sessao     record;
  v_derrubadas integer;
BEGIN
  SELECT s.id, s.identity_id, s.family_id, s.role_at_issue, s.client_kind,
         s.issued_at, s.expires_at, s.used_at, s.revoked_at
    INTO v_sessao
    FROM app.sessions s
   WHERE s.token_sha256 = p_resumo
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'recusada'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
                        NULL::uuid, NULL::timestamptz, NULL::timestamptz,
                        NULL::timestamptz, NULL::timestamptz, NULL::boolean;
    RETURN;
  END IF;

  IF v_sessao.used_at IS NOT NULL THEN
    UPDATE app.sessions s
       SET revoked_at = p_agora, revoked_reason = 'REUSE_DETECTED'
     WHERE s.family_id = v_sessao.family_id AND s.revoked_at IS NULL;
    GET DIAGNOSTICS v_derrubadas = ROW_COUNT;
    RETURN QUERY SELECT 'reuso_detectado'::text, v_sessao.identity_id, v_sessao.family_id,
                        NULL::text, NULL::text, NULL::uuid, NULL::timestamptz,
                        NULL::timestamptz, NULL::timestamptz, NULL::timestamptz,
                        v_derrubadas = 0;
    RETURN;
  END IF;

  IF v_sessao.revoked_at IS NOT NULL OR v_sessao.expires_at <= p_agora
     OR NOT EXISTS (SELECT 1 FROM app.identities i
                     WHERE i.id = v_sessao.identity_id AND i.anonymized_at IS NULL) THEN
    RETURN QUERY SELECT 'recusada'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
                        NULL::uuid, NULL::timestamptz, NULL::timestamptz,
                        NULL::timestamptz, NULL::timestamptz, NULL::boolean;
    RETURN;
  END IF;

  IF app.auth_papel_da_identidade(v_sessao.identity_id) IS DISTINCT FROM v_sessao.role_at_issue THEN
    UPDATE app.sessions s
       SET revoked_at = p_agora, revoked_reason = 'ROLE_CHANGED'
     WHERE s.family_id = v_sessao.family_id AND s.revoked_at IS NULL;
    RETURN QUERY SELECT 'recusada'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
                        NULL::uuid, NULL::timestamptz, NULL::timestamptz,
                        NULL::timestamptz, NULL::timestamptz, NULL::boolean;
    RETURN;
  END IF;

  UPDATE app.sessions s SET used_at = p_agora WHERE s.id = v_sessao.id;
  INSERT INTO app.sessions
    (id, identity_id, family_id, parent_id, token_sha256, role_at_issue,
     client_kind, issued_at, expires_at)
  VALUES (p_nova_id, v_sessao.identity_id, v_sessao.family_id, v_sessao.id,
          p_novo_resumo, v_sessao.role_at_issue, v_sessao.client_kind,
          p_criada_em, p_expira_em);

  RETURN QUERY SELECT 'rotacionada'::text, v_sessao.identity_id, v_sessao.family_id,
                      v_sessao.role_at_issue, v_sessao.client_kind, v_sessao.id,
                      v_sessao.issued_at, v_sessao.expires_at, p_criada_em,
                      p_expira_em, false;
END $$;

-- Sair só com o token de renovação na mão (o cookie), quando o token de
-- acesso já venceu: derruba a família daquele aparelho.
CREATE OR REPLACE FUNCTION app.auth_encerrar_pelo_token(p_resumo text, p_agora timestamptz)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_familia uuid;
BEGIN
  SELECT s.family_id INTO v_familia
    FROM app.sessions s WHERE s.token_sha256 = p_resumo;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  UPDATE app.sessions s
     SET revoked_at = p_agora, revoked_reason = 'LOGOUT'
   WHERE s.family_id = v_familia AND s.revoked_at IS NULL;
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------
-- Convite do dono (AC-103, AC-200)
-- ---------------------------------------------------------------------------
-- Aceitar o convite define a senha, confirma o e-mail (o link chegou nele),
-- aceita o vínculo, derruba as sessões antigas daquela pessoa (o papel mudou)
-- e deixa o ato na trilha da loja — tudo ou nada.
CREATE OR REPLACE FUNCTION app.auth_aceitar_convite(
  p_resumo text, p_senha_hash text, p_agora timestamptz)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_vinculo record;
BEGIN
  IF p_senha_hash IS NULL OR p_senha_hash NOT LIKE 'argon2id$%' THEN
    RAISE EXCEPTION 'convite exige a senha derivada, nunca a senha' USING ERRCODE = '22023';
  END IF;

  SELECT m.id, m.store_id, m.identity_id INTO v_vinculo
    FROM app.store_members m
    JOIN app.stores s ON s.id = m.store_id AND s.deleted_at IS NULL
    JOIN app.identities i ON i.id = m.identity_id AND i.anonymized_at IS NULL
   WHERE m.invite_token_hash = p_resumo
     AND m.invite_accepted_at IS NULL
     AND m.revoked_at IS NULL
     AND m.invite_expires_at > p_agora
   FOR UPDATE OF m;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE app.store_members m
     SET invite_accepted_at = p_agora,
         invite_token_hash  = NULL,
         invite_expires_at  = NULL
   WHERE m.id = v_vinculo.id;
  UPDATE app.identities i
     SET password_hash      = p_senha_hash,
         email_verified_at  = coalesce(i.email_verified_at, p_agora),
         failed_login_count = 0,
         locked_until       = NULL
   WHERE i.id = v_vinculo.identity_id;
  UPDATE app.sessions s
     SET revoked_at = p_agora, revoked_reason = 'ROLE_CHANGED'
   WHERE s.identity_id = v_vinculo.identity_id AND s.revoked_at IS NULL;
  INSERT INTO app.audit_log (store_id, actor_id, actor_role, action, entity, entity_id)
  VALUES (v_vinculo.store_id, v_vinculo.identity_id, 'OWNER', 'CONVITE_ACEITO',
          'store_members', v_vinculo.id::text);
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------
-- Execução: só a credencial que atende requisição
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION app.auth_criar_desafio(uuid, uuid, text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_desafio_para_conferir(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_registrar_conferencia_do_desafio(uuid, boolean, bigint, integer, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_totp_para_conferir(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_totp_registrar_passo(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_consumir_codigo_de_recuperacao(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_criar_sessao(uuid, uuid, uuid, text, text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_rotacionar_sessao(text, uuid, text, timestamptz, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_encerrar_pelo_token(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_aceitar_convite(text, text, timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.auth_criar_desafio(uuid, uuid, text, text, timestamptz, timestamptz) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_desafio_para_conferir(uuid) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_registrar_conferencia_do_desafio(uuid, boolean, bigint, integer, timestamptz) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_totp_para_conferir(uuid) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_totp_registrar_passo(uuid, bigint) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_consumir_codigo_de_recuperacao(uuid, text) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_criar_sessao(uuid, uuid, uuid, text, text, text, timestamptz, timestamptz) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_rotacionar_sessao(text, uuid, text, timestamptz, timestamptz, timestamptz) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_encerrar_pelo_token(text, timestamptz) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_aceitar_convite(text, text, timestamptz) TO sc_app;

-- ---------------------------------------------------------------------------
-- "Quem sou eu": as lojas da sessão (T-115, AC-134 a AC-136)
-- ---------------------------------------------------------------------------
-- O painel precisa saber de qual loja é o dono ANTES de ter loja no contexto,
-- e a política de `store_members` exige loja no contexto. Esta função abre,
-- só para a identidade e o papel do contexto, as lojas em que o vínculo está
-- ativo — a mesma regra de `app.is_store_staff()` (0041): convite aceito, sem
-- revogação, mesmo papel da sessão. Loja excluída fica de fora; suspensa
-- aparece, para o dono saber por que a vitrine sumiu. Lista fechada de campos;
-- sem identidade no contexto, ou sessão de cliente, devolve nada.
CREATE OR REPLACE FUNCTION app.lojas_da_sessao()
RETURNS TABLE (store_slug text, store_name text, member_role text, store_status text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT s.slug, s.name, m.role, s.status
    FROM app.store_members m
    JOIN app.stores s ON s.id = m.store_id
   WHERE app.current_user_id() IS NOT NULL
     AND app.current_role_name() IN ('OWNER', 'STAFF')
     AND m.identity_id = app.current_user_id()
     AND m.role = app.current_role_name()
     AND m.invite_accepted_at IS NOT NULL
     AND m.revoked_at IS NULL
     AND s.deleted_at IS NULL
     AND s.status <> 'DELETED'
   ORDER BY s.name, s.slug $$;

REVOKE ALL ON FUNCTION app.lojas_da_sessao() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lojas_da_sessao() TO sc_app;

RESET ROLE;
