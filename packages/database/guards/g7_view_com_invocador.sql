-- ===========================================================================
-- G7 — Visão sobre tabela de loja sem executar com os direitos de quem
-- consulta.
--
-- Visão comum roda com os direitos de quem a DEFINIU. Como tudo no esquema
-- pertence à credencial de migração — a única que contorna o isolamento —, uma
-- visão sobre tabela de loja sem `security_invoker = true` entrega todas as
-- lojas a qualquer conexão que tenha permissão de lê-la. Foi verificado no
-- modelo: com a opção ligada, o dono da loja A passou a ver 1 loja em vez de 2.
--
-- É o mesmo defeito da visão materializada (G6), com a diferença de que aqui
-- existe conserto: basta a opção. Por isso são duas guardas, e não uma.
--
-- Devolve linha quando há problema. Qualquer linha reprova.
-- ===========================================================================
SELECT DISTINCT
       format('app.%s', v.relname) AS objeto,
       format('visão sobre app.%s sem security_invoker = true — ela roda com os direitos de quem a definiu, que contorna o isolamento, e devolve todas as lojas',
              t.relname) AS problema
  FROM pg_class v
  JOIN pg_namespace n ON n.oid = v.relnamespace
  JOIN pg_rewrite rw ON rw.ev_class = v.oid
  JOIN pg_depend d
    ON d.classid = 'pg_rewrite'::regclass
   AND d.objid = rw.oid
   AND d.refclassid = 'pg_class'::regclass
  JOIN pg_class t ON t.oid = d.refobjid
 WHERE n.nspname = 'app'
   AND v.relkind = 'v'
   AND t.oid <> v.oid
   AND t.relkind IN ('r', 'p', 'v', 'm')
   AND ( t.relname = 'stores'
      OR EXISTS (SELECT 1
                   FROM pg_attribute a
                  WHERE a.attrelid = t.oid
                    AND a.attname = 'store_id'
                    AND a.attnum > 0
                    AND NOT a.attisdropped) )
   AND coalesce((SELECT o.option_value
                   FROM pg_options_to_table(v.reloptions) AS o
                  WHERE o.option_name = 'security_invoker'), 'off') <> 'true'
 ORDER BY 1;
