# Tasks: Cardápio na TV da loja

> feature: cardapio-na-tv

## T-950 — Exibição que avança sozinha, sem ninguém operar [concluida]

- Refs: US-908, AC-925, AC-930
- Arquivos: apps/web/src/features/tv/ExibicaoDeCardapio.tsx, apps/web/src/features/tv/useRodizio.ts, apps/web/src/features/tv/useRodizio.test.ts, apps/web/src/features/tv/telas.ts, apps/web/src/features/tv/telas.test.ts, apps/web/src/features/tv/ritmo.ts, apps/web/src/app/(loja)/l/[slug]/tv/page.tsx, apps/web/src/lib/routes.ts, .spec/design/mapa-de-telas.md, e2e/specs/manifesto-cobre-arquivos.spec.ts, apps/web/tests/cardapio-na-tv.test.tsx
- Notas: sem cursor, sem barra de rolagem, sem nada que espere toque. Produto indisponível não entra no rodízio — cardápio de parede não se corrige a caneta. A tela nova é `/l/{slug}/tv` (linha `2a` do mapa, 53 rotas no manifesto), pública e sem login (ASM-032: ela só mostra o que a vitrine já mostra). O servidor desenha a primeira tela com o catálogo que já tem; o navegador assume o rodízio (`useRodizio`) e a atualização. As telas saem de `montarTelas`: destaques primeiro, depois cada seção na ordem do dono, uma seção por tela, só produto disponível (AC-930); seção sem nada disponível some. Q-034 ganhou resposta prática: 12 s por tela, e o endereço aceita `?segundos=` (5 a 120) e `?atualizar=` (2 a 600) para a loja e o ponta a ponta ajustarem (`ritmo.ts`). A exibição é escura por decisão (tela clara de 43 polegadas numa parede é refletor), com as cores da loja no nome da seção e no preço, ajustadas pelo tema.
- Esforço: medio

## T-951 — Corpo e contraste para leitura a três metros [concluida]

- Refs: US-908, AC-926, AC-927
- Arquivos: packages/ui/styles/exibicao.css, packages/ui/package.json, apps/web/src/features/tv/densidade.ts, apps/web/src/features/tv/densidade.test.ts
- Notas: o número de produtos por tela sai da proporção e do tamanho da televisão, e nunca reduz o corpo abaixo do mínimo legível. Em pé e deitada recebem divisões diferentes do espaço. A pergunta é invertida de propósito: o corpo é a variável fixa (4,2% do lado menor, nunca abaixo de 28 px — 45 px numa Full HD, que dá uns 22 mm de letra numa TV de 43 polegadas) e a quantidade é o que sobra, com teto de 12 por tela. Deitada: duas colunas e o código numa faixa à direita (32% da largura); em pé: uma coluna e o código numa faixa embaixo (30% da altura). A altura da linha do produto é 2,6 corpos nos dois lugares (folha e densidade), e a prova guarda que nada é cortado. O contraste é o do tema escuro do design system, e a cor da loja entra como letra só depois de ajustada por `calcularTemaDaLoja`.
- Esforço: alto

## T-952 — Catálogo que se atualiza sozinho e sobrevive à queda [concluida]

- Refs: US-908, AC-928, AC-929
- Arquivos: apps/web/src/features/tv/useCatalogoDaTv.ts, apps/web/src/features/tv/useCatalogoDaTv.test.ts, apps/web/src/lib/catalogo-do-navegador.ts
- Notas: a televisão fica ligada o dia inteiro, então a atualização não pode depender de recarregar a página. Queda de internet mantém o último cardápio recebido, e não tela de erro. O navegador pede o catálogo direto à API (`catalogo-do-navegador.ts`, o mesmo caminho do carrinho; leitura pública passa pelo CORS, AC-127) a cada minuto — o "prazo definido" do AC-928 —, sem passar pelo cache de um minuto do site (dívida 93 não piora nem melhora: a primeira tela ainda vem do servidor com aquele cache). Falha mantém o último catálogo e marca `semRede`, que vira uma linha discreta no rodapé; o evento `online` do navegador dispara uma busca na hora. Só quando NUNCA houve catálogo a falha vira o estado de erro — e a busca continua, para a tela se recuperar sozinha.
- Esforço: alto

## T-954 — Ponte da parede para o celular [concluida]

- Refs: US-908, AC-931
- Arquivos: apps/web/src/features/tv/CodigoParaOCelular.tsx, apps/web/src/features/tv/codigo.ts, apps/web/src/features/tv/codigo.test.ts
- Notas: o código aparece em TODA tela do rodízio, e não só numa — quem decidiu pedir não espera a televisão dar a volta. Tamanho pensado para leitura a três metros, o que faz dele elemento grande e não selo de canto. O endereço leva à vitrine daquela loja, e carrega de onde a pessoa veio para o dono saber que a TV converteu. O gerador de QR é escrito no projeto (P-014: as bibliotecas trazem PNG, linha de comando e dependências para desenhar quadrados em SVG): modo de bytes, nível M, versões 1 a 10, máscara escolhida por penalidade. A prova lê o código de volta com um leitor independente (tabelas próprias, aritmética por logaritmo), nas dez versões. O endereço é `{vitrine}/catalogo?origem=tv`; o endereço curto (sem esquema, sem www) aparece escrito ao lado para quem prefere digitar. Preto sobre branco sempre, com margem silenciosa de quatro módulos, num `path` só; 44% do lado menor da tela.
- Esforço: medio

## T-953 — Teste de ponta a ponta da exibição [pendente]

- Refs: US-908, AC-925, AC-929
- Arquivos: e2e/specs/cardapio-na-tv.spec.ts
- Notas: cobre a tela avançando sozinha e a exibição continuando de pé com a rede cortada. O arquivo está ESCRITO (rota respondendo sem barra de rolagem, sem cursor e sem nada interativo; rodízio avançando no relógio de verdade; código grande na tela; rede cortada por `context.setOffline` mantendo o cardápio e voltando a atualizar), usando `?segundos=5&atualizar=2` para não esperar minutos por cenário. Fica pendente porque o ponta a ponta roda no lote final, contra o ambiente inteiro no ar.
- Esforço: medio
