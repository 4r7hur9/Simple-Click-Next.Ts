# Design: Detalhe do produto, variações e adicionais

> feature: stitch-detalhe-produto · card #109 · 09/11/2026

Documento de proposta. Nada aqui está aprovado para implementação: as decisões
do dono do produto estão nas perguntas Q-10901…Q-10909 da `spec.md`. Caminhos
relativos a `apps/web/src/`, salvo indicação.

## 1. Origem e lacuna do mockup

O ZIP do Stitch (ver `.spec/features/stitch-planejamento/design.md`, seção 1)
**não tem tela de detalhe do produto**. O que ele mostra, só nos cartões do
catálogo, e que serve de referência de composição:

| No cartão do Stitch                             | O que aproveitamos aqui                                     |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Preço de varejo e linha "atacado a partir de N" | Preço por unidade com a faixa de atacado ao lado            |
| Seletor − quantidade +                          | O mesmo seletor, agora dentro da barra de decisão           |
| Botão "Adicionar" com ícone de sacola           | Botão principal "Adicionar à sacola" com o total            |
| "A partir de" e "Escolher volume"               | Convite a escolher no lugar de um preço que muda (AC-10913) |
| Selo "ESGOTADO" e cartão apagado                | Opção e variação desabilitadas com texto (AC-10920)         |
| Chips de volume                                 | Variações em pílulas (Chip do #104)                         |

Tudo o mais (galeria grande, painel de decisão, tabela de atacado, folha no
celular) é **proposta própria**, feita com as peças e a linguagem visual do
#104. As capturas do #114 (AC-11403) comparam a tela implementada com **esta**
proposta, e por isso as medidas das seções 3 e 4 são concretas. Números,
nomes, promessas e imagens do ZIP não são copiados (P-105). Autopeças são só
um exemplo entre vários ramos (P-104).

## 2. Estado atual (evidência)

| Parte                      | Arquivo e símbolo                                                                         | O que faz hoje                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Rota                       | `app/(loja)/loja/[slug]/produto/[id]/page.tsx` · `PaginaDoProduto`                        | Desenha `TelaDoCatalogo` com `produtoAberto`; metadados e dados estruturados            |
| Janela                     | `features/produto/JanelaDoProduto.tsx` · `JanelaDoProduto`, `eProdutoSimples`             | `<dialog>` com `pushState`; "+" direto só para produto simples; aviso `sc-aviso-rapido` |
| Composição                 | `features/produto/DetalheDoProduto.tsx` · `DetalheDoProduto`                              | Tira de fotos (`imagens`), seção, nome, chamada, preço, descrição, formulário           |
| Formulário                 | `features/produto/EscolhasDoProduto.tsx` · `EscolhasDoProduto`                            | Escolhas, validação após a 1ª tentativa, conta, observação, `adicionarAoCarrinho`       |
| Variações                  | `features/produto/MatrizDeVariacao.tsx` · `MatrizDeVariacao`                              | Lista ou um fieldset por eixo; esgotado desabilitado                                    |
| Adicionais                 | `features/produto/SelecaoDeOpcoes.tsx` · `SelecaoDeOpcoes`                                | Radio se máximo 1, caixa caso contrário; limite anunciado                               |
| Quantidade e botão         | `features/produto/BotaoAdicionar.tsx` · `BotaoAdicionar`                                  | −/+ (1 a 99) e o botão com o total                                                      |
| Preço                      | `features/produto/SeloDePreco.tsx` · `SeloDePreco`                                        | "De … por …" para leitor de tela; convite quando não há preço único                     |
| Atacado                    | `features/produto/TabelaDoAtacado.tsx`, `lib/atacado-na-vitrine.ts` · `unitarioNoAtacado` | Tabela com a faixa marcada; faixa pela quantidade                                       |
| Tipos da tela              | `lib/produto.ts` · `ProdutoNaTela`, `GrupoNaTela`, `resolverVariacao`                     | Sem vídeo, sem `tipo` do grupo, sem lista de blocos                                     |
| Montagem                   | `server/produto.ts` · `prepararProduto`                                                   | Repassa `imagens`; descarta `midias`                                                    |
| Contrato                   | `packages/contracts/src/vitrine.ts` · `esquemaDoProduto`                                  | Traz `midias`, `grupos` (com `tipo`), `variacoes`, `atacado`, `disponivel`              |
| Composição do ramo         | `packages/contracts/src/vertical.ts` · `esquemaDeComposicaoDoRamo`                        | `detalheProduto`: lista de nomes de bloco; o detalhe não lê                             |
| Vídeo já resolvido no feed | `features/feed/MidiaDoPost.tsx` · `MidiaDoPost`                                           | Carrossel com vídeo mudo; modelo a reaproveitar sem editar o arquivo do #106            |
| Estilo                     | `packages/ui/styles/produto.css`                                                          | `sc-janela-produto`, `sc-detalhe`, `sc-produto__*`, `sc-atacado*`; 1227 linhas          |

Inferência: parte de `produto.css` (`sc-produto__palco`, `__miniaturas`) parece
resto de um layout de página inteira antigo e pode ser removida na
implementação, depois de confirmar que nenhuma tela as usa. Desconhecido: o
comportamento exato quando a variação padrão está esgotada (ASM-10906).

## 3. Proposta visual por largura

A janela continua sendo o `<dialog>` da `JanelaDoProduto` (aberto pelo servidor
no link direto, com `pushState`). Ela **reaproveita o visual** da Gaveta do #104
(cabeça, corpo, rodapé fixo, área segura), mas não a peça: a Gaveta do #104 não
tem folha em tela cheia, nem abertura já feita pelo servidor (ASM-10907).

### 3.1 Celular (até 767 px) — folha em tela cheia

```
┌──────────────────────────┐
│ ←  Nome curto da loja  ⤴ │  cabeça 56 px: Fechar, loja, compartilhar (Q-10909)
├──────────────────────────┤
│                          │
│   GALERIA (1:1)          │  foto ou vídeo; "2 de 3"; setas ocultas (arrastar)
│   ● ○ ○                  │
│                          │
├──────────────────────────┤
│ Seção do produto         │
│ Nome do produto (h2)     │
│ Chamada em uma linha     │
│ R$ 20,00   R$ 24,00      │  preço atual e anterior riscado
├──────────────────────────┤
│ Sobre o item             │
│ Descrição…               │
├──────────────────────────┤
│ Tamanho · obrigatório    │  grupo de variação: chips
│ [P] [M×] [G]             │
│ Adicionais · até 3       │  grupo de opções
│ ☐ Queijo extra  + R$ 3   │
├──────────────────────────┤
│ Atacado                  │  tabela com a faixa vigente marcada
│ Observação (se aceita)   │
├──────────────────────────┤
│ 2 × R$ 23,00 = R$ 46,00  │  linha de subtotal (Q-10908)
╞══════════════════════════╡  barra fixa 72 px + área segura
│ [− 2 +]  [Adicionar R$46]│
└──────────────────────────┘
```

Medidas propostas: folha `100vw × 100dvh`, sem margem; cabeça 56 px; galeria
quadrada com altura máxima de `45dvh`; barra fixa de 72 px mais
`env(safe-area-inset-bottom)`; espaço entre blocos de 24 px; alvo de toque de
48 px; conteúdo com 16 px de margem lateral. A barra fixa nunca cobre o último
campo: o corpo reserva a altura dela como `padding-bottom` (AC-10925).

### 3.2 Tablet e computador (768 px ou mais) — janela em duas colunas

```
┌────────────────────────────────────────────────────────┐
│ Loja › Seção › Nome do produto                  ⤴   ✕ │  cabeça 56 px
├───────────────────────────┬────────────────────────────┤
│                           │ Seção                      │
│   GALERIA                 │ Nome do produto (h2)       │
│   (4:5, miniaturas        │ Chamada                    │
│    na lateral ou abaixo)  │ R$ 20,00   R$ 24,00        │
│                           │ ── Tamanho · obrigatório ──│
│                           │ [P] [M×] [G]               │
│                           │ ── Adicionais · até 3 ──   │
│                           │ ☐ Queijo extra   + R$ 3    │
│                           │ ── Atacado ──              │
│                           │ ── Sobre o item ──         │
│                           ├────────────────────────────┤
│                           │ [− 2 +]  2 × R$ 23 = R$ 46 │
│                           │ [      Adicionar à sacola ]│  rodapé do painel
└───────────────────────────┴────────────────────────────┘
```

Medidas propostas: janela centralizada de `min(960px, 100vw − 48px)` por
`min(720px, 100dvh − 48px)` no computador, e `min(720px, 100vw − 32px)` no
tablet; colunas `1fr 1fr` com 32 px de espaço no computador e `5fr 6fr` no
tablet; só o painel da direita rola, e o rodapé dele (quantidade, subtotal e
botão) fica fixo; a galeria da esquerda fica parada. Sem sacola lateral aberta
junto: a sacola do #110 fica atrás da janela.

### 3.3 Ordem dos blocos (de cima para baixo)

1. Galeria · 2. Cabeçalho (seção, nome, chamada, preço) · 3. Blocos do ramo na
   ordem de `detalheProduto` (seção 4) · 4. Atacado · 5. Observação · 6. Subtotal e
   ação. Quando o ramo não define a lista, vale a ordem acima com todos os blocos
   que tiverem dado (AC-10907).

### 3.4 Componentes e reaproveitamento

| Necessidade                 | Peça                                                                   | Dono        |
| --------------------------- | ---------------------------------------------------------------------- | ----------- |
| Variação em pílula          | `Chip` (`ativo`, `desabilitado`, `aoAlternar`) do #104                 | #104        |
| Foco, tema, 48 px           | Tokens e anel de foco do #104                                          | #104        |
| Confirmação de adicionado   | `AvisoFlutuante` do #104, disparado pelo #110                          | #104 e #110 |
| Vídeo e carrossel           | Modelo de `features/feed/MidiaDoPost.tsx` (copiar a ideia, não editar) | #106        |
| Compartilhar e favoritar    | `IconeCompartilhar`, `IconeEstrela`, `Botão marcável` (Q-10909)        | #104        |
| Galeria, painel, barra fixa | Novos, dentro de `features/produto/` e `produto.css`                   | #109        |

Regra de importação: os componentes do detalhe nunca importam `packages/core`
direto. A conta chega por `lib/produto.ts`, que já reexporta `calcularItem`.

## 4. Conteúdo por ramo: blocos do detalhe

A loja entrega `blocos.detalheProduto` (nomes por ramo, seeds em
`packages/database/migrations/0003_lojas.sql` e `0063_novos_tipos_de_negocio.sql`).
Cada nome liga a um dado que a tela **já tem**; sem dado, o bloco não aparece
(AC-10906). Nomes desconhecidos são ignorados.

| Bloco do ramo                                   | Dado que alimenta hoje                                         | Situação                                       |
| ----------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| `foto`, `fotos`                                 | `imagens` (e `midias` depois da tarefa do vídeo)               | existe; vídeo precisa do mapeamento (T-10901)  |
| `descricao`                                     | `produto.descricao`, `produto.chamada`                         | existe                                         |
| `variacoes`, `grade`, `volume`                  | grupos com `eixoDeVariacao` e `variacoes` (`MatrizDeVariacao`) | existe; `grade` com dois eixos (tamanho e cor) |
| `ingredientes`                                  | grupos do tipo `INGREDIENT`                                    | exige repassar `tipo` do grupo (T-10901)       |
| `adicionais`, `acompanhamentos`, `complementos` | grupos do tipo `ADDON`                                         | exige repassar `tipo` do grupo (T-10901)       |
| `especificacoes`                                | grupos do tipo `SPEC`; atributos cadastrados ainda não chegam  | atributos dependem da Q-10904 (contrato e API) |
| `tabela_medidas`, `garantia`                    | nenhum dado no contrato público                                | oculto até haver cadastro; fica como lacuna    |
| `aplicacao`, `compatibilidade`                  | —                                                              | nunca desenhado (P-104)                        |
| qualquer outro nome                             | —                                                              | ignorado, sem erro                             |

Exemplos de composição por ramo (ilustrativos; ASM-10908):

| Ramo                   | Produto de exemplo | O que o cliente vê                                                          |
| ---------------------- | ------------------ | --------------------------------------------------------------------------- |
| Roupas                 | Camiseta lisa      | Tamanho (P, M, G) e Cor em pílulas; tabela de medidas só se houver cadastro |
| Lanchonete             | Pastel de queijo   | Sabor; adicionais com acréscimo com sinal; observação ("sem cebola")        |
| Bebidas                | Refrigerante       | Volume (350 ml, 2 L); atacado por caixa de 12                               |
| Material de construção | Parafuso sextavado | Embalagem (cento, caixa); atacado por caixa                                 |
| Autopeças              | Filtro de óleo     | Unidade ou caixa com 12; atacado; sem nada sobre veículo (P-104)            |

Prioridade das especificações por segmento é a Q-10903; a ordem acima é a que
o seed de cada ramo já traz.

## 5. Estados do detalhe

| Estado                                          | O que a tela mostra                                                      | Critério |
| ----------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| Carregando (clique no cartão)                   | Esqueleto com o mesmo tamanho da galeria e do painel; `role="status"`    | AC-10903 |
| Erro ao carregar                                | Mensagem com "Tentar de novo" (`role="alert"`); fechar continua possível | AC-10932 |
| Sem foto nem vídeo                              | Inicial do nome no tamanho da galeria                                    | AC-10903 |
| Escolha obrigatória pendente                    | Texto citando o grupo, grupo marcado, rolagem e foco                     | AC-10909 |
| Variação esgotada                               | Pílula desabilitada com "Esgotado"                                       | AC-10920 |
| Combinação escolhida esgotada                   | Botão desabilitado e frase "essa opção acabou"                           | AC-10921 |
| Adicional esgotado                              | Opção desabilitada com "Acabou"                                          | AC-10922 |
| Produto esgotado, fora do horário, loja fechada | Botão desabilitado, quantidade oculta, frase do motivo                   | AC-10923 |
| Cardápio mudou ao adicionar                     | Aviso com o valor atual e nada adicionado                                | AC-10919 |
| Adicionado                                      | Confirmação única do #110; a janela fecha                                | AC-10935 |
| Falha de rede ao adicionar                      | "Não foi possível adicionar agora"; o formulário mantém as escolhas      | AC-10935 |

## 6. Preço, quantidade e subtotal (D-3)

Regra única, sem regra comercial nova:

1. Sem variação resolvida: não há conta. O cabeçalho mostra "A partir de" ou o
   convite a escolher; a linha de subtotal fica oculta (AC-10917).
2. Com variação resolvida: `precoBase = unitarioNoAtacado(atacado, quantidade)`
   ou o varejo; `calcularItem` soma os acréscimos dos adicionais.
3. O **preço por unidade mostrado é `unitarioEmCentavos` do resultado de
   `calcularItem`** (faixa mais acréscimos), e o subtotal é o `total` dele.
4. A faixa marcada na `TabelaDoAtacado`, a linha "N × unitário = subtotal" e o
   total do botão leem o **mesmo** resultado e andam juntos (AC-10915).
5. O valor é indicativo: o servidor recalcula ao adicionar e responde 409 se
   o cardápio mudou (AC-10919).

Só o total do botão é anunciado (`aria-live`); a linha de subtotal não, para
não duplicar a fala. A Q-10908 decide se a linha fica sempre ou só com atacado.

## 7. Alternativas para a Q-10901 (página, janela ou gaveta)

| Alternativa                               | A favor                                                                                                | Contra                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| **Janela sobre o catálogo** (recomendada) | Já existe, abre pelo servidor, mantém a rolagem e o link; folha no celular, duas colunas no computador | Peça própria (`<dialog>`), diferente da Gaveta do #104                                  |
| Página própria                            | Mais espaço; padrão em lojas grandes                                                                   | Perde a posição do catálogo; troca de rota, metadados e testes; mais trabalho           |
| Gaveta lateral no computador              | Reusa a Gaveta do #104; catálogo continua visível                                                      | Espaço apertado para galeria e tabela de atacado; sem variante de tela cheia no celular |

## 8. Fronteiras e donos de arquivo

Decisão do gerente (06/11), registrada na matriz do #103: o #109 é dono de
`lib/produto.ts`, `server/produto.ts` e `lib/atacado-na-vitrine.ts`; #108 e
#110 só consomem, sem redefinir. `features/carrinho/atacado-na-linha.ts` e
`lib/atacado.ts` (regra do painel) **não** são deste card.

| Arquivo ou pasta                                                   | Dono ou fila                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------- |
| `features/produto/*`, `packages/ui/styles/produto.css`             | #109                                                      |
| `lib/produto.ts`, `server/produto.ts`, `lib/atacado-na-vitrine.ts` | #109                                                      |
| `app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx`               | fila #108 → #109 → #110; o #109 só muda uma prop (blocos) |
| `packages/ui/styles/vitrine.css` (cartão e `::backdrop`)           | #107 → #108 → #111; o #109 não edita                      |
| `packages/contracts/src/vitrine.ts`                                | #108; o #109 só lê (`midias` já existe)                   |

Acordos por mensagem no board:

- **#108**: o cartão (preço, `chamadaDoAtacado`, esgotado, convite) é dele; o
  "+" do cartão reusa `eProdutoSimples` sem alterá-la; o convite segue o
  AC-10913.
- **#110**: o #109 termina no "Adicionar"; o item enviado (`ItemParaEnviar`) não
  muda; hoje a confirmação mora em arquivos do #109 (`EscolhasDoProduto`,
  "Adicionado à sacola."; `JanelaDoProduto`, `sc-aviso-rapido`) e só será
  trocada pelo aviso do #110 (AC-11006) numa tarefa que espera a definição dele.
