-- ===========================================================================
-- 0075 — Conta desativável (T-1 do #170: gestão geral de pessoas pela
-- administração da plataforma).
--
-- A administração passa a poder DESATIVAR uma conta e reativá-la depois. Uma
-- conta desativada não entra, não renova a sessão, não recupera a senha, não
-- aceita convite e deixa de ser equipe de qualquer loja (as políticas de
-- isolamento perguntam a `app.is_store_staff()`). Nada se apaga: a pessoa, o
-- histórico e os vínculos continuam onde estão, e reativar devolve o acesso.
--
-- O QUE MUDA, e só isto (expand-only: nenhum DROP de função, de coluna ou de
-- dado; a API antiga continua funcionando com o banco novo, porque a coluna
-- nasce nula e todo caminho antigo trata "nula" como "ativa"):
--
--   1. `identities.disabled_at` e `verification_codes.issued_by` — duas colunas
--      nulas, sem valor padrão e sem preenchimento do que já existe;
--   2. `sessions_motivo_ck` ganha `ACCOUNT_DISABLED` (um superconjunto do que
--      já valia: nenhuma linha existente deixa de passar);
--   3. oito funções ganham `disabled_at IS NULL`, com assinatura, tipo de
--      retorno, volatilidade, PARALLEL SAFE, dono, `search_path` e permissões
--      idênticos aos de 0041, 0045 e 0046:
--        auth_identidade_para_login, auth_identidade_para_recuperacao,
--        auth_criar_pedido_de_recuperacao, auth_redefinir_senha_pelo_pedido,
--        auth_criar_sessao, auth_rotacionar_sessao, auth_aceitar_convite e
--        is_store_staff;
--   4. um gatilho que só deixa `sc_admin` e `sc_migrator` mexerem em
--      `disabled_at`;
--   5. o link de uso único que a administração gera (`issued_by`) deixa
--      `ACESSO_USADO` na trilha da plataforma quando a pessoa o usa, e quem
--      define a senha por convite consome o link pendente (e o contrário).
--
-- A ORDEM DE TRAVA É UMA SÓ: IDENTIDADE PRIMEIRO. Desativar uma conta trava a
-- identidade e depois revoga as sessões dela. Se renovar a sessão, redefinir a
-- senha ou aceitar o convite travassem a sessão, o link ou o vínculo ANTES da
-- identidade, as duas pontas se esperariam — e o PostgreSQL derrubaria uma
-- delas com deadlock (40P01), que viraria erro 500. Por isso cada função
-- abaixo lê, sem trava, só de quem é o token, o link ou o convite, trava a
-- identidade e só então trava o resto, conferindo de novo o que leu. A trava é
-- FOR SHARE onde a função só precisa que a conta não mude durante a
-- operação (abrir e renovar sessão: várias sessões da mesma pessoa renovam em
-- paralelo) e FOR UPDATE onde ela altera a própria identidade.
--
-- Depois de esperar a trava, o PostgreSQL reavalia a condição sobre a versão
-- NOVA da linha (READ COMMITTED): quem esperava uma desativação encontra
-- `disabled_at` preenchida e recusa. Nenhuma sessão fica viva depois de a
-- desativação confirmar, em qualquer ordem de chegada.
--
-- NADA AQUI REVELA SE A CONTA EXISTE. Conta desativada responde igual a conta
-- inexistente nas consultas por e-mail (a lista volta vazia) e `false` nos
-- passos por token; o motivo só é dito a quem é da administração.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- 1. Colunas novas (nulas, sem padrão, sem preenchimento)
-- ---------------------------------------------------------------------------
ALTER TABLE app.identities
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz;

-- Quem da administração gerou o link de uso único. Nulo no link que a própria
-- pessoa pediu pela tela de recuperação: é isso que separa os dois no
-- momento do uso (ACESSO_USADO só existe para o primeiro).
ALTER TABLE app.verification_codes
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES app.identities (id);

