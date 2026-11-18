# Design: Validação visual, acessibilidade e regressão do redesign

> feature: stitch-validacao-visual · card #114 · 06/11/2026

Documento de estratégia. Nada aqui está aprovado para implementação: as
decisões do dono do produto estão nas perguntas Q-11401…Q-11412 da spec.
Caminhos relativos à raiz `/Users/stargrupo/Projetos/SC`.

## 1. Ferramentas e nível de prova

Nenhuma dependência nova (ASM-11402). Cada critério declara o nível de prova
que alcança, porque cada ferramenta tem limite conhecido:

| Nível         | Ferramenta                                                      | Conta no `onp-spec verify`?         | Alcança                                                                      | Não alcança                                                                        |
| ------------- | --------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| declaração    | vitest, projetos `web` e `unit`, arquivos `*.onp.test.ts(x)`    | sim                                 | CSS e tokens declarados, cálculo de contraste, papéis e nomes no jsdom (axe) | layout (medidas dão 0), media queries, contraste pintado, `env(safe-area-inset-*)` |
| comportamento | Playwright 1.64, `e2e/specs/*.onp.spec.ts`                      | não (o motor só lê vitest; Q-11405) | layout real, axe com contraste, teclado, rede emulada, tempo, capturas       | área segura (no Chromium vale 0), toque real (projetos são "Desktop Chrome")       |
| manual        | simulador iOS (ferramentas `sim_*` do RM Code), revisão do dono | não                                 | área segura com indicador de início, leitura humana das diferenças           | repetição automática                                                               |

Fatos que sustentam a tabela:

- `e2e/playwright.config.ts`: projetos `publico` (Desktop Chrome) e `celular`
  (Desktop Chrome com viewport 344×882), `fullyParallel: true`,
  `screenshot: "only-on-failure"`, nenhum `toHaveScreenshot` no projeto.
- `onpspec.config.json`: `testCommand` roda vitest `--project web --project
unit`; o motor entende só `tap`, `vitest-json`, `jest-json` e `exitcode`.
  Critério só com prova de navegador aparece como "sem prova" no audit até a
  decisão da Q-11405.
- axe-core 4.14 (`apps/web/package.json`): no navegador em
  `e2e/specs/a11y-vitrine.spec.ts` (legado, com `reducedMotion: "reduce"`
  para medir o estado final) e no jsdom em
  `apps/web/tests/vitrine-ui-a11y.test.tsx` (com `REGRAS_QUE_PRECISAM_RODAR`).
- Contraste por cálculo: `packages/ui/src/contraste.ts`
  (`relacaoDeContraste`, `CONTRASTE_MINIMO_TEXTO` 4,5, `CONTRASTE_MINIMO_GRAFICO` 3).
- Rede móvel emulada por CDP: `comoRobo` em `e2e/specs/desempenho-vitrine.spec.ts`.

Padrões herdados que as provas futuras repetem:

- axe com lista de regras que precisam ter rodado (sem isso, montagem errada
  passa com zero violação);
- movimento reduzido ligado antes do axe, para não medir a cor no meio de um
  esmaecer;
- `document.fonts.ready` antes de medir e capturar;
- título com as duas convenções: `[CA-n] @spec:AC-114xx …`.

## 2. Larguras e temas (proposta, Q-11401 e Q-11404)

Larguras vêm dos pontos de quebra do tema (`packages/ui/styles/theme.css`,
conferidos por `packages/ui/tests/pontos-de-quebra.test.ts`):

| Largura × altura | Ponto do tema            | Por quê                                                  |
| ---------------- | ------------------------ | -------------------------------------------------------- |
| 344 × 882        | `--quebra-dobravel`      | menor largura suportada; onde o estouro aparece primeiro |
| 390 × 844        | `--quebra-celular-medio` | largura das telas de celular do Stitch (PNG 780 @2x)     |
| 768 × 1024       | `--quebra-tablet`        | catálogo tablet do Stitch                                |
| 1024 × 768       | `--quebra-tablet-largo`  | troca para barra lateral de filtros e sacola lateral     |
| 1280 × 800       | `--quebra-desktop`       | telas de computador do Stitch                            |

