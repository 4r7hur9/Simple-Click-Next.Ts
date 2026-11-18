# Plano #108 — Stitch · Catálogo da loja (/cardapio)

## Contexto

O redesign Stitch troca a cara do cardápio da loja (`/loja/[slug]/cardapio`) pelas três telas de catálogo do Stitch:

- **Celular:** lista de uma coluna.
- **Tablet:** grade e barra fixa da sacola.
- **Computador:** três zonas 3/6/3, com a sacola na lateral.

A spec `.spec/features/stitch-catalogo` (T-10801…T-10808) descreve o trabalho. Este plano:

- fixa as respostas e hipóteses para as 13 perguntas da spec;
- parte das peças que o #104 vai criar (tokens, Plus Jakarta Sans, Chip, Gaveta, `.sc-campo--busca`, `.sc-cartao--vitrine`);
- corrige duas falhas confirmadas no código (o filtro sem acerto e o `aria-live` que falta no "Ver mais").

**Execução sequencial.** Só começa depois que o gerente aprovar, na vez do #108: depois do #104…#107, porque a fila de `vitrine.css` é #107 → #108 → #111 e a de `TelaDoCatalogo.tsx` é #108 → #109 → #110. É na pasta principal, sem worktree, sem troca de branch e sem commit ou push. Quando o #104 terminar, o plano é revisado contra os nomes reais das peças.

## Decisões do usuário (questionário, 12/11/2026)

| Pergunta | Resposta |
|---|---|
| Q-10802 / Q-10806 / Q-10807 | **Filtros e ordens novas entram**: "em estoque", faixa de preço, "maior desconto de atacado" e "lançamentos". **Número de estoque no cartão fica fora.** A T-10808 passa a existir. |
| Q-10805 | Sem −/+ no cartão; fica só o "+" de hoje. |
| Posse (ASM-10806) | O #108 é dono de `features/vitrine/*` (inclusive a variante compacta de `CapaDaVitrine`, depois que o #107 soltar o claim), `lib/catalogo.ts` e `server/catalogo-na-tela.ts`. |
| Q-10801 / Q-10803 / Q-10804 / Q-10813 | Layout do Stitch: lista de 1 coluna no celular (<768px); grade de 3 colunas no tablet (768–1279px), com gaveta de filtros e barra fixa da sacola; três zonas 3/6/3 a partir de 1280px; chips de categoria no celular e tablet, lista lateral no computador. |
| "Em estoque" | Esconde só os **esgotados**: `p.is_available` falso, ou todas as variações vivas indisponíveis ou com estoque ≤ 0. Estoque nulo (não controlado) conta como em estoque, e "fora do horário" continua aparecendo. A fonte da regra é a página do produto (`apps/api/src/modules/storefront/produto.usecase.ts:299-301` e `:337-339`), e não o painel (`listagem-do-painel.ts:282-286` ignora `v.is_available`). O cartão atual (`catalogo.usecase.ts:163-166`) não olha variações, então o filtro pode esconder um produto que o cartão mostraria como disponível; isso fica registrado no teste. |
| "Lançamentos" | Ordena por `products.created_at DESC, id DESC`, sem migração (precedente: `recentes` do painel, `listagem-do-painel.ts:412`). |
| Topo (AC-10828) | **Topo curto com a foto ao fundo** em todas as larguras. A capa grande deixa de aparecer no cardápio; a foto "topo do cardápio" vira o fundo da faixa curta. |

## Hipóteses adotadas (sem pergunta; impacto baixo)

- Q-10808 A: sem abas da loja no tablet, porque a navegação é do #105.
- Q-10809 A: sem "Dicas de busca".
- Q-10810: mantém o que existe (rolagem automática só na lista única e "Ver mais" nas seções).
- Q-10811 A: mantém "Limpar a busca", e `vitrine-busca.test.tsx` não muda.
- Q-10812 A: trocar de categoria descarta os filtros de especificação, como hoje.

## Descobertas que mudam o desenho (com evidência)

- **A falha real do filtro sem acerto.** Com qualquer filtro ligado, a API descarta as seções sem acerto (`apps/api/src/modules/storefront/catalogo-paginado.usecase.ts:250`). Na web, `prepararCatalogoEmPaginas` (`server/catalogo-na-tela.ts:302-328`) não olha `filtros`, e isso dá dois sintomas:
  - Especificação sem acerto nenhum: `lojaSemCatalogo` fica verdadeiro e `TelaDoCatalogo.tsx:269` troca a barra e a grade inteiras por "está sendo montado". Sem a barra, o cliente não consegue desfazer o filtro.
  - Especificação com acerto, mas fora da categoria escolhida: a seção some, `filtroSemAcerto` fica verdadeiro e aparece "Essa categoria não existe mais".
