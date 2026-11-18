# Design: Blog com artigos, dicas e publicações editoriais

> feature: decidir-blog · card #115 · 06/11/2026

Documento de proposta. Nada aqui está aprovado: a decisão de fazer o blog,
e de que forma, está nas perguntas Q-11501 a Q-11511 da spec. Caminhos são
relativos a `/Users/stargrupo/Projetos/SC`. O que ainda não existe está
marcado como **(a criar)**.

## 1. Origem e fronteira

- Pedido do usuário: um card "A decidir" para cada função do Stitch que o
  SimpleClick ainda não tem. O Stitch mostra "Dicas dos Especialistas" no
  início (celular e computador) e "Publicações & Dicas" na vitrine
  (computador), com dicas de uma loja de autopeças de exemplo. Isso é só
  referência visual (P-105); nenhum texto, número ou imagem do export entra
  no produto (P-103).
- Fronteira acordada com o #116 (05/11/2026): o **#115** cuida do artigo
  editorial, com título, corpo longo e página de leitura com endereço
  próprio. O **#116** cuida do post curto, sem título, que vive dentro do
  feed. Se os dois forem aprovados, o artigo aparece no feed só como
  chamada (cartão com link), sem criar uma segunda entidade (Q-11508).
  Nenhuma das duas specs depende da outra.
- Recomendação conjunta com o #116 para a Q-11508 (06/11/2026, ainda sem
  decisão): **não alterar `FeedPost`**. A consulta `app.feed_produtos`
  pagina por deslocamento com total, ordena por preço e distância, e o
  gatilho e o índice único dependem de `product_id`. Por isso, artigos e
  posts de texto entram no feed como uma **fonte separada** (faixa ou
  consulta própria), lendo das próprias tabelas. Afrouxar `FeedPost`
  (`productId` opcional ou `kind` novo) fica como alternativa.

## 2. Estado atual (evidência)

