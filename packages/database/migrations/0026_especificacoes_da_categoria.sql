-- 0026 — especificações da categoria: o pedido as congela, e o filtro da
-- vitrine tem índice próprio.
--
-- Duas partes, as duas da mesma feature (catalogo-produtos):
--   1. o item do pedido congela as especificações do produto (T-301, AC-330);
--   2. a especificação filtrável ganha índice próprio (T-312, AC-328).
--
-- ── 1. O item do pedido congela as especificações ──────────────────────────
--
-- O QUE FALTAVA. O dono cria especificações dentro da categoria (Aro, Largura)
-- e pode renomeá-las ou removê-las depois. O pedido é cópia congelada do
-- momento da compra (P-010), mas `order_items.attributes_snapshot` nascia vazio:
-- o pedido de segunda não tinha como mostrar "Aro 15" se o dono renomeasse a
-- especificação para "Diâmetro do aro" na terça — ele leria o nome NOVO no
-- catálogo, que é exatamente o que o critério AC-330 proíbe.
--
-- POR QUE NO BANCO, E NÃO NO CASO DE USO DO PEDIDO. Todo caminho que grava item
-- de pedido passa por esta tabela; um gatilho não depende de cada caminho
-- lembrar de copiar as especificações. O caso de uso continua podendo mandar a
-- cópia pronta: o gatilho só preenche quando ela chega VAZIA, e nunca
-- sobrescreve o que veio.
--
-- O FORMATO GRAVADO:
--   { "especificacoes": [
--       { "especificacaoId": uuid, "chave": texto, "nome": texto da época,
--         "unidade": texto ou nulo, "valor": texto | número | booleano } ] }
-- Na ordem que o dono definiu na categoria. Entram só as especificações da
-- categoria principal do produto e ainda não removidas — as que o cliente viu.
--
-- POR QUE `SECURITY DEFINER`. Quem grava o item é o cliente público no
-- fechamento, e a leitura dele sobre especificação e valor depende de política
-- que pode mudar. A função roda como o migrador e filtra pela loja da PRÓPRIA
-- linha que está sendo gravada — a linha que a política de inserção já aceitou
-- —, então não enxerga nada de outra loja.
--
-- COMPATÍVEL COM A VERSÃO ANTERIOR: nenhuma coluna nova, nenhuma tabela nova;
-- item gravado antes desta migração continua como estava.
SET ROLE sc_migrator;

CREATE OR REPLACE FUNCTION app.congelar_especificacoes_do_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_especificacoes jsonb;
BEGIN
  IF NEW.product_id IS NULL
     OR (NEW.attributes_snapshot IS NOT NULL
         AND NEW.attributes_snapshot <> '{}'::jsonb)
  THEN
    RETURN NEW;
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object(
             'especificacaoId', ad.id,
             'chave', ad.key,
             'nome', ad.label,
             'unidade', ad.unit,
             'valor', CASE
                        WHEN pa.value_text IS NOT NULL THEN to_jsonb(pa.value_text)
                        WHEN pa.value_num  IS NOT NULL THEN to_jsonb(pa.value_num)
                        WHEN pa.value_bool IS NOT NULL THEN to_jsonb(pa.value_bool)
                        ELSE to_jsonb(pa.value_date)
                      END)
           ORDER BY ad.sort_order, ad.label)
    INTO v_especificacoes
    FROM app.product_attributes pa
    JOIN app.attribute_definitions ad
      ON ad.id = pa.definition_id
     AND ad.store_id = pa.store_id
    JOIN app.product_categories pc
      ON pc.product_id = pa.product_id
     AND pc.store_id = pa.store_id
     AND pc.category_id = ad.category_id
     AND pc.is_primary
   WHERE pa.store_id = NEW.store_id
     AND pa.product_id = NEW.product_id
     AND ad.deprecated_at IS NULL;

  IF v_especificacoes IS NOT NULL THEN
    NEW.attributes_snapshot := jsonb_build_object('especificacoes', v_especificacoes);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_congela_especificacoes ON app.order_items;
CREATE TRIGGER order_items_congela_especificacoes
  BEFORE INSERT ON app.order_items
  FOR EACH ROW EXECUTE FUNCTION app.congelar_especificacoes_do_item();

-- ── 2. A especificação filtrável ganha índice próprio ──────────────────────
--
-- A vitrine pergunta "quais especificações desta categoria viram filtro?" a
-- cada abertura de categoria. Parcial, e não sobre a tabela inteira: só a
-- filtrável e ainda não removida interessa, e é uma fração pequena do total.
-- O índice começa por `store_id` e o inclui na chave: é a coluna que a
-- política cita, e sem ela a reconferência do isolamento iria ao disco (G5).
CREATE INDEX IF NOT EXISTS attribute_definitions_filtraveis_idx
  ON app.attribute_definitions (store_id, category_id, sort_order)
  INCLUDE (key, label)
  WHERE is_filterable AND deprecated_at IS NULL;

-- Escolher "Aro 15" procura, entre os valores daquela especificação, os que
-- são iguais ao escolhido. Texto é o caso comum (lista e texto livre gravam
-- em `value_text`).
CREATE INDEX IF NOT EXISTS product_attributes_valor_idx
  ON app.product_attributes (store_id, definition_id, value_text)
  INCLUDE (product_id);

RESET ROLE;
