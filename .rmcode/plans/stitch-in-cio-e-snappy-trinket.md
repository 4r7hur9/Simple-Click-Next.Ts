# Plano #106 — Stitch · Início e descoberta (/explorar)

## Contexto

O Stitch reorganiza a descoberta do cliente numa página de Início com seções:
busca, stories, segmentos, suas lojas, destaques e ofertas, feed. Hoje
`/explorar` só redireciona para `/explorar/produtos`, que tem barra, chips,
stories e o feed de posts. A spec `.spec/features/stitch-inicio-descoberta`
(T-10601…T-10611) define o comportamento. Este plano roda **depois** do #104
(peças) e do #105 (navegação), na ordem sequencial do gerente. Nada é editado
até o gerente liberar. Sem commit, push ou troca de branch.

**Decisões já tomadas**

- Board (12/11): Plus Jakarta Sans, temas claro e escuro, funções "A decidir"
  ocultas, nenhum prazo inventado, cor #B7FF00.
- Usuário, neste turno:
  - **Q-10602 = A**: as seções ficam no topo de `/explorar/produtos`, e `/explorar` continua redirecionando.
  - **Q-10610**: o visitante vê um convite para entrar.
  - **Q-10611**: as coordenadas continuam na URL, arredondadas no servidor e fora dos logs.
  - **Q-10601/Q-10609**: vale a proposta. Ordem: busca → stories → segmentos → suas lojas → destaques → feed. Quantidades: 6 lojas, 8 destaques, feed em páginas de 12.
  - Q-10612 (desempate no SQL) fica fora. Vale a ASM-10606: a tela tira repetidos pela chave.

## Fatos verificados

- `explorar/page.tsx` faz `redirect("/explorar/produtos")` e **perde os parâmetros** da URL.
- A leitura de produtos não leva a sessão:
  - `_dados.ts` `conteudoDosProdutos(consulta)` e `acoes.ts` `maisPosts` chamam `buscarProdutosDoFeed` sem token.
  - `buscarProdutosDoFeed(consulta, buscar, token?)` já aceita o token na 3ª posição.
- Quando a sessão vence (401), a leitura repete sem token e não avisa ninguém. Isso acontece em:
  - `buscarProdutosDoFeed` e `buscarLojasDoFeed` (`server/feed.ts`);
  - `buscarStoriesDoFeed` (`feed-social.ts`);
  - `lojasSeguidas`, que transforma o 401 em `[]` (`_dados.ts`).
- `ler()` já usa `no-store`. Só os tipos de negócio usam `revalidate: 3600`, e essa leitura não leva sessão.
- O tamanho da página está fixo: `consultaDaApi` sempre manda `porPagina=24` (`POR_PAGINA`), e o teste legado `feed-consulta.test.ts:82` exige 24.
- `buscarLojasDaContaNoFeed` manda o `local` sem arredondar.
- O próprio aparelho guarda duas chaves: `sc:feed:local` (`CHAVE_DO_LOCAL`) e `sc:feed:stories-vistos` (`CHAVE_DOS_STORIES_VISTOS`).
- Existem quatro caminhos de saída, todos server actions com `redirect`: `sairDaConta` e `sairPelaBarra` (`server/actions/auth.ts`), "sair de todos" e `sairDepoisDeExcluirAConta` (`conta.ts`). Nenhum deles consegue apagar o `localStorage`.
- O compartilhar do `Post` monta o link com `pedir`, e não com `window.location`.
- `stories.css` tem 49 cores fixas. `feed.css` só usa tokens.
- Os testes legados do feed dependem de quatro coisas: as classes `.sc-feed__categoria`, `.sc-feed__listas` e `.sc-feed__chamada`, o `aria-current="page"` nas abas, e a grade que aparece sem `acoes`. Esses testes **não** estão na lista de arquivos que posso editar.

## Decisões de arquitetura

- **D-1 Cada seção carrega e falha sozinha.**
  - `produtos/page.tsx` só espera o que é rápido e necessário para o esqueleto: `tipos` (com cache público) e `tokenDaSessao`.
  - Cada seção é um componente assíncrono em `produtos/secoes.tsx` (stories, suas lojas, destaques e feed), dentro do seu próprio `<Suspense>` com esqueleto.
  - A apresentação fica em `features/feed/SecoesDoInicio.tsx`: componentes síncronos que recebem dados por props.
  - `TelaDoFeed` ganha slots opcionais `inicio?: { stories?, suasLojas?, destaques? }` e `feed?: ReactNode`. Sem `feed`, a prop `conteudo` continua obrigatória e o comportamento atual (grade, aba Lojas, testes legados) não muda. Com `feed`, a seção do feed recebe sozinha `seguidas`, `logado` e as ações.
  - O `loading.tsx` passa a mostrar só o esqueleto do topo.
