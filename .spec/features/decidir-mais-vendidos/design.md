# Design: Mais vendidos, em alta e recomendações públicas

> feature: decidir-mais-vendidos

<!--
  Card #124. Documento de PROPOSTA para o dono do produto decidir (P-107).
  Tudo rotulado "proposto" não existe no código. Caminhos citados como fato
  existem em /Users/stargrupo/Projetos/SC (conferidos em 09/11/2026).
-->

## 1. Estado atual (fatos com evidência)

| #   | Fato                                                                                                                                                                                             | Evidência                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Existe ranking de mais vendidos só no painel, por quantidade ou valor, com desempate pelo outro critério e depois pelo nome; limite de 10                                                        | `apps/api/src/modules/metrics/consultas.ts` (`produtosMaisVendidos`, `TAMANHO_DO_RANKING`)                                                                                              |
| F2  | A consulta agrupa por produto e nome gravado no pedido (renomear duplica a linha) e não filtra o canal (pedido manual entra)                                                                     | mesmo arquivo, `produtosMaisVendidos`                                                                                                                                                   |
| F3  | Só contam como venda os status de `STATUS_QUE_CONTAM_COMO_VENDA`, derivados de `situacaoNaVenda`; ficam fora cancelado, pendente e o pedido do WhatsApp ainda não aceito                         | `apps/api/src/modules/metrics/faturamento.ts`, `packages/core/src/situacao-na-venda.ts`                                                                                                 |
| F4  | O contrato do painel traz `totalCentavos` (faturamento); não serve para resposta pública                                                                                                         | `packages/contracts/src/metricas.ts` (`esquemaDoProdutoMaisVendido`)                                                                                                                    |
| F5  | O ranking do painel só atende dono e equipe com a permissão `metricas`                                                                                                                           | `apps/api/src/modules/metrics/metricas.usecase.ts`, `packages/contracts/src/permissoes.ts`                                                                                              |
| F6  | As políticas de acesso de `app.orders` e `app.order_items` só liberam leitura à equipe da loja ou por token de acompanhamento, e exigem uma loja no contexto; a rota pública não lê pedidos hoje | `packages/database/migrations/0008_pedidos.sql` (`orders_require_ctx`)                                                                                                                  |
| F7  | O catálogo público ordena por `relevancia` (ordem manual do dono), `menor-preco`, `maior-preco`, `a-z`; nenhuma ordem usa vendas                                                                 | `packages/contracts/src/vitrine.ts` (`esquemaDaOrdemDoCatalogo`), `apps/api/src/modules/storefront/catalogo-paginado.usecase.ts` (`paginaDoCatalogo`)                                   |
| F8  | O feed ordena por relevância, distância, preço e recentes; não há "em alta"; curtidas, favoritos e vendas não entram na ordem                                                                    | `packages/contracts/src/feed.ts` (`ORDENS_DOS_PRODUTOS_DO_FEED`), `apps/api/src/modules/feed/feed.usecase.ts`                                                                           |
| F9  | A curadoria manual existe: `isFeatured` alimenta os "destaques" da vitrine e desempata no feed                                                                                                   | `packages/database/prisma/schema.prisma` (`isFeatured`), `apps/web/src/features/vitrine/Destaques.tsx`, migrações `0050_feed_favoritos_e_recentes.sql` e `0065_feed_filtro_atacado.sql` |
| F10 | Padrão de função pública de banco com privilégio elevado e saída mínima                                                                                                                          | `packages/database/migrations/0067_atacado_publico_do_feed.sql`                                                                                                                         |
| F11 | Guardas do projeto: função com privilégio elevado precisa de caminho de busca fixo (G10); view materializada que cruza lojas é proibida (G6)                                                     | `packages/database/guards/g10_definer_com_caminho_fixo.sql`, `packages/database/guards/g6_sem_matview_multi_loja.sql`                                                                   |
| F12 | O feed já responde com `cache-control: public, max-age=300`; a vitrine não manda cache-control nem usa o cache Redis                                                                             | `apps/api/src/modules/feed/feed.routes.ts`, `apps/api/src/modules/storefront/vitrine.routes.ts`                                                                                         |
| F13 | Cache Redis por loja com invalidação e aviso ao site                                                                                                                                             | `apps/api/src/core/cache.ts` (`chaveDeCache`, `invalidarLoja`, `criarAvisoDoSite`)                                                                                                      |
| F14 | O limitador atual é anti força bruta e recusa a requisição quando o Redis cai                                                                                                                    | `apps/api/src/core/limite.ts` (`limitarTentativas`)                                                                                                                                     |
| F15 | Índice que cobre pedidos por loja e período                                                                                                                                                      | `packages/database/migrations/0037_indices_metricas.sql` (`orders_por_periodo_idx`)                                                                                                     |
| F16 | Há tarefa periódica no padrão `setInterval`                                                                                                                                                      | `apps/api/src/jobs/retencao.job.ts`                                                                                                                                                     |
| F17 | A lista de rotas do contrato é testada; rota nova a altera                                                                                                                                       | `apps/api/src/contracts/gerar.test.ts`                                                                                                                                                  |
| F18 | O comando de verificação do ONP só roda os projetos de teste `web` e `unit`; testes de banco ficam em outro projeto                                                                              | `onpspec.config.json` (`testCommand`), `vitest.config.ts`                                                                                                                               |

