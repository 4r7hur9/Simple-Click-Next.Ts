# Design: Catálogo responsivo com filtros e espaço para a sacola

> feature: stitch-catalogo · card #108 · 09/11/2026

Documento de projeto da spec `spec.md`. Nada aqui está aprovado para
implementação: as decisões do dono do produto estão nas perguntas Q-10801 a
Q-10813. Caminhos relativos à raiz `/Users/stargrupo/Projetos/SC`; os de
`apps/web` são relativos a `apps/web/src/`.

## 1. Origem e limites

- Referência visual: as três telas de catálogo do ZIP do Stitch
  (`cat_logo_de_produtos_universokar` celular, `..._tablet_...` e
  `..._desktop_...`). Elas são **referência**, não instrução nem dado real
  (P-105). O ZIP usa Tailwind por CDN, Material Symbols e imagens externas, e
  nada disso entra no produto (P-103).
- Erros do export que **não** se reproduzem: o título "Detalhes Do Produto" na
  tela de catálogo do celular, `<main>` dentro de `<main>` no computador, a
  linha "Top 1 vendido", "Garantia de 6 meses", "Compatível com N modelos",
  busca por "OEM / chassi", "Veículo selecionado" e "Compatibilidade rápida"
  (P-104), e totais que divergem entre telas (a contagem 1.086 é exemplo).
