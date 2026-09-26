# Tasks: Operação do Pedido

> feature: pedido-operacao

## T-600 — Fila de pedidos que atualiza sozinha [pendente]

- Refs: US-600, AC-600, AC-601, AC-602, AC-603
- Arquivos: apps/api/src/modules/orders/fila.usecase.ts, apps/api/src/modules/orders/fila.usecase.test.ts, apps/web/src/app/(painel)/painel/pedidos/page.tsx, apps/web/src/features/painel-pedidos/QuadroDePedidos.tsx, apps/web/src/features/painel-pedidos/useAtualizarPedidos.ts, apps/web/src/features/painel-pedidos/AvisoSonoro.tsx
- Notas: o que aguarda ação fica em destaque no topo, com tempo de espera visível. Reconexão recupera o que entrou durante a queda. Silenciar o som mantém o alerta visual e a escolha persiste. Depende da decisão pendente D3.
- Esforço: alto

## T-601 — Máquina de status do pedido [pendente]

- Refs: US-601, AC-604, AC-605, AC-606, AC-607, AC-608
- Arquivos: packages/core/src/maquina-status.ts, packages/core/src/maquina-status.test.ts, apps/api/src/modules/orders/mudar-status.usecase.ts, apps/api/src/modules/orders/mudar-status.usecase.test.ts, apps/web/src/app/(painel)/painel/pedidos/[id]/page.tsx, apps/web/src/features/painel-pedidos/AcoesDeStatus.tsx
- Notas: transição inválida é recusada com explicação. Pedido de retirada não passa por status de entrega. Recusa e cancelamento exigem motivo, avisam o cliente e saem do faturamento. Histórico não pode ser alterado.
- Esforço: alto

## T-602 — Pedido aguardando confirmação no WhatsApp [pendente]

- Refs: US-602, AC-609, AC-610, AC-611
- Arquivos: apps/api/src/modules/orders/confirmacao-whatsapp.usecase.ts, apps/api/src/modules/orders/confirmacao-whatsapp.usecase.test.ts, apps/web/src/features/painel-pedidos/SeloAguardando.tsx, apps/web/src/features/pedido/BotaoJaEnviei.tsx
- Notas: resolve o pedido fantasma que o crítico apontou. O estado de entrega da mensagem é separado do status do pedido. Não confirmado fica fora do faturamento e aparece contado à parte.
- Esforço: alto

## T-603 — Página pública de acompanhamento [pendente]

- Refs: US-603, AC-612, AC-613, AC-614, AC-615
- Arquivos: apps/api/src/modules/orders/acompanhar.usecase.ts, apps/api/src/modules/orders/acompanhar.usecase.test.ts, apps/web/src/app/(loja)/l/[slug]/pedido/[token]/page.tsx, apps/web/src/features/pedido/LinhaDoTempo.tsx, apps/api/tests/acompanhamento-nao-enumeravel.test.ts
- Notas: endereço por código longo e aleatório; tentativa de adivinhar responde não encontrado. Telefone parcialmente oculto e nenhum dado interno da loja. Marcado com @principle:P-003 na parte de isolamento.
- Esforço: alto

## T-604 — Histórico do pedido na conta do cliente [pendente]

- Refs: US-603, AC-616
- Arquivos: apps/api/src/modules/orders/meus-pedidos.usecase.ts, apps/api/src/modules/orders/meus-pedidos.usecase.test.ts, apps/web/src/app/(conta)/minha-conta/pedidos/page.tsx, apps/web/src/app/(conta)/minha-conta/pedidos/[id]/page.tsx
- Notas: o cliente logado vê os pedidos dele em todas as lojas onde comprou, por caminho dedicado — e nenhuma loja enxerga o histórico da outra.
- Esforço: alto

## T-605 — Gerador de conteúdo do cupom, uma fonte para duas saídas [concluida]

- Refs: US-604, AC-619, AC-620, AC-621
- Arquivos: packages/core/src/cupom-blocos.ts, packages/core/src/cupom-blocos.test.ts, packages/core/src/cupom-blocos.test.ts.snap, packages/core/src/cupom-largura.ts, packages/core/src/cupom-largura.test.ts, packages/core/src/cupom-escpos.ts, packages/core/src/cupom-escpos.test.ts, packages/database/migrations/0030_vias_impressas_do_pedido.sql, apps/api/src/modules/printing/cupom.usecase.ts, apps/api/tests/cupom-vias.test.ts
- Notas: um só gerador de blocos, parametrizado pela largura do papel, alimenta a impressão pelo navegador e a do agente — e um teste prova que as duas saídas têm o mesmo conteúdo, risco que o crítico apontou. Acento correto exige tratar a tabela de caracteres da impressora; alinhamento exige normalizar o texto antes de contar largura. O CONTRATO dos blocos (versão 1, dois níveis: cupom semântico e linhas diagramadas) está no topo de `cupom-blocos.ts`; `cupom-escpos.ts` é a saída da impressora e a referência do agente (T-609). A via (AC-621) é `orders.print_count` (migração 0030), somada na mesma transação que gera o cupom.
- Esforço: max

