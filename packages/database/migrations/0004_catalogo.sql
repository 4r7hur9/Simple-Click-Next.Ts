-- ===========================================================================
-- 0004 — Catálogo: o produto genérico.
--
-- Uma única tabela serve comida, roupa, peça e eletrônico. A diferença entre
-- ramos mora em `product_type`, no ramo copiado da loja e nos atributos
-- tipados — nunca em tabelas paralelas, que multiplicariam por N cada política
-- de isolamento, cada índice e cada consulta.
--
-- É também a tabela que demonstra o isolamento de ponta a ponta nesta fase:
-- leitura, inserção, alteração e remoção têm política própria, e existe a
-- política restritiva de contexto obrigatório.
--
-- Fica para as próximas tarefas, seguindo o mesmo bloco canônico:
-- `categories`, `product_categories`, `attribute_definitions`,
-- `product_attributes`, `product_variants`, `product_prices`, `option_groups`,
-- `option_items`, `product_option_groups`, `variant_option_values`,
-- `option_price_overrides`, `product_images`, `assets`,
-- `availability_windows` e `stock_movements`.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

CREATE TABLE IF NOT EXISTS app.products (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  name                    text NOT NULL,
  slug                    text NOT NULL,
  description             text,
  short_description       text,
  product_type            text NOT NULL DEFAULT 'SIMPLE',
  -- Ramo COPIADO da loja no cadastro, e não lido por chave viva: trocar o tipo
  -- de negócio da loja não pode invalidar retroativamente o que já foi
  -- cadastrado.
  vertical_code           text NOT NULL REFERENCES app.vertical_presets (code),
  vertical_schema_version integer NOT NULL DEFAULT 1,
  status                  text NOT NULL DEFAULT 'DRAFT',
  -- 'Esgotado' aparece marcado em vez de sumir: o cliente que procurava o item
  -- precisa saber que ele existe e voltou a acabar.
  is_available            boolean NOT NULL DEFAULT true,
  unavailable_until       timestamptz,
  unit_label              text NOT NULL DEFAULT 'un',
  track_stock             boolean NOT NULL DEFAULT false,
  sort_order              integer NOT NULL DEFAULT 0,
  is_featured             boolean NOT NULL DEFAULT false,
  -- Cache desnormalizado dos atributos tipados, para servir a vitrine numa ida
  -- só ao banco. NUNCA é fonte de verdade: quando divergir, reconstrói-se.
  attributes              jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Dinheiro é inteiro em centavos, sempre (P-005). R$ 19,99 vezes 3 tem de
  -- dar exatamente R$ 59,97 nos quatro canais: vitrine, fechamento, mensagem
  -- do WhatsApp e cupom impresso.
  price_min_cents         bigint,
  price_max_cents         bigint,
  display_price_cents     bigint,
  compare_at_cents        bigint,
  has_variants            boolean NOT NULL DEFAULT false,
  fraction_slots          smallint,
  fraction_pricing        text,
  prep_time_minutes       integer,
  seo_title               text,
  seo_description         text,
  -- Coluna gerada em vez de gatilho: o índice de busca não pode depender de
  -- alguém lembrar de atualizá-lo. A configuração vem como `regconfig` porque
  -- só essa forma da função é imutável, e coluna gerada exige imutabilidade.
  search_tsv              tsvector GENERATED ALWAYS AS (
                            setweight(to_tsvector('portuguese'::regconfig, coalesce(name, '')), 'A') ||
                            setweight(to_tsvector('portuguese'::regconfig, coalesce(description, '')), 'B')
                          ) STORED,
  -- Remoção reversível: apagar produto não pode alterar pedido que já o
  -- incluiu.
  deleted_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES app.identities (id),
  CONSTRAINT products_type_ck
    CHECK (product_type IN ('SIMPLE', 'VARIABLE', 'FRACTIONED', 'SERVICE')),
  CONSTRAINT products_status_ck
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  CONSTRAINT products_fraction_pricing_ck
    CHECK (fraction_pricing IS NULL OR fraction_pricing IN ('AVG', 'MAX')),
  CONSTRAINT products_precos_nao_negativos_ck
    CHECK (coalesce(price_min_cents, 0) >= 0
       AND coalesce(price_max_cents, 0) >= 0
       AND coalesce(display_price_cents, 0) >= 0
       AND coalesce(compare_at_cents, 0) >= 0)
);