- Fora do desenho: a sacola em si (#110), o detalhe do produto (#109), a
  moldura e as barras globais (#105), a vitrine pública da loja (#107) e as funções "A
  decidir".

## 2. Estado atual (evidência)

| Fato                                                                                                                                      | Evidência                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A tela do cardápio é um componente de servidor que lê `busca`, `categoria`, `filtro` (repetível), `atacado`, `ordem` e `cursor` da URL    | `app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx` (`TelaDoCatalogo`)                                                                                    |
| A primeira tela traz 24 produtos por seção e no máximo 72                                                                                 | `TelaDoCatalogo.tsx`; `PAGINA_PADRAO_DO_CATALOGO` em `packages/contracts/src/vitrine.ts`                                                                   |
| A página do servidor tem no máximo 48 itens; a resposta traz `total` e `proximoCursor` (nulo é o fim)                                     | `packages/contracts/src/vitrine.ts` (`MAXIMO_DA_PAGINA_DO_CATALOGO`, `esquemaDaPaginaDoCatalogo`)                                                          |
| O cursor é opaco e a API pagina com LIMIT e OFFSET                                                                                        | `apps/api/src/modules/storefront/catalogo-paginado.usecase.ts` (`paginaDoCatalogo`, `codificarCursor`)                                                     |
| A busca roda no servidor e devolve a lista de acertos, que o catálogo pagina                                                              | `apps/api/src/modules/storefront/busca.usecase.ts` (`produtosQueCasam`)                                                                                    |
| O resumo traz o total de cada categoria; os filtros vêm sem contagem por valor                                                            | `packages/contracts/src/vitrine.ts` (`esquemaDaSecaoNoResumo`, `esquemaDoResumoDoCatalogo`)                                                                |
| A aba de categoria da tela não leva o total                                                                                               | `lib/catalogo.ts` (`AbaDeCategoria`: nome, link, emVigor)                                                                                                  |
| As ordens são relevância, menor preço, maior preço e A-Z                                                                                  | `packages/contracts/src/vitrine.ts` (`esquemaDaOrdemDoCatalogo`)                                                                                           |
| O produto na vitrine não tem campo de variação nem de estoque; preço nulo quer dizer que o preço depende da escolha                       | `packages/contracts/src/vitrine.ts` (`esquemaDeProdutoNaVitrine`)                                                                                          |
| O cartão mostra "Ver opções" com preço nulo, a linha de atacado e o "+" com `data-adicionar-produto`                                      | `features/vitrine/CartaoDeProduto.tsx` (`CartaoDeProduto`)                                                                                                 |
| A linha de atacado vem de `chamadaDoAtacado`                                                                                              | `lib/atacado-na-vitrine.ts` (arquivo do #109)                                                                                                              |
| A barra do catálogo tem categorias, busca, chip de atacado, "Filtrar" e "Ordenar"; os painéis abrem por `popover`; no celular é uma folha | `features/vitrine/BarraDeCatalogo.tsx` (`BarraDeCatalogo`)                                                                                                 |
| Os filtros são um formulário GET com "Limpar filtros" e "Aplicar filtros"                                                                 | `features/vitrine/FiltroEspecificacao.tsx` (`FiltroEspecificacao`)                                                                                         |
| "Ver mais" e rolagem automática; erro mantém os itens e mostra "Tentar de novo"                                                           | `features/vitrine/MaisProdutos.tsx` (`MaisProdutos`)                                                                                                       |
| O vazio de busca só oferece "Limpar a busca" (o link já limpa tudo)                                                                       | `features/vitrine/BuscaProduto.tsx` (`SemResultado`); `server/catalogo-na-tela.ts` (`linkSemBusca`)                                                        |
| **Falha:** com filtro de especificação sem acerto, sem busca e sem atacado, a tela mostra "catálogo sendo montado" e a barra some         | `server/catalogo-na-tela.ts` (`prepararCatalogoEmPaginas`, `lojaSemCatalogo`); `TelaDoCatalogo.tsx`                                                        |
| **Falha:** com categoria escolhida e filtro sem acerto, aparece "Essa categoria não existe mais"                                          | `server/catalogo-na-tela.ts` (`filtroSemAcerto`); `TelaDoCatalogo.tsx`                                                                                     |
| A grade tem 2 colunas, 3 a partir de 768px e 4 a partir de 1100px; não existe lista de uma coluna                                         | `packages/ui/styles/vitrine.css` (`.sc-vitrine__grade`)                                                                                                    |
| A sacola é um botão fixo no canto e abre um `<dialog>` modal centralizado; só aparece com item; não há coluna lateral                     | `features/carrinho/CarrinhoFlutuante.tsx`; `vitrine.css` (`.sc-sacola`, `.sc-flutuante__gaveta`)                                                           |
| O título principal da tela está na capa e usa o rótulo do ramo; "Detalhes do Produto" não existe no código                                | `features/vitrine/CapaDaVitrine.tsx` (passou ao #108; consumidores: catálogo, prévia da aparência e apresentação da loja); busca textual em `apps/web/src` |
| O modo cardápio na TV consome o mesmo catálogo                                                                                            | `features/tv/ExibicaoDeCardapio.tsx`, `features/tv/useCatalogoDaTv.ts`, `lib/catalogo-do-navegador.ts`                                                     |
| Não existe nenhum teste `*.onp.test.*`; os testes legados fixam textos (por exemplo "Limpar a busca")                                     | `apps/web/tests/vitrine-busca.test.tsx` e demais `vitrine-*`                                                                                               |

Desconhecido (a confirmar na implementação): o peso real das imagens na lista
de uma coluna; se `?banners=demo` e os dados estruturados mudam de lugar com o
novo layout; o que a TV faz se `AbaDeCategoria` ganhar o total.

## 3. As três larguras (proposta)

Proporção das zonas segue o Stitch (grade de 12 colunas). Os números das
larguras são a suposição ASM-10804; a quebra do computador é a pergunta
Q-10804.

```
CELULAR (344 a 767px)                  TABLET (768 a 1279px)
+--------------------------+           +------------------------------------+
| topo curto: voltar,      |           | topo curto                         |
| nome, Aberta             |           | busca        [Filtrar] [Ordenar]   |
| busca    [Filtrar][Ord.] |           | chips: categorias com contagem     |
| chips de categoria  ->   |           +------------------------------------+
| chips de filtros ativos  |           | 3 cols: categorias  | 9 cols:      |
+--------------------------+           |  (ou faixa, Q-10813)|  grade 2 ou 3|
| foto | nome            + |           |                     |  colunas     |
|      | R$ preço          |           +------------------------------------+
|      | Atacado a partir..|           | barra fixa da sacola (Q-10803)     |
| ...lista de 1 coluna...  |           +------------------------------------+
| [ Ver mais 24 ]          |
+--------------------------+
| barra fixa da sacola     |
+--------------------------+

COMPUTADOR (1280px ou mais)
+---------------------------------------------------------------------+
| topo curto da loja                                                  |
+----------------+--------------------------------+-------------------+
| 3 colunas      | 6 colunas (9 se sem sacola)    | 3 colunas         |
| categorias     | busca  chips ativos  Ordenar   | .sc-catalogo__    |
| filtros        | grade de 3 colunas (Q-10801)   | sacola            |
| atacado        | [ Ver mais ]                   | (conteúdo: #110)  |
+----------------+--------------------------------+-------------------+
```

Regras de layout propostas:

- A zona da sacola é uma região da grade, não um elemento fixo solto. Quem
  mostra ou esconde o conteúdo é o #110; a região garante que os produtos não
  pulem (AC-10809).
- Sem filtros cadastrados, a coluna da esquerda mostra só categorias, atacado e
  ordem; sem nem isso, some e a grade se expande (AC-10814).
- A lista do celular exige `sizes` da imagem menor que o atual
  (`(max-width: 540px) 50vw, 320px` em `CartaoDeProduto.tsx`) e outra
  proporção da moldura (`.sc-vitrine__moldura`).
- A barra fixa de baixo vira uma reserva de altura (`padding-bottom`) da lista
  e respeita `env(safe-area-inset-bottom)`.

## 4. Matriz do Stitch para a decisão (catálogo)

Situação: **E** existe, **P** parcial, **N** nova, **NC** não confirmada, **AD**
a decidir, **FORA** fora de escopo.

| Bloco do Stitch                                           | Situação | Decisão nesta spec                                                          |
| --------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| Topo com voltar e cabeçalho curto (celular e tablet)      | P        | AC-10828, variante opcional da capa (#108)                                  |
| Abas da loja no tablet (Vitrine, Categorias, Ofertas…)    | NC       | pergunta Q-10808                                                            |
| Busca de produto                                          | E        | mantida; texto genérico (AC-10829)                                          |
| Busca por código OEM ou chassi                            | FORA     | removida (P-104)                                                            |
| Leitor de código de barras na busca                       | AD       | fora; fica oculto até a decisão do #123                                     |
| Chips de categoria com contagem                           | E / NC   | contagem do servidor (AC-10805)                                             |
| Ordenar (relevância, preço, A-Z)                          | E        | mantida (AC-10816)                                                          |
| Ordenar por "maior desconto de atacado" e "lançamentos"   | NC       | pergunta Q-10806                                                            |
| Filtro por especificação (marca e técnicos)               | P        | gaveta e barra lateral (AC-10812 e AC-10813)                                |
| Filtro "em estoque" e faixa de preço                      | NC / N   | pergunta Q-10802; só com contrato novo (T-10808)                            |
| Filtro "preço de atacado disponível"                      | E        | chip "Atacado" já existe (AC-10819)                                         |
| Barra lateral de filtros no computador                    | P        | AC-10813 e AC-10814                                                         |
| "Compatibilidade rápida" e "garagem ativa"                | FORA     | removidas (P-104)                                                           |
| Cartão em lista (celular) e em grade (tablet, computador) | E        | AC-10806 a AC-10808                                                         |
| Cartão: preço varejo e atacado                            | E        | AC-10818 e AC-10819                                                         |
| Cartão: −/+ de quantidade                                 | NC       | pergunta Q-10805                                                            |
| Cartão: "Escolher volume" com variações                   | E        | convite a escolher (texto do #109), abre o detalhe (AC-10820)               |
| Cartão esgotado                                           | E        | AC-10821                                                                    |
| "Previsão de chegada" e "Avise-me quando chegar"          | AD       | fora; fica oculto até a decisão do #120                                     |
| Linha de estoque ("142 em estoque")                       | NC       | pergunta Q-10807                                                            |
| "Garantia de 6 meses" no cartão                           | FORA     | promessa inventada (P-105)                                                  |
| Dicas de busca em sanfona                                 | N        | pergunta Q-10809 (a peça `Sanfona` existe em `packages/ui/src/sanfona.tsx`) |
| Faixa "Nota fiscal / tirar dúvida técnica"                | FORA     | promessa sem base no produto                                                |
| Sacola lateral e barra fixa                               | P        | só o espaço (AC-10808 e AC-10810); o conteúdo é do #110                     |

## 5. Fronteiras com os outros cards

| Card | O #108 faz                                                                              | O outro card faz                                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #104 | usa Chip, Gaveta, Campo de busca e Cartão de vitrine; não cria peça nova                | cria as peças em `packages/ui`; se uma peça não vier, valem as classes atuais (ASM-10802)                                                                                   |
| #105 | define o topo curto **dentro** do cardápio e a barra de categorias, busca e filtros     | moldura da loja, topo global, barra inferior e rodapé; decide a prioridade das barras fixas (hipótese: uma por vez, a da sacola substitui a inferior)                       |
| #107 | cria a variante compacta opcional da capa (aceito pelo #107)                            | só consome `Destaques` e `prepararProduto`; seus estilos ficam em `narrativa.css` e `sobre.css` (o layout público não carrega `vitrine.css`)                                |
| #109 | cartão e aparência do "+"; mantém `data-adicionar-produto` e `data-abre-produto`        | tudo dentro do detalhe, a regra `eProdutoSimples`, `lib/produto.ts`, `server/produto.ts`, `lib/atacado-na-vitrine.ts`; depois do #108 muda uma prop de `TelaDoCatalogo.tsx` |
| #110 | define as larguras, a região `.sc-catalogo__sacola` e a reserva de altura da barra fixa | conteúdo da sacola lateral, da barra fixa e do fechamento; coluna vazia, fechar a coluna e o tablet quando a pergunta correspondente for respondida                         |
| #111 | nada                                                                                    | usa `vitrine.css` depois do #108 (fila #107, #108, #111)                                                                                                                    |
| #114 | critérios de comportamento e de estrutura (vitest)                                      | axe por largura, teclado, toque, estouro lateral em 344px, imagens e catálogo grande em navegador                                                                           |

Contrato do cartão entre #108 e #109: o cartão é um `<li>` com link para o
produto (funciona sem JavaScript); o "+" é um botão com
`data-adicionar-produto={id}`; abrir o detalhe usa `data-abre-produto={id}`.
Quem trata os dois no navegador é `JanelaDoProduto` (#109). O #108 nunca
renomeia esses atributos nem decide a regra de escolha obrigatória.

## 6. Posse de arquivos e ordem

A seção 7 do planejamento do #103 não atribui os arquivos de `features/vitrine/`
(além da capa), `server/catalogo-na-tela.ts` nem `lib/catalogo.ts`. Esta spec
assume a posse deles pelo #108 (ASM-10806) e pede o registro ao gerente.

| Arquivo ou pasta                                                                               | Dono ou fila     |
| ---------------------------------------------------------------------------------------------- | ---------------- |
| `features/vitrine/*` (inclusive `CapaDaVitrine.tsx`, aceita pelo #107)                         | #108             |
| `server/catalogo-na-tela.ts`, `lib/catalogo.ts`                                                | #108             |
| `app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx`                                           | #108, #109, #110 |
| `packages/ui/styles/vitrine.css`                                                               | #107, #108, #111 |
| `packages/contracts/src/vitrine.ts`, `apps/api/src/modules/storefront/*` (só a tarefa T-10808) | #108             |
| `features/carrinho/*`, `features/checkout/*`, `packages/ui/styles/fechamento.css`              | #110             |
| `features/produto/*`, `lib/produto.ts`, `server/produto.ts`, `lib/atacado-na-vitrine.ts`       | #109             |

Execução futura: uma tarefa após a outra, na pasta principal, sem worktrees e
sem o executor paralelo do motor (README da `.spec/`).

## 7. Alternativas por pergunta

| Pergunta | Alternativas                                                                                        | Efeito em arquivos                                                     |
| -------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Q-10801  | A: lista no celular, grade 3 no tablet, 3 no computador (Stitch). B: grade de 2 em tudo (como hoje) | A mexe em `CartaoDeProduto.tsx` e `vitrine.css`; B só em `vitrine.css` |
| Q-10802  | A: só os filtros da categoria e o atacado. B: A mais "em estoque" e faixa de preço                  | B exige `vitrine.ts`, API e T-10808                                    |
| Q-10803  | A: barra fixa embaixo no tablet (Stitch). B: coluna lateral como no computador                      | B antecipa a quebra de três zonas para 768px                           |
| Q-10804  | A: 1280px. B: 1100px. C: 1024px                                                                     | muda só o ponto de quebra em `vitrine.css`                             |
| Q-10805  | A: sem −/+ no cartão. B: −/+ só em produto simples                                                  | B muda `CartaoDeProduto.tsx` e avisa o #109                            |
| Q-10806  | A: manter as quatro ordens. B: acrescentar maior desconto de atacado e lançamentos                  | B exige `vitrine.ts`, API e T-10808                                    |
| Q-10807  | A: não mostrar estoque. B: mostrar quando a loja habilitar                                          | B exige campo novo no contrato e opção no painel (#112)                |
| Q-10808  | A: sem abas da loja. B: abas Vitrine e Categorias                                                   | B mexe em `BarraDeCatalogo.tsx`                                        |
| Q-10809  | A: sem dicas. B: sanfona genérica abaixo da busca sem resultado                                     | B usa `Sanfona` do pacote de interface                                 |
| Q-10810  | A: só botão "Ver mais". B: rolagem automática (já existe a opção `automatico`)                      | só configuração em `MaisProdutos.tsx`                                  |
| Q-10811  | A: manter "Limpar a busca". B: "Limpar busca e filtros"                                             | B atualiza `vitrine-busca.test.tsx` de propósito                       |
| Q-10812  | A: descartar filtros ao trocar de categoria (hoje). B: manter os que a nova categoria também tem    | B muda `catalogo-na-tela.ts`                                           |
| Q-10813  | A: lista lateral com contagem no tablet e no computador. B: faixa de chips no topo em tudo          | A mexe em `AbasDeCategoria.tsx`                                        |

## 8. Estratégia de testes e matriz critério para prova

Quando houver autorização de implementação, cada critério vira teste anotado
`[CA-n] @spec:AC-108xx`, em arquivos `*.onp.test.tsx` (README da `.spec/`).
O vitest com jsdom confere estrutura, textos, links, ARIA e o conteúdo do CSS
(regras de grade e de quebra); **não mede largura real**. Larguras, axe,
teclado, CLS e peso de imagem ficam no navegador, com o #114.

| Critérios                     | Arquivo de teste proposto (a criar)              | Prova                                                                                           |
| ----------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| AC-10801 a AC-10805           | `apps/web/tests/catalogo-paginacao.onp.test.tsx` | busca e páginas com dublê da API; cursor sem repetir; links e formulários GET; contagem         |
| AC-10806 a AC-10811           | `apps/web/tests/catalogo-layout.onp.test.tsx`    | estrutura da região da sacola e regras de grade no `vitrine.css`; larguras reais: #114          |
| AC-10812 a AC-10817           | `apps/web/tests/catalogo-filtros.onp.test.tsx`   | gaveta, formulário único por largura, chips ativos, ordens e troca de categoria                 |
| AC-10818 a AC-10822           | `apps/web/tests/catalogo-cartao.onp.test.tsx`    | preço, atacado, "Ver opções", esgotado, atributos `data-*`                                      |
| AC-10823 a AC-10826           | `apps/web/tests/catalogo-vazios.onp.test.tsx`    | vazio de busca, filtro sem acerto, categoria inexistente e erro de "Ver mais"                   |
| AC-10827 a AC-10829, AC-10831 | `apps/web/tests/catalogo-textos.onp.test.tsx`    | título pelo rótulo, ausência dos termos proibidos, cor da loja, loja suspensa                   |
| AC-10830                      | `apps/web/tests/catalogo-regressao.onp.test.tsx` | os testes legados listados existem e não têm skip ou todo; a suíte atual passa na implementação |

Enquanto não houver teste, o audit acusa "critério sem teste" para esta
feature, e isso é esperado.

## 9. Riscos

| Risco                                                                             | Mitigação                                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| O #104 renomear ou recusar as peças                                               | critérios descrevem comportamento; classes atuais são o plano B (ASM-10802)    |
| Coluna da sacola gerar buraco ou salto de layout                                  | AC-10809; decisão final do #110                                                |
| Conflito de arquivo em `TelaDoCatalogo.tsx` e `vitrine.css`                       | fila declarada na seção 6; pedir a vez por `board_message`                     |
| Alterar o texto do vazio quebrar teste legado                                     | Q-10811 e atualização listada na T-10807                                       |
| Mudar o contrato `esquemaDeProdutoNaVitrine` (objeto estrito) e quebrar TV e feed | só a T-10808, com campo opcional, API antes da web e regressão da TV e do feed |
| Lateral de filtros duplicar formulário (ids repetidos)                            | AC-10813; teste procura ids duplicados                                         |
| Lista de uma coluna baixar imagem grande demais                                   | T-10804 ajusta `sizes` e moldura; peso medido no #114                          |
