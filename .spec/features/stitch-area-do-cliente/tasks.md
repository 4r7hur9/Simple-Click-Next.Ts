# Tarefas: Continuidade visual de favoritos, pedidos e perfil do cliente

> feature: stitch-area-do-cliente

<!--
  Card #111 — bloco de códigos 11101 a 11199. Todas [pendente]: implementação
  NÃO autorizada. Execução futura: uma tarefa após a outra, na pasta
  principal, sem worktree (conta.css e as páginas de /conta são compartilhados
  entre as tarefas). Testes só *.onp.test.ts(x) com título
  "[CA-n] @spec:AC-111xx …". Nenhuma tarefa depende de função "A decidir".
  "Arquivos" lista só caminhos que já existem; o que nasce novo está em
  "A criar" (o motor ignora essa linha).
-->

## Dependências de outros cards e perguntas que bloqueiam

| Dependência | Onde                                                         | O que fica parado                                       |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| #104        | peças (Chip, Abas, AvisoFlutuante, estrela) e tokens         | todas as tarefas de tela                                |
| #105        | guarda de `/conta` com retorno, barra inferior, `sessao.tsx` | T-11101 e T-11108 (ordem #105 → #111)                   |
| #112        | `packages/ui/styles/pedidos.css` (linha do tempo)            | T-11104 (ordem #112 → #111)                             |
| #106        | `features/feed/BotaoFavoritar.tsx`                           | T-11102 (a estrela é dele; peço a vaga antes)           |
| Q-11101     | T-11101 a T-11108                                            | quais telas entram na primeira onda                     |
| Q-11103     | T-11101                                                      | substituir ou manter a `LateralDoUsuario`, hub "Perfil" |
| Q-11104     | T-11101                                                      | tema da conta e lateral escura forçada                  |
| Q-11105     | T-11109                                                      | corrigir o favorito aqui ou em card próprio             |
| Q-11106     | T-11109                                                      | proteção de origem e de tipo de conteúdo                |
| Q-11107     | T-11103                                                      | lista de pedidos atualizar sozinha                      |
| Q-11108     | T-11101                                                      | métricas da visão geral                                 |
| Q-11109     | T-11102                                                      | "Favoritar" ou "Seguir" loja                            |
| Q-11110     | T-11106                                                      | CPF e telefone mascarados na leitura                    |
| Q-11111     | T-11110                                                      | teste legado vale como prova de isolamento              |

## T-11101 — Moldura e navegação interna da conta [pendente]

