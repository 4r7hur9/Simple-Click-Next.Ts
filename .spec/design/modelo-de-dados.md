# Modelo de dados — SimpleClick v2

> Documento de projeto da feature `fundacao`. As decisões abaixo foram **validadas
> contra PostgreSQL 16.14 real**, com 300 mil pedidos e 120 mil produtos gerados —
> três achados medidos mudaram o desenho e estão marcados como MEDIDO.

## Ajustes decididos DEPOIS desta modelagem (têm precedência)

Estas quatro decisões do dono do produto, de 17/08/2026, são posteriores ao
desenho descrito abaixo e **prevalecem sobre ele**. Onde o texto original
divergir, vale o que está aqui.

1. **Especificação pertence à categoria, não ao ramo.** `attribute_definitions`
   deixa de ser escopada por `vertical_code` e passa a ser escopada por
   `category_id` (com `store_id`), porque é o dono quem cria as categorias e,
   dentro de cada uma, as especificações dos produtos dela. O ramo passa a ser
   apenas a fonte do **conjunto sugerido** no momento em que a categoria é
   criada, e não a fonte da verdade. Consequências no schema:
   - `attribute_definitions` ganha `category_id uuid NOT NULL REFERENCES categories`
     e `created_by_owner boolean`;
   - o valor único passa a ser `(store_id, category_id, key)`;
   - `product_attributes` continua com chave estrangeira obrigatória para a
     definição — a trava contra EAV ingovernável permanece intacta;
   - produto movido entre categorias preserva valores órfãos marcados como não
     usados na categoria atual (AC-329), então `product_attributes` não pode
     apagar em cascata ao trocar de categoria;
   - definição alterada ou removida guarda histórico, porque pedidos antigos
     exibem o nome da época (AC-330).
2. **Tipo de negócio é alterado somente pelo ADMIN_GERAL.** Não existe caminho
   de escrita em `stores.vertical_code` para `OWNER` nem para `STAFF`: a
   política de UPDATE daquela coluna é exclusiva da credencial de
   administração, e a alteração grava em `audit_log` (AC-323, AC-214).
3. **Adaptação por ramo é de layout, não só de vocabulário.**
   `vertical_presets.labels` não basta: o preset passa a declarar também quais
   blocos aparecem, em que ordem, e quais ficam ocultos por tela (cadastro de
   produto, detalhe do produto, vitrine). Ou seja, o preset carrega
   **composição de tela**, não apenas dicionário de palavras (AC-324).
4. **Controle de estoque é ligado por ramo.** Nasce ativo para roupas,
   autopeças e eletrônicos, e desligado para comida (AC-337). Exige o que o
   desenho original não previa: tabela de **movimento de estoque**
   (`stock_movements`, escopada por loja) com motivo, pedido de origem, autor e
   quantidade anterior, porque cancelar pedido devolve estoque (AC-334) e
   ajuste manual precisa de trilha (AC-335). A baixa acontece na confirmação do
   pedido, dentro da mesma transação, com travamento da linha da variação para
   que duas compras simultâneas não vendam a mesma última peça (AC-333), e
   `product_variants` recebe `stock_min_alert` para o aviso de estoque baixo
   (AC-336).

## Entidades (59)

`[loja]` = tabela com `store_id` e política de isolamento por linha.

### `identities` `[global]`

Identidade global de login (uma pessoa = uma conta na plataforma). Guarda a PII de autenticacao e NUNCA e visivel para o dono de loja — e o que permite historico cross-store com login unico sem multiplicar PII.

**Campos**

- `id uuid PK`
- `email_norm text NOT NULL — lower(btrim(email))`
- `password_hash text NULL — argon2id em string PHC; NULL para CUSTOMER passwordless`
- `email_verified_at timestamptz`
- `phone_e164 text NULL`
- `display_name text`
- `locale text DEFAULT 'pt-BR'`
- `failed_login_count int DEFAULT 0`
- `locked_until timestamptz`
- `anonymized_at timestamptz — LGPD art.18`
- `created_at, updated_at timestamptz`

**Relações**

- 1:N store_customers
- 1:N store_members
- 1:N sessions
- 1:N verification_codes
- 1:N totp_credentials
- 1:N customer_addresses
- 1:1 platform_admins (opcional)

**Índices**

- `UNIQUE (email_norm) — a UNICA unique global de PII; enumeravel por design, mitigada com rate limit + resposta generica`
- `INDEX (phone_e164) WHERE phone_e164 IS NOT NULL — reconhecer cliente recorrente (AC-706)`

### `platform_admins` `[global]`

Marca quais identidades sao ADMIN_GERAL. Tabela separada em vez de coluna role na identity para que o papel de plataforma nao seja alcancavel por UPDATE numa rota de loja.

**Campos**

- `identity_id uuid PK FK identities`
- `granted_by uuid FK identities`
- `granted_at timestamptz`
- `revoked_at timestamptz`

**Relações**

- 1:1 identities

**Índices**

- `INDEX (revoked_at) WHERE revoked_at IS NULL`

### `sessions` `[global]`

Familia de refresh tokens com rotacao e deteccao de reuso (RFC 9700). Access token nao e persistido; so o refresh, como SHA-256.

**Campos**

- `id uuid PK`
- `identity_id uuid NOT NULL FK identities`
- `family_id uuid NOT NULL — a familia inteira e revogada ao detectar reuso`
- `parent_id uuid NULL FK sessions — cadeia de rotacao; permite janela de graca idempotente`
- `token_sha256 bytea NOT NULL`
- `role_at_issue text NOT NULL — OWNER|CUSTOMER|ADMIN_GERAL`
- `active_store_id uuid NULL FK stores`
- `device_label text`
- `user_agent text`
- `ip_hmac bytea — nunca IP cru`
- `issued_at, expires_at, last_seen_at timestamptz`
- `used_at timestamptz — marca rotacao consumida`
- `revoked_at timestamptz`
- `revoked_reason text — LOGOUT|ROTATED|REUSE_DETECTED|PASSWORD_CHANGED|ADMIN_REVOKED`

**Relações**

- N:1 identities
- N:1 stores (opcional)

**Índices**

- `UNIQUE (token_sha256)`
- `INDEX (identity_id, revoked_at, expires_at) — tela de dispositivos conectados`
- `INDEX (family_id)`
- `INDEX (expires_at) — job de limpeza`

### `verification_codes` `[global]`

Codigos e tokens de uso unico: verificacao de e-mail, OTP de login passwordless do CUSTOMER, reset de senha, 2FA por e-mail onde aplicavel. Codigo NUNCA em texto puro.

**Campos**

- `id uuid PK`
- `identity_id uuid NULL FK identities — NULL quando o e-mail ainda nao tem conta`
- `purpose text NOT NULL — EMAIL_VERIFY|PASSWORD_RESET|LOGIN_OTP|STEP_UP|EMAIL_CHANGE`
- `code_hash text NOT NULL — argon2id (6 digitos ~= 20 bits < 112, ASVS 6.5.2)`
- `channel text NOT NULL DEFAULT 'EMAIL'`
- `destination_hmac bytea`
- `expires_at timestamptz NOT NULL — 10 min p/ codigo digitado, 24h p/ link`
- `attempt_count int DEFAULT 0 — queima em 5`
- `consumed_at timestamptz`
- `created_ip_hmac bytea`
- `created_at timestamptz`

**Relações**

- N:1 identities

**Índices**

- `INDEX (identity_id, purpose, consumed_at)`
- `INDEX (expires_at) — purga em 30 dias`

### `totp_credentials` `[global]`

Segundo fator real (TOTP RFC 6238) obrigatorio para OWNER e ADMIN_GERAL. Segredo CIFRADO (nao hasheado) porque precisa ser recuperavel para validar.

**Campos**

- `id uuid PK`
- `identity_id uuid NOT NULL FK identities`
- `secret_enc bytea NOT NULL — AES-256-GCM, chave em KMS/env`
- `digits smallint DEFAULT 6`
- `period_seconds smallint DEFAULT 30`
- `algorithm text DEFAULT 'SHA1'`
- `last_used_step bigint — barra replay dentro do mesmo passo (ASVS 6.5.1)`
- `confirmed_at timestamptz`
- `disabled_at timestamptz`
- `created_at timestamptz`

**Relações**

- N:1 identities
- 1:N recovery_codes

**Índices**

- `UNIQUE (identity_id) WHERE disabled_at IS NULL`

### `recovery_codes` `[global]`

10 codigos de recuperacao de uso unico exibidos uma vez, para nao perder a conta ao trocar de celular.

**Campos**

- `id uuid PK`
- `identity_id uuid NOT NULL FK identities`
- `code_sha256 bytea NOT NULL — 128 bits de entropia dispensam argon2id`
- `used_at timestamptz`
- `created_at timestamptz`

**Relações**

- N:1 identities

**Índices**

- `UNIQUE (identity_id, code_sha256)`

### `customer_addresses` `[global]`

Enderecos salvos do comprador, vinculados a IDENTIDADE e nao a loja — o cliente cadastra uma vez e usa em qualquer loja. Fica fora do perimetro do dono (paridade Goomer /customer/addresses).

**Campos**

- `id uuid PK`
- `identity_id uuid NOT NULL FK identities`
- `label text — 'Casa', 'Trabalho'`
- `recipient_name text — 'destinatario' do MVP`
- `street, number, complement, neighborhood, city, uf, zip text — logradouro/numero/complemento/bairro/cidade/uf/cep do MVP`
- `reference_point text`
- `lat, lng numeric(9,6) NULL`
- `is_default boolean DEFAULT false`
- `anonymized_at timestamptz`
- `created_at, updated_at timestamptz`

**Relações**

- N:1 identities

**Índices**

- `INDEX (identity_id, is_default DESC)`

### `vertical_presets` `[global]`

Catalogo GLOBAL (seed, nao multi-tenant) dos tipos de negocio herdados do MVP — Lanchonete, Restaurante, Acaiteria, Loja, Eletronicos, Bebidas, Autopecas. Define o VOCABULARIO da interface e quais definicoes de atributo se aplicam. E o que resolve 'a mesma tabela serve comida, roupa, peca e eletronico' sem ramificar o schema.

**Campos**

- `code text PK — FOOD_SNACK|FOOD_RESTAURANT|FOOD_ACAI|RETAIL_GENERIC|APPAREL|AUTO_PARTS|ELECTRONICS|BEVERAGES`
- `label text — 'Lanchonete'`
- `labels jsonb NOT NULL — dicionario de vocabulario: {catalogo:'Cardapio'|'Catalogo', grupo_opcao:'Ingredientes'|'Especificacoes', variacao:'Sabor'|'Tamanho', busca_placeholder:'O que voce gostaria de comer?'}`
- `default_option_group_kinds text[] — quais kinds a UI oferece primeiro`
- `schema_version int NOT NULL — versiona o preset; produto guarda a versao com que foi validado`
- `is_food boolean — liga comportamentos de comida (fracionado, tempo de preparo)`
- `sort_order int`

**Relações**

- 1:N stores
- 1:N attribute_definitions

**Índices**

- `PK (code)`

### `attribute_definitions` `[loja]`

REGISTRO TIPADO de atributos por vertical — o mecanismo que fecha o EAV. Nenhum atributo de produto existe sem definicao aqui; o schema Zod de validacao e GERADO deste registro, entao nao ha segunda fonte de verdade. store_id NULL = definicao de plataforma; store_id preenchido = campo custom daquela loja.

**Campos**

- `id uuid PK`
- `store_id uuid NULL FK stores — NULL = global por vertical`
- `vertical_code text NULL FK vertical_presets`
- `key text NOT NULL — 'voltagem', 'tamanho', 'codigo_peca', 'ano_aplicacao'`
- `label text NOT NULL — 'Voltagem'`
- `data_type text NOT NULL — TEXT|NUMBER|BOOLEAN|ENUM|DATE`
- `unit text NULL — 'V', 'kg', 'ml'`
- `enum_options jsonb NULL — ['110V','220V','Bivolt']`
- `is_required boolean DEFAULT false`
- `is_filterable boolean DEFAULT false — entra no indice de faceta`
- `is_public boolean DEFAULT true — false = interno (nunca no DTO publico)`
- `validation jsonb — {min,max,pattern,maxLength}`
- `sort_order int`
- `deprecated_at timestamptz — troca de vertical nao apaga dado (AC-320): a definicao e depreciada, os valores ficam`

**Relações**

- N:1 vertical_presets
- N:1 stores (quando custom)
- 1:N product_attributes

**Índices**

- `UNIQUE (coalesce(store_id,'00000000-0000-0000-0000-000000000000'), coalesce(vertical_code,''), key)`
- `INDEX (vertical_code, is_filterable) WHERE deprecated_at IS NULL`

### `stores` `[loja]`

A loja (o 'Cliente' do painel admsimpleclick do MVP). Raiz do tenant: store_id de todas as outras tabelas aponta para ca. Colunas PROMOVIDAS aqui sao so as que entram em indice, RLS, roteamento ou politica de plano; o resto vive em store_settings.

**Campos**

- `id uuid PK`
- `code text NOT NULL — 'codigoCliente' do MVP (0001, 0002), busca do admin (AC-206)`
- `name text NOT NULL — 'Nome da empresa'`
- `legal_name text — razao social`
- `doc_number text — CPF/CNPJ normalizado (AC-202)`
- `doc_type text — CPF|CNPJ`
- `slug text NOT NULL — roteamento publico /l/{slug} e {slug}.dominio`
- `status text NOT NULL DEFAULT 'PENDING' — PENDING|ACTIVE|SUSPENDED|DELETED (AC-209/210/211)`
- `vertical_code text NOT NULL FK vertical_presets — 'tipoEmpresa' do MVP`
- `vertical_schema_version int NOT NULL`
- `timezone text NOT NULL DEFAULT 'America/Sao_Paulo' — IANA; 'agora' e relativo a loja`
- `currency char(3) DEFAULT 'BRL'`
- `open_state text NOT NULL DEFAULT 'SCHEDULE' — SCHEDULE|ALWAYS_OPEN|TEMPORARILY_CLOSED|PERMANENTLY_CLOSED ('statusLoja' do MVP + botao de panico)`
- `temporarily_closed_until timestamptz`
- `fulfillment_modes text[] NOT NULL DEFAULT '{DELIVERY,PICKUP}' — loja so de retirada nao oferece entrega (AC-506)`
- `whatsapp_e164 text — numero de pedidos, validado com libphonenumber`
- `phone1, phone2 text — telefone1/telefone2 do MVP`
- `email text`
- `street, number, complement, neighborhood, city, uf, zip text`
- `lat, lng numeric(9,6)`
- `catalog_version bigint NOT NULL DEFAULT 1 — bump por trigger a cada mudanca de catalogo; chave do payload versionado em Redis e do revalidateTag (AC-417)`
- `plan_id uuid FK plans`
- `deleted_at timestamptz — exclusao reversivel por prazo (AC-211)`
- `purge_after timestamptz`
- `created_by uuid FK identities`
- `created_at, updated_at timestamptz`

**Relações**

- N:1 vertical_presets
- N:1 plans
- 1:1 store_settings
- 1:N store_domains, store_hours, store_members, categories, products, orders, coupons, store_contracts, delivery_zones

**Índices**

- `UNIQUE (lower(slug)) WHERE deleted_at IS NULL — slug e chave de roteamento, unique GLOBAL intencional (allowlist da guarda de CI)`
- `UNIQUE (code)`
- `INDEX (doc_number)`
- `INDEX (status) WHERE deleted_at IS NULL`
- `INDEX (name gin_trgm_ops) — busca do admin por nome`

### `store_settings` `[loja]`

Configuracao da loja em JSONB validado por Zod (1:1 com stores). Absorve as ~140 flags que o benchmark encontrou no concorrente sem gerar uma migration por flag: tema/cores, LP, textos, regras de frete, formas de pagamento, opcoes de checkout, template de WhatsApp, perfil de impressora.

**Campos**

- `store_id uuid PK FK stores`
- `theme jsonb — {primary:'#DC2626', logo_asset_id, font, radius} (o vermelho do MVP)`
- `landing jsonb — {welcome_message:'boasVindas', about_text:'sobre', hero_banners:[]}`
- `checkout jsonb — {name:{enable,required}, phone:{enable,required}, cpf:{enable:false,required:false}} — coletar e obrigar sao decisoes SEPARADAS (LGPD)`
- `delivery jsonb — {zone_type:'STATIC|RADIUS|NEIGHBORHOOD', minimum_order_cents, free_above_cents, pickup_discount_percent, takeaway_minutes}`
- `payment jsonb — {pix:{enable,key,key_type,account_name}, cash:{enable,change_for}, card_on_delivery:{enable}} — 'pagPix/pagEntrega/pagCartao' do MVP`
- `whatsapp jsonb — {template_version, custom_template, send_tracking_link:true} — sem branding compulsorio da plataforma`
- `printing jsonb — {cols:48|32, codepage:'cp860', cut:'partial|full|none', beep:null, auto_print:true}`
- `seo jsonb — {title, description, canonical_host}`
- `notifications jsonb`
- `updated_at timestamptz`
- `schema_version int NOT NULL — versao do Zod que validou`

