-- ===========================================================================
-- G2 — Tabela com isolamento ligado e sem política para algum dos quatro
-- comandos: leitura, inserção, alteração e remoção.
--
-- Com o isolamento ligado, comando sem política permissiva é negação total.
-- Isso é seguro e é justamente o problema: a tabela para de funcionar em
-- silêncio, e o defeito aparece meses depois, numa rota pouco usada. O bloco
-- canônico exige uma política POR COMANDO exatamente para que a diferença
-- entre ler, inserir, alterar e remover seja escrita, e não herdada de um
-- `FOR ALL` que esconde a decisão.
--
-- Só política PERMISSIVA conta. A restritiva não concede nada — ela apenas
-- corta o que a permissiva concedeu —, então uma restritiva `FOR ALL` (o
-- cinto de contexto obrigatório, presente em quase toda tabela) faria a
-- verificação passar sem que exista permissão nenhuma.
--
-- A lista de exceções é de tabelas que só acrescentam por decisão registrada:
-- nelas a ausência de alteração e de remoção é a proteção, não o esquecimento.
--
-- Devolve linha quando há problema. Qualquer linha reprova.
-- ===========================================================================
WITH so_acrescenta(tabela) AS (
  VALUES
    ('audit_log'),             -- trilha imutável em três camadas (G9)
    ('audit_platform'),        -- idem, para o que não é de loja nenhuma (0051)
    ('legal_acceptances'),     -- aceite é prova de consentimento: só acrescenta (0073)
    ('order_items'),           -- cópia congelada do momento da compra (P-010)
    ('order_item_options'),    -- idem: opção escolhida não muda depois
    ('order_status_history'),  -- histórico de transição só cresce
    ('store_metrics_daily'),   -- rollup escrito pelo trabalhador, fora da requisição
    ('product_metrics_daily')  -- idem
),
-- Terceira categoria, que o domínio exigiu e esta guarda não previa: tabela que
-- ALTERA mas nunca APAGA. O pedido é o caso: o status anda a cada etapa do
-- trabalho da loja — aceitar, preparar, entregar —, e por isso ele precisa de
-- política de alteração. Apagar, nunca: retenção fiscal e histórico do
-- comprador dependem de o pedido continuar existindo, e a G8 reprova quem der
-- esse poder a alguém.
--
-- Sem esta categoria, as duas guardas se contradiziam: a G2 cobrava a política
-- de remoção que a G8 proíbe. Guarda que se contradiz com outra é guarda que
-- alguém vai desligar.
nunca_apaga(tabela) AS (
  VALUES
    ('orders')                 -- pedido nunca é apagado (P-010, G8)
),
comandos(letra, nome) AS (
  VALUES ('r', 'leitura'), ('a', 'inserção'), ('w', 'alteração'), ('d', 'remoção')
),
tabelas AS (
  SELECT c.oid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'app'
     AND c.relkind = 'r'
     AND c.relrowsecurity
),
-- Ausência DELIBERADA, por comando. A tabela continua sendo cobrada nos outros
-- três: "só acrescenta" dispensa alteração e remoção, "nunca apaga" dispensa
-- apenas a remoção. Dispensar a tabela inteira deixaria passar o esquecimento
-- de leitura, que é o defeito mais comum e o mais silencioso.
dispensado(tabela, letra) AS (
  SELECT tabela, 'w' FROM so_acrescenta
  UNION ALL
  SELECT tabela, 'd' FROM so_acrescenta
  UNION ALL
  SELECT tabela, 'd' FROM nunca_apaga
)
SELECT format('app.%s', t.relname) AS objeto,
       format('sem política de %s — com o isolamento ligado, comando sem política é negação total', comandos.nome) AS problema
  FROM tabelas t
 CROSS JOIN comandos
 WHERE NOT EXISTS (SELECT 1
                     FROM pg_policy p
                    WHERE p.polrelid = t.oid
                      AND p.polpermissive
                      AND p.polcmd::text IN (comandos.letra, '*'))
   AND NOT EXISTS (SELECT 1
                     FROM dispensado d
                    WHERE d.tabela = t.relname
                      AND d.letra = comandos.letra)
 ORDER BY 1, 2;