| Fato                                                                                                                                 | Evidência                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Não existe artigo, blog nem conteúdo editorial (modelo, rota ou contrato)                                                            | busca em `apps/` e `packages/`; modelos em `packages/database/prisma/schema.prisma`                                                                  |
| O post do feed é um produto: `FeedPost` exige `productId` e `kind` só aceita PRODUTO_NOVO ou PRODUTO_PUBLICADO                       | `model FeedPost` em `packages/database/prisma/schema.prisma`; `packages/database/migrations/0050_feed_favoritos_e_recentes.sql`                      |
| O produto entra no feed pela marca `publishToFeed`; a loja tem `feedVisible`                                                         | `packages/database/prisma/schema.prisma`                                                                                                             |
| Comentários moderados pela loja, com situação PENDENTE, APROVADO ou RECUSADO e alvo produto ou loja                                  | `SITUACOES_DO_COMENTARIO`, `ALVOS_DO_COMENTARIO` em `packages/contracts/src/social.ts`                                                               |
| Permissões da loja (dono e equipe); a equipe não tem `feed`, `configuracoes` nem `personalizacao`                                    | `PERMISSOES_DA_LOJA`, `MATRIZ_DE_PERMISSOES` em `packages/contracts/src/permissoes.ts`                                                               |
| Permissões da administração: só `admin.lojas`, `admin.limites` e `admin.auditoria`; a recusa por permissão só conhece as da loja     | `PERMISSOES_DA_PLATAFORMA`, `esquemaDaRecusaPorPermissao` em `packages/contracts/src/permissoes.ts`                                                  |
| Isolamento por loja no banco: leitura pública só do que está publicado e não excluído, escrita só da própria loja e cinto restritivo | políticas `products_*` em `packages/database/migrations/0004_catalogo.sql`                                                                           |
| `is_store_staff()` aceita dono e equipe; a diferença entre os dois fica na aplicação                                                 | `packages/database/migrations/0041_equipe_e_quem_tem_vinculo_ativo.sql`                                                                              |
| Leitura entre lojas passa por função do banco com lista fechada de campos                                                            | `app.feed_produtos` (0050), `app.produto_favoritavel` em `packages/database/migrations/0061_favoritos_de_produtos.sql`                               |
| Liga e desliga por loja existe, mas toda chave nasce ligada                                                                          | `CHAVES_DE_FUNCIONALIDADE`, `funcionalidadeLigada` em `packages/core/src/funcionalidades.ts`                                                         |
| Mídia guardada por pasta fechada e amarrada à loja pela URL                                                                          | `PastaDaMidia`, `chaveDaMidiaPelaUrl` em `apps/api/src/core/armazenamento-de-midia.ts`                                                               |
| Conferência de bytes: `conferirMidia` aceita foto e vídeo; `formatoDaFoto` só foto                                                   | `apps/api/src/core/conferencia-de-midia.ts`                                                                                                          |
| Foto de produto guarda texto alternativo de até 160 caracteres                                                                       | `ProductImage.altText` em `packages/database/prisma/schema.prisma`                                                                                   |
| Texto longo hoje é lido em blocos simples (texto ou lista), sem HTML                                                                 | `Bloco`, `SecaoLegal` em `apps/web/src/features/legal/PaginaLegal.tsx`                                                                               |
| O único HTML injetado em `apps/web/src` é o JSON-LD, que tem escape próprio                                                          | `DadosEstruturados` em `apps/web/src/lib/dados-estruturados.tsx`                                                                                     |
| Nenhuma biblioteca de markdown, editor rico ou sanitização de HTML instalada                                                         | `package.json` da raiz, de `apps/*` e de `packages/*`                                                                                                |
| Mapas do site: o geral lista páginas fixas; cada loja tem o seu                                                                      | `apps/web/src/app/sitemap.ts`; `apps/web/src/app/(loja)/loja/[slug]/sitemap.xml/route.ts`                                                            |
| Prévia da loja já existe e não é indexada                                                                                            | `apps/web/src/app/(loja)/loja/[slug]/previa/[parte]/page.tsx`                                                                                        |
| Páginas públicas usam cache com renovação                                                                                            | `apps/web/src/server/cache.ts`, `apps/web/src/server/renovar-vitrine.ts`, `apps/web/src/app/api/revalidate/route.ts`                                 |
| Toda página nova precisa entrar no manifesto de rotas, que é conferido por teste                                                     | `MANIFESTO_DE_ROTAS` em `apps/web/src/lib/routes.ts`; `apps/web/tests/rotas-antigas.test.ts`                                                         |
| Área nova do painel precisa de item no menu e da permissão do caminho                                                                | `secoesDoPainel` em `apps/web/src/features/painel/secoes-do-painel.ts`; `PERMISSAO_DA_AREA` em `apps/web/src/lib/permissoes.ts`                      |
| Trilhas de auditoria: da loja e da plataforma                                                                                        | `packages/database/migrations/0006_impressao_e_auditoria.sql`; `app.audit_platform` em `packages/database/migrations/0051_limites_da_plataforma.sql` |
| Migrações são SQL numeradas (a última é a 0073) e o Prisma só espelha; há teste de que o schema cobre o banco                        | `packages/database/migrations/`; `packages/database/tests/esquema-cobre-o-banco.test.ts`                                                             |
| O motor ONP lê `*.onp.test.ts(x)` e `e2e/**/*.onp.spec.ts`, mas a verificação só roda os projetos vitest `web` e `unit`              | `onpspec.config.json`; projetos em `vitest.config.ts`                                                                                                |

## 3. Alternativas de escopo (Q-11502)

| Alternativa            | Como fica                                                             | A favor                                                                                     | Contra                                                                                      |
| ---------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A. Blog de cada loja   | Cada loja tem a sua lista e os seus artigos; autoria é o nome da loja | Combina com o Stitch e com o produto (a loja é o centro); reaproveita o isolamento por loja | Mais telas no painel; risco de conteúdo fraco ou abusivo sem moderação da plataforma        |
| B. Blog do SimpleClick | Só a administração publica, para ensinar a criar e administrar lojas  | Pouco volume, conteúdo controlado; ajuda a captar donos de loja                             | Exige permissão nova da administração e tabela própria; não atende ao "Publicações & Dicas" |
| C. Os dois             | A e B juntos, com modelos separados                                   | Atende os dois públicos                                                                     | Maior esforço; duas filas de moderação                                                      |

Proposta padrão para revisão (ASM-11502): **A**, com **B** como etapa
seguinte se a Q-11502 pedir. Em B ou C, os artigos do SimpleClick ficam em
tabela própria; **nunca** como artigo de loja sem loja, porque isso
quebraria o cinto restritivo do banco.

## 4. Modelo de dados proposto (a criar)

Migração SQL em `packages/database/migrations/` com o **próximo número livre
na hora da implementação** (outros cards "A decidir" também podem querer o
mesmo número), com espelho em `packages/database/prisma/schema.prisma`.

**Artigo da loja** (`app.store_articles`, nome provisório):

- `id`, `store_id` (obrigatório), `slug` (formato `^[a-z0-9]+(-[a-z0-9]+)*$`,
  único por loja), `title`, `summary`;
