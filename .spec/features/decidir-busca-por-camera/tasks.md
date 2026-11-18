# Tasks: Buscar produto lendo o código pela câmera (a decidir)

> feature: decidir-busca-por-camera

<!--
  Card #123 — bloco de códigos 12301 a 12399.
  Todas as tarefas ficam [pendente] e PRESAS à decisão do dono do produto:
  nenhuma começa antes da Q-12301 respondida (P-107), nenhuma tem auto_start e
  nenhuma tarefa do redesign depende delas. A execução futura é uma tarefa após
  a outra, na pasta principal, sem worktrees e sem o executor paralelo do
  motor. Arquivos de outros cards só com a vez combinada (design.md §6).
  Em "Arquivos" ficam só caminhos que já existem (pastas-mãe dos novos); o
  que ainda não existe está em "A criar".
-->

## T-12301 — Regras puras da leitura: código aceito, situação e textos [pendente]

- Refs: US-12301, AC-12302, US-12302, AC-12305
- Arquivos: apps/web/src/lib/, apps/web/tests/
- A criar: apps/web/src/lib/leitura-de-codigo.ts, apps/web/tests/leitura-de-codigo.onp.test.ts
- Depende de: Q-12301, Q-12302
- Notas: `normalizarCodigoLido` aceita só dígitos com 8, 12 ou 13 caracteres e
  dígito verificador correto, e devolve o código ou o motivo da recusa; função
  de situação no estilo de `situacaoDaCamera`; textos para o cliente sem falar
  de story nem de painel. Formatos extras só se a Q-12302 pedir.

## T-12302 — Componente LeitorDeCodigo com câmera e decodificador injetados [pendente]

- Refs: US-12301, AC-12301, AC-12302, AC-12303, AC-12307, US-12302, AC-12304, AC-12305
- Arquivos: apps/web/src/features/vitrine/, apps/web/tests/
- A criar: apps/web/src/features/vitrine/LeitorDeCodigo.tsx, apps/web/tests/leitor-de-codigo.onp.test.tsx
- Depende de: T-12301, Q-12304, Q-12306
- Notas: ilha cliente; reaproveita `restricoesDaCamera`, `classificarErroDaCamera`
  e `pararCamera` de `features/stories/captura.ts` sem alterar esse arquivo;
  efeito próprio com `visibilitychange`; sem `enumerateDevices`; um leitor ativo
  por vez; formulário achado por `closest("form")` e enviado uma vez por
  `requestSubmit`. Proibido usar o valor lido em `window.location`, `href` ou
  `innerHTML`. Biblioteca de leitura só se a Q-12304 escolher, servida pelo
  próprio domínio e carregada sob demanda.

## T-12303 — Ícone do leitor no pacote de ícones (vez do #104) [pendente]

- Refs: US-12301, AC-12305
- Arquivos: packages/ui/src/icones.ts, packages/ui/src/index.ts
- Depende de: Q-12301
- Notas: `IconeLerCodigo` a partir do `ScanBarcode` do lucide; nada de Material
  Symbols (P-103). Pedir a vez ao #104 por board_message.

## T-12304 — Encaixar o leitor na busca do catálogo (vez do #108) [pendente]

- Refs: US-12301, AC-12301, AC-12307, US-12302, AC-12305
- Arquivos: apps/web/src/features/vitrine/BuscaProduto.tsx, apps/web/src/features/vitrine/BarraDeCatalogo.tsx, packages/ui/styles/vitrine.css, apps/web/tests/
- A criar: apps/web/tests/busca-com-leitor.onp.test.tsx
- Depende de: T-12302, T-12303
- Notas: o formulário GET continua igual e funcionando sem JavaScript; o leitor
  fica dentro do painel do celular sem fechar o popover; botão de 48×48px.
  Conferir que `apps/web/tests/vitrine-busca.test.tsx` e
  `apps/web/tests/filtro-atacado.test.tsx` continuam passando.

## T-12305 — "Ler de novo" na tela sem resultado [pendente]

- Refs: US-12303, AC-12306
- Arquivos: apps/web/src/features/vitrine/BuscaProduto.tsx, apps/web/src/app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx, apps/web/src/server/catalogo-na-tela.ts, apps/web/tests/
- A criar: apps/web/tests/sem-resultado-leitor.onp.test.tsx
- Depende de: T-12304
- Notas: marcador no endereço que indica busca vinda do leitor, montado no
  servidor junto do `linkSemBusca`; `SemResultado` continua componente de
  servidor. Fila de donos: #108 → #109 → #110.

## T-12306 — Teste de integração: código de barras da variação acha o produto [pendente]

- Refs: US-12303, AC-12308
- Arquivos: apps/api/tests/
- A criar: apps/api/tests/busca-por-codigo-de-barras.onp.test.ts
- Depende de: Q-12301
- Notas: projeto api-int, fora do verify do ONP (ASM-12308); cobrir EAN-13
  igual ao cadastro e isolamento entre lojas. Se a Q-12307 pedir normalização
  (UPC-A e EAN-13, UPC-E), abrir tarefa nova na API e no contrato
  `packages/contracts/src/vitrine.ts`, que é do #108.

## T-12307 — Cabeçalho de permissão da câmera e limite na borda [pendente]

- Refs: US-12301, AC-12303
- Arquivos: infra/traefik/dynamic/middlewares.yml, infra/compose/docker-compose.yml
- Depende de: Q-12308
- Notas: `Permissions-Policy: camera=(self)` nos cabeçalhos seguros e o
  middleware `limite-de-borda` ligado nos roteadores. Antes, confirmar como a
  produção é publicada; dono da infraestrutura a definir pelo gerente.
