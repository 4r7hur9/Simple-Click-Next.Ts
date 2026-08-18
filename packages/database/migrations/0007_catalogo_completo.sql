-- ===========================================================================
-- 0007 · Catálogo completo
--
-- Fecha o que a 0004 deixou declarado: categorias, imagens, preços, variações,
-- grupos de opção e as especificações por categoria.
--
-- Três decisões carregam este arquivo, e todas vêm de exigência do produto:
--
-- 1. PREÇO É ENTIDADE, não três colunas. "Quero um quarto preço" precisa ser
--    uma linha, não uma migração — e é o que permite o dono nomear o preço
--    ("Atacado", "Terça do pastel") em vez de escolher de uma lista fixa.
--
-- 2. UM MECANISMO para ingrediente e variação. O primeiro SimpleClick já
--    intuía isso: "Escolha o Sabor" era escolha única obrigatória e
--    "Adicionais" era múltipla. Em loja de roupa, os mesmos campos viram
--    tamanho e cor. A diferença é econômica, não visual: variação tem estoque
--    e código próprios, ingrediente não.
--
-- 3. ESPECIFICAÇÃO PERTENCE À CATEGORIA, não ao ramo. Quem conhece o catálogo
--    é o dono: ele cria a categoria Pneus e, dentro dela, aro e largura. O
--    ramo apenas sugere o conjunto inicial. O valor tem chave estrangeira
--    obrigatória para a definição — é isso que impede o modelo de virar campo
--    livre ingovernável.
-- ===========================================================================

-- ── Categorias ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  name         text NOT NULL,
  slug         text NOT NULL,
  description  text,
  -- Ocultar não apaga: a categoria sai da vitrine junto com seus produtos e
  -- continua na gestão do dono, marcada como oculta.
  is_visible   boolean NOT NULL DEFAULT true,
  -- Ordenação manual, porque a ordem da vitrine é decisão de negócio do dono,
  -- não consequência alfabética.
  sort_order   integer NOT NULL DEFAULT 0,
  image_url    text,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Único POR LOJA, nunca global: apelido repetido entre lojas diferentes é
-- legítimo, e um único global revelaria a existência de linha invisível de
-- outra loja pelo erro de chave duplicada.
CREATE UNIQUE INDEX IF NOT EXISTS categories_store_slug_uk
  ON app.categories (store_id, slug) WHERE deleted_at IS NULL;

-- A vitrine pede as categorias visíveis de uma loja na ordem do dono. O índice
-- inclui as colunas que as POLÍTICAS citam, e não só as da consulta: sem elas,
-- a reconferência do isolamento vai ao disco e a leitura direta pelo índice se
-- perde.
CREATE INDEX IF NOT EXISTS categories_vitrine_idx
  ON app.categories (store_id, is_visible, sort_order)
  INCLUDE (name, slug, deleted_at);

-- ── Produto em categoria (N:M) ─────────────────────────────────────────────
-- É N:M e não 1:N porque o próprio MVP exibia o mesmo item na seção
-- "Promoções" e na seção dele. Com 1:N o dono duplicaria o cadastro para
-- promover um item, fragmentando foto, descrição e — pior — as métricas.

CREATE TABLE IF NOT EXISTS app.product_categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES app.products (id) ON DELETE CASCADE,
  category_id  uuid NOT NULL REFERENCES app.categories (id) ON DELETE CASCADE,
  -- Ordem POR categoria: o mesmo produto pode ser o primeiro em Promoções e o
  -- quinto em Lanches.
  sort_order   integer NOT NULL DEFAULT 0,
  -- Uma primária por produto, para o endereço canônico e a trilha de navegação.
  is_primary   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_uk
  ON app.product_categories (store_id, product_id, category_id);

-- Índice único parcial em vez de gatilho: a regra "uma primária por produto"
-- passa a ser impossível de violar, em vez de depender de alguém lembrar.
CREATE UNIQUE INDEX IF NOT EXISTS product_categories_primary_uk
  ON app.product_categories (store_id, product_id) WHERE is_primary;

