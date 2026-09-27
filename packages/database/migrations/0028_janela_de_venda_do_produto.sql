-- ===========================================================================
-- 0028 · Janela de venda do produto (T-311, AC-322)
--
-- O DONO VENDE ALGUNS ITENS SÓ EM CERTOS DIAS E HORÁRIOS — a feijoada do
-- sábado, o brunch de domingo — e não quer lembrar de marcar e desmarcar
-- "esgotado" toda semana. O produto passa a guardar a própria grade semanal,
-- e a vitrine decide sozinha, no fuso da loja, se ele está comprável agora.
--
-- SÓ ACRESCENTA. Uma coluna nova com padrão vazio: a versão anterior da
-- aplicação continua lendo e gravando produtos sem saber que ela existe, e
-- produto sem janela continua vendendo o dia inteiro (AC-030). O isolamento
-- por linha é o da tabela, já ligado e forçado desde a 0004 — coluna não
-- muda política.
--
-- A FORMA É CONFERIDA NO BANCO, e não só na borda: a coluna é JSON, e JSON
-- aceita qualquer coisa. Uma janela com dia 9 ou com "25:00" gravada por uma
-- rota futura não quebraria nada hoje — ela só nunca abriria, e o dono não
-- entenderia por que a feijoada não aparece. A verificação recusa a gravação
-- na hora, que é quando ainda dá para corrigir.
--
-- O FUSO NÃO ENTRA AQUI. As horas são as do relógio da loja, e o fuso é o da
-- própria loja (`stores.timezone`): guardar o fuso de novo no produto abriria
-- espaço para os dois divergirem quando o dono mudasse a loja de cidade.
-- ===========================================================================

SET ROLE sc_migrator;

-- Cada janela é um objeto {"diaDaSemana": 0..6, "abre": "HH:MM",
-- "fecha": "HH:MM"} — 0 é domingo, como no JavaScript que a avalia — e a
-- hora de fechar vem depois da de abrir. Lista vazia é "sem restrição".
CREATE FUNCTION app.janelas_de_venda_validas(janelas jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN janelas IS NULL OR jsonb_typeof(janelas) <> 'array' THEN false
    ELSE NOT EXISTS (
      SELECT 1
        FROM jsonb_array_elements(janelas) AS janela
       -- Campo ausente produz NULL: só o resultado TRUE prova a forma.
       -- Comparar apenas com <> deixa o objeto incompleto passar pelo WHERE.
       WHERE (
             jsonb_typeof(janela) = 'object'
         AND jsonb_typeof(janela -> 'diaDaSemana') = 'number'
         AND (janela ->> 'diaDaSemana') ~ '^[0-6]$'
         AND jsonb_typeof(janela -> 'abre') = 'string'
         AND (janela ->> 'abre') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         AND jsonb_typeof(janela -> 'fecha') = 'string'
         AND (janela ->> 'fecha') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         AND (janela ->> 'abre') < (janela ->> 'fecha')
       ) IS NOT TRUE
    )
  END
$$;

-- A verificação roda com os direitos de quem grava; a aplicação grava.
GRANT EXECUTE ON FUNCTION app.janelas_de_venda_validas(jsonb) TO sc_app, sc_admin;

ALTER TABLE app.products
  ADD COLUMN sale_windows jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE app.products
  ADD CONSTRAINT products_sale_windows_validas
  CHECK (app.janelas_de_venda_validas(sale_windows));

COMMENT ON COLUMN app.products.sale_windows IS
  'Janelas semanais em que o produto é vendido, no fuso da loja. Vazio = sem restrição (AC-322).';

RESET ROLE;