- **#104**: o #109 usa Chip, AvisoFlutuante, ícones e tokens; não cria peça
  comum; a janela mantém o `<dialog>` próprio (ASM-10907).
- **#114**: axe, teclado e foco com Esc, imagens e a regressão de preço com
  variação são testes dele (AC-11409, AC-11410, AC-11417, AC-11405). Os
  critérios AC-10928 e AC-10929 apontam para eles.

## 9. Matriz critério → prova futura

Testes só em `*.onp.test.ts(x)` (ver `.spec/README.md`), com
`it("[CA-n] @spec:AC-… …")`. Os legados em `apps/web/tests/produto-pagina.test.tsx`
servem de modelo de montagem (`prepararProduto`, `EscolhasDoProduto`).

| Critérios                     | Prova                                                                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-10901 a AC-10907           | `apps/web/tests/detalhe-do-produto.onp.test.tsx` (galeria, vídeo, ramo, bloco oculto)                                                                                                                 |
| AC-10908 a AC-10914           | `apps/web/tests/escolhas-do-produto.onp.test.tsx`                                                                                                                                                     |
| AC-10915 a AC-10919           | `apps/web/tests/quantidade-e-atacado.onp.test.tsx` (faixas, subtotal igual ao botão)                                                                                                                  |
| AC-10920 a AC-10924           | `apps/web/tests/produto-indisponivel.onp.test.tsx`                                                                                                                                                    |
| AC-10925 a AC-10927, AC-10930 | e2e por largura (`e2e/specs/detalhe-do-produto.onp.spec.ts`, 344, 390, 768, 1280 px); o `onp-spec verify` não roda e2e (Q-11405 do #114), então o critério fica sem prova mecânica até a decisão dele |
| AC-10928, AC-10929            | #114 (axe, teclado, devolução do foco)                                                                                                                                                                |
| AC-10931 a AC-10935           | `apps/web/tests/detalhe-do-produto.onp.test.tsx` e `janela-do-produto.onp.test.tsx`                                                                                                                   |

Teste de ouro do atacado: a mesma tabela de faixas, com quantidades de um lado
e do outro de cada limite, comparando o unitário mostrado com o de
`unitarioNoAtacado` e o subtotal com o de `calcularItem`.

## 10. Riscos

| Risco                                                                   | Mitigação                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A spec do #104 muda nomes ou props das peças                            | Citar peças pelo design do #104; revisar quando ele fechar               |
| `produto.css` tem 1227 linhas e classes possivelmente mortas            | Apagar só o que a busca no repositório provar sem uso, em tarefa própria |
| Trocar `imagens` por `midias` quebra prévia ou dados estruturados       | Manter `imagens`; AC-10933 e teste de não regressão                      |
| Dois avisos de "adicionado" (janela e #110)                             | AC-10935; trocar o aviso só depois da definição do #110                  |
| Bloco do ramo promete dado que não existe (tabela de medidas, garantia) | Ocultar sem dado (AC-10906); lacuna registrada                           |
| Fila em `TelaDoCatalogo.tsx` atrasa a prop de blocos                    | Tarefa depende do #108; sem ela vale a composição padrão (AC-10907)      |
