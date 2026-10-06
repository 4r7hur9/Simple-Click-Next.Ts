-- ===========================================================================
-- 0038 — Pareamento do agente de impressão e a chave do modo automático
-- (T-608: AC-622, AC-623, AC-626; o aviso de AC-624).
--
-- A 0034 criou a fila e o agente; faltava COMO o agente nasce e COMO ele se
-- apresenta. Três peças, todas pelo caminho mais estreito possível:
--
--   * `print_pairing_codes` — o código curto (6 dígitos) que o dono gera no
--     painel e digita no agente. Validade curta, UM código aberto por loja, e
--     um limite de tentativas erradas que vale AQUI, no banco, mesmo que o
--     limitador da borda (Redis) esteja de pé ou não. Só o resumo sha256 do
--     código é guardado, salgado com a loja.
--   * `parear_agente_de_impressao` — troca o código certo por um agente novo,
--     com o resumo da credencial longa que a API sorteou e entrega UMA vez. É
--     chamada com o papel da vitrine (o agente ainda não tem identidade
--     nenhuma), por isso roda com os direitos de quem a definiu e devolve só o
--     identificador do agente e o desfecho.
--   * `agente_pela_credencial` — o agente se apresenta com a credencial; a
--     API calcula o resumo e pergunta aqui de qual agente e de qual loja ele
--     é, ANTES de existir contexto de loja. Agente revogado, ou de loja que
--     não está ativa, não existe.
--   * `impressao_automatica_ligada` — o papel do agente não lê a configuração
--     da loja; a reivindicação pergunta aqui se o automático está ligado e,
--     desligado, não entrega nada (AC-626).
--
-- UMA IMPRESSORA POR LOJA (decisão de 03/10, Q-601 aberta): parear um agente
-- novo revoga os anteriores da loja. Parear de novo é o caminho de quem
-- perdeu a credencial ou trocou de computador, e o agente velho para de
-- reivindicar na mesma hora — o que também fecha a janela de duas folhas que a
-- 0034 registrou para dois agentes com confirmação perdida.
--
-- Compatível com a versão anterior: só cria tabela e função. A aplicação
-- antiga não conhece nenhuma delas. Reaplicável: `IF NOT EXISTS`, `OR
-- REPLACE` e política recriada.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- Códigos de pareamento
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.print_pairing_codes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  -- sha256 de "<loja>:<código>". O código tem só seis dígitos, então o resumo
  -- não o esconde de quem tem o banco inteiro; o que ele evita é o código em
  -- claro em cópia de segurança e em registro de consulta.
  code_sha256      bytea       NOT NULL
    CONSTRAINT print_pairing_codes_resumo_sha256 CHECK (octet_length(code_sha256) = 32),
  expires_at       timestamptz NOT NULL,
  -- Tentativas com código errado contra ESTE código. No limite, o código
  -- fecha e o dono gera outro: seis dígitos com cinco tentativas por código
  -- dão uma chance em duzentas mil por código gerado.
  failed_attempts  smallint    NOT NULL DEFAULT 0
    CONSTRAINT print_pairing_codes_tentativas_nao_negativas CHECK (failed_attempts >= 0),
  -- Fechado: usado no pareamento, trocado por outro, ou esgotado.
  consumed_at      timestamptz,
  -- O agente que nasceu deste código, quando ele foi usado.
  agent_id         uuid        REFERENCES app.print_agents (id),
  created_by       uuid        REFERENCES app.identities (id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.print_pairing_codes IS
  'Código curto de pareamento do agente de impressão (T-608). Um aberto por loja; guarda só o sha256.';

-- UM código aberto por loja: gerar outro substitui o anterior (`ON CONFLICT`
-- nesta chave), e o agente não tem como acertar um código velho esquecido.
CREATE UNIQUE INDEX IF NOT EXISTS print_pairing_codes_aberto_uk
  ON app.print_pairing_codes (store_id)
  WHERE consumed_at IS NULL;

ALTER TABLE app.print_pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.print_pairing_codes FORCE  ROW LEVEL SECURITY;

-- A equipe gera o código da própria loja (e o vê, para mostrar a validade).
DROP POLICY IF EXISTS ppc_staff_all ON app.print_pairing_codes;
CREATE POLICY ppc_staff_all ON app.print_pairing_codes FOR ALL TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

DROP POLICY IF EXISTS ppc_require_ctx ON app.print_pairing_codes;
CREATE POLICY ppc_require_ctx ON app.print_pairing_codes AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

DROP POLICY IF EXISTS ppc_admin_all ON app.print_pairing_codes;
CREATE POLICY ppc_admin_all ON app.print_pairing_codes FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- O código fica como registro de quem pareou o quê; fechar é preencher
-- `consumed_at`, nunca apagar.
REVOKE DELETE ON app.print_pairing_codes FROM sc_app;

-- ---------------------------------------------------------------------------
-- Parear: o código certo vira um agente, uma vez
-- ---------------------------------------------------------------------------
-- Chamada com a loja no contexto (resolvida pelo apelido que o agente
-- mandou) e o papel da vitrine. Desfechos:
--
--   * 'pareado'        — agente criado; os anteriores da loja revogados;
--   * 'sem_codigo'     — a loja não tem código aberto, ou ele venceu;
--   * 'codigo_errado'  — tentativa contada contra o código aberto;
--   * 'esgotado'       — esta tentativa errada fechou o código.
--
-- A tentativa errada é GRAVADA (a função não levanta erro), então o limite
-- vale mesmo que a borda responda recusa logo em seguida. A borda responde os
-- três desfechos de recusa do mesmo jeito: não há por que ensinar a quem
-- tenta adivinhar se a loja tem código aberto.
CREATE OR REPLACE FUNCTION app.parear_agente_de_impressao(
  p_codigo_sha256     bytea,
  p_nome              text,
  p_credencial_sha256 bytea,
  p_maximo_de_falhas  integer
)
RETURNS TABLE (agente_id uuid, desfecho text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_loja   uuid := app.current_store_id();
  v_codigo record;
  v_agente uuid;
  v_falhas integer;
BEGIN
  IF v_loja IS NULL OR p_codigo_sha256 IS NULL OR p_credencial_sha256 IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'sem_codigo'::text;
    RETURN;
  END IF;

  SELECT c.id, c.code_sha256, c.expires_at, c.failed_attempts
    INTO v_codigo
    FROM app.print_pairing_codes c
   WHERE c.store_id = v_loja
     AND c.consumed_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR v_codigo.expires_at <= now() THEN
    RETURN QUERY SELECT NULL::uuid, 'sem_codigo'::text;
    RETURN;
  END IF;

  IF v_codigo.code_sha256 <> p_codigo_sha256 THEN
    v_falhas := v_codigo.failed_attempts + 1;
    UPDATE app.print_pairing_codes
       SET failed_attempts = v_falhas,
           consumed_at = CASE WHEN v_falhas >= p_maximo_de_falhas THEN now() END
     WHERE id = v_codigo.id;
    RETURN QUERY SELECT NULL::uuid,
      (CASE WHEN v_falhas >= p_maximo_de_falhas THEN 'esgotado' ELSE 'codigo_errado' END)::text;
    RETURN;
  END IF;

  -- Uma impressora por loja: o agente novo substitui os anteriores.
  UPDATE app.print_agents
     SET revoked_at = now()
   WHERE store_id = v_loja
     AND revoked_at IS NULL;

  INSERT INTO app.print_agents (store_id, name, token_sha256)
  VALUES (v_loja, p_nome, p_credencial_sha256)
  RETURNING id INTO v_agente;

  UPDATE app.print_pairing_codes
     SET consumed_at = now(),
         agent_id = v_agente
   WHERE id = v_codigo.id;

  RETURN QUERY SELECT v_agente, 'pareado'::text;
END $$;

REVOKE ALL ON FUNCTION app.parear_agente_de_impressao(bytea, text, bytea, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parear_agente_de_impressao(bytea, text, bytea, integer) TO sc_app;

-- ---------------------------------------------------------------------------
-- O agente se apresenta: de quem é esta credencial?
-- ---------------------------------------------------------------------------
-- Antes de qualquer contexto: é a credencial que diz a loja. Devolve uma
-- linha só, com o agente e a loja, ou nenhuma — para credencial desconhecida,
-- agente revogado, e loja suspensa ou excluída.
CREATE OR REPLACE FUNCTION app.agente_pela_credencial(p_credencial_sha256 bytea)
RETURNS TABLE (agente_id uuid, loja_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT a.id, a.store_id
    FROM app.print_agents a
    JOIN app.stores s ON s.id = a.store_id
   WHERE a.token_sha256 = p_credencial_sha256
     AND a.revoked_at IS NULL
     AND s.status = 'ACTIVE'
     AND s.deleted_at IS NULL
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.agente_pela_credencial(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.agente_pela_credencial(bytea) TO sc_app;

-- ---------------------------------------------------------------------------
-- O automático está ligado nesta loja?
-- ---------------------------------------------------------------------------
-- Só para o papel do agente, que não lê `store_settings`. A chave é a mesma
-- que `enfileirar_impressao` (0034) lê: `printing.automatico = true`. Ausente,
-- vale desligado — o padrão de toda loja (AC-622).
CREATE OR REPLACE FUNCTION app.impressao_automatica_ligada()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT coalesce((
    SELECT ss.printing -> 'automatico' = 'true'::jsonb
      FROM app.store_settings ss
     WHERE ss.store_id = app.current_store_id()
       AND app.current_role_name() = 'PRINT_AGENT'), false)
$$;

REVOKE ALL ON FUNCTION app.impressao_automatica_ligada() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.impressao_automatica_ligada() TO sc_app;

RESET ROLE;