Opcional (Q-11401 B): 1536 × 864. Zoom de 200% no computador equivale a
640px de largura útil (Q-11411).

Temas: escuro do redesign sempre; claro se a Q-11404 pedir. O tema claro já
tem prova própria de tokens no AC-10420 do #104; aqui só entra a captura.

## 3. Rubrica das diferenças

Cada diferença entre a tela nova e a referência recebe uma classe. Sem
classe, a rodada não fecha (AC-11402).

| Classe      | Quando                                                                                                                                                                                          | Exige                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| justificada | a diferença vem de um princípio (P-102 cor única, P-103 sem recurso externo, P-104 nada automotivo, P-105 dados ilustrativos), de acessibilidade, de dado real da loja ou de decisão registrada | motivo com o código (P-…, AC-…, Q- respondida) |
| pendente    | depende de uma decisão do dono ainda aberta                                                                                                                                                     | código de uma pergunta aberta existente        |
| regressão   | um resultado da jornada muda (preço, total, itens, opções, pedido), surge barreira de acessibilidade ou a tela quebra                                                                           | bloqueia a entrega da onda                     |

Exemplos já previsíveis de diferença justificada: verde #B7FF00 no lugar de
`#b2f800` (P-102); ícones do pacote no lugar de Material Symbols (P-103);
"Fale com a loja no WhatsApp" no lugar de placa/chassi (P-104); sem CNPJ,
nota, prazo ou "10x sem juros" (P-105); texto escuro sobre o verde no lugar do
verde-oliva do export (P-106); título correto no catálogo de celular (o export
diz "Detalhes do Produto"); um só `<main>` por página (o export aninha).

Diferença visual não é regressão por si: regressão é perda de resultado ou de
acesso. Mudança visual não intencional sem baseline de pixels (Q-11402) é
pega pela revisão das capturas (AC-11403).

### Manifesto de diferenças (forma proposta)

Um arquivo por rodada, lido pelo teste do AC-11402. Local depende da Q-11408
(proposta: manifesto versionado em `e2e/fixtures/diferencas-do-redesign.ts`,
capturas fora do git). Cada linha: tela, largura, tema, loja, classe, motivo
(código), descrição curta. O teste confere a forma (classe válida, motivo com
código existente, pendente aponta Q aberta); a completude é a revisão do dono
(AC-11403), como no AC-10301 do #103.

## 4. Matriz cruzada com os cards do redesign

Situação em 06/11/2026: só a spec do #104 existe. As specs de #105–#111 estão
sendo escritas (ASM-11405); cada linha "aguardando" é preenchida quando a
pasta do card aparecer em `.spec/features/`. Os códigos de outros cards ficam
só aqui (o audit não lê este arquivo) e não entram nas `Refs:` das tarefas
enquanto a spec do card não existir.

### 4.1 Base visual (#104, `stitch-base-visual`) — spec presente

| Critério do #104    | O que prova                                                | Nível         | Relação com o #114                                                                 |
| ------------------- | ---------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| AC-10401 a AC-10403 | tokens, tema escuro, escala tipográfica                    | declaração    | nenhuma; o #114 só usa                                                             |
| AC-10404            | pares de contraste dos tokens                              | declaração    | não repetir; o AC-11411 mede a cor de cada loja nas telas                          |
| AC-10405 a AC-10411 | ícones de ação, botão, campo, chip, abas                   | declaração    | nas telas, o AC-11410 percorre os mesmos controles pelo teclado                    |
| AC-10412            | gaveta prende e devolve o foco (com dublê no jsdom)        | declaração    | o AC-11410 prova o mesmo no navegador, na sacola lateral e na janela do produto    |
| AC-10413            | aviso flutuante não rouba foco                             | declaração    | AC-11416 (estados) usa o aviso                                                     |
| AC-10414            | barra inferior com área segura declarada                   | declaração    | não repetir; o AC-11414 cobre as outras barras fixas e a prova manual no simulador |
| AC-10415 a AC-10417 | cor da loja nas peças, texto legível, anel de foco         | declaração    | não repetir; o AC-11411 usa as cores reais das lojas de exemplo nas telas          |
| AC-10418            | página `/ui` lista as peças                                | declaração    | nenhuma                                                                            |
| AC-10419            | 344, 768 e 1280px sem rolagem lateral, axe, reduced-motion | comportamento | proposta (ASM-11407): o e2e combinado mora na tarefa T-11406, com `/ui` na lista   |
| AC-10420            | tema claro não muda                                        | declaração    | Q-11404 decide se o claro entra nas capturas                                       |

