-- ===========================================================================
-- G9 — Trilha de auditoria que aceite alteração ou remoção.
--
-- "Só acrescenta" por si só não prova que ninguém mexeu. A trilha é protegida
-- em três camadas, e esta guarda confere as três, porque cada uma cobre a
-- falha da outra:
--
--   1. ausência de política de alteração e de remoção — negação por omissão,
--      que vale para as credenciais de execução;
--   2. retirada do privilégio — barra antes de a política ser consultada, e
--      sobrevive a alguém escrever uma política errada depois;
--   3. gatilho que levanta exceção antes de alterar ou remover — é a única
--      camada que alcança a credencial de migração, que contorna o isolamento
--      e por isso passaria pelas duas primeiras sem esforço.
--
-- Trilha de auditoria é toda tabela do esquema cujo nome começa por `audit`:
-- uma trilha nova nasce coberta sem que ninguém precise lembrar de listá-la.
--
-- Devolve linha quando há problema. Qualquer linha reprova.
-- ===========================================================================
WITH trilhas AS (
  SELECT c.oid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'app'
     AND c.relkind = 'r'
     AND c.relname LIKE 'audit%'
)
-- Camada 1 — política de alteração ou de remoção.
SELECT format('app.%s / %s', t.relname, p.polname) AS objeto,
       format('trilha de auditoria com política de %s — a primeira camada da imutabilidade é a ausência dela',
              CASE p.polcmd::text WHEN 'w' THEN 'alteração' WHEN 'd' THEN 'remoção' ELSE 'todos os comandos' END) AS problema
  FROM trilhas t
  JOIN pg_policy p ON p.polrelid = t.oid
 WHERE p.polpermissive
   AND p.polcmd::text IN ('w', 'd', '*')

UNION ALL

-- Camada 2 — privilégio de alteração ou de remoção concedido a alguém.
SELECT format('app.%s / %s', t.relname, g.grantee) AS objeto,
       format('trilha de auditoria com privilégio de %s concedido a %s — o privilégio barra antes da política, e sem ele uma política errada escrita depois não alcança a trilha',
              lower(g.privilege_type), g.grantee) AS problema
  FROM trilhas t
  JOIN information_schema.role_table_grants g
    ON g.table_schema = 'app' AND g.table_name = t.relname
 WHERE g.privilege_type IN ('UPDATE', 'DELETE')
   AND g.grantee IN ('sc_app', 'sc_admin', 'PUBLIC')

UNION ALL

-- Camada 3 — gatilho que recusa alteração e remoção antes de acontecerem.
SELECT format('app.%s', t.relname) AS objeto,
       'trilha de auditoria sem gatilho que recuse alteração e remoção antes de acontecerem — é a única camada que alcança a credencial de migração, que contorna o isolamento' AS problema
  FROM trilhas t
 WHERE NOT EXISTS (
         SELECT 1
           FROM pg_trigger g
          WHERE g.tgrelid = t.oid
            AND NOT g.tgisinternal
            -- Máscara de tgtype: 2 = antes do comando, 8 = remoção,
            -- 16 = alteração. Tem de ser ANTES: depois já aconteceu.
            AND (g.tgtype & 2) = 2
            AND (g.tgtype & 16) = 16
            AND (g.tgtype & 8) = 8)
 ORDER BY 1, 2;