-- Só o link de redefinição tem emissor. Quem inserisse `issued_by` num
-- desafio de entrada ou numa verificação de e-mail estaria fabricando um
-- "acesso da administração" que o uso nunca poderia auditar.
ALTER TABLE app.verification_codes
  ADD CONSTRAINT verification_codes_emissor_ck
  CHECK (issued_by IS NULL OR purpose = 'PASSWORD_RESET') NOT VALID;
ALTER TABLE app.verification_codes
  VALIDATE CONSTRAINT verification_codes_emissor_ck;

-- ---------------------------------------------------------------------------
-- 2. Motivo de revogação: ACCOUNT_DISABLED
-- ---------------------------------------------------------------------------
-- Superconjunto do que já valia. NOT VALID + VALIDATE: o ADD só olha as linhas
-- novas e a conferência das antigas roda com a trava mais fraca.
ALTER TABLE app.sessions DROP CONSTRAINT IF EXISTS sessions_motivo_ck;
ALTER TABLE app.sessions
  ADD CONSTRAINT sessions_motivo_ck CHECK (
    (revoked_at IS NULL AND revoked_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_reason IN
        ('LOGOUT', 'LOGOUT_ALL', 'REUSE_DETECTED', 'PASSWORD_CHANGED',
         'ROLE_CHANGED', 'ADMIN_REVOKED', 'ACCOUNT_DISABLED'))) NOT VALID;
ALTER TABLE app.sessions VALIDATE CONSTRAINT sessions_motivo_ck;

-- ---------------------------------------------------------------------------
-- 3. Gatilho: só a administração desativa e reativa
-- ---------------------------------------------------------------------------
-- A política `identities_self_update` deixa a pessoa alterar a própria linha, e
-- `sc_app` tem UPDATE na tabela: sem este gatilho, quem tivesse a conta
-- desativada poderia reativar a si mesma (ou desativar outra, com uma falha de
-- injeção). Roda como QUEM CHAMA — por isso `current_user` é o papel de quem
-- está alterando: `sc_admin` (a administração) ou `sc_migrator` (o dono das
-- funções definer e do aplicador de migrações). Qualquer outro, inclusive
-- `sc_app`, é recusado; e o gatilho só dispara quando o valor muda de fato,
-- para um UPDATE que repete `disabled_at` (um UPSERT, um ORM) não ser barrado.
CREATE OR REPLACE FUNCTION app.conta_desativada_so_pela_administracao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('sc_admin', 'sc_migrator') THEN
    RAISE EXCEPTION 'desativar ou reativar uma conta e ato da administracao da plataforma'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS identities_desativacao_so_da_administracao ON app.identities;
CREATE TRIGGER identities_desativacao_so_da_administracao
  BEFORE UPDATE OF disabled_at ON app.identities
  FOR EACH ROW
  WHEN (OLD.disabled_at IS DISTINCT FROM NEW.disabled_at)
  EXECUTE FUNCTION app.conta_desativada_so_pela_administracao();

-- ---------------------------------------------------------------------------
-- 4. Login e recuperação: conta desativada some das consultas por e-mail
-- ---------------------------------------------------------------------------
-- Mesma lista de campos de 0045. A conta desativada devolve ZERO linhas — igual
-- à conta que não existe —, então a tela de entrada responde "e-mail ou senha
-- incorretos" e a de recuperação responde o texto neutro de sempre.
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
     AND i.anonymized_at IS NULL
     AND i.disabled_at IS NULL $$;