CREATE INDEX IF NOT EXISTS product_categories_por_categoria_idx
  ON app.product_categories (store_id, category_id, sort_order)
  INCLUDE (product_id);

-- ── Imagens ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.product_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES app.products (id) ON DELETE CASCADE,
  url         text NOT NULL,
  alt_text    text,
  -- Uma principal por produto, garantida por índice único parcial (abaixo).
  is_primary  boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  width       integer,
  height      integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_images_primary_uk
  ON app.product_images (store_id, product_id) WHERE is_primary;

CREATE INDEX IF NOT EXISTS product_images_do_produto_idx
  ON app.product_images (store_id, product_id, sort_order)
  INCLUDE (url, is_primary);

-- ── Variações: a unidade vendável ──────────────────────────────────────────
-- É aqui que variação difere de ingrediente. Bacon acaba para o produto
-- inteiro; camiseta tamanho M acaba só no M, e o M tem código de estoque
-- próprio.

CREATE TABLE IF NOT EXISTS app.product_variants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES app.products (id) ON DELETE CASCADE,
  name              text NOT NULL,
  sku               text,
  barcode           text,
  -- Nulo significa "não controla estoque" — é o caso da lanchonete. Zero
  -- significa "controla e acabou", que é o caso da loja de roupa.
  stock_quantity    integer,
  stock_min_alert   integer,
  is_available      boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Estoque nunca fica negativo: a regra vive no banco, não na aplicação, e
  -- por isso vale mesmo quando duas compras chegam no mesmo instante.
  CONSTRAINT product_variants_estoque_nao_negativo
    CHECK (stock_quantity IS NULL OR stock_quantity >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_sku_uk
  ON app.product_variants (store_id, sku) WHERE sku IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS product_variants_do_produto_idx
  ON app.product_variants (store_id, product_id, sort_order)
  INCLUDE (name, stock_quantity, is_available, deleted_at);

-- ── Preços ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.product_prices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES app.products (id) ON DELETE CASCADE,
  -- Preço pendura na VARIANTE quando ela existe: pizza P e G têm preços
  -- diferentes do mesmo produto.
  variant_id    uuid REFERENCES app.product_variants (id) ON DELETE CASCADE,
  kind          text NOT NULL DEFAULT 'BASE',
  -- O rótulo é do dono: "Balcão", "Terça do pastel", "Dúzia". A lista fixa
  -- obrigaria o negócio dele a caber no nosso vocabulário.
  label         text,
  -- Dinheiro é bigint em centavos, sempre (P-005). R$ 19,99 vezes 3 tem de dar
  -- exatamente R$ 59,97 nos quatro canais: vitrine, fechamento, mensagem do
  -- WhatsApp e cupom impresso.
  amount_cents  bigint NOT NULL,
  -- Preço de atacado que vale a partir de N unidades.
  min_quantity  integer NOT NULL DEFAULT 1,
  starts_at     timestamptz,
  ends_at       timestamptz,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_prices_kind_conhecido
    CHECK (kind IN ('BASE', 'PROMO', 'WHOLESALE', 'COST', 'CLUB')),
  CONSTRAINT product_prices_valor_nao_negativo CHECK (amount_cents >= 0),
  CONSTRAINT product_prices_janela_coerente
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS product_prices_do_produto_idx
  ON app.product_prices (store_id, product_id, kind, min_quantity)
  INCLUDE (amount_cents, variant_id, is_active, starts_at, ends_at);

-- ── Grupos de opção: o mecanismo único ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.option_groups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  name             text NOT NULL,
  -- Escolhe o rótulo que o ramo dá ao grupo: ingrediente e adicional na
  -- lanchonete, especificação e compatibilidade na autopeça.
  kind             text NOT NULL DEFAULT 'ADDON',
  -- Obrigatoriedade é DERIVADA de min_select >= 1. Coluna própria seria
  -- redundante e abriria a chance de divergir do mínimo.
  min_select       integer NOT NULL DEFAULT 0,
  max_select       integer,
  allow_repeat     boolean NOT NULL DEFAULT false,
  max_per_option   integer,
  -- Quando verdadeiro, a escolha deste grupo resolve qual variante é vendida:
  -- é o que transforma tamanho e cor numa peça de estoque.
  is_variant_axis  boolean NOT NULL DEFAULT false,
  sort_order       integer NOT NULL DEFAULT 0,
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT option_groups_kind_conhecido
    CHECK (kind IN ('INGREDIENT', 'ADDON', 'VARIATION', 'FRACTION', 'SPEC')),
  CONSTRAINT option_groups_limites_coerentes
    CHECK (min_select >= 0 AND (max_select IS NULL OR max_select >= min_select))
);

