-- ===========================================================================
-- G10 — Função com direitos de quem a definiu sem dono migrador ou sem caminho
-- de busca fixo.
--
-- Função `SECURITY DEFINER` é um furo DELIBERADO no isolamento: ela roda com os
-- direitos de quem a definiu, e quem define tudo no esquema `app` é o migrador,
-- a única credencial que atravessa lojas. É assim que `resolve_store` acha a
-- loja antes de existir contexto e que `is_store_staff` lê o vínculo sem
-- recursar na política de `store_members`. Furo deliberado precisa de duas
-- coisas, e esta guarda cobra as duas:
--
-- - caminho de busca fixo (`SET search_path`). Sem ele, quem consegue criar um
--   objeto temporário na sessão planta um `app.store_members` de mentira à
--   frente do verdadeiro, e a função — rodando com BYPASSRLS — lê o que o
--   atacante escreveu;
-- - dono `sc_migrator`. Função definer criada por outro papel roda com os
--   direitos DESSE papel: se for o superusuário de quem aplicou uma migração
--   sem `SET LOCAL ROLE`, o furo é maior do que o desenho previu, e ninguém
--   decidiu isso.
--
-- Devolve linha quando há problema. Qualquer linha reprova.
-- ===========================================================================
SELECT format('app.%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) AS objeto,
       concat_ws(
         '; ',
         CASE WHEN r.rolname <> 'sc_migrator'
              THEN format('função com direitos de quem a definiu pertence a %s, e não ao migrador — roda com um poder que o desenho não decidiu', r.rolname)
         END,
         CASE WHEN NOT EXISTS (SELECT 1
                                 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS ajuste
                                WHERE ajuste LIKE 'search_path=%')
              THEN 'função com direitos de quem a definiu sem caminho de busca fixo — um objeto temporário à frente do esquema seria lido no lugar do verdadeiro'
         END
       ) AS problema
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_roles r ON r.oid = p.proowner
 WHERE n.nspname = 'app'
   AND p.prosecdef
   AND ( r.rolname <> 'sc_migrator'
      OR NOT EXISTS (SELECT 1
                       FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS ajuste
                      WHERE ajuste LIKE 'search_path=%') )
 ORDER BY 1;
