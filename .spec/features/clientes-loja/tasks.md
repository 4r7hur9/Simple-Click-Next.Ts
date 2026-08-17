# Tasks: Clientes da Loja

> feature: clientes-loja

## T-700 — Lista de clientes com totais e busca [pendente]

- Refs: US-700, AC-700, AC-701
- Arquivos: apps/api/src/modules/customers/listar.usecase.ts, apps/api/src/modules/customers/listar.usecase.test.ts, apps/web/src/app/(painel)/painel/clientes/page.tsx, apps/web/src/features/painel-clientes/ListaClientes.tsx
- Notas: nome, telefone, total de pedidos, valor total e último pedido. Busca por telefone funciona independente da pontuação digitada, então o telefone é guardado também em forma normalizada.
- Esforço: medio

## T-701 — Cliente de outra loja nunca aparece [pendente]

- Refs: US-700, AC-702
- Arquivos: apps/api/tests/clientes-isolamento.test.ts
- Notas: cobre listagem, busca e acesso por identificador direto. Marcado com @principle:P-003.
- Esforço: baixo

## T-702 — Cadastro manual de cliente [pendente]

- Refs: US-701, AC-703, AC-704, AC-706
- Arquivos: apps/api/src/modules/customers/cadastrar.usecase.ts, apps/api/src/modules/customers/cadastrar.usecase.test.ts, apps/api/src/modules/customers/customers.schema.ts, apps/web/src/app/(painel)/painel/clientes/[id]/page.tsx, apps/web/src/features/painel-clientes/FormularioCliente.tsx
- Notas: nome e telefone bastam; e-mail é opcional. Telefone repetido oferece abrir o cadastro existente em vez de duplicar. Cliente que já tem conta na plataforma é reconhecido e não duplicado.
- Esforço: alto

## T-703 — Edição e remoção com preservação dos pedidos [pendente]

- Refs: US-701, AC-705
- Arquivos: apps/api/src/modules/customers/editar.usecase.ts, apps/api/src/modules/customers/editar.usecase.test.ts, apps/api/src/modules/customers/anonimizar.usecase.ts, apps/api/src/modules/customers/anonimizar.usecase.test.ts
- Notas: remover é ocultar com retenção, não apagar — é o que preserva a integridade das métricas e atende ao direito de exclusão dentro do prazo. Pedidos antigos mantêm os dados que tinham na compra.
- Esforço: alto

## T-704 — Pedido manual lançado pelo dono [pendente]

- Refs: US-702, AC-707, AC-708, AC-709
- Arquivos: apps/api/src/modules/orders/pedido-manual.usecase.ts, apps/api/src/modules/orders/pedido-manual.usecase.test.ts, apps/web/src/app/(painel)/painel/pedidos/novo/page.tsx, apps/web/src/features/painel-pedidos/MontarPedido.tsx
- Notas: reaproveita o mesmo caminho do pedido do cliente, com canal marcado como manual — então respeita grupo obrigatório e cálculo de total do servidor. Pode ser lançado sem cadastrar o cliente, informando nome e telefone no próprio pedido. Desenhado para uso com uma mão no celular durante o atendimento.
- Esforço: alto

## T-705 — Pedido manual imprime e conta na métrica [pendente]

- Refs: US-702, AC-710
- Arquivos: apps/api/tests/pedido-manual-imprime.test.ts, apps/api/tests/pedido-manual-metrica.test.ts
- Notas: mesmo caminho de impressão do pedido do site, e presença nas métricas do dia com o canal identificado.
- Esforço: baixo

## T-706 — Histórico do cliente e repetir pedido [pendente]

- Refs: US-703, AC-711, AC-712, AC-713
- Arquivos: apps/api/src/modules/customers/historico.usecase.ts, apps/api/src/modules/customers/historico.usecase.test.ts, apps/api/src/modules/orders/repetir-pedido.usecase.ts, apps/api/src/modules/orders/repetir-pedido.usecase.test.ts, apps/web/src/features/painel-clientes/HistoricoCliente.tsx
- Notas: repetir monta pedido novo com preços atuais e aponta o que saiu do catálogo. Pedido antigo com produto removido exibe nome e preço da época, marcado como indisponível, sem quebrar a tela.
- Esforço: alto

## T-707 — Endereços salvos do cliente [pendente]

- Refs: US-701, AC-703, AC-509
- Arquivos: apps/api/src/modules/customers/enderecos.usecase.ts, apps/api/src/modules/customers/enderecos.usecase.test.ts, apps/web/src/app/(conta)/minha-conta/enderecos/page.tsx
- Notas: fecha lacuna apontada pelo crítico. O endereço pertence à identidade do cliente, não à loja, para ele cadastrar uma vez e usar em qualquer loja.
- Esforço: medio

## T-708 — Teste de ponta a ponta de clientes [pendente]

- Refs: US-701, US-702, US-703, AC-703, AC-707, AC-711
- Arquivos: e2e/specs/clientes.spec.ts, e2e/specs/pedido-manual.spec.ts
- Notas: cobre cadastrar cliente, lançar pedido manual com grupo obrigatório e repetir um pedido anterior.
- Esforço: medio
