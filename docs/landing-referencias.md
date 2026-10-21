# Landing do SimpleClick — referências, bibliotecas e decisão visual

Card #85 · 19/10/2026. Pesquisa feita antes de qualquer código, depois da
reprovação do protótipo com 3D procedural ("parece brinquedo").

## 1. Referências estudadas

| # | Referência | O que faz de bom | Como replicamos com o que temos | Licença / custo |
|---|---|---|---|---|
| 1 | [Linear](https://linear.app) | Manchete de uma linha; a **tela real do produto** é o herói e faz o trabalho de atmosfera; seções numeradas ("Fig 0.1"); um único CTA forte e o resto em links discretos. | Telas reais do SimpleClick como protagonistas; sobrancelha numerada por cena; um botão verde por dobra. | Inspiração |
| 2 | [Vercel — bastidores do redesign (Rauno)](https://rauno.me/craft/vercel) | Grade rígida (1080px, colunas de 360px); o herói pinta **sem JavaScript** (CSS/SVG) e o efeito pesado entra depois, separado e só em aparelho capaz; nunca duas animações "novas" seguidas; cor de destaque só no CTA. | Herói 100% HTML/CSS (prints com `fetchpriority`); GSAP sob demanda; verde-limão só como acento; alternar cena "grande" com cena calma. | Inspiração |
| 3 | [Guia do "blueprint grid" (Setproduct)](https://www.setproduct.com/blog/complete-guide-to-blueprint-grid-design) | Linhas de 1px em grade de 24px com opacidade de 10–20%; espaçamento em múltiplos de 8. | Grade de linhas com máscara radial só atrás do herói; régua de espaço em 8px. | Inspiração |
| 4 | [Stripe](https://stripe.com) (análises: [kombai](https://kombai.com/gallery/inspirations/stripe/)) | Painéis do produto escuros compostos sobre o fundo, uma faixa de luz em gradiente que "vaza" da borda; tipografia de display leve e grande. | Luz suave em gradientes radiais (sem WebGL) atrás dos aparelhos. | Inspiração |
| 5 | [Raycast](https://www.raycast.com) (análise: [hagicode](https://design.hagicode.com/designs/raycast/)) | Fundo quase preto; sombras em camadas como janela do macOS dão profundidade física. | Sombras em camadas + sombra de contato elíptica nos aparelhos. | Inspiração |
| 6 | Páginas de produto da Apple ([explicação da técnica](https://css-tricks.com/?p=308477)) | Palco grudado (`sticky`) dentro de um trecho alto de rolagem; o texto é camada HTML separada; a rolagem mapeia 1:1 o progresso da cena. | Cenas com palco `sticky` em CSS e linha do tempo GSAP com `scrub`; texto sempre HTML. | Inspiração |
| 7 | [Mercury](https://mercury.com) ([análise UX Planet](https://uxplanet.org/captivating-design-of-the-mercury-fintech-app-d472bc0288bb)) | Explica um produto em **quatro rolagens**, um objeto protagonista e o fundo em "arame" para não competir. | Uma ideia por tela de rolagem; fundo com grade discreta, aparelho em foco. | Inspiração |
| 8 | [Cal.com — bento de recursos](https://www.saasframe.io/sections/cal-com-bento-grid-features-section) + [tendência bento](https://www.saasframe.io/blog/the-bento-layout-trend) | Blocos de tamanhos diferentes (1×1, 2×1, 1×2) evitam monotonia; cada bloco uma prova. | Bento de números e recursos com tamanhos variados. | Inspiração |
| 9 | [Cruip — spotlight card](https://cruip.com/how-to-create-a-spotlight-card-hover-effect-with-tailwind-css/) | Borda de 1px "falsa" (padding) + brilho borrado que segue o mouse via `--mouse-x/--mouse-y`. | Cartões do bento com borda em gradiente e brilho seguindo o ponteiro (CSS + 15 linhas de JS). | Tutorial gratuito |
| 10 | [Grain sobre gradiente (Instant Gradient)](https://instantgradient.com/blog/grainy-gradients) | Ruído SVG `feTurbulence` (fractalNoise, baseFrequency 0.8, 2 oitavas) em data-URI por cima do gradiente: tira o "banding" do degradê escuro. | Camada de grão fixa, estática, opacidade baixa — sem requisição extra. | Técnica livre |
| 11 | [GSAP SplitText](https://gsap.com/docs/v3/Plugins/SplitText/) | Revelação por linha/palavra com máscara; `autoSplit` refaz ao carregar a fonte; põe `aria-label` no pai e `aria-hidden` nos pedaços. | Manchetes reveladas por linha (desktop), com leitor de tela lendo a frase inteira. | Grátis (licença padrão Webflow) |
| 12 | [Clerk — teardown](https://landingdoctors.com/teardowns/clerk-dev) | Prova social **no nível do componente** (prints da tela real do fluxo) converte melhor que ilustração. | Cada cena mostra a tela real que a frase promete (vitrine, sacola, quadro). | Inspiração |
| 13 | [devices.css](https://www.cssscript.com/css-only-devices/) | Aparelhos (iPhone 14 Pro, MacBook) desenhados só em CSS. | Moldura própria em CSS, nas proporções reais (19,5:9, ilha dinâmica, borda fina), sem imagem de moldura. | MIT |
| 14 | [CSS scroll-driven animations — suporte 2026](https://www.buildmvpfast.com/blog/css-scroll-driven-animations-replace-js-2026) | `view()`/`scroll()` em Chrome/Edge/Safari; Firefox ainda incerto. | **Não** depender disso: GSAP ScrollTrigger cobre todos os navegadores. | — |
| 15 | [Rive vs Lottie](https://callstack.com/blog/lottie-vs-rive-optimizing-mobile-app-animation) | Os dois desenham em tempo de execução; Rive tem runtime maior. | Não usar: as telas reais animadas por CSS/GSAP já contam a história sem runtime extra. | MIT (runtimes) |
| 16 | [Poly Haven](https://polyhaven.com/about-contact) / Sketchfab CC0 | Tudo CC0, mas **não há celular nem notebook** de qualidade; os modelos CC0 achados são "game-ready" grosseiros. | Decisão: **sem 3D**. | CC0 |
| 17 | Galerias: [Saaspo / Land-book / Lapa Ninja (via SaaSUI)](https://www.saasui.design/best-saas-landing-page-inspiration) | Padrões recorrentes: resultado mensurável na manchete, prints reais, poucos campos, selo de confiança. | Manchete com o benefício (0% de comissão), números com fonte. | Inspiração |

## 2. Bibliotecas

| Biblioteca | Versão | Licença | Uso | Peso |
|---|---|---|---|---|
| `gsap` (+ ScrollTrigger, SplitText) | 3.15.0 (já no catálogo) | [Licença padrão Webflow, sem custo, uso comercial](https://gsap.com/community/standard-license/) — todos os plugins grátis desde 30/04/2025 | Coreografia por rolagem, revelação de texto | ~70 KB gz, só na landing, por `import()` |
| `three` | 0.186.1 | MIT | **Removido da landing** (continua no catálogo; nenhuma outra tela usa) | — |
| Lenis | 1.3.27 | MIT | **Não adotado**: a skill do projeto proíbe rolagem que atrase o dedo, e adicioná-lo mexeria no lockfile reservado por outro card. A suavidade vem do `scrub` do GSAP sobre a rolagem nativa. | — |

## 3. Decisão do conceito visual

**UM PRODUTO CONTA A HISTÓRIA, e o app real é o cenário.** Revisada em
19–20/10 depois de três rodadas de crítica do dono ("objetos 3D parecem
brinquedo", "quero o app como ele é", "um celular real", "só o hambúrguer").

- **Produtos**: dois, e só eles — o hambúrguer (foto de estúdio licenciada,
  recortada pelo card #86) e um tambor de freio real da UniversoKar. Dois e não
  um porque o par prova sozinho o "qualquer ramo" ("Do hambúrguer… …à
  autopeça"), que é argumento central do produto. Nenhum outro objeto.
- **História**: herói (hambúrguer ao lado do celular com a vitrine da Brasa
  Burger) → o hambúrguer encaixa na foto do cartão do cardápio real → produto →
  sacola → fechamento (telas reais, cada uma sobe por cima da anterior como no
  app) → quadro de pedidos e resumo no notebook (painel real da Brasa Burger,
  com o pedido do Brasa Clássico) → a tela troca para a UniversoKar e o tambor
  assume o lugar do hambúrguer → provas (#87) → convite com os dois produtos.
- **Telas**: capturas reais em 2x (`scripts/telas-da-landing/gerar.mjs`). A foto
  ilustrada do "Brasa Clássico" da demonstração é trocada, só no print, pela
  foto real do mesmo hambúrguer — como o dono faria ao cadastrar.
- **Aparelhos**: celular e notebook GENÉRICOS desenhados em CSS (titânio escuro
  com chanfro, botões, câmera em furo, vidro com reflexo leve, sombra de
  contato). Não há mockup fotográfico de aparelho genérico com licença
  comercial clara (os bons são de iPhone, marca registrada), e os modelos GLB
  CC-BY de "smartphone genérico" exigem conta no Sketchfab e não passam de
  qualidade de jogo. Sem 3D.
- **Fundo**: preto tecnológico, luz verde muito suave atrás do protagonista,
  grão estático (feTurbulence) e grade de linhas com máscara só no herói.
- **Cor**: verde-limão só no botão principal, nos números e num contorno de luz
  quase imperceptível nos produtos.
- **Tipo**: Space Grotesk em display grande e apertado (−0,045em), poucas
  palavras por manchete; corpo 17–19px em cinza claro, até ~60 caracteres.
- **Rolagem (um mecanismo só)**: cada cena é um bloco de duas colunas; os
  passos de texto rolam e o palco do aparelho gruda (`sticky`) DENTRO do bloco.
  Nada fixo na página, então uma cena não invade a outra. GSAP só troca o que
  está na tela, com `scrub`. A partir de 900px e sem movimento reduzido; no
  celular, cada passo traz a sua figura empilhada.

## Ativos de produto

Fotos reais recortadas (fundo transparente) para o palco da landing, em
`apps/web/public/landing/produtos/`. Gerados por `scripts/ativos-da-landing/gerar.py`
(reproduzível; instruções no cabeçalho do script). Conferidos em #0e1110, verde e cinza-claro.

| Arquivo | O que é | Tamanho |
|---|---|---|
| `hamburguer.webp` / `hamburguer-800.webp` | cheeseburger de gergelim, recorte com alfa | 1600×1306 (~540 KB) / 800×653 (~160 KB) |
| `peca.webp` / `peca-800.webp` | tambor de freio (loja UniversoKar), recorte com alfa | 1600×1272 (~140 KB) / 800×636 (~50 KB) |
| `sombra.webp` | sombra de contato preta com gradiente radial (alfa), 1600×360 | ~33 KB |

**Hambúrguer**
- Origem: <https://www.pexels.com/photo/classic-cheeseburger-on-slate-against-dark-background-38660122/> (arquivo 2160×2700).
- Autor: Jonathan Pagaoa (<https://www.pexels.com/@jonathan-pagaoa-46448199/>). Página marcada "Free" em 19/10/2026.
- Licença: Pexels License (<https://www.pexels.com/license/>): uso comercial permitido, modificação permitida, **atribuição não obrigatória** (agradecida). Proibido: revender cópia sem alteração, usar como marca registrada, sugerir que pessoas/marcas endossam. Recorte e composição são modificação.
- Outras candidatas avaliadas (Pexels, mesma licença): Jonathan Borba nº 18713424 (burger de pão escuro, ótima resolução, mas reflexo na mesa de madeira e visual menos limpo) e Valeriya nº 1199960 (fundo azulado e burger cortado, difícil de recortar). A do Pagaoa venceu por luz de estúdio, nitidez e fundo preto limpo. Unsplash bloqueia download por script (verificação anti-robô), então ficou de fora.

**Peça**
- Origem: foto já importada no projeto, `apps/web/public/demo/universokar/13775-b48beb13fa5b.jpg` (1024×1024, fundo branco, sem logotipo; só gravação pequena de fabricante na lateral). O filtro VOX (código 16590) tem só 259×194 px e marca visível, descartado.
- Autoria/licença: foto de catálogo de autor não identificado, importada do cadastro da loja demo. **Uso interno de demonstração**: antes de ir ao ar na landing pública, confirmar o direito de uso (ou trocar por uma peça de foto licenciada).

**Como foram recortados**
1. Máscara: `rembg` (modelo `isnet-general-use`); no hambúrguer, com alpha matting (pymatting) para a borda do gergelim.
2. Erosão de 2–3 px, suavização gaussiana de 0,7–0,8 px e curva de alfa (a da peça mais firme, piso 0,35).
3. Cor de primeiro plano reestimada (`estimate_foreground_ml`) para tirar o halo do fundo escuro/branco.
4. Aparado ao contorno, redimensionado (Lanczos; ampliação leve com nitidez só nas cores) e salvo em WebP q85, alfa q95.
5. Sombra: elipse preta, núcleo `(1−d)^1,6` mais cauda `(1−d)^3,2` (alfa máx. ~0,9). Usar a ~115% da largura do produto, com o centro na base dele; no fundo claro vira sombra, no preto some (use um brilho verde por baixo para o "reflexo").

**Limites honestos**: a resolução útil do hambúrguer é ~1250 px de largura (ampliado 1,28×) e a da peça ~910 px (ampliada 1,75×); em telas 2x o peça pode parecer levemente macia acima de ~800 px CSS. Há um brilho esverdeado/claro finíssimo na borda inferior do tambor (reflexo da foto original).

## Revisão final (card #88)

Auditoria em 1440, 1024, 768, 390 e 360 px (Playwright, capturas em `/tmp/landing-final/`), comparação com Linear, Stripe e Raycast e correções.

**Corrigido:** emenda visível entre cenas (brilho no rodapé da cena); conteúdo das cenas 8 px à esquerda do resto da página (1200 → 1184 px de grade); sobrancelha das cenas na cor das demais seções; produto cobrindo botão do aparelho no celular (agora só encosta na quina); alvos de toque < 44 px (menu, marca, "Entrar", "Criar loja", fontes, rodapé legal); aviso de cookies tomando ~35% da tela do celular (agora ~202 px, botões lado a lado); foco do teclado parando embaixo do topo fixo (`scroll-padding`); imagens: variantes `-480`/`-900` com `srcset` (`scripts/telas-da-landing/variantes.mjs`).

**Medido em produção, celular simulado (4× CPU, 4G lento 1,6 Mb/s):** LCP 1,95 s → 1,52 s; imagens baixadas 753 KB → 355 KB; CLS 0; TBT 98 → 46 ms; 60 fps na rolagem inteira em todas as larguras; GSAP só baixa depois da hidratação e nunca com movimento reduzido.

**Tentado e desfeito:** recorte ampliado do painel no celular (ficou vazio e não ficou legível); no celular o notebook é textura, a mensagem está no título.

## Revisão final das cenas (card #94)

Depois dos cards LP A–E. Playwright headless em 1440, 1366, 1280, 1920, 1024, 768, 440×956, 390 e 344 px, vídeo da rolagem, gestos (trackpad com inércia, roda, teclado, toque), axe e medição em produção. Capturas em `/tmp/sc94/` (`antes/`, `depois/`, `trans*/`, `conv/`, `ref-*`).

**Corrigido:** fundo da página branco por baixo da landing escura (faixa branca no "elástico" e na saída das cenas) → `html`/`body` escuros e `theme-color`; o produto cobria ~38% da tela do iPhone (sumia o "Ver o cardápio" e o seletor de quantidade) → só encosta na borda (~14%); no celular o iPhone saía cortado pela borda de baixo → encolhe (até 72%) para caber embaixo do texto da cena; a 1024 px a base do notebook passava por baixo do indicador de cenas; o brilho atrás dos aparelhos animava `inset` (CLS 0,05 durante a navegação) → só `transform`; as entradas das seções usavam `autoAlpha` (visibility: hidden) e o Tab pulava todos os links de dados, recursos e dúvidas → opacidade + o foco termina a entrada; SplitText punha `aria-label` em `<p>` (7 violações sérias do axe); dois `contentinfo`; `sizes` do produto pedia a foto de 800–1600 px onde ela aparece com 100–330 px; a montagem do GSAP numa tarefa só (cedida em duas); indicador lateral mais leve no celular.

**Medido em produção (celular 390 a 3x, CPU 4×, 4G lento 1,6 Mb/s):** LCP 1,8 s; CLS 0 na carga e durante a navegação (antes 0,05 no computador); imagens 568 → 432 KB (computador 1.097 → 630 KB); JS 274 KB gz, sendo ~53 KB do GSAP depois da hidratação e ~59 KB do zod que vem do layout (fora da landing, relatado); TBT após o FCP 52–134 ms; 59–60 fps nas trocas de cena.

**Números conferidos nas fontes em 20/10/2026:** iFood (12%/23% + 3,2%, R$ 110/R$ 150 acima de R$ 1.800), Abrasel via Mercado&Consumo (54/26/12/8, 2.176 donos), ABComm via Times Brasil (79% no celular, R$ 258 bi em 2026), Nuvemshop Essencial (R$ 69 + 4,19%). Contas da seção batem (R$ 8.000 → R$ 2.246/mês, R$ 26.952/ano).
