-- ===========================================================================
-- 0054 — Loja em análise: o dono corrige os dados e reenvia (#28).
--
-- A loja que o lojista abre nasce AGUARDANDO APROVAÇÃO (0052). Enquanto ela
-- está aguardando ou foi RECUSADA, o dono pode:
--
--   - corrigir os dados do cadastro (nome, tipo de negócio, WhatsApp, cidade
--     e UF): `app.editar_loja_em_analise`;
--   - reenviar a loja recusada para nova análise: `app.reenviar_loja`, que a
--     volta para AGUARDANDO APROVAÇÃO e deixa o ato na trilha.
--
-- A credencial das lojas não escreve em `stores` fora da própria configuração
-- (0003); por isso as duas são funções com os direitos de quem as definiu,
-- que só aceitam a pessoa da sessão, dona (OWNER) da loja, e só nesses dois
-- estados. Loja aprovada, desativada ou excluída não passa por aqui.
--
-- Idempotente: funções recriadas.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- resultado: 'EDITADA', 'SEM_SESSAO', 'NAO_ENCONTRADA' (não é dona, ou a loja
-- não existe), 'ESTADO_INVALIDO' ou 'TIPO_DESCONHECIDO'.
CREATE OR REPLACE FUNCTION app.editar_loja_em_analise(
  p_slug text, p_nome text, p_vertical text,
  p_whatsapp text, p_cidade text, p_uf text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_pessoa uuid := app.current_user_id();
  v_loja   record;
  v_preset record;
BEGIN
  IF v_pessoa IS NULL THEN RETURN 'SEM_SESSAO'; END IF;

  SELECT s.id, s.status INTO v_loja
    FROM app.stores s
    JOIN app.store_members m
      ON m.store_id = s.id AND m.identity_id = v_pessoa
     AND m.role = 'OWNER' AND m.invite_accepted_at IS NOT NULL
   WHERE lower(s.slug) = lower(p_slug) AND s.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN 'NAO_ENCONTRADA'; END IF;
  IF v_loja.status NOT IN ('PENDING_APPROVAL', 'REJECTED') THEN
    RETURN 'ESTADO_INVALIDO';
  END IF;

  SELECT p.code, p.schema_version INTO v_preset
    FROM app.vertical_presets p WHERE p.code = p_vertical;
  IF NOT FOUND THEN RETURN 'TIPO_DESCONHECIDO'; END IF;

  UPDATE app.stores
     SET name = btrim(p_nome),
         vertical_code = v_preset.code,
         vertical_schema_version = v_preset.schema_version,
         whatsapp_e164 = nullif(btrim(p_whatsapp), ''),
         city = nullif(btrim(p_cidade), ''),
         uf = nullif(upper(btrim(p_uf)), '')
   WHERE id = v_loja.id;

  INSERT INTO app.audit_log
    (store_id, actor_id, actor_role, action, entity, entity_id, after_data)
  VALUES (v_loja.id, v_pessoa, 'OWNER', 'LOJA_DADOS_CORRIGIDOS', 'stores',
          v_loja.id::text, jsonb_build_object('status', v_loja.status));
  RETURN 'EDITADA';
END $$;

REVOKE ALL ON FUNCTION app.editar_loja_em_analise(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.editar_loja_em_analise(text, text, text, text, text, text) TO sc_app;

-- resultado: 'REENVIADA', 'SEM_SESSAO', 'NAO_ENCONTRADA' ou 'ESTADO_INVALIDO'
-- (só a loja RECUSADA é reenviada).
CREATE OR REPLACE FUNCTION app.reenviar_loja(p_slug text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_pessoa uuid := app.current_user_id();
  v_loja   record;
BEGIN
  IF v_pessoa IS NULL THEN RETURN 'SEM_SESSAO'; END IF;

  SELECT s.id, s.status INTO v_loja
    FROM app.stores s
    JOIN app.store_members m
      ON m.store_id = s.id AND m.identity_id = v_pessoa
     AND m.role = 'OWNER' AND m.invite_accepted_at IS NOT NULL
   WHERE lower(s.slug) = lower(p_slug) AND s.deleted_at IS NULL
   FOR UPDATE OF s;
  IF NOT FOUND THEN RETURN 'NAO_ENCONTRADA'; END IF;
  IF v_loja.status <> 'REJECTED' THEN RETURN 'ESTADO_INVALIDO'; END IF;

  UPDATE app.stores SET status = 'PENDING_APPROVAL' WHERE id = v_loja.id;

  INSERT INTO app.audit_log
    (store_id, actor_id, actor_role, action, entity, entity_id, before_data, after_data)
  VALUES (v_loja.id, v_pessoa, 'OWNER', 'LOJA_REENVIADA', 'stores',
          v_loja.id::text, jsonb_build_object('status', 'REJECTED'),
          jsonb_build_object('status', 'PENDING_APPROVAL'));
  RETURN 'REENVIADA';
END $$;

REVOKE ALL ON FUNCTION app.reenviar_loja(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reenviar_loja(text) TO sc_app;

RESET ROLE;