CREATE INDEX IF NOT EXISTS option_groups_da_loja_idx
  ON app.option_groups (store_id, sort_order)
  INCLUDE (name, kind, min_select, max_select, is_variant_axis, deleted_at);

CREATE TABLE IF NOT EXISTS app.option_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  option_group_id   uuid NOT NULL REFERENCES app.option_groups (id) ON DELETE CASCADE,
  name              text NOT NULL,
  -- Acréscimo em centavos, que pode ser negativo (desconto por remover algo).
  price_delta_cents bigint NOT NULL DEFAULT 0,
  -- Opção esgotada aparece indisponível sem bloquear o produto inteiro: só o
  -- cheddar acabou, o hambúrguer continua à venda.
  is_available      boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS option_items_do_grupo_idx
  ON app.option_items (store_id, option_group_id, sort_order)
  INCLUDE (name, price_delta_cents, is_available, deleted_at);

-- Liga produto a grupo, para o dono cadastrar "Adicionais" uma vez e reusar em
-- vinte produtos.
CREATE TABLE IF NOT EXISTS app.product_option_groups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES app.products (id) ON DELETE CASCADE,
  option_group_id  uuid NOT NULL REFERENCES app.option_groups (id) ON DELETE CASCADE,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_option_groups_uk
  ON app.product_option_groups (store_id, product_id, option_group_id);

CREATE INDEX IF NOT EXISTS product_option_groups_do_produto_idx
  ON app.product_option_groups (store_id, product_id, sort_order)
  INCLUDE (option_group_id);

