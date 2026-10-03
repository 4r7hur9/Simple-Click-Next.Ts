-- ===========================================================================
-- 0041 — Equipe da loja é quem tem vínculo ATIVO com ela (dívida 92).
--
-- `app.is_store_staff()` nasceu em 0001 conferindo só o PAPEL da sessão:
-- `app.role` em OWNER ou STAFF. As 117 políticas de equipe que a chamam
-- separam uma loja da outra DENTRO da transação — mas a pergunta anterior,
-- "esta pessoa é da loja que a transação declarou?", ninguém fazia. O efeito
-- medido na T-313: um token de dono válido administra QUALQUER loja ativa,
-- bastando trocar o apelido na URL, porque a rota resolve a loja pelo apelido
-- e abre a transação com o papel OWNER.
--
-- A regra passa a morar NA FUNÇÃO, e não em cada política: as 117 ganham a
-- condição de uma vez, e a política nova que chamar `is_store_staff()` já
-- nasce com ela. Equipe é quem tem, em `app.store_members`, uma linha da loja
-- corrente, da identidade corrente, com o MESMO papel da sessão (um STAFF com
-- token de OWNER não é dono), convite aceito e sem revogação.
--
-- POR QUE `SECURITY DEFINER`. A política de `store_members` também chama esta
-- função; uma função que lê `store_members` sob a política de `store_members`
-- recursa. Rodando com os direitos de quem a definiu — `sc_migrator`, a única
-- credencial com BYPASSRLS —, a leitura do vínculo não passa pela política. É
-- o mesmo arranjo de `app.resolve_store` (0003) e `app.meus_pedidos` (0029):
-- caminho de busca fixo, para que ninguém plante um `app` de mentira à frente,
-- e lista fechada do que ela devolve — um booleano.
--
-- A guarda G10 cobra, de toda função com direitos de quem a definiu, o dono
-- migrador e o caminho de busca fixo.
--
-- Compatível com a versão anterior nos dois sentidos: a API antiga com esta
-- função só perde o que nunca deveria ter tido (dono sem vínculo passa a ver
-- zero linhas — fecha, não abre); a API nova com a função antiga continua
-- funcionando, porque a guarda central dela pergunta `SELECT is_store_staff()`
-- e a resposta antiga é a de sempre.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

CREATE OR REPLACE FUNCTION app.is_store_staff() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE SECURITY DEFINER
  SET search_path = app, pg_temp AS
$$ SELECT app.current_role_name() IN ('OWNER', 'STAFF')
      AND app.current_store_id() IS NOT NULL
      AND app.current_user_id() IS NOT NULL
      AND EXISTS (
            SELECT 1
              FROM app.store_members m
             WHERE m.store_id           = app.current_store_id()
               AND m.identity_id        = app.current_user_id()
               AND m.role               = app.current_role_name()
               AND m.invite_accepted_at IS NOT NULL
               AND m.revoked_at         IS NULL) $$;

-- Executável só por quem atende requisição: é o que as políticas usam.
REVOKE ALL ON FUNCTION app.is_store_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_store_staff() TO sc_app, sc_admin;

RESET ROLE;