- **Os filtros oferecidos dependem só da categoria** (`vitrine.routes.ts:102`, `filtrosDaVitrine({ categoria })`), então a barra continua tendo o que mostrar mesmo com zero acertos. A correção é toda na web.
- **Um só formulário por largura é possível sem duplicar nada.** O painel `#painel-dos-ajustes` já tem o único `FiltroEspecificacao` (`BarraDeCatalogo.tsx:298-352`), e o teste legado exige que ele fique dentro de `.sc-catalogo-barra` (`vitrine-barra-e-ordem.test.tsx:169`). A partir de 1280px, a própria `.sc-catalogo-barra` vira a coluna lateral e o painel (um `[popover]`) fica estático dentro dela, sem segunda cópia do formulário. As classes `__so-estreito`/`__so-largo` (`vitrine.css:670`, `2239`) já escondem a ordem no painel largo.
- **O erro do "Ver mais" não é anunciado** (sem `aria-live`/`role=status` em `MaisProdutos.tsx:112-133`). O "Ver mais" e o "Limpar a busca" usam a classe `.sc-vitrine__aba`, então a troca das abas pelo Chip precisa preservá-los.
- **O cartão é compartilhado com `Destaques.tsx:51`** (faixa de 16rem). Trocar o `sizes` direto quebraria a faixa, então o cartão ganha a prop `formato` (padrão igual ao de hoje).
- **Testes que leem CSS pegam a PRIMEIRA regra que casa** (`painel-produtos.test.tsx:313-325`): toda regra nova de `vitrine.css` vai num bloco no fim do arquivo.
- **Não há `<main>` nos layouts** (`app/layout.tsx`, `(loja)/loja/[slug]/layout.tsx`). O erro do export (main dentro de main) não se reproduz se o `TelaDoCatalogo` mantiver um único `<main>`, e o teste de regressão vai fixar isso.
- **Peças do #104 ainda não existem** (`packages/ui/src` não tem chip, gaveta nem abas). O plano usa o contrato do design do #104 (`.sc-chip`, `.sc-chip--ativo`, `.sc-chips`, `aria-current="true"` em chip-link) e o plano B são as classes atuais (ASM-10802).
- **A TV não lê `AbaDeCategoria`** (sem uso em `features/tv` nem em `lib/catalogo-do-navegador.ts`), então o campo `total` não a afeta.
- **Pode haver uma falha antiga no e2e.** `e2e/specs/desempenho-vitrine.spec.ts:94` espera `sizes` com "720px", e o cartão atual não tem isso. A implementação roda o gate antes de mexer em qualquer coisa, para separar falha antiga de falha nova.

## Tarefas (uma após a outra, nesta ordem)

Caminhos da web relativos a `apps/web/src/`. Testes novos em `apps/web/tests/*.onp.test.tsx` (com `// @vitest-environment jsdom` quando montam DOM), com título `[CA-n] @spec:AC-108xx …`. Todo CSS novo vai num bloco `/* --- catálogo Stitch (#108) --- */` no **fim** de `vitrine.css`, escopado por `.sc-catalogo`.

**T-0. Linha de base.** Antes de editar, rodar `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` e `pnpm exec vitest run --project web apps/web/tests/vitrine-* apps/web/tests/capa-do-catalogo.test.tsx apps/web/tests/cardapio-na-tv*.test.tsx apps/web/tests/filtro-atacado.test.tsx apps/web/tests/painel-produtos.test.tsx`, e registrar o que já falha (em especial `desempenho-vitrine` no e2e). Conferir os nomes reais das peças do #104 em `packages/ui/src/index.ts`.

**T-10801. Três zonas, região da sacola e reserva de altura.**
- Arquivos: `app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx`, `packages/ui/styles/vitrine.css`. Teste novo: `catalogo-layout.onp.test.tsx`.
- `<main className="sc-vitrine sc-catalogo">` (um só `main`), com estes filhos na ordem:
  1. a capa;
  2. a barra;
  3. `<div className="sc-catalogo__produtos">`, que junta banners, destaques e seções num só item de grade;
  4. `<div className="sc-catalogo__sacola" data-regiao-da-sacola="">`, vazia, para o #110 preencher.
- **Sem `display: contents`.** A revisão mostrou que ele estragava o sticky, empurrava os produtos para baixo da lista de categorias e deixava o `::after` e o `__vao` da barra soltos na grade. Desenho final: a própria `.sc-catalogo-barra` vira a **coluna lateral** (um `aside` visual, no mesmo DOM), grudada com `position: sticky`.
- CSS a partir de 1280px:
  - `grid-template-columns: 3fr 6fr 3fr` (a proporção 3/6/3 de uma grade de 12; não se usa `repeat(12, …)`), com as áreas `"capa capa capa" / "lateral produtos sacola"`;
  - `.sc-catalogo-barra` ocupa `lateral`, com `position: sticky; inset-block-start: var(--espaco-4); max-block-size: calc(100svh - 2 * var(--espaco-4)); overflow: auto`, e dentro dela, em coluna: busca, categorias (lista vertical), chip de atacado, "Ordenar" e o painel de filtros estático;
  - `.sc-catalogo-barra::after` e `.sc-catalogo-barra__vao` ficam `display: none`;
  - sem sacola (`.sc-catalogo:has(> .sc-catalogo__sacola:empty)`): `grid-template-columns: 3fr 9fr`, `grid-template-areas: "capa capa" "lateral produtos"` (sem isso a terceira coluna viraria implícita e sobraria um vão) e `__sacola` em `display: none`;
  - a barra lateral zera o que herda da barra de hoje: `margin-inline` negativo e `padding` de `--respiro-lateral` (`vitrine.css:346-347`), a busca de 13rem/18rem (`vitrine.css:2251-2260`, passa a `inline-size: 100%`), `align-self: start`, e a regra `.sc-pagina-da-loja:has(.sc-barra[data-recolhida]) .sc-catalogo-barra` (`vitrine.css:366`), que é mais específica e precisa ser igualada;
  - o painel da ordem (`#painel-da-ordem`) também fica estático na lateral, e o botão "Ordenar" some; assim não sobra popover calculado para 72rem longe do botão;
  - `max-inline-size` vai a 90rem só no `.sc-catalogo`.
