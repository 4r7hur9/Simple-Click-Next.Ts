# Tasks: Avaliações com notas e reputação (A decidir)

> feature: decidir-avaliacoes

<!--
  Card #117 — bloco de códigos 11701 a 11799.
  TODAS as tarefas dependem de a Q-11701 ser respondida "fazer" (P-107) e de
  um plano aprovado; nenhuma é dependência do redesign. Ficam [pendente], em
  ordem sequencial (cada uma depende da anterior) e sem auto_start. "Arquivos"
  lista só caminhos que já existem (o motor avisa ARQUIVO_INEXISTENTE para
  caminho novo); os arquivos a criar estão em Notas. Cada tarefa cria o próprio
  teste *.onp.test.ts(x) com `[CA-n] @spec:AC-117xx`. Proposta técnica em design.md.
-->

## T-11701 — Tabelas, regras de banco e exclusão de conta [pendente]

- Refs: US-11701, US-11704, US-11707, AC-11702, AC-11704, AC-11705, AC-11706, AC-11707, AC-11712, AC-11722, AC-11723
- Arquivos: packages/database/prisma/schema.prisma, apps/api/tests/isolamento-varredura.test.ts, packages/database/migrations/0062_curtidas_e_comentarios.sql
- Notas: depende de nenhuma tarefa. Criar a migration com o próximo número livre
  (hoje a última é a 0073; não editar migration existente) para `app.reviews` e
  `app.review_reports`, com RLS, as guardas G1 a G10, elegibilidade própria
  por função `SECURITY DEFINER`, cópia fixa de autoria, sem DELETE nem UPDATE
  de nota para a loja, e a recriação de `app.anonimizar_minha_conta` e
  `app.meus_dados_nas_lojas`. Na varredura de isolamento, entram construtores,
  camada e `guardarApoio`/`ApoioDaLoja`. A prova de banco roda no projeto
  `db-rls`, fora do `verify` (ASM-11707). Ver quem reservou `schema.prisma` e a
  varredura no board antes de editar.

## T-11702 — Permissões da loja e da plataforma [pendente]

- Refs: US-11703, US-11704, AC-11712, AC-11715
- Arquivos: packages/contracts/src/permissoes.ts, apps/api/src/core/equipe-da-loja.ts, apps/api/tests/equipe-e-permissoes.test.ts
- Notas: depende de T-11701. Conforme Q-11716, reaproveitar `moderar_comentarios`
  ou criar permissão nova em `PERMISSOES_DA_LOJA`, `DA_EQUIPE` e
  `ROTULOS_DAS_PERMISSOES`, e as rotas em `PERMISSOES_POR_ROTA`. Sem modelo novo
  de permissões de admin (ASM-11706). Criar o teste
  `packages/contracts/src/avaliacoes-permissoes.onp.test.ts`.

## T-11703 — Contrato das avaliações [pendente]

- Refs: US-11701, US-11702, AC-11701, AC-11706, AC-11710, AC-11724
- Arquivos: packages/contracts/src/rotas.ts, packages/contracts/src/index.ts, packages/contracts/src/vitrine.ts, packages/contracts/src/feed.ts, contrato/openapi.json
- Notas: depende de T-11702. Criar `packages/contracts/src/avaliacoes.ts` (esquemas,
  limites e `ROTAS_DAS_AVALIACOES`) e o teste
  `packages/contracts/src/avaliacoes.onp.test.ts`. Registrar em `rotas.ts`
  (catálogo, esquemas e etiquetas), exportar em `index.ts`, acrescentar o campo
  opcional de média e contagem e regenerar `contrato/openapi.json`. Publicar o
  contrato antes da API.

## T-11704 — API de avaliar, editar, responder e denunciar [pendente]

- Refs: US-11701, US-11703, AC-11701, AC-11702, AC-11703, AC-11704, AC-11705, AC-11706, AC-11711, AC-11713, AC-11714, AC-11715, AC-11718
- Arquivos: apps/api/src/app.ts, apps/api/src/modules/social/social.usecase.ts, apps/api/src/modules/social/social.routes.ts
- Notas: depende de T-11703. Criar `apps/api/src/modules/avaliacoes/` (rotas, casos
  de uso e repositório) no padrão do módulo social, montá-lo em `app.ts` e criar
  o teste de lógica `apps/api/src/modules/avaliacoes/avaliacoes.onp.test.ts`
  (projeto `unit`); a integração fica em `apps/api/tests/avaliacoes.int.test.ts`,
  fora do `verify`. Trilha por loja só com ids e códigos. Não alterar o
  comportamento dos comentários.

## T-11705 — Média e contagem reais na vitrine e no produto [pendente]

- Refs: US-11702, US-11705, AC-11708, AC-11709, AC-11710, AC-11719, AC-11720
- Arquivos: apps/api/src/core/resumo-social.ts, apps/api/src/modules/storefront/dto-publico.ts, apps/api/src/modules/storefront/vitrine.routes.ts
- Notas: depende de T-11704. Criar a função de média e contagem ao lado de
  `resumo-social.ts` (arquivo novo `apps/api/src/core/resumo-de-avaliacoes.ts` e
  o teste `apps/api/src/core/resumo-de-avaliacoes.onp.test.ts`). Nada quando não
  há avaliação publicada ou o mínimo de Q-11709 não foi atingido. Incluir o campo
  em `CAMPOS_PUBLICOS_DA_LOJA` e cobrir `order_id` e `identity_id` em
  `NUNCA_SAEM`.