**Inferência** (busca por ausência, não substitui auditoria completa): não
existem endpoint nem contrato públicos de ranking, ordem "em alta",
recomendação personalizada nem opção da loja para o ranking.

**Desconhecido**: a decisão do dono do produto sobre fazer ou não, escopo
(loja ou plataforma), período, critério, mínimo e padrão da opção (Q-12401 a
Q-12411).

## 2. Alternativas de cálculo (proposto)

Pelo fato F6, **toda alternativa exige migração**: a rota pública não lê
pedidos.

| Alt. | Descrição                                                                                                        | Prós                                                | Contras                                                                                           | Parecer                         |
| ---- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------- |
| A    | Função de banco com privilégio elevado, por loja, que devolve só identificador do produto e posição (padrão F10) | Sem tabela nova; saída mínima; regra única no banco | Regra de venda existe em SQL e em TS (precisa de teste de paridade, AC-12419); carga na agregação | **Recomendada**                 |
| B    | Tabela agregada, atualizada por tarefa periódica (padrão F16)                                                    | Leitura barata                                      | Tabela nova com política de acesso por loja; defasagem; mais peças                                | Aceitável se a carga da A pesar |
| C    | View materializada                                                                                               | Simples de ler                                      | Cruza lojas; proibida pela guarda G6 (F11)                                                        | **Descartada**                  |

Ranking da plataforma (US-12406): exige uma função própria que cruze lojas,
com saída mínima, e passa pela mesma barreira da `orders_require_ctx`. É risco
ligado à Q-12402; só entra se a resposta for "plataforma".

## 3. Proposta técnica (tudo proposto, nada existe)

### 3.1 Banco

- Função `app.mais_vendidos_da_loja(p_loja uuid)` (nome proposto), com
  `SECURITY DEFINER`, `SET search_path = app, pg_temp`, dono de migração,
  `REVOKE ALL FROM PUBLIC` e `GRANT EXECUTE` só ao papel da aplicação (AC-12412).
- Filtro de loja por dentro: pedido, item e produto da mesma loja `p_loja`
  (AC-12406); loja ativa, não excluída e com a opção ligada (AC-12411).
- Janela, tamanho da lista e mínimo fixos dentro da função (AC-12410).
- Agrupa por produto (soma variações, nome atual, exclui item sem produto)
  (AC-12405); só produto publicado e não apagado (AC-12411).
- Mínimo em pedidos ou compradores distintos, não só em unidades (AC-12418).
- Saída: identificador do produto e posição, nada mais (AC-12409).
- Coluna nova na tabela de lojas para ligar ou desligar, com valor inicial
  conforme a Q-12407 (recomendação: desligado) e `GRANT UPDATE` só nessa coluna
  (AC-12413, AC-12415). Só o dono altera.
- Índice: avaliar se `orders_por_periodo_idx` (F15) basta para a agregação.

### 3.2 Contrato e rota

- Esquema público **proposto**, estrito: lista de `{ produtoId, posicao }`.
  Nenhum campo de número, dinheiro ou cliente (AC-12409).
- Rota pública **proposta**: `GET /v1/vitrine/:apelido/mais-vendidos`, sem
  parâmetros de consulta (AC-12410). Desligado, abaixo do mínimo e loja
  inexistente ou suspensa devolvem o mesmo status e o mesmo corpo vazio
  (AC-12408).
