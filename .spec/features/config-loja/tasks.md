# Tasks: Configurações da Loja

> feature: config-loja

## T-900 — Configurações por seção, com gravação atômica e auditoria [concluida]

- Refs: US-906, AC-921, AC-922, AC-923
- Arquivos: apps/api/src/modules/stores/configuracoes.usecase.ts, apps/api/src/modules/stores/configuracoes.usecase.test.ts, apps/api/src/modules/stores/configuracoes.schema.ts, apps/api/src/modules/stores/configuracao.routes.ts, packages/contracts/src/store-settings.ts, apps/api/tests/apoio-de-configuracao.ts, apps/api/tests/config-loja-secoes.int.test.ts, apps/web/src/app/api/loja/[secao]/route.ts, apps/web/src/app/(painel)/painel/layout.tsx, apps/web/src/app/(painel)/painel/page.tsx, apps/web/src/app/(painel)/painel/config/layout.tsx, apps/web/src/app/(painel)/painel/config/horarios/page.tsx, apps/web/src/features/config/secoes.ts, apps/web/src/features/config/useSecao.ts, apps/web/src/features/config/ErroDoCampo.tsx, apps/web/src/features/config/FormularioHorario.tsx, apps/web/tests/apoio-config.tsx, apps/web/tests/config-secoes.test.tsx, apps/web/tests/painel-inicial.test.tsx
- Notas: nada é salvo pela metade — a seção, as colunas da loja que ela toca e o registro na trilha entram na MESMA transação, e a recusa volta no formato de toda a API (`campos[]` com `caminho`), apontando cada campo. Cada alteração registra autor, momento, campo e valor anterior (só os campos que mudaram); chave PIX e WhatsApp saem mascarados e com ação `CONFIG_SENSIVEL_ALTERADA`. As seções são a lista fechada `SECOES_DO_DONO` do contrato — pagamento, entrega, horário, contato, apresentação e impressão —, uma rota por seção e esquema estrito: tipo de negócio, apelido, documento e contrato não têm como entrar. A tela de horário (grade, fechar agora e datas especiais) nasce aqui porque o dono precisa encontrá-la (AC-921); o cálculo continua o da T-903.
- Esforço: alto

## T-901 — Chave PIX e formas de pagamento [concluida]

- Refs: US-900, AC-900, AC-901, AC-902, AC-903, AC-904
- Arquivos: packages/core/src/chave-pix.ts, packages/core/src/chave-pix.test.ts, packages/core/src/index.ts, apps/api/src/modules/stores/configuracoes.schema.ts, apps/api/src/modules/storefront/fechamento.usecase.ts, apps/api/tests/config-pagamento.int.test.ts, apps/api/tests/vitrine-sem-dado-sensivel.test.ts, apps/web/src/app/(painel)/painel/config/pagamento/page.tsx, apps/web/src/features/config/FormularioPagamento.tsx, apps/web/src/features/config/useSecao.ts, apps/web/tests/config-pagamento.test.tsx
- Notas: a chave é conferida pelo tipo na borda (regra pura em `packages/core/src/chave-pix.ts`: CPF e CNPJ com dígito verificador, celular com DDD, e-mail, chave aleatória) e sai normalizada; a recusa aponta `pix.chave` com o formato esperado e a chave anterior continua valendo. PIX sem chave não entra nas formas do fechamento (documento antigo incluído). O pedido guarda a chave do momento (snapshot da AC-511), provado trocando a chave entre dois pedidos. A chave nunca vai inteira para a trilha (P-009) e não sai na vitrine. O aviso por e-mail ao dono quando a chave muda (Q-901) não é critério desta tarefa e fica pendente.
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

## T-907 — Avisos de configuração pendente no painel [concluida]

- Refs: US-903, AC-902, AC-914
- Arquivos: apps/api/src/modules/stores/pendencias.usecase.ts, apps/api/src/modules/stores/pendencias.usecase.test.ts, apps/api/src/modules/stores/configuracao.routes.ts, apps/web/src/app/api/loja/[secao]/route.ts, apps/web/src/features/config/AvisosPendentes.tsx, apps/web/src/app/(painel)/painel/layout.tsx, apps/web/tests/avisos-pendentes.test.tsx
- Notas: regra pura em `pendencias.usecase.ts`: sem forma de pagamento que o checkout ofereça (PIX sem chave não conta), sem entrega nem retirada, sem WhatsApp e sem horário, cada aviso dizendo a consequência para o cliente e com atalho para a tela que resolve — inclusive a de horário. O aviso aparece destacado (tom de atenção) no topo de todo o painel; falha ao consultar não vira aviso falso.
- Esforço: baixo

## T-908 — Teste de ponta a ponta das configurações [pendente]

- Refs: US-900, US-902, US-904, AC-900, AC-909, AC-916
- Arquivos: e2e/specs/config-pagamento.spec.ts, e2e/specs/config-horarios.spec.ts, e2e/specs/config-aparencia.spec.ts
- Notas: cobre cadastrar a chave PIX e vê-la aparecer no checkout, fechar a loja e o cliente ser impedido, e editar a apresentação refletindo na página pública.
- Esforço: medio
