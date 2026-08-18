-- ===========================================================================
-- 0008 · Pedidos e carrinho
--
-- Quatro propriedades que este arquivo existe para garantir, e que não são
-- convenção de código: são impostas pelo banco.
--
-- 1. `orders` NÃO GUARDA DADO PESSOAL. Nome, telefone e endereço moram em
--    `order_contacts`, uma linha por pedido. Isso transforma "atender pedido de
--    exclusão da LGPD" num UPDATE de uma linha, em vez de caçada por dado
--    espalhado por cinco tabelas — e é a diferença entre cumprir a lei em
--    minutos e cumprir em semanas.
--
-- 2. ITEM DE PEDIDO É IMUTÁVEL. Nome, preço e opções são copiados como texto e
--    número no instante da compra. A chave estrangeira para o produto existe
--    como referência fraca e nunca é usada para ler preço. A imutabilidade vem
--    da AUSÊNCIA de política de alteração e remoção: mesmo um bug na aplicação
--    não consegue reescrever o pedido de ontem. Sem isso, reajustar um preço
--    hoje mudaria o histórico, a margem e a comanda já impressa.
--
-- 3. O CARRINHO É O OPOSTO: chave estrangeira VIVA para produto. É ela que
--    permite descobrir que o preço mudou ou que o item acabou e avisar ANTES
--    de fechar. Snapshot serve ao pedido; referência viva serve ao carrinho.
--
-- 4. O TOKEN DE ACOMPANHAMENTO NÃO É ENUMERÁVEL. A página é aberta sem login,
--    porque o link vai por WhatsApp. Com identificador sequencial, um laço
--    extrairia nome, telefone e endereço de todos os pedidos de todas as lojas.
-- ===========================================================================

-- O papel de migração é assumido explicitamente: sem isso os objetos nascem
-- pertencendo a quem conectou, e no banco de teste isso é outro usuário. Dono
-- errado significa privilégio errado, e o defeito só aparece quando alguém
-- tenta ler a tabela pela credencial da aplicação.
SET ROLE sc_migrator;

-- ── Numeração por loja ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.store_sequences (
  store_id     uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  -- Qual contador: 'order' hoje; amanhã pode haver outro sem migração nova.
  kind         text NOT NULL,
  prefix       text NOT NULL DEFAULT '',
  last_value   bigint NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, kind),
  CONSTRAINT store_sequences_valor_nao_negativo CHECK (last_value >= 0)
);