- A lateral nunca fica vazia nem sem título (AC-10814): ela sempre tem busca e ordem, e o painel de filtros sempre tem "Só em estoque" e a faixa de preço (T-10808c). Por isso não existe modificador `--sem-lateral`.
- **Quando o #110 preencher a sacola**, a grade passa de duas para três colunas e os cartões estreitam. Isso é a regra AC-10809/AC-11003 do #110 (coluna vazia libera o espaço); o #108 só entrega a chave CSS (`:empty`) e a medição de CLS é do #114 e do #110.
- **Tablet (768 a 1279px) tem gaveta, e não menu suspenso.** O CSS de hoje, a partir de 768px, esconde os botões `--estreito`, mostra o "Filtrar" `--largo` e prende o painel ao botão (`vitrine.css:2193-2199`, `2209-2221`, `2239-2245`, `2268-2277`). No bloco `.sc-catalogo`, o intervalo 768–1279px restaura a folha de baixo (`inset: auto 0 0`, largura total, `position-area: none`), os botões `--estreito` e o `__so-estreito`, e esconde os `--largo`. A grade de produtos fica em 3 colunas de 768 a 1279px, sobrepondo o `repeat(4)` de 1100px.
- Abaixo de 1280px: uma coluna, sem região de sacola (`display: none` em `__sacola`).
- **Tudo o que não é a grade vai dentro de `.sc-catalogo__produtos`:** os vazios (busca, atacado, filtro sem acerto, categoria inexistente, `lojaSemCatalogo`), banners e destaques. Fora dela a colocação automática da grade jogaria esses itens na célula `lateral`.
- **AC-10810:** os títulos de seção ganham `scroll-margin-top` igual à altura da barra do topo, para ela não cobrir o título ao rolar.
- Reserva de altura na lista: `padding-block-end: calc(max(7rem, var(--altura-da-barra-inferior, 0px)) + env(safe-area-inset-bottom))`. `--altura-da-barra` (existente) não muda de nome.
- **AC-10809 e o #110.** O texto do AC-10809 diz que os produtos não mudam de largura, mas o próprio critério remete ao #110 ("se a zona for liberada ou reservada quando vazia, isso segue o critério do #110"), e o #110 escolheu liberar o espaço (AC-11003). Não há desvio: a regra é do #110, e o #108 só entrega a chave `:empty`.
- Teste: um só `main`, a região existe e está vazia, a barra continua sendo filha direta do `main`, e os vazios ficam dentro de `__produtos`. O CSS é lido **só a partir do marcador `/* --- catálogo Stitch (#108) --- */`** (`grid-template-columns` já aparece antes no arquivo, em `vitrine.css:2190` e `2291`), e confere `3fr 6fr 3fr` em `min-width: 1280px`, as áreas sem sacola, `position: sticky` na barra, `env(safe-area-inset-bottom)`, a regra `:empty`, 3 colunas de 768 a 1279px e nenhum `overflow-x: scroll` na página. O sticky e a altura reais são do e2e/#114.

**T-10802. Categorias com contagem (Chip).**
- Arquivos: `lib/catalogo.ts` (`AbaDeCategoria` ganha `total?: number`), `server/catalogo-na-tela.ts` (preenche `total` com `secao.total` nas abas de seção; "Todas" sem número, para não somar em dobro o produto que está em duas seções), `features/vitrine/AbasDeCategoria.tsx` e `vitrine.css`.
- Cada aba vira chip-link (`.sc-chip`, e `.sc-chip--ativo` com `aria-current="page"` mantido). A contagem fica visível e o leitor ouve "N itens". A regra `abas.length <= 2` continua.
- A classe `.sc-vitrine__aba` continua para "Ver mais" e "Limpar a busca".
- A partir de 1280px a mesma `nav` vira lista vertical dentro da barra lateral (T-10801), sem segunda cópia.
- Teste novo em `catalogo-abas.onp.test.tsx` (arquivo próprio: o de paginação só nasce na T-10805): contagem por aba, e com busca a contagem é a dos acertos. A TV não lê `AbaDeCategoria`, então o campo opcional não a afeta.