CREATE OR REPLACE FUNCTION app.auth_identidade_para_recuperacao(p_email text)
RETURNS TABLE (identidade_id uuid, endereco text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT i.id, i.email_norm
    FROM app.identities i
   WHERE i.email_norm = lower(btrim(p_email))
     AND i.anonymized_at IS NULL
     AND i.disabled_at IS NULL $$;

-- Pedido novo invalida o anterior ainda aberto: só o último link vale. Já
-- travava a identidade antes de tocar nos códigos (a ordem certa); agora a
-- conta desativada também não tem pedido a abrir (P0002 — quem chama responde
-- o texto neutro, e não um erro).
CREATE OR REPLACE FUNCTION app.auth_criar_pedido_de_recuperacao(
  p_identidade uuid, p_resumo text, p_expira_em timestamptz)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM app.identities i
   WHERE i.id = p_identidade AND i.anonymized_at IS NULL AND i.disabled_at IS NULL
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

-- ---------------------------------------------------------------------------
-- 5. Redefinir a senha pelo link: identidade primeiro, e ACESSO_USADO
-- ---------------------------------------------------------------------------
-- Em 0045 esta função travava o LINK e depois a identidade — a ordem inversa
-- da de `auth_criar_pedido_de_recuperacao` e da desativação, e a receita de um
-- deadlock. Agora: descobre de quem é o link sem travar, trava a identidade,
-- trava o link e confere de novo que ele continua pendente.
--
-- Link gerado pela administração (`issued_by` preenchido) deixa ACESSO_USADO na
-- trilha da plataforma: quem agiu é a PESSOA (papel CUSTOMER, o que ela é antes
-- de a sessão existir), porque foi ela quem usou. A trilha guarda o fato, nunca
-- o link nem o resumo dele. O link que a própria pessoa pediu não deixa nada.
CREATE OR REPLACE FUNCTION app.auth_redefinir_senha_pelo_pedido(
  p_resumo text, p_senha_hash text, p_agora timestamptz)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_identidade uuid;
  v_codigo     record;
BEGIN
  IF p_senha_hash IS NULL OR p_senha_hash NOT LIKE 'argon2id$%' THEN
    RAISE EXCEPTION 'redefinicao exige a senha derivada, nunca a senha' USING ERRCODE = '22023';
  END IF;

  -- 1) De quem é o link — sem trava.
  SELECT vc.identity_id INTO v_identidade
    FROM app.verification_codes vc
   WHERE vc.purpose = 'PASSWORD_RESET'
     AND vc.code_hash = p_resumo
     AND vc.consumed_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 2) A identidade, primeiro. Conta anonimizada ou desativada: recusa.
  PERFORM 1 FROM app.identities i
   WHERE i.id = v_identidade AND i.anonymized_at IS NULL AND i.disabled_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 3) O link, já com a identidade travada: se alguém o consumiu enquanto a
  --    trava era esperada, ele deixou de estar pendente e a busca volta vazia.
  SELECT vc.id, vc.expires_at, vc.issued_by INTO v_codigo
    FROM app.verification_codes vc
   WHERE vc.purpose = 'PASSWORD_RESET'
     AND vc.code_hash = p_resumo
     AND vc.identity_id = v_identidade
     AND vc.consumed_at IS NULL
   FOR UPDATE;
  IF NOT FOUND OR v_codigo.expires_at <= p_agora THEN
    RETURN false;
  END IF;

  UPDATE app.verification_codes vc SET consumed_at = p_agora WHERE vc.id = v_codigo.id;
  UPDATE app.identities i
     SET password_hash      = p_senha_hash,
         email_verified_at  = coalesce(i.email_verified_at, p_agora),
         failed_login_count = 0,
         locked_until       = NULL
   WHERE i.id = v_identidade;
  UPDATE app.sessions s
     SET revoked_at = p_agora, revoked_reason = 'PASSWORD_CHANGED'
   WHERE s.identity_id = v_identidade AND s.revoked_at IS NULL;
  UPDATE app.verification_codes vc
     SET consumed_at = p_agora
   WHERE vc.identity_id = v_identidade
     AND vc.purpose = 'LOGIN_OTP'
     AND vc.consumed_at IS NULL;

  IF v_codigo.issued_by IS NOT NULL THEN
    INSERT INTO app.audit_platform (actor_id, actor_role, action, entity, entity_id)
    VALUES (v_identidade, 'CUSTOMER', 'ACESSO_USADO', 'identities', v_identidade::text);
  END IF;
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Sessão: abrir e renovar com a identidade travada primeiro
-- ---------------------------------------------------------------------------
-- Abrir a sessão trava a identidade FOR SHARE: a desativação (FOR UPDATE) ou
-- vem antes e esta função recusa, ou vem depois e revoga a sessão que acabou
-- de nascer. Não existe terceira ordem.
CREATE OR REPLACE FUNCTION app.auth_criar_sessao(
  p_id uuid, p_familia uuid, p_identidade uuid, p_papel text, p_cliente text,
  p_resumo text, p_criada_em timestamptz, p_expira_em timestamptz)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM app.identities i
   WHERE i.id = p_identidade AND i.anonymized_at IS NULL AND i.disabled_at IS NULL
   FOR SHARE;
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