## T-606 — Impressão por clique no navegador [concluida]

- Refs: US-604, AC-617, AC-618
- Arquivos: apps/web/src/app/imprimir/[id]/page.tsx, apps/web/src/app/imprimir/[id]/loading.tsx, apps/web/src/app/imprimir/[id]/cupom.css, apps/web/src/features/impressao/FolhaDoCupom.tsx, apps/web/src/features/impressao/ImprimirAoAbrir.tsx, apps/web/src/features/impressao/AcoesDaImpressao.tsx, apps/web/src/features/impressao/AvisoDoCupom.tsx, apps/web/src/features/impressao/BotaoImprimirCupom.tsx, apps/web/src/server/cupom.ts, apps/web/tests/imprimir-cupom.test.tsx, apps/api/src/modules/printing/cupom.routes.ts, apps/api/src/modules/printing/cupom.schema.ts, apps/api/tests/cupom-rota.test.ts, e2e/specs/imprimir.spec.ts
- Notas: página de cupom sem o layout do aplicativo, com largura de papel configurada, para impressão direta pelo navegador sem instalar nada. Abrir a página emite uma via (`POST /v1/lojas/:apelido/pedidos/:id/cupom`, AC-621) e abre o diálogo de impressão do navegador; os links para ela são `<a>` comuns, nunca `Link`, para pré-carregamento não contar via. O HTML desenha as MESMAS linhas de `diagramarCupom` que a impressora recebe; a fonte da folha tem negrito próprio e `font-synthesis: none`, porque negrito sintetizado alarga a letra e tira o valor da coluna (medido no Chrome). O botão "Imprimir cupom" entrou no detalhe do pedido (`painel/pedidos/[id]/page.tsx`, da T-601).
- Esforço: medio

## T-607 — Fila de impressão em banco com reivindicação e prazo [pendente]

- Refs: US-605, AC-624, AC-625
- Arquivos: packages/database/migrations/0008_fila_impressao.sql, apps/api/src/modules/printing/fila.usecase.ts, apps/api/src/modules/printing/fila.usecase.test.ts, apps/api/tests/impressao-sem-duplicar.test.ts
- Notas: reivindicação com travamento que ignora linha ocupada, prazo de posse, repetição com espera crescente e estado final inspecionável. Cada trabalho tem identificador próprio, então confirmação perdida não imprime duas vezes.
- Esforço: max

## T-608 — Modo automático por chave e pareamento do agente [pendente]

- Refs: US-605, AC-622, AC-623, AC-626
- Arquivos: apps/api/src/modules/printing/parear.usecase.ts, apps/api/src/modules/printing/parear.usecase.test.ts, apps/api/src/modules/printing/entregar.usecase.ts, apps/web/src/app/(painel)/painel/config/impressao/page.tsx, apps/web/src/features/painel-pedidos/EstadoDoAgente.tsx
- Notas: nasce desligado, com a impressão por clique como padrão. Agente pareado por código curto, com credencial de escopo mínimo. Desligar o automático volta ao clique sem perder cupom pendente.
- Esforço: alto

## T-609 — Agente de impressão [pendente]

- Refs: US-605, AC-623, AC-624
- Arquivos: agente/README.md, agente/main.go, agente/impressora.go, agente/fila.go, agente/impressora_test.go
- Notas: programa pequeno que consulta o servidor e escreve na impressora; não abre porta para a internet. Compila os blocos recebidos conforme o perfil da impressora daquela loja. Depende da decisão sobre quais sistemas atender (Q-603).
- Esforço: max

## T-610 — Emulador de impressora para testar sem hardware [pendente]

- Refs: US-604, AC-620, AC-621
- Arquivos: infra/compose/docker-compose.yml, infra/scripts/testar-impressao.sh, agente/emulador_test.go
- Notas: serviço no ambiente local que recebe a impressão e devolve pré-visualização, para validar acento, alinhamento e corte sem impressora física.
- Esforço: medio

## T-611 — Teste de ponta a ponta da operação [pendente]

- Refs: US-600, US-601, US-603, AC-600, AC-604, AC-612
- Arquivos: e2e/specs/painel-pedidos.spec.ts, e2e/specs/acompanhamento.spec.ts
- Notas: cobre o pedido entrando na fila, o avanço de status refletindo na página do cliente, e a recusa de endereço adivinhado.
- Esforço: medio