**T-10803. Filtros em gaveta e em barra lateral, com chips ativos.**
- Arquivos: `features/vitrine/BarraDeCatalogo.tsx`, `features/vitrine/FiltroEspecificacao.tsx`, `server/catalogo-na-tela.ts`, `lib/catalogo.ts`, `TelaDoCatalogo.tsx` e `vitrine.css`. Teste novo: `catalogo-filtros.onp.test.tsx`.
- Abaixo de 1280px fica o popover de hoje (`#painel-dos-ajustes`, `popover="auto"`). Ele funciona sem JS, fecha com Esc e devolve o foco ao botão que o abriu. O visual vem dos tokens da Gaveta do #104 (`.sc-gaveta` só se for compatível com `[popover]`). O `<dialog>` da Gaveta **não** é usado, porque exige JS e o cardápio funciona sem ele.
- A partir de 1280px, `#painel-dos-ajustes` fica dentro da barra lateral, estático. O CSS zera tudo o que o popover herda (`display: block; position: static; inset: auto; inline-size: auto; max-block-size: none; position-area: none; border: 0; box-shadow: none; animation: none`; as regras de `vitrine.css:2209-2221` e `2268-2277`). O botão "Filtrar" (`--largo`), o "Ordenar e filtrar" (`--estreito`) e o fechar do painel somem. O painel mantém `role="dialog"` e `aria-labelledby`: o papel não muda por CSS, e tirá-lo pioraria a gaveta do celular; o custo no computador fica registrado para o axe do #114.
- Se o painel foi aberto abaixo de 1280px e a janela cresce, ele pode continuar no top layer; é um caso raro, coberto no manual e no e2e.
- **Atacado:** o chip fica visível na barra (como hoje) em vez de dentro da gaveta, porque assim o cliente liga o atacado com um toque. É um desvio consciente do texto do AC-10812. A largura de corte da gaveta é 1280px (decisão do usuário), e não os 1023px do texto do AC-10812.
- **Busca:** `BuscaProduto.tsx` reenvia `estoque`, `preco-de` e `preco-ate` junto com `ordem` e `atacado`. Campos vazios que o formulário GET manda (`preco-de=`) são ignorados.
- Chips ativos: `server/catalogo-na-tela.ts` gera `filtrosAtivos: { rotulo, linkSemEle }[]` (um por `filtro`, mais os novos da T-10808 quando existirem). A barra os mostra como `<a class="sc-chip sc-chip--ativo">` com o "x", `aria-label="Remover filtro {rotulo}"` e a contagem de itens encontrados ao lado (`pagina.total` ou a soma das seções).
- Teste: nenhum `id` repetido no HTML da tela inteira, um só `form[aria-label="Filtrar por especificação"]`, o chip remove só o próprio filtro (o link mantém os outros, a busca e o atacado), trocar de categoria descarta os filtros (AC-10817) e as quatro ordens continuam (AC-10816).

**T-10804. Cartão em lista e em grade.**
- Arquivos: `features/vitrine/CartaoDeProduto.tsx`, `features/vitrine/GradeDeProdutos.tsx`, `features/vitrine/MaisProdutos.tsx` (repassa o formato), `features/vitrine/CartaoEsgotado.tsx` e `vitrine.css`. Teste novo: `catalogo-cartao.onp.test.tsx`.
- `CartaoDeProduto` ganha `formato?: "faixa" | "catalogo"` (padrão `"faixa"`, que é o de hoje, para os Destaques). Com `"catalogo"`, `sizes="(max-width: 767px) 6rem, (max-width: 1279px) 33vw, 320px"`. As constantes 320/240, o `loading` e o `next/image` ficam iguais (`vitrine-acessibilidade.test.ts:25-32`).
- CSS do celular: `.sc-catalogo .sc-vitrine__grade` vira uma coluna, e o cartão vira linha (moldura de 6rem à esquerda, com texto e "+" à direita). Tablet: 3 colunas. Computador: 3 colunas, e com sacola vazia também 3, porque a coluna fica mais larga mas a grade não troca de número de colunas.
- O cartão usa a superfície `.sc-cartao--vitrine` do #104 (ou as classes atuais).
- Preço anterior com "De/por" (já existe), a linha de atacado de `produto.atacado` (vem de `chamadaDoAtacado`, sem alterá-la), "Ver opções" mantido até o #109 definir o convite (é texto do #109, e `vitrine-catalogo.test.tsx` o fixa), selo "Esgotado"/"Fora do horário" em texto e sem "+".
- `data-abre-produto` e `data-adicionar-produto` ficam intactos.
- Teste: os quatro estados, os atributos `data-*`, o `sizes` do formato catálogo, o formato padrão sem mudança e o "+" (AC-10822): presente só em produto disponível, com `data-adicionar-produto`, e o cartão continua sendo um link sem JavaScript.

**T-10805. Páginas, "Ver mais" e busca no servidor.**
- Arquivos: `features/vitrine/MaisProdutos.tsx`, `app/(loja)/loja/[slug]/cardapio/acoes.ts` e `TelaDoCatalogo.tsx`. Teste novo: `catalogo-paginacao.onp.test.tsx`.
- Preserva 24 por seção, 72 na primeira tela, 48 por página e o cursor opaco.
- Acrescenta `<p role="status" aria-live="polite" className="sc-so-leitor">` **renderizado vazio desde o primeiro render** e preenchido com "Não deu para carregar mais produtos" depois da falha (região inserida só depois não é anunciada por vários leitores de tela). Depois do erro, a rolagem automática não tenta de novo sozinha (isso já existe; o teste fixa).
- Teste com dublê de `carregar`: a página 2 não repete ids, nenhuma chamada pede mais de 48, o link "Ver mais" sem JS leva o cursor e o recorte, e o erro mantém os itens e anuncia.

**T-10806. Estados vazios.**
- Arquivos: `server/catalogo-na-tela.ts`, `lib/catalogo.ts` (`CatalogoNaTela` ganha `filtroSemAcertoNaLista: boolean` e `linkSemFiltros: string`), `TelaDoCatalogo.tsx` e `features/vitrine/BuscaProduto.tsx` (só se precisar de prop). Teste novo: `catalogo-vazios.onp.test.tsx`.
- `comFiltro = filtros.length > 0` (mais os filtros da T-10808). A partir daí:
  - `lojaSemCatalogo = termo === null && !atacado && !comFiltro && semProduto`;
  - `filtroSemAcertoNaLista = comFiltro && termo === null && !atacado && (semProduto || (pedida !== null && escolhida === null))`;
  - `filtroSemAcerto` (categoria inexistente) só vale quando `!comFiltro`;
  - `atacadoSemAcerto = termo === null && atacado && !comFiltro && semProduto` (hoje dizia "a loja não tem produtos com atacado" mesmo quando o culpado era o filtro).
