# Design: Base visual e componentes reutilizáveis do Stitch

> feature: stitch-base-visual · card #104 · 06/11/2026

Documento de especificação. Nada aqui está aprovado para implementação: as
decisões do dono do produto estão nas perguntas Q-10401…Q-10408 da spec.
Os cards #105–#114 leem a **seção 5 (contrato das peças)** e a **seção 4
(regra de cor)** para especificar as suas telas.

Caminhos relativos à raiz `/Users/stargrupo/Projetos/SC`.

## 1. Origem e limites

- Referência: `kinetic_retail_dark/DESIGN.md` e os 7 `code.html` do ZIP do
  Stitch (origem e sha256 em `.spec/features/stitch-planejamento/design.md`,
  seção 1). Lido sem extrair para o repositório.
- O export é referência visual. Não entram no produto: Tailwind por CDN,
  Material Symbols, imagens do googleusercontent (P-103), números, CNPJ,
  prazos e promessas dos mockups (P-105), nada automotivo (P-104).
- O catálogo `/ui` usa exemplos de lojas de ramos variados (lanchonete,
  mercado, moda, autopeças como mais um ramo), nunca a "Universokar".

## 2. Estado atual (evidência)

| Assunto               | Onde está                                                                                                       | O que existe                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paleta e papéis       | `packages/ui/styles/theme.css`                                                                                  | `--marca-*` brutos; `--cor-*` semânticos; três blocos de tema (media escura, `[data-tema="escuro"]`, `[data-tema="claro"]`)                                                       |
| Espelho TS            | `packages/ui/src/tokens.ts`                                                                                     | `PALETA_CLARA`, `PALETA_ESCURA`, `MEDIDAS`, `PALETA_OFICIAL`, `COR_DE_FUNDO_DA_LOJA` (#000000), `AMOSTRAS_DE_DESTAQUE_DA_LOJA`                                                    |
| Prova legada          | `packages/ui/tests/tokens.test.ts`                                                                              | sincronia CSS e TS de dois blocos; contraste 4,5:1 e 3:1 contra `PALETA_*.fundo` (não contra #000)                                                                                |
| Espaço                | `theme.css`                                                                                                     | `--espaco-0…8` em passos de 4px (igual à escala do Stitch)                                                                                                                        |
| Raio                  | `theme.css`                                                                                                     | `--raio-1` 4px, `--raio-2` 8px, `--raio-3` 12px, `--raio-botao` 10px, `--raio-cartao` 16px, `--raio-janela` 24px, `--raio-completo`                                               |
| Tipografia            | `theme.css`, `apps/web/src/app/layout.tsx`                                                                      | `--texto-xs…2xl`, pesos 400/500/600; Space Grotesk (`--fonte-titulo-da-marca`) e Inter (`--fonte-corpo`) por `next/font/google`                                                   |
| Ponte Tailwind        | `apps/web/src/app/tokens.css`                                                                                   | `@theme inline` com `--color-*` e `--font-*` apontando para os tokens                                                                                                             |
| Toque                 | `theme.css`, `tokens.ts` (`MEDIDAS.alturaToque`)                                                                | `--altura-toque` 2.75rem (44px), `--altura-toque-grande` 3rem; usado em 16 folhas de `packages/ui/styles/`                                                                        |
| Foco                  | `packages/ui/styles/componentes.css`                                                                            | `outline: 2px solid var(--cor-foco)` com `outline-offset: 2px` em `:focus-visible`                                                                                                |
| Botão                 | `packages/ui/src/botao.tsx` (`VarianteDeBotao`, `FormaDeBotao`, `TamanhoDeBotao`)                               | primária, secundária, perigo, discreta; padrão ou pílula; normal, pequeno, grande; `carregando`, `soIcone`                                                                        |
| Campo                 | `packages/ui/src/campo.tsx` (`CampoProps`)                                                                      | rótulo obrigatório, dica, erro, sucesso, carregando, desabilitado, `controle` trocável                                                                                            |
| Cartão                | `packages/ui/src/cartao.tsx` (`CartaoProps`)                                                                    | moldura com estados de tela (vazio, erro, carregando, sucesso)                                                                                                                    |
| Selo                  | `packages/ui/src/selo.tsx` (`TomDeSelo`)                                                                        | pílula neutro, sucesso, atenção, erro, info                                                                                                                                       |
| Diálogo               | `packages/ui/src/dialogo.tsx` (`Dialogo`)                                                                       | renderiza `<dialog open>` pelo atributo, **sem** `showModal()`: não fecha com Esc, não prende foco, não devolve foco                                                              |
| Gavetas reais         | `apps/web/src/features/feed/GavetaDeComentarios.tsx`, `apps/web/src/features/painel-filtros/BarraDeFiltros.tsx` | cada uma faz `showModal()` próprio                                                                                                                                                |
| Chip                  | `packages/ui/styles/filtros.css` (`.sc-filtros__chip`)                                                          | só classe de tela (painel)                                                                                                                                                        |
| Abas                  | `apps/web/src/features/vitrine/AbasDeCategoria.tsx`, `packages/ui/styles/vitrine.css` (`.sc-vitrine__aba`)      | navegação por links de categoria, só na vitrine                                                                                                                                   |
| Gaveta (classe)       | `packages/ui/styles/filtros.css` (`.sc-gaveta`)                                                                 | só classe de tela                                                                                                                                                                 |
| Toast, barra inferior | —                                                                                                               | não existem                                                                                                                                                                       |
| Curtir e favoritar    | `packages/ui/src/icones.ts` (`IconeBrilho`, `IconeEstrela`)                                                     | ✦ e ★, contorno ou preenchido (`data-preenchido`); `aria-pressed` aplicado pelas telas do feed                                                                                    |
| Compartilhar          | `packages/ui/src/icones.ts`                                                                                     | não existe ícone                                                                                                                                                                  |
| Cor da loja (escuro)  | `packages/ui/src/marca-da-loja.ts` (`marcaDaLoja`), `packages/ui/src/tema-da-marca.tsx` (`TemaDaMarca`)         | força `data-tema="escuro"`, fundo #000; sobrescreve `--cor-primaria*` e `--cor-foco` via `calcularTemaDaLoja`; acrescenta `--cor-marca`, `--cor-sobre-marca`, `--cor-marca-texto` |
| Cor da loja (claro)   | `packages/ui/src/tema-loja.tsx` (`TemaDaLoja`, `calcularTemaDaLoja`)                                            | envelope claro usado em `apps/web/src/features/tv/ExibicaoDeCardapio.tsx` e no catálogo `/ui`                                                                                     |
| Catálogo visual       | `apps/web/src/app/(dev)/ui/page.tsx`, `_secoes/`                                                                | seções por família de peça, temas claro e escuro, largura mínima 344px                                                                                                            |

## 3. Tokens: papéis do Stitch → token atual → proposta

Contraste calculado pela fórmula WCAG (relação de luminância).

| Papel no guia do Stitch                   | Valor do Stitch     | Token atual (escuro)    | Valor atual | Proposta                                     | Contraste relevante                                   |
| ----------------------------------------- | ------------------- | ----------------------- | ----------- | -------------------------------------------- | ----------------------------------------------------- |
| Primário (CTA, chip ativo)                | #B7FF00             | `--cor-primaria`        | #b7ff00     | manter                                       | texto #0b0f0d sobre ele 15,91:1                       |
| primary-container do front matter         | #b2f800             | —                       | —           | **recusado** (P-102)                         | —                                                     |
| Fundo (Deep Obsidian)                     | #0B0F0D             | `--cor-fundo`           | #0b0f0d     | manter                                       | —                                                     |
| Superfície 1 (cartão, doca)               | #161C19             | `--cor-superficie`      | #161c19     | manter                                       | branco sobre ele 17,29:1                              |
| Superfície 2 (campo, pílula, pressionado) | #1F2722             | `--cor-superficie-alta` | #202823     | Q-10404                                      | branco sobre #1f2722 15,31:1                          |
| Tinta média (descrição, metadado)         | #9BA39F             | `--cor-tinta-suave`     | #a8b1ab     | Q-10404                                      | #9ba39f sobre #161c19 6,70:1; atual 7,86:1            |
| Divisória fina                            | #252F29             | `--cor-borda`           | #3d4742     | Q-10404; **nunca** contorno de controle      | #252f29 sobre #161c19 1,25:1 (decorativa)             |
| Contorno de controle                      | —                   | `--cor-borda-forte`     | #7a857e     | manter (WCAG 1.4.11)                         | 4,52:1 sobre #161c19; 5,48:1 sobre #000               |
| Menta (aberta, estoque, WhatsApp)         | #2EE59D             | `--cor-sucesso`         | #69d597     | Q-10404                                      | #2ee59d 11,77:1 e #69d597 10,63:1 sobre #0b0f0d       |
| Estrela preenchida                        | #FFD600 ou branco   | `currentColor`          | —           | Q-10407                                      | #ffd600 sobre #161c19 12,25:1; sobre branco só 1,41:1 |
| Brilho "fósforo" do CTA                   | rgba(183,255,0,.35) | —                       | —           | Q-10406; se adotado, token `--sombra-brilho` | decorativo                                            |
| Texto verde sobre verde (botões do HTML)  | #4d6e00             | —                       | —           | recusado (P-106 pede texto escuro)           | 4,60:1, abaixo da regra do guia                       |

Regras:

- Nenhum papel novo do Stitch vira cor solta. Se Q-10404 adotar um valor, ele
  troca o valor do token existente nos **três** blocos escuros do `theme.css`
  e em `PALETA_ESCURA`, com teste novo de sincronia (seção 8).
- O tema claro (`:root` e `[data-tema="claro"]`) não muda nesta feature,
  enquanto Q-10402 não for respondida.

## 4. Regra de cor dentro e fora da loja

- **Peça comum** (`packages/ui/styles/componentes.css`): lê só
  `--cor-primaria`, `--cor-em-primaria`, `--cor-primaria-suave`,
  `--cor-primaria-texto` e `--cor-foco`.
- **Dentro da loja**: `TemaDaMarca` aplica `marcaDaLoja(cor).variaveis`, que já
  sobrescreve esses mesmos `--cor-primaria*` e `--cor-foco` com a cor do dono,
  ajustada para contraste sobre o preto. A peça segue a loja **sem** ler
  `--cor-marca`.
- `--cor-marca`, `--cor-sobre-marca` e `--cor-marca-texto` ficam restritos a
  CSS que só roda dentro do envelope (`vitrine.css`, capas). Fora do envelope
  `--cor-marca-texto` vale #b7ff00, que sobre branco dá 1,21:1, e por isso
  peça comum não pode lê-lo (AC-10415).
- **Envelope claro** (`TemaDaLoja`): mesma regra; o contraste é medido contra
  o fundo claro.
- Contraste da cor da loja é provado contra `COR_DE_FUNDO_DA_LOJA` (#000) e
  contra a superfície das peças, para todas as `AMOSTRAS_DE_DESTAQUE_DA_LOJA`
  e para uma amostra de cores escuras e médias que o seletor aceita.

## 5. Contrato das peças

Coluna "Tipo": **componente** = novo export em `packages/ui/src/index.ts`;
**classe** = só CSS em `componentes.css`; **existente** = já existe, ganha
só variante ou token. Todas as props novas são opcionais (ASM-10401).

| Peça               | Tipo                 | Arquivo futuro                        | Props mínimas (nomes propostos)                                             | Classes                                                                       | ARIA e teclado                                                                                                                                                         | Quem aplica nas telas  |
| ------------------ | -------------------- | ------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Botão              | existente            | `packages/ui/src/botao.tsx`           | atuais; `forma="pilula"` vira a forma do CTA do cliente                     | `.sc-botao--*`                                                                | `<button>` nativo; Enter e Espaço; `aria-busy` ao carregar                                                                                                             | todos                  |
| Botão marcável     | existente (variante) | `packages/ui/src/botao.tsx`           | `marcado` (liga `aria-pressed`), `soIcone`                                  | `.sc-botao--marcavel`                                                         | `aria-pressed` reflete o estado; nome acessível muda ("Curtir" ou "Descurtir")                                                                                         | #106, #107, #109       |
| Campo e busca      | existente            | `packages/ui/src/campo.tsx`           | atuais; tipo `search` com ícone `IconeBuscar`                               | `.sc-campo--busca`                                                            | rótulo sempre presente (pode ser visualmente oculto com `.sc-so-leitor`); erro ligado por `aria-describedby`                                                           | #106, #108             |
| Chip               | componente           | `packages/ui/src/chip.tsx`            | `ativo`, `contagem`, `desabilitado`, `aoAlternar` ou `href`                 | `.sc-chip`, `.sc-chip--ativo`, `.sc-chips` (faixa)                            | botão com `aria-pressed` (filtro) ou link com `aria-current="true"` (categoria); faixa rola sem barra visível e todo chip continua alcançável pelo Tab                 | #106, #108             |
| Abas               | componente           | `packages/ui/src/abas.tsx`            | `abas` (id, rótulo), `ativa`, `aoTrocar`                                    | `.sc-abas`, `.sc-abas__aba`, `.sc-abas__painel`                               | `role="tablist"`, `tab`, `tabpanel`; setas esquerda e direita, Home e End trocam; só a aba ativa tem `tabindex=0`                                                      | #107, #108, #111       |
| Cartão base        | existente (variante) | `packages/ui/src/cartao.tsx`          | `superficie="vitrine"`                                                      | `.sc-cartao--vitrine`                                                         | sem papel interativo; quando o cartão inteiro é link, só um elemento focável                                                                                           | #106, #107, #108       |
| Gaveta             | componente           | `packages/ui/src/gaveta.tsx`          | `id`, `aberta`, `titulo`, `lado` ("baixo", "direita"), `aoFechar`, `rodape` | `.sc-gaveta`, `.sc-gaveta__cabeca`, `.sc-gaveta__corpo`, `.sc-gaveta__rodape` | `showModal()` e `close()`; Esc fecha; foco preso; o foco volta ao gatilho; `aria-labelledby` no título; respeita `env(safe-area-inset-bottom)`                         | #108, #110             |
| Aviso flutuante    | componente           | `packages/ui/src/aviso-flutuante.tsx` | `tom` (TomDeAviso), `mensagem`, `duracao` (mínimo 5 s), `acao`, `aoFechar`  | `.sc-aviso-flutuante`                                                         | `role="status"` com `aria-live="polite"` (erro usa `role="alert"`); não recebe foco ao aparecer; pausa ao passar o mouse ou focar; botão de fechar alcançável pelo Tab | #107, #109, #110       |
| Barra inferior     | componente           | `packages/ui/src/barra-inferior.tsx`  | `itens` (rótulo, href, ícone, ativo)                                        | `.sc-barra-inferior`, `.sc-barra-inferior__item`                              | `<nav aria-label>`; item ativo com `aria-current="page"`; rótulo visível em todo item; padding com `env(safe-area-inset-bottom)`                                       | #105                   |
| Selo de status     | existente            | `packages/ui/src/selo.tsx`            | atuais; tom `sucesso` para "aberta"                                         | `.sc-selo--*`                                                                 | texto sempre presente (a cor não é o único sinal)                                                                                                                      | #106, #107             |
| Ícone compartilhar | componente (ícone)   | `packages/ui/src/icones.ts`           | `IconeCompartilhar` (lucide `Share2`)                                       | —                                                                             | decorativo; o nome vem do botão                                                                                                                                        | #106, #107             |
| Ícones ✦ e ★       | existente            | `packages/ui/src/icones.ts`           | `IconeBrilho`, `IconeEstrela` com `preenchido`                              | —                                                                             | curtir nunca usa coração; favoritar nunca usa ✦                                                                                                                        | #106, #107, #109, #111 |

Pontos de migração (cada card dono migra a sua tela; o #104 não edita):

| Classe atual          | Arquivo                                                                               | Peça nova                                 | Dono da migração |
| --------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------- |
| `.sc-filtros__chip`   | `packages/ui/styles/filtros.css`                                                      | Chip                                      | #112             |
| `.sc-vitrine__aba`    | `packages/ui/styles/vitrine.css`, `apps/web/src/features/vitrine/AbasDeCategoria.tsx` | Chip (categorias são navegação, não abas) | #108             |
| `.sc-gaveta`          | `packages/ui/styles/filtros.css`                                                      | Gaveta                                    | #112             |
| gaveta do carrinho    | `apps/web/src/features/carrinho/GavetaCarrinho.tsx`                                   | Gaveta                                    | #110             |
| gaveta de comentários | `apps/web/src/features/feed/GavetaDeComentarios.tsx`                                  | Gaveta                                    | #106             |

`packages/ui/styles/stories.css` (fila #104 → #106 → #112): o #104 não muda o
arquivo; só os tokens que ele lê podem mudar de valor.

`Dialogo`: a lacuna do modal (sem `showModal()`) fica registrada em Q-10408.
A Gaveta não depende do `Dialogo`.

## 6. Tipografia: duas alternativas (Q-10401)

Os nomes dos tokens são os mesmos nas duas; muda só a família. As variáveis
`--fonte-titulo-da-marca` e `--fonte-corpo` continuam sendo o ponto de
troca, preenchidas por `next/font` em `apps/web/src/app/layout.tsx`.

| Token proposto     | Uso                     | Tamanho e altura (celular → computador) | Peso | Espaçamento |
| ------------------ | ----------------------- | --------------------------------------- | ---- | ----------- |
| `--tipo-titulo-xl` | título de página e capa | 30/36px → 40/48px                       | 800  | -0,02em     |
| `--tipo-titulo-lg` | título de seção         | 22/28px → 28/34px                       | 700  | -0,02em     |
| `--tipo-titulo-md` | nome de produto e loja  | 20/26px                                 | 700  | -0,01em     |
| `--tipo-titulo-sm` | subtítulo               | 17/22px                                 | 600  | 0           |
| `--tipo-corpo-lg`  | texto corrido           | 16/24px                                 | 400  | 0           |
| `--tipo-corpo-md`  | descrição               | 14/20px                                 | 400  | 0           |
| `--tipo-corpo-sm`  | metadado                | 12/16px                                 | 400  | 0,01em      |
| `--tipo-rotulo-lg` | rótulo de botão         | 15/20px                                 | 700  | 0,01em      |
| `--tipo-rotulo-sm` | selo, maiúsculas        | 11/14px                                 | 700  | 0,04em      |
| `--tipo-preco`     | preço                   | 22/26px                                 | 800  | -0,03em     |

- **Alternativa A (Stitch):** Plus Jakarta Sans em títulos e texto.
- **Alternativa B (atual):** Space Grotesk nos títulos, Inter no texto.
- **Alternativa C:** Jakarta só nas telas do cliente (exige um envelope de
  fonte por área; mais custo de manutenção).
- Pesos 700 e 800 entram como `--peso-negrito` e `--peso-extra`. O texto
  nunca fica abaixo de 12px.
- `next/font/google` baixa a fonte no build e a serve do próprio domínio
  (ASM-10402). Se o P-103 for lido de forma estrita, a alternativa é
  `next/font/local` com o arquivo no repositório.

## 7. Foco, teclado e movimento

- Anel externo único: `outline: 2px solid var(--cor-foco)` com
  `outline-offset: 2px`. O vão de 2px mostra o fundo entre a peça e o anel,
  então o anel se distingue mesmo num botão pintado com a mesma cor. A borda
  verde com brilho interno do Stitch pode **somar** ao anel em campos, nunca
  substituí-lo.
- O anel tem 3:1 contra o fundo da página e contra a superfície em que a peça
  está, nos dois temas e dentro da loja (`--cor-foco` da loja é ajustado por
  `calcularTemaDaLoja`).
- Teclado por peça: seção 5. Ordem de foco segue a ordem visual; nenhuma
  peça usa `tabindex` positivo.
- `prefers-reduced-motion: reduce` desliga o `scale(0.98)` ao pressionar, o
  pulso do curtir e qualquer transição maior que 200ms.
- Alvo de toque: Q-10405. Hoje `--altura-toque` (44px) é usado em 16 folhas
  de outros donos; mudar o valor global muda a densidade do painel. A
  alternativa sem efeito colateral é um token novo `--altura-toque-cliente`
  (48px) usado só pelas peças nas telas do cliente.

## 8. Matriz critério → prova futura

Testes só com sufixo `.onp.test.ts(x)` e título
`[CA-n] @spec:AC-104xx …`. E2e só onde precisa de navegador real.

| Critério           | Prova proposta                                                                                          | Arquivo futuro                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| AC-10401, AC-10402 | lê os três blocos do `theme.css` e compara com `PALETA_ESCURA` e `PALETA_CLARA`; busca do P-102         | `packages/ui/tests/base-visual-tokens.onp.test.ts`    |
| AC-10403           | escala tipográfica declarada no CSS e no espelho TS                                                     | `packages/ui/tests/base-visual-tokens.onp.test.ts`    |
| AC-10404           | pares de contraste contra #0b0f0d, #161c19 e #000                                                       | `packages/ui/tests/base-visual-tokens.onp.test.ts`    |
| AC-10405, AC-10406 | renderiza os ícones e o botão marcável; confere `aria-pressed`, nome e ausência de coração              | `packages/ui/tests/icones-de-acao.onp.test.tsx`       |
| AC-10407           | renderiza `IconeCompartilhar` e procura import direto de `lucide-react` fora de `icones.ts`             | `packages/ui/tests/icones-de-acao.onp.test.tsx`       |
| AC-10408, AC-10409 | estados do botão e do campo (desabilitado, carregando, erro) e altura mínima declarada                  | `packages/ui/tests/botao-e-campo.onp.test.tsx`        |
| AC-10410           | chip: `aria-pressed` ou `aria-current`, Tab alcança todos                                               | `packages/ui/tests/chip-e-abas.onp.test.tsx`          |
| AC-10411           | abas: setas, Home e End; `tabindex` só na ativa                                                         | `packages/ui/tests/chip-e-abas.onp.test.tsx`          |
| AC-10412           | gaveta: `showModal` chamado (dublê no jsdom), Esc fecha, foco volta ao gatilho                          | `packages/ui/tests/gaveta-e-aviso.onp.test.tsx`       |
| AC-10413           | aviso flutuante: papel, não rouba foco, pausa                                                           | `packages/ui/tests/gaveta-e-aviso.onp.test.tsx`       |
| AC-10414           | barra inferior: `aria-current`, rótulos, safe-area declarada                                            | `packages/ui/tests/barra-inferior.onp.test.tsx`       |
| AC-10415, AC-10416 | busca de `--cor-marca` em `componentes.css`; contraste de `marcaDaLoja` para as amostras e cores médias | `packages/ui/tests/cor-da-loja-nas-pecas.onp.test.ts` |
| AC-10417           | anel de foco: 3:1 do `--cor-foco` em cada fundo e de cada loja amostrada                                | `packages/ui/tests/cor-da-loja-nas-pecas.onp.test.ts` |
| AC-10418           | a página `/ui` lista cada peça nova em cada estado                                                      | `apps/web/tests/catalogo-base-visual.onp.test.tsx`    |
| AC-10419           | 344, 768 e 1280px sem rolagem lateral; axe sem violação séria; reduced-motion                           | `e2e/specs/base-visual.onp.spec.ts` (com o #114)      |
| AC-10420           | `:root` e `[data-tema="claro"]` repetem `PALETA_CLARA` sem mudança                                      | `packages/ui/tests/base-visual-tokens.onp.test.ts`    |

## 9. Donos de arquivo nesta feature

O #104 é dono de `packages/ui/styles/theme.css`,
`packages/ui/styles/componentes.css`, `packages/ui/src/tokens.ts`,
`packages/ui/src/index.ts`, `packages/ui/src/icones.ts`,
`packages/ui/src/botao.tsx`, `packages/ui/src/campo.tsx`,
`packages/ui/src/cartao.tsx`, das peças novas da seção 5,
`apps/web/src/app/tokens.css`, `apps/web/src/app/globals.css`,
`apps/web/src/app/layout.tsx` e, nesta onda, de
`apps/web/src/app/(dev)/ui/**`. Os outros cards só usam as peças; peça nova
que faltar entra por pedido ao #104 (`board_message`).
