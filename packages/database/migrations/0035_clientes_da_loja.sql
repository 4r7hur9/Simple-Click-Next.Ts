-- ===========================================================================
-- 0035 · Clientes da loja (faixa B: T-700, T-702, T-703)
--
-- Três acréscimos em `app.store_customers`, todos compatíveis com a versão
-- anterior da aplicação (AC-030): coluna nova que aceita nulo ou é gerada,
-- função nova e índice novo. Nenhuma coluna muda de tipo, nome ou nulidade.
--
-- 1. A CHAVE DE TELEFONE (`phone_key`). O dono digita "(11) 98888-7777" na
--    busca e o banco guarda "5511988887777" — ou "11988887777", quando o
--    cadastro veio do fechamento da vitrine, que ainda não punha o código do
--    país. Comparar texto com texto falharia nos dois sentidos. A coluna gerada
--    reduz qualquer forma à MESMA chave (só dígitos, sem o 55 da frente), e a
--    busca por parte do telefone (AC-701) e o aviso de telefone repetido
--    (AC-704) comparam chave com chave. Gerada pelo banco, e não escrita pela
--    aplicação, para que uma linha inserida por outro caminho nasça com a
--    chave certa.
--
-- 2. A REMOÇÃO COM RETENÇÃO (`removed_at`). Remover um cliente tira a ficha
--    das listagens e NÃO apaga a linha: os pedidos dele apontam para ela, as
--    métricas contam com ela, e o direito de exclusão da LGPD é atendido por
--    anonimização dentro do prazo (ASM-703), não por `DELETE`. Pedido antigo
--    continua íntegro com os dados que tinha na compra (AC-705).
--
-- 3. O ENDEREÇO DA FICHA (`address`). O cliente cadastrado no balcão não tem
--    conta na plataforma, então não tem `customer_addresses` (que é por
--    identidade). O endereço que o dono anota na ficha mora aqui, e é o que o
--    pedido manual copia para o contato quando é entrega (AC-703, AC-707).
-- ===========================================================================

SET ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- A chave de telefone
-- ---------------------------------------------------------------------------
-- IMUTÁVEL por construção: só `regexp_replace`, `length`, `left` e `substr`,
-- que são funções puras do catálogo. É o que permite usá-la numa coluna gerada
-- e num índice.
--
-- Doze ou treze dígitos começando por 55 é o Brasil na frente (DDD de dois
-- dígitos mais oito ou nove do assinante); qualquer outra forma fica como está.
CREATE OR REPLACE FUNCTION app.chave_de_telefone(entrada text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT nullif(
           CASE
             WHEN length(digitos) IN (12, 13) AND left(digitos, 2) = '55'
               THEN substr(digitos, 3)
             ELSE digitos
           END,
           ''
         )
    FROM (SELECT regexp_replace(coalesce(entrada, ''), '[^0-9]', '', 'g') AS digitos) AS d
$$;

ALTER TABLE app.store_customers
  ADD COLUMN IF NOT EXISTS phone_key text
    GENERATED ALWAYS AS (app.chave_de_telefone(phone_e164)) STORED,
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS address jsonb;

COMMENT ON COLUMN app.store_customers.phone_key IS
  'Telefone reduzido a dígitos, sem o código do país: é por ela que a busca e o aviso de repetido comparam (AC-701, AC-704).';
COMMENT ON COLUMN app.store_customers.removed_at IS
  'Quando o dono tirou a ficha das listagens. A linha fica, porque os pedidos e as métricas apontam para ela (AC-705, ASM-703).';
COMMENT ON COLUMN app.store_customers.address IS
  'Endereço anotado na ficha pelo dono, para o cliente sem conta na plataforma (AC-703).';

-- A busca por telefone (AC-701) e o aviso de repetido (AC-704) andam por aqui.
-- Parcial: cliente sem telefone não entra, e o índice fica do tamanho do que
-- a busca de fato percorre.
CREATE INDEX IF NOT EXISTS store_customers_chave_de_telefone_ix
  ON app.store_customers (store_id, phone_key)
  WHERE phone_key IS NOT NULL;

-- A busca por parte do nome, sem acento e sem maiúscula (AC-701). Trigrama
-- porque "parte do nome" é `LIKE '%ana%'`, que um índice comum não atende.
-- `app.sem_acento` é a mesma função da busca da vitrine (0021): uma regra só
-- para "ignorar acento" no produto inteiro.
CREATE INDEX IF NOT EXISTS store_customers_busca_por_nome_ix
  ON app.store_customers
  USING gin (app.sem_acento(lower(coalesce(display_name, ''))) gin_trgm_ops);

-- A listagem ordena por último pedido, que é lido de `orders` por cliente. O
-- índice `orders_do_cliente_idx` (0008) já cobre `(store_id, store_customer_id,
-- placed_at DESC)` incluindo `status` e `total_cents`: nada a acrescentar.

RESET ROLE;
