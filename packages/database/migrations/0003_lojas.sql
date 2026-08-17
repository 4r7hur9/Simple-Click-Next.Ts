-- ===========================================================================
-- 0003 — A loja: raiz do isolamento.
--
-- `stores` é a única tabela de loja SEM a política restritiva de contexto
-- obrigatório, e isso é deliberado: é preciso descobrir qual é a loja antes de
-- poder definir o contexto dela. Esse único ponto é servido por
-- `app.resolve_store`, que devolve uma lista fechada de campos — nunca a linha
-- inteira, porque configuração de loja guarda chave PIX e endereço do titular,
-- e vazamento na serialização o isolamento por linha não impede.
--
-- Fica para as próximas tarefas: `store_hours`, `store_hour_exceptions`,
-- `store_contracts`, `plans`, `subscriptions`, `store_feature_overrides`,
-- `delivery_zones` e `store_payment_methods`.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- vertical_presets — catálogo global de tipos de negócio
-- ---------------------------------------------------------------------------
-- Global de propósito: é o que permite servir comida, roupa, peça e eletrônico
-- na mesma tabela de produto sem ramificar o esquema. Um ramo novo é uma linha
-- aqui, não uma migração.
CREATE TABLE IF NOT EXISTS app.vertical_presets (
  code                       text PRIMARY KEY,
  label                      text    NOT NULL,
  -- Vocabulário da interface: 'Cardápio' ou 'Catálogo', 'Ingredientes' ou
  -- 'Especificações'.
  labels                     jsonb   NOT NULL,
  -- Composição de tela, e não só dicionário de palavras: quais blocos
  -- aparecem, em que ordem e quais ficam ocultos por tela. Sem isto a
  -- adaptação por ramo seria só troca de rótulo.
  blocos                     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  default_option_group_kinds text[]  NOT NULL DEFAULT '{}',
  schema_version             integer NOT NULL DEFAULT 1,
  is_food                    boolean NOT NULL DEFAULT false,
  -- Estoque por variação nasce ligado onde a unidade é contável e desligado
  -- para comida. É valor sugerido no cadastro da loja, não trava.
  tracks_stock               boolean NOT NULL DEFAULT false,
  sort_order                 integer NOT NULL DEFAULT 0
);

ALTER TABLE app.vertical_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.vertical_presets FORCE  ROW LEVEL SECURITY;

-- Catálogo de plataforma: qualquer conexão de execução lê, ninguém de fora da
-- administração escreve.
CREATE POLICY vertical_presets_select ON app.vertical_presets FOR SELECT TO sc_app
  USING (true);
CREATE POLICY vertical_presets_admin_all ON app.vertical_presets FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

INSERT INTO app.vertical_presets
  (code, label, labels, blocos, default_option_group_kinds, is_food, tracks_stock, sort_order)
