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

## T-604 — Histórico do pedido na conta do cliente [concluida]

- Refs: US-603, AC-616
- Arquivos: apps/api/src/modules/orders/meus-pedidos.usecase.ts, apps/api/src/modules/orders/meus-pedidos.usecase.test.ts, apps/api/src/modules/orders/conta.routes.ts, apps/api/tests/meus-pedidos.test.ts, apps/api/tests/apoio-de-compra.ts, packages/contracts/src/conta.ts, packages/database/migrations/0029_operacao_do_pedido.sql, apps/web/src/lib/meus-pedidos.ts, apps/web/src/features/conta/MeusPedidos.tsx, apps/web/src/app/(conta)/minha-conta/pedidos/page.tsx, apps/web/src/app/(conta)/minha-conta/pedidos/loading.tsx, apps/web/src/app/(conta)/minha-conta/pedidos/[id]/page.tsx, apps/web/tests/meus-pedidos.test.tsx
- Notas: o cliente logado vê os pedidos dele em todas as lojas onde comprou, por caminho dedicado (`GET /v1/conta/pedidos` e `GET /v1/conta/pedidos/:id`, em `conta.routes.ts`, montado em `app.ts`) — e nenhuma loja enxerga o histórico da outra (prova P-003 em `meus-pedidos.test.ts`). O vínculo nasce no fechamento: com sessão de CLIENTE no cabeçalho, `pedidos.routes.ts` liga o pedido ao cliente-da-loja daquela identidade (`vincularClienteDaLoja`, pela política `sc_self_insert` da 0005); convidado segue sem vínculo (ASM-103), e falha no vínculo não derruba a venda — vira aviso no registro. A leitura cruza lojas pela função `app.meus_pedidos()` (0029, com os direitos de quem a definiu, só papel CUSTOMER e identidade do contexto), porque as políticas de `app.orders` são por loja e a restritiva exige loja no contexto — e isso fica como está. O detalhe reaproveita o caminho do link (T-603): a função diz a loja e o endereço público, e a página da conta é a mesma página do acompanhamento. Dívida compartilhada com o painel: as páginas leem o token de acesso do cookie `sc_access`, que só existe fora de produção até a identidade ser ligada à API (identidade-acesso).
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

## T-607 — Fila de impressão em banco com reivindicação e prazo [concluida]

- Refs: US-605, AC-624, AC-625
- Arquivos: packages/database/migrations/0034_fila_de_impressao.sql, packages/database/prisma/schema.prisma, packages/database/guards/g3_unica_por_loja.sql, packages/contracts/src/impressao.ts, packages/contracts/src/index.ts, apps/api/src/core/contexto.ts, apps/api/src/core/contexto.test.ts, apps/api/src/modules/printing/fila.usecase.ts, apps/api/src/modules/printing/fila.usecase.test.ts, apps/api/src/modules/printing/pedido-para-cupom.ts, apps/api/src/modules/printing/cupom.usecase.ts, apps/api/src/modules/orders/criar-pedido.usecase.ts, apps/api/tests/impressao-sem-duplicar.test.ts, apps/api/tests/isolamento-varredura.test.ts
- Notas: reivindicação com travamento que ignora linha ocupada, prazo de posse, repetição com espera crescente e estado final inspecionável. Cada trabalho tem identificador próprio, então confirmação perdida não imprime duas vezes. A migração é a 0034, número reservado no plano paralelo (a 0008 já é a de pedidos). Decisões de 03/10 (`.spec/design/decisoes.md`): o trabalho entra na fila na criação do pedido, por função SQL chamada na mesma transação, para o módulo `orders` não importar `printing`; a via é somada na PRIMEIRA reivindicação e reaproveitada nas seguintes, então o reenvio depois de confirmação perdida não soma via; imprimir por clique um cupom pendente cancela o trabalho da fila, e o cupom nunca sai duplicado; uma impressora por loja (Q-601 segue aberta). Como ficou: `app.print_agents` (só o sha256 da credencial; a chave global do resumo é exceção justificada na guarda G3) e `app.print_jobs` (QUEUED, LEASED, PRINTED, FAILED, DEAD, CANCELED; `blocks` nulo até a primeira reivindicação; `available_at` guarda a espera crescente de 5 s × 2^(n-1); DEAD na sexta tentativa). O papel novo `PRINT_AGENT` lê e muda só `print_jobs` da loja; não lê pedido — os dados do cupom saem de `app.cupom_do_trabalho`, com os direitos de quem a definiu, só para o trabalho que está com aquele agente, e é ela que soma a via. `app.enfileirar_impressao` (chamada em `criar-pedido.usecase.ts`) só enfileira com `store_settings.printing.automatico = true`; `app.registrar_batimento` atualiza o último contato e recusa agente revogado ou de outra loja. A tradução do pedido para o cupom (`pedido-para-cupom.ts`) é uma só para o clique e para a fila. Imprimir por clique cancela o trabalho ANTES de somar a via, na mesma ordem de trava da reivindicação (trabalho, depois pedido), para as duas transações não se esperarem. O contrato do agente e do painel (trabalho entregue, confirmação, falha, pareamento, estado do agente, pendentes) está em `packages/contracts/src/impressao.ts`; as rotas são da T-608.
- Esforço: max

