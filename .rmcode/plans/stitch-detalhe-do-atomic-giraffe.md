# Plano — Card #109 · Stitch · Detalhe do produto (T-10901…T-10911) · v4

## Contexto
O detalhe do produto já existe e funciona: é o `<dialog>` da `JanelaDoProduto` sobre o catálogo, na rota `/loja/[slug]/produto/[id]`. A árvore é toda cliente (`JanelaDoProduto` é "use client") e é renderizada no servidor. O redesign Stitch não tem mockup desta tela. A composição segue `.spec/features/stitch-detalhe-produto/design.md` (seções 3–6), com as peças e tokens do #104 e a linguagem do #108.

**Pré-requisito de bloqueio:** o #104 entregue (Chip `.sc-chip`/`.sc-chip--ativo`, `AvisoFlutuante`, tokens `--cor-*` claro e escuro, Plus Jakarta Sans) e o #108 encerrado. Antes de executar, revisar o plano contra os nomes reais do #104.

Execução sequencial, sem commit, sem push e sem troca de branch. Testes em `*.onp.test.tsx`, com `[CA-n] @spec:AC-109xx`.

## Decisões
- **D-1 (Q-10901)** Mantém o `<dialog>` próprio. Até 767 px é uma folha em tela cheia; a partir de 768 px, duas colunas.
- **D-2** Variações e adicionais continuam como radio/checkbox dentro de `<label>`, com visual de pílula pelas classes do Chip do #104. Não usa o componente `Chip`. Preserva `label input`, `role=radio`, `role=group` e as classes `sc-produto__*`.
- **D-3** Uma conta só, e cada número tem o seu papel:
  - **cabeçalho**, em três casos: produto sem variações → `produto.preco` com `produto.precoAnterior`; variação resolvida → `variacao.preco` com o "de" da própria variação (`precoAnterior`, mapeado com a mesma guarda do produto: só aparece se for maior e se nenhum dos dois for nulo); variação pendente → o convite;
  - **tabela** = unitário da faixa, sem adicionais; a linha marcada sai de `faixaNoAtacado(atacado, quantidade)`, que pega a faixa de **maior** `quantidadeMinima <= quantidade`, como o core faz em `preco-aplicavel.ts`. `unitarioNoAtacado` passa a usar `faixaNoAtacado`: o resultado é o mesmo para faixas em ordem e fica correto fora de ordem. `linhasDoAtacado` desenha as faixas em ordem crescente;
  - **linha "N × unitário = subtotal"** = `calcularItem().unitarioEmCentavos` (faixa mais adicionais) × N = `totalEmCentavos` = total do botão.
- **D-4 (perguntado ao gerente)** Os blocos do ramo **ordenam** a tela. Escondem só bloco sem dado (`tabela_medidas`, `garantia`, `especificacoes` sem grupo SPEC) e nunca desenham `aplicacao` nem `compatibilidade`. Fotos, descrição e todos os grupos sempre aparecem. Aceita `foto` e `fotos`.
- **D-5** O preço sai do `<header>` e passa a ser desenhado por `EscolhasDoProduto`. O componente ganha a prop `informacoes?: ReactNode` (descrição e blocos informativos), que fica entre o preço e as escolhas. O SSR não muda, porque o estado inicial é determinístico. `matchMedia` e o índice da galeria ficam só em efeito ou handler, para não dar diferença de hidratação.
- **D-6** `conviteAEscolher` fica em `lib/produto.ts` ("Escolher <rótulo em minúsculas>" / "Escolher opções"). Antes, procurar se o #108 deixou um convite próprio; se sim, reaproveitar o dele. O padrão de `SeloDePreco` continua intacto, porque um teste legado depende dele.
- **D-7 (Q-10906)** O vídeo fica parado e só toca por ação, começando mudo. `<video poster>` com `preload="metadata"`. Sem capa, mostra o primeiro quadro, sem `next/image` para a capa.
- **D-8 (Q-10908)** A linha de subtotal aparece sempre que a variação está resolvida.
- **D-9** Fica de fora: compartilhar e favoritar (Q-10909), código e estoque (Q-10907), avaliações, parcelamento, avise-me e **T-10912** (Q-10904; perguntado ao gerente).
- **D-10** A T-10910 só roda se o gerente aprovar a confirmação única com `AvisoFlutuante`. Nesse caso, tira só o `setRecado("Adicionado à sacola.")` e mantém os recados de erro e de 409. Sem aprovação, fica pendente para depois do #110.
- **D-11** O texto de ESGOTADO vira "Este item acabou.", sem a promessa de reposição (AC-10924).
- **D-12** Os grupos são desenhados **por seção do ramo** (`secoesDeEscolha`):
  - cada eixo é uma seção: `MatrizDeVariacao` é chamada com `eixos=[eixo]` (o mapa `comSaida` continua sendo de todos os eixos);
  - a lista simples de variações é a seção do bloco `variacoes`/`grade`/`volume` (sem esse bloco, vem primeiro);
  - os grupos comuns ficam na seção do seu tipo.
  
  `calcularItem` recebe **só os grupos comuns**, na ordem da tela, e **nunca os eixos**. A lista única de pendências segue a ordem das seções (eixos sem escolha mais `conta.pendencias`), e a rolagem vai até a primeira; ela substitui o atalho `faltaVariacao → eixos[0]`. O alerta de variação fica dentro do fieldset pendente, com âncora em cada eixo e na lista simples.
