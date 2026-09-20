# Tasks: Configurações da Loja

> feature: config-loja

## T-900 — Configurações por seção, com gravação atômica e auditoria [pendente]

- Refs: US-906, AC-921, AC-922, AC-923
- Arquivos: apps/api/src/modules/stores/configuracoes.usecase.ts, apps/api/src/modules/stores/configuracoes.usecase.test.ts, apps/api/src/modules/stores/configuracoes.schema.ts, apps/api/src/modules/stores/configuracao.routes.ts, packages/contracts/src/store-settings.ts, apps/web/src/app/api/loja/[secao]/route.ts, apps/web/src/app/(painel)/painel/layout.tsx, apps/web/src/app/(painel)/painel/page.tsx, apps/web/src/app/(painel)/painel/config/layout.tsx, apps/web/tests/painel-inicial.test.tsx
- Notas: nada é salvo pela metade — configuração inválida deixa a anterior valendo e aponta cada campo. Cada alteração registra autor, momento, campo e valor anterior. O dono não vê tipo de negócio, apelido, documento nem contrato. O painel inicial já oferece atalhos para a fatia local funcional de aparência e contato; a conclusão desta tarefa ainda exige contrato, auditoria e os casos de uso definitivos.
- Esforço: alto

## T-901 — Chave PIX e formas de pagamento [pendente]

- Refs: US-900, AC-900, AC-901, AC-902, AC-903, AC-904
- Arquivos: apps/api/src/modules/stores/configuracao.routes.ts, apps/web/src/app/api/loja/[secao]/route.ts, apps/web/src/app/(painel)/painel/config/pagamento/page.tsx, apps/web/src/features/config/FormularioPagamento.tsx
- Notas: a primeira fatia funcional local persiste formas de pagamento e chave PIX por tipo (CPF, CNPJ, telefone, e-mail ou aleatória). PIX exige chave e titular; a chave não sai no DTO público. A prova formal específica de caso de uso, validação por documento e auditoria permanece pendente.
- Esforço: alto

## T-902 — Entrega, retirada, taxa e valor mínimo [pendente]

- Refs: US-901, AC-905, AC-906, AC-907, AC-908
- Arquivos: apps/api/src/modules/stores/configuracao.routes.ts, apps/web/src/app/api/loja/[secao]/route.ts, apps/web/src/app/(painel)/painel/config/entrega/page.tsx, apps/web/src/features/config/FormularioEntrega.tsx
- Notas: a primeira fatia funcional local persiste entrega, retirada, taxa, gratuidade, mínimos e prazo. Desativar os dois modos é aceito na configuração, mas a regra de bloqueio do fechamento e o aviso no painel ainda exigem a implementação formal desta tarefa.
- Esforço: medio

## T-903 — Horário de funcionamento, fechar agora e exceções [concluida]

- Refs: US-902, AC-909, AC-910, AC-911, AC-912
- Arquivos: packages/core/src/horario-loja.ts, packages/core/src/horario-loja.test.ts, packages/core/src/index.ts, apps/api/src/modules/stores/horarios.usecase.ts, apps/api/tests/vitrine-sem-dado-sensivel.test.ts, packages/database/migrations/0015_horario_de_funcionamento.sql, packages/database/prisma/schema.prisma
- Notas: a TELA do painel (grade de horários) saiu desta lista e entra com o painel do dono; os quatro critérios são de cálculo e de guarda, e estão provados sem ela. O caso de uso não tem teste de unidade próprio — ele só monta o objeto que o cálculo puro interpreta, e a prova de que monta certo exige as linhas do banco. Cálculo sempre no fuso da loja, nunca no relógio do cliente nem em fuso universal. Mais de uma faixa por dia. Fechar agora não desconfigura a semana. Exceção datada vence o horário semanal.
- Esforço: alto

## T-904 — Contato de WhatsApp e texto da mensagem [pendente]

- Refs: US-903, AC-913, AC-914, AC-915
- Arquivos: apps/api/src/modules/stores/configuracao.routes.ts, apps/web/src/app/api/loja/[secao]/route.ts, apps/web/src/app/(painel)/painel/config/contato/page.tsx, apps/web/src/features/config/EditorDeMensagem.tsx
- Notas: a primeira fatia funcional do ambiente local já persiste número e saudação em store_settings, com normalização brasileira. A implementação definitiva ainda precisa do caso de uso, auditoria, pré-visualização e cobertura própria desta tarefa. Sem número, o painel deve avisar e o pedido continua sendo registrado. Campos obrigatórios não podem ser removidos; mensagem sem marca da plataforma.
- Esforço: medio

## T-905 — Apresentação da loja, logo, capa e cor [pendente]

- Refs: US-904, AC-916, AC-917, AC-918
- Arquivos: apps/api/src/modules/stores/configuracao.routes.ts, apps/web/src/app/api/loja/[secao]/route.ts, apps/web/src/app/(painel)/painel/config/aparencia/page.tsx, apps/web/src/features/config/FormularioAparencia.tsx
- Notas: a primeira fatia funcional do ambiente local já persiste boas-vindas, logo, capa e cor em store_settings. A implementação definitiva ainda precisa do caso de uso, contraste automático, auditoria, validação pelos bytes e cobertura própria desta tarefa. Herda a página de boas-vindas do primeiro SimpleClick, agora editável.
- Esforço: alto

## T-906 — Formato de impressão do cupom [pendente]

- Refs: US-905, AC-919, AC-920
- Arquivos: apps/api/src/modules/stores/impressao-config.usecase.ts, apps/api/src/modules/stores/impressao-config.usecase.test.ts, apps/web/src/app/(painel)/painel/config/impressao/page.tsx
- Notas: largura de papel muda a formatação do mesmo pedido. O dono escolhe o que aparece, mas o essencial do pedido não pode ser desligado.
- Esforço: medio

## T-907 — Avisos de configuração pendente no painel [pendente]

- Refs: US-903, AC-902, AC-914
- Arquivos: apps/api/src/modules/stores/configuracao.routes.ts, apps/web/src/app/api/loja/[secao]/route.ts, apps/web/src/features/config/AvisosPendentes.tsx, apps/web/src/app/(painel)/painel/layout.tsx
- Notas: a primeira fatia funcional local consulta pagamento, WhatsApp e horário e mostra aviso destacado no painel, com atalho para as telas disponíveis. A implementação formal do caso de uso, testes anotados e tela de edição de horários continuam pendentes.
- Esforço: baixo

## T-908 — Teste de ponta a ponta das configurações [pendente]

- Refs: US-900, US-902, US-904, AC-900, AC-909, AC-916
- Arquivos: e2e/specs/config-pagamento.spec.ts, e2e/specs/config-horarios.spec.ts, e2e/specs/config-aparencia.spec.ts
- Notas: cobre cadastrar a chave PIX e vê-la aparecer no checkout, fechar a loja e o cliente ser impedido, e editar a apresentação refletindo na página pública.
- Esforço: medio
