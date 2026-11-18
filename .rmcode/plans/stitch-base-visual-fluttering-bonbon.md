# Plano #104 — Stitch · Base visual (T-10401…T-10410)

## Contexto

Primeira feature do redesign Stitch ("Kinetic Retail Dark"). Cria a base que os cards #105–#114 vão usar: tokens (cor, tipografia, toque e brilho), a fonte Plus Jakarta Sans e as peças novas do `packages/ui` (Chip, Abas, Gaveta, AvisoFlutuante, BarraInferior, botão marcável, CTA do cliente, busca, cartão de vitrine e ícones). Tudo aparece no catálogo `/ui`. A spec está em `.spec/features/stitch-base-visual/`. Nenhuma tela é migrada aqui: cada card dono aplica as peças nas suas.

Execução: na pasta principal, uma tarefa depois da outra, sem worktree, sem commit, sem push e sem trocar de branch.

## Decisões do usuário (12/11/2026)

| Pergunta | Decisão |
|---|---|
| Q-10401 fonte | Plus Jakarta Sans em tudo, via `next/font/google` |
| Q-10402 tema | Claro e escuro continuam. O escuro vira o Stitch. No claro, a paleta fica igual (AC-10420) e só as peças novas entram |
| Landing `/` | Fonte congelada: Space Grotesk e Inter continuam só na landing. Os tons escuros mudam lá também (o usuário aceitou) |
| Q-10404 | Do Stitch, menos a divisória: `--cor-superficie-alta` #1f2722, `--cor-tinta-suave` #9ba39f, `--cor-sucesso` #2ee59d. `--cor-borda` continua #3d4742 |
| Q-10405 | Token novo `--altura-toque-cliente: 3rem`, só nas peças do cliente. `--altura-toque` continua 44px |
| Q-10406/7 | Com efeitos: brilho no CTA do escuro e pulso ao curtir, os dois desligados com movimento reduzido. Estrela preenchida #ffd600 no escuro e cor do texto no claro |

Hipóteses (sem pergunta):
- Q-10403: quando os mockups divergem, vale o do **celular** (P-012).
- Q-10408: corrigir o `Dialogo` fica fora deste card. A Gaveta não depende dele.
- O botão marcável mantém o mesmo nome e só troca `aria-pressed` (padrão WAI-ARIA). Isso diverge do "Curtir/Descurtir" da design §5.
- `--tipo-rotulo-sm` fica em 12/16px, não 11px (AC-10403).
- `stories.css` não é editado (design §5). A reserva é solta no fim.
- A spec só pode receber marcação de status: as respostas das Q e as divergências acima vão no `card_report` e num recado ao gerente para atualizar a spec. O audit casa teste por `@spec:AC`, não por caminho.

## Contrato das peças (server/client)