-- O número sai de UPDATE ... RETURNING, que é atômico: dois pedidos no mesmo
-- instante recebem números diferentes sem trava explícita na aplicação.
CREATE OR REPLACE FUNCTION app.proximo_numero_de_pedido(p_store_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_valor bigint;
BEGIN
  INSERT INTO app.store_sequences (store_id, kind, last_value)
       VALUES (p_store_id, 'order', 1)
  ON CONFLICT (store_id, kind)
    DO UPDATE SET last_value = app.store_sequences.last_value + 1,
                  updated_at = now()
  RETURNING last_value INTO v_valor;

  RETURN v_valor;
END;
$$;

-- ── Pedido ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id              uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  -- Número visível ao cliente, sequencial POR LOJA. A loja recém-aberta começa
  -- no 1, sem revelar quantos pedidos a plataforma inteira já teve.
  number                bigint NOT NULL,
  code                  text NOT NULL,
  -- 128 bits de aleatoriedade: é o que torna o endereço de acompanhamento
  -- impossível de adivinhar por tentativa.
  public_token          text NOT NULL,
  -- Nulo quando o pedido é de convidado. Exigir conta mataria a conversão do
  -- pequeno negócio, onde a maioria compra sem se cadastrar.
  store_customer_id     uuid REFERENCES app.store_customers (id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'PENDING',
  -- Site ou lançado à mão pelo dono. Sem esta coluna o painel mentiria: o
  -- movimento do balcão ficaria fora das métricas.
  channel               text NOT NULL DEFAULT 'ONLINE',
  fulfillment           text NOT NULL DEFAULT 'DELIVERY',
  payment_method        text,
  change_for_cents      bigint,
  -- Chave PIX COPIADA do momento da compra: trocar a chave da loja depois não
  -- pode alterar o que o cliente viu para pagar.
  pix_key_snapshot      text,
  pix_holder_snapshot   text,
  -- A ordem do cálculo é fixada e testada: subtotal, cupom (só sobre o
  -- subtotal), frete, desconto de retirada, total. Guardar cada parcela — em vez
  -- de só o total — é o que permite explicar ao cliente de onde veio o valor, e
  -- ao dono por que o faturamento do dia é aquele.
  subtotal_cents        bigint NOT NULL DEFAULT 0,
  items_total_cents     bigint NOT NULL DEFAULT 0,
  coupon_discount_cents bigint NOT NULL DEFAULT 0,
  delivery_fee_cents    bigint NOT NULL DEFAULT 0,
  delivery_fee_mode     text,
  pickup_discount_cents bigint NOT NULL DEFAULT 0,
  discount_cents        bigint NOT NULL DEFAULT 0,
  total_cents           bigint NOT NULL DEFAULT 0,
  currency              char(3) NOT NULL DEFAULT 'BRL',
  -- Sem cobrança automática na versão 1: este campo registra o que o dono
  -- confirmou ter recebido, e não o que um gateway respondeu.
  payment_status        text NOT NULL DEFAULT 'PENDING',
  -- A chave PIX inteira, copiada do momento da compra. O código de copiar e
  -- colar entra aqui quando existir: o cliente que digita chave à mão erra, e o
  -- pedido fica sem pagamento sem ninguém entender por quê.
  pix_key_type_snapshot text,
  pix_account_name_snapshot text,
  pix_brcode_snapshot   text,
  coupon_id             uuid,
  coupon_code_snapshot  text,
  -- Duas observações separadas: a que o cliente escreveu e a que a loja anotou.
  -- Misturar as duas faria a loja publicar sem querer o que anotou para si.
  customer_note         text,
  store_note            text,
  -- Chave de idempotência: toque duplo e nova tentativa automática devolvem o
  -- MESMO pedido, em vez de criar dois (AC-516).
  idempotency_key       text,
  -- Tamanho da mensagem enviada, para saber quando o texto passou do limite que
  -- cabe no endereço da conversa e foi encurtado.
  whatsapp_message_chars integer,
  -- Pedido agendado para depois. A pergunta Q-502 segue aberta; a coluna aceita
  -- nulo e ninguém é obrigado a usá-la.
  scheduled_for         timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- Custo somado no fechamento, para a margem no painel. Nunca sai na leitura
  -- pública.
  cost_total_cents      bigint,
  notes                 text,
  -- O estado da mensagem é SEPARADO do status do pedido. O cliente pode fechar
  -- o carrinho, o WhatsApp abrir e ele não enviar: sem esta separação, o painel
  -- encheria de pedido fantasma e o faturamento mentiria.
  whatsapp_clicked_at   timestamptz,
  whatsapp_confirmed_at timestamptz,
  -- Fuso COPIADO da loja: o que é "hoje" no painel precisa continuar o mesmo se
  -- a loja mudar de fuso amanhã.
  store_timezone        text NOT NULL DEFAULT 'America/Sao_Paulo',
  placed_at             timestamptz NOT NULL DEFAULT now(),
  accepted_at           timestamptz,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  cancel_reason         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_status_conhecido CHECK (status IN (
    'PENDING', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP',
    'OUT_FOR_DELIVERY', 'COMPLETED', 'REJECTED', 'CANCELLED'
  )),
  CONSTRAINT orders_canal_conhecido CHECK (channel IN ('ONLINE', 'MANUAL')),
  CONSTRAINT orders_entrega_conhecida CHECK (fulfillment IN ('DELIVERY', 'PICKUP')),
  CONSTRAINT orders_valores_nao_negativos CHECK (
    subtotal_cents >= 0 AND items_total_cents >= 0 AND delivery_fee_cents >= 0
    AND coupon_discount_cents >= 0 AND pickup_discount_cents >= 0
    AND discount_cents >= 0 AND total_cents >= 0
  ),
  CONSTRAINT orders_pagamento_conhecido
    CHECK (payment_status IN ('PENDING', 'AWAITING_PROOF', 'CONFIRMED', 'REFUNDED', 'FAILED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS orders_store_number_uk
  ON app.orders (store_id, number);
CREATE UNIQUE INDEX IF NOT EXISTS orders_store_code_uk
  ON app.orders (store_id, code);
-- Único global, e de propósito: o token é o endereço da página pública, e o
-- pedido é encontrado por ele antes de haver contexto de loja.
CREATE UNIQUE INDEX IF NOT EXISTS orders_public_token_uk
  ON app.orders (public_token);
-- Sem esta unicidade a chave de idempotência não impediria nada: duas
-- requisições iguais criariam dois pedidos e ninguém notaria.
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_uk
  ON app.orders (store_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- O índice do painel inclui as colunas que as POLÍTICAS citam, e não só as da
-- consulta: sem `public_token` e `store_customer_id` aqui, a reconferência do
-- isolamento vai ao disco e a leitura direta pelo índice se perde. Achado
-- medido com 300 mil pedidos.
CREATE INDEX IF NOT EXISTS orders_painel_idx
  ON app.orders (store_id, status, placed_at DESC)
  INCLUDE (number, code, total_cents, cost_total_cents, channel,
           public_token, store_customer_id);

CREATE INDEX IF NOT EXISTS orders_do_cliente_idx
  ON app.orders (store_id, store_customer_id, placed_at DESC)
  INCLUDE (number, status, total_cents, public_token);

-- ── Dado pessoal do pedido, isolado ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.order_contacts (
  order_id       uuid PRIMARY KEY REFERENCES app.orders (id) ON DELETE CASCADE,
  store_id       uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  name           text NOT NULL,
  phone_e164     text NOT NULL,
  -- Resumo criptográfico do telefone: permite que quem criar conta depois
  -- reivindique pedidos feitos como convidado, sem comparar o dado em claro.
  phone_hmac     text,
  email          text,
  doc_number     text,
  -- Quem recebe pode não ser quem pediu: presente, entrega no trabalho, pedido
  -- feito por um filho para a mãe. Sem esta coluna o entregador procura a pessoa
  -- errada.
  recipient_name text,
  street         text,
  number         text,
  complement     text,
  neighborhood   text,
  city           text,
  uf             char(2),
  zip            text,
  -- "Portão azul ao lado da padaria" resolve mais entrega no Brasil que
  -- coordenada, e é o que o cliente escreve sozinho.
  reference_point text,
  lat            numeric(10, 7),
  lng            numeric(10, 7),
  -- Preenchido quando o titular pede exclusão: o pedido continua contando para
  -- o faturamento do lojista, e o dado pessoal deixa de existir.
  anonymized_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_contacts_por_telefone_idx
  ON app.order_contacts (store_id, phone_e164)
  INCLUDE (order_id, name, anonymized_at);

-- ── Itens: cópia congelada do momento da compra ────────────────────────────

CREATE TABLE IF NOT EXISTS app.order_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  order_id            uuid NOT NULL REFERENCES app.orders (id) ON DELETE CASCADE,
  -- Referência FRACA: existe para relatório, e nunca para ler preço. Apagar o
  -- produto anula o vínculo e não toca no pedido.
  product_id          uuid REFERENCES app.products (id) ON DELETE SET NULL,
  variant_id          uuid REFERENCES app.product_variants (id) ON DELETE SET NULL,
  -- Tudo abaixo é COPIADO. O dono renomeia e apaga produto; o pedido de ontem
  -- precisa continuar dizendo o que foi vendido, com o nome da época.
  -- O sufixo `_snapshot` é deliberado: quem lê o código enxerga na hora que
  -- aquele valor é cópia do momento da compra, e não algo a buscar no produto.
  product_name        text NOT NULL,
  variant_name        text,
  sku_snapshot        text,
  quantity            integer NOT NULL,
  unit_price_cents    bigint NOT NULL,
  compare_at_cents    bigint,
  unit_cost_cents     bigint,
  price_kind_snapshot text,
  -- Especificações copiadas: o cupom da autopeça precisa dizer o aro que foi
  -- vendido, mesmo que a especificação seja renomeada depois.
  attributes_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  options_total_cents bigint NOT NULL DEFAULT 0,
  line_total_cents    bigint NOT NULL,
  note                text,
  -- Qual metade da pizza este item representa. Nulo para item inteiro.
  fraction_index      smallint,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_items_quantidade_positiva CHECK (quantity > 0),
  CONSTRAINT order_items_valores_nao_negativos CHECK (
    unit_price_cents >= 0 AND line_total_cents >= 0 AND options_total_cents >= 0
  )
);

CREATE INDEX IF NOT EXISTS order_items_do_pedido_idx
  ON app.order_items (store_id, order_id)
  -- `id` entra porque a política de acompanhamento o cita: sem ele a
  -- reconferência do isolamento vai ao disco e a leitura pelo índice se perde.
  INCLUDE (id, product_name, quantity, unit_price_cents, line_total_cents);

CREATE INDEX IF NOT EXISTS order_items_por_produto_idx
  ON app.order_items (store_id, product_id)
  INCLUDE (id, order_id, quantity, line_total_cents, unit_cost_cents);

CREATE TABLE IF NOT EXISTS app.order_item_options (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  order_item_id     uuid NOT NULL REFERENCES app.order_items (id) ON DELETE CASCADE,
  option_group_id   uuid REFERENCES app.option_groups (id) ON DELETE SET NULL,
  option_item_id    uuid REFERENCES app.option_items (id) ON DELETE SET NULL,
  -- Nome do grupo e da opção por extenso, porque o dono renomeia e apaga grupo
  -- de opção, e o cupom impresso precisa continuar legível.
  group_name_snapshot  text NOT NULL,
  option_name_snapshot text NOT NULL,
  kind_snapshot        text,
  external_code_snapshot text,
  -- ADD ou REMOVE: "sem cebola" é uma escolha do cliente tanto quanto "com
  -- bacon", e a cozinha precisa ler as duas no mesmo cupom.
  action            text NOT NULL DEFAULT 'ADD',
  quantity          integer NOT NULL DEFAULT 1,
  price_delta_cents bigint NOT NULL DEFAULT 0,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_item_options_quantidade_positiva CHECK (quantity > 0),
  CONSTRAINT order_item_options_acao_conhecida CHECK (action IN ('ADD', 'REMOVE'))
);

CREATE INDEX IF NOT EXISTS order_item_options_do_item_idx
  ON app.order_item_options (store_id, order_item_id)
  INCLUDE (group_name_snapshot, option_name_snapshot, action, price_delta_cents);

-- ── Histórico de status ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.order_status_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  order_id     uuid NOT NULL REFERENCES app.orders (id) ON DELETE CASCADE,
  from_status  text,
  to_status    text NOT NULL,
  -- Quem mudou. Nulo quando foi o próprio sistema.
  changed_by_identity_id uuid REFERENCES app.identities (id) ON DELETE SET NULL,
  -- Em qual papel a pessoa agiu. A mesma identidade pode ser dona de uma loja e
  -- cliente de outra, e sem o papel a trilha não diz em que condição ela agiu.
  actor_role   text,
  reason       text,
  -- Quando aconteceu, separado de quando foi registrado: pedido lançado à mão
  -- pelo dono pode registrar transição que ocorreu antes.
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_status_history_do_pedido_idx
  ON app.order_status_history (store_id, order_id, occurred_at)
  INCLUDE (id, from_status, to_status, changed_by_identity_id, actor_role, reason);

-- ── Carrinho: o oposto do pedido ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.carts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  store_customer_id  uuid REFERENCES app.store_customers (id) ON DELETE SET NULL,
  -- Identifica o carrinho do visitante anônimo, que é a maioria.
  session_token      text NOT NULL,
  -- 'MANUAL' é o rascunho do pedido que o dono monta no balcão: mesma estrutura,
  -- mesma validação de grupo obrigatório, outro canal.
  channel            text NOT NULL DEFAULT 'ONLINE',
  -- Preenchido quando virou pedido. Carrinho fechado não é apagado: é o rastro
  -- de quem chegou perto de comprar.
  converted_at       timestamptz,
  abandoned_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carts_canal_conhecido CHECK (channel IN ('ONLINE', 'MANUAL'))
);

CREATE UNIQUE INDEX IF NOT EXISTS carts_sessao_uk
  ON app.carts (store_id, session_token) WHERE converted_at IS NULL;

CREATE INDEX IF NOT EXISTS carts_da_loja_idx
  ON app.carts (store_id, updated_at DESC)
  INCLUDE (store_customer_id, channel, converted_at);

CREATE TABLE IF NOT EXISTS app.cart_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  cart_id       uuid NOT NULL REFERENCES app.carts (id) ON DELETE CASCADE,
  -- Chave estrangeira VIVA, ao contrário do item de pedido: é ela que permite
  -- descobrir que o preço mudou ou o item acabou e avisar antes de fechar.
  product_id    uuid NOT NULL REFERENCES app.products (id) ON DELETE CASCADE,
  variant_id    uuid REFERENCES app.product_variants (id) ON DELETE CASCADE,
  quantity      integer NOT NULL DEFAULT 1,
  notes         text,
  -- As escolhas ficam em JSON aqui porque o carrinho é rascunho: o formato
  -- congelado nasce quando o pedido nasce.
  options       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_items_quantidade_positiva CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS cart_items_do_carrinho_idx
  ON app.cart_items (store_id, cart_id)
  INCLUDE (product_id, variant_id, quantity, options);

-- ===========================================================================
-- Isolamento por linha
--
-- A diferença entre as duas famílias abaixo é o coração deste arquivo.
--
-- O pedido e seus itens recebem política de LEITURA e INSERÇÃO, e nenhuma de
-- alteração ou remoção — nem para a equipe da loja. Não é rigor decorativo:
-- é o que faz "o pedido é registro do momento da compra" virar propriedade do
-- banco em vez de promessa da aplicação. Um bug no código não consegue
-- reescrever o pedido de ontem.
--
-- O histórico de status segue a mesma regra: linha de trilha que pode ser
-- alterada não é trilha.
--
-- O carrinho é o oposto — rascunho, feito para mudar.
-- ===========================================================================


ALTER TABLE app.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.orders FORCE  ROW LEVEL SECURITY;

CREATE POLICY orders_staff_select ON app.orders FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY orders_staff_insert ON app.orders FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- O pedido ANDA: aceitar, preparar, entregar, concluir. É o item que é cópia
-- congelada, não o pedido inteiro — sem esta política a loja não conseguiria
-- trabalhar. Não há política de remoção, e é de propósito.
CREATE POLICY orders_staff_update ON app.orders FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- A página pública de acompanhamento: quem tem o link lê AQUELE pedido, e só
-- ele. O token chega por parâmetro de sessão que a API grava na transação, o
-- que mantém a decisão no banco em vez de num filtro que alguém pode esquecer.
CREATE POLICY orders_track_select ON app.orders FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND public_token = nullif(current_setting('app.order_token', true), ''));

CREATE POLICY orders_require_ctx ON app.orders AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

-- A administração lê, insere e altera o pedido, mas NUNCA apaga: retenção
-- fiscal e histórico do comprador dependem de ele continuar existindo. Uma
-- política FOR ALL daria o poder de apagar de lambuja.
CREATE POLICY orders_admin_select ON app.orders FOR SELECT TO sc_admin USING (true);
CREATE POLICY orders_admin_insert ON app.orders FOR INSERT TO sc_admin WITH CHECK (true);
CREATE POLICY orders_admin_update ON app.orders FOR UPDATE TO sc_admin
  USING (true) WITH CHECK (true);


ALTER TABLE app.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.order_items FORCE  ROW LEVEL SECURITY;

CREATE POLICY order_items_staff_select ON app.order_items FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY order_items_staff_insert ON app.order_items FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY order_items_track_select ON app.order_items FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND EXISTS (
       SELECT 1 FROM app.orders o
        WHERE o.id = app.order_items.order_id
          AND o.store_id = (SELECT app.current_store_id())
          AND o.public_token = nullif(current_setting('app.order_token', true), '')));

CREATE POLICY order_items_require_ctx ON app.order_items AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

-- Nem a administração altera nem apaga: o item é cópia congelada do momento da compra.
CREATE POLICY order_items_admin_select ON app.order_items FOR SELECT TO sc_admin USING (true);
CREATE POLICY order_items_admin_insert ON app.order_items FOR INSERT TO sc_admin WITH CHECK (true);


ALTER TABLE app.order_item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.order_item_options FORCE  ROW LEVEL SECURITY;

CREATE POLICY order_item_options_staff_select ON app.order_item_options FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY order_item_options_staff_insert ON app.order_item_options FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY order_item_options_require_ctx ON app.order_item_options AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

-- Nem a administração altera nem apaga: a opção escolhida é cópia congelada.
CREATE POLICY order_item_options_admin_select ON app.order_item_options FOR SELECT TO sc_admin USING (true);
CREATE POLICY order_item_options_admin_insert ON app.order_item_options FOR INSERT TO sc_admin WITH CHECK (true);


ALTER TABLE app.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.order_status_history FORCE  ROW LEVEL SECURITY;

CREATE POLICY order_status_history_staff_select ON app.order_status_history FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY order_status_history_staff_insert ON app.order_status_history FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY order_status_history_track_select ON app.order_status_history FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND EXISTS (
       SELECT 1 FROM app.orders o
        WHERE o.id = app.order_status_history.order_id
          AND o.store_id = (SELECT app.current_store_id())
          AND o.public_token = nullif(current_setting('app.order_token', true), '')));

CREATE POLICY order_status_history_require_ctx ON app.order_status_history AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

-- Nem a administração altera nem apaga: transição registrada é fato passado: corrigir se escreve como transição nova.
CREATE POLICY order_status_history_admin_select ON app.order_status_history FOR SELECT TO sc_admin USING (true);
CREATE POLICY order_status_history_admin_insert ON app.order_status_history FOR INSERT TO sc_admin WITH CHECK (true);


ALTER TABLE app.order_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.order_contacts FORCE  ROW LEVEL SECURITY;

CREATE POLICY order_contacts_staff_select ON app.order_contacts FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY order_contacts_staff_insert ON app.order_contacts FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY order_contacts_require_ctx ON app.order_contacts AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY order_contacts_admin_all ON app.order_contacts FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);


