-- ===========================================================================
-- G3 — Chave única GLOBAL onde deveria ser única por loja.
--
-- Unicidade global em tabela de loja é canal encoberto: o erro de chave
-- duplicada revela a existência de uma linha invisível de outra loja. Quem
-- cadastra um produto com o apelido `pizza` e recebe "já existe" acaba de
-- descobrir que a loja do vizinho tem uma pizza — sem nunca ter conseguido
-- lê-la. E ainda quebra a inserção com conflito: o `ON CONFLICT` sobre linha de
-- outra loja levanta violação de isolamento em vez de atualizar.
--
-- Toda chave única de tabela de loja começa por `store_id`. As exceções são
-- fechadas, revisadas e justificadas uma a uma — a lista é curta de propósito,
-- porque cada linha nova aqui é uma decisão consciente, não um afrouxamento.
--
-- Devolve linha quando há problema. Qualquer linha reprova.
-- ===========================================================================
WITH excecoes(indice, razao) AS (
  VALUES
    ('stores_slug_uk',
     'apelido da loja é chave de roteamento público, resolvida antes de haver contexto'),
    ('stores_code_uk',
     'código da loja é a chave de busca da administração'),
    ('orders_public_token_uk',
     'token de alta entropia do acompanhamento sem login: a busca global É o objetivo'),
    ('print_agents_token_uk',
     'sha256 da credencial aleatória que o servidor sorteia para o agente de impressão: é a credencial que diz a loja, então a busca é global, e ninguém escolhe o valor para sondar outra loja'),
    ('identities_email_uk',
     'única chave única global de dado pessoal, enumerável por desenho e mitigada na aplicação')
)
SELECT format('app.%s', i.relname) AS objeto,
       format('chave única global em tabela de loja (app.%s): %s — o erro de chave duplicada revela linha invisível de outra loja',
              c.relname, pg_get_indexdef(x.indexrelid)) AS problema
  FROM pg_index x
  JOIN pg_class i ON i.oid = x.indexrelid
  JOIN pg_class c ON c.oid = x.indrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'app'
   AND x.indisunique
   AND NOT x.indisprimary
   AND EXISTS (SELECT 1
                 FROM pg_attribute a
                WHERE a.attrelid = c.oid
                  AND a.attname = 'store_id'
                  AND a.attnum > 0
                  AND NOT a.attisdropped)
   AND i.relname NOT IN (SELECT indice FROM excecoes)
   -- Índice por expressão tem `indkey[0] = 0` e nenhum nome de coluna: também
   -- não lidera por loja, e por isso cai aqui.
   AND (SELECT a.attname
          FROM pg_attribute a
         WHERE a.attrelid = c.oid
           AND a.attnum = x.indkey[0]) IS DISTINCT FROM 'store_id'
 ORDER BY 1;
