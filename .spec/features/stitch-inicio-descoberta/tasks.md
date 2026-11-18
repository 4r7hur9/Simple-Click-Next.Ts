# Tarefas: Início e Descoberta do cliente (redesign Stitch)

> feature: stitch-inicio-descoberta

<!--
  Card #106. Todas pendentes: implementação NÃO autorizada.
  Execução futura: uma tarefa após a outra, na pasta principal, sem worktree
  (várias tarefas compartilham features/feed/*, consulta.ts e feed.css).
  Testes só *.onp.test.ts(x), com título "[CA-n] @spec:AC-106xx …".
  Em "Arquivos" só entram caminhos que já existem; o que nasce vai na linha
  "A criar". Nenhuma tarefa depende de função "A decidir" (#115–#126).
  Esperas por outros cards ficam em "Notas": peças do #104 (T-10405, T-10406)
  e o botão de sair do #105.
-->

## Perguntas que bloqueiam tarefas

| Pergunta | Bloqueia | O que fica parado                                                            |
| -------- | -------- | ---------------------------------------------------------------------------- |
| Q-10601  | T-10607  | ordem das seções na composição                                               |
| Q-10602  | T-10610  | se /explorar vira o Início ou as seções entram no topo de /explorar/produtos |
| Q-10603  | nenhuma  | o banner fica fora; só nasce tarefa nova se for aprovado                     |
| Q-10605  | nenhuma  | personalização além dos filtros fica fora                                    |
| Q-10606  | nenhuma  | o cartão continua levando ao produto na loja                                 |
| Q-10609  | T-10607  | quantos itens cada seção mostra antes do "ver tudo"                          |
| Q-10610  | T-10604  | convite ou lojas novas para o visitante sem conta                            |
| Q-10611  | T-10602  | se as coordenadas saem do endereço da página                                 |
| Q-10612  | T-10606  | desempate fixo da ordem do feed                                              |

## T-10601 — Sessão na leitura de produtos e sessão vencida [pendente]

- Refs: US-10603, AC-10611, AC-10613, AC-10614
- Arquivos: apps/web/src/app/(explorar)/explorar/_dados.ts, apps/web/src/app/(explorar)/explorar/acoes.ts, apps/web/src/app/(explorar)/explorar/produtos/page.tsx, apps/web/src/server/feed.ts
- A criar: apps/web/tests/feed-sessao.onp.test.ts
- Notas: `conteudoDosProdutos` passa a receber o token, lido por
  `tokenDaSessao()` no servidor na página e em `maisPosts`, nunca vindo do
  navegador. `buscarProdutosDoFeed` recebe o token na 3ª posição. Toda leitura
  com `authorization` usa `no-store`. A nova tentativa sem sessão deixa de
  devolver estrelas falsas em silêncio: vira estado "sessão vencida". Testes
  conferem a página 1 e a página 3, o cabeçalho enviado e o `no-store`.

## T-10602 — Localização com pouca precisão e sem log [pendente]

- Refs: US-10604, AC-10616, AC-10617, AC-10618, AC-10619
- Arquivos: apps/web/src/features/feed/consulta.ts, apps/web/src/features/feed/BarraDoFeed.tsx, apps/web/src/server/feed.ts
- A criar: apps/web/src/features/feed/limpar-dados-locais.ts, apps/web/tests/feed-localizacao.onp.test.ts
- Notas: `lerConsulta` e `consultaDaApi` arredondam `lat` e `lng` a 3 casas e
  descartam valor fora da faixa; nenhuma coordenada vai para log. Texto de
  finalidade antes de pedir a permissão. `limparDadosLocaisDoFeed` apaga
  `sc:feed:local` e os stories vistos; quem a chama ao sair é o #105 (pedido
  enviado por mensagem). Depende da T-10601 (mesmo `server/feed.ts`). Se a
  Q-10611 mandar tirar as coordenadas do endereço, a parte de URL vira tarefa
  nova.

## T-10603 — Seções independentes e estados vazios [pendente]

- Refs: US-10601, US-10606, AC-10605, AC-10608, AC-10624, AC-10625, AC-10626
- Arquivos: apps/web/src/features/feed/TelaDoFeed.tsx, apps/web/src/features/feed/Stories.tsx, apps/web/src/app/(explorar)/explorar/_dados.ts, apps/web/src/app/(explorar)/explorar/produtos/page.tsx, apps/web/src/app/(explorar)/explorar/produtos/loading.tsx, apps/web/src/app/(explorar)/explorar/lojas/page.tsx
- A criar: apps/web/tests/feed-estados.onp.test.tsx
- Notas: cada seção lê e falha sozinha; carga progressiva por seção (Suspense)
  para a mais lenta não segurar as outras (hoje são 5 leituras em paralelo,
  com até 5 s cada). Sem stories a faixa e o título somem; sem produtos aparece
  o aviso com caminho útil; fora do ar, "O feed não carregou" com "Tentar de
  novo". Lista os estados que o #114 cruza (design.md, seção 7). Depende da
  T-10601.

## T-10604 — Seção "Suas lojas" [pendente]

- Refs: US-10603, AC-10610, AC-10612, AC-10615
- Arquivos: apps/web/src/features/feed/FeedDeLojas.tsx, apps/web/src/features/feed/Cartoes.tsx, apps/web/src/features/feed/PostDeLoja.tsx, apps/web/src/features/feed/consulta.ts, apps/web/src/app/(explorar)/explorar/_dados.ts
- A criar: apps/web/tests/feed-suas-lojas.onp.test.tsx
- Notas: favoritas e recentes da própria conta pela leitura que já existe
  (`buscarLojasDaContaNoFeed`); a janela de 30 dias e o limite de 20 são da
  API. O visitante nunca dispara `/v1/conta/*`: vê o convite ou a seção some
  (Q-10610). "Aberta agora" só aparece se a leitura trouxer o horário
  (ASM-10607). Depende da T-10603.

## T-10605 — Busca, segmentos e filtros rápidos [pendente]

- Refs: US-10602, AC-10606, AC-10607, AC-10609
- Arquivos: apps/web/src/features/feed/BarraDoFeed.tsx, apps/web/src/features/feed/consulta.ts, apps/web/src/features/feed/TelaDoFeed.tsx
- A criar: apps/web/tests/feed-busca-segmentos.onp.test.tsx
- Notas: chips de segmento trocados pelo Chip do #104 (espera a T-10405 do
  #104); só tipos de negócio reais mais "Tudo". A busca guarda o termo no
  endereço. Botão de filtros com a contagem dos ligados. Depende da T-10604
  (mesmo `consulta.ts`).

## T-10606 — Destaques, ofertas e feed paginado [pendente]

- Refs: US-10605, AC-10620, AC-10621, AC-10622
- Arquivos: apps/web/src/features/feed/FeedDePosts.tsx, apps/web/src/features/feed/Post.tsx, apps/web/src/features/feed/Cartoes.tsx, apps/web/src/features/feed/useMaisItens.ts, apps/web/src/features/feed/consulta.ts, apps/web/src/features/feed/TelaDoFeed.tsx
- A criar: apps/web/tests/feed-destaques-e-paginas.onp.test.tsx
- Notas: preço "de" só com `precoOriginalCentavos`; atacado só com faixa;
  abas "Recentes" e "Atacado" (sem "Mais pedidos"). A rolagem soma a página
  seguinte sem repetir nem pular; "Tentar de novo" e fim da lista. O
  desempate fixo da ordem depende da Q-10612 (a mudança de SQL é de outro
  card e não faz parte desta tarefa). Depende da T-10605.

## T-10607 — Composição em celular, tablet e computador [pendente]

- Refs: US-10601, AC-10601, AC-10602, AC-10603, AC-10604
- Arquivos: apps/web/src/features/feed/TelaDoFeed.tsx, apps/web/src/features/feed/feed.css, packages/ui/styles/stories.css
- A criar: apps/web/tests/feed-composicao.onp.test.tsx
- Notas: ordem das seções conforme a Q-10601; "Ver todas" em cada seção; sem
  banner (AC-10604). Estilos só por tokens `--cor-*` e peças do #104
  (P-102, P-108). `feed.css` está na fila #106 → #107 e `stories.css` na fila
  #104 → #106 → #112. O estouro lateral em 344px e a prova por largura são do
  #114 (AC-11415). Depende das T-10603 a T-10606.

## T-10608 — Ações das publicações, Gaveta e teclado [pendente]

- Refs: US-10605, US-10608, AC-10623, AC-10631
- Arquivos: apps/web/src/features/feed/GavetaDeComentarios.tsx, apps/web/src/features/feed/Post.tsx, apps/web/src/features/feed/MidiaDoPost.tsx, apps/web/src/features/feed/BotaoFavoritar.tsx, apps/web/src/features/feed/Stories.tsx
- A criar: apps/web/tests/feed-acoes.onp.test.tsx
- Notas: a gaveta de comentários passa para a Gaveta do #104 (espera a T-10406
  do #104); curtir é ✦ e favoritar é ★ (AC-10405 e AC-10406 do #104); foco
  visível pelo AC-10417 do #104. Todas as ações atuais continuam funcionando
  (ASM-10601). Teclado na jornada completa e axe são do #114. Depende da
  T-10607.

## T-10609 — Funções a decidir ocultas e nada do mockup [pendente]

- Refs: US-10607, AC-10627, AC-10628
- Arquivos: apps/web/src/features/feed/TelaDoFeed.tsx
- A criar: apps/web/tests/feed-sem-mockup.onp.test.tsx
- Notas: teste lê o resultado das telas do Início e os arquivos da pasta
  `features/feed` e confere a ausência de "Universokar", "Entrega Flash",
  "Suporte 24h", "45 min", "Sem taxas ocultas", de nota com estrela, selo de
  loja, "Mais vendidos", "Em alta", "Top oferta" e de bloco de dicas. A
  varredura transversal dos dados do Stitch é do #114 (AC-11421); esta cobre
  só o Início. Depende da T-10608.

## T-10610 — Links atuais, título e endereço canônico [pendente]

- Refs: US-10608, AC-10629, AC-10630
- Arquivos: apps/web/src/app/(explorar)/explorar/page.tsx, apps/web/src/app/(explorar)/explorar/produtos/page.tsx, apps/web/src/app/(explorar)/explorar/lojas/page.tsx, apps/web/src/app/sitemap.ts, apps/web/src/lib/routes.ts
- A criar: apps/web/tests/feed-links-e-metadados.onp.test.tsx
- Notas: se a Q-10602 mantiver as seções em /explorar/produtos (recomendado),
  só título, descrição e endereço canônico mudam. Se o /explorar virar o
  Início, o redirecionamento de links antigos com parâmetros continua e o
  mapa do site, o tutorial (`features/tutorial/passos.ts`) e o menu do
  usuário são conferidos com os donos. Nenhum metadado traz dado de conta.
  Depende da T-10609.

## T-10611 — Prova de isolamento entre duas contas na API [pendente]

- Refs: US-10603, AC-10611
- Arquivos: apps/api/tests/favoritos-e-recentes.test.ts, apps/api/tests/feed-e-tema.test.ts
- Notas: duas contas A e B, cada uma com favoritas, visitas e produtos
  favoritos diferentes; confere `/v1/feed/produtos`, `/v1/conta/favoritos` e
  `/v1/conta/recentes`. Roda no projeto `api-int`, que o `onp-spec verify` não
  executa; fica sem prova no `verify` até o #114 propor o segundo comando
  (ASM-10604). Não usa o nome `*.onp.test`, então o motor não o enxerga.
  Pode andar em paralelo às demais, pois só toca arquivos de teste da API.
