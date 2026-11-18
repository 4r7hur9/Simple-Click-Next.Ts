# Design: Avaliações com notas e reputação (A decidir)

> feature: decidir-avaliacoes · card #117 · 06/11/2026

Documento de proposta. Nada aqui está aprovado: as decisões são do dono do
produto, nas perguntas Q-11701…Q-11716 da spec (P-107). Caminhos relativos à
raiz `/Users/stargrupo/Projetos/SC`.

## 1. Evidências do estado atual

### Fatos

| Fato                                                                                                                                 | Evidência                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Não existe nota, avaliação nem reputação (nenhuma tabela, contrato, rota ou ordenação)                                               | busca em `apps/` e `packages/`; a estrela é a de favoritar: `packages/ui/src/icones.ts`                                        |
| Comentários de texto com situação PENDENTE, APROVADO e RECUSADO, denúncia e bloqueio de autor                                        | `packages/database/migrations/0062_curtidas_e_comentarios.sql` (`app.comments`)                                                |
| Limite de envio e nome curto no banco                                                                                                | mesma migration: `app.pode_comentar`, `app.nome_curto_da_pessoa`                                                               |
| A denúncia de comentário não tem limite de envio                                                                                     | mesma migration: `app.denunciar_comentario`                                                                                    |
| A equipe da loja pode moderar e apagar comentário por política de banco                                                              | mesma migration: políticas `comments_staff_update` e `comments_staff_delete`                                                   |
| Contrato e rotas do social                                                                                                           | `packages/contracts/src/social.ts` (`ROTAS_DO_SOCIAL`, `LIMITES_DOS_COMENTARIOS`)                                              |
| Casos de uso do social e trilha por loja                                                                                             | `apps/api/src/modules/social/social.usecase.ts` (`comentar`, `moderar`, `denunciar`, `trilha`)                                 |
| Números públicos calculados na leitura, sem coluna desnormalizada                                                                    | `apps/api/src/core/resumo-social.ts` (`socialDasLojas`, `socialDosProdutos`, `resumoOuZero`)                                   |
| Tela de moderação de comentários                                                                                                     | `apps/web/src/features/comentarios/TelaDeComentarios.tsx`                                                                      |
| A etapa final do pedido é COMPLETED e só a loja muda o status                                                                        | `packages/contracts/src/etapas-do-pedido.ts`, `packages/core/src/maquina-status.ts`                                            |
| O pedido do site exige conta                                                                                                         | `apps/api/src/modules/orders/pedidos.routes.ts` (401 `conta_obrigatoria`)                                                      |
| A pessoa chega ao pedido por `orders.store_customer_id` e `store_customers.identity_id`, que pode ser nulo                           | `packages/database/prisma/schema.prisma` (`Order`, `StoreCustomer`)                                                            |
| O item do pedido pode ter `productId` nulo e o pedido é imutável                                                                     | `schema.prisma` (`OrderItem`), `packages/database/guards/g8_pedido_imutavel.sql`                                               |
| `app.meus_itens_de_pedidos` não devolve o produto                                                                                    | `packages/database/migrations/0059_itens_dos_meus_pedidos.sql`                                                                 |
| Loja e produto públicos já levam `curtidas` e `comentarios` opcionais                                                                | `packages/contracts/src/vitrine.ts`, `apps/api/src/modules/storefront/vitrine.routes.ts`                                       |
| O feed não tem ordenação por nota                                                                                                    | `packages/contracts/src/feed.ts` (`ORDENS_DAS_LOJAS_DO_FEED`), `apps/api/src/modules/feed/feed.usecase.ts`                     |
| Campos públicos da loja têm lista de saída controlada                                                                                | `apps/api/src/modules/storefront/dto-publico.ts`                                                                               |
| Tabela nova com `store_id` precisa de construtor e camada na varredura de isolamento                                                 | `apps/api/tests/isolamento-varredura.test.ts` (`CONSTRUTORES`, `CAMADAS`)                                                      |
| Cada tabela precisa de modelo no Prisma                                                                                              | `packages/database/tests/esquema-cobre-o-banco.test.ts`                                                                        |
| A guarda G6 proíbe visão materializada sobre tabela de loja; G9 torna imutável o que se chama `audit*`; G10 exige `search_path` fixo | `packages/database/guards/g6_sem_matview_multi_loja.sql`, `g9_auditoria_sem_alteracao.sql`, `g10_definer_com_caminho_fixo.sql` |
| A plataforma só tem as permissões lojas, limites e auditoria; não há fila de moderação                                               | `packages/contracts/src/permissoes.ts` (`PERMISSOES_DA_PLATAFORMA`), `apps/api/src/modules/admin/`                             |
| A exclusão de conta apaga comentários e denúncias, e a exportação lista dados por loja                                               | `packages/database/migrations/0073_aceites_legais.sql` (`app.anonimizar_minha_conta`, `app.meus_dados_nas_lojas`)              |
| Os dados estruturados usam `dangerouslySetInnerHTML` e não têm `aggregateRating`                                                     | `apps/web/src/lib/dados-estruturados.tsx`                                                                                      |
| Os Termos já citam moderação de avaliações pela loja e pelo SimpleClick                                                              | `apps/web/src/features/legal/textos/termos-de-uso.ts`                                                                          |
| O `verify` roda só os projetos web e unit                                                                                            | `onpspec.config.json` (`testCommand`)                                                                                          |
| Os blocos visuais de nota estão marcados "A decidir"                                                                                 | `.spec/features/stitch-planejamento/design.md` (linhas de nota, "4.8+" e aba "Avaliações")                                     |