-- Resolve a grade: qual combinação de valores dos eixos identifica cada
-- variante. É o que liga "P + azul" à peça que tem estoque.
CREATE TABLE IF NOT EXISTS app.variant_option_values (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  variant_id       uuid NOT NULL REFERENCES app.product_variants (id) ON DELETE CASCADE,
  option_group_id  uuid NOT NULL REFERENCES app.option_groups (id) ON DELETE CASCADE,
  option_item_id   uuid NOT NULL REFERENCES app.option_items (id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS variant_option_values_uk
  ON app.variant_option_values (store_id, variant_id, option_group_id);

CREATE INDEX IF NOT EXISTS variant_option_values_por_valor_idx
  ON app.variant_option_values (store_id, option_item_id)
  INCLUDE (variant_id, option_group_id);

-- ── Especificações: o registro tipado, por categoria ───────────────────────
-- Escopado por CATEGORIA, e não por ramo: o dono cria a categoria Pneus e,
-- dentro dela, aro e largura. É o adendo que tem precedência sobre o desenho
-- original do modelo de dados.

CREATE TABLE IF NOT EXISTS app.attribute_definitions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  category_id       uuid NOT NULL REFERENCES app.categories (id) ON DELETE CASCADE,
  key               text NOT NULL,
  label             text NOT NULL,
  data_type         text NOT NULL DEFAULT 'TEXT',
  unit              text,
  -- Valores aceitos, quando o tipo é lista. Fora deles, o cadastro é recusado.
  allowed_values    jsonb,
  is_required       boolean NOT NULL DEFAULT false,
  -- Só especificação marcada aqui vira filtro na vitrine — e ganha índice.
  is_filterable     boolean NOT NULL DEFAULT false,
  sort_order        integer NOT NULL DEFAULT 0,
  -- Criada pelo dono ou sugerida pelo ramo, para a interface distinguir as duas.
  created_by_owner  boolean NOT NULL DEFAULT true,
  -- Remoção reversível: pedido antigo exibe o nome que a especificação tinha
  -- na época, então apagar de verdade apagaria história.
  deprecated_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attribute_definitions_tipo_conhecido
    CHECK (data_type IN ('TEXT', 'NUMBER', 'LIST', 'BOOLEAN'))
);

-- Único por loja E categoria: "aro" em Pneus e "aro" em Rodas são duas
-- especificações distintas, cada uma da sua categoria.
CREATE UNIQUE INDEX IF NOT EXISTS attribute_definitions_uk
  ON app.attribute_definitions (store_id, category_id, key)
  WHERE deprecated_at IS NULL;

CREATE INDEX IF NOT EXISTS attribute_definitions_da_categoria_idx
  ON app.attribute_definitions (store_id, category_id, sort_order)
  INCLUDE (key, label, data_type, is_required, is_filterable, deprecated_at);

CREATE TABLE IF NOT EXISTS app.product_attributes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES app.products (id) ON DELETE CASCADE,
  -- Chave estrangeira OBRIGATÓRIA para a definição: é ela que impede o modelo
  -- de virar campo livre onde qualquer chave entra e nada é validável.
  definition_id  uuid NOT NULL REFERENCES app.attribute_definitions (id) ON DELETE RESTRICT,
  value_text     text,
  value_number   numeric,
  value_boolean  boolean,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Exatamente um valor preenchido: dois seria ambíguo, nenhum seria linha
  -- inútil ocupando espaço.
  CONSTRAINT product_attributes_um_valor CHECK (
    (value_text IS NOT NULL)::int
    + (value_number IS NOT NULL)::int
    + (value_boolean IS NOT NULL)::int = 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS product_attributes_uk
  ON app.product_attributes (store_id, product_id, definition_id);

CREATE INDEX IF NOT EXISTS product_attributes_por_definicao_idx
  ON app.product_attributes (store_id, definition_id)
  INCLUDE (product_id, value_text, value_number, value_boolean);

-- ===========================================================================
-- Isolamento por linha das 11 tabelas
--
-- Toda tabela repete o mesmo desenho, e a repetição é deliberada: política
-- gerada por laço economizaria linhas e custaria a possibilidade de ler, numa
-- tabela específica, exatamente o que ela permite. Aqui o que se lê é o que
-- vale.
--
-- O conjunto de toda política permissiva cita `store_id`. Isso não é estilo: com
-- 300 mil pedidos, uma única política sem essa citação impediu o planejador de
-- fatorar a loja do conjunto, forçou varredura combinada e destruiu o acesso
-- ordenado. A guarda 4 existe por causa dessa medição.
-- ===========================================================================


ALTER TABLE app.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.categories FORCE  ROW LEVEL SECURITY;

CREATE POLICY categories_storefront_select ON app.categories FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER'));

CREATE POLICY categories_staff_select ON app.categories FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY categories_staff_insert ON app.categories FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY categories_staff_update ON app.categories FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY categories_staff_delete ON app.categories FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY categories_require_ctx ON app.categories AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY categories_admin_all ON app.categories FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);


ALTER TABLE app.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.product_categories FORCE  ROW LEVEL SECURITY;

CREATE POLICY product_categories_storefront_select ON app.product_categories FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER'));

CREATE POLICY product_categories_staff_select ON app.product_categories FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_categories_staff_insert ON app.product_categories FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_categories_staff_update ON app.product_categories FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_categories_staff_delete ON app.product_categories FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_categories_require_ctx ON app.product_categories AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY product_categories_admin_all ON app.product_categories FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);


ALTER TABLE app.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.product_images FORCE  ROW LEVEL SECURITY;

CREATE POLICY product_images_storefront_select ON app.product_images FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER'));

CREATE POLICY product_images_staff_select ON app.product_images FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_images_staff_insert ON app.product_images FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_images_staff_update ON app.product_images FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_images_staff_delete ON app.product_images FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_images_require_ctx ON app.product_images AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY product_images_admin_all ON app.product_images FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);


ALTER TABLE app.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.product_variants FORCE  ROW LEVEL SECURITY;

CREATE POLICY product_variants_storefront_select ON app.product_variants FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER'));

