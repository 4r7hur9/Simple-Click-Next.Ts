# Tarefas: Cabeçalho, navegação móvel e rodapé do cliente

> feature: stitch-navegacao-cliente

<!--
  Card #105 — bloco de códigos 10501 a 10599.
  Todas pendentes: implementação NÃO autorizada. Execução futura: uma tarefa
  após a outra, na pasta principal, sem worktree (várias compartilham
  quem-esta-logado.ts, legal.css e as molduras). Testes só *.onp.test.ts(x)
  com título "[CA-n] @spec:AC-105xx …". Nenhuma tarefa depende de função
  "A decidir" (#115–#126).
  "Arquivos" lista só caminhos que já existem; arquivos novos ficam em
  "A criar" (nota do #115). "Pedir a" marca arquivo de outro dono: não editar
  antes de o dono liberar (fila do §9 do design.md). Referências a tarefas e
  critérios do #104, #106, #110 e #114 estão em texto e não em Refs.
-->

## Perguntas que bloqueiam tarefas

| Pergunta | Bloqueia         | O que fica parado                                              |
| -------- | ---------------- | -------------------------------------------------------------- |
| Q-10501  | T-10503, T-10505 | destino do item Lojas e o item ativo dentro da loja            |
| Q-10502  | T-10509          | se a barra da sacola substitui ou empilha com a barra inferior |
| Q-10503  | T-10506          | como o cliente escolhe a localização                           |
| Q-10504  | T-10507          | o que a sacola do topo faz fora da loja                        |
| Q-10505  | T-10508          | destino da lateral do usuário e do tutorial                    |
| Q-10506  | T-10510          | qual rodapé em cada moldura                                    |
| Q-10507  | T-10509          | quem define `viewportFit` e os níveis de camada                |
| Q-10508  | T-10511          | `Referrer-Policy`                                              |
| Q-10509  | T-10506          | texto da política sobre localização antes de oferecer o botão  |
| Q-10510  | T-10505          | extensão da `BarraInferior` do #104 ou barra própria           |

## T-10501 — Validador único de retorno em `lib/` [pendente]

- Refs: US-10505, AC-10513
- Arquivos: apps/web/src/features/auth/destino-seguro.ts, apps/web/src/lib/quem-esta-logado.ts
- A criar: apps/web/src/lib/destino-seguro.ts, apps/web/tests/retorno-ao-destino.onp.test.ts
- Mover `destinoSeguro`, `destinoDosParametros` e `comDestino` para `lib/`,
  com reexportação em `features/auth/destino-seguro.ts` (a regra de fronteira
  impede o servidor de importar de `features/`). `enderecoComRetorno` passa a
  chamar o validador único.
- Testes com os casos hostis: `//evil.com`, `/\evil`, `%0d%0a`, `/api/x`,
  `/entrar?proximo=…`, mais de 512 caracteres. O lint de fronteiras tem de
  passar.

## T-10502 — Retorno ao destino nas páginas de conta, na escolha de loja e na verificação [pendente]

- Refs: US-10505, AC-10511, AC-10512
- Arquivos: apps/web/src/app/(conta)/conta/_token.ts, apps/web/src/app/(conta)/conta/page.tsx, apps/web/src/app/(conta)/conta/dados/page.tsx, apps/web/src/app/(conta)/conta/enderecos/page.tsx, apps/web/src/app/(conta)/conta/favoritos/page.tsx, apps/web/src/app/(conta)/conta/pedidos/page.tsx, apps/web/src/app/(conta)/conta/pedidos/[id]/page.tsx, apps/web/src/app/(conta)/conta/seguranca/page.tsx, apps/web/src/app/(conta)/escolher-loja/page.tsx, apps/web/src/app/(conta)/escolher-loja/nova/page.tsx, apps/web/src/app/(conta)/entrar/verificacao/page.tsx
- Depende de: T-10501
- Pedir a: gerente (dono das páginas de `/conta` e da verificação) e #111
  (ordem das mudanças nas páginas de conta).
- `tokenOuEntrar` recebe o caminho da página. Cobrir os dois `redirect`
  (sem token e "não autenticado") de cada página. Na verificação em duas
  etapas manter `proximo` nas linhas 42, 71 e 86; `orientarPara` (gerar
  códigos de recuperação) tem prioridade; o destino nunca é tela de acesso.
- Prova estrutural: nenhum `redirect("/entrar")` literal em `app/(conta)`.
- `server/loja-da-pagina.ts` e o layout do painel ficam de fora (#112).

## T-10503 — Regras puras da navegação [pendente]

- Refs: US-10501, US-10505, US-10507, US-10508, AC-10501, AC-10503, AC-10514, AC-10515, AC-10524, AC-10525
- Arquivos: apps/web/src/lib/quem-esta-logado.ts, apps/web/src/features/legal/RodapeLegal.tsx
- A criar: apps/web/src/features/navegacao/regras.ts, apps/web/tests/navegacao-do-cliente.onp.test.tsx
- Depende de: T-10501
- Itens do topo e da barra; tabela rota→item com **exatamente um ativo**
  (seção 2.2 do design); itens por papel com testes negativos (`/painel` e
  `/admin`); `proximo` reduzido a `/loja/[slug]` nas rotas com segredo
  (`/pedido/[token]`) e sem `lat` nem `lng`; uma regra só de "sem barra"
  (`caminhoSemBarra`) para topo, barra e rodapé (o rodapé usa hoje outra
  expressão).
- O papel vem só de `usuarioDoPedidoAtual`. Destino do item Lojas e item
  ativo dentro da loja dependem da Q-10501.

## T-10504 — Topo do cliente no celular e no computador [pendente]

- Refs: US-10501, US-10508, AC-10501, AC-10502, AC-10504, AC-10525
- Arquivos: apps/web/src/features/usuario/LateralDoUsuario.tsx, packages/ui/styles/usuario.css
- A criar: apps/web/src/features/navegacao/TopoDoCliente.tsx, packages/ui/styles/navegacao.css
- Depende de: T-10503
- Pedir a: #106 (contrato exportado para montar o endereço do feed
  preservando filtros e para focar a busca) e #111 (`usuario.css`).
- Ilha do navegador com `usePathname` e `useSearchParams`. Celular: marca,
  localização, busca, sacola e avatar. Computador: segunda fileira com as
  abas. Só `--cor-primaria*` e `--cor-foco` (nunca `--cor-marca*`). Folha
  nova `navegacao.css`; os arquivos acima só entram se a lateral for
  adaptada.
- Usa `Abas` do #104. Fora do Stitch: mesmo topo em conta, acompanhamento do
  pedido e sobre da loja (ASM-10507).

## T-10505 — Barra inferior do cliente [pendente]

- Refs: US-10502, AC-10503, AC-10504
- Arquivos: apps/web/src/features/usuario/LateralDoUsuario.tsx
- A criar: apps/web/src/features/navegacao/BarraInferiorDoCliente.tsx
- Depende de: T-10504 e da T-10407 do #104 (`BarraInferior`)
- Pedir a: #104 (item como ação para a janela de acesso e para o menu do
  avatar, e o estado "oculta" do teclado virtual), ou montar barra própria
  (Q-10510).
- Cinco itens com a tabela da seção 2.2. `aria-label` próprio (nunca
  "Atalhos"). Só uma navegação por largura de tela (64rem).

## T-10506 — Indicador de localização no topo [pendente]

- Refs: US-10503, AC-10505, AC-10506, AC-10507, AC-10508
- Arquivos: apps/web/src/features/feed/BarraDoFeed.tsx, apps/web/src/features/feed/consulta.ts, apps/web/src/features/legal/consentimento.ts, apps/web/src/app/_usuario/sessao.tsx, apps/web/src/lib/enderecos-da-conta.ts, apps/web/src/server/conta-do-fechamento.ts
- A criar: apps/web/src/features/navegacao/LocalizacaoDoTopo.tsx, apps/web/tests/localizacao-do-topo.onp.test.tsx
- Depende de: T-10504 e das Q-10503 e Q-10509
- Pedir a: #106 (`BarraDoFeed.tsx` e `consulta.ts`: extrair a leitura de
  `sc:feed:local` para um módulo comum) e ao gerente (`sessao.tsx`).
