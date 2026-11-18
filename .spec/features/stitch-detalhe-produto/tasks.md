# Tasks: Detalhe do produto, variações e adicionais

> feature: stitch-detalhe-produto

<!--
  Card #109 — bloco de códigos 10901 a 10999.
  Todas as tarefas são FUTURAS: ficam [pendente] e só rodam com autorização
  de implementação e plano aprovado, uma após a outra, na pasta principal,
  sem worktree nem executor paralelo (ver .spec/README.md). Nenhuma depende de
  card "A decidir" (P-107). "Arquivos" lista só caminhos que já existem; os
  arquivos novos ficam na linha "A criar" (o motor a ignora). Caminhos
  relativos a `apps/web/src/`, salvo indicação, estão escritos por extenso.
  Proposta técnica em design.md.
-->

## T-10901 — Dados da tela: mídias, tipo do grupo e blocos do ramo [pendente]

- Refs: US-10901, AC-10901, AC-10905, AC-10906, AC-10933
- Arquivos: apps/web/src/lib/produto.ts, apps/web/src/server/produto.ts
- Notas: acrescentar a `ProdutoNaTela` as `midias` (foto ou vídeo, na ordem do
  dono) e o `tipo` do grupo (`GrupoNaTela`), e fazer `prepararProduto` repassá-los.
  `imagens` continua existindo (dados estruturados e prévia). Não muda o
  contrato nem a API: `midias` e `tipo` já vêm em `esquemaDoProduto`. Os
  arquivos são do #109 (decisão do gerente, matriz do #103). Teste de contrato
  da montagem em `apps/web/tests/detalhe-do-produto.onp.test.tsx`.

## T-10902 — Galeria com foto e vídeo [pendente]

