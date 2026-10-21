-- ===========================================================================
-- 0073 — LGPD funcional (card #79): aceite versionado dos documentos legais e
-- direitos do titular (exportar e excluir/anonimizar os próprios dados).
--
-- 1. `app.legal_acceptances`: cada aceite de documento (termos de uso,
--    política de privacidade, termos do lojista) numa versão, com data/hora,
--    IP e user-agent. É prova de consentimento: só acrescenta (gatilho
--    `deny_mutation`) e fica mesmo depois que a conta é anonimizada.
-- 2. `app.registrar_pedido_do_titular`: grava na trilha da plataforma
--    (`audit_platform`, que o tempo de execução não alcança) que a pessoa
--    exportou os dados ou pediu a exclusão.
-- 3. `app.meus_dados_nas_lojas`: favoritos, visitas, curtidas e comentários da
--    conta, com o nome da loja, para o arquivo de exportação.
-- 4. `app.anonimizar_minha_conta`: a exclusão inteira, numa transação só e
--    com os direitos de quem a definiu, porque atravessa lojas (clientes,
--    contatos dos pedidos). Pedido NÃO é apagado: continua como registro
--    fiscal/financeiro da loja, sem nome, telefone, e-mail, documento nem
--    endereço. Dono de loja não exclui: a função devolve 'TEM_LOJA'.
--
-- Idempotente. Aplicada à mão em dev (o livro de dev está fora de ordem).
-- ===========================================================================

SET ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- Aceites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.legal_acceptances (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identity_id uuid        NOT NULL REFERENCES app.identities (id),
  -- TERMS_OF_USE | PRIVACY_POLICY | MERCHANT_TERMS
  document    text        NOT NULL,
  -- A versão do texto aceito (a data da versão, ex.: '2026-10-19').
  version     text        NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip          text,
  user_agent  text,
  -- Onde a pessoa aceitou: no cadastro ou numa renovação por versão nova.
  origin      text        NOT NULL DEFAULT 'SIGNUP',
  CONSTRAINT legal_acceptances_document_ck
    CHECK (document IN ('TERMS_OF_USE', 'PRIVACY_POLICY', 'MERCHANT_TERMS')),
  CONSTRAINT legal_acceptances_origin_ck
    CHECK (origin IN ('SIGNUP', 'RENEWAL')),
  CONSTRAINT legal_acceptances_version_ck
    CHECK (char_length(version) BETWEEN 1 AND 40)
);

CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_identity_doc_version_uk
  ON app.legal_acceptances (identity_id, document, version);

ALTER TABLE app.legal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.legal_acceptances FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_acceptances_self_select ON app.legal_acceptances;
CREATE POLICY legal_acceptances_self_select ON app.legal_acceptances FOR SELECT TO sc_app
  USING (identity_id = (SELECT app.current_user_id()));

DROP POLICY IF EXISTS legal_acceptances_self_insert ON app.legal_acceptances;
CREATE POLICY legal_acceptances_self_insert ON app.legal_acceptances FOR INSERT TO sc_app
  WITH CHECK (identity_id = (SELECT app.current_user_id()));

DROP POLICY IF EXISTS legal_acceptances_admin_select ON app.legal_acceptances;
CREATE POLICY legal_acceptances_admin_select ON app.legal_acceptances FOR SELECT TO sc_admin
  USING (true);

-- A credencial de administração grava o aceite das contas que a plataforma
-- cria sem passar pelo cadastro (carga de demonstração e convites).
DROP POLICY IF EXISTS legal_acceptances_admin_insert ON app.legal_acceptances;
CREATE POLICY legal_acceptances_admin_insert ON app.legal_acceptances FOR INSERT TO sc_admin
  WITH CHECK (true);

REVOKE UPDATE, DELETE ON app.legal_acceptances FROM sc_app, sc_admin;

DROP TRIGGER IF EXISTS legal_acceptances_append_only ON app.legal_acceptances;
CREATE TRIGGER legal_acceptances_append_only BEFORE UPDATE OR DELETE ON app.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();

-- ---------------------------------------------------------------------------
-- Pedido do titular na trilha da plataforma
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.registrar_pedido_do_titular(p_acao text, p_detalhes jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_id uuid := app.current_user_id();
BEGIN
  IF v_id IS NULL OR p_acao NOT IN
       ('LGPD_EXPORTACAO', 'LGPD_EXCLUSAO_PEDIDA', 'LGPD_EXCLUSAO_BLOQUEADA', 'LGPD_EXCLUSAO_CONCLUIDA')
  THEN
    RETURN;
  END IF;
  INSERT INTO app.audit_platform (actor_id, actor_role, action, entity, entity_id, after_data)
  VALUES (v_id, coalesce(app.current_role_name(), 'CUSTOMER'), p_acao, 'identity', v_id::text, p_detalhes);
END $$;

REVOKE ALL ON FUNCTION app.registrar_pedido_do_titular(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.registrar_pedido_do_titular(text, jsonb) TO sc_app, sc_admin;

-- ---------------------------------------------------------------------------
-- Exportação: o que a pessoa fez nas lojas, com o nome delas
-- ---------------------------------------------------------------------------
-- Favoritos, visitas, curtidas e comentários apontam para lojas e produtos que
-- a credencial da pessoa não lê sem loja no contexto. A função devolve só o
-- que é DA conta do contexto, já com o nome da loja e do produto.
CREATE OR REPLACE FUNCTION app.meus_dados_nas_lojas()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT jsonb_build_object(
    'lojasFavoritas', coalesce((
      SELECT jsonb_agg(jsonb_build_object('loja', s.name, 'apelido', s.slug,
                                          'desde', f.created_at) ORDER BY f.created_at DESC)
        FROM app.favorite_stores f JOIN app.stores s ON s.id = f.store_id
       WHERE f.identity_id = app.current_user_id()), '[]'::jsonb),
    'produtosFavoritos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('produto', p.name, 'loja', s.name,
                                          'apelido', s.slug, 'desde', f.created_at)
                       ORDER BY f.created_at DESC)
        FROM app.favorite_products f
        JOIN app.products p ON p.id = f.product_id
        JOIN app.stores s ON s.id = f.store_id
       WHERE f.identity_id = app.current_user_id()), '[]'::jsonb),
    'lojasVisitadas', coalesce((
      SELECT jsonb_agg(jsonb_build_object('loja', s.name, 'apelido', s.slug,
                                          'primeiraVisita', v.first_visited_at,
                                          'ultimaVisita', v.last_visited_at,
                                          'visitas', v.visit_count)
                       ORDER BY v.last_visited_at DESC)
        FROM app.store_visits v JOIN app.stores s ON s.id = v.store_id
       WHERE v.identity_id = app.current_user_id()), '[]'::jsonb),
    'curtidas', jsonb_build_object(
      'produtos', coalesce((
        SELECT jsonb_agg(jsonb_build_object('produto', p.name, 'loja', s.name, 'em', l.created_at)
                         ORDER BY l.created_at DESC)
          FROM app.product_likes l
          JOIN app.products p ON p.id = l.product_id
          JOIN app.stores s ON s.id = l.store_id
         WHERE l.identity_id = app.current_user_id()), '[]'::jsonb),
      'lojas', coalesce((
        SELECT jsonb_agg(jsonb_build_object('loja', s.name, 'em', l.created_at)
                         ORDER BY l.created_at DESC)
          FROM app.store_likes l JOIN app.stores s ON s.id = l.store_id
         WHERE l.identity_id = app.current_user_id()), '[]'::jsonb)),
    'comentarios', coalesce((
      SELECT jsonb_agg(jsonb_build_object('texto', c.body, 'situacao', c.status,
                                          'loja', s.name, 'produto', p.name,
                                          'em', c.created_at)
                       ORDER BY c.created_at DESC)
        FROM app.comments c
        JOIN app.stores s ON s.id = c.store_id
        LEFT JOIN app.products p ON p.id = c.product_id
       WHERE c.identity_id = app.current_user_id()), '[]'::jsonb)
  )
   WHERE app.current_user_id() IS NOT NULL
