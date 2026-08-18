-- ===========================================================================
-- G8 — Tabela de pedido com política de alteração ou de remoção onde não
-- deveria haver.
--
-- Pedido é registro imutável (P-010): item, preço, opção escolhida e dados da
-- loja no pedido são cópia congelada do momento da compra. Alterar um produto
-- depois nunca pode mudar um pedido já feito — e o jeito de garantir isso não é
-- disciplina de quem escreve o caso de uso, é ausência de permissão no banco.
--
-- O pedido em si muda de estado, então ele aceita alteração; o que ele nunca
-- aceita é remoção, porque pedido não é apagado nem pelo dono nem pelo
-- comprador (retenção fiscal e histórico). As linhas copiadas — itens, opções
-- dos itens e histórico de estado — não aceitam nem uma coisa nem outra.
--
-- Política de administração conta: enxergar todas as lojas é um privilégio de
-- leitura, não licença para reescrever o passado de um pedido.
--
-- Devolve linha quando há problema. Qualquer linha reprova.
-- ===========================================================================
WITH imutaveis(tabela, comando, nome_do_comando, razao) AS (
  VALUES
    ('orders',               'd', 'remoção',
     'pedido nunca é apagado: retenção fiscal e histórico do comprador dependem dele'),
    ('order_items',          'w', 'alteração',
     'o item é cópia congelada do momento da compra (P-010)'),
    ('order_items',          'd', 'remoção',
     'apagar item reescreveria o total de um pedido já fechado'),
    ('order_item_options',   'w', 'alteração',
     'a opção escolhida é cópia congelada do momento da compra (P-010)'),
    ('order_item_options',   'd', 'remoção',
     'apagar opção reescreveria o total de um pedido já fechado'),
    ('order_status_history', 'w', 'alteração',
     'transição registrada é fato passado: corrigir se escreve como transição nova'),
    ('order_status_history', 'd', 'remoção',
     'apagar transição destrói o tempo de preparo e a auditoria do pedido')
)
SELECT format('app.%s / %s', c.relname, p.polname) AS objeto,
       format('política de %s em tabela de pedido que não deveria tê-la — %s',
              im.nome_do_comando, im.razao) AS problema
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN imutaveis im ON im.tabela = c.relname
 WHERE n.nspname = 'app'
   AND p.polpermissive
   AND p.polcmd::text IN (im.comando, '*')
 ORDER BY 1, 2;