**Relações**

- 1:1 stores

**Índices**

- `PK (store_id)`
- `INDEX ((payment->'pix'->>'enable')) — apenas se virar filtro; regra: promover a coluna so o que entra em indice/RLS`

### `store_domains` `[loja]`

Hosts que resolvem para a loja: subdominio, dominio proprio futuro e o HISTORICO de slugs antigos — 'alterar o apelido preserva o endereco antigo' (AC-208) exige guardar o slug velho para redirect 301.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `host text NOT NULL — 'loja.dominio.com.br' ou 'meudominio.com.br'`
- `kind text NOT NULL — SUBDOMAIN|CUSTOM|LEGACY_SLUG`
- `is_canonical boolean DEFAULT false — UM canonical por loja evita duplicate content`
- `verified_at timestamptz — dominio proprio via TXT`
- `redirect_to_canonical boolean DEFAULT false`
- `created_at timestamptz`

**Relações**

- N:1 stores

**Índices**

- `UNIQUE (lower(host))`
- `UNIQUE (store_id) WHERE is_canonical — garante exatamente um canonico`
- `INDEX (store_id)`

### `store_members` `[loja]`

Vinculo entre identidade e loja com papel — o dono e a equipe. Separa 'quem sou' de 'o que posso naquela loja', e ja abre caminho para multiplas lojas por dono sem trocar o modelo.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `identity_id uuid NOT NULL FK identities`
- `role text NOT NULL — OWNER|STAFF`
- `permissions jsonb — granularidade futura (pedidos, catalogo, financeiro)`
- `invited_by uuid FK identities`
- `invite_accepted_at timestamptz`
- `revoked_at timestamptz`
- `created_at timestamptz`

**Relações**

- N:1 stores
- N:1 identities

**Índices**

- `UNIQUE (store_id, identity_id)`
- `INDEX (identity_id) WHERE revoked_at IS NULL — resolver 'minhas lojas' no login`

### `store_hours` `[loja]`

Horario de funcionamento por dia da semana, com multiplas faixas por dia (almoco e jantar). Reproduz o scheduleForm do MVP (dia + from/to + status).

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `weekday smallint NOT NULL — 0=domingo..6=sabado`
- `opens_at time NOT NULL`
- `closes_at time NOT NULL — quando < opens_at, a faixa cruza a meia-noite`
- `is_closed boolean DEFAULT false — dia fechado`
- `sort_order int`

**Relações**

- N:1 stores

**Índices**

- `INDEX (store_id, weekday)`
- `CHECK (weekday BETWEEN 0 AND 6)`

### `store_hour_exceptions` `[loja]`

Excecoes datadas: feriado, ferias, fechamento pontual. Evita que o dono desconfigure a grade semanal para fechar um unico dia.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `on_date date NOT NULL`
- `is_closed boolean DEFAULT true`
- `opens_at, closes_at time NULL`
- `reason text`

**Relações**

- N:1 stores

**Índices**

- `UNIQUE (store_id, on_date)`

### `store_contracts` `[loja]`

Contrato e documentos da loja enviados pelo ADMIN_GERAL (campos contrato, fotoDoc e comprovanteEnd do painel do MVP). Bucket PRIVADO, host separado, download so por URL assinada curta — nunca publico (AC-205).

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `kind text NOT NULL — CONTRACT|ID_DOC|ADDRESS_PROOF`
- `storage_key text NOT NULL — chave UUID gerada pelo servidor, sem nada do nome original`
- `mime_type text NOT NULL — validado por magic bytes %PDF- (AC-204)`
- `byte_size bigint NOT NULL`
- `sha256 bytea NOT NULL`
- `original_filename text — guardado como metadado, nunca usado no caminho`
- `uploaded_by uuid NOT NULL FK identities`
- `signed_at timestamptz`
- `expires_at timestamptz`
- `notes text — 'observacoes' do MVP`
- `created_at timestamptz`

**Relações**

- N:1 stores
- N:1 identities

**Índices**

- `INDEX (store_id, kind, created_at DESC)`
- `UNIQUE (storage_key)`

### `assets` `[loja]`

Registro unico de arquivo em object storage, para imagem de produto, logo e banner. Fluxo de URL assinada: nasce PENDING e so vira READY apos o passo de confirmacao que checa magic bytes e RE-ENCODA (o que destroi payload embutido e remove EXIF/GPS).

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `kind text NOT NULL — PRODUCT_IMAGE|LOGO|BANNER|PIX_PROOF`
- `status text NOT NULL DEFAULT 'PENDING' — PENDING|READY|REJECTED`
- `storage_key text NOT NULL`
- `mime_type text NOT NULL — SVG SEMPRE rejeitado (XML executavel = XSS armazenado)`
- `width, height int`
- `byte_size bigint`
- `sha256 bytea`
- `variants jsonb — {thumb:key, md:key, lg:key} geradas na ingestao; trocar a foto muda o key (o CDN nao tem invalidacao)`
- `blurhash text — placeholder p/ evitar CLS`
- `alt_text text`
- `uploaded_by uuid FK identities`
- `created_at timestamptz`

**Relações**

- N:1 stores
- 1:N product_images

**Índices**

- `INDEX (store_id, kind, status)`
- `UNIQUE (storage_key)`
- `INDEX (store_id, sha256) — deduplicacao de upload repetido`

### `categories` `[loja]`

Categorias criadas pelo DONO, com ordenacao manual e visibilidade (nomeCategoria/descCategoria/ativaCategoria do MVP). Suporta hierarquia de um nivel para varejo ('Suspensao' > 'Amortecedores').

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `parent_id uuid NULL FK categories`
- `name text NOT NULL`
- `slug text NOT NULL`
- `description text`
- `image_asset_id uuid NULL FK assets`
- `sort_order int NOT NULL DEFAULT 0 — drag-and-drop (AC-302)`
- `is_visible boolean NOT NULL DEFAULT true — oculta some da vitrine sem apagar produto (AC-301)`
- `deleted_at timestamptz`
- `created_at, updated_at timestamptz`

**Relações**

- N:1 stores
- N:1 categories (parent)
- N:M products via product_categories
- 1:N availability_windows

**Índices**

- `UNIQUE (store_id, slug) WHERE deleted_at IS NULL — tenant-scoped: unique global vazaria a existencia de categoria de outra loja`
- `INDEX (store_id, sort_order) WHERE is_visible AND deleted_at IS NULL — ordem da vitrine`
- `INDEX (store_id, parent_id, sort_order)`

### `products` `[loja]`

O produto GENERICO — uma unica tabela para comida, roupa, peca e eletronico. A diferenca entre verticais mora em product_type, no vertical_code herdado da loja e nos atributos tipados, nunca em tabelas paralelas.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `name text NOT NULL — 'nomeProduto'`
- `slug text NOT NULL — URL compartilhavel do detalhe (AC-414)`
- `description text — 'descProduto'`
- `short_description text`
- `product_type text NOT NULL DEFAULT 'SIMPLE' — SIMPLE|VARIABLE (grade tamanho x cor)|FRACTIONED (meio a meio, cento variado)|SERVICE`
- `vertical_code text NOT NULL — copiado da loja no cadastro; permite validar atributos mesmo depois que a loja troca de ramo (AC-320)`
- `vertical_schema_version int NOT NULL`
- `status text NOT NULL DEFAULT 'DRAFT' — DRAFT|PUBLISHED|ARCHIVED; rascunho invisivel na vitrine ate por endereco direto (AC-308)`
- `is_available boolean NOT NULL DEFAULT true — 'Esgotado' visivel em vez de omitido (AC-321)`
- `unavailable_until timestamptz — esgotado so hoje`
- `unit_label text DEFAULT 'un' — un|kg|100g|m|par`
- `track_stock boolean DEFAULT false`
- `sort_order int DEFAULT 0`
- `is_featured boolean DEFAULT false — carrossel de destaques do MVP (AC-406)`
- `attributes jsonb NOT NULL DEFAULT '{}' — CACHE desnormalizado de product_attributes, reconstruido por trigger; serve a vitrine numa leitura e NUNCA e fonte de verdade`
- `price_min_cents bigint — cache p/ 'A partir de R$ X' e ordenacao`
- `price_max_cents bigint`
- `display_price_cents bigint — preco a pagar (promocional se ativo)`
- `compare_at_cents bigint — preco riscado`
- `has_variants boolean DEFAULT false`
- `fraction_slots smallint — 2 = meio a meio, 100 = cento`
- `fraction_pricing text — AVG|MAX; o sistema calcula a partir do preco cheio, o dono nao divide na mao`
- `prep_time_minutes int`
- `seo_title, seo_description text`
- `og_asset_id uuid FK assets`
- `search_tsv tsvector — busca por nome e descricao (AC-408)`
- `deleted_at timestamptz — soft delete: remover nao pode afetar pedido que ja o incluiu (AC-307)`
- `created_at, updated_at timestamptz`
- `created_by uuid FK identities`

**Relações**

- N:1 stores
- N:M categories via product_categories
- 1:N product_images, product_variants, product_prices (via variante), product_attributes, product_option_groups, availability_windows, product_waitlist
- 1:N order_items (FK NULLABLE, sem preco vivo)

**Índices**

- `UNIQUE (store_id, slug) WHERE deleted_at IS NULL`
- `INDEX (store_id, sort_order) — acesso ORDENADO da vitrine; medido: Index Scan 0,061 ms / 26 buffers em 120k produtos`
- `INDEX (store_id, status, is_available, sort_order) WHERE deleted_at IS NULL`
- `GIN (search_tsv)`
- `GIN (attributes jsonb_path_ops) — filtro por atributo na vitrine de varejo`
- `INDEX (store_id, is_featured, sort_order) WHERE is_featured AND status='PUBLISHED'`

### `product_categories` `[loja]`

N:M produto-categoria com ordem POR categoria. E N:M e nao 1:N porque o proprio MVP exibia o mesmo item na secao 'Promocoes' e na secao do seu tipo.

**Campos**

- `store_id uuid NOT NULL`
- `product_id uuid NOT NULL FK products`
- `category_id uuid NOT NULL FK categories`
- `sort_order int NOT NULL DEFAULT 0`
- `is_primary boolean DEFAULT false — categoria canonica p/ breadcrumb e URL`
- `PRIMARY KEY (store_id, category_id, product_id)`

**Relações**

- N:1 products
- N:1 categories

**Índices**

- `PK (store_id, category_id, product_id) — serve direto a consulta quente 'vitrine por loja + categoria'`
- `INDEX (store_id, category_id, sort_order) INCLUDE (product_id)`
- `INDEX (store_id, product_id)`
- `UNIQUE (store_id, product_id) WHERE is_primary`

### `product_images` `[loja]`

Multiplas imagens com UMA principal (AC-305). A principal e garantida por indice unico parcial, nao por convencao.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL`
- `product_id uuid NOT NULL FK products`
- `asset_id uuid NOT NULL FK assets`
- `is_primary boolean NOT NULL DEFAULT false`
- `sort_order int NOT NULL DEFAULT 0`
- `alt_text text`
- `created_at timestamptz`

**Relações**

- N:1 products
- N:1 assets

**Índices**

- `UNIQUE (store_id, product_id) WHERE is_primary — impossivel ter duas principais`
- `INDEX (store_id, product_id, sort_order)`
- `UNIQUE (store_id, product_id, asset_id)`

### `product_variants` `[loja]`

A UNIDADE VENDAVEL. E aqui que variacao difere de ingrediente: variante tem SKU, codigo de barras e ESTOQUE proprio (AC-316). Todo produto tem ao menos uma variante 'Padrao' criada implicitamente, o que uniformiza preco e pedido sem ramificar consulta.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL`
- `product_id uuid NOT NULL FK products`
- `name text NOT NULL — 'Padrao', 'P / Azul', 'Grande'`
- `sku text NULL — codigo do dono`
- `barcode text NULL`
- `is_default boolean NOT NULL DEFAULT false`
- `stock_quantity int NULL — NULL = nao controla`
- `stock_reserved int DEFAULT 0`
- `is_available boolean NOT NULL DEFAULT true — M com estoque zero fica indisponivel sem derrubar P e G`
- `weight_grams int`
- `sort_order int DEFAULT 0`
- `deleted_at timestamptz`

**Relações**

- N:1 products
- 1:N product_prices
- 1:N variant_option_values (resolve a combinacao dos eixos)
- 1:N order_items (FK nullable)
- 1:N option_price_overrides

**Índices**

- `UNIQUE (store_id, sku) WHERE sku IS NOT NULL AND deleted_at IS NULL — tenant-scoped: unique global de SKU revelaria linha invisivel de outra loja e quebraria upsert`
- `UNIQUE (store_id, product_id) WHERE is_default`
- `INDEX (store_id, product_id, sort_order)`

### `product_prices` `[loja]`

PRECO COMO ENTIDADE, nunca 3 colunas. Cada linha e um preco NOMEADO com semantica propria, e a cardinalidade e aberta (o dono pode ter 2 ou 6). Pendura na VARIANTE, entao P/M/G nao ocupa slot de tipo de preco.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL`
- `product_id uuid NOT NULL FK products — desnormalizado p/ indice e RLS`
- `variant_id uuid NOT NULL FK product_variants`
- `kind text NOT NULL — BASE|PROMO|WHOLESALE|COST|CLUB`
- `label text NOT NULL — nome dado pelo dono: 'Atacado' (AC-310)`
- `amount_cents bigint NOT NULL — inteiro em centavos (P-005)`
- `currency char(3) NOT NULL DEFAULT 'BRL'`
- `min_quantity int NOT NULL DEFAULT 1 — atacado a partir de 6 unidades`
- `starts_at, ends_at timestamptz NULL — promocao com janela`
- `is_active boolean NOT NULL DEFAULT true`
- `sort_order int`
- `created_at, updated_at timestamptz`
- `CHECK (amount_cents >= 0)`
- `CHECK (kind <> 'COST' OR min_quantity = 1)`

**Relações**

- N:1 product_variants
- N:1 products

**Índices**

- `UNIQUE (store_id, variant_id, kind, min_quantity) WHERE is_active — impede dois BASE conflitantes na mesma faixa`
- `INDEX (store_id, product_id, kind) WHERE is_active`
- `INDEX (store_id, variant_id, min_quantity DESC) — resolver a faixa de atacado aplicavel`

### `option_groups` `[loja]`

O MECANISMO UNICO que atende ingrediente e variacao. Vem direto do MVP: 'Escolha o Sabor do Pastel' era radio (min 1, max 1) e 'Adicionais' era checkbox (min 0, max N). O que muda entre um caso e outro e o KIND e a flag is_variant_axis, nao a estrutura.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL`
- `product_id uuid NULL FK products — NULL = grupo de BIBLIOTECA reutilizavel entre produtos`
- `name text NOT NULL — 'Sabor', 'Adicionais', 'Tamanho', 'Voltagem'`
- `description text`
- `kind text NOT NULL — INGREDIENT|ADDON|VARIATION|FRACTION|SPEC (o rotulo exibido vem de vertical_presets.labels)`
- `is_variant_axis boolean NOT NULL DEFAULT false — true: a escolha resolve uma product_variant (SKU e estoque). false: e ingrediente/adicional, so muda preco`
- `min_select smallint NOT NULL DEFAULT 0 — obrigatorio E min_select >= 1 (derivado, nao coluna redundante)`
- `max_select smallint NULL — NULL = sem limite`
- `allow_repeat boolean NOT NULL DEFAULT false — mesma opcao mais de uma vez`
- `max_per_option smallint NULL — limite POR opcao, lacuna do concorrente`
- `fraction_slots smallint NULL — quando kind=FRACTION`
- `sort_order int NOT NULL DEFAULT 0`
- `is_active boolean DEFAULT true`
- `CHECK (max_select IS NULL OR max_select >= min_select)`

**Relações**

- N:1 stores
- N:1 products (quando dedicado)
- 1:N option_items
- N:M products via product_option_groups

**Índices**

- `INDEX (store_id, product_id, sort_order)`
- `INDEX (store_id, kind) WHERE product_id IS NULL — biblioteca de grupos reutilizaveis`
- `INDEX (store_id, is_variant_axis) WHERE is_variant_axis`

### `option_items` `[loja]`

