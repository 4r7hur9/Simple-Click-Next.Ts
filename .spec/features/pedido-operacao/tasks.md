# Tasks: Operação do Pedido

> feature: pedido-operacao

## T-600 — Fila de pedidos que atualiza sozinha [concluida]

- Refs: US-600, AC-600, AC-601, AC-602, AC-603
- Arquivos: packages/core/src/fila-de-pedidos.ts, packages/core/src/fila-de-pedidos.test.ts, apps/api/src/modules/orders/fila.usecase.ts, apps/api/src/modules/orders/fila.usecase.test.ts, apps/api/src/modules/orders/fila.routes.ts, apps/api/tests/fila-de-pedidos.test.ts, apps/api/tests/apoio-de-pedidos.ts, apps/web/src/lib/fila-de-pedidos.ts, apps/web/src/app/(painel)/painel/pedidos/page.tsx, apps/web/src/app/api/painel/pedidos/route.ts, apps/web/src/features/painel-pedidos/QuadroDePedidos.tsx, apps/web/src/features/painel-pedidos/useAtualizarPedidos.ts, apps/web/src/features/painel-pedidos/AvisoSonoro.tsx, apps/web/tests/painel-fila.test.tsx
- Notas: o que aguarda ação fica em destaque no topo, com tempo de espera visível. Reconexão recupera o que entrou durante a queda. Silenciar o som mantém o alerta visual e a escolha persiste. Depende da decisão pendente D3. A regra da fila (onde cada pedido cai, o que é novo, quando o som toca) mora em `packages/core/src/fila-de-pedidos.ts` e é a MESMA na API e na tela; a consulta periódica de 5 s é o caminho de retorno da ASM-602 — a conexão contínua, se vier, troca só o gatilho da leitura.
- Esforço: alto

## T-601 — Máquina de status do pedido [concluida]

- Refs: US-601, AC-604, AC-605, AC-606, AC-607, AC-608
- Arquivos: packages/core/src/maquina-status.ts, packages/core/src/maquina-status.test.ts, apps/api/src/modules/orders/mudar-status.usecase.ts, apps/api/src/modules/orders/mudar-status.usecase.test.ts, apps/api/tests/mudar-status.test.ts, apps/web/src/app/(painel)/painel/pedidos/[id]/page.tsx, apps/web/src/app/api/painel/pedidos/[id]/route.ts, apps/web/src/features/painel-pedidos/AcoesDeStatus.tsx, apps/web/src/features/painel-pedidos/DetalheDoPedido.tsx, apps/web/tests/painel-detalhe-pedido.test.tsx
- Notas: transição inválida é recusada com explicação. Pedido de retirada não passa por status de entrega. Recusa e cancelamento exigem motivo, avisam o cliente e saem do faturamento. Histórico não pode ser alterado. A mudança só vale sobre o status que foi lido (dois aparelhos aceitando juntos geram um passo só); o histórico é imutável por ausência de política de alteração e remoção (0008, guarda G8) — o privilégio de UPDATE/DELETE que o padrão do esquema concede a `sc_app`/`sc_admin` continua lá e é dívida registrada. As rotas do dono ainda não conferem se a identidade é membro da loja (dívida de toda a área do painel).
- Esforço: alto

## T-602 — Pedido aguardando confirmação no WhatsApp [concluida]

- Refs: US-602, AC-609, AC-610, AC-611
- Arquivos: apps/api/src/modules/orders/confirmacao-whatsapp.usecase.ts, apps/api/src/modules/orders/confirmacao-whatsapp.usecase.test.ts, apps/api/tests/confirmacao-whatsapp.test.ts, packages/core/src/situacao-na-venda.ts, packages/core/src/situacao-na-venda.test.ts, packages/database/migrations/0025_confirmacao_whatsapp.sql, packages/database/migrations/0029_operacao_do_pedido.sql, apps/web/src/features/painel-pedidos/SeloAguardando.tsx, apps/web/src/features/pedido/BotaoJaEnviei.tsx, apps/web/tests/botao-ja-enviei.test.tsx
- Notas: resolve o pedido fantasma que o crítico apontou. O estado de entrega da mensagem é separado do status do pedido. Não confirmado fica fora do faturamento e aparece contado à parte. A régua do que é venda mora em `packages/core/src/situacao-na-venda.ts` (`resumirVendas`): o painel de métricas (T-801) DEVE usá-la em vez de reescrever a regra. A função da 0025 nunca funcionou (nome de coluna ambíguo, erro 42702 em toda chamada) e é corrigida na 0029.
- Esforço: alto

## T-603 — Página pública de acompanhamento [concluida]

- Refs: US-603, AC-612, AC-613, AC-614, AC-615
- Arquivos: apps/api/src/modules/orders/acompanhar.usecase.ts, apps/api/src/modules/orders/acompanhar.usecase.test.ts, apps/api/tests/acompanhamento.test.ts, apps/api/tests/acompanhamento-nao-enumeravel.test.ts, packages/contracts/src/acompanhamento.ts, apps/web/src/lib/acompanhamento.ts, apps/web/src/app/(loja)/l/[slug]/pedido/[token]/page.tsx, apps/web/src/features/pedido/AcompanhamentoDoPedido.tsx, apps/web/src/features/pedido/LinhaDoTempo.tsx, apps/web/tests/acompanhamento-pedido.test.tsx
- Notas: endereço por código longo e aleatório; tentativa de adivinhar responde não encontrado. Telefone parcialmente oculto e nenhum dado interno da loja. Marcado com @principle:P-003 na parte de isolamento. A rota pública (`GET /v1/vitrine/:apelido/pedido/:token`, em `pedidos.routes.ts`, mapeado pela T-511) passou a validar o formato do token na borda e a responder sem cache; a página pergunta de novo a cada 5 s e só reagenda quando a resposta anterior volta.
- Esforço: alto

## T-604 — Histórico do pedido na conta do cliente [pendente]

- Refs: US-603, AC-616
- Arquivos: apps/api/src/modules/orders/meus-pedidos.usecase.ts, apps/api/src/modules/orders/meus-pedidos.usecase.test.ts, apps/web/src/app/(conta)/minha-conta/pedidos/page.tsx, apps/web/src/app/(conta)/minha-conta/pedidos/[id]/page.tsx
- Notas: o cliente logado vê os pedidos dele em todas as lojas onde comprou, por caminho dedicado — e nenhuma loja enxerga o histórico da outra.
- Esforço: alto

## T-605 — Gerador de conteúdo do cupom, uma fonte para duas saídas [pendente]

- Refs: US-604, AC-619, AC-620, AC-621
- Arquivos: packages/core/src/cupom-blocos.ts, packages/core/src/cupom-blocos.test.ts, packages/core/src/cupom-largura.ts, packages/core/src/cupom-largura.test.ts, packages/core/src/**snapshots**/cupom-blocos.test.ts.snap
- Notas: um só gerador de blocos, parametrizado pela largura do papel, alimenta a impressão pelo navegador e a do agente — e um teste prova que as duas saídas têm o mesmo conteúdo, risco que o crítico apontou. Acento correto exige tratar a tabela de caracteres da impressora; alinhamento exige normalizar o texto antes de contar largura.
- Esforço: max

## T-606 — Impressão por clique no navegador [pendente]

- Refs: US-604, AC-617, AC-618
- Arquivos: apps/web/src/app/imprimir/[id]/page.tsx, apps/web/src/app/imprimir/[id]/cupom.css, e2e/specs/imprimir.spec.ts
- Notas: página de cupom sem o layout do aplicativo, com largura de papel configurada, para impressão direta pelo navegador sem instalar nada.
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