- Rótulo e ordenação independentes (seção 5 do design). A cidade vem do
  servidor com `cache: "no-store"` e tempo limite, só cidade e UF chegam ao
  navegador (padrão de `conta-do-fechamento.ts`). A coordenada só é gravada
  e lida com `temConsentimento("funcionais")`, é arredondada de novo ao ler,
  apagada ao recusar e ao sair, e só é pedida por ação da pessoa.

## T-10507 — Sacola no topo da loja [pendente]

- Refs: US-10504, AC-10509, AC-10510
- Arquivos: apps/web/src/lib/carrinho-do-navegador.ts, apps/web/src/features/carrinho/SacolaFlutuante.tsx, apps/web/src/features/carrinho/CarrinhoFlutuante.tsx
- A criar: apps/web/src/features/navegacao/SacolaDoTopo.tsx, apps/web/tests/sacola-do-topo.onp.test.tsx
- Depende de: T-10504 e da Q-10504
- Pedir a: #110 (`features/carrinho/*`: ouvir o evento `sc:abrir-sacola` e
  compartilhar a fonte da contagem com a `SacolaFlutuante`).
- Só dentro de uma loja (recomendação da Q-10504). Contagem numa ilha do
  navegador com `contarItensDoCarrinho` e `AVISO_DE_CARRINHO_MUDOU`, nunca no
  servidor nem em cache. Anúncio "Sacola, N itens". Nas páginas sem
  `CarrinhoFlutuante` leva a `/loja/[slug]/carrinho` (hipótese).