As opcoes dentro do grupo. Aqui fica a diferenca pratica: item de INGREDIENT/ADDON tem price_delta e disponibilidade propria mas nao tem estoque nem SKU; item de VARIATION e um valor de eixo que, combinado, aponta para uma variante que TEM SKU e estoque.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL`
- `group_id uuid NOT NULL FK option_groups`
- `name text NOT NULL — 'Queijo', 'Bacon', 'P', 'Azul', '220V'`
- `price_delta_cents bigint NOT NULL DEFAULT 0 — acrescimo somado a parte no pedido (AC-315)`
- `is_default_selected boolean DEFAULT false — ingrediente que vem por padrao; desmarcar gera 'sem cebola'`
- `is_available boolean NOT NULL DEFAULT true — Cheddar esgotado nao bloqueia o produto (AC-317)`
- `image_asset_id uuid NULL FK assets — amostra de cor`
- `sort_order int NOT NULL DEFAULT 0`
- `external_code text — 'cod.' impresso no cupom`
- `CHECK (price_delta_cents >= -100000000)`

**Relações**

- N:1 option_groups
- 1:N variant_option_values
- 1:N option_price_overrides
- 1:N order_item_options (por snapshot)

**Índices**

- `INDEX (store_id, group_id, sort_order)`
- `UNIQUE (store_id, group_id, name)`

### `product_option_groups` `[loja]`

Liga produto a grupo de biblioteca com ordem propria — o dono cadastra 'Adicionais' uma vez e reaproveita em 20 lanches, e alterar o preco do bacon vale para todos.

**Campos**

- `store_id uuid NOT NULL`
- `product_id uuid NOT NULL FK products`
- `group_id uuid NOT NULL FK option_groups`
- `sort_order int NOT NULL DEFAULT 0`
- `min_select_override smallint NULL`
- `max_select_override smallint NULL`
- `PRIMARY KEY (store_id, product_id, group_id)`

**Relações**

- N:1 products
- N:1 option_groups

**Índices**

- `PK (store_id, product_id, group_id)`
- `INDEX (store_id, group_id) — 'quais produtos usam este grupo'`

### `variant_option_values` `[loja]`

Resolve a GRADE: a combinacao de valores dos eixos (tamanho x cor) que identifica uma variante. E o que o modelo de 'opcionais' puro do concorrente nao sabe representar.

**Campos**

- `store_id uuid NOT NULL`
- `variant_id uuid NOT NULL FK product_variants`
- `group_id uuid NOT NULL FK option_groups — o eixo`
- `option_item_id uuid NOT NULL FK option_items — o valor no eixo`
- `PRIMARY KEY (store_id, variant_id, group_id)`

**Relações**

- N:1 product_variants
- N:1 option_groups
- N:1 option_items

**Índices**

- `PK (store_id, variant_id, group_id) — um valor por eixo por variante`
- `UNIQUE (store_id, variant_id, option_item_id)`
- `INDEX (store_id, option_item_id) — dado 'M', quais variantes`

### `option_price_overrides` `[loja]`

Preco de adicional que VARIA por variante — 'bacon extra' custa diferente em pizza P e G. Ausencia de linha cai no price_delta padrao, entao o caso simples nao paga nada.

**Campos**

- `store_id uuid NOT NULL`
- `option_item_id uuid NOT NULL FK option_items`
- `variant_id uuid NOT NULL FK product_variants`
- `price_delta_cents bigint NOT NULL`
- `PRIMARY KEY (store_id, option_item_id, variant_id)`

**Relações**

- N:1 option_items
- N:1 product_variants

**Índices**

- `PK (store_id, option_item_id, variant_id)`

### `product_attributes` `[loja]`

Valores TIPADOS de atributo por produto, cada um amarrado a uma attribute_definition (FK obrigatoria) — e isso que impede o EAV de virar saco sem fundo: chave inexistente nao entra, e o tipo e conhecido. 'Voltagem: 220V', 'Tamanho: M', 'Codigo da peca: 90919-01247'.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL`
- `product_id uuid NOT NULL FK products`
- `definition_id uuid NOT NULL FK attribute_definitions — governanca: sem definicao, sem atributo`
- `value_text text NULL`
- `value_num numeric NULL`
- `value_bool boolean NULL`
- `value_date date NULL`
- `CHECK (num_nonnulls(value_text, value_num, value_bool, value_date) = 1) — exatamente um valor preenchido, coerente com data_type`

**Relações**

- N:1 products
- N:1 attribute_definitions

**Índices**

- `UNIQUE (store_id, product_id, definition_id)`
- `INDEX (store_id, definition_id, value_text) — faceta 'Voltagem = 220V' na vitrine`
- `INDEX (store_id, definition_id, value_num) — faixa numerica (ano de aplicacao)`

### `availability_windows` `[loja]`

Janela de disponibilidade por PRODUTO ou por CATEGORIA, avaliada no timezone da loja — 'so vendo no fim de semana' volta sozinho no sabado (AC-322). Recurso que o concorrente cobra em plano pago.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL`
- `scope text NOT NULL — PRODUCT|CATEGORY`
- `ref_id uuid NOT NULL — product_id ou category_id (FK poliformica validada por trigger)`
- `weekday smallint NOT NULL`
- `starts_at_time time NOT NULL`
- `ends_at_time time NOT NULL`
- `CHECK (weekday BETWEEN 0 AND 6)`

**Relações**

- N:1 stores
- referencia products ou categories

**Índices**

- `INDEX (store_id, scope, ref_id)`
- `INDEX (store_id, weekday)`

### `product_suggestions` `[loja]`

Venda sugestiva ('leve tambem uma bebida') e produtos relacionados, dirigida pelo dono.

**Campos**

- `store_id uuid NOT NULL`
- `product_id uuid NOT NULL FK products`
- `suggested_product_id uuid NOT NULL FK products`
- `sort_order int DEFAULT 0`
- `PRIMARY KEY (store_id, product_id, suggested_product_id)`
- `CHECK (product_id <> suggested_product_id)`

**Relações**

- N:1 products (duas vezes)

**Índices**

- `PK (store_id, product_id, suggested_product_id)`

### `product_waitlist` `[loja]`

'Avise-me quando voltar' no produto esgotado — transforma ruptura de estoque em lead, algo que nenhum concorrente examinado faz.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL`
- `product_id uuid NOT NULL FK products`
- `variant_id uuid NULL FK product_variants`
- `store_customer_id uuid NULL FK store_customers`
- `contact_phone_e164 text NULL`
- `contact_email text NULL`
- `notified_at timestamptz`
- `created_at timestamptz`

**Relações**

- N:1 products
- N:1 store_customers

**Índices**

- `INDEX (store_id, product_id) WHERE notified_at IS NULL`
- `UNIQUE (store_id, product_id, coalesce(contact_phone_e164,''), coalesce(contact_email,''))`

### `store_customers` `[loja]`

PROJECAO do cliente naquela loja. Existe para dar ao dono a ficha do cliente dele (nome e telefone, que ele precisa para entregar) SEM lhe dar acesso a PII global da identidade. Cobre tambem o cliente cadastrado a mao pelo dono, sem conta na plataforma (AC-703).

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `identity_id uuid NULL FK identities — NULL = cadastrado pelo dono, ainda sem conta (AC-703/706)`
- `display_name text NOT NULL`
- `phone_e164 text`
- `email text NULL`
- `doc_number text NULL — apenas se a loja pedir CPF na nota`
- `notes text`
- `birth_date date — 'vantagem de aniversario' do MVP`
- `orders_count int NOT NULL DEFAULT 0 — contador mantido por trigger, evita COUNT na listagem`
- `total_spent_cents bigint NOT NULL DEFAULT 0`
- `last_order_at timestamptz`
- `first_seen_at timestamptz`
- `anonymized_at timestamptz — exclusao LGPD = anonimizacao (UPDATE unico), nunca DELETE`
- `created_at, updated_at timestamptz`

**Relações**

- N:1 stores
- N:1 identities (opcional)
- 1:N orders
- 1:N consents

**Índices**

- `UNIQUE (store_id, identity_id) WHERE identity_id IS NOT NULL`
- `INDEX (store_id, phone_e164) — busca por telefone e alerta de repetido na mesma loja (AC-701/704)`
- `INDEX (store_id, display_name gin_trgm_ops) — busca por nome`
- `INDEX (identity_id) — historico cross-store do comprador`
- `INDEX (store_id, last_order_at DESC)`

### `orders` `[loja]`

O pedido. Existe no banco INDEPENDENTEMENTE do WhatsApp (nao e canal de captura, e de notificacao), guarda os totais calculados no servidor e a chave PIX vigente no momento. Nunca e apagado.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `code text NOT NULL — numero por loja ('A-1042'), gerado por store_sequences`
- `public_token text NOT NULL — 128+ bits, nao enumeravel: e a chave da pagina publica de acompanhamento`
- `channel text NOT NULL — ONLINE|MANUAL (pedido lancado pelo dono, AC-707) |IMPORTED`
- `status text NOT NULL DEFAULT 'PENDING' — PENDING|ACCEPTED|PREPARING|OUT_FOR_DELIVERY|READY_FOR_PICKUP|COMPLETED|REJECTED|CANCELLED`
- `fulfillment text NOT NULL — DELIVERY|PICKUP`
- `store_customer_id uuid NULL FK store_customers — NULL = convidado (AC-518)`
- `subtotal_cents bigint NOT NULL`
- `coupon_discount_cents bigint NOT NULL DEFAULT 0 — incide SO no subtotal, nunca no frete`
- `delivery_fee_cents bigint NOT NULL DEFAULT 0`
- `delivery_fee_mode text NOT NULL DEFAULT 'VALUE' — VALUE|FREE|ASK ('a combinar')|OUTSIDE_AREA|NEIGHBORHOOD_NOT_FOUND: uniao discriminada, nao number|null`
- `pickup_discount_cents bigint NOT NULL DEFAULT 0`
- `total_cents bigint NOT NULL — recalculado no servidor; valor enviado pelo cliente so serve p/ comparar e rejeitar (AC-504/512)`
- `cost_total_cents bigint NOT NULL DEFAULT 0 — soma dos custos snapshot; e o que permite MARGEM no dashboard`
- `currency char(3) DEFAULT 'BRL'`
- `payment_method text NOT NULL — PIX|CASH|CARD_ON_DELIVERY|OTHER`
- `payment_status text NOT NULL DEFAULT 'PENDING' — PENDING|AWAITING_PROOF|CONFIRMED|REFUNDED`
- `pix_key_snapshot text — chave PIX QUE VALIA no momento (AC-511)`
- `pix_key_type_snapshot text`
- `pix_account_name_snapshot text`
- `pix_brcode_snapshot text — BR Code EMV com valor exato, montado no checkout`
- `change_for_cents bigint — troco`
- `coupon_id uuid NULL FK coupons`
- `coupon_code_snapshot text`
- `customer_note text — 'observacoes' do MVP`
- `store_note text — anotacao interna do dono`
- `idempotency_key text — enviar duas vezes nao cria dois pedidos (AC-516)`
- `whatsapp_clicked_at timestamptz — o clique NAO e confirmacao de envio`
- `whatsapp_confirmed_at timestamptz — 'Ja enviei no WhatsApp'`
- `whatsapp_message_chars int`
- `scheduled_for timestamptz — agendamento`
- `placed_at timestamptz NOT NULL — congela o pedido; antes disso e cart`
- `accepted_at, completed_at timestamptz`
- `store_timezone text NOT NULL — timezone vigente, p/ agrupar por dia corretamente`
- `created_at, updated_at timestamptz`
- `CHECK (total_cents >= 0)`

**Relações**

- N:1 stores
- N:1 store_customers (nullable)
- 1:1 order_contacts
- 1:N order_items
- 1:N order_status_history
- 1:N order_payments
- 1:N print_jobs
- N:1 coupons

**Índices**

- `UNIQUE (public_token) — global por design (alta entropia, e a chave de lookup); na allowlist da guarda de CI`
- `UNIQUE (store_id, code)`
- `UNIQUE (store_id, idempotency_key) WHERE idempotency_key IS NOT NULL`
- `INDEX (store_id, created_at DESC) — fila do dia e listagem; medido: Index Scan 0,213 ms / 23 buffers em 300k pedidos`
- `INDEX (store_id, status) INCLUDE (total_cents, cost_total_cents, public_token, store_customer_id) — cobridor que INCLUI as colunas citadas pelas policies; medido: Index Only Scan, Heap Fetches 0, 0,718 ms contra 12,99 ms sem o INCLUDE`
- `INDEX (store_id, store_customer_id, created_at DESC) — historico do cliente na loja`
- `INDEX (store_id, channel, created_at DESC) — separar pedido do site e manual (AC-810)`
- `INDEX (store_id, status, created_at DESC) WHERE status IN ('PENDING','ACCEPTED','PREPARING','OUT_FOR_DELIVERY') — painel ao vivo`

### `order_contacts` `[loja]`

TODA a PII do pedido isolada em uma linha (nome, telefone, endereco de entrega), inclusive para convidado. Isolar assim transforma 'atender pedido de exclusao LGPD' em um UPDATE unico, em vez de cacar dado espalhado — e mantem orders sem PII.

**Campos**

- `order_id uuid PK FK orders`
- `store_id uuid NOT NULL`
- `name text NOT NULL — 'firstName'+'lastName' do checkout do MVP`
- `phone_e164 text NOT NULL`
- `phone_hmac bytea — permite o cliente logado reclamar pedidos antigos feitos como convidado, sem indexar telefone em claro`
- `email text NULL`
- `doc_number text NULL — CPF opt-in, nunca obrigatorio por padrao`
- `recipient_name text — 'destinatario'`
- `street, number, complement, neighborhood, city, uf, zip text`
- `reference_point text`
- `lat, lng numeric(9,6)`
- `anonymized_at timestamptz`
- `created_at timestamptz`

**Relações**

- 1:1 orders

**Índices**

- `PK (order_id)`
- `INDEX (store_id, phone_hmac) — reconhecer cliente recorrente e reclamar pedido de convidado`
- `INDEX (store_id) WHERE anonymized_at IS NULL — job de retencao`

### `order_items` `[loja]`

SNAPSHOT IMUTAVEL do item comprado. Guarda nome, preco unitario, preco riscado e CUSTO como texto/numero copiado, nao como FK para product_prices — mudar o preco amanha nao pode reescrever o pedido de ontem. As FKs para produto e variante existem apenas como referencia fraca (ON DELETE SET NULL) para 'pedir novamente' e para o ranking do dashboard.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL`
- `order_id uuid NOT NULL FK orders ON DELETE RESTRICT`
- `product_id uuid NULL FK products ON DELETE SET NULL — referencia FRACA; nulo avisa 'saiu de linha' (AC-713)`
- `variant_id uuid NULL FK product_variants ON DELETE SET NULL`
- `product_name text NOT NULL — snapshot`
- `variant_name text — snapshot`
- `sku_snapshot text`
- `price_kind_snapshot text — qual preco foi usado (BASE|PROMO|WHOLESALE) e por que (AC-310)`
- `unit_price_cents bigint NOT NULL — snapshot`
- `compare_at_cents bigint — snapshot do riscado`
- `unit_cost_cents bigint — snapshot do CUSTO: sem ele nao existe margem historica`
- `quantity int NOT NULL CHECK (quantity > 0)`
- `options_total_cents bigint NOT NULL DEFAULT 0 — acrescimos somados a parte do preco base`
- `line_total_cents bigint NOT NULL`
- `note text — observacao por item`
- `attributes_snapshot jsonb — atributos do vertical no momento`
- `fraction_index smallint — qual fracao (meio a meio)`
- `sort_order int`
- `created_at timestamptz`

**Relações**

- N:1 orders
- N:1 products (fraca)
- N:1 product_variants (fraca)
- 1:N order_item_options

**Índices**

- `INDEX (store_id, order_id, sort_order)`
- `INDEX (store_id, product_id, created_at DESC) — produtos mais vendidos do periodo (AC-807)`
- `TRIGGER BEFORE UPDATE OR DELETE que levanta excecao + ausencia de policy de UPDATE/DELETE`

### `order_item_options` `[loja]`

Snapshot das escolhas do item — sabor, adicionais, remocoes, tamanho. Guarda o nome do grupo e da opcao por extenso porque o dono pode renomear ou apagar o grupo depois, e o cupom impresso e a mensagem do WhatsApp precisam continuar reproduziveis.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL`
- `order_item_id uuid NOT NULL FK order_items ON DELETE RESTRICT`
- `option_item_id uuid NULL FK option_items ON DELETE SET NULL — referencia fraca`
- `group_name_snapshot text NOT NULL — 'Sabor', 'Adicionais'`
- `option_name_snapshot text NOT NULL — 'Queijo', 'Bacon'`
- `kind_snapshot text NOT NULL — INGREDIENT|ADDON|VARIATION|FRACTION`
- `action text NOT NULL DEFAULT 'ADD' — ADD|REMOVE ('sem cebola')`
- `price_delta_cents bigint NOT NULL DEFAULT 0`
- `quantity int NOT NULL DEFAULT 1 — no cupom e no WhatsApp multiplica pela quantidade do item pai`
- `external_code_snapshot text — 'cod.' impresso`
- `sort_order int`

**Relações**

- N:1 order_items
- N:1 option_items (fraca)

**Índices**

- `INDEX (store_id, order_item_id, sort_order)`
- `TRIGGER BEFORE UPDATE OR DELETE que levanta excecao`

### `order_status_history` `[loja]`