### Inferências

- O pedido manual (`channel='MANUAL'`) pode não ter identidade ligada
  (`apps/api/src/modules/orders/pedido-manual.usecase.ts`).
- Como só a loja conclui o pedido, ela decide quem pode avaliar; sem regra
  extra, poderia inflar a nota com contas próprias ou barrar uma crítica
  cancelando o pedido (Q-11714).
- A equipe da loja consegue alterar `store_customers.identity_id` por política
  de banco; uma avaliação que dependa dessa ligação na leitura ficaria sob
  controle da loja (AC-11707).

### Desconhecido

- Por que a migration 0069 não existe (a pasta vai da 0068 para a 0070).
- Qual a decisão do produto sobre moderação feita pelo SimpleClick.
- Onde o Stitch define visualmente a nota (só está registrado como "A decidir").

## 2. Alternativas

| Alternativa                                                            | Vantagens                                                             | Custos e riscos                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A. Nota da loja, uma vigente por pessoa e loja (recomendada para a v1) | Cabe nos mockups; não precisa do produto no pedido; difícil de inflar | Não diz qual produto foi bom                                                         |
| B. Nota do produto por item do pedido                                  | Útil para catálogo e página do produto                                | `OrderItem.productId` é nulo às vezes; `meus_itens_de_pedidos` não devolve o produto |
| C. As duas                                                             | Mais completa                                                         | Duas regras de elegibilidade, de média e de moderação; mais telas                    |

## 3. Proposta técnica (condicionada às respostas)

Tudo abaixo é proposta. Ordem de implementação sequencial, na pasta principal
(sem worktree), só depois de Q-11701 respondida como "fazer" e de plano aprovado.

### 3.1 Banco (T-11701)

- Migration nova, número seguinte à última (hoje a 0073), só com tabelas novas
  (expand-only): `app.reviews` e `app.review_reports`.
- `app.reviews`: `store_id`, `identity_id` (cópia fixa, preenchida por função
  `SECURITY DEFINER` com a sessão, nunca pelo cliente), `order_id` (referência
  para conferência, único), `rating smallint` com CHECK de 1 a 5, `body` com
  CHECK `btrim` e 1 a 500 caracteres, `author_name` copiado na criação,
  `status` por CHECK (PUBLICADA, OCULTA), `hidden_reason` (código), resposta da
  loja (`reply_body`, `reply_at`), datas.
- Isolamento (guardas G1 a G10): RLS `ENABLE` e `FORCE`; política para os 4
  comandos; chave única por loja; índice cobrindo as colunas da política; função
  `SECURITY DEFINER` com `search_path` fixo e dono migrador; nada com prefixo
  `audit*`; sem visão materializada.
- Contra a supressão pela loja: `sc_app` no contexto da loja sem política de
  DELETE e com `GRANT UPDATE` só nas colunas da resposta (AC-11712). Quem oculta
  é o papel da plataforma (`sc_admin`), por função própria.
- Elegibilidade (AC-11702, AC-11704, AC-11705): função própria, não reaproveita
  `app.pode_comentar` (para não herdar o bloqueio de comentários). Confere o
  pedido online concluído da sessão, e-mail verificado, não ser dono, equipe nem
  criador, e os limites de AC-11706 (pessoa, loja no tempo, IP). Devolve uma
  recusa única.