## T-11706 — Feed e descoberta: nota, "4.8+" e "melhor avaliado" [pendente]

- Refs: US-11702, US-11706, AC-11708, AC-11709, AC-11721
- Arquivos: apps/api/src/modules/feed/feed.usecase.ts, packages/contracts/src/feed.ts
- Notas: depende de T-11705; só se Q-11709 aprovar o filtro e a ordenação.
  Coordenar com #106 e #124. Criar o teste
  `apps/api/src/modules/feed/feed-avaliacoes.onp.test.ts`.

## T-11707 — Moderação da plataforma: fila, ocultar e contestação [pendente]

- Refs: US-11704, AC-11714, AC-11715, AC-11716, AC-11717, AC-11718
- Arquivos: apps/api/src/modules/admin/admin.routes.ts, apps/api/src/modules/admin/auditoria.repo.ts, apps/web/src/features/admin/trilha-na-tela.ts
- Notas: depende de T-11706. Criar `apps/api/src/modules/admin/avaliacoes.routes.ts`
  e o teste `apps/api/src/modules/admin/avaliacoes-moderacao.onp.test.ts`. A
  trilha da plataforma (`audit_platform`) leva só ids e códigos de motivo, sem o
  texto. Prazo e retirada de emergência seguem Q-11715. É pré-requisito para
  lançar a função (ASM-11706).

## T-11708 — Conta do cliente: avaliar o pedido concluído [pendente]

- Refs: US-11701, US-11707, AC-11701, AC-11702, AC-11717, AC-11722, AC-11724
- Arquivos: apps/web/src/features/conta/MeusPedidos.tsx, apps/web/src/app/(conta)/conta/pedidos/[id]/page.tsx, packages/contracts/src/conta.ts
- Notas: depende de T-11707. Criar `apps/web/src/features/conta/AvaliarPedido.tsx` e
  o teste `apps/web/tests/avaliar-pedido.onp.test.tsx`. Mensagem de restrição
  única. Mostrar o motivo e o pedido de nova análise de uma avaliação oculta.
  Coordenar com #111. Telas fora do ZIP pedem proposta visual (ASM-11705).

## T-11709 — Vitrine e produto: resumo e aba "Avaliações" [pendente]

- Refs: US-11702, US-11706, AC-11708, AC-11709, AC-11710, AC-11721, AC-11724
- Arquivos: apps/web/src/features/loja/ApresentacaoDaLoja.tsx, apps/web/src/features/produto/DetalheDoProduto.tsx, apps/web/src/features/vitrine/CartaoDeProduto.tsx, apps/web/src/features/feed/Cartoes.tsx, apps/web/src/server/vitrine.ts, apps/web/src/lib/dados-estruturados.tsx
- Notas: depende de T-11708. Criar `apps/web/src/features/loja/ListaDeAvaliacoes.tsx`
  e o teste `apps/web/tests/avaliacoes-vitrine.onp.test.tsx`. Sem avaliação, nada
  aparece. `dados-estruturados.tsx` só ganha `aggregateRating` se a Q-11712 for
  "sim", e o texto nunca entra no JSON-LD sem escape. Coordenar com #104, #106,
  #107, #108 e #109.

## T-11710 — Painel: responder e denunciar [pendente]

- Refs: US-11703, AC-11711, AC-11712, AC-11713, AC-11714
- Arquivos: apps/web/src/features/painel/secoes-do-painel.ts, apps/web/src/features/comentarios/TelaDeComentarios.tsx
- Notas: depende de T-11709. Criar `apps/web/src/features/avaliacoes-painel/` (tela
  de responder e denunciar), a página `apps/web/src/app/(painel)/painel/avaliacoes/page.tsx`
  e o teste `apps/web/tests/avaliacoes-painel.onp.test.tsx`. Não mostrar pedido
  nem contato do autor. Coordenar com #112.

## T-11711 — Administração: fila de denúncias de avaliações [pendente]

- Refs: US-11704, AC-11715, AC-11716, AC-11717
- Arquivos: apps/web/src/features/admin/HistoricoDeAuditoria.tsx, apps/web/src/features/admin/JanelaDeConfirmacao.tsx
- Notas: depende de T-11710. Criar `apps/web/src/features/admin/FilaDeAvaliacoes.tsx`,
  a página `apps/web/src/app/(admin)/admin/avaliacoes/page.tsx` e o teste
  `apps/web/tests/fila-de-avaliacoes.onp.test.tsx`. Ocultar sempre com motivo e
  confirmação. Coordenar com #113.

## T-11712 — Verificar, auditar e fechar suposições e perguntas [pendente]

- Refs: US-11706, AC-11721
- Arquivos: .spec/features/decidir-avaliacoes/spec.md
- Notas: depende de T-11711. Rodar `onp-spec verify decidir-avaliacoes` e `audit --ci`
  e colar a saída. Marcar as suposições e as perguntas conforme a resposta do
  dono do produto. Os critérios de banco e de API seguem sem prova no motor
  até haver comando para `db-rls` e `api-int` (ASM-11707). Nenhuma tarefa é
  marcada [concluida] sem prova PASS registrada.