-- Unicidade por loja, e não global: unicidade global em tabela de loja é canal
-- encoberto (o erro de chave duplicada revela linha invisível de outra loja) e
-- ainda quebra a inserção com conflito, que passaria a violar o isolamento em
-- vez de atualizar.
CREATE UNIQUE INDEX IF NOT EXISTS products_store_slug_uk
  ON app.products (store_id, slug) WHERE deleted_at IS NULL;

-- O identificador da loja lidera todo índice quente porque ele lidera todas as
-- políticas: é isso que deixa o planejador fatorar o predicado e manter o
-- acesso ordenado.
CREATE INDEX IF NOT EXISTS products_store_ordem_ix
  ON app.products (store_id, sort_order);
CREATE INDEX IF NOT EXISTS products_store_vitrine_ix
  ON app.products (store_id, status, is_available, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS products_store_destaques_ix
  ON app.products (store_id, sort_order) WHERE is_featured AND status = 'PUBLISHED';
CREATE INDEX IF NOT EXISTS products_busca_ix
  ON app.products USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS products_atributos_ix
  ON app.products USING gin (attributes jsonb_path_ops);

DROP TRIGGER IF EXISTS products_touch ON app.products;
CREATE TRIGGER products_touch BEFORE UPDATE ON app.products
  FOR EACH ROW EXECUTE FUNCTION app.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- Versão do catálogo
-- ---------------------------------------------------------------------------
-- Roda com os direitos de quem a definiu porque a atualização precisa acontecer
-- mesmo quando quem mexeu no catálogo não tem permissão de alterar a linha da
-- loja. Sem isso, a invalidação de cache dependeria de a aplicação lembrar de
-- fazê-la — e um cache que às vezes não invalida é pior que cache nenhum.
--
-- É por linha, e não por comando, porque escrita de catálogo é rara perto de
-- leitura; se um dia houver carga em lote, vira gatilho por comando com tabela
-- de transição.
CREATE OR REPLACE FUNCTION app.bump_catalog_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE
  loja uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    loja := OLD.store_id;
  ELSE
    loja := NEW.store_id;
  END IF;

  UPDATE app.stores SET catalog_version = catalog_version + 1 WHERE id = loja;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS products_bump_catalog ON app.products;
CREATE TRIGGER products_bump_catalog
  AFTER INSERT OR UPDATE OR DELETE ON app.products
  FOR EACH ROW EXECUTE FUNCTION app.bump_catalog_version();

-- ---------------------------------------------------------------------------
-- Isolamento
-- ---------------------------------------------------------------------------
ALTER TABLE app.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.products FORCE  ROW LEVEL SECURITY;

-- Vitrine e cliente veem só o publicado e não removido. Rascunho fica invisível
-- inclusive por endereço direto.
CREATE POLICY products_storefront_select ON app.products FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER')
     AND status = 'PUBLISHED' AND deleted_at IS NULL);

-- Dono e equipe: tudo da própria loja, inclusive rascunho e lixeira.
CREATE POLICY products_staff_select ON app.products FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY products_staff_insert ON app.products FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- A checagem na escrita é o que impede MOVER um produto para outra loja.
-- Tentar trocar o identificador da loja levanta violação de política, e não um
-- sucesso silencioso.
CREATE POLICY products_staff_update ON app.products FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY products_staff_delete ON app.products FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- Cinto restritivo: sem contexto de loja, nada. O destinatário explícito é
-- obrigatório — política restritiva sem destinatário valeria para todos e
-- alcançaria também a credencial de administração, que precisa enxergar
-- todas as lojas.
CREATE POLICY products_require_ctx ON app.products AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

-- A administração enxerga tudo por política explícita e auditável, e não por
-- privilégio de contornar o isolamento.
CREATE POLICY products_admin_all ON app.products FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);
