-- ===========================================================================
-- 0047 — Conta única: cadastro de cliente já verificado e o "quem sou eu"
-- com todas as lojas da pessoa e a flag de administração da plataforma.
--
-- A mesma conta serve a cliente, dono, equipe e administração; o papel sai do
-- que a conta tem. O cadastro de cliente deixa de pedir confirmação de e-mail
-- (a marca de verificado é organização, não segurança) e já abre a sessão —
-- por isso a função devolve o id da identidade criada.
--
-- Compatível com a versão anterior: só cria função. Nada que já existe muda.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- Cadastro de cliente final, já com o e-mail marcado como verificado. Devolve
-- o id da conta criada, ou nulo quando o e-mail já tem conta.
CREATE OR REPLACE FUNCTION app.auth_cadastrar_cliente_verificado(
  p_email text, p_nome text, p_telefone text, p_senha_hash text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_senha_hash IS NULL OR p_senha_hash NOT LIKE 'argon2id$%' THEN
    RAISE EXCEPTION 'cadastro exige a senha derivada, nunca a senha' USING ERRCODE = '22023';
  END IF;
  INSERT INTO app.identities
    (email_norm, display_name, phone_e164, password_hash, email_verified_at)
  VALUES (lower(btrim(p_email)), p_nome, NULLIF(btrim(p_telefone), ''),
          p_senha_hash, now())
  ON CONFLICT (email_norm) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Todas as lojas em que a pessoa do contexto tem vínculo ativo, como dono OU
-- equipe, sem depender do papel declarado na sessão (`lojas_da_sessao()` só
-- devolve as do papel corrente).
CREATE OR REPLACE FUNCTION app.minhas_lojas()
RETURNS TABLE (store_slug text, store_name text, member_role text, store_status text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT s.slug, s.name, m.role, s.status
    FROM app.store_members m
    JOIN app.stores s ON s.id = m.store_id
   WHERE app.current_user_id() IS NOT NULL
     AND m.identity_id = app.current_user_id()
     AND m.role IN ('OWNER', 'STAFF')
     AND m.invite_accepted_at IS NOT NULL
     AND m.revoked_at IS NULL
     AND s.deleted_at IS NULL
     AND s.status <> 'DELETED'
   ORDER BY s.name, s.slug $$;

-- A pessoa do contexto administra a plataforma?
CREATE OR REPLACE FUNCTION app.sou_admin_da_plataforma()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT app.current_user_id() IS NOT NULL
     AND EXISTS (SELECT 1 FROM app.platform_admins a
                  WHERE a.identity_id = app.current_user_id()
                    AND a.revoked_at IS NULL) $$;

REVOKE ALL ON FUNCTION app.auth_cadastrar_cliente_verificado(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.minhas_lojas() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.sou_admin_da_plataforma() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.auth_cadastrar_cliente_verificado(text, text, text, text) TO sc_app;
GRANT EXECUTE ON FUNCTION app.minhas_lojas() TO sc_app;
GRANT EXECUTE ON FUNCTION app.sou_admin_da_plataforma() TO sc_app;

RESET ROLE;
