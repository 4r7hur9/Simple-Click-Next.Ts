-- 0018 — a vitrine não vê variação, grupo nem opção apagados
--
-- O QUE ESTAVA ERRADO. As políticas públicas de `product_variants`,
-- `option_groups` e `option_items` deixavam PUBLIC ler TODAS as linhas da loja,
-- inclusive as removidas por `deleted_at` e os grupos desligados por
-- `is_active`. O nome delas dizia "storefront"; o conteúdo dizia apenas "é
-- desta loja e quem pergunta é público".
--
-- É EXATAMENTE O DEFEITO QUE A 0016 CORRIGIU EM `categories`, nas tabelas
-- vizinhas — e pelo mesmo motivo de ele ter passado despercebido: nada as lia.
-- O código que as lê começa agora (T-405), e a hora de fechar é antes.
--
-- O QUE VAZARIA. O tamanho que a loja parou de vender, o sabor que saiu do
-- cardápio, o grupo "Promoção de julho" desligado em agosto. Cada um desses é
-- uma decisão comercial do dono, e nenhuma é informação pública. Pior que o
-- vazamento: o grupo apagado apareceria na PÁGINA como escolha possível, e um
-- pedido nasceria com um sabor que a cozinha não faz mais.
--
-- `is_available` NÃO ENTRA NESTAS POLÍTICAS, e a diferença é o ponto todo:
--
--   * `deleted_at` e `is_active` são VISIBILIDADE — o dono decidiu que aquilo
--     não existe mais para o público, e a garantia tem de morar no banco;
--   * `is_available` é DADO — o cheddar acabou, e a página PRECISA mostrar a
--     opção marcada como esgotada. Escondê-la faria o produto parecer ter menos
--     opções do que tem, e o cliente concluiria que a loja nunca teve cheddar.
--
-- Filtrar por `is_available` aqui seria repetir na política um filtro que é da
-- tela, e apagar do público a informação de que a coisa existe e voltou amanhã.
--
-- A POLÍTICA DO STAFF NÃO MUDA. Quem administra a loja precisa enxergar o que
-- apagou e o que desligou, senão não teria como reativar.
--
-- `product_prices` NÃO PRECISA DE MUDANÇA: ela já cobra `kind <> 'COST'`, que é
-- a parte sensível (o custo interno), e preço não tem `deleted_at`. O que ela
-- ainda não cobra — janela de vigência e `is_active` — é decisão de QUAL preço
-- vale agora, e isso é do domínio, não da visibilidade: um preço fora da
-- janela não é segredo, é um preço que não se aplica. Quem escolhe é o caso de
-- uso, e está anotado como tal.

BEGIN;

DROP POLICY IF EXISTS product_variants_storefront_select ON app.product_variants;

CREATE POLICY product_variants_storefront_select ON app.product_variants FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER')
     AND deleted_at IS NULL);

DROP POLICY IF EXISTS option_groups_storefront_select ON app.option_groups;

CREATE POLICY option_groups_storefront_select ON app.option_groups FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER')
     AND is_active
     AND deleted_at IS NULL);

DROP POLICY IF EXISTS option_items_storefront_select ON app.option_items;

CREATE POLICY option_items_storefront_select ON app.option_items FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER')
     AND deleted_at IS NULL);

COMMIT;

-- ── O índice acompanha a política (guarda G5) ──────────────────────────────
--
-- A guarda G5 cobra que todo índice cobridor inclua as colunas que as POLÍTICAS
-- citam. Sem isso a reconferência do isolamento vai ao disco, e a leitura
-- direta pelo índice — que é o motivo de o índice existir — não acontece.
--
-- `option_groups_da_loja_idx` já incluía `deleted_at`; passou a faltar
-- `is_active`, que a política acima começou a citar. As outras duas tabelas já
-- estavam cobertas: `product_variants_do_produto_idx` e `option_items_do_grupo_idx`
-- incluem `deleted_at`, e nenhuma das duas políticas cita outra coluna nova.
--
-- Foi o portão que apontou isto, e não uma revisão: a guarda leu o catálogo do
-- PostgreSQL e comparou política com índice. É o tipo de erro que passa em toda
-- revisão humana e só aparece como lentidão meses depois.

BEGIN;

DROP INDEX IF EXISTS app.option_groups_da_loja_idx;

CREATE INDEX IF NOT EXISTS option_groups_da_loja_idx
  ON app.option_groups (store_id, sort_order)
  INCLUDE (name, kind, min_select, max_select, is_variant_axis, is_active, deleted_at);

COMMIT;
