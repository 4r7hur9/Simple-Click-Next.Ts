-- ===========================================================================
-- 0045 — Funções de acesso antes da sessão: cadastro, login, verificação de
-- e-mail e recuperação de senha (T-111, AC-129, AC-131).
--
-- Continuação de 0044, que criou as tabelas e explica o desenho de acesso.
-- Antes de existir sessão ninguém é ninguém: não há identidade no contexto
-- para uma política conferir. Cada função abaixo faz UM passo, devolve a lista
-- fechada de campos de que o passo precisa e roda com caminho de busca fixo
-- (G10). Dono: o migrador. Execução: só a credencial que atende requisição.
--
-- Compatível com a versão anterior: só cria função. Nada que já existe muda.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- Cadastro (AC-100, AC-101)
-- ---------------------------------------------------------------------------
-- Teste de unicidade e inserção na mesma instrução: dois cadastros simultâneos
-- com o mesmo e-mail não criam duas contas. Devolve só "criou ou não" — quem
-- chama responde igual nos dois casos.
CREATE OR REPLACE FUNCTION app.auth_cadastrar_identidade(
  p_email text, p_nome text, p_telefone text, p_senha_hash text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_senha_hash IS NULL OR p_senha_hash NOT LIKE 'argon2id$%' THEN
    RAISE EXCEPTION 'cadastro exige a senha derivada, nunca a senha' USING ERRCODE = '22023';
  END IF;
  INSERT INTO app.identities (email_norm, display_name, phone_e164, password_hash)
  VALUES (lower(btrim(p_email)), p_nome, p_telefone, p_senha_hash)
  ON CONFLICT (email_norm) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Login (AC-105, AC-108, AC-121, AC-122)
-- ---------------------------------------------------------------------------
-- A derivação da senha sai daqui porque o Argon2id roda na aplicação. Conta
-- anonimizada e conta sem senha (convite ainda não aceito) não entram.
CREATE OR REPLACE FUNCTION app.auth_identidade_para_login(p_email text)
RETURNS TABLE (identidade_id uuid, endereco text, nome text, senha_hash text,
               email_verificado boolean, papel text, totp_ativo boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT i.id, i.email_norm, i.display_name, i.password_hash,
         i.email_verified_at IS NOT NULL,
         app.auth_papel_da_identidade(i.id),
         app.auth_tem_totp_ativo(i.id)
    FROM app.identities i
   WHERE i.email_norm = lower(btrim(p_email))
     AND i.password_hash IS NOT NULL
     AND i.anonymized_at IS NULL $$;

-- ---------------------------------------------------------------------------
-- Verificação de e-mail (AC-103, AC-104)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.auth_criar_verificacao_de_email(
  p_id uuid, p_identidade uuid, p_resumo text,
  p_expira_em timestamptz, p_criado_em timestamptz)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  INSERT INTO app.verification_codes
    (id, identity_id, purpose, channel, code_hash, expires_at, created_at)
  SELECT p_id, i.id, 'EMAIL_VERIFY', 'EMAIL', p_resumo, p_expira_em, p_criado_em
    FROM app.identities i
   WHERE i.id = p_identidade AND i.anonymized_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'identidade inexistente para o link de verificacao' USING ERRCODE = 'P0002';
  END IF;
END $$;

-- O primeiro link, logo depois do cadastro: quem cadastrou só conhece o
-- e-mail. Conta já verificada não ganha link (devolve vazio).
CREATE OR REPLACE FUNCTION app.auth_criar_verificacao_por_email(
  p_id uuid, p_email text, p_resumo text,
  p_expira_em timestamptz, p_criado_em timestamptz)
RETURNS TABLE (identidade_id uuid, nome text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_pessoa record;
BEGIN
  SELECT i.id, i.display_name INTO v_pessoa
    FROM app.identities i
   WHERE i.email_norm = lower(btrim(p_email))
     AND i.email_verified_at IS NULL
     AND i.anonymized_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  INSERT INTO app.verification_codes
    (id, identity_id, purpose, channel, code_hash, expires_at, created_at)
  VALUES (p_id, v_pessoa.id, 'EMAIL_VERIFY', 'EMAIL', p_resumo, p_expira_em, p_criado_em);
  RETURN QUERY SELECT v_pessoa.id, v_pessoa.display_name;
END $$;

-- Consome o link e marca o e-mail na mesma transação: duas abas não consomem
-- o mesmo link (a segunda espera a trava e encontra o link já usado).
CREATE OR REPLACE FUNCTION app.auth_consumir_verificacao_de_email(
  p_resumo text, p_agora timestamptz)
RETURNS TABLE (situacao text, identidade_id uuid, endereco text, nome text,
               verificado_em timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_codigo   record;
  v_pessoa   record;
BEGIN
  SELECT vc.id, vc.identity_id, vc.expires_at INTO v_codigo
    FROM app.verification_codes vc
   WHERE vc.purpose = 'EMAIL_VERIFY'
     AND vc.code_hash = p_resumo
     AND vc.consumed_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalido'::text, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  IF v_codigo.expires_at <= p_agora THEN
    RETURN QUERY SELECT 'expirado'::text, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE app.identities i
     SET email_verified_at = coalesce(i.email_verified_at, p_agora)
   WHERE i.id = v_codigo.identity_id AND i.anonymized_at IS NULL
  RETURNING i.id, i.email_norm, i.display_name, i.email_verified_at INTO v_pessoa;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalido'::text, NULL::uuid, NULL::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE app.verification_codes vc SET consumed_at = p_agora WHERE vc.id = v_codigo.id;
  RETURN QUERY SELECT 'verificado'::text, v_pessoa.id, v_pessoa.email_norm,
                      v_pessoa.display_name, v_pessoa.email_verified_at;
END $$;

-- Reenvio a partir do link expirado, limitado por identidade e por janela.
-- A linha da identidade fica travada até o fim da transação: a rota abre a
-- autorização e a criação do link novo na MESMA transação, e o segundo
-- reenvio simultâneo espera e conta o link que o primeiro gravou.
CREATE OR REPLACE FUNCTION app.auth_autorizar_reenvio_de_verificacao(
  p_resumo text, p_agora timestamptz, p_limite integer, p_janela_ms bigint)
RETURNS TABLE (situacao text, identidade_id uuid, endereco text, nome text,
               verificado_em timestamptz, disponivel_em timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_codigo     record;
  v_pessoa     record;
  v_janela     interval := p_janela_ms::double precision * interval '1 millisecond';
  v_inicio     timestamptz := p_agora - v_janela;
  v_quantidade integer;
  v_primeiro   timestamptz;
BEGIN
  SELECT vc.identity_id, vc.expires_at INTO v_codigo
    FROM app.verification_codes vc
   WHERE vc.purpose = 'EMAIL_VERIFY'
     AND vc.code_hash = p_resumo
     AND vc.consumed_at IS NULL;
  IF NOT FOUND OR v_codigo.expires_at > p_agora THEN
    RETURN QUERY SELECT 'invalido'::text, NULL::uuid, NULL::text, NULL::text,
                        NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT i.id, i.email_norm, i.display_name, i.email_verified_at INTO v_pessoa
    FROM app.identities i
   WHERE i.id = v_codigo.identity_id AND i.anonymized_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalido'::text, NULL::uuid, NULL::text, NULL::text,
                        NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT count(*)::integer, min(vc.created_at) INTO v_quantidade, v_primeiro
    FROM app.verification_codes vc
   WHERE vc.identity_id = v_pessoa.id
     AND vc.purpose = 'EMAIL_VERIFY'
     AND vc.created_at > v_inicio;
  IF v_quantidade >= p_limite THEN
    RETURN QUERY SELECT 'limite_atingido'::text, NULL::uuid, NULL::text, NULL::text,
                        NULL::timestamptz,
                        v_primeiro + v_janela;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'liberado'::text, v_pessoa.id, v_pessoa.email_norm,
                      v_pessoa.display_name, v_pessoa.email_verified_at,
                      NULL::timestamptz;
END $$;

-- ---------------------------------------------------------------------------
-- Recuperação de senha (AC-114, AC-115)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.auth_identidade_para_recuperacao(p_email text)
RETURNS TABLE (identidade_id uuid, endereco text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT i.id, i.email_norm
    FROM app.identities i
   WHERE i.email_norm = lower(btrim(p_email))
     AND i.anonymized_at IS NULL $$;

-- Pedido novo invalida o anterior ainda aberto: só o último link vale.
CREATE OR REPLACE FUNCTION app.auth_criar_pedido_de_recuperacao(
  p_identidade uuid, p_resumo text, p_expira_em timestamptz)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM app.identities i
   WHERE i.id = p_identidade AND i.anonymized_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'identidade inexistente para a recuperacao' USING ERRCODE = 'P0002';
  END IF;
  UPDATE app.verification_codes vc
     SET consumed_at = now()
   WHERE vc.identity_id = p_identidade
     AND vc.purpose = 'PASSWORD_RESET'
     AND vc.consumed_at IS NULL;
  INSERT INTO app.verification_codes (identity_id, purpose, channel, code_hash, expires_at)
  VALUES (p_identidade, 'PASSWORD_RESET', 'EMAIL', p_resumo, p_expira_em);
END $$;

-- Consome o link, troca a senha e derruba toda sessão e todo desafio aberto,
-- numa transação só (AC-115). Receber o link prova a posse do e-mail.
CREATE OR REPLACE FUNCTION app.auth_redefinir_senha_pelo_pedido(
  p_resumo text, p_senha_hash text, p_agora timestamptz)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_codigo record;
BEGIN
  IF p_senha_hash IS NULL OR p_senha_hash NOT LIKE 'argon2id$%' THEN
    RAISE EXCEPTION 'redefinicao exige a senha derivada, nunca a senha' USING ERRCODE = '22023';
  END IF;

  SELECT vc.id, vc.identity_id, vc.expires_at INTO v_codigo
    FROM app.verification_codes vc
    JOIN app.identities i ON i.id = vc.identity_id AND i.anonymized_at IS NULL
   WHERE vc.purpose = 'PASSWORD_RESET'
     AND vc.code_hash = p_resumo
     AND vc.consumed_at IS NULL
   FOR UPDATE OF vc;
  IF NOT FOUND OR v_codigo.expires_at <= p_agora THEN
    RETURN false;
  END IF;

  UPDATE app.verification_codes vc SET consumed_at = p_agora WHERE vc.id = v_codigo.id;
  UPDATE app.identities i
     SET password_hash      = p_senha_hash,
         email_verified_at  = coalesce(i.email_verified_at, p_agora),
         failed_login_count = 0,
         locked_until       = NULL
   WHERE i.id = v_codigo.identity_id;
  UPDATE app.sessions s
     SET revoked_at = p_agora, revoked_reason = 'PASSWORD_CHANGED'
   WHERE s.identity_id = v_codigo.identity_id AND s.revoked_at IS NULL;
  UPDATE app.verification_codes vc
     SET consumed_at = p_agora
   WHERE vc.identity_id = v_codigo.identity_id
     AND vc.purpose = 'LOGIN_OTP'
     AND vc.consumed_at IS NULL;
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------
-- Execução: só a credencial que atende requisição
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION app.auth_cadastrar_identidade(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_identidade_para_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_criar_verificacao_de_email(uuid, uuid, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_criar_verificacao_por_email(uuid, text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_consumir_verificacao_de_email(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_autorizar_reenvio_de_verificacao(text, timestamptz, integer, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_identidade_para_recuperacao(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_criar_pedido_de_recuperacao(uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_redefinir_senha_pelo_pedido(text, text, timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.auth_cadastrar_identidade(text, text, text, text) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_identidade_para_login(text) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_criar_verificacao_de_email(uuid, uuid, text, timestamptz, timestamptz) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_criar_verificacao_por_email(uuid, text, text, timestamptz, timestamptz) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_consumir_verificacao_de_email(text, timestamptz) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_autorizar_reenvio_de_verificacao(text, timestamptz, integer, bigint) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_identidade_para_recuperacao(text) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_criar_pedido_de_recuperacao(uuid, text, timestamptz) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_redefinir_senha_pelo_pedido(text, text, timestamptz) TO sc_app;

RESET ROLE;