Perguntas do #104 que mudam critérios daqui: Q-10405 (toque 44 ou 48px,
AC-11412) e Q-10408 (o diálogo do pacote ainda não é modal de verdade; afeta
a janela do produto no AC-11410).

### 4.2 Telas do cliente (#105–#111) — aguardando specs

| Card | Pasta                      | Telas (matriz do #103)                                  | Transversais do #114 que valem                                       | Situação em 06/11 |
| ---- | -------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- | ----------------- |
| #105 | `stitch-navegacao-cliente` | topo, barra inferior, rodapé                            | AC-11409, AC-11410, AC-11412, AC-11414, AC-11415, AC-11421           | aguardando spec   |
| #106 | `stitch-inicio-descoberta` | início e descoberta, lojas (celular e computador)       | AC-11401, AC-11404, AC-11409, AC-11415, AC-11416, AC-11417           | aguardando spec   |
| #107 | `stitch-vitrine-loja`      | vitrine da loja, sobre, atendimento                     | AC-11401, AC-11409, AC-11411, AC-11415, AC-11416, AC-11417           | aguardando spec   |
| #108 | `stitch-catalogo`          | catálogo celular, tablet e computador                   | AC-11401, AC-11404, AC-11409, AC-11415, AC-11416, AC-11418, AC-11419 | aguardando spec   |
| #109 | `stitch-detalhe-produto`   | detalhe do produto (sem mockup)                         | AC-11403, AC-11405, AC-11410, AC-11417                               | aguardando spec   |
| #110 | `stitch-sacola-fechamento` | sacola lateral, barra da sacola, fechamento             | AC-11406, AC-11407, AC-11410, AC-11414                               | aguardando spec   |
| #111 | `stitch-area-do-cliente`   | favoritos, pedidos, perfil, acompanhamento (sem mockup) | AC-11403, AC-11407, AC-11409, AC-11416                               | aguardando spec   |

Quando cada spec chegar, a linha do card vira uma tabela própria como a 4.1:
critério do card, o que prova, nível, e se há sobreposição com o #114 (quem
prova o quê). Regra da divisão: cada card prova os próprios critérios; o #114
prova só o que atravessa telas (acessibilidade por tela e largura, teclado na
jornada, toque, movimento, área segura das barras, estados, imagens,
catálogo grande, jornada de compra e dados do Stitch).

### 4.3 Fora da matriz