- A tela mostra "Nenhum produto com esse filtro", com "Limpar filtros" (`linkSemFiltros`, que mantém categoria, busca, ordem e atacado), e **mantém a barra**.
- A busca sem resultado continua igual ("Nada encontrado para …", "Limpar a busca").
- Categoria inexistente continua sem 404, com "Ver o catálogo inteiro" e as seções logo abaixo (AC-10825: hoje a tela mostra só o `Vazio`).
  - Com categoria no endereço, `comPagina` é verdadeiro e o resumo vai sem `porSecao` (`TelaDoCatalogo.tsx:144-153`; a API usa 0 por padrão, `catalogo-paginado.usecase.ts:137`). Sem tratamento, as seções viriam vazias, só com "Ver mais".
  - Por isso, quando `naTela.filtroSemAcerto` for verdadeiro (caminho raro), `TelaDoCatalogo` faz uma **segunda leitura do resumo** sem a categoria e com `porSecao: PRODUTOS_POR_SECAO` e `totalMaximo: PRODUTOS_NA_PRIMEIRA_TELA`, e monta as seções com ela.
  - Teste: a categoria inexistente mostra o `Vazio` e pelo menos um cartão de produto.
  - `BuscaProduto.tsx` só entra aqui se precisar de prop.
- Os testes legados `vitrine-paginada.test.tsx:178-186`, `filtro-atacado.test.tsx:113-118` e `vitrine-busca.test.tsx:185-192` continuam passando sem mudança.

**T-10807. Título, topo curto, textos genéricos e regressão.**
- Arquivos: `features/vitrine/CapaDaVitrine.tsx` (prop `variante?: "completa" | "compacta"`, padrão `"completa"`, que é idêntico ao de hoje), `TelaDoCatalogo.tsx` e `features/vitrine/BarraDeCatalogo.tsx` (textos). Testes novos: `catalogo-textos.onp.test.tsx` e `catalogo-regressao.onp.test.tsx`.
- A variante compacta tem:
  - o link "Voltar à vitrine" (`/loja/{apelido}`);
  - o nome da loja;
  - o selo "Aberto/Fechado" em texto, que reusa `atributosDoSelo` e a classe `.sc-vitrine__capa-situacao` (fixada por `selo-de-status.test.tsx:49`);
  - o `h1` "{rótulo}" + " de {nome}" para leitor, como hoje;
  - o "i" do Sobre com `data-abre-sobre`;
  - a foto do topo (`capa`/`capaCelular`) como fundo da faixa, com o véu de contraste.
- `TelaDoCatalogo` passa `variante="compacta"`. O padrão continua `completa`, e `capa-do-catalogo.test.tsx` não muda.
- **Enquadramento da foto:** o guia de envio é 1600×400 (`espacos-de-imagem.test.ts:40`), 4:1. A faixa curta usa `object-fit: cover` com `object-position: center` e altura mínima de 5rem no celular e 6rem a partir de 768px, perto dessa proporção. Usa `capaCelular` nas telas estreitas, como a capa grande faz hoje, e não pede nova orientação de envio.
- **Posse de `CapaDaVitrine.tsx`:** a tabela de donos do planejamento (seção 7) dá o arquivo ao #107. A spec do #107 (ASM-10709) e o questionário já passaram a capa ao #108, e o gerente foi avisado. A edição só começa depois que o #107 terminar e soltar o claim; se o claim ainda estiver lá na hora, a T-10807 espera por `board_wait_for`.
- Textos: a busca diz "Buscar no {rótulo}" (já é assim, fixado em teste), sem termos de veículo, placa, chassi, OEM, garantia, "pronta entrega" nem nota.
- Regressão:
  - `?banners=demo` só fora de produção;
  - dados estruturados só sem recorte;
  - loja suspensa chama `notFound`;
  - `TemaDaMarca` com a cor da loja;
  - `capa-do-catalogo.test.tsx` e `config-aparencia.test.tsx` sem mudança;
  - os legados `vitrine-*`, `cardapio-na-tv*`, `filtro-atacado` e `capa-do-catalogo` existem e não têm `.skip` nem `.todo`;
  - "Detalhes do Produto" não aparece em lugar nenhum de `apps/web/src`.

**T-10808a. Contrato** (`packages/contracts/src/vitrine.ts`).
- `esquemaDaBuscaDoCatalogo` (strict) ganha três campos opcionais:
  - `estoque: z.enum(["1","true","0","false"])` e o helper `estoqueLigado()`;
  - `precoMin` e `precoMax`: texto com `z.string().regex(/^(?:\d{1,8}|100000000)$/)`, em centavos, **sem `transform`** (o gerador do openapi usa `io: "output"`, e o repositório avisa disso em `packages/contracts/src/tema.ts:112`). A rota converte com `Number()`, como `atacadoLigado()` faz. Recusa vazio, "1e3", "0x10", espaços e negativos;
  - `filtro` ganha limite de 20 itens de até 120 caracteres cada (hoje não tem limite).
