-- ===========================================================================
-- 0032 — Administração de lojas (feature admin-lojas, T-200 a T-206).
--
-- Quem coloca uma loja no ar é a administração da plataforma, pela credencial
-- `sc_admin`. Esta migração não cria tabela: ela dá ao cadastro o que faltava
-- para ser feito de uma vez só e sem voltar atrás.
--
--   1. O convite do dono mora no vínculo dele com a loja. Só o RESUMO do token
--      é guardado: guardar o token em claro transformaria uma leitura indevida
--      do banco em acesso imediato à loja.
--   2. O código de atendimento (`0002`, herdado do primeiro SimpleClick) é
--      sequencial e sai de uma função com trava, para que dois cadastros ao
--      mesmo tempo não disputem o mesmo número.
--   3. O apelido antigo continua levando à loja depois da troca (AC-208). O
--      histórico fica em `store_domains` com o tipo LEGACY_SLUG, como o modelo
--      de dados previu, e é lido por uma função com lista fechada de campos —
--      a mesma solução de `resolve_store` para o ovo e a galinha.
--   4. Apelido e documento deixam de ser alteráveis pela credencial das lojas:
--      pertencem à administração (AC-921) e trocar o apelido sem guardar o
--      antigo quebraria o link já compartilhado com os clientes.
--
-- Compatível com a versão anterior: só acrescenta colunas que aceitam nulo,
-- funções novas e retira privilégio que nenhuma rota do dono usa.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- 1. Convite do dono
-- ---------------------------------------------------------------------------
ALTER TABLE app.store_members
  ADD COLUMN IF NOT EXISTS invite_token_hash text,
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;

-- Achar o convite pelo resumo do token acontece antes de existir sessão, na
-- tela de definir a primeira senha. Parcial porque convite aceito deixa de ter
-- resumo, e o índice só precisa dos que ainda estão abertos.
CREATE INDEX IF NOT EXISTS store_members_convite_ix
  ON app.store_members (invite_token_hash)
  WHERE invite_token_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Código sequencial de atendimento
-- ---------------------------------------------------------------------------
-- Maior número já usado + 1, com quatro dígitos no mínimo. Conta também loja
-- excluída: código de atendimento não é reaproveitado, senão o histórico de
-- suporte de uma loja apontaria para outra.
--
-- Roda com os direitos de quem chama (sc_admin, que enxerga todas as lojas por
-- política explícita). Pela credencial das lojas ela enxergaria só a própria e
-- devolveria número repetido — por isso a execução é só da administração.
CREATE OR REPLACE FUNCTION app.proximo_codigo_de_loja()
RETURNS text
LANGUAGE plpgsql VOLATILE
SET search_path = app, pg_temp
AS $$
DECLARE
  proximo bigint;
BEGIN
  -- Trava da transação: o segundo cadastro simultâneo espera o primeiro
  -- gravar, e então enxerga o número que ele usou.
  PERFORM pg_advisory_xact_lock(8310032);
  SELECT coalesce(max((regexp_match(code, '(\d+)$'))[1]::bigint), 0) + 1
    INTO proximo
    FROM app.stores;
  RETURN lpad(proximo::text, 4, '0');
END $$;

REVOKE ALL ON FUNCTION app.proximo_codigo_de_loja() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.proximo_codigo_de_loja() TO sc_admin;

-- ---------------------------------------------------------------------------
-- 3. Apelido antigo leva ao atual (AC-208)
-- ---------------------------------------------------------------------------
-- Devolve só o apelido ATUAL de uma loja no ar cujo apelido antigo é o
-- informado. Loja suspensa ou excluída não redireciona: dizer para onde ela
-- foi contaria que ela existe, que é o que a vitrine não conta (AC-402).
CREATE OR REPLACE FUNCTION app.resolve_legacy_slug(p_slug text)
RETURNS TABLE (slug text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$ SELECT s.slug
        FROM app.store_domains d
        JOIN app.stores s ON s.id = d.store_id
       WHERE d.kind = 'LEGACY_SLUG'
         AND p_slug IS NOT NULL
         AND lower(d.host) = lower(p_slug)
         AND s.deleted_at IS NULL
         AND s.status = 'ACTIVE'
       LIMIT 1 $$;

REVOKE ALL ON FUNCTION app.resolve_legacy_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_legacy_slug(text) TO sc_app, sc_admin;

-- ---------------------------------------------------------------------------
-- 4. Apelido e documento são da administração
-- ---------------------------------------------------------------------------
-- A concessão de 0003 é por coluna, então a retirada também é: tirar só estas
-- três deixa o dono alterando o resto do cadastro que é dele.
REVOKE UPDATE (slug, doc_number, doc_type) ON app.stores FROM sc_app;