Toda transicao de estado, com quem fez e quando. Alimenta a pagina publica de acompanhamento e permite calcular tempo medio de preparo e de entrega — impossivel se so o status atual for guardado.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL`
- `order_id uuid NOT NULL FK orders`
- `from_status text NULL — NULL na criacao`
- `to_status text NOT NULL`
- `changed_by_identity_id uuid NULL FK identities — NULL = sistema/cliente`
- `actor_role text NOT NULL — OWNER|STAFF|CUSTOMER|SYSTEM|ADMIN_GERAL`
- `reason text — motivo da recusa`
- `occurred_at timestamptz NOT NULL DEFAULT now()`
- `CHECK (from_status IS DISTINCT FROM to_status)`

**Relações**

- N:1 orders
- N:1 identities

**Índices**

- `INDEX (store_id, order_id, occurred_at)`
- `INDEX (store_id, to_status, occurred_at DESC) — tempo medio por etapa`
- `TRIGGER append-only`

### `order_payments` `[loja]`

Conciliacao do PIX MANUAL: comprovante enviado pelo cliente e confirmacao explicita do dono, com registro de quem confirmou e quando. Fecha o unico loop que o PIX sem gateway deixa aberto e que nenhum concorrente resolve.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL`
- `order_id uuid NOT NULL FK orders`
- `method text NOT NULL — PIX|CASH|CARD_ON_DELIVERY`
- `amount_cents bigint NOT NULL`
- `proof_asset_id uuid NULL FK assets — upload do comprovante; UI NUNCA trata upload como pagamento aprovado`
- `proof_uploaded_at timestamptz`
- `confirmed_by_identity_id uuid NULL FK identities`
- `confirmed_at timestamptz — acao explicita 'Confirmar recebimento'`
- `rejected_at timestamptz`
- `rejection_reason text`
- `created_at timestamptz`

**Relações**

- N:1 orders
- N:1 assets
- N:1 identities

**Índices**

- `INDEX (store_id, order_id)`
- `INDEX (store_id, confirmed_at) WHERE confirmed_at IS NULL — fila de conferencia do dono`

### `carts` `[loja]`

Carrinho persistido — sobrevive ao recarregar (AC-502) e serve TAMBEM como rascunho do pedido manual do dono, o que e o que permite orders nascer imutavel: monta-se aqui, congela-se la. Base para recuperacao de carrinho abandonado.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `token text NOT NULL — cookie do visitante anonimo`
- `store_customer_id uuid NULL FK store_customers`
- `channel text NOT NULL DEFAULT 'ONLINE' — MANUAL quando e o dono lancando`
- `fulfillment text`
- `coupon_code text`
- `contact jsonb — dados parciais do checkout`
- `subtotal_cents bigint DEFAULT 0`
- `abandoned_at timestamptz — job marca carrinho parado`
- `recovered_at timestamptz`
- `converted_order_id uuid NULL FK orders`
- `expires_at timestamptz NOT NULL`
- `created_at, updated_at timestamptz`

**Relações**

- N:1 stores
- 1:N cart_items
- 1:1 orders (quando converte)

**Índices**

- `UNIQUE (store_id, token)`
- `INDEX (store_id, abandoned_at) WHERE converted_order_id IS NULL`
- `INDEX (expires_at) — purga`

### `cart_items` `[loja]`

Itens do carrinho com as escolhas ainda VIVAS (FK real para produto, variante e opcao) — o oposto de order_items. E isso que permite avisar 'o preco mudou' ou 'ficou indisponivel' antes de fechar (AC-503).

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL`
- `cart_id uuid NOT NULL FK carts ON DELETE CASCADE`
- `product_id uuid NOT NULL FK products`
- `variant_id uuid NOT NULL FK product_variants`
- `quantity int NOT NULL CHECK (quantity > 0)`
- `selected_options jsonb NOT NULL DEFAULT '[]' — [{group_id, option_item_id, quantity}]`
- `note text`
- `price_seen_cents bigint — o que o cliente viu; divergencia gera aviso, nunca cobranca`
- `added_at timestamptz`

**Relações**

- N:1 carts
- N:1 products
- N:1 product_variants

**Índices**

- `INDEX (store_id, cart_id)`
- `INDEX (store_id, product_id)`

### `store_sequences` `[loja]`

Contador por loja para o numero do pedido ('A-1042' do MVP, '0001' do admin). Incremento atomico com UPDATE ... RETURNING; sequence do Postgres nao serve porque a numeracao precisa ser POR LOJA e sem buracos visiveis.

**Campos**

- `store_id uuid NOT NULL FK stores`
- `name text NOT NULL — 'order'`
- `prefix text — 'A-'`
- `current_value bigint NOT NULL DEFAULT 0`
- `PRIMARY KEY (store_id, name)`

**Relações**

- N:1 stores

**Índices**

- `PK (store_id, name)`

### `coupons` `[loja]`

Cupom do dono (nomeCupom/descontoCupom/validadeCupom do MVP), com teto de desconto obrigatorio no percentual. Incide SEMPRE sobre o subtotal, nunca sobre o frete.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `code_norm text NOT NULL — upper(btrim(code))`
- `label text`
- `discount_type text NOT NULL — PERCENT|FIXED`
- `discount_value int NOT NULL — pontos percentuais ou centavos`
- `max_discount_cents bigint NULL — obrigatorio quando PERCENT (CHECK): 20% sem teto e prejuizo imprevisivel`
- `min_subtotal_cents bigint NOT NULL DEFAULT 0`
- `usage_limit int NULL — total de cupons disponiveis`
- `used_count int NOT NULL DEFAULT 0`
- `per_customer_limit int NULL`
- `segment text — GENERAL|FIRST_ORDER|INFLUENCER|POST_SALE`
- `starts_at, ends_at timestamptz`
- `is_active boolean NOT NULL DEFAULT true`
- `created_at timestamptz`
- `CHECK (discount_type <> 'PERCENT' OR max_discount_cents IS NOT NULL)`
- `CHECK (used_count >= 0)`

**Relações**

- N:1 stores
- 1:N coupon_redemptions
- 1:N orders

**Índices**

- `UNIQUE (store_id, code_norm) — tenant-scoped: unique global vazaria a existencia do cupom de outra loja e faria o upsert errar`
- `INDEX (store_id, is_active, ends_at)`

### `coupon_redemptions` `[loja]`

Registro de cada resgate, para limite por cliente e auditoria. O incremento do contador acontece na mesma transacao do pedido, por UPDATE condicional atomico.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL`
- `coupon_id uuid NOT NULL FK coupons`
- `order_id uuid NOT NULL FK orders`
- `store_customer_id uuid NULL FK store_customers`
- `discount_cents bigint NOT NULL`
- `redeemed_at timestamptz NOT NULL DEFAULT now()`

**Relações**

- N:1 coupons
- 1:1 orders
- N:1 store_customers

**Índices**

- `UNIQUE (store_id, order_id) — um cupom por pedido`
- `INDEX (store_id, coupon_id, store_customer_id) — limite por cliente`
- `INDEX (store_id, coupon_id)`

### `delivery_zones` `[loja]`

Area e taxa de entrega nas tres estrategias (unica, por bairro, por raio). O RESULTADO do calculo e uma uniao discriminada gravada no pedido, o que evita colapsar cinco situacoes operacionais distintas em um null.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `strategy text NOT NULL — STATIC|NEIGHBORHOOD|RADIUS`
- `neighborhood text NULL`
- `city text NULL`
- `zip_from, zip_to text NULL`
- `radius_km numeric(6,2) NULL`
- `fee_mode text NOT NULL — VALUE|FREE|ASK ('A combinar', saida pragmatica de quem nao sabe precificar frete)`
- `fee_cents bigint NULL`
- `eta_min_minutes, eta_max_minutes int`
- `hide_eta boolean DEFAULT false`
- `min_order_cents bigint`
- `is_active boolean DEFAULT true`
- `sort_order int`

**Relações**

- N:1 stores

**Índices**

- `INDEX (store_id, strategy) WHERE is_active`
- `INDEX (store_id, lower(neighborhood)) WHERE strategy='NEIGHBORHOOD'`
- `INDEX (store_id, radius_km) WHERE strategy='RADIUS'`

### `store_payment_methods` `[loja]`

Formas de pagamento aceitas por loja (pagEntrega/pagCartao/pagPix do MVP) como linhas, para ordenar e desativar sem migration. Nenhuma etapa cobra de verdade nem guarda dado de cartao (AC-513).

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `method text NOT NULL — PIX|CASH|CARD_ON_DELIVERY|OTHER`
- `label text — 'Combinar com o entregador'`
- `is_active boolean DEFAULT true`
- `instructions text`
- `sort_order int`

**Relações**

- N:1 stores

**Índices**

- `UNIQUE (store_id, method)`
- `INDEX (store_id, sort_order) WHERE is_active`

### `print_agents` `[loja]`

Agente de impressao instalado na maquina da loja, pareado por codigo de 6 digitos. Token proprio de escopo minimo (print:poll) — nunca o JWT do dono.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `name text — 'PC do caixa'`
- `token_sha256 bytea NOT NULL`
- `pairing_code text NULL`
- `pairing_expires_at timestamptz`
- `profile jsonb — {cols, codepage, cut, beep, qr, transport:'usb|tcp', address}`
- `agent_version text`
- `last_heartbeat_at timestamptz — semaforo 'agente offline ha 4 min' no painel`
- `revoked_at timestamptz`
- `created_at timestamptz`

**Relações**

- N:1 stores
- 1:N print_jobs

**Índices**

- `UNIQUE (token_sha256)`
- `INDEX (store_id, last_heartbeat_at DESC)`
- `UNIQUE (store_id, pairing_code) WHERE pairing_code IS NOT NULL`

### `print_jobs` `[loja]`

Fila de impressao em POSTGRES puro (nao Redis), reivindicada com SELECT ... FOR UPDATE SKIP LOCKED e lease — assim a impressao nao para quando o Redis cair, participa da mesma transacao do pedido e herda o isolamento por store_id. Guarda blocos SEMANTICOS, nao bytes ESC/POS.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `order_id uuid NULL FK orders`
- `agent_id uuid NULL FK print_agents`
- `kind text NOT NULL — KITCHEN|COUNTER|DELIVERY`
- `copies smallint DEFAULT 1`
- `seq smallint DEFAULT 1`
- `reprint_of uuid NULL FK print_jobs — reimpressao gera job NOVO, marcado '*** REIMPRESSAO #n ***'`
- `blocks jsonb NOT NULL — payload semantico; o agente compila p/ os bytes do perfil dele`
- `status text NOT NULL DEFAULT 'QUEUED' — QUEUED|LEASED|PRINTED|FAILED|DEAD`
- `lease_until timestamptz`
- `attempt smallint DEFAULT 0`
- `last_error text`
- `printed_at timestamptz`
- `created_at timestamptz`

**Relações**

- N:1 stores
- N:1 orders
- N:1 print_agents
- auto-referencia (reprint_of)

**Índices**

- `INDEX (store_id, status, created_at) WHERE status IN ('QUEUED','LEASED') — reivindicacao da fila`
- `UNIQUE (store_id, order_id, kind, seq)`
- `INDEX (lease_until) WHERE status='LEASED' — devolver job com lease expirado`

### `notification_outbox` `[loja]`

Fila de mensagens ao cliente (mudanca de status, retomada de carrinho) atras de uma PORTA de canal: na v1 o adaptador e deep link wa.me montado no painel; a v2 pode plugar Cloud API por loja sem tocar no dominio. Efeito externo NUNCA acontece dentro da transacao do pedido.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `order_id uuid NULL FK orders`
- `channel text NOT NULL — WA_DEEPLINK|WA_CLOUD|EMAIL|WEBPUSH`
- `transition text — ACCEPTED|OUT_FOR_DELIVERY|COMPLETED`
- `payload jsonb NOT NULL`
- `status text NOT NULL DEFAULT 'PENDING' — PENDING|SENT|FAILED|SKIPPED`
- `attempt smallint DEFAULT 0`
- `sent_at timestamptz`
- `last_error text`
- `created_at timestamptz`

**Relações**

- N:1 stores
- N:1 orders

**Índices**

- `UNIQUE (store_id, order_id, transition, channel) — impede notificacao duplicada em clique duplo ou retry`
- `INDEX (store_id, status, created_at) WHERE status='PENDING'`

### `store_metrics_daily` `[loja]`

ROLLUP diario por loja e canal — a escolha de agregacao do dashboard. Tabela normal tenant-scoped com RLS (nunca matview, que ignora RLS e vazou todas as lojas no teste). Distribuicao horaria vive em array de 24 posicoes, o que da 'movimento por hora' (AC-809) sem join nem 24x linhas.

**Campos**

- `store_id uuid NOT NULL FK stores`
- `day date NOT NULL — no timezone da loja`
- `channel text NOT NULL — ONLINE|MANUAL (AC-810)`
- `orders_count int NOT NULL DEFAULT 0`
- `orders_completed int NOT NULL DEFAULT 0`
- `orders_cancelled int NOT NULL DEFAULT 0 — cancelado nao infla faturamento (AC-812)`
- `revenue_cents bigint NOT NULL DEFAULT 0`
- `cost_cents bigint NOT NULL DEFAULT 0`
- `margin_cents bigint GENERATED ALWAYS AS (revenue_cents - cost_cents) STORED — margem real, que os concorrentes nao calculam por nao guardarem custo`
- `items_count int NOT NULL DEFAULT 0`
- `avg_ticket_cents bigint`
- `new_customers int NOT NULL DEFAULT 0`
- `orders_by_hour smallint[24] NOT NULL`
- `revenue_by_hour_cents bigint[24] NOT NULL`
- `computed_at timestamptz NOT NULL — o painel mostra 'atualizado as HH:MM'; numero em cache nunca se passa por instantaneo (AC-814)`
- `PRIMARY KEY (store_id, day, channel)`

**Relações**

- N:1 stores

**Índices**

- `PK (store_id, day, channel)`
- `INDEX (store_id, day DESC) — medido: 30 dias em 0,027 ms / 5 buffers, contra 12,99 ms agregando 5.000 pedidos crus`

### `product_metrics_daily` `[loja]`

Rollup diario por produto: ranking de mais vendidos e margem por item — 'qual item me da mais dinheiro' e mais acionavel para o pequeno empreendedor que 'qual vende mais'.

**Campos**

- `store_id uuid NOT NULL`
- `day date NOT NULL`
- `product_id uuid NOT NULL FK products`
- `quantity int NOT NULL DEFAULT 0`
- `revenue_cents bigint NOT NULL DEFAULT 0`
- `cost_cents bigint NOT NULL DEFAULT 0`
- `orders_count int NOT NULL DEFAULT 0`
- `computed_at timestamptz NOT NULL`
- `PRIMARY KEY (store_id, day, product_id)`

**Relações**

- N:1 stores
- N:1 products

**Índices**

- `PK (store_id, day, product_id)`
- `INDEX (store_id, day DESC, quantity DESC) — top N do periodo`

### `plans` `[global]`

Plano comercial (global, sem store_id). A v1 tem UMA linha 'free_v1' com price_cents = 0 e todas as features ligadas — a estrutura existe, a cobranca nao. Assim planos futuros nao exigem migration de dados.

**Campos**

- `id uuid PK`
- `code text NOT NULL — 'free_v1'`
- `name text NOT NULL`
- `price_cents bigint NOT NULL DEFAULT 0`
- `billing_period text — MONTHLY|YEARLY|NONE`
- `is_public boolean DEFAULT true`
- `is_default boolean DEFAULT false`
- `sort_order int`
- `created_at timestamptz`

**Relações**

- 1:N plan_features
- 1:N subscriptions
- 1:N stores

**Índices**

- `UNIQUE (code)`
- `UNIQUE (is_default) WHERE is_default`

### `plan_features` `[global]`

Quais capacidades e quais limites cada plano libera. Na v1 todas presentes e com limite NULL (ilimitado) — em especial pedidos/mes, porque o modelo do concorrente estrangula justamente o negocio que comecou a dar certo.

**Campos**

- `plan_id uuid NOT NULL FK plans`
- `feature_key text NOT NULL — 'orders_per_month'|'custom_domain'|'auto_print'|'multi_store'`
- `is_enabled boolean NOT NULL DEFAULT true`
- `limit_value bigint NULL — NULL = ilimitado`
- `PRIMARY KEY (plan_id, feature_key)`

**Relações**

- N:1 plans

**Índices**

- `PK (plan_id, feature_key)`

### `subscriptions` `[loja]`

Assinatura da loja a um plano, com periodo. Na v1 toda loja nasce assinante do free_v1 sem meio de pagamento — o registro existe para que ligar cobranca depois seja configuracao, nao remodelagem.

**Campos**

- `id uuid PK`
- `store_id uuid NOT NULL FK stores`
- `plan_id uuid NOT NULL FK plans`
- `status text NOT NULL DEFAULT 'ACTIVE' — ACTIVE|TRIALING|PAST_DUE|CANCELED`
- `trial_ends_at timestamptz`
- `current_period_start, current_period_end timestamptz`
- `canceled_at timestamptz`
- `external_ref text — id no futuro gateway`
- `created_at, updated_at timestamptz`

**Relações**

- N:1 stores
- N:1 plans

**Índices**

- `UNIQUE (store_id) WHERE status IN ('ACTIVE','TRIALING')`
- `INDEX (plan_id, status)`

### `store_feature_overrides` `[loja]`

Liga e desliga funcionalidade POR LOJA, acima do plano — e o que o ADMIN_GERAL usa em US-204, e o que permite 'funcionalidade desligada nao aparece para a loja' (AC-212) sem tocar no plano.

