# Design: Posts de pensamento e texto livre no feed

> feature: decidir-posts-de-pensamento · card #116 · 06/11/2026

Documento de proposta. Nada aqui está aprovado: a função inteira depende da
pergunta Q-11601 (fazer ou não) e das demais perguntas da spec. Os caminhos
são relativos a `/Users/stargrupo/Projetos/SC`. Arquivos marcados **(a
criar)** ainda não existem.

## 1. Estado atual (evidências)

| Fato                                                                                                                        | Evidência                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Todo post do feed é de produto: `feed_posts.product_id` é NOT NULL e o tipo só aceita `PRODUTO_NOVO` ou `PRODUTO_PUBLICADO` | `packages/database/migrations/0050_feed_favoritos_e_recentes.sql` (`feed_posts_kind_ck`)                             |
| Um post por produto, criado por gatilho a partir de `products.publish_to_feed`                                              | mesma migração (`feed_posts_produto_uk`, `app.publicar_produto_no_feed`); modelo `FeedPost` no schema.prisma         |
| A loja pode sair do feed (`stores.feed_visible`) e publicar novos produtos sozinha (`stores.feed_auto_publish_new`)         | mesma migração                                                                                                       |
| O feed de produtos pagina por página (`pagina`, `porPagina`, `total`) e ordena por relevância, distância, preço ou recentes | `apps/api/src/modules/feed/feed.usecase.ts` (`produtosDoFeed`)                                                       |
| Curtir e comentar só valem para produto ou loja                                                                             | `packages/contracts/src/social.ts` (`ALVOS_DO_COMENTARIO`)                                                           |
| Comentário: até 500 caracteres, limite de envios, bloqueio, aprovação pela loja e denúncia                                  | `social.ts` (`LIMITES_DOS_COMENTARIOS`); `0062_curtidas_e_comentarios.sql` (`app.pode_comentar`)                     |
| A leitura pública de comentários expõe só um nome curto do autor                                                            | `0062_curtidas_e_comentarios.sql` (`app.comentarios_aprovados`)                                                      |
| Stories exigem foto ou vídeo e expiram em 24 h                                                                              | `packages/database/migrations/0060_midia_do_produto_e_stories.sql`                                                   |
| Não existe "salvar post": só produtos e lojas favoritos                                                                     | `0061_favoritos_de_produtos.sql`, `0050_feed_favoritos_e_recentes.sql`                                               |
| A permissão `feed` da equipe hoje cuida da configuração da loja no feed; a rota `/feed` já está mapeada para ela            | `packages/contracts/src/permissoes.ts` (`podeNaLoja`); `apps/api/src/core/equipe-da-loja.ts` (`PERMISSOES_POR_ROTA`) |
| O RLS da equipe não confere permissões, só o vínculo ativo (dono ou funcionário)                                            | `0041_equipe_e_quem_tem_vinculo_ativo.sql` (`app.is_store_staff`)                                                    |
| Tabela nova de loja sem entrada na varredura de isolamento derruba a suíte                                                  | `apps/api/tests/isolamento-varredura.test.ts` (`CONSTRUTORES`)                                                       |
| Limitador genérico só tem escopo por conta ou por origem                                                                    | `apps/api/src/core/limite.ts` (`EscopoDoLimite`)                                                                     |
| Conferência de foto pelos bytes e armazenamento de mídia                                                                    | `apps/api/src/core/conferencia-de-midia.ts` (`conferirMidia`); `apps/api/src/core/armazenamento-de-midia.ts`         |
| A exclusão de conta apaga curtidas, comentários e denúncias da pessoa                                                       | `0073_aceites_legais.sql` (`app.anonimizar_minha_conta`)                                                             |
| Post do feed compartilha com `navigator.share`; o link público do produto vem de `enderecoDoProduto`                        | `apps/web/src/features/feed/Post.tsx` (`compartilhar`); `apps/web/src/server/endereco-do-site.ts`                    |
| A documentação de moderação diz que o post do feed não tem texto nem mídia próprios                                         | `docs/moderacao.md`                                                                                                  |
| Não há entidade de post, pensamento, blog ou artigo no código                                                               | busca no repositório (05/11/2026)                                                                                    |