$$;

REVOKE ALL ON FUNCTION app.meus_dados_nas_lojas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.meus_dados_nas_lojas() TO sc_app;

-- ---------------------------------------------------------------------------
-- Exclusão = anonimização
-- ---------------------------------------------------------------------------
-- Devolve 'OK', 'SEM_SESSAO', 'TEM_LOJA' (dono de loja) ou 'E_ADMIN'
-- (administração da plataforma). Só mexe na conta do contexto.
CREATE OR REPLACE FUNCTION app.anonimizar_minha_conta(p_ip text, p_user_agent text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_id uuid := app.current_user_id();
  v_detalhe jsonb := jsonb_build_object('ip', p_ip, 'userAgent', left(coalesce(p_user_agent, ''), 300));
BEGIN
  IF v_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM app.identities WHERE id = v_id AND anonymized_at IS NULL)
  THEN
    RETURN 'SEM_SESSAO';
  END IF;

  PERFORM app.registrar_pedido_do_titular('LGPD_EXCLUSAO_PEDIDA', v_detalhe);

  -- Dono de loja não some deixando a loja sem responsável.
  IF EXISTS (
       SELECT 1 FROM app.store_members m
         JOIN app.stores s ON s.id = m.store_id
        WHERE m.identity_id = v_id AND m.role = 'OWNER' AND m.revoked_at IS NULL
          AND s.deleted_at IS NULL AND s.status <> 'DELETED')
  THEN
    PERFORM app.registrar_pedido_do_titular(
      'LGPD_EXCLUSAO_BLOQUEADA', v_detalhe || '{"motivo":"dono_de_loja"}'::jsonb);
    RETURN 'TEM_LOJA';
  END IF;
  IF EXISTS (SELECT 1 FROM app.platform_admins WHERE identity_id = v_id AND revoked_at IS NULL) THEN
    PERFORM app.registrar_pedido_do_titular(
      'LGPD_EXCLUSAO_BLOQUEADA', v_detalhe || '{"motivo":"administracao"}'::jsonb);
    RETURN 'E_ADMIN';
  END IF;

  -- Acesso: tudo encerrado.
  UPDATE app.sessions SET revoked_at = now(), revoked_reason = 'LOGOUT_ALL'
   WHERE identity_id = v_id AND revoked_at IS NULL;
  UPDATE app.totp_credentials SET disabled_at = now()
   WHERE identity_id = v_id AND disabled_at IS NULL;
  DELETE FROM app.recovery_codes WHERE identity_id = v_id;
  DELETE FROM app.verification_codes WHERE identity_id = v_id;
  -- Equipe de loja: sai do vínculo (o dono da loja segue com ela).
  UPDATE app.store_members SET revoked_at = now()
   WHERE identity_id = v_id AND revoked_at IS NULL;

  -- Dados e atividade da pessoa.
  DELETE FROM app.customer_addresses WHERE identity_id = v_id;
  DELETE FROM app.favorite_stores WHERE identity_id = v_id;
  DELETE FROM app.favorite_products WHERE identity_id = v_id;
  DELETE FROM app.store_visits WHERE identity_id = v_id;
  DELETE FROM app.product_likes WHERE identity_id = v_id;
  DELETE FROM app.store_likes WHERE identity_id = v_id;
  DELETE FROM app.comment_reports WHERE identity_id = v_id;
  DELETE FROM app.comment_blocks WHERE identity_id = v_id;
  DELETE FROM app.comments WHERE identity_id = v_id;

  -- Pedidos ficam (registro fiscal e financeiro da loja), sem dado pessoal.
  UPDATE app.order_contacts oc
     SET name = 'Cliente removido', phone_e164 = '', phone_hmac = NULL,
         email = NULL, doc_number = NULL, recipient_name = NULL,
         street = NULL, number = NULL, complement = NULL, neighborhood = NULL,
         city = NULL, uf = NULL, zip = NULL, reference_point = NULL,
         lat = NULL, lng = NULL, anonymized_at = now()
   WHERE oc.order_id IN (
           SELECT o.id FROM app.orders o
             JOIN app.store_customers c ON c.id = o.store_customer_id
            WHERE c.identity_id = v_id);
  UPDATE app.orders o
     SET customer_note = NULL
    FROM app.store_customers c
   WHERE c.id = o.store_customer_id AND c.identity_id = v_id
     AND o.customer_note IS NOT NULL;
  UPDATE app.store_customers
     SET display_name = NULL, phone_e164 = NULL, phone_hmac = NULL, email = NULL,
         doc_number = NULL, birth_date = NULL, notes = NULL, address = NULL,
         anonymized_at = now()
   WHERE identity_id = v_id;

  -- A conta: a linha fica, esvaziada (os pedidos e a trilha apontam para ela).
  UPDATE app.identities
     SET display_name = NULL, phone_e164 = NULL, cpf = NULL,
         accepts_offers = false, password_hash = NULL,
         email_norm = 'excluida-' || id::text || '@conta-excluida.invalid',
         anonymized_at = now()
   WHERE id = v_id;

  PERFORM app.registrar_pedido_do_titular('LGPD_EXCLUSAO_CONCLUIDA', v_detalhe);
  RETURN 'OK';
END $$;

REVOKE ALL ON FUNCTION app.anonimizar_minha_conta(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.anonimizar_minha_conta(text, text) TO sc_app;

RESET ROLE;