- `status`: RASCUNHO, PUBLICADO ou RETIRADO (texto com CHECK, como em
  `comments`), `published_at`, `retired_at`;
- capa: `cover_url`, `cover_storage_key`, `cover_alt` (obrigatório quando
  há capa, limite de tamanho como `ProductImage.altText`);
- `body`: JSON validado na API por um contrato novo (seção 5.4);
- `created_by` só para a trilha (a resposta pública mostra o nome da loja,
  ASM-11503); `created_at`, `updated_at`, `deleted_at`.

**Produtos indicados** (`app.store_article_products`): `store_id`,
`article_id`, `product_id`, com chaves estrangeiras compostas
`(store_id, article_id)` e `(store_id, product_id)`. Assim o banco recusa
produto de outra loja (AC-11515).

**Artigo do SimpleClick** (só em B ou C): tabela própria, sem `store_id`,
escrita só pela credencial da administração, com registro em
`app.audit_platform`.

**Capa:** imagem guardada pelo armazenamento de mídia. Ou uma pasta nova
`artigos`, ou a pasta `loja` existente; isso fica para a implementação
(`PastaDaMidia` é uma união fechada). O que fazer com a imagem ao trocar a
capa ou excluir o artigo está na Q-11510.

## 5. Segurança e dados

### 5.1 Isolamento por loja (AC-11502, AC-11511)

RLS no mesmo padrão das políticas `products_*` de
`packages/database/migrations/0004_catalogo.sql`:

- leitura pública (papéis PUBLIC e CUSTOMER) só de `status = 'PUBLICADO'` e
  `deleted_at IS NULL`, dentro do contexto da loja;
- leitura e escrita pela loja com
  `store_id = current_store_id() AND is_store_staff()` em USING **e** em WITH
  CHECK, o que impede mover o artigo para outra loja;
- cinto `*_require_ctx` restritivo para `sc_app`;
- `*_admin_all` explícito para `sc_admin`.

### 5.2 Descoberta entre lojas (AC-11504, AC-11506)

Início e feed leem artigos de várias lojas de uma vez. Isso passa por uma
função do banco **SECURITY DEFINER**, como `app.feed_produtos`:

- `search_path` fixo, `REVOKE` de PUBLIC e `GRANT` só para `sc_app`;
- devolve só artigos publicados de loja ativa e não excluída;
- lista fechada de campos (sem corpo de rascunho e sem quem escreveu).

### 5.3 Dono e equipe (AC-11510)

A barreira entre dono e equipe fica na aplicação (ASM-11505). Proposta: uma
permissão nova em `PERMISSOES_DA_LOJA`, com rótulo em
`ROTULOS_DAS_PERMISSOES`. A Q-11503 decide se ela entra na matriz da
equipe ou se fica só com o dono, como `feed`. Toda rota de escrita responde
403 `sem_permissao` (`MENSAGEM_DE_SEM_PERMISSAO`). O menu do painel esconde
o item pelo caminho em `PERMISSAO_DA_AREA`.

### 5.4 Corpo seguro (AC-11512, AC-11513)

- O corpo usa um contrato **novo** em `packages/contracts`, com um
  `z.strictObject` por tipo de bloco: parágrafo, intertítulo, lista, imagem
  com alt obrigatório e link. O tipo `Bloco` de `PaginaLegal` não serve
  (não tem imagem, link nem intertítulo), e reaproveitá-lo obrigaria a mexer
  nas páginas legais.
- Limites: tamanho de cada bloco, número de blocos e tamanho de URL.
- Links aceitos: `http`, `https` ou caminho interno começando com `/`, como
  `Story.link`. O teste é feito depois de remover espaços e decodificar,
  para pegar `javascript:`, `data:` e `vbscript:` disfarçados.
- Links externos saem com `rel="noopener noreferrer nofollow ugc"`.
- O texto é renderizado como texto pelo React. Nenhum
  `dangerouslySetInnerHTML` novo fora de `apps/web/src/lib/dados-estruturados.tsx`.
- O JSON-LD do artigo usa obrigatoriamente `DadosEstruturados`. O teste
  inclui título e resumo com aspas, sinais de menor e maior e fechamento de
  script, também nas meta de compartilhamento.

### 5.5 Capa (AC-11514)

- Só imagem: `formatoDaFoto` não pode ser nulo, e SVG e vídeo são recusados.
- A URL é validada por `chaveDaMidiaPelaUrl(url, lojaId)` para a loja do
  artigo; URL externa ou de outra loja é recusada.
- O alt é obrigatório e tem limite de tamanho.
- A medida da capa entra em `apps/web/src/lib/espacos-de-imagem.ts`.