- `esquemaDaOrdemDoCatalogo` ganha `"maior-desconto-atacado"` e `"lancamentos"`.
- `esquemaDeProdutoNaVitrine` **não muda**, e com isso a TV e o feed ficam intocados. As `descricao` das três rotas passam a listar `estoque`, `precoMin`/`precoMax` (em centavos) e as duas ordens novas.
- **`contrato/openapi.json`:** mudar esses esquemas muda o documento publicado. A tarefa roda `pnpm --filter @simpleclick/api run contrato:escrever` e inclui o arquivo, senão o gate reprova em `contrato:verificar` (`apps/api/src/contracts/gerar.ts`).
- Teste novo: `packages/contracts/src/vitrine-consulta.onp.test.ts` (projeto `unit`). Aceita os campos novos; recusa preço negativo, decimal, texto, vazio, notação científica, hexadecimal e acima do teto, `filtro` com mais de 20 itens, ordem desconhecida e parâmetro desconhecido.

**T-10808b. API** (`apps/api/src/modules/storefront/{filtros.usecase.ts, catalogo-paginado.usecase.ts, vitrine.routes.ts}`).
- **Preço que vale, numa só regra:** extrair a expressão de preço do ORDER BY (`catalogo-paginado.usecase.ts:325-358`) para um fragmento `Prisma.sql` exportado, `precoQueValeSql(agora)`. Ele é reusado pela ordem e pelo filtro de faixa, para não divergirem.
- **Filtros novos** (em `filtros.usecase.ts`), ambos `tx.$queryRaw` com template marcado, partindo de `app.products p` para valer a RLS `products_storefront_select`:
  - `produtosEmEstoque()`: a regra da decisão acima, escrita como esgotado = `NOT p.is_available OR (EXISTS(variação viva) AND NOT EXISTS(variação viva disponível com estoque nulo ou > 0))`. Produto **sem variações** nunca é esgotado só por isso (a página só olha variações quando elas existem, `produto.usecase.ts:337-339`); teste dedicado. As junções com `product_variants` e `product_prices` levam `store_id = p.store_id` (segunda trava e uso do índice, como em `listagem-do-painel.ts:296`).
  - `produtosNaFaixaDePreco(min, max, agora)`: só entra produto de **preço único**, definido como `NOT p.has_variants OR p.price_min_cents = p.price_max_cents`. Produto "Ver opções" (variações com preços diferentes) fica fora, porque `precoQueValeSql` cai em `display_price_cents` (`catalogo-paginado.usecase.ts:326`) e não devolve nulo para ele. Limites inclusivos; `min > max` resulta em lista vazia. O teste cobre variações dos dois lados da faixa.
- **Rota** (`vitrine.routes.ts`): `FiltrosDaConsulta` (L77-83) recebe os campos (convertendo os centavos com `Number()`), e `acertosDosFiltros` (L116-145) cruza as listas novas **em `semAtacado`**, sempre com `porTexto` como primeiro argumento de `cruzarAcertos` (ele mantém a ordem da primeira lista, `busca.usecase.ts:252-262`, e a relevância da busca não pode se perder; teste). A faceta de atacado continua contando "o resultado sem o próprio chip", e as rotas `/catalogo`, `/resumo` e `/produtos` ganham o filtro juntas.
- **Ordens novas** (em `paginaDoCatalogo`):
  - `lancamentos` = `p.created_at DESC, p.id DESC`. O cursor continua sendo um deslocamento, então produto criado ou apagado durante a navegação desloca a lista; a deduplicação de `MaisProdutos.tsx:72` esconde repetidos e a instabilidade fica registrada como aceita (o painel faz igual);
  - `maior-desconto-atacado` = `(varejo − menor unitário válido)/varejo`, entre as faixas WHOLESALE vigentes, com as mesmas condições de `produtosComAtacado` (L206-233).
    - A conta é em `::numeric` e o divisor é `NULLIF(varejo, 0)`: com `bigint` a divisão corta a fração e todo produto empata, e preço 0 ou nulo (aceito pelo banco, `0004_catalogo.sql:53`) daria erro 500 numa rota pública.
    - O `varejo` é `precoQueValeSql(agora)` (promoção vigente, como o cartão e `atacadoPublico` em `catalogo.usecase.ts:196-216`), e não `display_price_cents`.
    - Unitário por tipo de faixa, como `unitarioNaFaixa` em `packages/core/src/atacado.ts:78`: PERCENT → `floor((varejo*(100-d)+50)/100)`; AMOUNT → `varejo − d`; preço fixo → `amount_cents`.
    - Valem só as faixas com `variant_id IS NULL`, quantidade ≥ 2 e unitário ≥ 1 e menor que o varejo (`produtosComAtacado` não filtra isso hoje, `filtros.usecase.ts:210-226`, então a ordem não o herda).
    - O corte de faixas monotônicas de `faixasValidas` não muda o menor unitário, então não é replicado.
    - Fica `NULLS LAST` e desempata como hoje (`sort_order`, `name`, `id`).