ALTER TABLE app.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.carts FORCE  ROW LEVEL SECURITY;

CREATE POLICY carts_staff_select ON app.carts FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()));

CREATE POLICY carts_staff_insert ON app.carts FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()));

CREATE POLICY carts_staff_update ON app.carts FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()))
  WITH CHECK (store_id = (SELECT app.current_store_id()));

CREATE POLICY carts_staff_delete ON app.carts FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()));

CREATE POLICY carts_require_ctx ON app.carts AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY carts_admin_all ON app.carts FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);


ALTER TABLE app.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cart_items FORCE  ROW LEVEL SECURITY;

CREATE POLICY cart_items_staff_select ON app.cart_items FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()));

CREATE POLICY cart_items_staff_insert ON app.cart_items FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()));

CREATE POLICY cart_items_staff_update ON app.cart_items FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()))
  WITH CHECK (store_id = (SELECT app.current_store_id()));

CREATE POLICY cart_items_staff_delete ON app.cart_items FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()));

CREATE POLICY cart_items_require_ctx ON app.cart_items AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY cart_items_admin_all ON app.cart_items FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);


ALTER TABLE app.store_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_sequences FORCE  ROW LEVEL SECURITY;

CREATE POLICY store_sequences_staff_select ON app.store_sequences FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()));