**Campos**

- `store_id uuid NOT NULL FK stores`
- `feature_key text NOT NULL`
- `is_enabled boolean NOT NULL`
- `limit_value bigint NULL`
- `reason text`
- `set_by uuid FK identities`
- `set_at timestamptz`
- `PRIMARY KEY (store_id, feature_key)`

**Relações**

- N:1 stores
- N:1 identities

**Índices**

- `PK (store_id, feature_key)`

### `feature_flags` `[global]`

Kill switch global de plataforma (sem store_id), para desligar um recurso em incidente sem deploy — separado de plano e de override por loja, que sao decisoes comerciais.

**Campos**

- `key text PK`
- `is_enabled boolean NOT NULL DEFAULT true`
- `rollout_percent smallint DEFAULT 100`
- `description text`
- `updated_by uuid FK identities`
- `updated_at timestamptz`

**Relações**

- N:1 identities

**Índices**

- `PK (key)`

### `usage_counters` `[loja]`

Contador de uso por loja e periodo (pedidos no mes, imagens, impressoes). Na v1 nao limita nada — serve para medir e para ser o gancho onde quota de plano futuro encaixa sem migration.

**Campos**

- `store_id uuid NOT NULL FK stores`
- `metric text NOT NULL — 'orders'|'images'|'prints'`
- `period_start date NOT NULL`
- `value bigint NOT NULL DEFAULT 0`
- `updated_at timestamptz`
- `PRIMARY KEY (store_id, metric, period_start)`

**Relações**

- N:1 stores

**Índices**

- `PK (store_id, metric, period_start)`

### `consents` `[loja]`

Consentimento LGPD granular e revogavel, separado da execucao do contrato. Existe porque a base legal do pedido (art. 7, V) NAO cobre mandar promocao depois — misturar as duas coisas num unico aceite no checkout e a nao conformidade mais provavel do produto.

**Campos**

- `id uuid PK`
- `store_id uuid NULL FK stores — NULL = consentimento de plataforma`
- `identity_id uuid NULL FK identities`
- `store_customer_id uuid NULL FK store_customers`
- `purpose text NOT NULL — MARKETING_WHATSAPP|MARKETING_EMAIL|ANALYTICS`
- `granted boolean NOT NULL`
- `policy_version text NOT NULL — versao do texto aceito`
- `source text — CHECKOUT|ACCOUNT|IMPORT`
- `ip_hmac bytea`
- `granted_at timestamptz`
- `revoked_at timestamptz`

**Relações**

- N:1 stores
- N:1 identities
- N:1 store_customers

**Índices**

- `INDEX (store_id, store_customer_id, purpose, granted_at DESC)`
- `INDEX (identity_id, purpose)`

### `audit_log` `[loja]`

Trilha append-only e tamper-evident com cadeia de hash. As colunas prev_hash/row_hash existem desde a PRIMEIRA migration porque adiciona-las depois exigiria recalcular a cadeia sobre dados que ja nao sao confiaveis — retrofit destroi o valor do controle.

**Campos**

- `id uuid PK`
- `store_id uuid NULL — NULL = evento de plataforma`
- `occurred_at timestamptz NOT NULL DEFAULT now()`
- `actor_identity_id uuid NULL`
- `actor_role text — OWNER|STAFF|CUSTOMER|ADMIN_GERAL|SYSTEM`
- `action text NOT NULL — PRODUTO_PRECO_ALTERADO|PIX_ALTERADO|CONTRATO_BAIXADO|LOJA_SUSPENSA|REFRESH_REUSE_DETECTED|RLS_VIOLATION`
- `entity text`
- `entity_id uuid`
- `before jsonb — redigido por allowlist`
- `after jsonb`
- `request_id text`
- `ip_hmac bytea`
- `user_agent text`
- `prev_hash bytea`
- `row_hash bytea — HMAC-SHA256(chave_servidor, prev_hash || json_canonico)`

**Relações**

- N:1 stores (opcional)
- N:1 identities

**Índices**

- `INDEX (store_id, occurred_at DESC)`
- `INDEX (store_id, action, occurred_at DESC)`
- `INDEX (entity, entity_id)`
- `REVOKE UPDATE, DELETE + TRIGGER BEFORE UPDATE OR DELETE — verificado: erra com 'permission denied' antes mesmo do trigger`

## Políticas de isolamento (SQL)

### `app — helpers, roles e event trigger (base de todas as politicas)` — papel: sc_migrator (owner + BYPASSRLS, so migrations) · sc_app (runtime OWNER/STAFF/CUSTOMER/PUBLIC) · sc_admin (runtime ADMIN_GERAL)

```sql
-- Tres roles, credenciais e pools separados. O runtime nao e owner e nao tem BYPASSRLS
-- (medido: BYPASSRLS vence FORCE ROW LEVEL SECURITY).
CREATE ROLE sc_migrator LOGIN PASSWORD :'migrator_pw' BYPASSRLS;
CREATE ROLE sc_app      LOGIN PASSWORD :'app_pw'      NOBYPASSRLS NOINHERIT;
CREATE ROLE sc_admin    LOGIN PASSWORD :'admin_pw'    NOBYPASSRLS NOINHERIT;
CREATE SCHEMA app AUTHORIZATION sc_migrator;
GRANT USAGE ON SCHEMA app TO sc_app, sc_admin;

-- Exatamente os 4 DML. Nunca ALL PRIVILEGES (TRUNCATE e REFERENCES nao sofrem RLS).
ALTER DEFAULT PRIVILEGES FOR ROLE sc_migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sc_app, sc_admin;

-- Helpers empty-string-safe. VERIFICADO no PG 16.14: apos COMMIT o GUC continua
-- DEFINIDO com string vazia (current_setting(...) IS NULL = false), e ''::uuid
-- levanta 22P02. Com nullif o helper devolve NULL -> comparacao NULL -> 0 linhas.
CREATE OR REPLACE FUNCTION app.current_store_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT nullif(current_setting('app.store_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app.current_role_name() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT coalesce(nullif(current_setting('app.role', true), ''), 'PUBLIC') $$;

CREATE OR REPLACE FUNCTION app.is_store_staff() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT app.current_role_name() IN ('OWNER','STAFF') $$;

-- GUC dedicado da pagina publica de acompanhamento (pedido de convidado, sem login)
CREATE OR REPLACE FUNCTION app.current_order_token() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT nullif(current_setting('app.order_token', true), '') $$;

-- SECURITY DEFINER: unica forma de uma policy atravessar o RLS de outra tabela.
-- Policy que faz EXISTS numa tabela com RLS NEGA EM SILENCIO.
CREATE OR REPLACE FUNCTION app.my_store_customer_ids() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT coalesce(array_agg(sc.id), '{}'::uuid[])
     FROM app.store_customers sc
    WHERE sc.identity_id IS NOT NULL
      AND sc.identity_id = app.current_user_id() $$;
REVOKE ALL ON FUNCTION app.my_store_customer_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.my_store_customer_ids() TO sc_app;

CREATE OR REPLACE FUNCTION app.can_read_order(p_order_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT EXISTS (
     SELECT 1 FROM app.orders o
      WHERE o.id = p_order_id
        AND ( (app.current_order_token() IS NOT NULL
               AND o.public_token = app.current_order_token()
               AND o.store_id = app.current_store_id())
           OR (app.current_role_name() = 'CUSTOMER'
               AND o.store_customer_id = ANY (app.my_store_customer_ids())) ) ) $$;
REVOKE ALL ON FUNCTION app.can_read_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_read_order(uuid) TO sc_app;

-- Event trigger: esquecer RLS na migration passa a ser falha FECHADA em dev
-- (default deny), nunca vazamento em producao.
CREATE OR REPLACE FUNCTION app.force_rls_on_new_tables() RETURNS event_trigger
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF r.command_tag = 'CREATE TABLE' AND r.schema_name = 'app' THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.object_identity);
      EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', r.object_identity);
    END IF;
  END LOOP;
END $$;
CREATE EVENT TRIGGER trg_force_rls ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION app.force_rls_on_new_tables();
```

### `app.products` — papel: sc_app: PUBLIC/CUSTOMER leem so o publicado; OWNER/STAFF leem e escrevem tudo da propria loja · sc_admin: total

```sql
ALTER TABLE app.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.products FORCE  ROW LEVEL SECURITY;

-- Vitrine publica e cliente: so PUBLISHED e nao apagado.
-- Rascunho fica invisivel inclusive por endereco direto (AC-308).
CREATE POLICY products_storefront_select ON app.products FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC','CUSTOMER')
     AND status = 'PUBLISHED' AND deleted_at IS NULL);

-- Dono/equipe: tudo da propria loja, inclusive rascunho e lixeira.
CREATE POLICY products_staff_select ON app.products FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY products_staff_insert ON app.products FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- WITH CHECK explicito no UPDATE e o que bloqueia MOVER produto para outra loja.
-- VERIFICADO: tentar trocar store_id levanta 'new row violates row-level security policy'.
CREATE POLICY products_staff_update ON app.products FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY products_staff_delete ON app.products FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- Cinto RESTRICTIVE: sem contexto de loja, nada. O 'TO sc_app' e OBRIGATORIO —
-- policy restritiva sem TO valeria para PUBLIC e atingiria tambem o sc_admin.
CREATE POLICY products_require_ctx ON app.products AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

-- ADMIN_GERAL enxerga tudo por policy explicita e auditavel, sem BYPASSRLS.
CREATE POLICY products_admin_all ON app.products FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- MEDIDO com 120k produtos: as duas policies permissive de SELECT compartilham
-- 'store_id = $' como conjunto, entao o planner FATORA store_id e mantem o
-- Index Scan ordenado (0,061 ms / 26 buffers) aplicando o resto como Filter.
```

### `app.orders` — papel: sc_app: OWNER/STAFF (fila e painel), CUSTOMER (so os proprios), PUBLIC (um pedido, por token) · sc_admin: total

```sql
ALTER TABLE app.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.orders FORCE  ROW LEVEL SECURITY;

-- REGRA DE OURO MEDIDA: TODA policy permissive desta tabela quente precisa conter
-- 'store_id = current_store_id()' como conjunto. Com 300k pedidos, uma unica policy
-- sem esse conjunto (historico cross-store do cliente) impediu o planner de fatorar
-- store_id, virou BitmapOr e destruiu o acesso ordenado:
--   ORDER BY created_at DESC LIMIT 20  ->  6,357 ms / 5.123 buffers / 5.000 heap blocks
-- Com todas as policies escopadas por store_id:
--   mesma consulta          ->  0,213 ms /    23 buffers  (36x tempo, 222x buffers)

CREATE POLICY orders_staff_select ON app.orders FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- CUSTOMER: os proprios pedidos NA LOJA CORRENTE. O historico cross-store
-- ('meus pedidos em todas as lojas') e servido por funcao SECURITY DEFINER,
-- justamente para nao introduzir aqui uma policy sem store_id.
-- Note o ::uuid[]: sem o cast, 'ANY ((SELECT fn()))' e lido como ANY(subquery)
-- e falha com 'operator does not exist: uuid = uuid[]'. Com o cast vira InitPlan
-- (avaliado UMA vez), em vez de chamada por linha.
CREATE POLICY orders_customer_select ON app.orders FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) = 'CUSTOMER'
     AND store_customer_id = ANY ((SELECT app.my_store_customer_ids())::uuid[]));

-- Pagina publica de acompanhamento: sem login, por token de alta entropia.
-- Tambem resolve o RETURNING do INSERT do convidado (a API seta o GUC com o
-- token que ela mesma gerou, antes de inserir).
CREATE POLICY orders_token_select ON app.orders FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND public_token = (SELECT app.current_order_token()));

-- Checkout: convidado e cliente so criam pedido ONLINE e PENDING; o dono cria
-- pedido manual. Nem um nem outro escolhe a loja: store_id vem do contexto.
CREATE POLICY orders_checkout_insert ON app.orders FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND ( (SELECT app.is_store_staff())
             OR ((SELECT app.current_role_name()) IN ('PUBLIC','CUSTOMER')
                 AND channel = 'ONLINE' AND status = 'PENDING') ));

-- So a loja muda status.
CREATE POLICY orders_staff_update ON app.orders FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY orders_require_ctx ON app.orders AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY orders_admin_all ON app.orders FOR ALL TO sc_admin USING (true) WITH CHECK (true);

-- NENHUMA policy de DELETE: pedido nunca e apagado, nem pelo dono.
-- VERIFICADO: DELETE do OWNER devolve 'DELETE 0' (default deny).

-- Historico cross-store do comprador, fora do conjunto de policies:
CREATE OR REPLACE FUNCTION app.list_my_orders(p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE (id uuid, store_id uuid, store_name text, code text, status text,
               total_cents bigint, placed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT o.id, o.store_id, s.name, o.code, o.status, o.total_cents, o.placed_at
     FROM app.orders o JOIN app.stores s ON s.id = o.store_id
    WHERE app.current_role_name() = 'CUSTOMER'
      AND o.store_customer_id = ANY (app.my_store_customer_ids())
    ORDER BY o.placed_at DESC LIMIT p_limit OFFSET p_offset $$;
REVOKE ALL ON FUNCTION app.list_my_orders(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_my_orders(int, int) TO sc_app;
```

### `app.order_items e app.order_item_options (snapshot imutavel)` — papel: sc_app: OWNER/STAFF da loja; CUSTOMER e portador do token via can_read_order() · sc_admin: total

```sql
ALTER TABLE app.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.order_items FORCE  ROW LEVEL SECURITY;

CREATE POLICY oi_staff_select ON app.order_items FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- Caminho de baixo volume (detalhe de UM pedido): funcao SECURITY DEFINER,
-- porque um EXISTS direto em app.orders sofreria o RLS de orders e devolveria
-- zero linhas SEM ERRO — negacao silenciosa, o bug mais dificil de diagnosticar.
CREATE POLICY oi_actor_select ON app.order_items FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND app.can_read_order(order_id));

CREATE POLICY oi_insert ON app.order_items FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND ((SELECT app.is_store_staff()) OR app.can_read_order(order_id)));

CREATE POLICY oi_admin_all ON app.order_items FOR ALL TO sc_admin USING (true) WITH CHECK (true);
-- Sem policy de UPDATE nem de DELETE: o snapshot e imutavel por RLS...

-- ...e tambem por trigger, para que a imutabilidade valha inclusive para
-- sc_migrator/BYPASSRLS e para qualquer script administrativo.
CREATE OR REPLACE FUNCTION app.deny_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'linha imutavel: % nao aceita %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '23514';
END $$;

CREATE TRIGGER order_items_immutable BEFORE UPDATE OR DELETE ON app.order_items
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();
CREATE TRIGGER order_item_options_immutable BEFORE UPDATE OR DELETE ON app.order_item_options
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();
CREATE TRIGGER order_status_history_immutable BEFORE UPDATE OR DELETE ON app.order_status_history
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();

-- order_item_options segue o mesmo desenho, pendurado em order_items:
ALTER TABLE app.order_item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.order_item_options FORCE  ROW LEVEL SECURITY;
CREATE POLICY oio_staff_select ON app.order_item_options FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY oio_actor_select ON app.order_item_options FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND EXISTS (SELECT 1 FROM app.order_items i
                  WHERE i.id = order_item_id AND app.can_read_order(i.order_id)));
CREATE POLICY oio_insert ON app.order_item_options FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()));
CREATE POLICY oio_admin_all ON app.order_item_options FOR ALL TO sc_admin USING (true) WITH CHECK (true);
```

### `app.order_contacts (PII do pedido, inclusive convidado)` — papel: sc_app: OWNER/STAFF (precisa para entregar), CUSTOMER dono do pedido, portador do token · sc_admin: total. Anonimizacao: so funcao dedicada

```sql
ALTER TABLE app.order_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.order_contacts FORCE  ROW LEVEL SECURITY;

CREATE POLICY ocont_staff_select ON app.order_contacts FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY ocont_actor_select ON app.order_contacts FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND app.can_read_order(order_id));

CREATE POLICY ocont_insert ON app.order_contacts FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND ((SELECT app.is_store_staff()) OR app.can_read_order(order_id)));

-- Correcao de endereco antes do aceite: so a loja.
CREATE POLICY ocont_staff_update ON app.order_contacts FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY ocont_admin_all ON app.order_contacts FOR ALL TO sc_admin USING (true) WITH CHECK (true);
-- Sem policy de DELETE: o direito a eliminacao e atendido por ANONIMIZACAO,
-- nao por DELETE — apagar destruiria retencao fiscal de 5 anos, as metricas do
-- comerciante e a cadeia de hash do audit_log.

CREATE OR REPLACE FUNCTION app.anonymize_customer_pii(p_store_customer_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE n int;
BEGIN
  UPDATE app.order_contacts oc
     SET name = 'Titular removido', phone_e164 = '+000000000000', phone_hmac = NULL,
         email = NULL, doc_number = NULL, recipient_name = NULL,
         street = NULL, number = NULL, complement = NULL, neighborhood = NULL,
         zip = NULL, lat = NULL, lng = NULL, reference_point = NULL,
         anonymized_at = now()
    FROM app.orders o
   WHERE o.id = oc.order_id AND o.store_customer_id = p_store_customer_id
     AND oc.anonymized_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE app.store_customers
     SET display_name = 'Titular removido', phone_e164 = NULL, email = NULL,
         doc_number = NULL, notes = NULL, birth_date = NULL, anonymized_at = now()
   WHERE id = p_store_customer_id;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION app.anonymize_customer_pii(uuid) FROM PUBLIC;
-- concedida so ao worker de retencao, nunca ao pool de request
```