- #112 e #113 (painel e administração): fora até a decisão da onda 2
  (Q-10301 do #103 e Q-11412).
- #115–#126 ("A decidir"): nenhum bloco deles é capturado; se aparecer na
  tela antes da decisão, é regressão (P-107).

## 5. Jornada de compra e testes antigos

Fluxo de ouro (AC-11404 a AC-11407), na loja de teste do ponta a ponta
(`e2e/fixtures/loja-de-teste.ts`, `APELIDO_DA_LOJA` = `e2e-lanchonete`,
aberta o dia inteiro):

1. descoberta (`/explorar`) → busca → loja;
2. catálogo (`/loja/[slug]/cardapio`) → busca e categoria;
3. produto com variação e adicional obrigatório → preço final;
4. sacola: quantidade, remoção, atacado, recarregar, outra sessão;
5. fechamento com conta → pedido com código → acompanhamento → texto do
   WhatsApp.

Os valores esperados são fixos da loja de teste (ASM-11406). A loja de teste
precisa ganhar variação e atacado se ainda não tiver; isso é decisão da
tarefa T-11404, sem mexer nos cenários que já usam a loja.

Testes antigos que formam a rede de regressão (AC-11408; invisíveis ao ONP,
ASM-11404). Ajuste de seletor é permitido; asserção nunca é removida,
relaxada ou pulada:

| Arquivo                                | O que afirma                                           |
| -------------------------------------- | ------------------------------------------------------ |
| `e2e/specs/vitrine.spec.ts`            | categorias visíveis na ordem do dono                   |
| `e2e/specs/produto-detalhe.spec.ts`    | detalhe do produto                                     |
| `e2e/specs/produto-opcoes.spec.ts`     | grupo obrigatório impede adicionar; acréscimo no total |
| `e2e/specs/carrinho.spec.ts`           | item sobrevive ao recarregar; sessões separadas        |
| `e2e/specs/checkout.spec.ts`           | pedido criado com código; WhatsApp com texto pronto    |
| `e2e/specs/acompanhamento.spec.ts`     | acompanhamento do pedido                               |
| `e2e/specs/a11y-vitrine.spec.ts`       | axe sem violação séria; 344px sem estouro; toque 44px  |
| `e2e/specs/teclado-vitrine.spec.ts`    | links da vitrine com foco visível pelo teclado         |
| `e2e/specs/desempenho-vitrine.spec.ts` | vitrine no HTML sem JavaScript; imagens com srcset     |
| `e2e/specs/sobre-da-loja.spec.ts`      | página sobre a loja                                    |

Comando: `pnpm --filter @simpleclick/e2e test:e2e` (ou `test:e2e:isolado`,
que usa banco descartável). Prova: relatório do Playwright guardado no
pacote de evidências (seção 7), com contagem de passou, falhou e pulou; pulou
maior que zero reprova a rodada.

## 6. Acessibilidade nas telas

| Critério | Como mede                                                                                                                                                                                                                                                        | Onde                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| AC-11409 | axe com tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, contraste ativo; regras mínimas: `color-contrast`, `button-name`, `link-name`, `image-alt`, `label`, `landmark-one-main`, `region`, `heading-order`, `aria-valid-attr-value`, `target-size` | navegador, cada tela × largura    |
| AC-11410 | sequência de Tab registra papel, nome e estilo de foco; gaveta e janela: Tab não sai, Esc fecha, foco volta ao gatilho                                                                                                                                           | navegador                         |
| AC-11411 | `relacaoDeContraste` entre a cor de destaque de cada loja de exemplo (tema calculado da loja) e o texto e ícones que as telas põem sobre ela                                                                                                                     | vitest + navegador                |
| AC-11412 | `getBoundingClientRect` de botões e links de ação ≥ mínimo da Q-10405; exceção: link em texto corrido                                                                                                                                                            | navegador nas larguras de celular |
| AC-11413 | CSS das telas: toda `animation` ou `transition` nova tem regra em `prefers-reduced-motion: reduce`; no navegador, com movimento reduzido, nenhuma animação passa de 200ms                                                                                        | vitest + navegador                |
| AC-11414 | CSS das barras fixas tem `env(safe-area-inset-bottom)`; no simulador de iPhone com indicador de início, captura mostra o conteúdo acima dele                                                                                                                     | vitest + manual (Q-11409)         |
| AC-11415 | `scrollWidth` ≤ `clientWidth` e nenhum elemento passa da borda em 344px e com zoom de 200% (Q-11411)                                                                                                                                                             | navegador                         |

Roteiro manual da área segura (Q-11409): abrir o site no simulador de iPhone
com indicador de início (`sim_boot`, `sim_open_url`), em cada tela com barra
fixa; `sim_screenshot`; registrar no pacote de evidências o aparelho, a tela,
a data e a captura.

Toque real e área segura não são medidos no Chromium de computador. Um
projeto de celular com toque (`hasTouch`, `isMobile`, talvez WebKit) mudaria
isso, mas a configuração do Playwright não é deste card (Q-11406): pedir ao
dono pelo board antes.

## 7. Estados, imagens e catálogo grande

### Estados (AC-11416)

| Estado       | Telas                                            | Como provocar no teste                                                     |
| ------------ | ------------------------------------------------ | -------------------------------------------------------------------------- |
| vazio        | descoberta, catálogo, sacola, favoritos, pedidos | loja sem produto, busca sem resultado, conta nova                          |
| erro         | catálogo, produto, loja, fechamento              | `page.route` devolvendo 500; apelido ou produto inexistente (404)          |
| carregamento | catálogo, produto, fechamento                    | `page.route` com atraso; conferir anúncio (`aria-busy` ou `role="status"`) |

### Imagens (AC-11417)

- sem foto: produto e loja sem imagem mostram o substituto do ramo (capas
  padrão por tipo de negócio já existem em `apps/web/public/capas-padrao/`);
- foto quebrada: `page.route` devolvendo 404 para a imagem;
- moldura reservada: deslocamento de layout medido com `PerformanceObserver`
  (`layout-shift`) menor que 0,1;
- texto alternativo: regra `image-alt` do axe e conferência de que foto
  decorativa tem `alt=""`;
- carga tardia: fotos fora da primeira dobra com `loading="lazy"`.

### Catálogo grande (AC-11418, AC-11419)

- Loja dedicada `e2e-catalogo-grande`, criada e limpa pela própria fixture
  (`e2e/fixtures/catalogo-grande.ts`), com N produtos gerados (Q-11407). Não
  usar a `e2e-lanchonete`: com `fullyParallel`, encher a loja compartilhada
  muda o tempo do critério antigo de desempenho e o fluxo do carrinho. Não
  usar a UniversoKar: o catálogo dela vem de um arquivo externo do fornecedor
  (`packages/database/seed/winsis/index.ts`).
- Medidas com o relógio do navegador (`performance.mark`, `PerformanceObserver`),
  rede móvel emulada como em `comoRobo`, 5 repetições, mediana.
- Os limites (2,5 s, 0,1, 200 ms) são proposta (Q-11407) e só comparam a
  mesma máquina; os dois computadores do projeto (Mac e Windows) não se
  comparam entre si.
- Conferir que a página não desenha todos os produtos: contagem de cartões
  no DOM menor que N na primeira carga.

## 8. Pacote de evidências e auditoria

Por rodada (onda entregue):

1. `onp-spec verify stitch-validacao-visual` (um card por vez, saída em
   `.spec/raw/`) e `onp-spec audit --json` filtrado pela feature;
2. relatório do Playwright dos arquivos `*.onp.spec.ts` deste card e dos
   testes antigos da seção 5, com contagem de pulados;
3. manifesto de capturas e de diferenças (seção 3), capturas no local da
   Q-11408;
4. capturas manuais do simulador (seção 6);
5. registro da revisão do dono (AC-11403);
6. matriz da seção 4 atualizada: cada critério com "provado", "pendente" ou
   "sem prova", e o tipo de prova.

Critério sem prova executada fica "pendente"; teste pulado, `todo` ou só
escrito não conta (AC-11420, P-101). Enquanto a Q-11405 não for respondida,
critério de nível comportamento aparece como "sem prova" no audit e é
mostrado ao dono com o relatório do Playwright ao lado, sem ser apresentado
como prova do motor.

Princípios (AC-11421): P-102, P-103 e P-104 têm buscas proibidas na
constituição e o audit as aplica. P-105 é recomendação sem busca: a prova
aqui lê o texto das telas capturadas (`page.innerText`) e procura os dados do
export (CNPJ, telefone e endereço de exemplo, "10x sem juros", "45 min",
notas, cupom). P-106 também não tem linha de verificação: os testes de
contraste e toque levam a marca `@principle:P-106` só para rastreabilidade;
um portão exigiria pedido ao gerente e ao #103, porque este card não edita a
constituição.

## 9. Ordem proposta (Q-11410)

1. Jornada de compra e testes antigos (T-11404, T-11405) — protegem a venda.
2. Acessibilidade e teclado (T-11406 a T-11409).
3. Estados e imagens (T-11410).
4. Capturas e manifesto (T-11402, T-11403) por onda entregue.
5. Catálogo grande (T-11411).
6. Auditoria da onda (T-11412).

Todas dependem da implementação aprovada dos cards #104–#111 de cada tela e
rodam uma após a outra, na pasta principal, sem worktree.
