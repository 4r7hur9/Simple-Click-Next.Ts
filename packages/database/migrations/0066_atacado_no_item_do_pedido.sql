-- ===========================================================================
-- 0066 — A faixa de atacado que valeu, congelada no item do pedido (card #57).
--
-- O pedido é o registro do que foi combinado (P-010): o dono muda a faixa na
-- terça e o pedido de segunda continua dizendo "a partir de 10 peças, 5% de
-- desconto". O que já existia cobre metade:
--
--   unit_price_cents     o preço por unidade COBRADO (o da faixa)
--   compare_at_cents     o preço de varejo da época, o "de" riscado
--   price_kind_snapshot  BASE | PROMO | WHOLESALE
--
-- Faltava a faixa em si. Quatro colunas novas, todas nulas no varejo:
--
--   wholesale_min_quantity    a partir de quantas unidades a faixa valia
--   wholesale_discount_kind   'PERCENT' | 'AMOUNT' (nulo = atacado antigo de
--                             preço fixo, que não tinha desconto)
--   wholesale_discount_value  o percentual inteiro ou os centavos por unidade
--   wholesale_label           o nome que o dono deu à faixa
--
-- Compatível: item gravado antes fica com as quatro nulas, que é o que ele era.
-- Idempotente.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

ALTER TABLE app.order_items
  ADD COLUMN IF NOT EXISTS wholesale_min_quantity   integer,
  ADD COLUMN IF NOT EXISTS wholesale_discount_kind  text,
  ADD COLUMN IF NOT EXISTS wholesale_discount_value bigint,
  ADD COLUMN IF NOT EXISTS wholesale_label          text;

COMMENT ON COLUMN app.order_items.wholesale_min_quantity IS
  'Faixa de atacado que valeu na compra: a partir de quantas unidades. Nulo = varejo.';
COMMENT ON COLUMN app.order_items.wholesale_discount_kind IS
  'PERCENT ou AMOUNT, copiado da faixa. Nulo com quantidade = atacado de preço fixo.';
COMMENT ON COLUMN app.order_items.wholesale_discount_value IS
  'Desconto da faixa na compra: percentual inteiro ou centavos por unidade.';
COMMENT ON COLUMN app.order_items.wholesale_label IS
  'O nome que o dono deu à faixa, como era na compra.';

ALTER TABLE app.order_items
  DROP CONSTRAINT IF EXISTS order_items_atacado_coerente;

-- Faixa só no item de atacado; tipo e valor andam juntos. Cada ramo testa
-- IS NOT NULL de propósito: CHECK que dá NULL passa, e `kind IN (...)` com
-- kind nulo dá NULL.
ALTER TABLE app.order_items
  ADD CONSTRAINT order_items_atacado_coerente
    CHECK (
      (wholesale_min_quantity IS NULL
        AND wholesale_discount_kind IS NULL
        AND wholesale_discount_value IS NULL)
      OR (wholesale_min_quantity IS NOT NULL
        AND wholesale_min_quantity >= 2
        AND wholesale_discount_kind IS NULL
        AND wholesale_discount_value IS NULL)
      OR (wholesale_min_quantity IS NOT NULL
        AND wholesale_min_quantity >= 2
        AND wholesale_discount_kind IS NOT NULL
        AND wholesale_discount_kind IN ('PERCENT', 'AMOUNT')
        AND wholesale_discount_value IS NOT NULL
        AND wholesale_discount_value > 0)
    );