### `app.store_customers (dois eixos de contexto — onde o vazamento real aconteceu)` — papel: sc_app: OWNER/STAFF veem os clientes DA LOJA; CUSTOMER ve APENAS a propria linha · sc_admin: total

```sql
ALTER TABLE app.store_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_customers FORCE  ROW LEVEL SECURITY;

-- Eixo 1: o dono ve os clientes dele. O gate por papel e obrigatorio.
CREATE POLICY sc_staff_scope ON app.store_customers FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- Eixo 2: o cliente ve a propria linha.
-- ATENCAO — policies PERMISSIVE combinam com OR, e este par de eixos ja vazou
-- DUAS vezes no teste:
--  (a) sem o gate de papel no eixo 1, a CLIENTE Maria navegando na loja A
--      (que precisa de app.store_id para ver o catalogo) via os 2 clientes da
--      loja em vez de so a propria linha;
--  (b) sem o gate de papel AQUI, o OWNER da loja A que tambem e cliente da
--      loja B via 3 linhas na lista 'clientes da minha loja' em vez de 2 —
--      a propria linha dele em OUTRA loja entrava na listagem, violando
--      'cliente de outra loja nunca aparece'.
-- Depois de gatear os DOIS eixos: OWNER=2, CUSTOMER=1. Verificado.
CREATE POLICY sc_self_rows ON app.store_customers FOR SELECT TO sc_app
  USING ((SELECT app.current_role_name()) = 'CUSTOMER'
     AND identity_id IS NOT NULL
     AND identity_id = (SELECT app.current_user_id()));

-- Cadastro manual pelo dono (cliente sem conta na plataforma).
CREATE POLICY sc_staff_insert ON app.store_customers FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- Auto-vinculo: so a SI MESMO e so na loja corrente.
CREATE POLICY sc_self_insert ON app.store_customers FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND identity_id = (SELECT app.current_user_id()));

CREATE POLICY sc_staff_update ON app.store_customers FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY sc_admin_all ON app.store_customers FOR ALL TO sc_admin USING (true) WITH CHECK (true);
```

### `app.identities (PII global — invisivel para o dono de loja)` — papel: sc_app: somente a propria identidade · sc_admin: total · cadastro e login: funcao SECURITY DEFINER dedicada

```sql
ALTER TABLE app.identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.identities FORCE  ROW LEVEL SECURITY;

CREATE POLICY identities_self_select ON app.identities FOR SELECT TO sc_app
  USING (id = (SELECT app.current_user_id()));

CREATE POLICY identities_self_update ON app.identities FOR UPDATE TO sc_app
  USING      (id = (SELECT app.current_user_id()))
  WITH CHECK (id = (SELECT app.current_user_id()));

CREATE POLICY identities_admin_all ON app.identities FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- VERIFICADO: o OWNER de uma loja le 0 linhas de app.identities. A PII global
-- (e-mail, hash de senha, segredo TOTP) nao escapa para o lojista — ele ve
-- apenas a projecao em store_customers.
-- Cadastro e login NAO passam por sc_app: rodam em funcao SECURITY DEFINER
-- dedicada, porque precisam consultar por e-mail antes de existir sessao.
-- Nao ha policy de INSERT nem de DELETE para sc_app: default deny.
```

### `app.stores e app.store_settings (o problema do ovo e da galinha)` — papel: sc_app: leitura da loja corrente (publico ve so ACTIVE); OWNER/STAFF editam a propria · sc_admin: cria, suspende e exclui

```sql
ALTER TABLE app.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.stores FORCE  ROW LEVEL SECURITY;

-- Vitrine: loja suspensa ou apagada nao existe para o publico (AC-402).
CREATE POLICY stores_public_select ON app.stores FOR SELECT TO sc_app
  USING (id = (SELECT app.current_store_id())
     AND status = 'ACTIVE' AND deleted_at IS NULL);

-- Dono ve a propria loja em qualquer status (para saber que esta suspensa).
CREATE POLICY stores_staff_select ON app.stores FOR SELECT TO sc_app
  USING (id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

CREATE POLICY stores_staff_update ON app.stores FOR UPDATE TO sc_app
  USING      (id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- Somente o ADMIN_GERAL cria, suspende e exclui loja.
CREATE POLICY stores_admin_all ON app.stores FOR ALL TO sc_admin USING (true) WITH CHECK (true);

-- IMPORTANTE: stores NAO recebe a policy RESTRICTIVE de contexto obrigatorio,
-- porque resolver host/slug -> store_id acontece ANTES de existir contexto.
-- Esse unico ponto e servido por funcao SECURITY DEFINER com DTO minimo
-- (allowlist explicita): nunca 'SELECT *' da tabela de configuracao, que e
-- exatamente como o concorrente vazou chave PIX, titular e coordenadas num
-- endpoint publico — vazamento na serializacao, que RLS nao protege.
CREATE OR REPLACE FUNCTION app.resolve_store(p_host text, p_slug text)
RETURNS TABLE (id uuid, slug text, status text, vertical_code text,
               timezone text, catalog_version bigint, canonical_host text,
               redirect_needed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT s.id, s.slug, s.status, s.vertical_code, s.timezone, s.catalog_version,
          d.host, (d.kind = 'LEGACY_SLUG')
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

-- store_settings: contem a chave PIX; leitura publica JAMAIS direta.
ALTER TABLE app.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_settings FORCE  ROW LEVEL SECURITY;
CREATE POLICY settings_staff_all ON app.store_settings FOR ALL TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY settings_admin_all ON app.store_settings FOR ALL TO sc_admin USING (true) WITH CHECK (true);
-- O que a vitrine precisa (tema, textos, formas de pagamento habilitadas,
-- BR Code ja montado) sai por funcao/DTO com allowlist, nunca pela tabela.
```

### `app.categories, product_variants, product_prices, option_groups, option_items, product_images, product_attributes, availability_windows (bloco canonico do catalogo)` — papel: sc_app: PUBLIC/CUSTOMER leem o publicado da loja corrente; OWNER/STAFF CRUD completo · sc_admin: total

```sql
-- Bloco replicado por tabela de catalogo. product_prices tem uma regra EXTRA
-- que e a mais importante do arquivo: o preco de CUSTO nunca sai para o publico.

ALTER TABLE app.product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.product_prices FORCE  ROW LEVEL SECURITY;

-- Vitrine e cliente: todos os precos MENOS o de custo, e so o que esta vigente.
-- Defesa em profundidade: o DTO publico ja tem allowlist, mas aqui o banco
-- garante que nem um SELECT * acidental exporia a margem do lojista.
CREATE POLICY prices_storefront_select ON app.product_prices FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC','CUSTOMER')
     AND kind <> 'COST'
     AND is_active
     AND (starts_at IS NULL OR starts_at <= now())
     AND (ends_at   IS NULL OR ends_at   >  now()));

CREATE POLICY prices_staff_select ON app.product_prices FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY prices_staff_write ON app.product_prices FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY prices_staff_update ON app.product_prices FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY prices_staff_delete ON app.product_prices FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY prices_require_ctx ON app.product_prices AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);
CREATE POLICY prices_admin_all ON app.product_prices FOR ALL TO sc_admin USING (true) WITH CHECK (true);

-- categories: a vitrine so ve categoria visivel (AC-301)
CREATE POLICY cat_storefront_select ON app.categories FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC','CUSTOMER')
     AND is_visible AND deleted_at IS NULL);
CREATE POLICY cat_staff_select ON app.categories FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
-- (+ insert/update/delete de staff, RESTRICTIVE de contexto e admin_all
--    exatamente como no bloco de products)

-- option_items: item indisponivel CONTINUA visivel, marcado (AC-317) —
-- por isso a policy nao filtra is_available; quem decide e a UI.
CREATE POLICY opt_items_storefront_select ON app.option_items FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC','CUSTOMER'));

-- product_attributes: atributo interno nao vaza para a vitrine
CREATE POLICY attrs_storefront_select ON app.product_attributes FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC','CUSTOMER')
     AND EXISTS (SELECT 1 FROM app.attribute_definitions d
                  WHERE d.id = definition_id AND d.is_public));
-- attribute_definitions e tabela mista (global + custom por loja):
CREATE POLICY attrdef_select ON app.attribute_definitions FOR SELECT TO sc_app
  USING (store_id IS NULL OR store_id = (SELECT app.current_store_id()));
```

### `app.coupons (resgate atomico sob concorrencia)` — papel: sc_app: OWNER/STAFF administram; PUBLIC/CUSTOMER NAO leem a tabela (anti-enumeracao) e resgatam por funcao · sc_admin: total

```sql
ALTER TABLE app.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.coupons FORCE  ROW LEVEL SECURITY;

-- Deliberadamente NAO existe policy de SELECT para PUBLIC/CUSTOMER: dar leitura
-- permitiria varrer a tabela e descobrir todos os codigos da loja.
CREATE POLICY coupons_staff_all ON app.coupons FOR ALL TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY coupons_admin_all ON app.coupons FOR ALL TO sc_admin USING (true) WITH CHECK (true);

-- Resgate: UPDATE condicional atomico com RETURNING dentro da transacao do
-- pedido. Nao ha leitura-depois-escrita, entao dois checkouts simultaneos no
-- ultimo cupom nao estouram o limite. Contagem JAMAIS lida do Redis.
CREATE OR REPLACE FUNCTION app.redeem_coupon(p_code text, p_subtotal_cents bigint)
RETURNS TABLE (coupon_id uuid, discount_cents bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE v_id uuid; v_type text; v_val integer; v_cap bigint; v_disc bigint;
BEGIN
  UPDATE app.coupons c SET used_count = c.used_count + 1
   WHERE c.store_id = app.current_store_id()
     AND c.code_norm = upper(btrim(p_code))
     AND c.is_active
     AND (c.starts_at IS NULL OR c.starts_at <= now())
     AND (c.ends_at   IS NULL OR c.ends_at   >  now())
     AND (c.usage_limit IS NULL OR c.used_count < c.usage_limit)
     AND c.min_subtotal_cents <= p_subtotal_cents
   RETURNING c.id, c.discount_type, c.discount_value, c.max_discount_cents
        INTO v_id, v_type, v_val, v_cap;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cupom invalido ou indisponivel' USING ERRCODE = '22023';
  END IF;
  -- desconto SEMPRE sobre o subtotal, nunca sobre o frete
  v_disc := CASE WHEN v_type = 'PERCENT'
                 THEN least((p_subtotal_cents * v_val) / 100,
                            coalesce(v_cap, 9223372036854775807))
                 ELSE least(v_val::bigint, p_subtotal_cents) END;
  RETURN QUERY SELECT v_id, v_disc;
END $$;
REVOKE ALL ON FUNCTION app.redeem_coupon(text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.redeem_coupon(text, bigint) TO sc_app;

-- VERIFICADO com cupom PERCENT 20%, teto R$ 15, limite 2 usos:
--  1o resgate (subtotal R$ 100)   -> 1500 (teto aplicado, nao 2000)
--  2o resgate (subtotal R$ 1.000) -> 1500 (teto aplicado, nao 20000)
--  3o resgate                     -> ERRO 'cupom invalido ou indisponivel'
--  resgate do contexto da loja B  -> ERRO (nao encontra cupom da loja A)
```

### `app.store_metrics_daily e app.product_metrics_daily (rollup do dashboard)` — papel: sc_app: OWNER/STAFF somente leitura da propria loja · sc_admin: total · escrita: apenas o worker (sc_migrator), fora do pool de request

```sql
ALTER TABLE app.store_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_metrics_daily FORCE  ROW LEVEL SECURITY;

CREATE POLICY smd_staff_select ON app.store_metrics_daily FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY smd_admin_all ON app.store_metrics_daily FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);
-- Nenhuma policy de INSERT/UPDATE para sc_app: o rollup e populado pelo worker
-- com sc_migrator, em processo separado que nao recebe input de request.

ALTER TABLE app.product_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.product_metrics_daily FORCE  ROW LEVEL SECURITY;
CREATE POLICY pmd_staff_select ON app.product_metrics_daily FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY pmd_admin_all ON app.product_metrics_daily FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- Views de dashboard: security_invoker e OBRIGATORIO. Sem ele a view roda com
-- os direitos do owner (que tem BYPASSRLS) e mostra TODAS as lojas.
-- VERIFICADO: com security_invoker=true o OWNER da loja A ve 1 loja e nao 2.
-- MATERIALIZED VIEW e PROIBIDA no schema app: nao suporta RLS nem
-- security_invoker de forma alguma.
CREATE VIEW app.v_store_metrics_today WITH (security_invoker = true) AS
SELECT o.store_id, o.channel,
       count(*)                                    AS orders_count,
       sum(o.total_cents)                          AS revenue_cents,
       sum(o.total_cents - o.cost_total_cents)     AS margin_cents
  FROM app.orders o
 WHERE o.status NOT IN ('CANCELLED','REJECTED')
   AND o.placed_at >= date_trunc('day', now() AT TIME ZONE o.store_timezone)
 GROUP BY o.store_id, o.channel;
GRANT SELECT ON app.v_store_metrics_today TO sc_app, sc_admin;
```

### `app.audit_log (append-only e tamper-evident)` — papel: sc_app: INSERT + SELECT da propria loja; UPDATE/DELETE revogados · sc_admin: INSERT + SELECT global

```sql
ALTER TABLE app.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_log FORCE  ROW LEVEL SECURITY;

CREATE POLICY audit_insert ON app.audit_log FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()));
CREATE POLICY audit_staff_select ON app.audit_log FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY audit_admin_insert ON app.audit_log FOR INSERT TO sc_admin WITH CHECK (true);
CREATE POLICY audit_admin_select ON app.audit_log FOR SELECT TO sc_admin USING (true);

-- Tres camadas, porque append-only por si so NAO e tamper-evident:
-- 1) ausencia de policy de UPDATE/DELETE (default deny)
-- 2) REVOKE do privilegio  3) trigger que levanta excecao
REVOKE UPDATE, DELETE ON app.audit_log FROM sc_app, sc_admin;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON app.audit_log
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();

-- VERIFICADO: UPDATE e DELETE do OWNER falham com 'permission denied for table
-- audit_log' — o REVOKE barra antes do trigger. A policy de SELECT existe
-- porque o ORM usa RETURNING em create: tabela write-only conceitual SEM policy
-- de SELECT faz o insert do ORM falhar com 42501.
-- VERIFICADO tambem: OWNER da loja B le 0 linhas do audit da loja A.
```

### `app.print_jobs e app.print_agents (fila de impressao)` — papel: sc_app: OWNER/STAFF gerenciam; papel PRINT_AGENT consome a fila com escopo minimo · sc_admin: total

```sql
ALTER TABLE app.print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.print_jobs FORCE  ROW LEVEL SECURITY;

CREATE POLICY pj_staff_select ON app.print_jobs FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND ((SELECT app.is_store_staff())
       OR (SELECT app.current_role_name()) = 'PRINT_AGENT'));

-- Enfileirar acontece na MESMA transacao do pedido: nao existe pedido salvo
-- sem job enfileirado. O efeito externo (escrever na impressora) fica fora.
CREATE POLICY pj_insert ON app.print_jobs FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND ((SELECT app.is_store_staff())
            OR (SELECT app.current_role_name()) IN ('PUBLIC','CUSTOMER')));

-- O agente so reivindica e da baixa (lease/ack) na fila da PROPRIA loja.
CREATE POLICY pj_agent_update ON app.print_jobs FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id())
          AND ((SELECT app.is_store_staff())
            OR (SELECT app.current_role_name()) = 'PRINT_AGENT'))
  WITH CHECK (store_id = (SELECT app.current_store_id()));

CREATE POLICY pj_require_ctx ON app.print_jobs AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);
CREATE POLICY pj_admin_all ON app.print_jobs FOR ALL TO sc_admin USING (true) WITH CHECK (true);

-- Reivindicacao com lease, imune a dois agentes pareados na mesma loja:
-- UPDATE app.print_jobs SET status='LEASED', agent_id=$1, lease_until=now()+interval '60 s',
--        attempt=attempt+1
--  WHERE id IN (SELECT id FROM app.print_jobs
--                WHERE store_id=app.current_store_id()
--                  AND (status='QUEUED' OR (status='LEASED' AND lease_until < now()))
--                ORDER BY created_at
--                FOR UPDATE SKIP LOCKED LIMIT 5)
--  RETURNING *;

ALTER TABLE app.print_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.print_agents FORCE  ROW LEVEL SECURITY;
CREATE POLICY pa_staff_all ON app.print_agents FOR ALL TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY pa_agent_heartbeat ON app.print_agents FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id())
          AND (SELECT app.current_role_name()) = 'PRINT_AGENT')
  WITH CHECK (store_id = (SELECT app.current_store_id()));
CREATE POLICY pa_admin_all ON app.print_agents FOR ALL TO sc_admin USING (true) WITH CHECK (true);
```