-- Consome o token atual e cria o sucessor numa transação (0046). Mudou: a
-- identidade é travada (FOR SHARE) ANTES da linha da sessão — o INSERT do
-- sucessor já travava a identidade por baixo (chave estrangeira), mas só
-- depois de a sessão estar travada, que é a ordem inversa da desativação.
-- Conta desativada: 'recusada', igual ao token vencido ou revogado.
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
  v_dono       uuid;
  v_sessao     record;
  v_derrubadas integer;
BEGIN
  -- De quem é o token — sem trava. `identity_id` nunca muda (gatilho de 0044).
  SELECT s.identity_id INTO v_dono
    FROM app.sessions s
   WHERE s.token_sha256 = p_resumo;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'recusada'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
                        NULL::uuid, NULL::timestamptz, NULL::timestamptz,
                        NULL::timestamptz, NULL::timestamptz, NULL::boolean;
    RETURN;
  END IF;

  -- A identidade primeiro. Sem filtro aqui: a recusa por conta desativada ou
  -- anonimizada vem abaixo, na ordem de sempre (o reuso de um token já
  -- consumido continua derrubando a família mesmo numa conta assim).
  PERFORM 1 FROM app.identities i WHERE i.id = v_dono FOR SHARE;

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
                     WHERE i.id = v_sessao.identity_id
                       AND i.anonymized_at IS NULL
                       AND i.disabled_at IS NULL) THEN
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

-- ---------------------------------------------------------------------------
-- 7. Convite do dono: identidade primeiro, e o link pendente cai junto
-- ---------------------------------------------------------------------------
-- Aceitar o convite define a senha da pessoa. Um link de uso único gerado pela
-- administração e ainda pendente passaria a valer contra a senha NOVA — então
-- é consumido aqui. (O inverso — gerar o link consome os convites pendentes —
-- é da rota da administração, que o faz na mesma transação.)
--
-- Em 0046 travava o VÍNCULO e depois a identidade: a ordem inversa da
-- desativação. Agora: de quem é o convite (sem trava), a identidade, e só então
-- o vínculo, conferido de novo. Conta desativada: `false`, igual a convite
-- inválido ou vencido.
CREATE OR REPLACE FUNCTION app.auth_aceitar_convite(
  p_resumo text, p_senha_hash text, p_agora timestamptz)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_identidade uuid;
  v_vinculo    record;