- **D-2 O token fica no servidor.**
  - `conteudoDosProdutos(consulta, token)` recebe o token de `tokenDaSessao()`, tanto na página quanto em `maisPosts`. Nenhum token vem do navegador.
  - Leitura com `authorization` é sempre `no-store`. É proibido usar `unstable_cache` ou `"use cache"` em `_dados.ts`, `acoes.ts` e `server/feed*.ts`, e um teste confere isso.
- **D-3 Sessão vencida é sempre explícita.**
  - `LeituraDoFeed` e `ConteudoDoFeed` ganham o campo opcional `sessaoVencida?: true`. Ele vale para as quatro leituras com token: produtos, lojas, stories e lojas da conta.
  - Produtos, lojas e stories continuam repetindo sem token, para o feed público não sumir, mas agora marcam o campo.
  - Em `lojasDaConta`, o 401 vira o estado `sessao-vencida` e nunca o convite de visitante.
  - O resultado de `maisPosts` também leva `sessaoVencida`. `useMaisItens` e `FeedDePosts` passam o campo para a tela.
  - A tela esconde as estrelas e mostra uma única vez "Sua sessão venceu — Entrar de novo".
- **D-4 Uma leitura de favoritas por requisição.**
  - `lojasDaConta(quais, token, lat?, lng?)` usa `cache()` do React, com argumentos só primitivos e sem estado no módulo.
  - `lojasSeguidas` e "Suas lojas" usam essa mesma leitura com os mesmos argumentos.
  - O teste de duas contas prova o isolamento. A deduplicação só se prova no build ou no navegador, e isso é verificação manual.
- **D-5 O servidor fixa o tamanho de cada página.**
  - `consultaDaApi(consulta, opcoes?)`, com `opcoes = { porPagina?, ordem?, atacado? }`, só recebe constantes do servidor: `POR_PAGINA_DOS_POSTS = 12`, `POR_PAGINA_DOS_DESTAQUES = 8` e `LOJAS_NO_INICIO = 6`.
  - O padrão continua 24, para a aba Lojas e o teste legado.
  - `maisPosts` ignora `porPagina` e `ordem` vindos de `parametros`.
  - Os destaques respeitam os filtros de tipo, entrega e busca da consulta, mas usam sempre `ordem=recentes`. A aba "Atacado" acrescenta `atacado=1`.
- **D-6 As peças do #104 levam também as classes antigas.**
  - Chip, Abas, Gaveta e Cartão vêm do `@simpleclick/ui` e recebem a classe legada (`sc-feed__categoria` etc.) por `className`, ou por um invólucro local.
  - Testes legados **não são editados**. Se algum quebrar sem saída, a tarefa para e o gerente é avisado.
- **D-7 Localização (LGPD).**
  - `lerConsulta` arredonda lat e lng a 3 casas (`arredondarLocal`) e descarta valor fora da faixa. Por isso `consultaDaApi`, `enderecoDoFeed` e o redirecionamento só veem valores já arredondados.
  - `buscarLojasDaContaNoFeed` também arredonda.
  - Nenhuma coordenada vai para `console.*`.
  - A tela explica para que serve a localização antes de pedir a permissão.
  - A localização guardada ganha a marca `daConta: true` quando a pessoa tem sessão. "Visitante" é `!logado || sessaoVencida` (`TelaDoFeed` passa os dois a `BarraDoFeed`). Se a tela abre como visitante e encontra local com essa marca, apaga `sc:feed:local` e os stories vistos. Isso cobre os quatro caminhos de saída e a sessão que vence sozinha, sem depender de ninguém.
  - `limparDadosLocaisDoFeed()` fica exportada para o #105 chamar no botão Sair.
- **D-8 Rota (Q-10602 A).**
  - `explorar/page.tsx` lê `searchParams` com `lerConsulta("produtos", …)` e redireciona para `enderecoDoFeed(consulta)`. Nunca repassa o texto cru da URL.
  - `produtos/page.tsx` e `lojas/page.tsx` ganham título, descrição e canônico fixos (`/explorar/produtos`, `/explorar/lojas`), sem lat, lng nem dado de conta.
  - `sitemap.ts`, `routes.ts` e o tutorial não mudam.