### `app.store_contracts (documentos sigilosos da loja)` — papel: sc_admin: exclusivo (upload, listagem, download) · sc_app: nenhum acesso, nem o proprio dono

```sql
ALTER TABLE app.store_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_contracts FORCE  ROW LEVEL SECURITY;

-- Nenhuma policy para sc_app: contrato e documento de identidade nao sao
-- alcancaveis pelo pool de request das lojas, em nenhuma circunstancia.
-- Uma SQL injection numa rota de OWNER nao chega a estes dados, porque a
-- conexao do pool de admin foi autenticada com OUTRA credencial.
CREATE POLICY contracts_admin_all ON app.store_contracts FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- 'Documento anexado nunca fica publico' (AC-205) tem tres camadas:
-- 1) RLS: so sc_admin;
-- 2) bucket PRIVADO em host separado do origin da app, download so por
--    presigned GET de 5 min com Content-Disposition: attachment + nosniff;
-- 3) todo download gera linha em audit_log (action='CONTRATO_BAIXADO'),
--    que e um dos eventos com ALERTA ativo.
```

### `GUARDAS DE CI — consultas de catalogo que quebram o build` — papel: executadas como sc_migrator no pipeline; qualquer linha retornada reprova o merge

```sql
-- GUARDA 1: toda tabela com store_id tem RLS enabled E forced.
-- Esta guarda pegou omissao real durante a validacao (store_metrics_daily e
-- audit_log haviam ficado sem RLS): o valor dela nao e teorico.
SELECT c.relname AS tabela_sem_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'app' AND c.relkind = 'r'
   AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
                AND a.attname = 'store_id' AND a.attnum > 0 AND NOT a.attisdropped)
   AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

-- GUARDA 2: policy usando current_setting cru (sem helper com nullif).
-- Sem nullif a policy gera 22P02 intermitente em conexao reaproveitada do pool.
SELECT polname
  FROM pg_policy p
 WHERE pg_get_expr(p.polqual, p.polrelid)      LIKE '%current_setting%'
    OR pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%current_setting%';

-- GUARDA 3: TODA policy permissive de tabela quente cita store_id.
-- E a guarda que protege o ganho medido de 36x no acesso ordenado.
SELECT c.relname, p.polname
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'app' AND p.polpermissive
   AND c.relname IN ('orders','order_items','products','product_prices','store_customers')
   AND coalesce(pg_get_expr(p.polqual, p.polrelid), '') NOT LIKE '%store_id%'
   AND 'sc_admin' <> ALL (SELECT rolname FROM pg_roles WHERE oid = ANY (p.polroles));

-- GUARDA 4: unique de negocio (nao-PK) que nao lidera com store_id.
-- A allowlist e curta, explicita e revisada — nao um relaxamento do glob.
WITH allowlist(idx) AS (VALUES
  ('orders_public_token_uk'),  -- token de alta entropia: lookup global e o objetivo
  ('stores_slug_uk'),          -- slug e a chave de roteamento publico
  ('stores_code_uk'),
  ('identities_email_uk'))     -- unica unique global de PII, enumeravel por design
SELECT c.relname AS tbl, i.relname AS idx, pg_get_indexdef(x.indexrelid) AS def
  FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
  JOIN pg_class c ON c.oid = x.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'app' AND x.indisunique AND NOT x.indisprimary
   AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'store_id')
   AND i.relname NOT IN (SELECT idx FROM allowlist)
   AND (SELECT attname FROM pg_attribute a
         WHERE a.attrelid = c.oid AND a.attnum = x.indkey[0]) IS DISTINCT FROM 'store_id';

-- GUARDA 5: role de runtime com BYPASSRLS ou SUPERUSER (anula todo o isolamento).
SELECT rolname FROM pg_roles
 WHERE (rolbypassrls OR rolsuper) AND rolname NOT IN ('postgres','sc_migrator')
   AND rolname NOT LIKE 'pg\_%';

-- GUARDA 6: role de runtime como owner de tabela (owner burla RLS sem FORCE).
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'app' AND c.relkind = 'r'
   AND pg_get_userbyid(c.relowner) IN ('sc_app','sc_admin');

-- GUARDA 7: runtime com privilegio alem dos 4 DML (TRUNCATE/REFERENCES nao sofrem RLS).
SELECT table_name, privilege_type FROM information_schema.role_table_grants
 WHERE grantee IN ('sc_app','sc_admin') AND table_schema = 'app'
   AND privilege_type NOT IN ('SELECT','INSERT','UPDATE','DELETE');

-- GUARDA 8: matview no schema app e PROIBIDA; view sem security_invoker reprova.
SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'app'
   AND (c.relkind = 'm'
     OR (c.relkind = 'v' AND coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
                                        WHERE option_name = 'security_invoker'), 'off') <> 'true'));

-- GUARDA 9: tabela com RLS sem policy para cada comando, com allowlist de
-- tabelas intencionalmente append-only / somente-leitura.
WITH append_only(t) AS (VALUES
  ('audit_log'), ('order_items'), ('order_item_options'),
  ('order_status_history'), ('store_metrics_daily'), ('product_metrics_daily')),
  t AS (SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'app' AND c.relkind = 'r' AND c.relrowsecurity),
  cmds AS (SELECT unnest(ARRAY['r','a','w','d']) cmd)
SELECT t.relname, cmds.cmd FROM t CROSS JOIN cmds
 WHERE t.relname NOT IN (SELECT t FROM append_only)
   AND NOT EXISTS (SELECT 1 FROM pg_policy p
                    WHERE p.polrelid = t.oid AND p.polcmd IN (cmds.cmd, '*'));

-- GUARDA 10: a suite de teste NAO pode rodar como superuser, senao o RLS fica
-- inerte e tudo passa verde.
SELECT rolname FROM pg_roles
 WHERE rolname = current_user AND (rolsuper OR rolbypassrls);

-- TRIPWIRE POSITIVO (por tabela): prova que a policy esta ATIVA, e nao que a
-- tabela esta vazia ou que falta GRANT. VERIFICADO: levanta
-- 'query would be affected by row-level security policy for table "products"'.
BEGIN;
  SET LOCAL row_security = off;
  SELECT set_config('app.store_id', $1, true);
  SELECT count(*) FROM app.products;  -- DEVE levantar excecao
ROLLBACK;
```

## Decisões de modelagem

### 1. Como servir comida, roupa, peca de carro e eletronico na MESMA tabela de produto, sem uma tabela por vertical e sem virar um EAV ingovernavel?

**Decisão.** Tres camadas: (1) products.product_type (SIMPLE|VARIABLE|FRACTIONED) descreve o COMPORTAMENTO de venda; (2) vertical_presets (tabela global de seed) define o VOCABULARIO em labels jsonb — 'Cardapio' vs 'Catalogo', 'Ingredientes' vs 'Especificacoes', 'Sabor' vs 'Variacao'; (3) attribute_definitions e um REGISTRO TIPADO por vertical, e product_attributes guarda valores com FK OBRIGATORIA para a definicao. products.attributes jsonb existe apenas como cache desnormalizado, reconstruido por trigger.

**Por quê.** E o registro de definicoes que fecha o EAV e o torna governavel: chave inexistente nao entra (a FK barra), o data_type e conhecido, e o schema Zod de validacao e GERADO do registro — entao nao ha segunda fonte de verdade entre banco e aplicacao. Atributo marcado is_filterable ganha indice em (store_id, definition_id, value_text) e vira faceta de vitrine, o que JSONB solto nao entrega bem. Tabela por vertical foi descartada por tres motivos concretos: multiplicaria por N cada policy de RLS, cada indice e cada consulta da API; quebraria a loja que vende comida E camiseta; e uma quinta vertical exigiria migration em vez de linha de seed. EAV puro foi descartado porque sem registro nao ha validacao, nao ha UI (a tela nao sabe que campos desenhar) nem filtro. O cache jsonb resolve a leitura da vitrine em uma unica ida ao banco sem virar fonte de verdade — quando divergir, reconstroi-se do tipado.

### 2. Trocar o tipo de negocio da loja pode apagar dado ja cadastrado?

**Decisão.** Nao. products carrega vertical_code e vertical_schema_version PROPRIOS, copiados no cadastro, e attribute_definitions tem deprecated_at em vez de DELETE. Trocar o vertical da loja muda apenas o vocabulario da interface e quais definicoes sao OFERECIDAS em novos cadastros.

**Por quê.** E requisito explicito (AC-320: 'trocar o tipo de negocio preserva o que ja foi cadastrado'). Se o produto lesse o vertical da loja por FK viva, mudar de Lanchonete para Restaurante invalidaria retroativamente os atributos ja gravados e a UI passaria a esconder dado existente. Guardando o vertical e a versao no proprio produto, a loja migra e nada se perde: os atributos que nao pertencem ao vertical novo aparecem agrupados como campos herdados, visiveis e editaveis.

### 3. Preco: tres colunas (preco, promocional, atacado) ou entidade?

**Decisão.** Entidade product_prices, com kind (BASE|PROMO|WHOLESALE|COST|CLUB), label nomeado pelo dono, amount_cents, min_quantity e janela starts_at/ends_at. Cardinalidade aberta: a loja pode ter 2 ou 6 precos. O preco pendura na VARIANTE, nao no produto.

**Por quê.** Tres colunas amarram o modelo em tres e transformam 'quero um quarto preco' em migration. Com entidade, o 'terceiro preco que nomeei como Atacado, valido a partir de seis unidades' (AC-310) e uma linha com label='Atacado' e min_quantity=6, sem coluna nova. Mais importante: separar kind de variante impede o erro classico de usar os tres slots como P/M/G — tamanho tem cardinalidade aberta (pizza tem 4, camiseta tem 6) e e unidade vendavel com SKU e estoque, coisa que 'tipo de preco' nao modela. Assim os 3 precos ficam SEMANTICAMENTE distintos (a pagar, riscado, custo) e a grade de tamanhos vive em product_variants, sem competir pelo mesmo espaco.

### 4. Onde fica o preco de CUSTO, se ele nunca pode ser exposto?

**Decisão.** Como kind='COST' na mesma tabela, protegido em duas camadas: policy de RLS que exclui kind='COST' para PUBLIC/CUSTOMER, e DTO publico com allowlist explicita. O custo e copiado para order_items.unit_cost_cents no fechamento do pedido.

**Por quê.** Guardar o custo e o que permite margem real por produto e por pedido no dashboard — metrica que nenhum concorrente examinado calcula, porque nenhum guarda custo. Mas custo vazado e a margem do lojista na mao do concorrente dele. Duas camadas porque cada uma cobre a falha da outra: o DTO protege a serializacao (onde o vazamento realmente acontece, e onde RLS nao alcanca), e a policy protege contra um SELECT * acidental em codigo novo. Snapshot em order_items porque margem historica precisa do custo VIGENTE na venda: se o custo do queijo subir, o lucro do mes passado nao pode mudar.

### 5. Ingrediente (comida) e variacao (roupa/peca) usam o mesmo mecanismo? Onde exatamente diferem?

**Decisão.** Mesma estrutura option_groups + option_items, com min_select, max_select, allow_repeat e max_per_option; obrigatorio e DERIVADO de min_select >= 1, nao coluna redundante. A diferenca esta em duas colunas: kind (INGREDIENT|ADDON|VARIATION|FRACTION|SPEC) escolhe o rotulo do vertical, e is_variant_axis decide se a escolha resolve uma product_variant. Quando is_variant_axis=true, a combinacao dos eixos aponta por variant_option_values para uma variante que tem SKU, codigo de barras e estoque; quando false, o item apenas soma price_delta_cents.

**Por quê.** O proprio MVP ja tinha o mecanismo: 'Escolha o Sabor do Pastel' era radio (min 1, max 1) e 'Adicionais' era checkbox (min 0, max N) — em loja de roupa isso vira tamanho e cor sem nenhuma estrutura nova. A distincao que importa e economica, nao visual: ingrediente nao tem estoque proprio (bacon acaba para todos os lanches ao mesmo tempo, e o controle e is_available no item), enquanto variacao TEM estoque e codigo por combinacao (camiseta M azul acaba independente de M vermelha, AC-316). Amarrar variacao a uma variante real e o que permite grade tamanho x cor — matriz que um modelo de 'opcionais' puro nao representa. E option_price_overrides resolve 'bacon extra custa diferente em pizza P e G', ausencia de linha caindo no delta padrao, entao o caso simples nao paga complexidade.

### 6. Como garantir que o pedido seja um snapshot IMUTAVEL, sem FK viva para preco?

**Decisão.** order_items e order_item_options guardam texto e numero COPIADOS (product_name, variant_name, sku, unit_price_cents, compare_at_cents, unit_cost_cents, price_kind, group_name, option_name, price_delta). As FKs para produto, variante e opcao existem como referencia FRACA (ON DELETE SET NULL) e nunca para ler preco. A imutabilidade e imposta em duas camadas: ausencia de policy de UPDATE/DELETE e trigger BEFORE UPDATE OR DELETE que levanta excecao — o trigger vale inclusive para sc_migrator/BYPASSRLS.

**Por quê.** FK viva para product_prices faria o pedido de ontem mudar quando o dono reajustasse o preco hoje: o historico mentiria, a margem mentiria e a comanda impressa divergiria da mensagem do WhatsApp. Guardar o nome por extenso e igualmente necessario porque o dono renomeia e apaga grupos de opcao, e o cupom precisa continuar reproduzivel meses depois. A referencia fraca fica porque 'pedir novamente' (AC-712) e o ranking de mais vendidos precisam saber QUAL produto era, e o NULL apos exclusao e justamente o sinal de 'esse item saiu de linha' (AC-713). Duas camadas de imutabilidade porque RLS sozinho protege o pool de request mas nao um script administrativo rodando como migrator — e o trigger sozinho nao documenta a intencao nas policies. VERIFICADO: UPDATE e DELETE em order_items pelo OWNER devolvem 0 linhas, e o trigger barra qualquer caminho privilegiado.

### 7. Se o pedido e imutavel a partir da criacao, como o dono monta um pedido manual e como o cliente edita o carrinho?

**Decisão.** A montagem acontece em carts/cart_items, que tem FK VIVA para produto, variante e opcao. orders nasce atomicamente no fechamento, com placed_at preenchido, e ja imutavel. carts.channel='MANUAL' cobre o pedido lancado pelo dono.

**Por quê.** Resolve dois requisitos com uma estrutura. O carrinho precisa de FK viva exatamente para o oposto do pedido: e ela que permite detectar que o preco mudou ou que o item ficou indisponivel e AVISAR antes de fechar (AC-503) — impossivel com snapshot. E o pedido manual (AC-707) exige um rascunho editavel; sem carrinho como rascunho, seria preciso permitir UPDATE em orders 'so antes do aceite', o que abriria a porta que a imutabilidade fecha e criaria uma janela ambigua de quando o pedido vira imutavel. Com essa separacao a fronteira e nitida: antes de placed_at e carrinho, depois e pedido, e nao existe estado intermediario.

### 8. Pedido de cliente NAO cadastrado (convidado): como registrar sem conta e sem espalhar PII?

**Decisão.** orders.store_customer_id e NULL e toda a PII vai para order_contacts (1:1 com orders): nome, telefone, e-mail, documento e endereco completo. orders NAO contem PII. order_contacts.phone_hmac permite que um cliente que depois criar conta RECLAME pedidos antigos feitos como convidado.

**Por quê.** Convidado e requisito (AC-518) e e a maioria dos pedidos reais no publico-alvo — exigir conta mataria a conversao do pequeno negocio. Concentrar a PII numa tabela transforma 'atender pedido de exclusao LGPD' de uma cacada por dado espalhado em orders, customers e mensagens para um UPDATE de uma linha; essa e a diferenca entre cumprir e nao cumprir o prazo legal, e refatorar depois seria migracao de dados sob prazo regulatorio. O HMAC do telefone (em vez do telefone indexado em claro) da a reconciliacao do historico sem criar um indice de PII pesquisavel.

### 9. O direito a exclusao da LGPD e implementado como DELETE?

**Decisão.** Nao: como ANONIMIZACAO, via funcao SECURITY DEFINER app.anonymize_customer_pii() que faz UPDATE em order_contacts e store_customers preenchendo anonymized_at. Nao existe policy de DELETE nessas tabelas.

**Por quê.** O direito a eliminacao (art. 18, VI) nao e absoluto: dado retido por obrigacao legal permanece, mas deve ser bloqueado para outras finalidades. Um DELETE destruiria tres coisas de uma vez — a retencao fiscal de 5 anos (CDC art. 27), as metricas de faturamento do comerciante (que nao cometeu infracao nenhuma) e a cadeia de hash do audit_log, que perderia a propriedade de tamper-evidence. A anonimizacao atende o titular integralmente e preserva as tres. Rodar por funcao dedicada, concedida ao worker de retencao e nao ao pool de request, garante que o caminho seja unico e auditavel.

