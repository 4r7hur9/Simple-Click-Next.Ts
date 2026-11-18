# Tarefas: Base visual e componentes reutilizáveis do Stitch

> feature: stitch-base-visual

<!--
  Card #104. Todas pendentes: implementação NÃO autorizada.
  Execução futura: uma tarefa após a outra, na pasta principal, sem worktree
  (várias compartilham componentes.css e index.ts). Testes só *.onp.test.ts(x)
  com título "[CA-n] @spec:AC-104xx …". Nenhuma tarefa depende de função
  "A decidir" (#115–#126).
-->

## Perguntas que bloqueiam tarefas

| Pergunta | Bloqueia         | O que fica parado                                         |
| -------- | ---------------- | --------------------------------------------------------- |
| Q-10401  | T-10402          | família da fonte (os nomes dos tokens não dependem dela)  |
| Q-10402  | T-10401          | se o tema escuro passa a valer em conta, painel e admin   |
| Q-10403  | T-10401, T-10404 | valores de brilho, raio e cor quando as telas divergem    |
| Q-10404  | T-10401          | valores de superfície 2, tinta média, divisória e sucesso |
| Q-10405  | T-10404          | altura de toque global ou token só do cliente             |
| Q-10406  | T-10401, T-10403 | token de brilho e pulso do curtir                         |
| Q-10407  | T-10403          | cor da estrela preenchida                                 |
| Q-10408  | nenhuma          | a Gaveta não depende do Dialogo                           |

## T-10401 — Tokens do redesign e prova de sincronia [feito]

- Refs: US-10401, AC-10401, AC-10402, AC-10403, AC-10404, AC-10420
- Arquivos: packages/ui/styles/theme.css, packages/ui/src/tokens.ts, packages/ui/tests/base-visual-tokens.onp.test.ts
- Escala `--tipo-*`, pesos 700 e 800, valores escolhidos em Q-10404 nos três
  blocos escuros e em `PALETA_ESCURA`. Tema claro intacto.
- Teste novo compara os três blocos com o espelho e mede contraste contra
  #0b0f0d, #161c19 e #000. Não altera `packages/ui/tests/tokens.test.ts`.

## T-10402 — Família da fonte [feito]

- Refs: US-10401, AC-10403
- Arquivos: apps/web/src/app/layout.tsx, apps/web/src/app/tokens.css, packages/ui/styles/theme.css
- Depende de: T-10401
- Troca só o que preenche `--fonte-titulo-da-marca` e `--fonte-corpo`, por
  `next/font` (ASM-10402); expõe a escala `--tipo-*` ao Tailwind.

## T-10403 — Ícones de ação e botão marcável [feito]

- Refs: US-10402, AC-10405, AC-10406, AC-10407
- Arquivos: packages/ui/src/icones.ts, packages/ui/src/botao.tsx, packages/ui/styles/componentes.css, packages/ui/tests/icones-de-acao.onp.test.tsx
- Depende de: T-10401
- `IconeCompartilhar`; variante marcável do botão com `aria-pressed`; prova
  de que não há coração nem import direto da biblioteca de ícones nas telas.
- A troca nas telas do feed é do #106.

## T-10404 — Botão e campo nos estados do redesign [feito]

- Refs: US-10403, AC-10408, AC-10409, AC-10417
- Arquivos: packages/ui/src/botao.tsx, packages/ui/src/campo.tsx, packages/ui/styles/componentes.css, packages/ui/styles/theme.css, packages/ui/src/tokens.ts, packages/ui/tests/botao-e-campo.onp.test.tsx
- Depende de: T-10403
- Pílula do CTA, superfície do campo, variante de busca, altura de toque
  conforme Q-10405 (token novo se for só do cliente). Inclui o caso dentro de
  `TemaDaMarca`.

## T-10405 — Chip e Abas [feito]

- Refs: US-10403, AC-10410, AC-10411, AC-10415
- Arquivos: packages/ui/src/chip.tsx, packages/ui/src/abas.tsx, packages/ui/src/index.ts, packages/ui/styles/componentes.css, packages/ui/tests/chip-e-abas.onp.test.tsx
- Depende de: T-10404
- Contrato em design.md seção 5. Teclado provado em jsdom. Caso dentro de
  `TemaDaMarca` incluído.

## T-10406 — Gaveta e aviso flutuante [feito]

- Refs: US-10403, AC-10412, AC-10413
- Arquivos: packages/ui/src/gaveta.tsx, packages/ui/src/aviso-flutuante.tsx, packages/ui/src/index.ts, packages/ui/styles/componentes.css, packages/ui/tests/gaveta-e-aviso.onp.test.tsx
- Depende de: T-10405
- Gaveta com `showModal()` e `close()` (dublê no jsdom), devolução do foco e
  área segura. Aviso flutuante com `role="status"` ou `alert`, sem roubar foco.

## T-10407 — Barra inferior e cartão de vitrine [feito]

- Refs: US-10403, AC-10414
- Arquivos: packages/ui/src/barra-inferior.tsx, packages/ui/src/cartao.tsx, packages/ui/src/index.ts, packages/ui/styles/componentes.css, packages/ui/tests/barra-inferior.onp.test.tsx
- Depende de: T-10406
- A aplicação da barra na moldura da loja e no feed é do #105.

## T-10408 — Prova transversal de cor da loja e foco [feito]

- Refs: US-10404, US-10405, AC-10415, AC-10416, AC-10417
- Arquivos: packages/ui/tests/cor-da-loja-nas-pecas.onp.test.ts
- Depende de: T-10407
- Só o teste: busca de `--cor-marca` nas peças comuns, contraste de
  `marcaDaLoja` para as amostras e cores médias, anel de foco em cada fundo.

## T-10409 — Seção da base visual no catálogo /ui [feito]

- Refs: US-10406, AC-10418
- Arquivos: apps/web/src/app/(dev)/ui/_secoes/SecaoDaBaseVisual.tsx, apps/web/src/app/(dev)/ui/page.tsx, apps/web/tests/catalogo-base-visual.onp.test.tsx
- Depende de: T-10408
- Exemplos de lojas de ramos variados; nenhum dado nem imagem do Stitch.

## T-10410 — Prova em navegador das larguras e do movimento [feito]

- Refs: US-10406, AC-10419
- Arquivos: e2e/specs/base-visual.onp.spec.ts
- Depende de: T-10409
- Combinar com o #114 (e2e não roda no `onp-spec verify`; ASM-10404).