### 5.6 Prévia do rascunho (AC-11509)

- Exige sessão da própria loja.
- Responde com `robots noindex, nofollow` e `Cache-Control: private,
no-store`.
- A URL pública do rascunho dá o mesmo "não encontrado" de um artigo
  inexistente, com a mesma mensagem e o mesmo caminho de código.

### 5.7 Produto indicado (AC-11515, AC-11516)

- Na escrita, as chaves compostas recusam produto de outra loja.
- Na leitura, o cartão só aparece quando a mesma condição de
  `app.produto_favoritavel` é verdadeira (produto publicado, não excluído,
  de loja ativa).
- Quando a condição falha, o cartão some sem dizer se o produto existe.

### 5.8 LGPD, auditoria e limites

- Autoria pública é o nome da loja. O id da pessoa fica só na trilha de
  auditoria da loja (`0006_impressao_e_auditoria.sql`) e nunca no contrato
  público.
- Publicar, retirar, editar e apagar gravam na trilha (AC-11508).
- Exclusão da loja e destino das imagens: Q-11510. Hoje a anonimização de
  conta recusa dono de loja.
- Limites de quantidade de artigos e de envio de imagens por loja, nos
  moldes de `LIMITES_DE_MIDIA_PADRAO` (`packages/contracts/src/midia.ts`)
  e dos limites da plataforma (`0051`): Q-11511.
- Comentários, se entrarem (Q-11505): mesma moderação de
  `packages/contracts/src/social.ts` e permissão `moderar_comentarios`.
  Artigo retirado não aceita nem lista comentários.

## 6. Rotas e telas propostas (a criar)

| Rota                                      | Quem vê                     | Observação                                               |
| ----------------------------------------- | --------------------------- | -------------------------------------------------------- |
| `/loja/[slug]/artigos`                    | público                     | lista paginada (AC-11505)                                |
| `/loja/[slug]/artigos/[artigo]`           | público                     | leitura, metadados, JSON-LD e imagem de compartilhamento |
| `/painel/artigos`, `/painel/artigos/[id]` | dono e equipe com permissão | lista, edição, prévia, publicar e retirar                |
| `/artigos`, `/artigos/[artigo]`           | público (só em B ou C)      | blog do SimpleClick                                      |
| `/admin/artigos`                          | administração com permissão | só em B ou C (Q-11504)                                   |

- O endereço do artigo nunca coincide com as páginas que já existem em
  `/loja/[slug]/` (`cardapio`, `sobre`, `produto`, `carrinho`, `checkout`,
  `pedido`, `tv`, `previa`), porque fica dentro de `artigos/` (AC-11517).
- Toda página nova entra em `MANIFESTO_DE_ROTAS`, e os testes que usam o
  manifesto são atualizados.
- As telas não existem no Stitch (ASM-11507). Elas usam a base visual do
  #104, e o layout de leitura pode seguir o de `PaginaLegal` (coluna
  estreita).

## 7. Cache e renovação (AC-11503, AC-11508)

Publicar, editar, retirar e apagar disparam a renovação de:

- página do artigo;
- lista da loja;
- mapa do site da loja;
- mapa do site geral, se houver blog do SimpleClick;
- blocos de descoberta.

A renovação usa o mecanismo de `apps/web/src/server/renovar-vitrine.ts` e
`apps/web/src/app/api/revalidate/route.ts`. A suspensão da loja também
renova (AC-11504). O critério só se considera cumprido **depois** dessa
renovação. O feed revalida a cada hora, então ele também precisa da
renovação explícita.

## 8. Donos de arquivo (implementação futura)

A divisão do #103 (seção 7 de
`.spec/features/stitch-planejamento/design.md`) vale primeiro. O #115 não se
declara dono de nenhum arquivo compartilhado.

| Arquivo ou pasta                                                                                                                      | Dono ou fila                                           |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `apps/web/src/features/painel/secoes-do-painel.ts` e qualquer pasta nova `apps/web/src/features/painel-*`                             | #112 (padrão `features/painel*`); o #115 entra na fila |
| `apps/web/src/features/feed/*` (chamada do artigo no feed)                                                                            | #106, depois da Q-11508 com o #116                     |
| `apps/web/src/app/(loja)/loja/[slug]/TelaDaLoja.tsx` (bloco de artigos na vitrine)                                                    | #107                                                   |
| `apps/web/src/app/(loja)/loja/[slug]/layout.tsx`, navegação e a rota `sitemap.xml` da loja                                            | #105 e #107                                            |
| Pasta nova `apps/web/src/app/(loja)/loja/[slug]/artigos/` **(a criar)**                                                               | #115, se aprovado, depois de #105 e #107               |
| `packages/database/migrations/`, `packages/database/prisma/schema.prisma`                                                             | sem dono: Q-11509                                      |
| `packages/contracts/src/permissoes.ts`, `packages/contracts/src/index.ts`, `packages/contracts/src/rotas.ts`                          | sem dono: Q-11509                                      |
| `packages/core/src/funcionalidades.ts`, `apps/web/src/lib/routes.ts`, `apps/web/src/lib/permissoes.ts`, `apps/web/src/app/sitemap.ts` | sem dono: Q-11509                                      |

