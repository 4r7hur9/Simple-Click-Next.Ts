# Tasks: Selo público de loja verificada (A decidir)

> feature: decidir-selos-de-loja

<!--
  Card #118 — bloco de códigos 11801 a 11899.
  TODAS as tarefas dependem de a Q-11801 ser respondida "fazer" (P-107) e de
  um plano aprovado; nenhuma é dependência do redesign. Ficam [pendente] e
  sem auto_start. "Arquivos" lista só caminhos que já existem (o motor avisa
  ARQUIVO_INEXISTENTE para caminho novo); os arquivos a criar estão em Notas.
  Proposta técnica em design.md.
-->

## T-11801 — Tabela de verificação e leitura pública mínima [pendente]

- Refs: US-11802, US-11803, AC-11804, AC-11811, AC-11813
- Arquivos: packages/database/prisma/schema.prisma, apps/api/tests/isolamento-varredura.test.ts
- Notas: criar a migração com o próximo número livre (hoje a última é a 0073)
  para `app.store_verifications`, com índice parcial de uma verificação aberta
  por loja. Acesso só por `sc_admin`. Uma função pública `SECURITY DEFINER`
  devolve só desde, validaAte e itens genéricos. O vencimento é calculado na
  leitura, sem job. Antes de mexer em `schema.prisma` e na varredura, ver quem
  os reservou no board.

## T-11802 — Contrato público e expressões reservadas [pendente]

- Refs: US-11805, AC-11803, AC-11815, AC-11816, AC-11817
- Arquivos: packages/contracts/src/vitrine.ts, packages/contracts/src/feed.ts, packages/contracts/src/store-settings.ts, packages/contracts/src/index.ts
- Notas: campo `verificacao` opcional e nulável em `esquemaDeLojaPublica`,
  `esquemaDaLojaDoFeed` e `esquemaDaLojaNoCartao`, mais a lista de expressões
  reservadas. Criar `packages/contracts/src/selo-de-loja.ts` e o teste
  `packages/contracts/src/selo-de-loja.onp.test.ts`. Publicar antes da API
  (ordem de deploy no design.md).

## T-11803 — Conceder, revogar e encerrar na administração [pendente]

- Refs: US-11802, US-11803, AC-11804, AC-11805, AC-11806, AC-11807, AC-11809, AC-11810, AC-11812
- Arquivos: apps/api/src/modules/admin/admin.routes.ts, apps/api/src/modules/admin/status-loja.usecase.ts, apps/api/src/modules/admin/editar-loja.usecase.ts, apps/api/src/modules/admin/trilha.ts, packages/contracts/src/admin-ficha.ts
- Notas: rotas GET, PUT e DELETE `/v1/admin/lojas/:id/verificacao` no padrão
  de `aprovacao.routes.ts`. Recusa por vínculo com a loja. Encerramento na
  mesma transação de suspender, desativar, excluir e editar os dados
  conferidos. Atos SELO_CONCEDIDO, SELO_REVOGADO e SELO_ENCERRADO em
  `ATOS_SENSIVEIS`, com o after_data sem dado pessoal. Pedir revalidação das
  etiquetas. Criar `apps/api/src/modules/admin/verificacao.routes.ts`,
  `verificacao.repo.ts` e o teste `apps/api/tests/selo-de-loja.onp.test.ts`.

## T-11804 — Selo na resposta pública da vitrine e do feed [pendente]

- Refs: US-11801, US-11803, AC-11803, AC-11808, AC-11811, AC-11813, AC-11815
- Arquivos: apps/api/src/modules/storefront/dto-publico.ts, apps/api/src/modules/storefront/resolver-loja.usecase.ts, apps/api/src/modules/feed/feed.usecase.ts
- Notas: ler pela função pública, nunca pela tabela. Incluir o campo em
  `CAMPOS_PUBLICOS_DA_LOJA` e cobrir `granted_by`, `reason` e `items` em
  `NUNCA_SAEM`. Vale para vitrine, feed, favoritos e recentes. Criar o teste
  `apps/api/tests/selo-de-loja-publico.onp.test.ts`.

## T-11805 — Aba de verificação na ficha da loja (administração) [pendente]

- Refs: US-11802, AC-11804, AC-11805, AC-11807
- Arquivos: apps/web/src/features/admin/FichaLoja.tsx, apps/web/src/features/admin/AbasDaLoja.tsx, apps/web/src/features/admin/DocumentosDaLoja.tsx
- Notas: itens conferíveis a partir dos documentos enviados, validade, motivo
  e confirmação no padrão de `JanelaDeConfirmacao.tsx`. Coordenar com o #113.
  Criar `apps/web/src/features/admin/VerificacaoDaLoja.tsx`.

## T-11806 — Selo e explicação na vitrine e no feed [pendente]

- Refs: US-11801, AC-11801, AC-11802, AC-11803, AC-11818
- Arquivos: apps/web/src/features/vitrine/CapaDaVitrine.tsx, apps/web/src/features/feed/Cartoes.tsx, apps/web/src/features/feed/PostDeLoja.tsx, apps/web/src/server/vitrine.ts, packages/ui/src/selo.tsx, packages/ui/src/dialogo.tsx
- Notas: criar o componente `SeloDeVerificacao`, com `Selo` e `Dialogo`,
  ícone do pacote do projeto e tokens de cor (P-102, P-103, P-108). O texto
  dos limites precisa de revisão jurídica (Q-11805). `dados-estruturados.tsx`
  e `opengraph-image.tsx` ficam sem o selo até a Q-11809. Coordenar com
  #106, #107 e #108. Criar o teste `apps/web/tests/selo-de-loja.onp.test.tsx`.

## T-11807 — Situação do selo no painel do dono [pendente]

- Refs: US-11804, AC-11814, AC-11815
- Arquivos: apps/web/src/features/config/secoes.ts, apps/api/src/modules/stores/configuracao.routes.ts
- Notas: leitura `{ situacao, validaAte }` sem autor nem motivo. Nenhum
  esquema de entrada do dono aceita o campo de verificação.

## T-11808 — Prova e auditoria da feature [pendente]

- Refs: US-11801, US-11802, US-11803, US-11804, US-11805
- Arquivos: .spec/features/decidir-selos-de-loja/spec.md
- Notas: `onp-spec verify` só para esta feature, depois de implementada.
  Atualizar as suposições e perguntas com as respostas do dono antes de
  marcar a spec como implementada.