CREATE POLICY product_variants_staff_select ON app.product_variants FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_variants_staff_insert ON app.product_variants FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_variants_staff_update ON app.product_variants FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_variants_staff_delete ON app.product_variants FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_variants_require_ctx ON app.product_variants AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY product_variants_admin_all ON app.product_variants FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);


ALTER TABLE app.product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.product_prices FORCE  ROW LEVEL SECURITY;

CREATE POLICY product_prices_storefront_select ON app.product_prices FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER') AND kind <> 'COST');

CREATE POLICY product_prices_staff_select ON app.product_prices FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_prices_staff_insert ON app.product_prices FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_prices_staff_update ON app.product_prices FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_prices_staff_delete ON app.product_prices FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_prices_require_ctx ON app.product_prices AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY product_prices_admin_all ON app.product_prices FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);


ALTER TABLE app.option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.option_groups FORCE  ROW LEVEL SECURITY;

CREATE POLICY option_groups_storefront_select ON app.option_groups FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER'));

CREATE POLICY option_groups_staff_select ON app.option_groups FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY option_groups_staff_insert ON app.option_groups FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY option_groups_staff_update ON app.option_groups FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY option_groups_staff_delete ON app.option_groups FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY option_groups_require_ctx ON app.option_groups AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY option_groups_admin_all ON app.option_groups FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);


ALTER TABLE app.option_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.option_items FORCE  ROW LEVEL SECURITY;

CREATE POLICY option_items_storefront_select ON app.option_items FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER'));

CREATE POLICY option_items_staff_select ON app.option_items FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY option_items_staff_insert ON app.option_items FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY option_items_staff_update ON app.option_items FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY option_items_staff_delete ON app.option_items FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY option_items_require_ctx ON app.option_items AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY option_items_admin_all ON app.option_items FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);


ALTER TABLE app.product_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.product_option_groups FORCE  ROW LEVEL SECURITY;

CREATE POLICY product_option_groups_storefront_select ON app.product_option_groups FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER'));

CREATE POLICY product_option_groups_staff_select ON app.product_option_groups FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_option_groups_staff_insert ON app.product_option_groups FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_option_groups_staff_update ON app.product_option_groups FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_option_groups_staff_delete ON app.product_option_groups FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_option_groups_require_ctx ON app.product_option_groups AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY product_option_groups_admin_all ON app.product_option_groups FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);


ALTER TABLE app.variant_option_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.variant_option_values FORCE  ROW LEVEL SECURITY;

CREATE POLICY variant_option_values_storefront_select ON app.variant_option_values FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER'));

CREATE POLICY variant_option_values_staff_select ON app.variant_option_values FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY variant_option_values_staff_insert ON app.variant_option_values FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY variant_option_values_staff_update ON app.variant_option_values FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY variant_option_values_staff_delete ON app.variant_option_values FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY variant_option_values_require_ctx ON app.variant_option_values AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY variant_option_values_admin_all ON app.variant_option_values FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);


ALTER TABLE app.attribute_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.attribute_definitions FORCE  ROW LEVEL SECURITY;

CREATE POLICY attribute_definitions_storefront_select ON app.attribute_definitions FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER'));

CREATE POLICY attribute_definitions_staff_select ON app.attribute_definitions FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY attribute_definitions_staff_insert ON app.attribute_definitions FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY attribute_definitions_staff_update ON app.attribute_definitions FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY attribute_definitions_staff_delete ON app.attribute_definitions FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY attribute_definitions_require_ctx ON app.attribute_definitions AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY attribute_definitions_admin_all ON app.attribute_definitions FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);


ALTER TABLE app.product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.product_attributes FORCE  ROW LEVEL SECURITY;

CREATE POLICY product_attributes_storefront_select ON app.product_attributes FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER'));

CREATE POLICY product_attributes_staff_select ON app.product_attributes FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_attributes_staff_insert ON app.product_attributes FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_attributes_staff_update ON app.product_attributes FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_attributes_staff_delete ON app.product_attributes FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY product_attributes_require_ctx ON app.product_attributes AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY product_attributes_admin_all ON app.product_attributes FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);
