-- ===========================================================================
-- 0034 — Fila de impressão em banco, com reivindicação e prazo (T-607:
-- AC-624, AC-625).
--
-- A fila mora no PostgreSQL, e não no Redis (decisão de 17/08): o Redis é o
-- primeiro serviço a cair quando o crédito acaba, e a cozinha não pode parar
-- de receber cupom por causa do cache. Morar aqui também dá o isolamento por
-- loja de graça e deixa o trabalho nascer NA MESMA transação do pedido — não
-- existe pedido salvo sem cupom enfileirado, nem cupom de pedido desfeito.
--
-- DUAS TABELAS, nesta ordem, porque o trabalho cita quem o pegou:
--
--   * `print_agents` — o agente de impressão pareado com a loja. Guarda só o
--     resumo sha256 da credencial dele, nunca a credencial: quem lê o banco não
--     consegue se passar pelo agente. Revogar é marcar `revoked_at`, e o agente
--     revogado deixa de reivindicar na mesma hora (ver `registrar_batimento`).
--   * `print_jobs` — um trabalho por cupom, com identificador próprio. É esse
--     identificador que faz a confirmação perdida não imprimir duas vezes
--     (AC-625): o agente anota o que já imprimiu, e o reenvio chega com o MESMO
--     identificador e os MESMOS blocos.
--
-- O CICLO DE UM TRABALHO:
--
--   QUEUED ──reivindicar──▶ LEASED ──confirmar──▶ PRINTED
--     ▲                      │  │
--     │                      │  └─prazo vence──▶ LEASED de novo (reenvio)
--     └── espera crescente ◀─┴─falhar──▶ FAILED  ··· ou DEAD no limite
--   qualquer pendente ──impressão por clique──▶ CANCELED
--
--   * reivindicar é `FOR UPDATE SKIP LOCKED` com prazo de posse: dois agentes da
--     mesma loja nunca pegam o mesmo trabalho, e o trabalho de um agente que
--     sumiu volta a ser entregue quando o prazo vence;
--   * a via (AC-621) é somada na PRIMEIRA reivindicação, junto com a geração
--     dos blocos, e os dois ficam guardados: o reenvio não soma via nem gera
--     outro cupom (decisão de 03/10);
--   * falha volta para a fila com espera de 5 s × 2^(tentativa-1), e vira DEAD
--     no limite de tentativas — estado final, à vista do dono, que imprime por
--     clique;
--   * imprimir por clique um cupom pendente CANCELA o trabalho (decisão de
--     03/10): o cupom nunca sai duas vezes por dois caminhos.
--
-- QUEM FAZ O QUÊ (papel `app.role` da transação, sempre dentro da loja):
--
--   * a equipe (OWNER/STAFF) lê e cancela os trabalhos e administra os agentes;
--   * o agente (PRINT_AGENT) lê e muda só `print_jobs` da loja dele. Ele NÃO lê
--     pedido, contato nem item: o que o cupom precisa sai de uma função com os
--     direitos de quem a definiu, que devolve os dados de UM trabalho que ESTÁ
--     com aquele agente — e nada além (`cupom_do_trabalho`);
--   * ninguém insere trabalho direto: quem enfileira é `enfileirar_impressao`,
--     chamada na transação do pedido. Ela lê a configuração de impressão da
--     loja, que o papel da vitrine não lê (0019), e só enfileira para a loja que
--     ligou o automático.
--
-- Compatível com a versão anterior: só cria tabela e função. A aplicação
-- antiga não conhece nenhuma das duas e continua funcionando sobre o banco
-- migrado. Reaplicável: tudo é `IF NOT EXISTS`, `OR REPLACE` ou política
-- recriada.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- Agentes de impressão
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.print_agents (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  -- Como o dono chama a máquina: "PC do caixa".
  name               text        NOT NULL
    CONSTRAINT print_agents_nome_curto CHECK (char_length(name) BETWEEN 1 AND 60),
  -- sha256 da credencial longa e aleatória que o agente recebe UMA vez no
  -- pareamento (T-608). A credencial em si nunca é gravada.
  token_sha256       bytea       NOT NULL
    CONSTRAINT print_agents_resumo_sha256 CHECK (octet_length(token_sha256) = 32),
  agent_version      text,
  -- Último contato. É o que o painel usa para dizer "impressão automática
  -- indisponível" quando o agente some (AC-624).
  last_heartbeat_at  timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.print_agents IS
  'Agente de impressão pareado com a loja (T-607/T-608). Guarda só o sha256 da credencial.';

-- Busca pela credencial apresentada, ANTES de existir contexto de loja: o
-- agente manda só a credencial, e é ela que diz de qual loja ele é. A chave é
-- global de propósito — a exceção está justificada na guarda G3.
CREATE UNIQUE INDEX IF NOT EXISTS print_agents_token_uk
  ON app.print_agents (token_sha256);
CREATE INDEX IF NOT EXISTS print_agents_store_ix
  ON app.print_agents (store_id, last_heartbeat_at DESC);

ALTER TABLE app.print_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.print_agents FORCE  ROW LEVEL SECURITY;

-- A equipe da loja vê e administra os agentes dela (parear, renomear, revogar).
DROP POLICY IF EXISTS pa_staff_all ON app.print_agents;
CREATE POLICY pa_staff_all ON app.print_agents FOR ALL TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

DROP POLICY IF EXISTS pa_require_ctx ON app.print_agents;
CREATE POLICY pa_require_ctx ON app.print_agents AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

DROP POLICY IF EXISTS pa_admin_all ON app.print_agents;
CREATE POLICY pa_admin_all ON app.print_agents FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- Agente não se apaga: revoga-se. Apagar perderia quem imprimiu cada trabalho.
REVOKE DELETE ON app.print_agents FROM sc_app;

-- ---------------------------------------------------------------------------
-- Trabalhos de impressão
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.print_jobs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  order_id      uuid        NOT NULL REFERENCES app.orders (id) ON DELETE CASCADE,
  -- Cópia do código do pedido ("A-1042"), que nunca muda: é o que o agente
  -- anota no registro dele e o que o painel mostra na lista de pendentes, sem
  -- que o papel do agente precise ler o pedido.
  order_code    text        NOT NULL,
  -- Quem está com o trabalho (LEASED) ou quem o imprimiu (PRINTED).
  agent_id      uuid        REFERENCES app.print_agents (id),
  status        text        NOT NULL DEFAULT 'QUEUED'
    CONSTRAINT print_jobs_status_valido CHECK (status IN
      ('QUEUED', 'LEASED', 'PRINTED', 'FAILED', 'DEAD', 'CANCELED')),
  -- O cupom SEMÂNTICO, versão 1 (`packages/core/src/cupom-blocos.ts`). Nulo
  -- até a primeira reivindicação, que soma a via e gera os blocos; depois
  -- disso não muda, e o reenvio entrega exatamente o mesmo cupom.
  blocks        jsonb
    CONSTRAINT print_jobs_blocos_sao_objeto CHECK (blocks IS NULL OR jsonb_typeof(blocks) = 'object'),
  -- Quantas vezes o trabalho foi entregue a um agente.
  attempt       smallint    NOT NULL DEFAULT 0
    CONSTRAINT print_jobs_tentativas_nao_negativas CHECK (attempt >= 0),
  -- Até quando o agente que pegou tem a posse. Vencido, o trabalho volta a
  -- ser entregue — é o que salva o cupom do agente que caiu no meio.
  lease_until   timestamptz,
  -- Desde quando o trabalho pode ser entregue: a espera crescente depois de
  -- uma falha mora aqui.
  available_at  timestamptz NOT NULL DEFAULT now(),
  last_error    text
    CONSTRAINT print_jobs_erro_curto CHECK (last_error IS NULL OR char_length(last_error) <= 500),
  printed_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_jobs_posse_tem_dono_e_prazo
    CHECK (status <> 'LEASED' OR (agent_id IS NOT NULL AND lease_until IS NOT NULL)),
  CONSTRAINT print_jobs_impresso_tem_instante
    CHECK (status <> 'PRINTED' OR printed_at IS NOT NULL)
);