Referência visual: `.spec/features/stitch-planejamento/design.md` (linha
"Post de dica em texto", situação "A decidir", card #116). Composição: loja
autora com logo, foto opcional, texto, ✦ curtir, ★ salvar e "Ver no
catálogo".

## 2. Fronteira com o blog (#115)

Combinado por mensagem entre os cards em 05/11/2026:

- **#116 (esta spec)**: post curto, sem título, que vive dentro do feed.
- **#115 (blog)**: artigo longo com título, capa, corpo formatado e página
  própria de leitura; no feed aparece no máximo como cartão que leva ao
  artigo.
- Nenhuma das duas specs depende da outra. As duas recomendam **não alterar
  o `FeedPost`** e entrar no feed por fonte própria (Q-11614 é a pergunta
  conjunta).

## 3. Alternativas de dados

| Opção                                                                | Prós                                                                    | Contras                                                                                                                                  | Recomendação |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| A. Tabela nova `app.text_posts`                                      | Não toca no feed atual, no gatilho nem no índice único; regras próprias | O feed passa a ter duas fontes                                                                                                           | **Sim**      |
| B. Afrouxar `feed_posts` (`product_id` opcional e tipo `PENSAMENTO`) | Uma fonte só no feed                                                    | Mexe em gatilho, índice único `(store_id, product_id)`, `app.feed_produtos` e no contrato do feed; risco de regressão no que já funciona | Não          |
| C. Story de texto                                                    | Reaproveita stories                                                     | Story expira em 24 h e exige mídia (colunas NOT NULL); conflito com a ideia de post permanente                                           | Não          |

## 4. Modelo proposto (opção A)

Tabela `app.text_posts` (a criar, numa migração nova depois da última
existente):

| Coluna                                                   | Tipo        | Regra                                                                                                           |
| -------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `id`                                                     | uuid        | PK                                                                                                              |
| `store_id`                                               | uuid        | NOT NULL, FK `stores`; imutável                                                                                 |
| `author_user_id`                                         | uuid        | NULL permitido (vira NULL na exclusão de conta); fixado pelo gatilho com `app.current_user_id()`; nunca público |
| `body`                                                   | text        | CHECK `char_length(btrim(body)) BETWEEN 1 AND 1000` (limite depende de Q-11604)                                 |
| `media_url`, `storage_key`, `content_type`, `size_bytes` | —           | opcionais e juntos (todos nulos ou todos preenchidos); chave gerada no servidor                                 |
| `product_id`                                             | uuid        | opcional; gatilho confere que é da mesma loja (não há UNIQUE `(id, store_id)` em products para FK composta)     |
| `status`                                                 | text        | `PUBLICADO` ou `REMOVIDO` (controlado pela loja)                                                                |
| `moderation_status`                                      | text        | `LIVRE` ou `OCULTO` (só `sc_admin` altera)                                                                      |
| `published_at`                                           | timestamptz | fixado no INSERT; não muda na edição                                                                            |
| `edited_at`                                              | timestamptz | preenchido quando o texto muda (marca "editado")                                                                |
| `deleted_at`                                             | timestamptz | remoção lógica; expurgo conforme Q-11613                                                                        |
| `created_at`                                             | timestamptz | padrão                                                                                                          |

Índice para a leitura pública: `(published_at DESC, id)` filtrando
`status = 'PUBLICADO' AND moderation_status = 'LIVRE' AND deleted_at IS NULL`.

## 5. Segurança e dados (resultado da revisão adversarial)

1. **Autor público é a loja.** A função pública de leitura devolve só a loja
   (nome, apelido, logo), o texto, a foto, o produto vinculado e as datas. O
   `author_user_id` só aparece para a equipe da loja e para o admin; nunca
   sai na lista pública nem na prévia do link (AC-11617).
2. **Exclusão de conta (LGPD).** O post é da loja e continua; a rotina
   `app.anonimizar_minha_conta` passa a fazer `author_user_id = NULL`.
   Retenção de removidos e da mídia é a Q-11613.
3. **Permissão própria para publicar.** Proposta: `feed.publicar` nova em
   `permissoes.ts`, com regra em `PERMISSOES_POR_ROTA` **antes** da regra
   `/^\/feed(\/|$)/`, para não dar o poder de publicar a quem hoje só
   configura o feed (Q-11603). Como o RLS (`app.is_store_staff`) não confere
   permissão, um teste de rota precisa provar a resposta 403 para funcionário
   sem a permissão (AC-11605).
4. **Gatilho de INSERT.** Ele fixa o autor (`current_user_id()`), a situação
   inicial (`PUBLICADO`, `LIVRE`), `published_at` e o limite diário por loja.
   O limite é no banco, no estilo de `app.pode_comentar`, porque `limite.ts`
   só conta por conta ou origem (AC-11614).
5. **UPDATE só nas colunas editáveis.** `REVOKE UPDATE` geral e `GRANT
UPDATE (body, media_*, product_id, edited_at, status, deleted_at)` para o
   papel da aplicação. `store_id`, `author_user_id`, `published_at` e
   `moderation_status` não mudam pela loja.
6. **Moderação separada.** `moderation_status` só é alterado por `sc_admin`.
   A loja não republica o que foi ocultado (AC-11608). Denúncias de
   pensamento vão para a fila do admin (AC-11616), no modelo de
   `comment_reports` (único por pessoa e post).
7. **Produto vinculado.** Um gatilho no INSERT e no UPDATE confere que o
   produto é da mesma loja. A leitura pública só devolve o produto se ele
   estiver publicado e não excluído (padrão de `app.loja_do_produto_publico`);
   caso contrário, o botão "Ver no catálogo" some (AC-11604).
8. **Mídia.** O cliente nunca envia a chave de armazenamento. O servidor
   confere os bytes (`conferirMidia`), gera a chave com o prefixo da loja e
   grava; a limpeza reaproveita `armazenamento-de-midia.ts` (AC-11603).
9. **Link e prévia.** A busca pública recebe apelido da loja e id juntos e
   responde o mesmo 404 para post inexistente, removido, ocultado ou de outra
   loja (AC-11607). A prévia usa o nome da loja e o texto truncado, sem nada
   do autor (AC-11613).
10. **Texto.** Normalização NFC, remoção de caracteres de controle e de
    direção (bidi), exibição como texto comum (sem `dangerouslySetInnerHTML`)
    e links não clicáveis até a Q-11604 decidir (AC-11615).
11. **Isolamento.** Políticas no padrão das tabelas de loja (`*_staff_*` com
    `app.current_store_id()`, `*_require_ctx` restritiva e `*_admin_all`),
    entrada em `CONSTRUTORES` da varredura e teste de que a função pública não
    devolve posts de loja com feed desligado, inativa, aguardando aprovação,
    removidos ou ocultados (AC-11609).

## 6. Contrato e API (proposta)

- `packages/contracts/src/pensamentos.ts` **(a criar)**: esquemas do
  pensamento público, do pensamento no painel, do novo pensamento e da
  edição; constantes de limite; rotas. Exportado em
  `packages/contracts/src/index.ts` e catalogado em `rotas.ts`.
- Rotas da loja (equipe, permissão de publicar):
  `POST /v1/lojas/:apelido/pensamentos`, `PATCH …/pensamentos/:id`,
  `DELETE …/pensamentos/:id`, `GET …/pensamentos` (painel). O caminho exato
  fica no plano de implementação; ele não pode cair na regra `/feed` sem
  passar pela permissão nova.
- Leitura pública: `GET /v1/feed/pensamentos` (lista paginada por
  `published_at`) e `GET /v1/lojas/:apelido/pensamentos/:id` (link).
- Módulo `apps/api/src/modules/pensamentos/` **(a criar)**, registrado em
  `apps/api/src/app.ts`.

## 7. Feed

`produtosDoFeed` pagina por página com total e ordena por preço ou distância,
então não dá para intercalar por data sem quebrar o contrato. Proposta: os
pensamentos chegam por **consulta separada** e aparecem numa **faixa
própria** no /explorar (por exemplo "Novidades das lojas"). Misturar com os
produtos só na ordenação "recentes" é a alternativa (Q-11612).

## 8. Interações (só se a Q-11608 aprovar)

Ampliar `ALVOS_DO_COMENTARIO` não basta:

- `app.comments` ganha `post_id` com CHECK de alvo único (produto, loja ou
  pensamento);
- `app.pode_comentar` ganha nova assinatura;
- curtidas pedem `app.post_likes`; salvar pede `app.saved_posts`;
- mudam também `apps/api/src/modules/social/social.usecase.ts` e
  `apps/api/src/core/resumo-social.ts`;
- `app.anonimizar_minha_conta` apaga as curtidas e os salvos da pessoa.

## 9. Interface (proposta)

- Feed: cartão `PostDePensamento` **(a criar)** em `apps/web/src/features/feed/`,
  na composição do Stitch, sem preço nem sacola; ✦, ★ e comentar reaproveitam
  os componentes do `Post.tsx` e da `GavetaDeComentarios.tsx` se aprovados.
- Painel: página `/painel/pensamentos` **(a criar)** com escrever, editar,
  remover e ver a situação ("no ar", "removido", "ocultado pela moderação");
  item no menu em `apps/web/src/features/painel/secoes-do-painel.ts` com a
  permissão de publicar.
- Admin: fila de denúncias e botão de ocultar em `apps/web/src/features/admin/`.
- Link próprio (só se a Q-11610 aprovar):
  `apps/web/src/app/(loja)/loja/[slug]/pensamento/[id]/page.tsx` **(a criar)**.

## 10. Testes e prova

- Nomes `*.onp.test.ts(x)` com `[CA-n] @spec:AC-116xx` no título.
- Web (rodam no `onp-spec verify`): `apps/web/tests/pensamentos-feed.onp.test.tsx`
  e `apps/web/tests/pensamentos-painel.onp.test.tsx` **(a criar)**, para
  AC-11601, AC-11602, AC-11604, AC-11606, AC-11610 a AC-11613, AC-11615 e AC-11617.
- Contrato (unit): `packages/contracts/src/pensamentos.onp.test.ts`
  **(a criar)**, para os limites de AC-11602.
- API, banco e RLS: `apps/api/tests/pensamentos.onp.test.ts` **(a criar)**,
  para AC-11603, AC-11605, AC-11607 a AC-11609, AC-11614, AC-11616 e AC-11617.
  O motor lê esse arquivo (`apps/**`), mas o `verify` hoje só roda os
  projetos web e unit. Enquanto o gerente não incluir o projeto de API no
  comando de verificação, esses critérios ficam sem prova automática
  (ASM-11607).
- Regressão: a suíte atual do feed, social e isolamento continua passando
  (`curtidas-e-comentarios.test.ts`, `feed-e-tema.test.ts`,
  `isolamento-varredura.test.ts`).

## 11. Riscos

| Risco                              | Mitigação                                                               |
| ---------------------------------- | ----------------------------------------------------------------------- |
| Vazamento entre lojas ou do autor  | Itens 1, 5, 9 e 11 da seção 5; varredura de isolamento e testes 403/404 |
| Feed virar spam                    | Limite diário por loja, denúncia e moderação da plataforma              |
| Regressão no feed de produtos      | Opção A não toca em `feed_posts`; consulta separada                     |
| Função entrar sem decisão          | Q-11601 aberta; P-107; tarefas `[pendente]`                             |
| Conteúdo do mockup virar dado real | P-105; a tela usa os pensamentos reais das lojas                        |