- Sem `"use client"`, só markup e utilizáveis por layout de servidor: `Chip`, `FaixaDeChips`, `BarraInferior`, `Botao` (`marcado`, `cta`), `Campo` (`busca`, `rotuloOculto`), `Cartao` (`superficie="vitrine"`). Itens com `aoAcionar` ou `aoAlternar` exigem um pai client. `componenteDeLink` (por exemplo o `Link` do Next) pode vir do servidor.
- Com `"use client"`: `Abas` (controlada com `ativa`/`aoTrocar` ou livre com `ativaInicial`), `Gaveta`, `AvisoFlutuante` e `BotaoMarcavel`. Este último envolve o `Botao` e liga o pulso só na transição de desmarcado para marcado.
- `BarraInferior` (pedidos do #105): `rotulo` obrigatório, que vira o `aria-label` do `<nav>` (sem padrão; o #105 vai usar "Navegação principal"). `itens: { id, rotulo, icone, ativo? }` mais um destes: `{ href, atributos? (data-*) }` ou `{ aoAcionar }` (vira `<button>`). `componenteDeLink?`, `oculta?` (`inert` + `data-oculta`), `embutida?` (só no `/ui`). Classe estável `.sc-barra-inferior` e token `--altura-da-barra-inferior`. Os tokens de camada (Q-10507) ficam fora.
- Ids: toda peça com ids derivados (Abas, Gaveta, Campo) recebe o `id` base de quem chama. O `/ui` usa prefixo por tema para não repetir id.

## Arquivos (dono #104)

Modificar: `packages/ui/styles/{theme.css,componentes.css}`, `packages/ui/src/{tokens.ts,index.ts,icones.ts,botao.tsx,campo.tsx,cartao.tsx,tema-loja.tsx,contraste.ts}`, `apps/web/src/app/{layout.tsx,tokens.css,globals.css}`, `apps/web/src/app/(dev)/ui/{page.tsx,_secoes/SecoesDaMarca.tsx}`, `apps/web/tests/tipografia-identidade.test.ts`.
Criar: `packages/ui/src/{chip,abas,gaveta,aviso-flutuante,barra-inferior,botao-marcavel}.tsx`, `apps/web/src/app/(dev)/ui/_secoes/{SecaoDaBaseVisual,DemosDaBaseVisual}.tsx` e os testes abaixo. Os testes com jsdom ficam em `apps/web/tests/` (projeto `web`, com `preparo-navegador.ts`), porque o `packages/ui` não tem jsdom. Isso diverge dos caminhos da design §8.

## Tarefas (em sequência; todas tocam `componentes.css` e `index.ts`)

1. **T-10401 Tokens** (`theme.css`, `tokens.ts`). Os 3 valores escuros nos 3 blocos escuros e em `PALETA_ESCURA`. A escala `--tipo-<papel>-{tamanho,altura,peso,espaco}`, sem abreviação `font`. Títulos xl e lg mudam em `@media (min-width: 1024px)`. Também `--peso-negrito` 700, `--peso-extra` 800, `--altura-toque-cliente`, `--brilho-forma: 0 0 24px`, `--brilho-forca` (35% nos 3 blocos escuros, 0% em `:root` **e** em `[data-tema="claro"]`) e `--cor-estrela` (#ffd600 no escuro, currentColor nos dois blocos claros). Espelhos `ESCALA_TIPOGRAFICA`, `ESCALA_TIPOGRAFICA_COMPUTADOR`, `MEDIDAS.alturaToqueCliente` e `COR_DA_ESTRELA_NO_ESCURO`. Teste `packages/ui/tests/base-visual-tokens.onp.test.ts`, com parser que ancora blocos dentro de `@media`:
   - AC-10401: sem `b2f800`, nem `178,248,0` ou `178 248 0`, em `apps/web/src`, `apps/web/public` e `packages/ui/{src,styles}`;
   - AC-10402: os 3 blocos iguais a `PALETA_ESCURA`;
   - AC-10403: CSS igual ao TS no celular e no computador, ≥12px;
   - AC-10404: texto ≥4,5 e `--cor-borda-forte` ≥3 contra #0b0f0d, #161c19, #1f2722 e #000; a estrela ≥3 nas superfícies escuras;
   - AC-10420: claro igual a `PALETA_CLARA`, e os tokens novos iguais entre `:root` e o trecho claro.
2. **T-10402 Fonte** (`layout.tsx`, `globals.css`, `tokens.css`, teste legado).
   - `Plus_Jakarta_Sans` preenche `--fonte-titulo-da-marca` e `--fonte-corpo` (assim `legal.css` e `contexto-da-foto.css` acompanham). `Space_Grotesk` e `Inter` entram com `preload: false` em `--fonte-legada-titulo` e `--fonte-legada-corpo`.
   - As 4 classes `.variable` (Jakarta e as legadas) no `className` do `<html>`.
   - `viewportFit: "cover"`.
   - `globals.css`: `body:has(.sc-lp-topo)` redefine as quatro variáveis (`--fonte-titulo-da-marca`, `--fonte-corpo`, `--fonte-titulo` e `--fonte-base`) com as legadas e a pilha de sistema.
   - `tokens.css`: `--text-titulo-xl…` com `--line-height` e `--letter-spacing`, mais `--font-weight-bold` e `--font-weight-extrabold`.
   - O teste legado continua com `@spec:AC-942` e prova "família da marca por next/font com variáveis globais" (Jakarta). O PR registra que o AC-942 foi substituído pelo AC-10403.
   - Teste novo `apps/web/tests/fonte-base-visual.onp.test.ts`: as quatro variáveis da landing, `preload: false` nas legadas e `viewportFit`.
3. **T-10403 Ícones e marcável** (`icones.ts`, `botao.tsx`, `botao-marcavel.tsx`, `componentes.css`).
   - `IconeCompartilhar` (Share2) e os ícones que faltam para o feed e o legal largarem o lucide direto, só os que não existem.
   - `IconeEstrela` concatena `sc-icone-estrela` ao `className`.
   - `Botao.marcado` vira `aria-pressed` e `.sc-botao--marcavel`. `BotaoMarcavel` põe `data-pulso` só na transição e o tira em `animationend`.
   - CSS: pulso em `[data-pulso]` e `.sc-icone-estrela[data-preenchido]` com `color: var(--cor-estrela)`.
   - Testes `packages/ui/tests/icones-de-acao.onp.test.tsx` (SSR: sem coração, aria-pressed, nome fixo, render já marcado sem `data-pulso`) e `apps/web/tests/botao-marcavel.onp.test.tsx` (jsdom: pulso na transição).
   - Catraca do AC-10407, com regex `/from\s+["']lucide-react(\/[^"']*)?["']/`: as peças novas nunca importam. A lista exata de hoje (landing, legal e feed) só pode diminuir. Aviso o #106 e o #105.
4. **T-10404 CTA, botão e campo** (`botao.tsx`, `campo.tsx`, `componentes.css`).
   - `Botao.cta` gera `.sc-botao--cta`: pílula, `min-height: var(--altura-toque-cliente)` e `box-shadow: var(--brilho-forma) color-mix(in srgb, var(--cor-primaria) var(--brilho-forca), transparent)`. A cor só entra na regra, então segue a loja. `.sc-botao--pilula` não muda (é usada no painel).
   - `Campo.busca` (type search, `IconeBuscar`, `.sc-campo--busca` com altura do cliente, `--cor-superficie-alta` e contorno `--cor-borda-forte`; o desabilitado é revisado) e `rotuloOculto`.
   - `@media (prefers-reduced-motion: reduce)` na própria regra da peça: `.sc-botao--cta { box-shadow: none }`, sem `transform` no `:active` e sem pulso. Nada de redefinir só em `:root`, porque um trecho com `data-tema` herdaria os 35%.
   - Teste `packages/ui/tests/botao-e-campo.onp.test.tsx`: AC-10408, AC-10409 e AC-10417 (outline-offset, sem tabindex positivo nas peças), e a regra `.sc-botao--pilula` intacta.
5. **T-10405 Chip e Abas** (`chip.tsx`, `abas.tsx`). O ativo tem fundo `--cor-primaria`, texto `--cor-em-primaria` e borda `--cor-primaria-texto`. Contornos com `--cor-borda-forte`. A faixa rola sem barra visível. Testes `apps/web/tests/chip-e-abas.onp.test.tsx` (jsdom: aria-pressed e aria-current, todos alcançáveis pelo Tab, setas, Home, End e roving) e regras de CSS sem `--cor-marca`. Cobrem AC-10410, AC-10411 e AC-10415.
6. **T-10406 Gaveta e aviso** (`gaveta.tsx`, `aviso-flutuante.tsx`).
   - Gaveta: guarda `document.activeElement` antes de `showModal()`. `onCancel` faz `preventDefault` e chama `aoFechar`. `onClose` também chama `aoFechar` quando `aberta` ainda é true. Devolve o foco ao fechar. Tem `aria-labelledby`, `lado`, área segura e `embutida`.
   - AvisoFlutuante: **duas** regiões vivas sempre montadas (status e alert), `duracao` ≥5000ms, pausa em mouseenter e focusin e botão de fechar.
   - Teste `apps/web/tests/gaveta-e-aviso.onp.test.tsx` (dublê de showModal e close, timers falsos): AC-10412 e AC-10413. O foco preso real fica no e2e.
7. **T-10407 Barra inferior e cartão** (`barra-inferior.tsx`, `cartao.tsx`, `theme.css` para `--altura-da-barra-inferior`, `index.ts`). Teste `packages/ui/tests/barra-inferior.onp.test.tsx`: AC-10414 (aria-label obrigatório, aria-current="page", rótulos visíveis, safe-area no CSS, `componenteDeLink`, `aoAcionar` como `<button>`, `oculta` com inert).
8. **T-10408 Cor da loja e foco** (`contraste.ts`, `tema-loja.tsx`, `index.ts`).
   - Função nova `ajustarParaContrasteContraTodos(cor, fundos[], minimo)` em `contraste.ts`:
     - ajusta contra o fundo de menor contraste;
     - confere todos os fundos e repete até 3 vezes;
     - se ainda não alcançar, usa a tinta extrema que passa em todos.
   - `calcularTemaDaLoja` passa a usá-la no `--cor-foco`, com os fundos do tema: fundo, `superficie` e `superficieAlta`, mais #000 no escuro.
   - Teste `packages/ui/tests/cor-da-loja-nas-pecas.onp.test.ts`:
     - AC-10415: `componentes.css` sem `--cor-marca`;
     - AC-10416, no escuro (via `marcaDaLoja`): para todas as `AMOSTRAS_DE_DESTAQUE_DA_LOJA` mais cores médias e escuras (#777777, #1b3a6b, #5b2d82, #b3261e, #0f6e5c), `--cor-em-primaria` sobre `--cor-primaria` ≥4,5 e `--cor-primaria-texto` sobre #000 ≥4,5; quando o fundo dá <3, `avisos` e `corSugerida` aparecem;
     - AC-10417, por tema: foco ≥3 sobre fundo, `superficie` e `superficieAlta`, mais #000 só no escuro; no claro, contra a `PALETA_CLARA`.
   - Rodar também `tema-loja.test.tsx` e `marca-da-loja.test.ts`.
9. **T-10409 Catálogo /ui** (`page.tsx`, `SecaoDaBaseVisual.tsx`, `DemosDaBaseVisual.tsx` com todo handler e `componenteDeLink`, `SecoesDaMarca.tsx` com o texto da fonte atualizado). Peças em cada estado, em claro, escuro e dentro de `TemaDaMarca`. Ids e rótulos de `nav` com prefixo por tema. Ramos variados (lanchonete, mercado, moda), sem dados do Stitch e sem "badge/pill/rounded-full". Teste `apps/web/tests/catalogo-base-visual.onp.test.tsx` (AC-10418). Critério: `vitrine-ui-a11y`, `vitrine-identidade` e `vitrine-ui-estados` verdes.
10. **T-10410 E2E** (`e2e/specs/base-visual.onp.spec.ts`, padrão do `a11y-vitrine.spec.ts`). `/ui` em 344, 768 e 1280px sem rolagem lateral, axe sem violação crítica nem séria, Esc na gaveta, foco preso e devolução ao gatilho. Com reduced-motion, sem `box-shadow` no CTA e sem animação. Combinar com o #114.

Regras dos testes:
- Testes com jsdom começam com `// @vitest-environment jsdom` (o projeto `web` não define ambiente).
- A catraca do lucide procura `["']lucide-react(\/[^"']*)?["']` em qualquer string, o que pega também `import "…"` e `import()`.
- O `/ui` mostra **um** AvisoFlutuante de demonstração, para não multiplicar regiões vivas.

Títulos de teste: `"[CA-n] @spec:AC-104xx …"`. As tarefas são marcadas `[feito]` em tasks.md à medida que terminam.

## Riscos

- Tons escuros novos na landing e no painel escuro: o usuário aceitou. Detecção: axe e e2e.
- Stories "Moderno" (`features/stories/fontes.ts`, de outro dono) lê `--fonte-titulo-da-marca` e passará a desenhar em Jakarta. Antes da T-10402, aviso o dono (#106) de que `--fonte-legada-titulo` continua disponível. Não edito o arquivo.
- `legal.css` (cookies) sobe pela `nav[aria-label="Atalhos"]`. A troca do seletor para `.sc-barra-inferior` é do #105/dono do legal.
- `viewportFit: "cover"` pode pôr barras fixas atuais sob o indicador do iPhone. Validação no #114.
- O ajuste de foco em `tema-loja.tsx` pode mudar valores esperados em testes legados. Se algum teste fixar um valor exato, paro e aviso o gerente.
- Outro teste legado que fixe valores antigos: paro e aviso o gerente, sem afrouxar o teste.

## Verificação

`pnpm typecheck` · `pnpm lint` · `pnpm exec vitest run --project unit packages/ui/` · `pnpm exec vitest run --project web apps/web/tests/` · `pnpm test:unit` · o audit do onp-spec filtrado por `stitch-base-visual` · `/ui` no navegador (`pnpm lp`) em 344, 768 e 1280px · `pnpm --filter @simpleclick/e2e exec playwright test specs/base-visual.onp.spec.ts`, se o ambiente subir.