COMMENT ON TABLE app.print_jobs IS
  'Fila de impressão (T-607): um trabalho por cupom, reivindicado com FOR UPDATE SKIP LOCKED e prazo de posse.';

-- No máximo UM trabalho pendente por pedido. Chave da loja à frente (G3).
CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_pendente_por_pedido_uk
  ON app.print_jobs (store_id, order_id)
  WHERE status IN ('QUEUED', 'LEASED', 'FAILED');

-- A consulta da reivindicação: pendentes da loja, na ordem em que entraram.
CREATE INDEX IF NOT EXISTS print_jobs_fila_ix
  ON app.print_jobs (store_id, created_at)
  WHERE status IN ('QUEUED', 'LEASED', 'FAILED');

-- Trabalhos de um pedido, em qualquer estado (cancelar pelo clique, histórico).
CREATE INDEX IF NOT EXISTS print_jobs_pedido_ix
  ON app.print_jobs (store_id, order_id);

ALTER TABLE app.print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.print_jobs FORCE  ROW LEVEL SECURITY;

-- A equipe lê a fila da loja (pendentes, estado final) e o agente lê a fila
-- da loja dele para reivindicar.
DROP POLICY IF EXISTS pj_select ON app.print_jobs;
CREATE POLICY pj_select ON app.print_jobs FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND ((SELECT app.is_store_staff())
       OR (SELECT app.current_role_name()) = 'PRINT_AGENT'));