BEGIN
  IF p_senha_hash IS NULL OR p_senha_hash NOT LIKE 'argon2id$%' THEN
    RAISE EXCEPTION 'convite exige a senha derivada, nunca a senha' USING ERRCODE = '22023';
  END IF;

  -- 1) De quem é o convite — sem trava.
  SELECT m.identity_id INTO v_identidade
    FROM app.store_members m
   WHERE m.invite_token_hash = p_resumo
     AND m.invite_accepted_at IS NULL
     AND m.revoked_at IS NULL
     AND m.invite_expires_at > p_agora;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 2) A identidade, primeiro.
  PERFORM 1 FROM app.identities i
   WHERE i.id = v_identidade AND i.anonymized_at IS NULL AND i.disabled_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 3) O vínculo, com a identidade já travada, conferindo de novo tudo o que
  --    a leitura sem trava viu.
  SELECT m.id, m.store_id, m.identity_id INTO v_vinculo
    FROM app.store_members m
    JOIN app.stores s ON s.id = m.store_id AND s.deleted_at IS NULL
   WHERE m.invite_token_hash = p_resumo
     AND m.identity_id = v_identidade
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
  UPDATE app.verification_codes vc
     SET consumed_at = p_agora
   WHERE vc.identity_id = v_vinculo.identity_id
     AND vc.purpose = 'PASSWORD_RESET'
     AND vc.consumed_at IS NULL;
  UPDATE app.sessions s
     SET revoked_at = p_agora, revoked_reason = 'ROLE_CHANGED'
   WHERE s.identity_id = v_vinculo.identity_id AND s.revoked_at IS NULL;
  INSERT INTO app.audit_log (store_id, actor_id, actor_role, action, entity, entity_id)
  VALUES (v_vinculo.store_id, v_vinculo.identity_id, 'OWNER', 'CONVITE_ACEITO',
          'store_members', v_vinculo.id::text);
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Equipe da loja: o vínculo ativo é de uma conta ATIVA
-- ---------------------------------------------------------------------------
-- A mesma função de 0041 (SQL, estável, segura para paralelismo, definer do
-- migrador, caminho de busca fixo, executável só por `sc_app` e `sc_admin`),
-- com a junção à identidade. Conta desativada deixa de ser equipe NA HORA, em
-- todas as políticas que chamam `is_store_staff()` e em quem lê a própria
-- loja pela rota: lê zero linhas. A junção é pela chave primária e entra na
-- mesma consulta do vínculo, então não acrescenta uma segunda ida ao banco.
CREATE OR REPLACE FUNCTION app.is_store_staff() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE SECURITY DEFINER
  SET search_path = app, pg_temp AS
$$ SELECT app.current_role_name() IN ('OWNER', 'STAFF')
      AND app.current_store_id() IS NOT NULL
      AND app.current_user_id() IS NOT NULL
      AND EXISTS (
            SELECT 1
              FROM app.store_members m
              JOIN app.identities i ON i.id = m.identity_id
             WHERE m.store_id           = app.current_store_id()
               AND m.identity_id        = app.current_user_id()
               AND m.role               = app.current_role_name()
               AND m.invite_accepted_at IS NOT NULL
               AND m.revoked_at         IS NULL
               AND i.disabled_at        IS NULL) $$;

-- ---------------------------------------------------------------------------
-- Execução: as mesmas permissões de antes
-- ---------------------------------------------------------------------------
-- `CREATE OR REPLACE` já preserva dono e permissões; repetir o que 0041, 0045 e
-- 0046 concederam deixa o resultado à vista e idêntico mesmo que alguém tenha
-- mexido nelas no meio do caminho.
REVOKE ALL ON FUNCTION app.auth_identidade_para_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_identidade_para_recuperacao(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_criar_pedido_de_recuperacao(uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_redefinir_senha_pelo_pedido(text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_criar_sessao(uuid, uuid, uuid, text, text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_rotacionar_sessao(text, uuid, text, timestamptz, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_aceitar_convite(text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_store_staff() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.auth_identidade_para_login(text) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_identidade_para_recuperacao(text) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_criar_pedido_de_recuperacao(uuid, text, timestamptz) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_redefinir_senha_pelo_pedido(text, text, timestamptz) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_criar_sessao(uuid, uuid, uuid, text, text, text, timestamptz, timestamptz) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_rotacionar_sessao(text, uuid, text, timestamptz, timestamptz, timestamptz) TO sc_app;
GRANT EXECUTE ON FUNCTION app.auth_aceitar_convite(text, text, timestamptz) TO sc_app;
GRANT EXECUTE ON FUNCTION app.is_store_staff() TO sc_app, sc_admin;

RESET ROLE;
