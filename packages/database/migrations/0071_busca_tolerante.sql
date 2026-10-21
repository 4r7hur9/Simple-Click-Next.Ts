-- ===========================================================================
-- 0071 — Busca tolerante da vitrine (card #75).
--
-- O QUE MUDA. A busca da vitrine casava só palavra inteira de nome e
-- descrição (tsvector), parava em 200 acertos e não achava o que o cliente
-- digita numa loja de autopeças: "pastilha" quando o fornecedor escreve
-- "PAST", a referência do fabricante (SNA500), os similares, a marca, o SKU.
--
-- O TEXTO BUSCÁVEL fica pronto numa coluna, `products.search_text`: nome,
-- descrição, os valores de `attributes` (marca, referência, similares, código
-- do fornecedor), as especificações (`product_attributes`) e o SKU, o código de
-- barras e o nome das variações. Tudo em minúsculas, sem acento, com a
-- pontuação trocada por espaço e um espaço em cada ponta — assim " past"
-- casa com o COMEÇO de qualquer palavra e " ret " só com a palavra inteira.
-- Código com número entra também colado ("RCPT-12550" → "rcpt12550").
--
-- QUEM MANTÉM A COLUNA são gatilhos: o do produto recalcula quando nome,
-- descrição ou atributos mudam; os de especificação e de variação recalculam
-- o produto tocado (em lote por comando, para a importação de milhares de
-- linhas não virar milhares de idas). A mudança de estoque da variação NÃO
-- recalcula nada: o gatilho só olha SKU, código de barras, nome e exclusão.
--
-- O ÍNDICE trigram só é usado fora da política de linha: com ela ligada, o
-- PostgreSQL não usa índice para `~` (o operador não é "leakproof"). Por isso a
-- busca é a função `app.buscar_produtos_da_vitrine`, com direitos de quem a
-- definiu, presa à loja do contexto e a produto publicado. Ela devolve SÓ
-- identificadores: quem monta o cartão é o catálogo, sob a política de linha,
-- e um identificador que escape daqui não vira produto visível.
--
-- Idempotente. Aplicada à mão em dev (o livro de dev está fora de ordem desde a
-- 0065), como a 0067 e a 0068.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

-- O texto normalizado: minúsculas, sem acento, só letras e números separados
-- por um espaço, com espaço nas pontas. A MESMA regra de
-- `normalizarTexto` em apps/api/src/modules/storefront/busca.usecase.ts.
CREATE OR REPLACE FUNCTION app.normalizar_busca(entrada text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, app
AS $$
  SELECT ' ' || btrim(regexp_replace(
                  lower(app.sem_acento(coalesce(entrada, ''))),
                  '[^a-z0-9]+', ' ', 'g')) || ' '
$$;

-- Os códigos de um texto, colados: cada pedaço com número, sem a pontuação.
CREATE OR REPLACE FUNCTION app.codigos_colados(entrada text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, app
AS $$
  SELECT coalesce(string_agg(colado, ' '), '')
    FROM (
      SELECT regexp_replace(lower(app.sem_acento(pedaco)), '[^a-z0-9]+', '', 'g') AS colado
        FROM regexp_split_to_table(coalesce(entrada, ''), '[\s,;]+') AS pedaco
       WHERE pedaco ~ '[0-9]' AND pedaco ~ '[^A-Za-z0-9]'
    ) x
   WHERE colado <> ''
$$;

CREATE OR REPLACE FUNCTION app.texto_buscavel_do_produto(
  p_id uuid, p_nome text, p_descricao text, p_atributos jsonb)
RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog, app
AS $$
  WITH partes AS (
    SELECT coalesce((
             SELECT string_agg(v #>> '{}', ' ')
               FROM jsonb_path_query(coalesce(p_atributos, '{}'::jsonb), 'strict $.**') AS v
              WHERE jsonb_typeof(v) IN ('string', 'number')), '') AS atributos,
           coalesce((
             SELECT string_agg(coalesce(pa.value_text, pa.value_num::text), ' ')
               FROM app.product_attributes pa
              WHERE pa.product_id = p_id), '') AS especificacoes,
           coalesce((
             SELECT string_agg(concat_ws(' ', pv.sku, pv.barcode,
                                CASE WHEN NOT pv.is_default THEN pv.name END), ' ')
               FROM app.product_variants pv
              WHERE pv.product_id = p_id AND pv.deleted_at IS NULL), '') AS variacoes
  )
  SELECT app.normalizar_busca(concat_ws(' ', p_nome, p_descricao, atributos,
                                        especificacoes, variacoes))
         || app.codigos_colados(concat_ws(' ', atributos, especificacoes, variacoes))
         || ' '
    FROM partes
$$;

ALTER TABLE app.products ADD COLUMN IF NOT EXISTS search_text text;

-- Gatilho do produto: recalcula quando o que entra no texto muda.
CREATE OR REPLACE FUNCTION app.produto_recalcula_busca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  NEW.search_text := app.texto_buscavel_do_produto(
    NEW.id, NEW.name, NEW.description, NEW.attributes);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS products_texto_de_busca ON app.products;
CREATE TRIGGER products_texto_de_busca
  BEFORE INSERT OR UPDATE OF name, description, attributes ON app.products
  FOR EACH ROW EXECUTE FUNCTION app.produto_recalcula_busca();

-- Quando a ÚNICA mudança do produto é o texto buscável (veio de uma
-- especificação ou variação), `updated_at` fica como estava: o produto em si
-- não mudou. Roda depois de `products_touch` (os gatilhos disparam em ordem
-- alfabética de nome).
CREATE OR REPLACE FUNCTION app.produto_mantem_atualizado_em_na_busca()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $$
BEGIN
  IF (to_jsonb(OLD) - 'search_text' - 'search_tsv' - 'updated_at')
     = (to_jsonb(NEW) - 'search_text' - 'search_tsv' - 'updated_at') THEN
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS products_touch_ignora_busca ON app.products;
CREATE TRIGGER products_touch_ignora_busca
  BEFORE UPDATE OF search_text ON app.products
  FOR EACH ROW
  WHEN (OLD.search_text IS DISTINCT FROM NEW.search_text)
  EXECUTE FUNCTION app.produto_mantem_atualizado_em_na_busca();

-- Recalcula os produtos de uma lista (gatilhos de especificação e variação).
-- Só grava quando o texto mudou: sem isso, cada comando tocaria a versão do
-- catálogo e o `updated_at` à toa.
CREATE OR REPLACE FUNCTION app.recalcular_busca_dos_produtos(p_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  UPDATE app.products p
     SET search_text = novo.texto
    FROM (
      SELECT q.id, app.texto_buscavel_do_produto(q.id, q.name, q.description, q.attributes) AS texto
        FROM app.products q
       WHERE q.id = ANY(p_ids)
    ) novo
   WHERE p.id = novo.id
     AND p.search_text IS DISTINCT FROM novo.texto
$$;

CREATE OR REPLACE FUNCTION app.filho_recalcula_busca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  IF TG_LEVEL = 'ROW' THEN
    PERFORM app.recalcular_busca_dos_produtos(ARRAY[NEW.product_id]);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM app.recalcular_busca_dos_produtos(
      ARRAY(SELECT DISTINCT product_id FROM linhas_velhas));
  ELSE
    PERFORM app.recalcular_busca_dos_produtos(
      ARRAY(SELECT DISTINCT product_id FROM linhas_novas));
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS product_attributes_busca_ins ON app.product_attributes;
CREATE TRIGGER product_attributes_busca_ins
  AFTER INSERT ON app.product_attributes
  REFERENCING NEW TABLE AS linhas_novas
  FOR EACH STATEMENT EXECUTE FUNCTION app.filho_recalcula_busca();
DROP TRIGGER IF EXISTS product_attributes_busca_del ON app.product_attributes;
CREATE TRIGGER product_attributes_busca_del
  AFTER DELETE ON app.product_attributes
  REFERENCING OLD TABLE AS linhas_velhas
  FOR EACH STATEMENT EXECUTE FUNCTION app.filho_recalcula_busca();
DROP TRIGGER IF EXISTS product_attributes_busca_upd ON app.product_attributes;
CREATE TRIGGER product_attributes_busca_upd
  AFTER UPDATE OF value_text, value_num ON app.product_attributes
  FOR EACH ROW
  WHEN (OLD.value_text IS DISTINCT FROM NEW.value_text
        OR OLD.value_num IS DISTINCT FROM NEW.value_num)
  EXECUTE FUNCTION app.filho_recalcula_busca();

DROP TRIGGER IF EXISTS product_variants_busca_ins ON app.product_variants;
CREATE TRIGGER product_variants_busca_ins
  AFTER INSERT ON app.product_variants
  REFERENCING NEW TABLE AS linhas_novas
  FOR EACH STATEMENT EXECUTE FUNCTION app.filho_recalcula_busca();
DROP TRIGGER IF EXISTS product_variants_busca_del ON app.product_variants;
CREATE TRIGGER product_variants_busca_del
  AFTER DELETE ON app.product_variants
  REFERENCING OLD TABLE AS linhas_velhas
  FOR EACH STATEMENT EXECUTE FUNCTION app.filho_recalcula_busca();
DROP TRIGGER IF EXISTS product_variants_busca_upd ON app.product_variants;
CREATE TRIGGER product_variants_busca_upd
  AFTER UPDATE OF sku, barcode, name, is_default, deleted_at ON app.product_variants
  FOR EACH ROW
  WHEN (OLD.sku IS DISTINCT FROM NEW.sku
        OR OLD.barcode IS DISTINCT FROM NEW.barcode
        OR OLD.name IS DISTINCT FROM NEW.name
        OR OLD.is_default IS DISTINCT FROM NEW.is_default
        OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION app.filho_recalcula_busca();

-- Preenche o que já existe. Sem passar pelo gatilho do produto (não toca
-- `updated_at` nem a versão do catálogo das lojas).
ALTER TABLE app.products DISABLE TRIGGER USER;
UPDATE app.products p
   SET search_text = app.texto_buscavel_do_produto(p.id, p.name, p.description, p.attributes)
 WHERE p.search_text IS NULL;
ALTER TABLE app.products ENABLE TRIGGER USER;

CREATE INDEX IF NOT EXISTS products_texto_de_busca_trgm_ix
  ON app.products USING gin (search_text public.gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- A busca da vitrine. `p_padroes[i]` é a expressão regular do termo i (o
-- produto precisa casar com TODAS); `p_exatos[i]`, a do termo como palavra
-- inteira, que só pesa na ordem. A ordem: mais termos no nome, nome que começa
-- pelo termo, palavra inteira, e então a ordem do dono.
CREATE OR REPLACE FUNCTION app.buscar_produtos_da_vitrine(
  p_padroes text[], p_exatos text[])
RETURNS TABLE (product_id uuid)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_filtro text;
  v_peso text;
BEGIN
  IF app.current_store_id() IS NULL
     OR coalesce(cardinality(p_padroes), 0) = 0
     OR cardinality(p_padroes) > 12
     OR cardinality(p_exatos) IS DISTINCT FROM cardinality(p_padroes) THEN
    RETURN;
  END IF;

  SELECT string_agg(format('p.search_text ~ $1[%s]', i), ' AND '),
         string_agg(format(
           '(CASE WHEN n.nome ~ $1[%1$s] THEN 10 ELSE 0 END'
           ' + CASE WHEN n.nome ~ (''^'' || $1[%1$s]) THEN 6 ELSE 0 END'
           ' + CASE WHEN p.search_text ~ $2[%1$s] THEN 3 ELSE 0 END'
           ' + CASE WHEN n.nome ~ $2[%1$s] THEN 3 ELSE 0 END)', i), ' + ')
    INTO v_filtro, v_peso
    FROM generate_subscripts(p_padroes, 1) AS i;

  RETURN QUERY EXECUTE format(
    'SELECT p.id
       FROM app.products p
       CROSS JOIN LATERAL (SELECT app.normalizar_busca(p.name) AS nome) n
      WHERE p.store_id = app.current_store_id()
        AND p.status = ''PUBLISHED''
        AND p.deleted_at IS NULL
        AND %s
      ORDER BY (%s) DESC, p.sort_order, p.name, p.id', v_filtro, v_peso)
    USING p_padroes, p_exatos;
END $$;

REVOKE ALL ON FUNCTION app.normalizar_busca(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.codigos_colados(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.texto_buscavel_do_produto(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.recalcular_busca_dos_produtos(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.buscar_produtos_da_vitrine(text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.normalizar_busca(text) TO sc_app, sc_admin;
GRANT EXECUTE ON FUNCTION app.codigos_colados(text) TO sc_app, sc_admin;
GRANT EXECUTE ON FUNCTION app.texto_buscavel_do_produto(uuid, text, text, jsonb) TO sc_app, sc_admin;
GRANT EXECUTE ON FUNCTION app.buscar_produtos_da_vitrine(text[], text[]) TO sc_app, sc_admin;

RESET ROLE;