VALUES
  ('FOOD_SNACK', 'Lanchonete',
   '{"catalogo":"Cardápio","grupo_opcao":"Ingredientes","variacao":"Sabor","busca_placeholder":"O que você gostaria de comer?"}',
   '{"cadastro_produto":["identificacao","preco","ingredientes","tempo_preparo"],"detalhe_produto":["foto","descricao","ingredientes","adicionais"],"vitrine":["destaques","categorias","lista"]}',
   '{INGREDIENT,ADDON}', true, false, 1),
  ('FOOD_RESTAURANT', 'Restaurante',
   '{"catalogo":"Cardápio","grupo_opcao":"Acompanhamentos","variacao":"Porção","busca_placeholder":"O que você gostaria de comer?"}',
   '{"cadastro_produto":["identificacao","preco","acompanhamentos","tempo_preparo"],"detalhe_produto":["foto","descricao","acompanhamentos"],"vitrine":["destaques","categorias","lista"]}',
   '{INGREDIENT,ADDON}', true, false, 2),
  ('FOOD_ACAI', 'Açaiteria',
   '{"catalogo":"Cardápio","grupo_opcao":"Complementos","variacao":"Tamanho","busca_placeholder":"Monte o seu açaí"}',
   '{"cadastro_produto":["identificacao","preco","complementos"],"detalhe_produto":["foto","descricao","complementos"],"vitrine":["destaques","categorias","lista"]}',
   '{ADDON,VARIATION}', true, false, 3),
  ('RETAIL_GENERIC', 'Loja',
   '{"catalogo":"Catálogo","grupo_opcao":"Opções","variacao":"Variação","busca_placeholder":"O que você procura?"}',
   '{"cadastro_produto":["identificacao","preco","especificacoes","estoque"],"detalhe_produto":["fotos","descricao","especificacoes","variacoes"],"vitrine":["categorias","filtros","lista"]}',
   '{VARIATION,SPEC}', false, true, 4),
  ('APPAREL', 'Roupas',
   '{"catalogo":"Catálogo","grupo_opcao":"Especificações","variacao":"Tamanho","busca_placeholder":"O que você procura?"}',
   '{"cadastro_produto":["identificacao","preco","grade","estoque"],"detalhe_produto":["fotos","descricao","grade","tabela_medidas"],"vitrine":["categorias","filtros","lista"]}',
   '{VARIATION,SPEC}', false, true, 5),
  ('AUTO_PARTS', 'Autopeças',
   '{"catalogo":"Catálogo","grupo_opcao":"Especificações","variacao":"Aplicação","busca_placeholder":"Peça, código ou aplicação"}',
   '{"cadastro_produto":["identificacao","preco","especificacoes","aplicacao","estoque"],"detalhe_produto":["fotos","especificacoes","aplicacao","compatibilidade"],"vitrine":["busca","filtros","lista"]}',
   '{SPEC,VARIATION}', false, true, 6),
  ('ELECTRONICS', 'Eletrônicos',
   '{"catalogo":"Catálogo","grupo_opcao":"Especificações","variacao":"Modelo","busca_placeholder":"O que você procura?"}',
   '{"cadastro_produto":["identificacao","preco","especificacoes","garantia","estoque"],"detalhe_produto":["fotos","especificacoes","garantia","variacoes"],"vitrine":["categorias","filtros","lista"]}',
   '{SPEC,VARIATION}', false, true, 7),
  ('BEVERAGES', 'Bebidas',
   '{"catalogo":"Catálogo","grupo_opcao":"Opções","variacao":"Volume","busca_placeholder":"O que você quer beber?"}',
   '{"cadastro_produto":["identificacao","preco","volume","estoque"],"detalhe_produto":["fotos","descricao","volume"],"vitrine":["destaques","categorias","lista"]}',
   '{VARIATION}', false, true, 8)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- stores — a raiz do inquilino