-- O agente reivindica, confirma e registra falha; a equipe cancela.
DROP POLICY IF EXISTS pj_update ON app.print_jobs;
CREATE POLICY pj_update ON app.print_jobs FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id())
          AND ((SELECT app.is_store_staff())
            OR (SELECT app.current_role_name()) = 'PRINT_AGENT'))
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND ((SELECT app.is_store_staff())
            OR (SELECT app.current_role_name()) = 'PRINT_AGENT'));

DROP POLICY IF EXISTS pj_require_ctx ON app.print_jobs;
CREATE POLICY pj_require_ctx ON app.print_jobs AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

DROP POLICY IF EXISTS pj_admin_all ON app.print_jobs;
CREATE POLICY pj_admin_all ON app.print_jobs FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- Ninguém da aplicação insere nem apaga trabalho direto: inserir é só por
-- `enfileirar_impressao`, e o trabalho fica como registro do que saiu.
REVOKE INSERT, DELETE ON app.print_jobs FROM sc_app;

-- ---------------------------------------------------------------------------
-- Enfileirar: na transação do pedido, só para a loja com o automático ligado
-- ---------------------------------------------------------------------------
-- Quem chama é a criação do pedido, com o papel de quem compra (PUBLIC ou
-- CUSTOMER) — e esse papel não lê `store_settings.printing` (0019). Por isso a
-- função roda com os direitos de quem a definiu, e devolve só um booleano.
--
-- Idempotente: um pedido ganha no máximo um trabalho na vida. A segunda
-- chamada — a tentativa repetida do fechamento, por exemplo — não cria outro.
CREATE OR REPLACE FUNCTION app.enfileirar_impressao(p_pedido uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_loja uuid := app.current_store_id();
BEGIN
  IF v_loja IS NULL OR p_pedido IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO app.print_jobs (store_id, order_id, order_code)
  SELECT o.store_id, o.id, o.code
    FROM app.orders o
    JOIN app.store_settings ss ON ss.store_id = o.store_id
   WHERE o.id = p_pedido
     AND o.store_id = v_loja
     AND ss.printing -> 'automatico' = 'true'::jsonb
     AND NOT EXISTS (SELECT 1
                       FROM app.print_jobs j
                      WHERE j.store_id = o.store_id
                        AND j.order_id = o.id)
  ON CONFLICT DO NOTHING;

  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION app.enfileirar_impressao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.enfileirar_impressao(uuid) TO sc_app;

-- ---------------------------------------------------------------------------
-- Batimento: o agente está vivo e ainda vale
-- ---------------------------------------------------------------------------
-- Toda reivindicação começa aqui. Atualiza o último contato (o painel mostra o
-- agente fora do ar, AC-624) e responde se o agente existe NESTA loja e não
-- foi revogado — a segunda trava, depois da autenticação da borda (T-608).
-- Definer para que o papel do agente não precise de política nenhuma em
-- `print_agents`: ele só toca o próprio último contato, por aqui.
CREATE OR REPLACE FUNCTION app.registrar_batimento(p_agente uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  IF app.current_role_name() <> 'PRINT_AGENT' OR app.current_store_id() IS NULL THEN
    RETURN false;
  END IF;

  UPDATE app.print_agents a
     SET last_heartbeat_at = now()
   WHERE a.id = p_agente
     AND a.store_id = app.current_store_id()
     AND a.revoked_at IS NULL;

  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION app.registrar_batimento(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.registrar_batimento(uuid) TO sc_app;

-- ---------------------------------------------------------------------------
-- Os dados do cupom de UM trabalho, e a via somada (primeira reivindicação)
-- ---------------------------------------------------------------------------
-- O agente não lê pedido: nome, telefone e endereço do cliente moram em
-- tabelas que o papel dele não alcança, e abrir política nelas para ele
-- deixaria a máquina do caixa ler todos os pedidos da loja. Esta função é o
-- caminho mais estreito possível: devolve os dados de UM pedido, o do trabalho
-- que está com AQUELE agente, ainda sem blocos — e só uma vez, porque a via é
-- somada aqui, na mesma transação em que a aplicação gera e grava os blocos.
--
-- Quem reenvia não passa por aqui: o trabalho já tem blocos, e a função
-- devolve nulo. É isso que impede o reenvio de somar outra via (AC-621).
--
-- O formato espelha o que `apps/api/src/modules/printing/cupom.usecase.ts` lê
-- pelo cliente tipado, para que um único tradutor monte o pedido do cupom.
CREATE OR REPLACE FUNCTION app.cupom_do_trabalho(p_trabalho uuid, p_agente uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_loja   uuid := app.current_store_id();
  v_pedido uuid;
  v_via    integer;
BEGIN
  IF app.current_role_name() <> 'PRINT_AGENT' OR v_loja IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT j.order_id INTO v_pedido
    FROM app.print_jobs j
   WHERE j.id = p_trabalho
     AND j.store_id = v_loja
     AND j.agent_id = p_agente
     AND j.status = 'LEASED'
     AND j.blocks IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE app.orders o
     SET print_count = o.print_count + 1,
         last_printed_at = now()
   WHERE o.id = v_pedido
     AND o.store_id = v_loja
   RETURNING o.print_count INTO v_via;
  IF v_via IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'via', v_via,
    'loja', (SELECT s.name FROM app.stores s WHERE s.id = v_loja),
    'configuracao', (SELECT ss.printing FROM app.store_settings ss WHERE ss.store_id = v_loja),
    'pedido', (
      SELECT jsonb_build_object(
        'code', o.code,
        'channel', o.channel,
        'fulfillment', o.fulfillment,
        'paymentMethod', o.payment_method,
        'changeForCents', o.change_for_cents,
        'subtotalCents', o.subtotal_cents,
        'deliveryFeeCents', o.delivery_fee_cents,
        'deliveryFeeMode', o.delivery_fee_mode,
        'discountCents', o.discount_cents,
        'pickupDiscountCents', o.pickup_discount_cents,
        'totalCents', o.total_cents,
        'customerNote', o.customer_note,
        'storeTimezone', o.store_timezone,
        'placedAt', to_char(o.placed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'contato', (
          SELECT jsonb_build_object(
            'name', c.name,
            'phoneE164', c.phone_e164,
            'recipientName', c.recipient_name,
            'street', c.street,
            'number', c.number,
            'complement', c.complement,
            'neighborhood', c.neighborhood,
            'city', c.city,
            'uf', c.uf,
            'zip', c.zip,
            'referencePoint', c.reference_point)
            FROM app.order_contacts c
           WHERE c.order_id = o.id
             AND c.store_id = o.store_id),
        'itens', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'productName', i.product_name,
                   'variantName', i.variant_name,
                   'quantity', i.quantity,
                   'lineTotalCents', i.line_total_cents,
                   'note', i.note,
                   'opcoes', coalesce((
                     SELECT jsonb_agg(jsonb_build_object(
                              'groupNameSnapshot', op.group_name_snapshot,
                              'optionNameSnapshot', op.option_name_snapshot,
                              'action', op.action,
                              'quantity', op.quantity,
                              'priceDeltaCents', op.price_delta_cents)
                            ORDER BY op.sort_order, op.created_at, op.id)
                       FROM app.order_item_options op
                      WHERE op.order_item_id = i.id
                        AND op.store_id = i.store_id), '[]'::jsonb))
                 ORDER BY i.sort_order, i.created_at, i.id)
            FROM app.order_items i
           WHERE i.order_id = o.id
             AND i.store_id = o.store_id), '[]'::jsonb))
        FROM app.orders o
       WHERE o.id = v_pedido
         AND o.store_id = v_loja)
  );
END $$;

REVOKE ALL ON FUNCTION app.cupom_do_trabalho(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.cupom_do_trabalho(uuid, uuid) TO sc_app;

RESET ROLE;
