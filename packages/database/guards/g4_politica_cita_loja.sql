-- ===========================================================================
-- G4 — Política permissiva de tabela quente sem citar o identificador da loja.
--
-- ESTE É O ACHADO MEDIDO, e o de maior impacto do esquema. Com 300 mil
-- pedidos, UMA única política permissiva sem `store_id` no conjunto impediu o
-- planejador de fatorar o predicado: o plano virou `BitmapOr` e o acesso
-- ordenado foi destruído — 6,357 ms e 5.123 blocos contra 0,213 ms e 23
-- blocos. Políticas permissivas se combinam por OU, então basta UMA sem o
-- identificador para que a união inteira deixe de ser fatorável.
--
-- O que atravessa lojas por natureza ("minhas lojas", histórico do comprador)
-- não vira política: sai do conjunto e vira função com direitos de quem a
-- definiu, num caminho de baixo volume. O caminho quente fica com o predicado
-- simples.
--
-- Confere `USING` e `WITH CHECK` juntos, porque política de inserção só tem o
-- segundo: olhar apenas o primeiro acusaria toda política de inserção correta.
-- A credencial de administração fica de fora — enxergar todas as lojas é o
-- trabalho dela, e ela não atende requisição de loja.
--
-- Devolve linha quando há problema. Qualquer linha reprova.
-- ===========================================================================
WITH quentes(tabela) AS (
  VALUES ('orders'), ('order_items'), ('order_item_options'),
         ('order_status_history'), ('products'), ('product_prices'),
         ('product_variants'), ('store_customers'), ('audit_log')
),
-- Exceção única e revisada: o segundo eixo de `store_customers`. Ele é
-- ancorado na IDENTIDADE, e não na loja — o comprador vê a própria linha, que
-- por definição pode estar em outra loja —, e é o porteiro de papel
-- (`current_role_name() = 'CUSTOMER'`) que o segura. Está registrado como
-- decisão de modelagem, não como esquecimento.
eixo_de_identidade(tabela, politica) AS (
  VALUES ('store_customers', 'sc_self_select')
)
SELECT format('app.%s / %s', c.relname, p.polname) AS objeto,
       format('política permissiva de tabela quente sem citar store_id no conjunto: %s — o planejador deixa de fatorar o predicado e o acesso ordenado morre',
              coalesce(pg_get_expr(p.polqual, p.polrelid),
                       pg_get_expr(p.polwithcheck, p.polrelid),
                       'conjunto vazio')) AS problema
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'app'
   AND p.polpermissive
   AND c.relname IN (SELECT tabela FROM quentes)
   AND (c.relname, p.polname) NOT IN (SELECT tabela, politica FROM eixo_de_identidade)
   AND (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' '
     || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) NOT LIKE '%store_id%'
   AND NOT EXISTS (SELECT 1
                     FROM pg_roles r
                    WHERE r.oid = ANY (p.polroles)
                      AND r.rolname = 'sc_admin')
 ORDER BY 1;
