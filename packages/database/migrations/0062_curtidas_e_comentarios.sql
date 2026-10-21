-- ===========================================================================
-- 0062 — Curtidas e comentários com aprovação da loja (card #47).
--
-- CURTIDAS são da PESSOA (como os favoritos de 0050): uma linha por pessoa e
-- alvo, então curtir de novo não duplica.
--
--   product_likes   pessoa ↔ produto (com a loja ao lado, para a régua de
--                   isolamento)
--   store_likes     pessoa ↔ loja
--
-- COMENTÁRIOS nascem PENDENTES e só aparecem para o público depois que a loja
-- APROVA (ou RECUSA). O autor vê os seus pendentes. A loja pode ligar
-- `stores.comments_auto_approve`: aí o comentário já nasce APROVADO.
--
--   comments          o comentário, num produto (product_id) ou na loja
--                     (product_id nulo). Texto de 1 a 500 caracteres.
--   comment_reports   denúncia: uma por pessoa e comentário.
--   comment_blocks    a loja bloqueia uma pessoa de comentar nela.
--
-- QUEM ESCREVE O QUÊ:
--   - a pessoa insere o próprio comentário (política pela identidade, sem loja
--     no contexto). O gatilho `comments_ao_inserir` (direitos de quem o
--     definiu) é a trava: confere o alvo, o bloqueio e o limite de envio, e
--     decide a situação e o nome do autor — quem insere não escolhe nada disso;
--   - a equipe da loja (dono e STAFF, no contexto da loja) lê, modera
--     (situação, motivo) e apaga os comentários da loja; bloqueia e
--     desbloqueia pessoas;
--   - o autor apaga o próprio comentário.
--
-- A LEITURA PÚBLICA (contadores, comentários aprovados) atravessa lojas e por
-- isso passa por funções com os direitos de quem as definiu e LISTA FECHADA de
-- campos, como `app.feed_produtos` (0050). O autor aparece pelo nome curto
-- guardado no comentário ("Ana R."), nunca pelo e-mail.
--
-- LIMITE DE ENVIO (anti-abuso), o mesmo de `LIMITES_DOS_COMENTARIOS` do
-- contrato: até 5 comentários em 10 minutos e 50 em 24 horas por pessoa.
--
-- Idempotente: tabelas e colunas com IF NOT EXISTS, políticas, funções e
-- gatilhos recriados.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- Configuração da loja
-- ---------------------------------------------------------------------------
ALTER TABLE app.stores
  ADD COLUMN IF NOT EXISTS comments_auto_approve boolean NOT NULL DEFAULT false;

-- Lista fechada de colunas (0003): o dono liga e desliga pela rota da loja.
GRANT UPDATE (comments_auto_approve) ON app.stores TO sc_app;

-- ---------------------------------------------------------------------------
-- O alvo público
-- ---------------------------------------------------------------------------
-- A loja do produto que o público alcança: publicado, não excluído, de loja
-- ATIVA. Nulo nos outros casos — curtir ou comentar o que não está no ar não
-- existe, e a resposta não conta se existe.
CREATE OR REPLACE FUNCTION app.loja_do_produto_publico(p_produto uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT p.store_id
    FROM app.products p
    JOIN app.stores s ON s.id = p.store_id
   WHERE p.id = p_produto
     AND p.deleted_at IS NULL
     AND p.status = 'PUBLISHED'
     AND s.status = 'ACTIVE'
     AND s.deleted_at IS NULL
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.loja_do_produto_publico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.loja_do_produto_publico(uuid) TO sc_app;

-- ---------------------------------------------------------------------------
-- Curtidas — da pessoa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.product_likes (
  identity_id uuid        NOT NULL REFERENCES app.identities (id),
  store_id    uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  product_id  uuid        NOT NULL REFERENCES app.products (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identity_id, product_id)
);

CREATE INDEX IF NOT EXISTS product_likes_produto_ix ON app.product_likes (product_id);
CREATE INDEX IF NOT EXISTS product_likes_loja_ix ON app.product_likes (store_id);

CREATE TABLE IF NOT EXISTS app.store_likes (
  identity_id uuid        NOT NULL REFERENCES app.identities (id),
  store_id    uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identity_id, store_id)
);

CREATE INDEX IF NOT EXISTS store_likes_loja_ix ON app.store_likes (store_id);

ALTER TABLE app.product_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.product_likes FORCE  ROW LEVEL SECURITY;
ALTER TABLE app.store_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_likes FORCE  ROW LEVEL SECURITY;

-- As mesmas políticas de `favorite_stores` (0050): cada um vê e mexe só nas
-- suas; com loja no contexto, só nas linhas DAQUELA loja.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_likes', 'store_likes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_self_select ON app.%1$s', t);
    EXECUTE format($p$CREATE POLICY %1$s_self_select ON app.%1$s FOR SELECT TO sc_app
      USING (identity_id = (SELECT app.current_user_id())
             AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_self_insert ON app.%1$s', t);
    EXECUTE format($p$CREATE POLICY %1$s_self_insert ON app.%1$s FOR INSERT TO sc_app
      WITH CHECK (identity_id = (SELECT app.current_user_id())
                  AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_self_update ON app.%1$s', t);
    EXECUTE format($p$CREATE POLICY %1$s_self_update ON app.%1$s FOR UPDATE TO sc_app
      USING      (identity_id = (SELECT app.current_user_id())
                  AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())))
      WITH CHECK (identity_id = (SELECT app.current_user_id())
                  AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_self_delete ON app.%1$s', t);
    EXECUTE format($p$CREATE POLICY %1$s_self_delete ON app.%1$s FOR DELETE TO sc_app
      USING (identity_id = (SELECT app.current_user_id())
             AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_admin_all ON app.%1$s', t);
    EXECUTE format($p$CREATE POLICY %1$s_admin_all ON app.%1$s FOR ALL TO sc_admin
      USING (true) WITH CHECK (true)$p$, t);
  END LOOP;
END $$;

-- Curtida não tem o que editar: nenhuma coluna alterável.
REVOKE UPDATE ON app.product_likes, app.store_likes FROM sc_app;

-- ---------------------------------------------------------------------------
-- Comentários
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.comments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  -- Nulo: o comentário é na LOJA, e não num produto.
  product_id       uuid        REFERENCES app.products (id) ON DELETE CASCADE,
  identity_id      uuid        NOT NULL REFERENCES app.identities (id),
  -- O nome curto do autor no momento do comentário ("Ana R."). Decidido pelo
  -- gatilho; é o único dado do autor que o público vê.
  author_name      text        NOT NULL,
  body             text        NOT NULL,
  status           text        NOT NULL DEFAULT 'PENDENTE',
  rejection_reason text,
  moderated_by     uuid        REFERENCES app.identities (id),
  moderated_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comments_status_ck CHECK (status IN ('PENDENTE', 'APROVADO', 'RECUSADO')),
  CONSTRAINT comments_body_ck CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  CONSTRAINT comments_motivo_ck CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 200)
);

-- A fila da moderação e a contagem por situação (painel).
CREATE INDEX IF NOT EXISTS comments_loja_situacao_ix
  ON app.comments (store_id, status, created_at DESC);
-- Os aprovados de um produto (ou da loja), do mais novo para o mais antigo.
CREATE INDEX IF NOT EXISTS comments_alvo_ix
  ON app.comments (store_id, product_id, status, created_at DESC);
-- Os da pessoa: "os meus pendentes" e o limite de envio.
CREATE INDEX IF NOT EXISTS comments_autor_ix
  ON app.comments (identity_id, created_at DESC);

ALTER TABLE app.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.comments FORCE  ROW LEVEL SECURITY;

-- O autor: lê e apaga os seus; insere sem loja no contexto (o comentário vem
-- do público, e não do painel).
DROP POLICY IF EXISTS comments_self_select ON app.comments;
CREATE POLICY comments_self_select ON app.comments FOR SELECT TO sc_app
  USING (identity_id = (SELECT app.current_user_id())
         AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS comments_self_insert ON app.comments;
CREATE POLICY comments_self_insert ON app.comments FOR INSERT TO sc_app
  WITH CHECK (identity_id = (SELECT app.current_user_id())
              AND (SELECT app.current_store_id()) IS NULL);
DROP POLICY IF EXISTS comments_self_delete ON app.comments;
CREATE POLICY comments_self_delete ON app.comments FOR DELETE TO sc_app
  USING (identity_id = (SELECT app.current_user_id())
         AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));

-- A equipe da loja: lê, modera e apaga os da loja do contexto.
DROP POLICY IF EXISTS comments_staff_select ON app.comments;
CREATE POLICY comments_staff_select ON app.comments FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS comments_staff_update ON app.comments;
CREATE POLICY comments_staff_update ON app.comments FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS comments_staff_delete ON app.comments;
CREATE POLICY comments_staff_delete ON app.comments FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

DROP POLICY IF EXISTS comments_admin_all ON app.comments;
CREATE POLICY comments_admin_all ON app.comments FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- Moderar mexe só na situação e no que a acompanha (lista fechada, como 0003).
REVOKE UPDATE ON app.comments FROM sc_app;
GRANT UPDATE (status, rejection_reason, moderated_by, moderated_at, updated_at)
  ON app.comments TO sc_app;

-- ---------------------------------------------------------------------------
-- Bloqueios da loja
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.comment_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  identity_id uuid        NOT NULL REFERENCES app.identities (id),
  -- O mesmo nome curto do comentário, para a lista de bloqueados.
  author_name text        NOT NULL,
  reason      text,
  created_by  uuid        REFERENCES app.identities (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comment_blocks_motivo_ck CHECK (reason IS NULL OR char_length(reason) <= 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS comment_blocks_pessoa_uk
  ON app.comment_blocks (store_id, identity_id);

ALTER TABLE app.comment_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.comment_blocks FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comment_blocks_staff_select ON app.comment_blocks;
CREATE POLICY comment_blocks_staff_select ON app.comment_blocks FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS comment_blocks_staff_insert ON app.comment_blocks;
CREATE POLICY comment_blocks_staff_insert ON app.comment_blocks FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS comment_blocks_staff_update ON app.comment_blocks;
CREATE POLICY comment_blocks_staff_update ON app.comment_blocks FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS comment_blocks_staff_delete ON app.comment_blocks;
CREATE POLICY comment_blocks_staff_delete ON app.comment_blocks FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS comment_blocks_require_ctx ON app.comment_blocks;
CREATE POLICY comment_blocks_require_ctx ON app.comment_blocks AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);
DROP POLICY IF EXISTS comment_blocks_admin_all ON app.comment_blocks;
CREATE POLICY comment_blocks_admin_all ON app.comment_blocks FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

REVOKE UPDATE ON app.comment_blocks FROM sc_app;
GRANT UPDATE (reason) ON app.comment_blocks TO sc_app;

-- ---------------------------------------------------------------------------
-- Denúncias
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.comment_reports (
  comment_id  uuid        NOT NULL REFERENCES app.comments (id) ON DELETE CASCADE,
  store_id    uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  identity_id uuid        NOT NULL REFERENCES app.identities (id),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, identity_id),
  CONSTRAINT comment_reports_motivo_ck CHECK (reason IS NULL OR char_length(reason) <= 200)
);

CREATE INDEX IF NOT EXISTS comment_reports_loja_ix
  ON app.comment_reports (store_id, comment_id);

ALTER TABLE app.comment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.comment_reports FORCE  ROW LEVEL SECURITY;

-- Quem denunciou vê e retira a sua; a equipe da loja lê as da loja. Denunciar
-- é pela função `app.denunciar_comentario` (a pessoa não lê o comentário
-- alheio pela tabela, então não teria como conferir a loja dele).
DROP POLICY IF EXISTS comment_reports_self_select ON app.comment_reports;
CREATE POLICY comment_reports_self_select ON app.comment_reports FOR SELECT TO sc_app
  USING (identity_id = (SELECT app.current_user_id())
         AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS comment_reports_staff_select ON app.comment_reports;
CREATE POLICY comment_reports_staff_select ON app.comment_reports FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
DROP POLICY IF EXISTS comment_reports_self_insert ON app.comment_reports;
CREATE POLICY comment_reports_self_insert ON app.comment_reports FOR INSERT TO sc_app
  WITH CHECK (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS comment_reports_self_update ON app.comment_reports;
CREATE POLICY comment_reports_self_update ON app.comment_reports FOR UPDATE TO sc_app
  USING      (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())))
  WITH CHECK (identity_id = (SELECT app.current_user_id())
              AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS comment_reports_self_delete ON app.comment_reports;
CREATE POLICY comment_reports_self_delete ON app.comment_reports FOR DELETE TO sc_app
  USING (identity_id = (SELECT app.current_user_id())
         AND ((SELECT app.current_store_id()) IS NULL OR store_id = (SELECT app.current_store_id())));
DROP POLICY IF EXISTS comment_reports_admin_all ON app.comment_reports;
CREATE POLICY comment_reports_admin_all ON app.comment_reports FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

REVOKE UPDATE ON app.comment_reports FROM sc_app;
GRANT UPDATE (reason) ON app.comment_reports TO sc_app;

-- ---------------------------------------------------------------------------
-- Pode comentar? (a mesma régua para a rota e para o gatilho)
-- ---------------------------------------------------------------------------
-- 'OK', 'NAO_ENCONTRADO' (alvo fora do ar), 'BLOQUEADO' (a loja bloqueou a
-- pessoa) ou 'LIMITE' (muitos comentários seguidos). Sem sessão: 'NAO_ENCONTRADO'.
CREATE OR REPLACE FUNCTION app.pode_comentar(p_loja uuid, p_produto uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_pessoa uuid := app.current_user_id();
BEGIN
  IF v_pessoa IS NULL THEN
    RETURN 'NAO_ENCONTRADO';
  END IF;
  IF p_produto IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM app.stores s
                    WHERE s.id = p_loja AND s.status = 'ACTIVE' AND s.deleted_at IS NULL) THEN
      RETURN 'NAO_ENCONTRADO';
    END IF;
  ELSIF app.loja_do_produto_publico(p_produto) IS DISTINCT FROM p_loja THEN
    RETURN 'NAO_ENCONTRADO';
  END IF;
  IF EXISTS (SELECT 1 FROM app.comment_blocks b
              WHERE b.store_id = p_loja AND b.identity_id = v_pessoa) THEN
    RETURN 'BLOQUEADO';
  END IF;
  IF (SELECT count(*) FROM app.comments c
       WHERE c.identity_id = v_pessoa AND c.created_at > now() - interval '10 minutes') >= 5
     OR (SELECT count(*) FROM app.comments c
          WHERE c.identity_id = v_pessoa AND c.created_at > now() - interval '24 hours') >= 50 THEN
    RETURN 'LIMITE';
  END IF;
  RETURN 'OK';
END $$;

REVOKE ALL ON FUNCTION app.pode_comentar(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pode_comentar(uuid, uuid) TO sc_app;

-- O nome curto da pessoa: primeiro nome e a inicial do último ("Ana R.").
CREATE OR REPLACE FUNCTION app.nome_curto_da_pessoa(p_pessoa uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT coalesce(
           (SELECT CASE
                     WHEN array_length(partes, 1) > 1
                       THEN partes[1] || ' ' || upper(left(partes[array_length(partes, 1)], 1)) || '.'
                     ELSE partes[1]
                   END
              FROM (SELECT regexp_split_to_array(btrim(i.display_name), '\s+') AS partes
                      FROM app.identities i
                     WHERE i.id = p_pessoa
                       AND i.anonymized_at IS NULL
                       AND nullif(btrim(i.display_name), '') IS NOT NULL) n),
           'Cliente')
$$;

REVOKE ALL ON FUNCTION app.nome_curto_da_pessoa(uuid) FROM PUBLIC;

-- A trava do comentário novo: quem insere não decide situação, autor nem
-- moderação.
CREATE OR REPLACE FUNCTION app.comments_ao_inserir() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_pode text;
  v_automatico boolean;
BEGIN
  -- Sem pessoa no contexto só a administração insere (carga de exemplo): a
  -- política de inserção da aplicação exige a pessoa da sessão.
  IF app.current_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.identity_id IS DISTINCT FROM app.current_user_id() THEN
    RAISE EXCEPTION 'comentario_de_outra_pessoa' USING ERRCODE = '42501';
  END IF;
  v_pode := app.pode_comentar(NEW.store_id, NEW.product_id);
  IF v_pode <> 'OK' THEN
    RAISE EXCEPTION 'comentario_recusado: %', v_pode USING ERRCODE = '42501';
  END IF;
  SELECT s.comments_auto_approve INTO v_automatico FROM app.stores s WHERE s.id = NEW.store_id;
  NEW.body := btrim(NEW.body);
  NEW.author_name := app.nome_curto_da_pessoa(NEW.identity_id);
  NEW.status := CASE WHEN coalesce(v_automatico, false) THEN 'APROVADO' ELSE 'PENDENTE' END;
  NEW.rejection_reason := NULL;
  NEW.moderated_by := NULL;
  NEW.moderated_at := NULL;
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION app.comments_ao_inserir() FROM PUBLIC;

DROP TRIGGER IF EXISTS comments_ao_inserir ON app.comments;
CREATE TRIGGER comments_ao_inserir
  BEFORE INSERT ON app.comments
  FOR EACH ROW EXECUTE FUNCTION app.comments_ao_inserir();

-- ---------------------------------------------------------------------------
-- Denunciar
-- ---------------------------------------------------------------------------
-- Só comentário APROVADO (o que o público vê) de loja ativa. Denunciar de novo
-- só troca o motivo. Devolve falso quando o comentário não está à vista.
CREATE OR REPLACE FUNCTION app.denunciar_comentario(p_comentario uuid, p_motivo text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_pessoa uuid := app.current_user_id();
  v_loja uuid;
BEGIN
  IF v_pessoa IS NULL THEN
    RETURN false;
  END IF;
  SELECT c.store_id INTO v_loja
    FROM app.comments c
    JOIN app.stores s ON s.id = c.store_id
   WHERE c.id = p_comentario
     AND c.status = 'APROVADO'
     AND s.status = 'ACTIVE' AND s.deleted_at IS NULL;
  IF v_loja IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO app.comment_reports (comment_id, store_id, identity_id, reason)
  VALUES (p_comentario, v_loja, v_pessoa, nullif(btrim(p_motivo), ''))
  ON CONFLICT (comment_id, identity_id) DO UPDATE SET reason = excluded.reason;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION app.denunciar_comentario(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.denunciar_comentario(uuid, text) TO sc_app;

-- ---------------------------------------------------------------------------
-- Leitura pública
-- ---------------------------------------------------------------------------
-- Contadores dos produtos: curtidas, comentários APROVADOS e se a pessoa da
-- sessão curtiu (sem sessão, falso).
CREATE OR REPLACE FUNCTION app.social_dos_produtos(p_produtos uuid[])
RETURNS TABLE (product_id uuid, likes bigint, comments bigint, liked boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT x.id,
         (SELECT count(*) FROM app.product_likes l WHERE l.product_id = x.id),
         (SELECT count(*) FROM app.comments c
           WHERE c.product_id = x.id AND c.status = 'APROVADO'),
         EXISTS (SELECT 1 FROM app.product_likes l
                  WHERE l.product_id = x.id AND l.identity_id = app.current_user_id())
    FROM unnest(p_produtos) AS x(id)
$$;

REVOKE ALL ON FUNCTION app.social_dos_produtos(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.social_dos_produtos(uuid[]) TO sc_app;

-- Contadores das lojas pelo apelido: curtidas da loja e comentários APROVADOS
-- feitos na loja (não nos produtos).
CREATE OR REPLACE FUNCTION app.social_das_lojas(p_apelidos text[])
RETURNS TABLE (slug text, likes bigint, comments bigint, liked boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT s.slug,
         (SELECT count(*) FROM app.store_likes l WHERE l.store_id = s.id),
         (SELECT count(*) FROM app.comments c
           WHERE c.store_id = s.id AND c.product_id IS NULL AND c.status = 'APROVADO'),
         EXISTS (SELECT 1 FROM app.store_likes l
                  WHERE l.store_id = s.id AND l.identity_id = app.current_user_id())
    FROM app.stores s
   WHERE lower(s.slug) = ANY (SELECT lower(a) FROM unnest(p_apelidos) AS a)
     AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
$$;

REVOKE ALL ON FUNCTION app.social_das_lojas(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.social_das_lojas(text[]) TO sc_app;

-- Os comentários APROVADOS de um alvo (produto, ou a loja quando p_produto é
-- nulo), do mais novo para o mais antigo, com o total. Lista fechada: nada da
-- pessoa além do nome curto.
CREATE OR REPLACE FUNCTION app.comentarios_aprovados(
  p_loja uuid, p_produto uuid, p_limite integer, p_deslocamento integer)
RETURNS TABLE (id uuid, author_name text, body text, created_at timestamptz,
               is_mine boolean, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT c.id, c.author_name, c.body, c.created_at,
         c.identity_id = app.current_user_id() AS is_mine,
         count(*) OVER () AS total
    FROM app.comments c
    JOIN app.stores s ON s.id = c.store_id
   WHERE c.store_id = p_loja
     AND c.product_id IS NOT DISTINCT FROM p_produto
     AND c.status = 'APROVADO'
     AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
   ORDER BY c.created_at DESC, c.id
   LIMIT greatest(least(coalesce(p_limite, 20), 50), 1)
  OFFSET greatest(coalesce(p_deslocamento, 0), 0)
$$;

REVOKE ALL ON FUNCTION app.comentarios_aprovados(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.comentarios_aprovados(uuid, uuid, integer, integer) TO sc_app;

RESET ROLE;