-- ---------------------------------------------------------------------------
-- Aqui só entram colunas que participam de índice, de política de isolamento,
-- de roteamento ou de decisão de plano. O resto da configuração — perto de
-- centenas de chaves — mora em `store_settings`, senão cada decisão de produto
-- viraria migração na tabela mais lida do sistema.
CREATE TABLE IF NOT EXISTS app.stores (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     text        NOT NULL,
  name                     text        NOT NULL,
  legal_name               text,
  doc_number               text,
  doc_type                 text,
  slug                     text        NOT NULL,
  status                   text        NOT NULL DEFAULT 'PENDING',
  vertical_code            text        NOT NULL REFERENCES app.vertical_presets (code),
  vertical_schema_version  integer     NOT NULL DEFAULT 1,
  -- Fuso por loja, no padrão IANA: 'agora' é relativo. Fortaleza e Rio Branco
  -- não compartilham o mesmo dia, e calcular 'loja aberta' pelo relógio do
  -- servidor deixaria pedir com a loja fechada.
  timezone                 text        NOT NULL DEFAULT 'America/Sao_Paulo',
  currency                 char(3)     NOT NULL DEFAULT 'BRL',
  open_state               text        NOT NULL DEFAULT 'SCHEDULE',
  temporarily_closed_until timestamptz,
  fulfillment_modes        text[]      NOT NULL DEFAULT '{DELIVERY,PICKUP}',
  whatsapp_e164            text,
  phone1                   text,
  phone2                   text,
  email                    text,
  street                   text,
  number                   text,
  complement               text,
  neighborhood             text,
  city                     text,
  uf                       text,
  zip                      text,
  lat                      numeric(9, 6),
  lng                      numeric(9, 6),
  -- Versão do catálogo: sobe a cada mudança e é o que invalida o cache sem
  -- precisar apagar chave por chave.
  catalog_version          bigint      NOT NULL DEFAULT 1,
  deleted_at               timestamptz,
  purge_after              timestamptz,
  created_by               uuid REFERENCES app.identities (id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stores_status_ck
    CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED')),
  CONSTRAINT stores_open_state_ck
    CHECK (open_state IN ('SCHEDULE', 'ALWAYS_OPEN', 'TEMPORARILY_CLOSED', 'PERMANENTLY_CLOSED')),
  CONSTRAINT stores_doc_type_ck
    CHECK (doc_type IS NULL OR doc_type IN ('CPF', 'CNPJ'))
);

-- As duas únicas globais desta tabela são chaves de roteamento e de busca da
-- administração, e por isso globais por definição. Estão na lista fechada da
-- guarda de estrutura.
CREATE UNIQUE INDEX IF NOT EXISTS stores_slug_uk
  ON app.stores (lower(slug)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stores_code_uk
  ON app.stores (code);
CREATE INDEX IF NOT EXISTS stores_doc_number_ix
  ON app.stores (doc_number);
CREATE INDEX IF NOT EXISTS stores_status_ix
  ON app.stores (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS stores_name_trgm_ix
  ON app.stores USING gin (name gin_trgm_ops);

DROP TRIGGER IF EXISTS stores_touch ON app.stores;
CREATE TRIGGER stores_touch BEFORE UPDATE ON app.stores
  FOR EACH ROW EXECUTE FUNCTION app.tocar_atualizado_em();

ALTER TABLE app.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.stores FORCE  ROW LEVEL SECURITY;

-- Vitrine: loja suspensa ou excluída não existe para o público.
CREATE POLICY stores_public_select ON app.stores FOR SELECT TO sc_app
  USING (id = (SELECT app.current_store_id())
     AND status = 'ACTIVE' AND deleted_at IS NULL);

-- O dono vê a própria loja em qualquer estado, inclusive suspensa — senão ele
-- não teria como saber por que a vitrine sumiu.
CREATE POLICY stores_staff_select ON app.stores FOR SELECT TO sc_app
  USING (id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY stores_staff_update ON app.stores FOR UPDATE TO sc_app
  USING      (id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY stores_admin_all ON app.stores FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- Criar, suspender e excluir loja é da administração. O isolamento por linha já
-- nega, mas o privilégio também é retirado: duas camadas, porque a de cima
-- depende de política escrita certo e a de baixo não depende de nada.
REVOKE INSERT, DELETE ON app.stores FROM sc_app;

-- O isolamento por linha protege a LINHA, nunca a COLUNA. O tipo de negócio
-- muda o vocabulário e o layout de todas as telas, e mudá-lo é decisão de
-- administração; o estado da loja também. Como não existe política por coluna,
-- a trava é o privilégio.
--
-- A retirada tem de ser do privilégio de TABELA antes da concessão por coluna:
-- retirar coluna de quem tem a tabela inteira não tira nada — o privilégio mais
-- amplo continua valendo e o comando passa em silêncio. Por isso o desenho é
-- lista fechada do que o dono altera, e não lista do que ele não altera.
REVOKE UPDATE ON app.stores FROM sc_app;
GRANT UPDATE (
  name, legal_name, doc_number, doc_type, slug,
  timezone, currency, open_state, temporarily_closed_until, fulfillment_modes,
  whatsapp_e164, phone1, phone2, email,
  street, number, complement, neighborhood, city, uf, zip, lat, lng
) ON app.stores TO sc_app;

-- ---------------------------------------------------------------------------
-- store_settings — configuração da loja
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.store_settings (
  store_id       uuid PRIMARY KEY REFERENCES app.stores (id) ON DELETE CASCADE,
  theme          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  landing        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Coletar e obrigar são decisões separadas: pedir documento porque a tela
  -- tem campo é coleta sem finalidade.
  checkout       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  delivery       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Guarda a chave PIX. Por isso esta tabela nunca é lida pela vitrine: o que
  -- o público precisa sai por função com lista fechada de campos.
  payment        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  whatsapp       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  printing       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  seo            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  notifications  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  schema_version integer     NOT NULL DEFAULT 1,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS store_settings_touch ON app.store_settings;
CREATE TRIGGER store_settings_touch BEFORE UPDATE ON app.store_settings
  FOR EACH ROW EXECUTE FUNCTION app.tocar_atualizado_em();

ALTER TABLE app.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_settings FORCE  ROW LEVEL SECURITY;

CREATE POLICY settings_staff_all ON app.store_settings FOR ALL TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY settings_require_ctx ON app.store_settings AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY settings_admin_all ON app.store_settings FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- store_domains — os endereços que resolvem para a loja
-- ---------------------------------------------------------------------------
-- Guarda também o histórico de apelidos, porque trocar o apelido tem de
-- preservar o endereço antigo com redirecionamento — link compartilhado no
-- WhatsApp não se atualiza sozinho.
CREATE TABLE IF NOT EXISTS app.store_domains (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id              uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  host                  text NOT NULL,
  kind                  text NOT NULL,
  is_canonical          boolean NOT NULL DEFAULT false,
  verified_at           timestamptz,
  redirect_to_canonical boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_domains_kind_ck
    CHECK (kind IN ('SUBDOMAIN', 'CUSTOM', 'LEGACY_SLUG'))
);

-- Única global consciente: assim como o apelido, o endereço é chave de
-- roteamento público — dois inquilinos não podem reivindicar o mesmo host, e
-- descobrir a loja acontece ANTES de existir contexto de loja. Entra na lista
-- fechada da guarda de unicidade por loja (T-005), ao lado de `stores_slug_uk`.
CREATE UNIQUE INDEX IF NOT EXISTS store_domains_host_uk
  ON app.store_domains (lower(host));
CREATE UNIQUE INDEX IF NOT EXISTS store_domains_canonico_uk
  ON app.store_domains (store_id) WHERE is_canonical;
CREATE INDEX IF NOT EXISTS store_domains_store_ix
  ON app.store_domains (store_id);

ALTER TABLE app.store_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_domains FORCE  ROW LEVEL SECURITY;

CREATE POLICY domains_staff_select ON app.store_domains FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY domains_require_ctx ON app.store_domains AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

-- Cadastro e verificação de endereço próprio são da administração.
CREATE POLICY domains_admin_all ON app.store_domains FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- store_members — quem opera a loja
-- ---------------------------------------------------------------------------
-- Separa 'quem sou' de 'o que posso naquela loja'. É o que já abre caminho para
-- um dono com duas lojas sem trocar o modelo depois.
CREATE TABLE IF NOT EXISTS app.store_members (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  identity_id         uuid NOT NULL REFERENCES app.identities (id),
  role                text NOT NULL,
  permissions         jsonb NOT NULL DEFAULT '{}'::jsonb,
  invited_by          uuid REFERENCES app.identities (id),
  invite_accepted_at  timestamptz,
  revoked_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_members_role_ck CHECK (role IN ('OWNER', 'STAFF'))
);

CREATE UNIQUE INDEX IF NOT EXISTS store_members_store_identity_uk
  ON app.store_members (store_id, identity_id);
CREATE INDEX IF NOT EXISTS store_members_identity_ix
  ON app.store_members (identity_id) WHERE revoked_at IS NULL;

ALTER TABLE app.store_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_members FORCE  ROW LEVEL SECURITY;

CREATE POLICY members_staff_select ON app.store_members FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY members_staff_insert ON app.store_members FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY members_staff_update ON app.store_members FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY members_staff_delete ON app.store_members FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY members_require_ctx ON app.store_members AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY members_admin_all ON app.store_members FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Resolução da loja — o problema do ovo e da galinha
-- ---------------------------------------------------------------------------
-- Roda com os direitos de quem a definiu porque precisa enxergar antes de haver
-- contexto. Em troca, devolve uma lista fechada de campos: nunca a linha
-- inteira. Foi assim que um concorrente expôs chave PIX, nome do titular,
-- telefone e coordenadas num endereço público — vazamento na serialização, que
-- nenhuma política de linha impede.
CREATE OR REPLACE FUNCTION app.resolve_store(p_host text, p_slug text)
RETURNS TABLE (
  id uuid, slug text, status text, vertical_code text,
  timezone text, catalog_version bigint, canonical_host text,
  redirect_needed boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT s.id, s.slug, s.status, s.vertical_code, s.timezone, s.catalog_version,
          d.host, coalesce(d.kind = 'LEGACY_SLUG', false)
     FROM app.stores s
     LEFT JOIN app.store_domains d ON d.store_id = s.id AND d.is_canonical
    WHERE s.deleted_at IS NULL
      AND ( (p_host IS NOT NULL AND EXISTS (SELECT 1 FROM app.store_domains x
                                             WHERE x.store_id = s.id
                                               AND lower(x.host) = lower(p_host)))
         OR (p_slug IS NOT NULL AND lower(s.slug) = lower(p_slug)) )
    LIMIT 1 $$;

REVOKE ALL ON FUNCTION app.resolve_store(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_store(text, text) TO sc_app, sc_admin;

-- 'Minhas lojas' no login atravessa lojas por natureza, então não pode virar
-- política: uma política sem o identificador da loja no conjunto destruiria o
-- acesso ordenado por índice das tabelas quentes. Caminho de baixo volume paga
-- a função; caminho quente fica com o predicado simples.
CREATE OR REPLACE FUNCTION app.my_stores()
RETURNS TABLE (store_id uuid, slug text, name text, member_role text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT m.store_id, s.slug, s.name, m.role, s.status
     FROM app.store_members m
     JOIN app.stores s ON s.id = m.store_id
    WHERE m.identity_id IS NOT DISTINCT FROM app.current_user_id()
      AND app.current_user_id() IS NOT NULL
      AND m.revoked_at IS NULL
      AND s.deleted_at IS NULL
    ORDER BY s.name $$;

REVOKE ALL ON FUNCTION app.my_stores() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.my_stores() TO sc_app;