CREATE POLICY store_sequences_staff_insert ON app.store_sequences FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()));

CREATE POLICY store_sequences_staff_update ON app.store_sequences FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()))
  WITH CHECK (store_id = (SELECT app.current_store_id()));

CREATE POLICY store_sequences_staff_delete ON app.store_sequences FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()));

CREATE POLICY store_sequences_require_ctx ON app.store_sequences AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY store_sequences_admin_all ON app.store_sequences FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);


-- ===========================================================================
-- Privilégios
--
-- Concedidos EXPLICITAMENTE, e não herdados do privilégio padrão do esquema.
-- O padrão vale apenas para tabela criada pela credencial que o declarou: se a
-- migração rodar por outro caminho — e ela roda, no molde do banco de teste —,
-- a tabela nasce sem privilégio e o defeito aparece como "permission denied"
-- num teste distante, meses depois.
--
-- O privilégio acompanha a política, tabela por tabela. Dar UPDATE no banco a
-- uma tabela cuja política nega alteração criaria duas verdades diferentes
-- sobre a mesma tabela, e a que vale seria decidida por acidente.
-- ===========================================================================
-- Leitura e inserção apenas: item de pedido é cópia congelada.
GRANT SELECT, INSERT ON app.order_items TO sc_app, sc_admin;
GRANT SELECT, INSERT ON app.order_item_options TO sc_app, sc_admin;
GRANT SELECT, INSERT ON app.order_status_history TO sc_app, sc_admin;

-- O pedido anda (status muda), mas nunca é apagado.
GRANT SELECT, INSERT, UPDATE ON app.orders TO sc_app, sc_admin;

-- Carrinho e contador são rascunho por natureza.
GRANT SELECT, INSERT, UPDATE, DELETE ON app.store_sequences TO sc_app, sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.order_contacts TO sc_app, sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.carts TO sc_app, sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.cart_items TO sc_app, sc_admin;

GRANT EXECUTE ON FUNCTION app.proximo_numero_de_pedido(uuid) TO sc_app, sc_admin;

RESET ROLE;
