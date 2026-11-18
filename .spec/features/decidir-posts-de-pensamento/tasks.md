# Tasks: Posts de pensamento e texto livre no feed

> feature: decidir-posts-de-pensamento

<!--
  Card #116, bloco de códigos 11601 a 11699.
  TODAS as tarefas ficam [pendente] e BLOQUEADAS até o dono do produto
  responder Q-11601 (fazer ou não) e as perguntas citadas em cada uma (P-107).
  Nenhuma tarefa do redesign (#104–#114) depende destas.
  Ordem obrigatória (arquivos compartilhados): T-11601 → T-11602 → T-11603 →
  T-11604 → T-11605 → T-11606 → T-11607 → T-11608 → T-11609, uma depois da outra.
  "Arquivos:" lista só arquivos que já existem; "Cria:" lista os novos. O número da
  migração é o próximo livre na hora da implementação.
-->

## T-11601 — Tabela de pensamentos, RLS, gatilhos e isolamento [pendente]

- Refs: US-11602, US-11603, US-11606, AC-11605, AC-11607, AC-11608, AC-11609, AC-11614, AC-11617
- Arquivos: packages/database/prisma/schema.prisma, apps/api/tests/isolamento-varredura.test.ts, packages/testing/src/factories.ts
- Cria: `packages/database/migrations/00NN_posts_de_pensamento.sql`
- Notas: tabela `app.text_posts` (design.md seção 4); gatilho de INSERT com
  autor, situação e limite diário por loja; gatilho de produto da mesma loja;
  GRANT UPDATE por coluna; `moderation_status` só `sc_admin`; função pública
  SECURITY DEFINER sem dados do autor; `author_user_id = NULL` em
  `app.anonimizar_minha_conta` (por migração nova, não editando a 0073 já
  aplicada); entrada em `CONSTRUTORES`. Depende de Q-11602, Q-11605, Q-11613.

## T-11602 — Contrato dos pensamentos [pendente]

- Refs: US-11601, AC-11601, AC-11602, AC-11603, AC-11604
- Arquivos: packages/contracts/src/index.ts, packages/contracts/src/rotas.ts, packages/contracts/src/permissoes.ts, packages/contracts/src/fundacao.test.ts
- Cria: `packages/contracts/src/pensamentos.ts`, `packages/contracts/src/pensamentos.onp.test.ts`
- Notas: esquemas público, do painel, de criação e de edição; limites (Q-11604,
  Q-11609); permissão nova `feed.publicar` se a Q-11603 aprovar.

## T-11603 — API do autor: publicar, editar e remover [pendente]

- Refs: US-11601, US-11602, US-11606, AC-11601, AC-11602, AC-11603, AC-11604, AC-11605, AC-11606, AC-11614, AC-11615
- Arquivos: apps/api/src/app.ts, apps/api/src/core/equipe-da-loja.ts
- Cria: `apps/api/src/modules/pensamentos/pensamentos.routes.ts`, `apps/api/src/modules/pensamentos/pensamentos.usecase.ts`, `apps/api/tests/pensamentos.onp.test.ts`
- Notas: regra da permissão nova antes de `/^\/feed(\/|$)/`; foto por
  `conferirMidia` e `armazenamento-de-midia.ts` com chave gerada no servidor;
  normalização do texto; teste 403 para funcionário sem permissão e 404 para
  outra loja. Depende de Q-11606.

## T-11604 — Leitura pública: feed e link do pensamento [pendente]

- Refs: US-11603, US-11605, AC-11607, AC-11609, AC-11613, AC-11617
- Arquivos: apps/api/src/modules/feed/feed.routes.ts, apps/api/src/modules/feed/feed.usecase.ts, packages/contracts/src/feed.ts, apps/web/src/server/feed.ts
- Cria: `apps/api/tests/pensamentos.onp.test.ts`
- Notas: consulta separada `GET /v1/feed/pensamentos` sem mudar
  `produtosDoFeed`; 404 uniforme no link. Depende de Q-11611, Q-11612, Q-11614.

## T-11605 — Cartão do pensamento no feed [pendente]

- Refs: US-11601, US-11603, AC-11601, AC-11604, AC-11609, AC-11615, AC-11617
- Arquivos: apps/web/src/features/feed/FeedDePosts.tsx
- Cria: `apps/web/src/features/feed/PostDePensamento.tsx`, `apps/web/tests/pensamentos-feed.onp.test.tsx`
- Notas: composição do Stitch sem dados do mockup (P-105); sem preço nem
  sacola; texto como texto comum; faixa própria (Q-11612).

## T-11606 — Painel: escrever, editar e remover pensamentos [pendente]

- Refs: US-11601, US-11602, AC-11602, AC-11603, AC-11604, AC-11606, AC-11608
- Arquivos: apps/web/src/features/painel/secoes-do-painel.ts, apps/web/src/lib/permissoes.ts
- Cria: `apps/web/src/features/pensamentos-painel/TelaDosPensamentos.tsx`, `apps/web/src/app/(painel)/painel/pensamentos/page.tsx`, `apps/web/tests/pensamentos-painel.onp.test.tsx`
- Notas: situação "no ar", "removido" e "ocultado pela moderação" (sem
  republicar); item de menu com a permissão de publicar.

## T-11607 — Curtir, salvar e comentar pensamentos (condicional) [pendente]

- Refs: US-11604, AC-11610, AC-11611, AC-11612
- Arquivos: packages/database/prisma/schema.prisma, packages/contracts/src/social.ts, apps/api/src/modules/social/social.usecase.ts, apps/api/src/modules/social/social.routes.ts, apps/api/src/core/resumo-social.ts, apps/web/src/features/feed/GavetaDeComentarios.tsx
- Cria: `packages/database/migrations/00NN_interacoes_dos_pensamentos.sql`, `apps/web/src/features/feed/PostDePensamento.tsx`, `apps/web/tests/pensamentos-feed.onp.test.tsx`
- Notas: só se a Q-11608 aprovar. `comments.post_id` com CHECK de alvo único,
  nova assinatura de `app.pode_comentar`, `app.post_likes`, `app.saved_posts`,
  limpeza na exclusão de conta e entradas na varredura de isolamento.

## T-11608 — Denúncia e moderação pela plataforma [pendente]

- Refs: US-11606, AC-11608, AC-11616
- Arquivos: apps/api/src/modules/admin/admin.routes.ts, docs/moderacao.md
- Cria: `packages/database/migrations/00NN_denuncias_dos_pensamentos.sql`, `apps/web/src/features/admin/ModeracaoDosPensamentos.tsx`, `apps/api/tests/pensamentos.onp.test.ts`
- Notas: denúncia única por pessoa e post; fila do admin; ocultar altera só
  `moderation_status`; atualizar a documentação de moderação. Depende de Q-11607.

## T-11609 — Link próprio com prévia ao compartilhar (condicional) [pendente]

- Refs: US-11605, AC-11613, AC-11617
- Arquivos: apps/web/src/server/endereco-do-site.ts
- Cria: `apps/web/src/app/(loja)/loja/[slug]/pensamento/[id]/page.tsx`, `apps/web/src/app/(loja)/loja/[slug]/pensamento/[id]/opengraph-image.tsx`, `apps/web/tests/pensamentos-feed.onp.test.tsx`
- Notas: só se a Q-11610 aprovar; prévia com a loja e o texto truncado, sem
  dados do autor.