## T-10508 — Montagem nas molduras e destino da lateral [pendente]

- Refs: US-10504, US-10505, AC-10504, AC-10511, AC-10515, AC-10516, AC-10526
- Arquivos: apps/web/src/app/(explorar)/explorar/layout.tsx, apps/web/src/app/(conta)/conta/layout.tsx, apps/web/src/app/(loja)/loja/[slug]/layout.tsx, apps/web/src/app/_usuario/sessao.tsx, apps/web/src/features/usuario/LateralDoUsuario.tsx, apps/web/src/features/usuario/UsuarioNoMenu.tsx, apps/web/src/features/tutorial/passos.ts, packages/ui/styles/usuario.css
- Depende de: T-10505, T-10506, T-10507 e da Q-10505
- Pedir a: gerente (molduras de explorar e conta, `features/usuario/*`,
  `sessao.tsx` e tutorial), #111 (`usuario.css`).
- O botão Sair chama `limparDadosLocaisDoFeed()` do #106 (apaga `sc:feed:local`
  e os stories vistos; AC-10619 dele). A decisão da Q-10505 é a mesma da
  Q-11103 do #111, e as tarefas do #111 na lateral entram depois desta.
- Mapear todo `body:has(.sc-usuario-lateral)` e todo uso de
  `--altura-da-barra` (`usuario.css`, `legal.css`, `vitrine.css`,
  `produto.css`) e reaproveitar a variável. Regressão de "Sair", "Ver
  tutorial" e dos alvos de `passos.ts` (`.sc-usuario-lateral`,
  `[data-ver-tutorial]`, `.sc-sacola`). A janela de acesso continua
  funcionando dentro da loja. A sacola da loja continua intacta ao ir ao
  Explorar e voltar.

## T-10509 — Barras fixas, camadas e área segura [pendente]

- Refs: US-10506, AC-10517, AC-10518, AC-10519, AC-10520, AC-10521
- Arquivos: packages/ui/styles/legal.css, apps/web/src/features/legal/BannerDeCookies.tsx, apps/web/src/app/layout.tsx, packages/ui/styles/vitrine.css, packages/ui/styles/produto.css
- Depende de: T-10508 e das Q-10502 e Q-10507
- Pedir a: #104 (`app/layout.tsx`, `viewportFit` e tokens de camada),
  #107, #108, #109 (`vitrine.css`, `produto.css`) e #110 (barra da sacola).
- Cookies, sacola flutuante e aviso sobem acima da barra pela altura dela
  (`--altura-da-barra-inferior`) mais a área segura. Uma barra fixa de baixo
  por vez. `scroll-padding-block` do documento soma topo e barra. A barra
  some com o teclado virtual (`visualViewport`).
- No vitest só se prova o que o CSS declara; layout real, área segura e foco
  encoberto são prova do #114 (AC-11414 e AC-11410 dele).

## T-10510 — Rodapé do cliente [pendente]

- Refs: US-10507, AC-10522, AC-10523, AC-10524
- Arquivos: apps/web/src/features/legal/RodapeLegal.tsx, apps/web/src/features/legal/contato.ts, apps/web/src/features/legal/RodapeDoSimpleClick.tsx, packages/ui/styles/legal.css, apps/web/tests/legal.test.tsx
- A criar: apps/web/tests/rodape-do-cliente.onp.test.tsx
- Depende de: T-10509 e da Q-10506
- Rodapé com a alternativa escolhida na Q-10506 e só rotas reais (seção 7
  do design). Teste confere cada link contra as rotas de `app/`. Texto
  proibido: cupom, carteira, fidelidade, ajuda inexistente, "Entrega
  Flash", "Suporte 24h", CNPJ e razão social de exemplo.

## T-10511 — Política de origem da referência (Referrer-Policy) [pendente]

- Refs: US-10505, AC-10514
- Arquivos: apps/web/next.config.ts, apps/web/src/proxy.ts
- Depende de: T-10501 e da Q-10508
- Pedir a: dono do `next.config.ts` (a definir com o gerente).
- Definir `Referrer-Policy` conforme a Q-10508, com teste do cabeçalho.
  Hoje o aplicativo não define nenhuma.

## T-10512 — Cenários de navegador propostos ao #114 [pendente]

- Refs: US-10502, US-10506, AC-10504, AC-10517, AC-10518, AC-10519, AC-10520, AC-10521
- Arquivos: e2e/specs
- A criar: e2e/specs/navegacao-do-cliente.onp.spec.ts
- Depende de: T-10509
- Proposta ao #114, que é dono da prova transversal (axe, teclado, toque,
  área segura e estouro lateral): barra por largura (344, 390, 768, 1024 e
  1280px), uma barra fixa por vez, cookies e sacola acima da barra, teclado
  virtual e foco não encoberto. Este card não duplica o que o #114 já cobre.