## T-608 — Modo automático por chave e pareamento do agente [pendente]

- Refs: US-605, AC-622, AC-623, AC-626
- Arquivos: apps/api/src/modules/printing/parear.usecase.ts, apps/api/src/modules/printing/parear.usecase.test.ts, apps/api/src/modules/printing/entregar.usecase.ts, apps/web/src/app/(painel)/painel/config/impressao/page.tsx, apps/web/src/features/painel-pedidos/EstadoDoAgente.tsx
- Notas: nasce desligado, com a impressão por clique como padrão. Agente pareado por código curto, com credencial de escopo mínimo. Desligar o automático volta ao clique sem perder cupom pendente. As rotas do agente e do pareamento ficam num roteador próprio, para o portão de funcionalidade por loja (T-207) entrar numa linha só. O campo do automático entra na configuração de impressão como opcional com padrão desligado: o esquema é estrito, e campo obrigatório faria a configuração já gravada cair no padrão de 80 mm.
- Esforço: alto

## T-609 — Agente de impressão [pendente]

- Refs: US-605, AC-623, AC-624
- Arquivos: apps/agente-impressao/package.json, apps/agente-impressao/README.md, apps/agente-impressao/src/main.ts, apps/agente-impressao/src/agente.ts, apps/agente-impressao/src/cliente.ts, apps/agente-impressao/src/impressora-tcp.ts, apps/agente-impressao/src/diario.ts, apps/agente-impressao/src/agente.test.ts
- Notas: programa pequeno que consulta o servidor e escreve na impressora; não abre porta para a internet. Compila os blocos recebidos conforme o perfil da impressora daquela loja. Decisão de 03/10 (`.spec/design/decisoes.md`): Node/TypeScript dentro do monorepo, sem tecnologia nova, rodando com o Node 24 instalado na máquina da loja (sem empacotador nem executável único). Reaproveita `lerCupomImpresso`, `diagramarCupom` e `compilarEscPos` de `packages/core`, então não existe segunda implementação do cupom nem biblioteca ESC/POS. A versão 1 fala só com impressora de rede (TCP 9100, `node:net`); USB fica para decisão futura. Guarda num diário local o identificador de cada trabalho impresso, ANTES de confirmar, para que a confirmação reenviada não imprima de novo (AC-625). Q-603 continua aberta: o Node 24 roda nos três sistemas, mas a instalação como serviço não entra na versão 1.
- Esforço: max

## T-610 — Emulador de impressora para testar sem hardware [pendente]

- Refs: US-604, AC-620, AC-621
- Arquivos: infra/compose/docker-compose.yml, infra/scripts/testar-impressao.sh, packages/core/src/cupom-escpos-leitura.ts, packages/core/src/cupom-escpos-leitura.test.ts, apps/agente-impressao/src/emulador.ts, apps/agente-impressao/src/emulador.test.ts
- Notas: serviço no ambiente local que recebe a impressão e devolve pré-visualização, para validar acento, alinhamento e corte sem impressora física. Em Node/TypeScript (decisão de 03/10): servidor TCP na porta 9100 com `node:net`, que também roda dentro do processo do Vitest, sem Docker; no compose, substitui o nginx provisório do perfil `print`. O decodificador de ESC/POS (hoje `lerPapel`, dentro de `cupom-escpos.test.ts`) sobe para `packages/core` e passa a ser um só para o teste do gerador e para o emulador.
- Esforço: medio

## T-611 — Teste de ponta a ponta da operação [concluida]

- Refs: US-600, US-601, US-603, AC-600, AC-604, AC-612, AC-613, AC-614
- Arquivos: e2e/specs/painel-pedidos.spec.ts, e2e/specs/acompanhamento.spec.ts, e2e/fixtures/pedido-operacao.ts, apps/web/src/app/(loja)/l/[slug]/pedido/[token]/not-found.tsx
- Notas: cobre o pedido entrando na fila, o avanço de status refletindo na página do cliente, e a recusa de endereço adivinhado. O pedido nasce na vitrine, pelo caminho do cliente, e dono e cliente ficam em navegadores separados (`fixtures/pedido-operacao.ts`); o bipe é contado trocando o `AudioContext` da página, e cada cenário roda com a loja do painel só para ele (`comALojaDoPainelSoParaMim`, da T-908) e apaga os pedidos no fim. O ponta a ponta achou que link adivinhado caía na página "Esta loja não está disponível" (o `not-found` da loja): a página de acompanhamento ganhou o próprio `not-found.tsx`, "Pedido não encontrado". A impressão automática (AC-622..AC-626) não entra aqui: é da T-608/T-609. Os specs rodam fora da prova escopada (só Vitest), com `test:e2e:isolado`.
- Esforço: medio
