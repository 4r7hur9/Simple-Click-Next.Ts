# Tasks: Blog com artigos, dicas e publicações editoriais

> feature: decidir-blog

<!--
  Card #115 — bloco de códigos 11501 a 11599.
  TODAS as tarefas estão BLOQUEADAS até a resposta da Q-11501 (fazer ou não,
  parte da Q-10305 do #103) e ficam [pendente] (P-107). Elas descrevem a
  implementação futura do escopo A (blog de cada loja); T-11509 só vale se
  a Q-11502 pedir o blog do SimpleClick.
  Em "Arquivos" ficam só caminhos que já existem (pastas-mãe dos novos);
  o que ainda não existe está em "A criar". Arquivos compartilhados
  seguem a fila de design.md, seção 8: nada aqui dá posse ao #115.
  Execução: uma tarefa após a outra, na pasta principal, sem worktrees.
-->

## T-11501 — Banco: tabela de artigos, produtos indicados e isolamento por loja [pendente]

- Refs: US-11504, AC-11502, AC-11511, AC-11515, AC-11517
- Arquivos: packages/database/migrations/, packages/database/prisma/schema.prisma, packages/database/tests/esquema-cobre-o-banco.test.ts
- A criar: migração com o próximo número livre na hora da implementação
- Notas: políticas no padrão `products_*` de 0004 (USING e WITH CHECK,
  cinto restritivo, acesso explícito da administração); chaves compostas
  com a loja; slug único por loja; situação com CHECK. Fila: Q-11509.

## T-11502 — Banco: função de descoberta entre lojas [pendente]

- Refs: US-11502, AC-11504, AC-11505, AC-11516
- Arquivos: packages/database/migrations/
- A criar: migração com o próximo número livre (pode ser a mesma da T-11501)
- Notas: SECURITY DEFINER com search_path fixo, REVOKE de PUBLIC e GRANT
  só para sc_app; só artigos publicados de loja ativa; lista fechada de
  campos; cartão de produto pela condição de `app.produto_favoritavel`.

## T-11503 — Contratos: artigo, blocos do corpo, capa e permissão [pendente]

- Refs: US-11503, US-11505, AC-11507, AC-11512, AC-11513, AC-11514, AC-11517
- Arquivos: packages/contracts/src/index.ts, packages/contracts/src/rotas.ts, packages/contracts/src/permissoes.ts
- A criar: packages/contracts/src/artigos.ts
- Notas: z.strictObject por tipo de bloco; links http, https ou caminho
  interno, testados depois de trim e decode; limites de tamanho; slug com
  formato fechado; permissão nova da loja conforme a Q-11503.

## T-11504 — Regra pura de visibilidade e de renovação [pendente]

- Refs: AC-11502, AC-11503, AC-11506, AC-11508
- Arquivos: packages/core/src/
- A criar: packages/core/src/artigos.ts
- Notas: quem vê cada situação (público, loja, administração) e quais
  páginas renovar a cada mudança; testável no projeto unit.

## T-11505 — API do painel: criar, editar, publicar, retirar e apagar [pendente]

- Refs: US-11503, US-11504, AC-11507, AC-11508, AC-11510, AC-11511, AC-11514, AC-11515
- Arquivos: apps/api/src/modules/
- A criar: apps/api/src/modules/artigos/
- Notas: 403 sem_permissao para quem não tem a permissão; capa só imagem
  (`formatoDaFoto`) e URL da própria loja (`chaveDaMidiaPelaUrl`); trilha de
  auditoria em cada mudança de situação; limites da Q-11511.

## T-11506 — API pública e leitura: lista, artigo, prévia e mapa do site [pendente]

- Refs: US-11501, US-11502, AC-11501, AC-11502, AC-11503, AC-11505, AC-11509, AC-11513, AC-11516
- Arquivos: apps/api/src/modules/, apps/web/src/features/, apps/web/src/lib/routes.ts, apps/web/src/app/(loja)/loja/[slug]/sitemap.xml/route.ts
- A criar: apps/api/src/modules/artigos/, apps/web/src/app/(loja)/loja/[slug]/artigos/, apps/web/src/features/artigos/
- Notas: rascunho e retirado com o mesmo 404 de inexistente; prévia só com
  sessão da loja, noindex e no-store; JSON-LD só por `DadosEstruturados`;
  renovação do cache ao publicar e retirar; manifesto de rotas e os testes
  que o usam. Fila: #105 e #107 (pasta da loja), Q-11509.

## T-11507 — Painel do autor [pendente]

- Refs: US-11503, AC-11507, AC-11508, AC-11509, AC-11510
- Arquivos: apps/web/src/features/painel/secoes-do-painel.ts, apps/web/src/lib/permissoes.ts, apps/web/src/lib/espacos-de-imagem.ts, apps/web/src/app/(painel)/painel/
- A criar: apps/web/src/features/painel-artigos/, apps/web/src/app/(painel)/painel/artigos/
- Notas: lista, edição em blocos, capa com alt obrigatório, prévia,
  publicar e retirar; item do menu escondido sem a permissão. Fila: #112
  (padrão `features/painel*`).

## T-11508 — Descoberta: início, vitrine e chamada no feed [pendente]

- Refs: US-11502, AC-11503, AC-11504, AC-11506
- Arquivos: apps/web/src/app/(loja)/loja/[slug]/TelaDaLoja.tsx, apps/web/src/features/feed/TelaDoFeed.tsx
- Notas: blocos ocultos enquanto não houver decisão; chamada no feed só
  depois da Q-11508 (conjunta com o #116). Fila: #107 e #106.

## T-11509 — Blog do SimpleClick (só se a Q-11502 pedir) [pendente]

- Refs: US-11508, AC-11518
- Arquivos: packages/database/migrations/, packages/contracts/src/permissoes.ts, apps/api/src/modules/admin/, apps/web/src/features/painel/MenuDaAdministracao.tsx, apps/web/src/app/sitemap.ts
- A criar: tabela própria do blog do SimpleClick (migração), rotas /artigos e /admin/artigos
- Notas: tabela própria sem loja; permissão de conteúdo da administração
  (Q-11504); trilha em `app.audit_platform`; nenhuma credencial de loja
  escreve ali.

## T-11510 — Testes com prova para o motor [pendente]

- Refs: AC-11501, AC-11502, AC-11503, AC-11504, AC-11505, AC-11506, AC-11507, AC-11508, AC-11509, AC-11510, AC-11511, AC-11512, AC-11513, AC-11514, AC-11515, AC-11516, AC-11517, AC-11518
- Arquivos: apps/web/tests/, packages/core/src/, apps/api/tests/, packages/database/tests/
- A criar: apps/web/tests/artigos.onp.test.tsx, packages/core/src/artigos.onp.test.ts, apps/api/tests/artigos.onp.test.ts, packages/database/tests/artigos-rls.onp.test.ts
- Notas: título `[CA-n] @spec:AC-115xx`; tabela da seção 10 do design diz
  a camada de cada critério; os de api-int e db-rls só contam como prova se
  a verificação passar a rodá-los (ASM-11506).