- Refs: US-10901, AC-10901, AC-10902, AC-10903, AC-10930
- Arquivos: apps/web/src/features/produto/DetalheDoProduto.tsx, packages/ui/styles/produto.css
- A criar: apps/web/src/features/produto/GaleriaDoProduto.tsx
- Notas: depende da T-10901. Galeria com posição ("2 de 3"), setas e teclado,
  vídeo parado com "Reproduzir vídeo" (Q-10906 pode mudar para mudo
  automático), substituto sem mídia e troca sem animação com "reduzir
  movimento". Copia a ideia de `features/feed/MidiaDoPost.tsx`, sem editá-lo
  (é do #106). A área de proporção fixa evita o pulo da tela.

## T-10903 — Cabeçalho e blocos do ramo no detalhe [pendente]

- Refs: US-10901, AC-10904, AC-10905, AC-10906, AC-10907
- Arquivos: apps/web/src/features/produto/DetalheDoProduto.tsx, apps/web/src/features/produto/SeloDePreco.tsx, apps/web/src/features/produto/TabelaDoAtacado.tsx
- A criar: apps/web/src/features/produto/blocos-do-ramo.ts
- Notas: depende da T-10901. `blocos-do-ramo.ts` liga cada nome de
  `detalheProduto` ao dado (tabela da seção 4 do design.md), oculta o bloco
  sem dado, ignora nome desconhecido e **nunca** desenha `aplicacao` nem
  `compatibilidade` (P-104). Sem lista do ramo, mantém a tela de hoje.

## T-10904 — Levar a composição do ramo até a janela [pendente]

- Refs: US-10901, AC-10905, AC-10906, AC-10907
- Arquivos: apps/web/src/app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx, apps/web/src/features/produto/JanelaDoProduto.tsx
- Notas: só passa `loja.blocos.detalheProduto` do catálogo à janela (uma prop).
  Espera a vez do #108 em `TelaDoCatalogo.tsx` (fila #108, #109, #110) e
  avisa o #110 por board_message. Sem esta tarefa, vale a composição padrão
  (AC-10907).

## T-10905 — Variações e adicionais claros [pendente]

- Refs: US-10902, AC-10908, AC-10909, AC-10910, AC-10911, AC-10912, AC-10913, AC-10914
- Arquivos: apps/web/src/features/produto/MatrizDeVariacao.tsx, apps/web/src/features/produto/SelecaoDeOpcoes.tsx, apps/web/src/features/produto/EscolhasDoProduto.tsx, packages/ui/styles/produto.css
- Notas: variações em pílulas com o `Chip` do #104 (ASM-10907), regra em
  palavras desde a abertura, erro só depois da tentativa, rolagem e foco na
  pendência, acréscimo com sinal, limite anunciado e o convite a escolher no
  texto do AC-10913 (Q-10905). Os componentes importam a conta só por
  `lib/produto.ts`. Preserva o comportamento dos testes legados.

## T-10906 — Quantidade, atacado e subtotal [pendente]

- Refs: US-10903, AC-10915, AC-10916, AC-10917, AC-10918, AC-10919
- Arquivos: apps/web/src/features/produto/BotaoAdicionar.tsx, apps/web/src/features/produto/EscolhasDoProduto.tsx, apps/web/src/features/produto/TabelaDoAtacado.tsx, apps/web/src/lib/atacado-na-vitrine.ts, packages/ui/styles/produto.css
- Notas: linha "N × unitário = subtotal" com o unitário de
  `unitarioEmCentavos` e a mesma conta do botão e da faixa marcada (D-3 do
  design). Sem variação resolvida, sem linha. Nenhuma regra comercial nova:
  `unitarioNoAtacado` e `calcularItem` seguem iguais. Aviso de cardápio que
  mudou preservado (409).

## T-10907 — Indisponibilidade clara [pendente]

- Refs: US-10904, AC-10920, AC-10921, AC-10922, AC-10923, AC-10924
- Arquivos: apps/web/src/features/produto/MatrizDeVariacao.tsx, apps/web/src/features/produto/SelecaoDeOpcoes.tsx, apps/web/src/features/produto/EscolhasDoProduto.tsx, apps/web/src/server/produto.ts
- Notas: conferir antes o comportamento atual com a variação padrão esgotada
  (ASM-10906) e registrar o resultado na spec. Mantém "Esgotado", "Indisponível"
  e "Acabou" como texto (a cor não é o único sinal) e a precedência "loja
  fechada vence". Não cria "Avise-me" nem estoque em unidades (#120).

## T-10908 — Janela responsiva e acessível [pendente]

- Refs: US-10905, AC-10925, AC-10926, AC-10927, AC-10928, AC-10929, AC-10930
- Arquivos: apps/web/src/features/produto/JanelaDoProduto.tsx, apps/web/src/features/produto/DetalheDoProduto.tsx, packages/ui/styles/produto.css
- Notas: folha em tela cheia até 767 px com barra fixa e área segura; duas
  colunas a partir de 768 px com o painel rolando e o rodapé fixo (medidas da
  seção 3 do design.md); alvo de 48 px e foco visível (P-106); Esc fecha e o
  foco volta ao cartão (depende da Q-10408 do #104); `prefers-reduced-motion`.
  Remove em `produto.css` só as classes que a busca provar sem uso. A prova de
  axe e de teclado é do #114.

## T-10909 — Link, fechamento e "+" do cartão sem regressão [pendente]

- Refs: US-10906, AC-10929, AC-10931, AC-10932, AC-10933, AC-10934
- Arquivos: apps/web/src/app/(loja)/loja/[slug]/produto/[id]/page.tsx, apps/web/src/features/produto/JanelaDoProduto.tsx
- Notas: garantir que o link direto, o `pushState`, o "voltar" e a regra de
  `eProdutoSimples` continuam como hoje; `imagens` segue alimentando os
  dados estruturados e a prévia. Não muda os seletores `data-abre-produto` e
  `data-adicionar-produto` (o cartão é do #108).

## T-10910 — Uma só confirmação depois de adicionar [pendente]

- Refs: US-10906, AC-10935
- Arquivos: apps/web/src/features/produto/EscolhasDoProduto.tsx, apps/web/src/features/produto/JanelaDoProduto.tsx
- Notas: **só depois de o #110 definir** texto e momento da confirmação
  (AC-11006). Remove o recado "Adicionado à sacola." e o `sc-aviso-rapido` da
  janela para não haver aviso duplicado. `ItemParaEnviar`
  (`apps/web/src/lib/carrinho-do-navegador.ts`) não muda.

## T-10911 — Testes dos critérios [pendente]

- Refs: AC-10901, AC-10902, AC-10903, AC-10904, AC-10905, AC-10906, AC-10907, AC-10908, AC-10909, AC-10910, AC-10911, AC-10912, AC-10913, AC-10914, AC-10915, AC-10916, AC-10917, AC-10918, AC-10919, AC-10920, AC-10921, AC-10922, AC-10923, AC-10924, AC-10925, AC-10926, AC-10927, AC-10928, AC-10929, AC-10930, AC-10931, AC-10932, AC-10933, AC-10934, AC-10935
- Arquivos: apps/web/tests/produto-pagina.test.tsx
- A criar: apps/web/tests/detalhe-do-produto.onp.test.tsx, apps/web/tests/escolhas-do-produto.onp.test.tsx, apps/web/tests/quantidade-e-atacado.onp.test.tsx, apps/web/tests/produto-indisponivel.onp.test.tsx, apps/web/tests/janela-do-produto.onp.test.tsx, e2e/specs/detalhe-do-produto.onp.spec.ts
- Notas: escrever cada teste junto da tarefa que o cumpre, com
  `it("[CA-n] @spec:AC-… …")` (mapa na seção 9 do design.md); reaproveitar o
  setup do teste legado sem alterá-lo. Layout por largura (AC-10925 a
  AC-10927) só tem prova em e2e, que o `onp-spec verify` não roda (Q-11405 do
  #114); axe e teclado (AC-10928, AC-10929) são provas do #114.

## T-10912 — Especificações cadastradas no detalhe (condicionada) [pendente]

- Refs: US-10901
- Arquivos: packages/contracts/src/vitrine.ts, apps/api/src/modules/storefront/produto.usecase.ts
- Notas: **só se o dono responder "sim" à Q-10904**, e depois da vez do #108 em
  `vitrine.ts`. Acrescenta os atributos do produto (`ProductAttribute`) ao
  `esquemaDoProduto` e à resposta da API, e o bloco `especificacoes` passa a
  mostrá-los. Não faz parte do redesign: nenhuma outra tarefa depende dela
  (P-107). Precisa de plano próprio (contrato, API e isolamento por loja).