- **D-13** Variação esgotada:
  - ao abrir, a padrão só vem marcada se estiver disponível, tanto em `variacaoManual` quanto no inicial de `escolhaDeEixo`;
  - nova prop `bloqueio?: string | null` em `BotaoAdicionar`, **só** para variação resolvida e esgotada com o produto à venda: desabilita o botão, mantém a quantidade e mostra "Essa opção acabou. Escolha outra.";
  - com `!aVenda` vale o caminho atual (a API já manda ESGOTADO quando tudo acabou) e o bloqueio é ignorado;
  - com uma variação só, o grupo é escondido, disponível ou não;
  - textos: "Esgotado" na lista simples e "Indisponível" no eixo (o teste legado espera essa palavra).
- **D-14** O foco volta para quem abriu a janela. `aoClicar` guarda o gatilho (`a[data-abre-produto]` ou `a[data-adicionar-produto]`) e o `close` devolve o foco a ele. No link direto, cai para `[data-abre-produto="<id>"]`. A prova de teclado é do #114, e o comportamento depende da Q-10408.

## Tarefas (sequenciais)
| T | Objetivo | Arquivos | Prova |
|---|---|---|---|
| T-10901 | Rodar o baseline do gate. Novos campos **opcionais**: `midias?`, `tipo?`, `precoAnterior?` na variação. `conviteAEscolher`. Novo texto do ESGOTADO (grep "repuser" no baseline) | `lib/produto.ts`, `server/produto.ts` | `detalhe-do-produto.onp.test.tsx` |
| T-10902 | Galeria: "n de m", setas, ←/→, scroll-snap, vídeo parado, inicial quando não há mídia, moldura fixa, reduce-motion | create `GaleriaDoProduto.tsx`; `DetalheDoProduto.tsx`, `produto.css` | `detalhe-do-produto.onp.test.tsx` |
| T-10903 | `blocos-do-ramo.ts` (`blocosDoDetalhe`, `secoesDeEscolha`); preço do cabeçalho em três casos + convite; seções intercaladas e lista única de pendências (D-12) | create `blocos-do-ramo.ts`; `DetalheDoProduto.tsx`, `EscolhasDoProduto.tsx`, `MatrizDeVariacao.tsx` | `detalhe-do-produto.onp.test.tsx` |
| T-10904 | Prop `blocosDoDetalhe` de TelaDoCatalogo → Janela → Detalhe | `TelaDoCatalogo.tsx` (1 prop), `JanelaDoProduto.tsx` | create `janela-do-produto.onp.test.tsx` (com stub de showModal/close) |
| T-10905 | Pílulas, pendência citando o rótulo com foco no eixo, acréscimo com sinal e limite. Strings atuais de regra preservadas | `MatrizDeVariacao.tsx`, `SelecaoDeOpcoes.tsx`, `EscolhasDoProduto.tsx`, `produto.css` | `escolhas-do-produto.onp.test.tsx` |
| T-10906 | `faixaNoAtacado` (maior faixa aplicável) e `unitarioNoAtacado` usando ela; linha de subtotal; quantidade de 1 a 99 com 48 px; 409 preservado | `lib/atacado-na-vitrine.ts`, `BotaoAdicionar.tsx`, `EscolhasDoProduto.tsx`, `TabelaDoAtacado.tsx`, `produto.css` | `quantidade-e-atacado.onp.test.tsx` (teste de ouro, com faixas fora de ordem) + legado `vitrine-atacado.test.tsx` |
| T-10907 | D-13 | `EscolhasDoProduto.tsx`, `MatrizDeVariacao.tsx`, `SelecaoDeOpcoes.tsx`, `BotaoAdicionar.tsx` | `produto-indisponivel.onp.test.tsx` |
| T-10908 | Folha e colunas, barra fixa com área segura, rodapé sticky, D-14, reduce-motion, só tokens; apagar CSS sem uso provado | `JanelaDoProduto.tsx`, `DetalheDoProduto.tsx`, `produto.css` | `janela-do-produto.onp.test.tsx` (foco) |
| T-10909 | Sem regressão: SSR do link direto, pushState, back e replaceState, `eProdutoSimples`, `imagens` | reuse `page.tsx`, `JanelaDoProduto.tsx` | `janela-do-produto.onp.test.tsx` |
| T-10910 | Confirmação única (só se o gerente aprovar D-10) | `EscolhasDoProduto.tsx`, `JanelaDoProduto.tsx` | `janela-do-produto.onp.test.tsx` |
| T-10911 | e2e por largura, `onp-spec verify`, gate completo | create `e2e/specs/detalhe-do-produto.onp.spec.ts` | gate |

## Não mexer
Arquivos do #104, `features/carrinho`, `features/checkout`, `.spec/`, `packages/contracts`, a API e `vitrine.css`. Testes legados não podem ser enfraquecidos. `e2e/specs/produto-detalhe.spec.ts` **já está desatualizado** (procura `.sc-produto__foto` e "Alguma observação?"): só será atualizado com autorização do gerente; sem ela, entra no relatório como falha preexistente.

## Verificação
- Em cada tarefa: `pnpm exec vitest run <arquivo>.onp.test.tsx apps/web/tests/produto-pagina.test.tsx apps/web/tests/painel-disponibilidade.test.tsx` e `pnpm --filter @simpleclick/web typecheck`.
- Final: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:int`, `pnpm test:e2e`, `pnpm build` e `onp-spec verify` filtrado para a feature.
- Manual: navegador do rmcode em 344, 390, 768 e 1280 px, nos temas claro e escuro; teclado, Esc e reduce-motion.
