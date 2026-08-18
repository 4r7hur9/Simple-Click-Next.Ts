-- ===========================================================================
-- G1 — Tabela com identificador de loja sem o isolamento ligado E forçado.
--
-- As duas metades são obrigatórias juntas, e nenhuma protege sozinha:
-- `ENABLE` sem `FORCE` deixa o dono da tabela passar por cima da política, e
-- `FORCE` sem `ENABLE` não liga política nenhuma. Esta guarda pegou omissão
-- real durante a validação do modelo — `store_metrics_daily` e `audit_log`
-- haviam ficado sem isolamento —, então o valor dela não é teórico.
--
-- "Tabela de loja" é a que tem coluna `store_id` e também `stores`, cuja coluna
-- de inquilino é a própria chave primária: uma verificação que procurasse só
-- pelo nome da coluna deixaria de fora justamente a raiz de tudo.
--
-- Devolve linha quando há problema. Qualquer linha reprova.
-- ===========================================================================
SELECT format('app.%s', c.relname) AS objeto,
       format(
         'isolamento por linha ativado=%s, forçado=%s — as duas metades são obrigatórias juntas',
         CASE WHEN c.relrowsecurity      THEN 'sim' ELSE 'não' END,
         CASE WHEN c.relforcerowsecurity THEN 'sim' ELSE 'não' END
       ) AS problema
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'app'
   AND c.relkind = 'r'
   AND ( c.relname = 'stores'
      OR EXISTS (SELECT 1
                   FROM pg_attribute a
                  WHERE a.attrelid = c.oid
                    AND a.attname = 'store_id'
                    AND a.attnum > 0
                    AND NOT a.attisdropped) )
   AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
 ORDER BY 1;
