-- ===========================================================================
-- G6 — Visão materializada sobre tabela de loja.
--
-- A visão materializada é o caminho intuitivo do painel e o mais perigoso: ela
-- NÃO suporta isolamento por linha de forma alguma, e não aceita nem a opção
-- de executar com os direitos de quem consulta. Na validação do modelo ela
-- mostrou as métricas de TODAS as lojas para a credencial da aplicação — não
-- por erro de política, mas porque política nenhuma se aplica a ela.
--
-- O caminho correto já está decidido: tabela de acumulado por loja, com
-- isolamento normal, escrita por trabalhador fora do caminho da requisição.
--
-- A guarda olha as tabelas de que a visão materializada depende: uma que
-- agregue só catálogo de plataforma não é o problema; a que toca dado de loja
-- é.
--
-- Devolve linha quando há problema. Qualquer linha reprova.
-- ===========================================================================
SELECT DISTINCT
       format('app.%s', m.relname) AS objeto,
       format('visão materializada sobre app.%s, que é tabela de loja — visão materializada não suporta isolamento por linha nem direitos de quem consulta, e mostra todas as lojas',
              t.relname) AS problema
  FROM pg_class m
  JOIN pg_namespace n ON n.oid = m.relnamespace
  JOIN pg_rewrite rw ON rw.ev_class = m.oid
  JOIN pg_depend d
    ON d.classid = 'pg_rewrite'::regclass
   AND d.objid = rw.oid
   AND d.refclassid = 'pg_class'::regclass
  JOIN pg_class t ON t.oid = d.refobjid
 WHERE n.nspname = 'app'
   AND m.relkind = 'm'
   AND t.oid <> m.oid
   AND t.relkind IN ('r', 'p', 'v', 'm')
   AND ( t.relname = 'stores'
      OR EXISTS (SELECT 1
                   FROM pg_attribute a
                  WHERE a.attrelid = t.oid
                    AND a.attname = 'store_id'
                    AND a.attnum > 0
                    AND NOT a.attisdropped) )
 ORDER BY 1;