- **Testes de integração** (projeto `api-int`, banco real), em `apps/api/tests/vitrine-filtros-e-ordens.onp.int.test.ts`:
  - "em estoque" tira o indisponível e o produto com todas as variações zeradas, e mantém o de estoque nulo e o fora do horário;
  - a faixa é inclusiva e funciona com promoção vigente;
  - as duas ordens atravessam páginas sem repetir;
  - o desconto calculado no SQL bate com `atacadoPublico` (`apps/api/src/core/atacado-publico.ts`) para PERCENT, AMOUNT e preço fixo;
  - **isolamento:** produto de outra loja, rascunho ou apagado nunca aparece;
  - entrada inválida dá 400 `entrada_invalida`;
  - `EXPLAIN` das quatro consultas novas numa loja de 10.000 produtos, guardados como evidência: a página com `lancamentos`, com `maior-desconto-atacado` e com a faixa de preço, e o resumo com `estoque=1`. A ordem de desconto calcula o varejo **uma vez por produto** (LATERAL), e não numa subconsulta correlata dentro de outra. Teto de 50 ms para todas; acima disso a tarefa escala, sem criar índice por conta própria.
  - **Segurança dos testes:** rodam pelo acesso `sc_app` (`apps/api/tests/apoio-de-isolamento.ts`, `abrirAcessoDaAplicacao`), e não pela conexão de migração, que ignora a RLS. Casos extras: preço COST mais barato não muda faixa nem ordem; variação apagada com estoque não torna "em estoque" um produto zerado; produto só de categoria oculta; preço e variação de outra loja; variação com `is_available=false` e estoque nulo; promoção vigente alterando a ordem do desconto; preço 0 e nulo sem erro 500.
  - **SQL:** as duas ordens novas seguem o padrão `CASE WHEN ${ordem} = '...'`. `precoQueValeSql` recebe só `agora` como parâmetro e é `Prisma.sql`. É proibido `Prisma.raw` e `$queryRawUnsafe` em `storefront/` (um teste simples lê os arquivos e falha se encontrar).

**T-10808c. Web.**
- Arquivos: `lib/catalogo.ts`, `server/vitrine.ts`, `server/catalogo-na-tela.ts`, `app/(loja)/loja/[slug]/cardapio/acoes.ts`, `TelaDoCatalogo.tsx`, `features/vitrine/FiltroEspecificacao.tsx`, `features/vitrine/BarraDeCatalogo.tsx`, `features/vitrine/BuscaProduto.tsx` e `vitrine.css`.
- **Se a web sair antes da API** (esquema estrito: parâmetro novo dá 400 e a tela lançaria erro, `TelaDoCatalogo.tsx:180-187`): só quando o corpo do 400 (`campos`, `apps/api/src/core/validar.ts:198-203`) apontar `estoque`, `precoMin`, `precoMax` ou `ordem`, `server/vitrine.ts` repete **uma vez** sem esses campos. O resultado volta com `degradado: true`. Nesse caso a tela **não** mostra os chips desses filtros nem marca a ordem nova como em vigor, e mostra um aviso `role="status"` "Alguns filtros não puderam ser aplicados". Outro 400 continua sendo erro. `buscarCatalogo` (TV, mapa do site e balcão) **não** ganha os campos novos. Quando a API estiver no ar, a repetição pode ser removida. O teste usa um dublê de `fetch`.
- **Tipos e ordens:**
  - `OrdemDoCatalogo` e `ORDENS_DO_CATALOGO` ganham "Maior desconto no atacado" e "Lançamentos";
  - `lerOrdem` continua tolerante;
  - `ordenar` local (L151-166, só TV e provas) mantém a ordem do dono para as duas ordens novas, e o comentário "não têm como divergir" (`catalogo-na-tela.ts:205-206`) é corrigido: a TV não aplica estoque, faixa nem as ordens novas. `cardapio-na-tv*.test.tsx` e `catalogo-filtros-novos.onp.test.tsx` fixam isso.
- **Endereço:** `estoque=1`, `preco-de` e `preco-ate`, em reais como o cliente digita. A web converte para centavos e manda `precoMin`/`precoMax` à API. Se os dois vierem invertidos, a web troca um pelo outro.
  - O cliente digita reais com vírgula ou ponto ("10,50" e "10.50" valem 1050 centavos); o resto (NaN, Infinity, negativo, "1e9", "abc") é ignorado. Valor acima do teto é limitado a 100.000.000 centavos. O arredondamento é `Math.round(reais * 100)`, sem degraus: o mínimo e o máximo ficam exatos e inclusivos. Sem o teto, R$ 2.000.000 daria 400 e a tela inteira viraria "catálogo indisponível".
  - Teste com "10,50", "10.50", "1e9", "-1" e "abc".
  - **`filtro`:** como a API passa a recusar mais de 20 itens ou itens com mais de 120 caracteres, `TelaDoCatalogo` e `carregarMaisProdutos` removem repetidos e cortam nesse limite antes de chamar a API. Marcar 21 valores no formulário não derruba a tela. Teste.
- **Recorte:** `RecorteDaLista`, `RecorteDoEndereco`/`enderecoDoCatalogo`, `parametrosDosFiltros` e a cópia em `buscarCatalogo` (`server/vitrine.ts` L151-157 e L220-228), e `carregarMaisProdutos` levam os três campos.
- **Formulário:** o formulário único do painel ganha a caixa "Só em estoque" e os campos "Preço mínimo (R$)" e "Preço máximo (R$)" (`type="number"`, `min="0"`, `step="0.01"`, rótulo visível). Ele passa a existir mesmo sem especificações, então "Filtrar" e a lateral sempre têm o que mostrar.
- **Chips ativos:** "Em estoque" e "Preço: R$ X a R$ Y", cada um removível. `comFiltro` (T-10806) passa a considerar os três campos. O rótulo "Preço: R$ X a R$ Y" é montado a partir do número já validado, nunca do texto cru do endereço.
- Teste novo: `apps/web/tests/catalogo-filtros-novos.onp.test.tsx`. Serialização para a API (com dublê de `fetch`), conversão reais → centavos, inversão, chips, link de remoção, o "Ver mais" levando o recorte e, sem os campos, a requisição idêntica à de hoje.
- Regressão: `cardapio-na-tv*.test.tsx` e `vitrine-paginada.test.tsx`.