- Denúncia: `app.review_reports` no padrão de `app.comment_reports`, mas com
  limite de envio e só motivos de lista fechada.
- Leitura pública por função de campos fechados, só de loja ACTIVE, sem
  `order_id` (AC-11710), no padrão de `app.comentarios_aprovados`.
- LGPD (AC-11722, AC-11723): alterar `app.anonimizar_minha_conta` e
  `app.meus_dados_nas_lojas` (migration 0073 é a referência; nova migration
  recria as funções, sem editar a antiga).
- Isolamento no teste: construtores de `reviews` e `review_reports` em
  `CONSTRUTORES`, camada em `CAMADAS` e apoio em `guardarApoio`/`ApoioDaLoja`
  (a denúncia depende da avaliação). Modelos no `schema.prisma`.
- Os arquivos `schema.prisma` e `isolamento-varredura.test.ts` são disputados por
  outros cards (#118 T-11801, por exemplo): ver o board antes de editar.

### 3.2 Permissões (T-11702)

- `packages/contracts/src/permissoes.ts`: se Q-11716 mandar criar permissão
  nova, entram em `PERMISSOES_DA_LOJA`, `DA_EQUIPE` e `ROTULOS_DAS_PERMISSOES`;
  `apps/api/src/core/equipe-da-loja.ts` (`PERMISSOES_POR_ROTA`) ganha as rotas.
  Rota nova fora de `PERMISSOES_POR_ROTA` fica só para o dono.
- Na plataforma não há permissões granulares (ASM-11706): a fila vale para
  todo admin; modelo novo de permissões fica fora do escopo.

### 3.3 Contrato (T-11703)

- Arquivo novo `packages/contracts/src/avaliacoes.ts` com esquemas zod, limites
  (como `LIMITES_DOS_COMENTARIOS`) e `ROTAS_DAS_AVALIACOES`.
- Registro em `packages/contracts/src/rotas.ts` (`montarCatalogo`,
  `ESQUEMAS_DO_CONTRATO`, `ETIQUETAS_DO_CONTRATO`), export em
  `packages/contracts/src/index.ts` e regeneração de `contrato/openapi.json`.
- Campos opcionais `avaliacoes` (média e contagem) em `esquemaDeLojaPublica`
  e, se Q-11702 incluir produto, em `esquemaDoProduto`
  (`packages/contracts/src/vitrine.ts`) e nos cartões do feed
  (`packages/contracts/src/feed.ts`).

### 3.4 API de avaliar e responder (T-11704)

- Módulo novo `apps/api/src/modules/avaliacoes/` no padrão de
  `apps/api/src/modules/social/` (rotas públicas com `exigirConta`, rotas da
  loja com `naLoja`), montado em `apps/api/src/app.ts`.
- Rotas: avaliar e editar (conta), ler lista (público), meus pedidos avaliáveis,
  responder (painel), denunciar (conta e painel).
- Trilha por loja (`app.audit_log`) só com identificadores e códigos de motivo,
  nunca com o texto, o nome nem quem denunciou.

### 3.5 Reputação e superfície pública (T-11705, T-11706)

- Função nova ao lado de `apps/api/src/core/resumo-social.ts` que calcula média
  e contagem na leitura (ASM-11702) e devolve nada quando não há avaliação
  publicada ou o mínimo de Q-11709 não foi atingido.
- `apps/api/src/modules/storefront/dto-publico.ts` (`CAMPOS_PUBLICOS_DA_LOJA`,
  `NUNCA_SAEM`) e `apps/api/src/modules/storefront/vitrine.routes.ts` incluem
  o resumo; o feed (`apps/api/src/modules/feed/feed.usecase.ts`) também.
- Se Q-11709 aprovar, a ordenação "melhor avaliado" e o filtro "4.8+" entram
  na consulta do feed (T-11706); a ordenação "mais vendidos" é do #124.

### 3.6 Moderação da plataforma (T-11707 e T-11711)

- Fila de denúncias e rotas de ocultar, restaurar e decidir contestação em
  `apps/api/src/modules/admin/`, gravando em `audit_platform` só ids e
  códigos. Os atos ganham nome em `apps/web/src/features/admin/trilha-na-tela.ts`.
- Pré-requisito de lançamento (ASM-11706): sem a fila, uma denúncia ficaria
  "visível até a decisão" para sempre. Prazo e retirada de emergência: Q-11715.
- E-mail de aviso ao autor: não há serviço de envio confirmado no código; é
  pergunta de custo e de escopo para a decisão (não presumir).

### 3.7 Telas (T-11708, T-11709, T-11710, T-11711)

- Conta: avaliar no detalhe do pedido concluído
  (`apps/web/src/features/conta/MeusPedidos.tsx`, `/conta/pedidos/[id]`).
- Vitrine e produto: resumo e aba "Avaliações" em
  `apps/web/src/features/loja/ApresentacaoDaLoja.tsx`,
  `apps/web/src/features/produto/DetalheDoProduto.tsx` e cartões
  (`apps/web/src/features/vitrine/CartaoDeProduto.tsx`,
  `apps/web/src/features/feed/Cartoes.tsx`). Coordenar com #104, #106, #107,
  #108 e #109; telas fora do ZIP precisam de proposta visual (ASM-11705).
- Painel: responder e denunciar, em tela própria no padrão de
  `apps/web/src/features/comentarios/TelaDeComentarios.tsx`, sem mostrar o
  pedido nem o contato (AC-11713). Item de menu em
  `apps/web/src/features/painel/secoes-do-painel.ts`.
- Admin: fila de denúncias em `apps/web/src/features/admin/`. Coordenar com #113.
- Nenhum texto, número ou cor do mockup é copiado (P-102, P-105); sem a função
  aprovada, o bloco fica oculto (AC-11721).

## 4. LGPD, abuso e segurança

- Dado mínimo público: nome curto, nota, data, texto, resposta. Nada de pedido.
- A cópia fixa de autoria impede que a loja tire o crítico mexendo na ficha.
- Autoavaliação barrada; e-mail verificado; limites por pessoa, loja e IP.
- Resposta da loja é denunciável e limitada; painel sem dados do autor.
- Trilha sem texto livre (a trilha por loja é lida pela equipe e é imutável).
- Texto sempre tratado como texto puro; CHECK no banco; atenção ao JSON-LD.
- Leitura pública só de loja ativa e avaliação publicada; recusa única para
  quem não é elegível.

## 5. Estratégia de provas

- Arquivos `*.onp.test.ts(x)` com o título `[CA-n] @spec:AC-117xx`.
- Lógica pura (cálculo da média, regras de elegibilidade, validação do texto,
  esquemas zod): testes em `packages/contracts/src/` e `apps/api/src/`, que o
  projeto `unit` roda no `verify`. Telas: `apps/web/tests/*.onp.test.tsx`
  (projeto `web`).
- Banco (RLS, DELETE recusado, cópia fixa, exclusão de conta) e API
  (integração): ficam nos projetos `db-rls` e `api-int`, que o `verify` não
  roda; os critérios ficam sem prova no motor até o gerente decidir o comando
  (ASM-11707). Não alterar `onpspec.config.json` neste card.
- Sem essas provas, a feature não pode ser declarada concluída (P-101).

## 6. Relação com outros cards (sem dependência obrigatória)

| Card | Relação                                                                               |
| ---- | ------------------------------------------------------------------------------------- |
| #104 | peça de estrela de nota, se aprovada, é do pacote de interface                        |
| #106 | cartão de loja do feed e filtro "Lojas 4.8+" (Q-11709)                                |
| #107 | vitrine da loja: nota e aba "Avaliações"                                              |
| #108 | catálogo: nota no cartão de produto                                                   |
| #109 | detalhe do produto: nota e lista                                                      |
| #111 | área do cliente: avaliar no pedido concluído                                          |
| #112 | painel: responder e denunciar                                                         |
| #113 | administração: fila de denúncias                                                      |
| #118 | selos de loja: mesmas tabelas compartilhadas (`schema.prisma`, varredura) e etiquetas |
| #124 | mais vendidos: ordenação do feed ao lado de "melhor avaliado"                         |

## 7. Rollback

Nesta fase só existem documentos novos sem commit: apagar
`.spec/features/decidir-avaliacoes/` desfaz tudo, depois de conferir com
`git status` que nada mais mudou. Numa implementação futura, a migration só cria
tabelas novas; o desfazer é apagar `app.review_reports` e `app.reviews` e
restaurar as duas funções da exclusão e da exportação, sem tocar em
`comments` nem em `orders`.