- Cache: Redis com chave começando pelo identificador da loja (F13) e
  `cache-control` curto como o feed (F12). "Em até o tempo máximo" é o que se
  promete (AC-12414, AC-12416); desligar, despublicar ou suspender chama
  `invalidarLoja` e avisa o site.
- Limite de requisições: **não** usar `limitarTentativas` (F14). Q-12411.

### 3.3 Interface (condicionada pela P-107)

- Selo "Mais vendido" e aba "Mais vendidos" na vitrine: cartão #107
  (`apps/web/src/features/vitrine/`, ex.: `GradeDeProdutos.tsx`).
- Filtro e selo no feed: cartão #106 (`apps/web/src/features/feed/`, ex.:
  `Cartoes.tsx`).
- Opção do dono: tela de configuração do painel (ex.:
  `apps/web/src/features/config/`).
- Tudo oculto até a decisão registrada; nenhuma tarefa do redesign depende
  desta função. O selo "Destaque da loja" (curadoria, F9) tem texto e visual
  diferentes do "Mais vendido" (AC-12402).

## 4. Privacidade e riscos

| Risco                                                                               | Como a spec trata                                                                                                                     |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Inferir o volume de vendas de uma loja pequena (posições que mudam, janelas curtas) | Parâmetros fixos; sem números; resposta igual nos três estados; mínimo por pedidos distintos (AC-12407, AC-12408, AC-12410, AC-12418) |
| Compra de um cliente identificável (atacado) dominar o ranking                      | Mínimo por pedidos ou compradores distintos (AC-12418); aviso ao lojista ao ligar a opção                                             |
| Função com privilégio elevado ignora a política de acesso                           | Filtro de loja dentro da função e teste com duas lojas (AC-12406, AC-12412)                                                           |
| Mostrar produto oculto ou de loja suspensa                                          | AC-12411 e invalidação do cache (AC-12414)                                                                                            |
| Ligar por padrão expõe vendas sem consentimento                                     | Recomendação opt-in (AC-12415, ASM-12407)                                                                                             |
| Rota pública sob carga com o Redis fora do ar                                       | Risco registrado; índice e limite sem depender do Redis (Q-12411)                                                                     |
| Regra de venda divergir entre SQL e TS                                              | Teste de paridade com `situacaoNaVenda` (AC-12419)                                                                                    |
| Ranking da plataforma exigir leitura entre lojas                                    | Função própria de saída mínima, só se a Q-12402 pedir                                                                                 |

LGPD: o ranking público não traz dado pessoal. O mínimo por compradores
distintos e a saída sem números existem para que nenhuma compra identificável
seja deduzida.

## 5. Estratégia de testes (futura; nada é escrito agora)

- Arquivos `*.onp.test.ts` ou `*.onp.test.tsx`, com título
  `it("[CA-n] @spec:AC-124xx …")` (regra do `.spec/README.md`).
- O que roda no projeto `unit`: regra pura de elegibilidade e desempate,
  contrato estrito (AC-12409), recusa de parâmetros (AC-12410), diferença entre
  "Destaque da loja" e "Mais vendido" (AC-12402).
- O que depende do banco (AC-12403, AC-12405, AC-12406, AC-12408, AC-12411,
  AC-12412, AC-12419): o `verify` do ONP não roda esse projeto (F18). Decisão na
  Q-12410: ampliar o comando de verificação ou deixar a prova para o card #114.
  **Nenhum critério é declarado provado sem `verify` com PASS.**
- Padrões a seguir: `apps/api/tests/metricas-ranking.test.ts` (ranking contra
  PostgreSQL real, canceladas fora) e
  `apps/api/tests/vitrine-sem-dado-sensivel.test.ts` (ausência de dado
  sensível na vitrine).
- Teste de isolamento com duas lojas e teste de paridade SQL e TS são
  obrigatórios na futura implementação.

## 6. Ordem e dependências

1. Decisão do dono: Q-12401 primeiro; sem resposta "fazer", nada avança (P-107).
2. T-12401 (migração) → T-12402 (contrato) → T-12403 (caso de uso) → T-12404 (rota
   e cache) → T-12405 (opção do dono).
3. T-12406 (interface na vitrine) só depois do #107; T-12407 ("em alta" no feed)
   só depois do #106 e da Q-12402 respondida "plataforma".
4. As tarefas desta spec dependem dos cards de redesign, nunca o contrário.