## Arquivos (resumo)

- **Modificados:**
  - `apps/web/src/app/(loja)/loja/[slug]/cardapio/{TelaDoCatalogo.tsx, acoes.ts}`
  - `apps/web/src/features/vitrine/{AbasDeCategoria, BarraDeCatalogo, FiltroEspecificacao, CartaoDeProduto, CartaoEsgotado, GradeDeProdutos, MaisProdutos, CapaDaVitrine}.tsx`
  - `apps/web/src/lib/catalogo.ts`
  - `apps/web/src/server/{catalogo-na-tela.ts, vitrine.ts}`
  - `packages/ui/styles/vitrine.css` (só bloco novo no fim)
  - `packages/contracts/src/vitrine.ts`
  - `apps/api/src/modules/storefront/{filtros.usecase.ts, catalogo-paginado.usecase.ts, vitrine.routes.ts}`
- **Novos:** `apps/web/tests/catalogo-{layout,paginacao,filtros,cartao,vazios,textos,regressao,filtros-novos}.onp.test.tsx`, `packages/contracts/src/vitrine-consulta.onp.test.ts` e `apps/api/tests/vitrine-filtros-e-ordens.onp.int.test.ts`.
- **Não tocar:**
  - `features/produto/*`, `lib/produto.ts`, `server/produto.ts`, `lib/atacado-na-vitrine.ts` (#109);
  - `features/carrinho/*`, `features/checkout/*`, `fechamento.css` (#110);
  - os arquivos do #104;
  - `features/tv/*`;
  - `.spec/`;
  - migrations;
  - a landing "/".

## Contratos com os vizinhos

- **#110:** a região `<div class="sc-catalogo__sacola" data-regiao-da-sacola>` fica vazia no `TelaDoCatalogo`, e o #110 a preenche na vez dele (ColunaDaSacola). Vazia, ela não ocupa espaço (`:empty`) e os produtos vão a 9 colunas. Abaixo de 1280px ela fica `display: none`, e a barra fixa é do #110.
- **#109:** `data-abre-produto` e `data-adicionar-produto` ficam intactos. "Ver opções" continua até o #109 pedir a troca do texto. O #109 depois troca só a prop `blocos` de `JanelaDoProduto` no `TelaDoCatalogo`.
- **#105:** a reserva usa `--altura-da-barra-inferior` (com recuo para 0); `--altura-da-barra` fica como está.
- **#104:** usa `.sc-chip`/`.sc-chip--ativo`/`.sc-chips`, os tokens de tipo e cor, e `.sc-cartao--vitrine`. Se uma peça não existir, valem as classes atuais. Nenhuma cor fixa e nenhuma fonte declarada em `vitrine.css`: o claro e o escuro vêm dos tokens.

## Riscos

| Risco | Prob./Impacto | Mitigação | Detecção |
|---|---|---|---|
| A web sair antes da API: param novo → 400 → "catálogo indisponível" | média / alto | params novos só vão quando o cliente usa os filtros; sem eles, a requisição é idêntica (teste); o texto do PR pede deploy da API antes | teste "sem campos = requisição de hoje"; e2e |
| SQL do desconto divergir da regra do core | média / médio | teste cruzado com `atacadoPublico` nos três tipos de faixa | `api-int` |
| Faixa de preço e `created_at` sem índice: consulta cara numa rota pública sem limitador (`apps/api/src/core/limite.ts:479` só cobre auth e impressão) | média / médio | teto no contrato, EXPLAIN de todas as consultas novas numa loja de 10.000 produtos e pedido ao gerente de um limitador por IP em `/catalogo*` (fora deste card; sem ele a API pública chamada direto passa por fora do cache da web, risco que o gerente precisa aceitar); acima de 50 ms escala ao gerente (índice = migração nova, decisão humana) | evidência do EXPLAIN |
| Barra lateral sticky com muita categoria e painel de filtros estático (herança de popover, top layer ao redimensionar) | média / médio | a barra tem `max-block-size` e `overflow: auto`; o CSS zera tudo o que o popover herda; `role="dialog"` mantido; redimensionamento coberto no manual e no e2e | axe e e2e do #114; `vitrine-barra-e-ordem` |
| A sacola preencher e os cartões estreitarem (2 → 3 colunas) | média / médio | só a chave `:empty` fica com o #108; o critério de espaço liberado e a medição de CLS são do #110 e do #114 | CLS no e2e |
| Regex de "primeira regra" nos testes de CSS | alta se ignorado / baixo | bloco novo só no fim do arquivo | `painel-produtos.test.tsx` |
| Falha antiga no e2e (`sizes` 720px) mascarar regressão | média / médio | T-0 registra a linha de base antes de editar | gate |
| Peças do #104 com nomes diferentes | média / baixo | revisar o plano quando o #104 terminar; plano B com as classes atuais | T-0 |

## Verificação

- Por tarefa: `pnpm exec vitest run <testes da tarefa>` e os legados citados.
- No fim, o gate inteiro: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:int` (banco local), `pnpm test:e2e` e `pnpm build`. Comparar com a linha de base da T-0.
- Manual no navegador (`rmcode browser`): `/loja/<loja>/cardapio` em 344, 768 e 1280px, nos temas claro e escuro, com e sem filtros, com o filtro sem acerto, a busca "zzzz", a categoria inexistente e `?ordem=lancamentos`. Sem rolagem lateral, e a região da sacola vazia sem buraco.
- Sem commit e sem push; ao fim, `card_report` com as validações.