- Refs: US-11106, AC-11122, AC-11124
- Arquivos: apps/web/src/app/(conta)/conta/layout.tsx, apps/web/src/app/(conta)/conta/page.tsx, apps/web/src/features/conta/PaginaDaConta.tsx, apps/web/src/features/conta/VisaoGeralDaConta.tsx, apps/web/src/features/usuario/LateralDoUsuario.tsx, packages/ui/styles/conta.css, packages/ui/styles/usuario.css
- Depende de: #104, #105, Q-11101, Q-11103, Q-11104, Q-11108
- Modelo: claude-opus-5-5
- Esforço: alto
- Notas: lista das seções da conta (Visão geral, Pedidos, Favoritos, Dados,
  Endereços, Segurança) com a atual marcada e anunciada como página atual. No
  celular, `/conta` vira a página inicial das seções se a Q-11103 aprovar.
  Não editar `app/_usuario/sessao.tsx` nem `lib/quem-esta-logado.ts` (são do
  #105): se precisar de item novo no menu, pedir a vaga por `board_message`.
  Manter o `data-tema` conforme a Q-11104.

## T-11102 — Favoritos [pendente]

- Refs: US-11101, AC-11101, AC-11102, AC-11103, AC-11104, AC-11130
- Arquivos: apps/web/src/app/(conta)/conta/favoritos/page.tsx, apps/web/src/features/conta/LojasDaConta.tsx, packages/ui/styles/conta.css
- Depende de: T-11101, #104, Q-11101, Q-11109
- Modelo: claude-opus-5-5
- Esforço: alto
- Notas: blocos separados (produtos, lojas favoritas, recentes de 30 dias) com
  cartões do #104. A estrela do cartão é `features/feed/BotaoFavoritar.tsx`
  (dono #106); usar sem editar ou pedir a vaga. Estado pendente e erro de
  ação (AC-11130). A correção do caminho de remoção NÃO está aqui: é a T-11109.

## T-11103 — Lista de pedidos e filtros [pendente]

- Refs: US-11102, AC-11105, AC-11106, AC-11107, AC-11130
- Arquivos: apps/web/src/app/(conta)/conta/pedidos/page.tsx, apps/web/src/app/(conta)/conta/pedidos/loading.tsx, apps/web/src/features/conta/MeusPedidos.tsx, apps/web/src/features/conta/FiltrosDePedidos.tsx, packages/ui/styles/conta.css
- Depende de: T-11102, #104, Q-11101, Q-11107
- Modelo: claude-opus-5-5
- Esforço: alto
- Notas: cartões de pedido com chip de estado (`tomDoStatus`) e texto do
  cliente (`rotuloDoStatus`); cancelado com aparência própria. Filtros de
  situação, período e loja continuam como parâmetros do endereço. Atualizar
  sozinha só se a Q-11107 aprovar.

## T-11104 — Detalhe do pedido e linha do tempo [pendente]

- Refs: US-11103, AC-11108, AC-11109, AC-11110
- Arquivos: apps/web/src/app/(conta)/conta/pedidos/[id]/page.tsx, apps/web/src/features/pedido/AcompanhamentoDoPedido.tsx, apps/web/src/features/pedido/LinhaDoTempo.tsx, packages/ui/styles/pedidos.css
- Depende de: T-11103, #104, #112
- Modelo: claude-opus-5-5
- Esforço: alto
- Notas: `pedidos.css` é do #112 (ordem #112 → #111): pedir a vaga antes. O
  intervalo de 5 segundos já existe e não muda. Etapa desconhecida mostra texto
  neutro. Pedido de outra pessoa e inexistente usam a mesma tela.

## T-11105 — Acompanhamento público por código [pendente]

- Refs: US-11103, AC-11111, AC-11112
- Arquivos: apps/web/src/app/(loja)/loja/[slug]/pedido/[token]/page.tsx, apps/web/src/app/(loja)/loja/[slug]/pedido/[token]/not-found.tsx, apps/web/src/lib/acompanhamento.ts
- Depende de: T-11104, #105
- Modelo: claude-opus-5-5
- Esforço: alto
- Notas: a moldura da loja (`(loja)/loja/[slug]/layout.tsx`) é do #105. Só os
  campos de `esquemaDoAcompanhamento` aparecem (telefone mascarado). Manter
  `robots` noindex e a busca sem cache (`no-store`, já existentes). Código
  mal formado, inexistente e de outra loja usam a mesma tela.

## T-11106 — Dados e endereços [pendente]

- Refs: US-11104, AC-11113, AC-11114, AC-11130
- Arquivos: apps/web/src/app/(conta)/conta/dados/page.tsx, apps/web/src/app/(conta)/conta/enderecos/page.tsx, apps/web/src/features/conta/DadosDaConta.tsx, apps/web/src/features/conta/EnderecosSalvos.tsx, packages/ui/styles/conta.css
- Depende de: T-11105, #104, Q-11101, Q-11110
- Modelo: claude-opus-5-5
- Esforço: alto
- Notas: e-mail continua fixo, com a explicação. Um só endereço padrão. O
  seletor de endereços do fechamento do pedido é do #110 e usa outra tela.

## T-11107 — Segurança, privacidade e aplicativo autenticador [pendente]

- Refs: US-11104, US-11105, AC-11115, AC-11116, AC-11117, AC-11118, AC-11121, AC-11130
- Arquivos: apps/web/src/app/(conta)/conta/seguranca/page.tsx, apps/web/src/app/(conta)/conta/seguranca/aplicativo/page.tsx, apps/web/src/app/(conta)/conta/seguranca/aplicativo/AtivacaoDoAplicativo.tsx, apps/web/src/features/conta/SegurancaDaConta.tsx, apps/web/src/features/conta/PrivacidadeDaConta.tsx, packages/ui/styles/conta.css
- Depende de: T-11106, #104, Q-11101
- Modelo: claude-opus-5-5
- Esforço: alto
- Notas: a tela de troca de senha diz a janela de até 15 minutos e não promete
  encerramento imediato. A exclusão mostra as respostas (senha incorreta, conta
  com loja, conta de administração, limite de exportação). Chave e códigos do
  aplicativo nunca em endereço, título ou armazenamento. Filtro extra na API
  para encerrar conexão (Q-11112) não é desta tarefa: fica para card de
  segurança.

## T-11108 — Sair, troca de conta e acesso vencido [pendente]

- Refs: US-11105, US-11107, AC-11119, AC-11120, AC-11127
- Arquivos: apps/web/src/server/actions/auth.ts, apps/web/src/server/actions/conta.ts, apps/web/src/lib/conta-do-cliente.ts, apps/web/src/lib/meus-pedidos.ts
- Depende de: T-11107, #105
- Modelo: claude-opus-5-5
- Esforço: alto
- Notas: sair apaga os cookies mesmo se a revogação falhar, com aviso. Depois
  de sair, as telas da conta não reaproveitam dados de A para B (cache de
  rota, estado de cliente). O laço de acesso vencido (AC-11127) depende da
  guarda de `/conta` do #105; aqui só entra o que não é navegação.

## T-11109 — Proxy da conta: remoção de favorito e proteção das ações [pendente]

- Refs: US-11107, AC-11125, AC-11126
- Arquivos: apps/web/src/app/api/conta/[...resto]/route.ts, apps/web/src/server/encaminhar-a-loja.ts
- Depende de: Q-11105, Q-11106
- Modelo: claude-opus-5-5
- Esforço: alto
- Notas: **bloqueada por duas perguntas**: não editar sem resposta. Se
  aprovada, trocar o padrão de `favoritos/[a-z0-9-]+` por um que aceite só
  `favoritos/produtos/<uuid>`, com tabela caminho × método e testes negativos;
  e responder 403 para origem de fora e 415 para corpo que não seja JSON.
  Nenhuma mudança em `apps/api` nem no banco.

## T-11110 — Provas onp e regressão [pendente]

- Refs: US-11108, AC-11128, AC-11129, AC-11130, AC-11101, AC-11105, AC-11113
- Arquivos: apps/web/tests/meus-pedidos.test.tsx, apps/web/tests/acompanhamento-pedido.test.tsx, apps/web/tests/conta-enderecos.test.tsx, apps/web/tests/lateral-do-usuario.test.tsx
- Depende de: T-11101 a T-11109, Q-11111
- Modelo: claude-opus-5-5
- Esforço: alto
- A criar: apps/web/tests/area-do-cliente-favoritos.onp.test.tsx, apps/web/tests/area-do-cliente-pedidos.onp.test.tsx, apps/web/tests/area-do-cliente-perfil.onp.test.tsx, apps/web/tests/area-do-cliente-sessao.onp.test.tsx, apps/web/tests/area-do-cliente-proxy.onp.test.ts
- Notas: os testes listados em "Arquivos" são os atuais e devem seguir passando
  **sem alteração** (AC-11128); os novos são os `*.onp.test.*`. Título de cada
  teste com `[CA-n] @spec:AC-111xx`. Teste da web com `fetch` simulado prova a
  tela; o isolamento entre pessoas é provado pelos testes atuais de
  `apps/api/tests` (`meus-pedidos.test.ts`, `favoritos-e-recentes.test.ts`,
  `enderecos-do-cliente.int.test.ts`, `rotas-da-conta-segura.test.ts`,
  `lgpd-conta.test.ts`, `acompanhamento-nao-enumeravel.test.ts`) e pelo e2e do
  #114. Varredura de texto do Stitch (P-105) e de automotivo (P-104).