### 10. Como um mesmo comprador tem historico em varias lojas com um unico login, sem que o dono de uma loja alcance dados de outra?

**Decisão.** Duas tabelas: identities (global, guarda a PII de autenticacao, visivel SO para a propria pessoa) e store_customers (projecao por loja com nome e telefone, que o dono precisa para entregar). orders aponta para store_customer_id, nunca para identity_id direto.

**Por quê.** Um unico modelo nao atende os dois lados. Uma tabela customers com store_id obrigaria o comprador a se cadastrar em cada loja, multiplicaria a PII (problema de LGPD) e mataria o historico cross-store. Colocar e-mail e senha na tabela tenant-scoped seria pior: qualquer dono leria a PII global do cliente. Com a projecao, o dono ve exatamente o que precisa para operar e VERIFICADO le 0 linhas de app.identities; o comprador ve os pedidos dele nas duas lojas. Orders apontar para a projecao (e nao para a identidade) mantem toda tabela de pedido escopada por loja, o que e o que preserva o isolamento simples e os indices liderados por store_id.

### 11. O CUSTOMER precisa de app.store_id para ver o catalogo E e uma identidade. Como impedir que os dois eixos se somem?

**Decisão.** Toda policy de escopo-de-loja em tabela que TAMBEM tem policy self-scoped e gateada por app.current_role_name(). Vale para os DOIS lados: o eixo do dono exige role IN ('OWNER','STAFF') e o eixo do cliente exige role = 'CUSTOMER'.

**Por quê.** Policies PERMISSIVE combinam com OR, e isso produziu vazamento real duas vezes na validacao. Primeiro, sem gate no eixo do dono, a cliente Maria navegando na loja A (com app.store_id e app.user_id setados, como o catalogo exige) viu os 2 clientes da loja em vez de so a propria linha. Segundo — e menos obvio — sem gate no eixo do cliente, o OWNER da loja A que tambem e cliente da loja B viu 3 linhas na lista 'clientes da minha loja' em vez de 2: a propria linha dele em OUTRA loja entrava na listagem, violando 'cliente de outra loja nunca aparece' (AC-702). Gateando os dois eixos: OWNER=2, CUSTOMER=1. A licao e que o gate nao e uma protecao contra o cliente malicioso, e a unica forma de os dois eixos coexistirem sem se somarem.

### 12. Toda policy permissive de tabela quente precisa mesmo citar store_id?

**Decisão.** Sim, e virou GUARDA DE CI. Nenhuma policy permissive de orders, order_items, products, product_prices ou store_customers pode existir sem 'store_id = current_store_id()' como conjunto. O historico cross-store do comprador, que por natureza nao tem store_id, saiu do conjunto de policies e virou a funcao SECURITY DEFINER app.list_my_orders().

**Por quê.** Esta e a decisao com maior impacto medido de todo o schema, e ela nao aparece na literatura de RLS. Com 300k pedidos, uma UNICA policy sem o conjunto store_id (a do historico cross-store) impediu o planner de fatorar store_id do OR das policies, forcou um BitmapOr e DESTRUIU o acesso ordenado por indice: 'ORDER BY created_at DESC LIMIT 20' passou a ler 5.000 heap blocks em 6,357 ms com 5.123 buffers. Com todas as policies escopadas, a mesma consulta voltou a Index Scan: 0,213 ms e 23 buffers — 36x em tempo e 222x em buffers. Em products o efeito nao apareceu justamente porque as duas policies compartilhavam store_id, e o planner fatorou (Index Scan, 0,061 ms). A inversao de custo tambem e correta em termos de produto: o caminho quente e de alto volume (painel e dashboard do dono, milhares de linhas paginadas) fica com o predicado simples, e os caminhos de baixo volume (historico de um cliente, um pedido por token) pagam a funcao SECURITY DEFINER.

### 13. Indice cobridor para o dashboard: basta incluir as colunas da consulta?

**Decisão.** Nao. O indice precisa incluir tambem as colunas citadas pelas POLICIES. Por isso o indice de agregacao e (store_id, status) INCLUDE (total_cents, cost_total_cents, public_token, store_customer_id).

**Por quê.** Descoberta medida e nao intuitiva: com as tres policies de SELECT ativas, um indice cobrindo apenas as colunas da consulta nao permite Index Only Scan, porque o recheck do RLS precisa buscar public_token e store_customer_id no heap. O agregado por status lia 5.000 heap blocks em 12,993 ms. Incluindo as colunas das policies no INCLUDE, o plano virou Index Only Scan com Heap Fetches: 0, em 0,718 ms com 56 buffers — 18x em tempo e 90x em buffers. A regra generalizavel para todo o schema: sob RLS, o conjunto de colunas de um indice cobridor e a uniao das colunas da consulta com as colunas das policies daquela tabela.

### 14. Agregados do dashboard: on-the-fly com indice, view materializada ou tabela de rollup?

**Decisão.** Tabela de rollup store_metrics_daily (+ product_metrics_daily), tenant-scoped e com RLS, populada por worker rodando como sc_migrator fora do pool de request. Hoje sai de view com security_invoker=true sobre orders (dado fresco, volume de um dia); 7 dias, 30 dias e range custom saem do rollup; range parcial combina rollup dos dias fechados com on-the-fly da borda. Distribuicao horaria em array de 24 posicoes na propria linha do dia. MATERIALIZED VIEW e PROIBIDA no schema.

**Por quê.** A matview e o caminho intuitivo e o mais perigoso: nao suporta RLS nem security_invoker de forma alguma, e no teste mostrou as metricas de TODAS as lojas para o role de aplicacao. A view comum tem o mesmo problema por rodar com direitos do owner — so com security_invoker=true o OWNER da loja A passou a ver 1 loja em vez de 2. Entre on-the-fly e rollup, a medicao decidiu: 30 dias pelo rollup custaram 0,027 ms e 5 buffers, contra 12,993 ms agregando os pedidos crus — cerca de 475x, o que no free tier e a diferenca entre painel instantaneo e painel que consome cota de memoria provisionada esperando I/O. O array de 24 posicoes evita 24x linhas e um join para 'movimento por hora' (AC-809). E computed_at na linha e o que permite ao painel dizer 'atualizado as HH:MM' em vez de fingir que o numero e do instante (AC-814).

### 15. Como resolver host/slug -> store_id se o contexto de tenant ainda nao existe (e a policy RESTRICTIVE exige contexto)?

**Decisão.** stores e a UNICA tabela sem a policy RESTRICTIVE de contexto obrigatorio, e a resolucao passa exclusivamente pela funcao SECURITY DEFINER app.resolve_store(host, slug), que devolve um DTO minimo com allowlist explicita (id, slug, status, vertical, timezone, catalog_version, canonical_host).

**Por quê.** E um ovo-e-galinha real: nao se pode setar app.store_id antes de descobrir qual e a loja, e a policy de contexto obrigatorio bloquearia a propria descoberta. Resolver por funcao com DTO fechado mata dois riscos de uma vez. O primeiro e o vazamento na camada de SERIALIZACAO, que RLS nao protege porque a consulta e legitima — foi exatamente assim que o concorrente expos chave PIX, nome do titular, telefone e coordenadas num endpoint publico sem autenticacao. O segundo e a tentacao de fazer 'SELECT *' em stores ou store_settings na vitrine. A regra de arquitetura que decorre: o endpoint publico devolve o BR Code JA MONTADO, nunca o objeto de configuracao de pagamento da loja.

### 16. Como a pagina publica de acompanhamento le UM pedido sem login e sem permitir enumeracao?

**Decisão.** orders.public_token com 128+ bits, e uma policy que compara o token com um GUC dedicado app.order_token setado pela API por requisicao. O mesmo mecanismo resolve o RETURNING do INSERT do convidado, porque a API seta o GUC com o token que ela mesma acabou de gerar. As tabelas filhas usam a funcao SECURITY DEFINER app.can_read_order().

**Por quê.** A pagina e acessivel sem login por requisito (o link vai por WhatsApp), entao ID sequencial permitiria extrair nome, telefone, endereco e itens de todos os pedidos de todas as lojas com um for loop — incidente de LGPD com dever de notificacao a ANPD. O GUC dedicado e melhor que um filtro na aplicacao porque a autorizacao fica no banco, expressa e testavel: VERIFICADO que o token da loja B no contexto da loja A devolve 0 linhas, e que o convidado le o proprio pedido e os itens dele. As filhas precisam da funcao SECURITY DEFINER porque um EXISTS direto em app.orders sofreria o RLS de orders e devolveria zero linhas SEM ERRO — negacao silenciosa e o modo de falha mais caro de diagnosticar.

### 17. UPDATE que cruza loja deve falhar ou passar silenciosamente?

**Decisão.** O banco se comporta de duas formas distintas, e a API precisa tratar as duas: tentar MOVER store_id levanta excecao ('new row violates row-level security policy', barrado pelo WITH CHECK), mas UPDATE ... WHERE store_id = <outra loja> devolve 0 linhas SEM erro. Por isso e norma do repositorio: todo update/delete de recurso identificado por id checa rowCount e devolve 404 quando for 0.

**Por quê.** VERIFICADO nos dois casos. O silencio e o perigoso: sem a checagem de rowCount, um OWNER que acerte o id de outra loja recebe 200 OK e nada acontece — bug de negocio invisivel, que nao aparece no log e some na revisao. Como e o banco que decide silenciar, a unica defesa e convencao mecanica na camada de dados, coberta por um teste por rota mutadora que usa id de outra loja e exige 404. E metrica sobre 'mutacao com 0 linhas afetadas', que em regime normal deve ser raridade, transforma tentativa de acesso cruzado em sinal observavel.

### 18. Chaves unicas: globais ou por loja?

**Decisão.** Todo unique de tabela de loja e (store_id, ...): (store_id, sku), (store_id, slug) em categorias e produtos, (store_id, code_norm) em cupons, (store_id, code) em pedidos. As unicas uniques globais sao stores.slug, stores.code, orders.public_token e identities.email_norm — as quatro numa allowlist explicita e revisada da guarda de CI.

**Por quê.** Unique global em tabela de loja e canal encoberto e quebra o ORM: o INSERT de um SKU que ja existe em outra loja falha com 'duplicate key', revelando a existencia de uma linha invisivel, e um ON CONFLICT sobre linha de outra loja levanta violacao de RLS em vez de fazer o upsert. Com unique tenant-scoped o upsert funciona normalmente. As quatro excecoes sao justificadas uma a uma: slug e code de loja sao chaves de roteamento e de busca do admin, e portanto globais por definicao; public_token e de alta entropia e o lookup global E o objetivo; identities.email_norm e a unica unique global de PII e e enumeravel por design, mitigada com rate limit e resposta generica no cadastro ('enviamos um e-mail se a conta existir', AC-101). A allowlist na guarda existe para que essas quatro sejam decisao consciente e nao esquecimento.

### 19. store_settings em JSONB ou colunas promovidas?

**Decisão.** JSONB validado por Zod com schema_version, e colunas promovidas em stores APENAS para o que entra em indice, RLS, roteamento ou politica de plano: slug, status, vertical_code, timezone, currency, open_state, plan_id, catalog_version.

**Por quê.** O benchmark encontrou cerca de 140 flags de configuracao no concorrente. Replicar isso como colunas transformaria cada decisao de produto em migration e incharia a tabela mais lida do sistema. JSONB da a flexibilidade que configuracao de loja exige (tema, LP, regras de frete, opcoes de checkout, template de WhatsApp, perfil de impressora) mantendo a arquitetura preparada para planos futuros. O criterio de promocao e mecanico e nao estetico: se o campo aparece em WHERE indexado, em policy de RLS ou em decisao de plano, e coluna; senao, e JSONB. schema_version na linha permite evoluir o schema Zod sem migration e sem quebrar loja antiga.

### 20. Categoria e 1:N ou N:M com produto?

**Decisão.** N:M, via product_categories com sort_order POR categoria e uma flag is_primary (unica por produto) para breadcrumb e URL canonica.

**Por quê.** O proprio MVP decidiu isso: a vitrine tinha uma secao 'Promocoes' exibindo itens que tambem apareciam nas secoes deles. Com 1:N o dono teria que duplicar o cadastro para promover um item, fragmentando foto, descricao e — pior — as metricas por produto no dashboard. O sort_order por categoria e necessario porque a ordem do mesmo produto em 'Promocoes' nao e a ordem dele em 'Lanches'. E is_primary unica resolve a URL canonica sem ambiguidade, evitando duplicate content entre duas categorias.

### 21. Fila de impressao em Redis ou Postgres?

**Decisão.** Postgres puro, com SELECT ... FOR UPDATE SKIP LOCKED, lease de 60s, backoff exponencial e estado DEAD apos 6 tentativas. Redis fica como cache estritamente opcional e degradavel.

**Por quê.** Tres razoes convergem. Orcamentaria: o credito do free tier nao sustenta API + Postgres + Redis, e o Redis e o primeiro a cair — se a fila depender dele, a impressao para junto e a cozinha deixa de receber pedido em horario de pico, que e o pior modo de falha do produto. Transacional: enfileirar na mesma transacao do pedido garante que nao exista pedido salvo sem job enfileirado, o que uma fila externa nao consegue prometer. De seguranca: print_jobs ja esta sob RLS com store_id, herdando o isolamento multi-tenant de graca, enquanto uma chave de Redis sem prefixo de loja e um vazamento que o RLS nao alcanca. SKIP LOCKED da exatamente a semantica de visibility timeout necessaria e impede dois agentes pareados na mesma loja de pegarem o mesmo job.

### 22. O que o job de impressao carrega: bytes ESC/POS ou payload semantico?

**Decisão.** Payload semantico em blocks jsonb (align, style, text, kv, lr, rule, qr, feed, cut). O agente local compila para bytes conforme o perfil da impressora daquela loja (32 ou 48 colunas, code page, tipo de corte, buzzer).

**Por quê.** Os bytes dependem de informacao que vive na maquina do dono, nao no servidor. Se a API emitisse bytes, cada correcao de formatacao exigiria reprocessar a fila e — pior — pedidos antigos ficariam nao reimprimiveis corretamente. Com blocos semanticos, o agente e atualizado e reimprime um pedido de tres meses atras fielmente. E o mesmo payload passa a ser consumivel por outros renderizadores (o HTML de window.print() como fallback universal, um endpoint de impressora inteligente no futuro) sem duplicar regra de negocio, o que preserva a API como fonte unica de verdade para os apps nativos futuros.

### 23. Planos futuros sem cobrar nada na v1: quanto da estrutura ja nasce?

**Decisão.** Toda ela, com valores neutros: plans com uma linha 'free_v1' de price_cents=0, plan_features com todas as capacidades is_enabled=true e limit_value NULL (ilimitado), subscriptions com toda loja ACTIVE sem meio de pagamento, store_feature_overrides para o admin ligar e desligar por loja, feature_flags como kill switch global e usage_counters medindo sem limitar.

**Por quê.** E o que torna 'preparado para planos' verdadeiro em vez de aspiracional: ligar cobranca depois passa a ser inserir linhas em plans e plan_features, nao remodelar. A separacao em quatro conceitos e deliberada porque eles mudam por razoes diferentes — plano e comercial, override e atendimento, feature_flag e incidente, usage_counter e medicao. Em particular limit_value NULL em orders_per_month e uma decisao de posicionamento gravada no schema: o free tier do concorrente limita 30 pedidos/mes e cobra por excedente, estrangulando justamente o negocio que comecou a dar certo. Quando houver cobranca, ela deve incidir sobre algo que nao seja 'poder vender' — multi-loja, dominio proprio, relatorios avancados — e usage_counters ja mede tudo isso sem limitar ninguem.

### 24. Dinheiro, fuso e numeracao de pedido: quais tipos?

**Decisão.** Dinheiro sempre bigint em centavos, com currency char(3) por loja; nunca ponto flutuante. Fuso IANA por loja em stores.timezone, copiado para orders.store_timezone no fechamento. Numero do pedido por loja via store_sequences com UPDATE ... RETURNING atomico.

**Por quê.** Centavos inteiros e principio verificavel do projeto (P-005) e o motivo e aritmetico: R$ 19,99 x 3 tem que dar exatamente R$ 59,97 (AC-311), e o total precisa bater em quatro canais — vitrine, checkout, mensagem do WhatsApp e comanda impressa. Timezone por loja e critico num SaaS multi-tenant porque 'agora' e relativo: uma loja em Fortaleza e outra em Rio Branco nao compartilham o mesmo dia, e calcular 'loja aberta' com o clock do servidor em UTC ou com o relogio do navegador do cliente (manipulavel) permitiria pedir com a loja fechada. Copiar o timezone para o pedido garante que agrupar faturamento por dia continue correto mesmo se a loja mudar de fuso. E a numeracao precisa ser por loja porque o dono le 'A-1042' em voz alta na cozinha — uma sequence global do Postgres daria numeros com buracos enormes e sem significado local.
