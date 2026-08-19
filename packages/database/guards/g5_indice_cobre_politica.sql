-- ===========================================================================
-- G5 — Índice de agregação que não inclui as colunas citadas pelas POLÍTICAS.
--
-- Descoberta medida, e nada intuitiva: sob isolamento por linha, o conjunto de
-- colunas de um índice cobridor é a UNIÃO das colunas da consulta com as
-- colunas das políticas daquela tabela. Um índice que cobre só a consulta não
-- permite leitura direta pelo índice, porque a reconferência do isolamento
-- precisa buscar no disco as colunas que as políticas citam. O agregado por
-- estado lia 5.000 blocos em 12,993 ms; com as colunas das políticas dentro do
-- índice virou leitura direta com zero buscas ao disco, 0,718 ms e 56 blocos —
-- 18 vezes em tempo e 90 vezes em blocos.
--
-- "Índice de agregação" aqui é o índice que DECLARA intenção de cobrir, isto é,
-- o que tem colunas incluídas (`INCLUDE`). Índice comum não promete leitura
-- direta e por isso não é cobrado.
--
-- As colunas citadas pelas políticas são descobertas casando o nome de cada
-- coluna da tabela, como palavra inteira, no texto da política. Palavra inteira
-- importa: `store_id` não pode casar dentro de `app.current_store_id()`.
--
-- DUAS PRECISÕES, ambas descobertas quando as políticas de fechamento do
-- cliente entraram (migrações 0009 e 0010) e a guarda acusou cinco problemas
-- dos quais três não existiam:
--
-- 1. SÓ O `USING` CONTA, e não o `WITH CHECK`. O `USING` filtra linhas que já
--    existem, e é ele que cavalga no índice. O `WITH CHECK` é avaliado sobre a
--    linha que está sendo escrita, que está na memória — nenhum índice é
--    consultado. Cobrar coluna de política de inserção engordaria cada entrada
--    de índice da tabela inteira para não economizar leitura nenhuma.
--
-- 2. REFERÊNCIA A OUTRA TABELA NÃO CONTA. Política com subconsulta escreve
--    `o.id = i.order_id`, e o casamento por palavra inteira acha `id` ali
--    dentro — só que aquele `id` é da tabela `orders`, não desta. Antes de
--    casar, toda referência qualificada por apelido some do texto; a
--    referência à própria tabela sobrevive porque ela vem escrita por extenso,
--    como `app.order_items.store_id`, e é protegida antes da limpeza.
--
-- Devolve linha quando há problema. Qualquer linha reprova.
-- ===========================================================================
WITH cobridores AS (
  SELECT x.indexrelid,
         x.indrelid,
         i.relname AS indice,
         c.relname AS tabela,
         (SELECT array_agg(a.attname)
            FROM unnest(x.indkey::smallint[]) AS k(attnum)
            JOIN pg_attribute a
              ON a.attrelid = x.indrelid AND a.attnum = k.attnum) AS colunas
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class c ON c.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'app'
     -- Tem coluna incluída: é a declaração de que o índice pretende cobrir.
     AND x.indnatts > x.indnkeyatts
),
colunas_de_politica AS (
  SELECT DISTINCT p.polrelid, p.polname, a.attname
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a
      ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
   WHERE n.nspname = 'app'
     AND p.polpermissive
     -- Só o filtro de linhas existentes: veja a precisão 1 no cabeçalho.
     AND p.polqual IS NOT NULL
     AND regexp_replace(
           -- A referência à PRÓPRIA tabela é protegida antes da limpeza, senão
           -- ela sumiria junto com as referências às outras.
           replace(pg_get_expr(p.polqual, p.polrelid),
                   'app.' || c.relname || '.', '@@'),
           -- Some toda referência qualificada por apelido: veja a precisão 2.
           '\m[a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*\M', ' ', 'g')
         ~ ('\m' || a.attname || '\M')
)
SELECT format('app.%s / %s', co.tabela, co.indice) AS objeto,
       format('índice cobridor sem a coluna %s, citada pela política %s — sem ela a reconferência do isolamento vai ao disco e a leitura direta pelo índice não acontece',
              cp.attname, cp.polname) AS problema
  FROM cobridores co
  JOIN colunas_de_politica cp ON cp.polrelid = co.indrelid
 WHERE NOT (cp.attname = ANY (coalesce(co.colunas, ARRAY[]::name[])))
 ORDER BY 1, 2;
