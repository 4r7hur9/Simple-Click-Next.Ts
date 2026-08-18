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
-- coluna da tabela, como palavra inteira, no texto do conjunto da política.
-- Palavra inteira importa: `store_id` não pode casar dentro de
-- `app.current_store_id()`.
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
     AND (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' '
       || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''))
         ~ ('\m' || a.attname || '\M')
)
SELECT format('app.%s / %s', co.tabela, co.indice) AS objeto,
       format('índice cobridor sem a coluna %s, citada pela política %s — sem ela a reconferência do isolamento vai ao disco e a leitura direta pelo índice não acontece',
              cp.attname, cp.polname) AS problema
  FROM cobridores co
  JOIN colunas_de_politica cp ON cp.polrelid = co.indrelid
 WHERE NOT (cp.attname = ANY (coalesce(co.colunas, ARRAY[]::name[])))
 ORDER BY 1, 2;
