-- ===========================================================================
-- 0057 — O dono vê a própria loja em análise (#28).
--
-- A tela "Cadastro em análise" mostra os dados que a pessoa cadastrou e, se a
-- loja foi recusada, o motivo. A loja ainda não existe para a vitrine, então a
-- leitura é uma função com os direitos de quem a definiu, que só devolve a
-- loja da pessoa da sessão, dona (OWNER), e só enquanto ela aguarda ou foi
-- recusada.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

CREATE OR REPLACE FUNCTION app.minha_loja_em_analise(p_slug text)
RETURNS TABLE (
  nome text, vertical text, whatsapp text, cidade text, uf text,
  status text, recusa_motivo text, recusa_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT s.name, s.vertical_code, s.whatsapp_e164, s.city, s.uf, s.status,
         r.motivo, r.created_at
    FROM app.stores s
    JOIN app.store_members m
      ON m.store_id = s.id AND m.identity_id = app.current_user_id()
     AND m.role = 'OWNER' AND m.invite_accepted_at IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT a.after_data->>'motivo' AS motivo, a.created_at
        FROM app.audit_log a
       WHERE a.store_id = s.id AND a.action = 'LOJA_RECUSADA'
         AND s.status = 'REJECTED'
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 1) r ON true
   WHERE lower(s.slug) = lower(p_slug)
     AND s.deleted_at IS NULL
     AND s.status IN ('PENDING_APPROVAL', 'REJECTED')
$$;

REVOKE ALL ON FUNCTION app.minha_loja_em_analise(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.minha_loja_em_analise(text) TO sc_app;

RESET ROLE;