O gerente foi avisado em 05/11/2026 para ampliar a fila do #103. A execução
segue o #103: uma tarefa após a outra, na pasta principal, sem worktrees.

## 9. Portão da decisão e liga/desliga (AC-11506)

São duas coisas diferentes:

1. **Portão de produto** (P-107): enquanto a Q-11501 estiver aberta, não
   existe código do blog. Nenhuma tarefa começa e nenhum bloco aparece.
2. **Liga/desliga por loja** (Q-11507): só depois da aprovação. Como toda
   chave de `CHAVES_DE_FUNCIONALIDADE` nasce ligada (`funcionalidadeLigada`),
   uma chave `blog` ligaria o blog em todas as lojas. Se a resposta for
   "nasce desligado", a regra precisa ser outra (por exemplo, a loja liga
   no painel).

## 10. Prova de cada critério de aceite

O título dos testes segue `it("[CA-n] @spec:AC-115xx …")`, em arquivos
`*.onp.test.ts(x)`. A verificação atual do motor só roda os projetos
`web` e `unit` (ASM-11506).

| Critério           | Camada que prova                                                     | A verificação atual alcança? |
| ------------------ | -------------------------------------------------------------------- | ---------------------------- |
| AC-11501, AC-11505 | web (tela de leitura e de lista) e api-int (consulta pública)        | parcial (só a tela)          |
| AC-11502           | unit (regra pura de visibilidade) e api-int ou db-rls                | parcial                      |
| AC-11503, AC-11508 | unit (quais páginas renovar) e web                                   | sim                          |
| AC-11504           | db-rls (função de descoberta) e api-int                              | não                          |
| AC-11506           | web (blocos ocultos)                                                 | sim                          |
| AC-11507           | unit (contrato do artigo) e web (mensagens)                          | sim                          |
| AC-11509, AC-11510 | api-int (sessão e permissão) e web (menu)                            | parcial (só o menu)          |
| AC-11511, AC-11515 | db-rls (políticas e chaves compostas)                                | não                          |
| AC-11512, AC-11513 | unit (contrato dos blocos e dos links) e web (renderização, JSON-LD) | sim                          |
| AC-11514           | unit (formato e URL da capa)                                         | sim                          |
| AC-11516           | db-rls ou api-int (condição do produto)                              | não                          |
| AC-11517           | unit (formato do endereço) e db-rls (unicidade)                      | parcial                      |
| AC-11518           | api-int e db-rls (credencial da administração)                       | não                          |

A regra pura de visibilidade (quem vê qual situação) fica num módulo
testável no projeto `unit`, para que exista prova mesmo sem banco. Incluir
`api-int` e `db-rls` na verificação é decisão do gerente e do usuário, por
ser configuração do #103. Até lá, os critérios marcados "não" não podem ser
dados como provados. A prova de ponta a ponta (`e2e/**/*.onp.spec.ts`)
fica para a proposta do #114.

## 11. Decisões do plano (para revisão)

| Código | Decisão                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| D-1    | Pasta `decidir-blog` e bloco 11501 a 11599 (convenção do #103)                                                |
| D-2    | Artigo como entidade própria, separada de `FeedPost`; chamada no feed só pela Q-11508                         |
| D-3    | Corpo em blocos de contrato novo, renderizado como texto                                                      |
| D-4    | Portão de produto separado do liga/desliga por loja                                                           |
| D-5    | Isolamento só conta como provado com testes de API e de banco na verificação (ASM-11506)                      |
| D-6    | Banco no padrão de `products` e função de descoberta com lista fechada; blog do SimpleClick em tabela própria |
| D-7    | O #115 não se declara dono de arquivo compartilhado; a fila fica com o gerente (Q-11509)                      |

As decisões foram revisadas por dois revisores adversariais (arquitetura e
segurança) em 05/11/2026; os apontamentos estão incorporados nas seções 4
a 10.
