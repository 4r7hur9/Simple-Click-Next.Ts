# Tasks: Avise-me quando o produto voltar ao estoque (A decidir)

> feature: decidir-avise-me

<!--
  Card #120, bloco de códigos 12001 a 12099.
  TODAS as tarefas são futuras e estão bloqueadas pela decisão do usuário
  (P-107): nenhuma começa antes de Q-12001 (fazer ou não) e Q-12002 (canal)
  ficarem respondidas, e cada tarefa cita as outras perguntas de que depende.
  "Arquivos" lista só arquivos que já existem (o motor acusa arquivo
  inexistente); os arquivos a criar ficam na linha "A criar".
  Cada tarefa traz os próprios testes `*.onp.test.ts(x)` com a marca @spec do critério de aceite,
  no projeto indicado na tabela de prova do design.md (seção 8).
  Migration: sempre "o próximo número livre na hora da implementação".
  Ordem obrigatória, uma após a outra, na pasta principal e sem worktree:
  T-12001, T-12002, T-12003, T-12004, T-12005, T-12006, T-12007, T-12008,
  T-12009. Arquivos compartilhados passam pela fila do gerente.
-->

## T-12001 — Migration: inscrições, eventos, gatilho, funções e LGPD [pendente]

- Refs: US-12001, US-12002, US-12005, AC-12001, AC-12006, AC-12007, AC-12008, AC-12010, AC-12016, AC-12017, AC-12018
- Arquivos: packages/database/prisma/schema.prisma, packages/database/tests/esquema-cobre-o-banco.test.ts
- A criar: migration com o próximo número livre em packages/database/migrations, teste de banco do gatilho e das funções em packages/database/tests
- Notas: tabela de inscrições, tabela de eventos, gatilho filtrado na
  transição para disponível (SECURITY INVOKER, só ids), funções
  `variacao_avisavel`, `contagem_de_espera`, reserva do lote, leitura do
  destinatário e cancelamento por código, todas com caminho de busca fixo.
  Exportação e anonimização na MESMA migration, com teste de que as
  exclusões anteriores continuam. Índices únicos começam por `store_id`.
  Depende de Q-12001, Q-12003, Q-12006, Q-12008 e Q-12011.

## T-12002 — Varredura de isolamento e guardas [pendente]

- Refs: US-12005, AC-12016
- Arquivos: apps/api/tests/isolamento-varredura.test.ts, packages/database/guards/g3_unica_por_loja.sql
- Notas: construtor e camada das tabelas novas, teste por função de acesso
  ampliado (a loja A não lê, conta, cancela nem reserva da loja B) e a
  exceção justificada na G3 para o código de cancelamento.
  Arquivo compartilhado: fila do gerente.

## T-12003 — Contratos e rotas de inscrição, lista e cancelamento [pendente]

- Refs: US-12001, US-12003, AC-12001, AC-12004, AC-12005, AC-12006, AC-12012, AC-12013, AC-12014, AC-12020
- Arquivos: packages/contracts/src/index.ts, packages/contracts/src/rotas.ts, apps/api/src/app.ts, apps/api/src/modules/conta/conta.routes.ts, apps/api/src/core/limite.ts
- A criar: packages/contracts/src/avise-me.ts, apps/api/src/modules/avise-me/ (casos de uso e rotas)
- Notas: pedir, listar e cancelar (por conta e por código); resposta
  uniforme para inexistente, oculto e de outra loja; só e-mail confirmado;
  limite por origem mais teto no banco. O contrato novo fica em arquivo
  próprio e não edita `vitrine.ts`. Depende de Q-12003 e Q-12005.

## T-12004 — Trabalhador do aviso e ciclo da inscrição [pendente]

- Refs: US-12002, AC-12007, AC-12008, AC-12009, AC-12010
- Arquivos: apps/api/src/jobs/index.ts, apps/api/src/modules/orders/reservar-estoque.ts
- A criar: trabalhador e agendamento em apps/api/src/modules/avise-me/ (teste no projeto db-rls ou api-int)
- Notas: percorre loja por loja, reserva com SKIP LOCKED, reavalia
  "comprável agora" antes de enviar, registra o envio antes da tentativa e
  usa chave de idempotência. A baixa por pedido só é lida (teste de que não
  grava evento); o arquivo de reserva não muda. Depende de Q-12006, Q-12009
  e Q-12010.

## T-12005 — Canal escolhido e texto do aviso [pendente]

- Refs: US-12001, US-12002, US-12003, AC-12003, AC-12009, AC-12011, AC-12013, AC-12018
- Arquivos: apps/api/src/jobs/email.job.ts
- A criar: modelo do aviso e porta do canal em apps/api/src/modules/avise-me/
- Notas: usa a porta de envio existente ou o aviso dentro do site, conforme
  Q-12002. O e-mail só funciona em produção depois de resolver a dívida 35 e
  de Q-12004. Texto sem data, prazo, preço nem quantidade; sem dado pessoal
  em registros.

## T-12006 — Botão e janela de pedido na loja [pendente]

- Refs: US-12001, AC-12002, AC-12003, AC-12004
- Arquivos: apps/web/src/features/produto/BotaoAdicionar.tsx, apps/web/src/features/produto/MatrizDeVariacao.tsx, apps/web/src/features/vitrine/CartaoEsgotado.tsx, apps/web/src/server/produto.ts
- A criar: janela de pedido e teste em apps/web/src/features/produto/
- Notas: só com motivo "esgotado"; sem canal marcado de antemão; oculto até
  a decisão. Arquivos de #107, #108 e #109: entra depois deles, na fila.

## T-12007 — Lista "Meus avisos" na conta e página de cancelamento [pendente]

- Refs: US-12003, AC-12013, AC-12014
- Arquivos: apps/web/src/lib/quem-esta-logado.ts, apps/web/src/lib/routes.ts, apps/web/src/features/conta/chamar-conta.ts, apps/web/src/features/conta/DadosDaConta.tsx
- A criar: tela dos avisos em apps/web/src/features/conta/, páginas em apps/web/src/app/(conta)/conta/ e a página pública de cancelamento
- Notas: o GET só mostra a confirmação e o cancelamento é um POST. Arquivos
  do #111: entra depois dele.

## T-12008 — Contagem de espera no painel de estoque [pendente]

- Refs: US-12004, AC-12015
- Arquivos: apps/web/src/features/painel-estoque/PainelDeEstoque.tsx, apps/api/src/modules/catalog/listagem-do-painel.ts, apps/api/src/modules/catalog/visao-geral.routes.ts
- Notas: só o número, só para a equipe da loja. Se Q-12007 for "mostrar
  nomes", esta tarefa precisa de revisão de LGPD antes. Arquivos do #112:
  entra depois dele.

## T-12009 — Retenção, limpeza e remoção da loja [pendente]

- Refs: US-12005, AC-12017, AC-12019, AC-12020
- Arquivos: apps/api/src/jobs/retencao.job.ts, apps/api/src/modules/admin/situacao.repo.ts, apps/api/src/modules/conta/privacidade.ts
- Notas: expira inscrições pelo prazo de Q-12005, apaga as de item apagado e
  de loja removida, cancela as de loja suspensa, entra na remoção
  definitiva da loja e confere a exportação. Credencial da limpeza definida
  no design (seção 5). Depende de Q-12005 e Q-12011.