- **D-9 Escopo liberado pelo gerente.**
  - T-10611 liberada: acrescentar asserções (sem enfraquecer nenhuma) em `apps/api/tests/favoritos-e-recentes.test.ts` e `feed-e-tema.test.ts` e criar `apps/api/tests/feed-isolamento-entre-contas.onp.test.ts`.
  - Tema do layout (`data-tema` fixo): perguntado ao gerente; sem resposta, fica fora.
  - Arquivo de card posterior (#107–#113): só mudança mínima, listada no `card_report`. Arquivo do #104/#105: não edito, peço.

## Subtarefas (em sequência)

**Pré-condição:** #104 e #105 concluídos e o gerente liberou.

**Testes:** novos arquivos `apps/web/tests/feed-*.onp.test.ts(x)`, com títulos `it("[CA-n] @spec:AC-106xx …")`.

**Validação em cada tarefa:** `pnpm exec vitest run <arquivo>`, os testes legados do feed, `pnpm typecheck` e `pnpm lint`.

1. **T-10601 Sessão nos produtos e sessão vencida.**
   - Arquivos: `_dados.ts`, `acoes.ts`, `produtos/page.tsx`, `server/feed.ts`, `server/feed-social.ts`, `useMaisItens.ts`, `FeedDePosts.tsx`.
   - Teste `feed-sessao.onp.test.ts`:
     - duas contas, com `fetch` falso que responde conforme o `authorization`, passando pelas páginas 1 e 3;
     - `no-store` em toda leitura;
     - nenhum `unstable_cache` nem `"use cache"`;
     - 401 marca `sessaoVencida`, sem estrelas falsas.
   - Critérios: AC-10611 (parte web), AC-10613, AC-10614.
2. **T-10602 Localização.**
   - Arquivos: `consulta.ts`, `BarraDoFeed.tsx`, `TelaDoFeed.tsx` (passa `logado` e `sessaoVencida`), `server/feed.ts`. Cria `limpar-dados-locais.ts`.
   - Teste `feed-localizacao.onp.test.ts`:
     - URL com 6 casas chega à API com 3;
     - valor fora da faixa é descartado;
     - `console` não recebe coordenada;
     - o texto de finalidade aparece antes de pedir;
     - local marcado `daConta` some quando a tela abre como visitante.
   - Critérios: AC-10616 a AC-10619.
3. **T-10603 Seções independentes e estados.**
   - Arquivos: `TelaDoFeed.tsx`, `Stories.tsx`, `_dados.ts`, `produtos/page.tsx`, `produtos/loading.tsx`, `lojas/page.tsx`. Cria `produtos/secoes.tsx` e `SecoesDoInicio.tsx`.
   - Teste `feed-estados.onp.test.tsx`: uma seção falha e as outras aparecem; sem stories, a faixa some inteira; sem produtos, aparece o aviso com caminho útil; com a API fora, "O feed não carregou" com "Tentar de novo".
   - Critérios: AC-10605, AC-10608, AC-10624 a AC-10626.
4. **T-10604 Suas lojas.**
   - Comportamento:
     - junta favoritas e recentes, sem repetir, favoritas primeiro, até 6;
     - "Ver todas" leva a `/explorar/lojas?lista=favoritas`;
     - visitante (`token === undefined`) vê o convite e o `fetch` não recebe nenhuma URL `/v1/conta/`;
     - sessão vencida mostra "Entrar de novo".
   - Arquivos: `SecoesDoInicio.tsx`, `Cartoes.tsx`, `consulta.ts`, `_dados.ts`, `produtos/secoes.tsx`.
   - Teste `feed-suas-lojas.onp.test.tsx`.
   - Critérios: AC-10610, AC-10612, AC-10615.
5. **T-10605 Busca, segmentos e filtros.**
   - Comportamento: Chip do #104 nos segmentos (só os tipos reais, mais "Tudo"), campo de busca do #104 e botão de filtros que mostra quantos estão ligados.
   - Arquivos: `BarraDoFeed.tsx`, `consulta.ts`, `TelaDoFeed.tsx`.
   - Teste `feed-busca-segmentos.onp.test.tsx`.
   - Critérios: AC-10606, AC-10607, AC-10609.
6. **T-10606 Destaques e feed em páginas.**
   - Comportamento:
     - destaques: 8 itens, abas "Recentes" e "Atacado" (Abas do #104);
     - o preço "de" só aparece com `precoOriginalCentavos`, e a linha de atacado só com faixa de atacado;
     - feed de 12 por página, com o mesmo tamanho na página e em `maisPosts`.
   - Arquivos: `_dados.ts`, `acoes.ts`, `FeedDePosts.tsx`, `Post.tsx`, `Cartoes.tsx`, `useMaisItens.ts`, `consulta.ts`, `SecoesDoInicio.tsx`, `produtos/secoes.tsx`.
   - Teste `feed-destaques-e-paginas.onp.test.tsx`:
     - a página 2 pede `pagina=2&porPagina=12` e traz o item 13;
     - páginas que se sobrepõem não repetem item;
     - quando a carga falha, aparece "Tentar de novo";
     - no fim, aparece o aviso de que não há mais publicações;
     - `porPagina=500` mandado pelo navegador é ignorado.
   - Critérios: AC-10620 a AC-10622.
7. **T-10607 Composição.**
   - Comportamento:
     - as seções na ordem decidida, com "Ver todas" ou "Ver tudo" e sem banner;
     - celular em 1 coluna, com faixas que rolam na horizontal;
     - tablet com 2 colunas de lojas e 3 de destaques;
     - computador com 3 e 4 colunas, e o post com a foto ao lado do texto;
     - as cores de `stories.css` viram tokens `--cor-*`.
   - Arquivos: `TelaDoFeed.tsx`, `feed.css` (só seletores do `/explorar`, nunca `.sc-pagina-da-loja`), `stories.css`.
   - Teste `feed-composicao.onp.test.tsx`: confere a ordem no DOM, a ausência de banner e de cor fixa em `stories.css`, e as classes de grade.
   - Critérios: AC-10601 a AC-10604.
8. **T-10608 Ações, Gaveta e teclado.**
   - Comportamento: comentários na Gaveta do #104; curtir com ✦, favoritar com ★ e `IconeCompartilhar`; o compartilhar continua usando `pedir`; foco visível do #104.
   - Arquivos: `GavetaDeComentarios.tsx`, `Post.tsx`, `MidiaDoPost.tsx`, `BotaoFavoritar.tsx`, `Stories.tsx`.
   - Teste `feed-acoes.onp.test.tsx`.
   - Critérios: AC-10623, AC-10631.
9. **T-10609 Nada do mockup nem das funções "A decidir".**
   - Teste `feed-sem-mockup.onp.test.tsx`: varre o HTML do Início e os arquivos de `features/feed/*` procurando os textos proibidos.
   - Critérios: AC-10627, AC-10628.
10. **T-10610 Links e metadados.**
    - Arquivos: `explorar/page.tsx`, `produtos/page.tsx`, `lojas/page.tsx`.
    - Teste `feed-links-e-metadados.onp.test.tsx`:
      - `/explorar?busca=pão&lat=-23.5512345` redireciona com a busca e a lat arredondada;
      - o canônico e o título não levam lat, lng nem dado de conta.
    - Critérios: AC-10629, AC-10630.
11. **T-10611 Isolamento entre contas na API** (liberada pelo gerente). Acrescenta asserções em `apps/api/tests/favoritos-e-recentes.test.ts` e `apps/api/tests/feed-e-tema.test.ts` e cria `apps/api/tests/feed-isolamento-entre-contas.onp.test.ts`.
    - Ordem das chamadas: conta A → visitante → conta B, em `/v1/feed/produtos`, `/v1/conta/favoritos` e `/v1/conta/recentes`.
    - O visitante recebe 401 em `/v1/conta/*`. `cache-control: private, no-store` só é conferido nas respostas 200 (A, B e o feed público).
    - Usa `criarProduto` de `@simpleclick/testing` e `sessao()` do apoio da fundação. O helper local `produto()` não é exportado.
    - O nome `.onp` foi pedido pelo gerente. O motor enxerga a tag `@spec:AC-10611`, mas o `verify` não roda o api-int, então o AC-10611 fica sem resultado no `verify` até o #114 propor o segundo comando (ASM-10604).
    - Roda com `pnpm test:int`.
    - Critério: AC-10611.

## Riscos

- Teste legado quebra com as peças novas. Mitigação: D-6 (classe somada). Se não houver saída, paro e aviso o gerente.
- O export real das peças do #104 difere do design §5. Mitigação: adaptar ao export real. Se a peça não existir, a tarefa pausa.
- Resposta com sessão servida a outra pessoa. Mitigação: `no-store`, teste de duas contas, proibição de cache do Next e `cache()` só por requisição.
- Seção lenta segura a página. Mitigação: D-1 (a página só espera os tipos, que têm cache, e o token).
- Coordenada vaza em URL, log ou metadados. Mitigação: D-7 e D-8, com testes.
- Conflito de `feed.css` com o #107. Mitigação: só seletores do `/explorar`.

## Verificação

- `pnpm exec vitest run apps/web/tests/feed-` (os novos `.onp` e os legados).
- Gate: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm build` e `pnpm test:e2e` (os e2e legados do `/explorar` precisam continuar verdes). Para a T-10611, também `pnpm test:int`.
- `onp-spec audit` filtrado por `stitch-inicio-descoberta`, sem erro de estrutura.
- Verificação manual no navegador, em 390 e 1280px, nos temas claro e escuro, logado e como visitante:
  - ordem das seções;
  - sem rolagem lateral;
  - convite para o visitante;
  - estrelas certas na página 3;
  - uma única leitura de favoritas por requisição.
