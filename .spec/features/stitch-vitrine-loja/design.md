# Design: Vitrine da loja (redesign Stitch)

> feature: stitch-vitrine-loja · card #107 · 09/11/2026

Documento de planejamento. Nada aqui está aprovado para implementação: as
decisões do dono do produto estão nas perguntas Q-10701 a Q-10711 da spec.
Cabeçalho, navegação e rodapé são do #105; peças e tokens são do #104; os
testes transversais são do #114. Aqui só se trata o conteúdo principal da
página pública da loja.

## 1. Estado atual (evidência lida no repositório)

| Fato                                                                                                                                                                                                                                                                                               | Onde                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A página é um componente de servidor assíncrono. Busca em paralelo vitrine, fechamento, resumo do catálogo (12 por seção, até 48), usuário e favoritas, e monta Apresentação, Publicações, Sobre (janela) e Entrada, nessa ordem                                                                   | `apps/web/src/app/(loja)/loja/[slug]/TelaDaLoja.tsx` (`TelaDaLoja`)                                                                                                                       |
| `/loja/<apelido>/sobre` é a mesma tela com `sobreAberto`, título e canônico próprios                                                                                                                                                                                                               | `apps/web/src/app/(loja)/loja/[slug]/sobre/page.tsx`                                                                                                                                      |
| A descrição para buscadores diz "Peça em {loja} pelo WhatsApp." mesmo sem WhatsApp (Q-10711)                                                                                                                                                                                                       | `apps/web/src/app/(loja)/loja/[slug]/page.tsx` (`generateMetadata`)                                                                                                                       |
| A prévia da Aparência desenha a mesma `TelaDaLoja` com o rascunho do cookie e importa `vitrine.css`, `produto.css` e `fechamento.css`                                                                                                                                                              | `apps/web/src/app/(loja)/loja/[slug]/previa/[parte]/page.tsx`                                                                                                                             |
| O layout da loja importa `narrativa.css` (onde moram as classes `sc-loja__*`) e `sobre.css`. O `vitrine.css` não carrega na página pública                                                                                                                                                         | `apps/web/src/app/(loja)/loja/[slug]/layout.tsx`, `packages/ui/styles/narrativa.css`                                                                                                      |
| A Apresentação tem capa e fundo (com versão para celular), véu, capa padrão do ramo, logo ou iniciais, nome, boas-vindas, Sobre resumido, botão do catálogo, "Como receber", "Onde estamos" e "Horários, pagamento e contato". Este último link só aparece com entrega ou endereço (`temDetalhes`) | `apps/web/src/features/loja/ApresentacaoDaLoja.tsx` (`ApresentacaoDaLoja`)                                                                                                                |
| Situação: "Aberta agora"; fechada: "Fechada agora · próxima abertura" ou "horário não informado"; exceção: explicação no lugar de "Fechada agora"                                                                                                                                                  | `ApresentacaoDaLoja.tsx` (`SituacaoDaLoja`)                                                                                                                                               |
| O selo tem pílula clara ou escura com contraste AA, por escolha do dono ou automática                                                                                                                                                                                                              | `apps/web/src/features/vitrine/SeloDeStatus.tsx` (`atributosDoSelo`)                                                                                                                      |
| A animação de entrada procura `.sc-loja__detalhes` dentro de `[data-narrativa="apresentacao"]`                                                                                                                                                                                                     | `apps/web/src/features/loja/EntradaDaLoja.tsx`                                                                                                                                            |
| O Sobre mostra história, horários, como receber, pagamento (sem a chave PIX), endereço com "Abrir no mapa" e WhatsApp. Cada seção some sem dado                                                                                                                                                    | `apps/web/src/features/loja/SobreDaLoja.tsx`, `apps/web/src/features/loja/sobre/SecoesDoSobre.tsx`, `apps/web/src/features/loja/sobre/formatos.ts` (`enderecoNoMapa`, `numeroDoWhatsApp`) |
| O pagamento chega ao Sobre num tipo sem a chave PIX (`RecebimentoDaLoja`), e um teste confere por leitura do fonte que `TelaDaLoja` não repassa o fechamento inteiro                                                                                                                               | `SobreDaLoja.tsx`, `apps/web/tests/sobre-da-loja.test.tsx`                                                                                                                                |
| Favoritar a loja só existe dentro das publicações, que não desenham nada sem produto                                                                                                                                                                                                               | `apps/web/src/features/feed/PostsDaLoja.tsx` (importa `feed.css`, também usado no /explorar)                                                                                              |
| O contrato da loja traz `whatsappPublico`, `enderecoParaRetirada`, `formasDeEntrega`, `rotulos`, `blocos` e `tema`. O resumo do catálogo traz `destaques` e a contagem por seção                                                                                                                   | `packages/contracts/src/vitrine.ts` (`esquemaDeLojaPublica`, `esquemaDoResumoDoCatalogo`)                                                                                                 |
| `blocos.vitrine` descreve a tela do catálogo (`/cardapio`), não o perfil da loja                                                                                                                                                                                                                   | `apps/web/src/lib/vertical.ts` (`temBloco`), `apps/web/src/app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx`                                                                            |
| `Destaques` recebe `ProdutoNaTela`; a conversão do contrato é `prepararProduto`. Suas classes estão em `vitrine.css`                                                                                                                                                                               | `apps/web/src/features/vitrine/Destaques.tsx`, `apps/web/src/server/catalogo-na-tela.ts`                                                                                                  |

Do que o Stitch traz e a plataforma não tem: contagem pública de favoritos,
nota e avaliações (#117), selo de verificada (#118), parcelamento (#126),
"mais vendidos" (#124), garantia e trocas (sem campo), mapa embutido, botão
de compartilhar a loja. Itens automotivos (placa, chassi, técnico,
compatibilidade) e promessas ("NF-e inclusa", "compra protegida", prazos)
ficam fora (P-104, P-105).

## 2. Composição proposta por largura

Ordem dos blocos, só com o que a loja tem (AC-10708). Os nomes das peças são
os do contrato proposto pelo #104 (nota do board).

| Ordem | Bloco                                                 | Celular (390)               | Tablet (768)        | Computador (1280)                    | Origem do dado                                                                  |
| ----- | ----------------------------------------------------- | --------------------------- | ------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| 1     | Identidade: foto, logo ou iniciais, nome, boas-vindas | foto do celular, uma coluna | foto do computador  | foto do computador, texto à esquerda | `loja.tema`, `loja.logo`, `loja.nome`, `loja.boasVindas`                        |
| 2     | Situação (selo)                                       | sobre a foto                | sobre a foto        | sobre a foto                         | `abertura`, `loja.tema.seloDeStatus`                                            |
| 3     | Botão do catálogo                                     | largura total               | largura do conteúdo | largura do conteúdo                  | `loja.rotulos.catalogo`                                                         |
| 4     | Condições: entrega e retirada, endereço, pagamento    | cartões empilhados          | duas colunas        | três colunas                         | `loja.formasDeEntrega`, `enderecoParaRetirada`, `recebimento.formasDePagamento` |
| 5     | Contato por WhatsApp (lugar na Q-10708)               | cartão ou botão             | idem                | idem                                 | `loja.whatsappPublico`                                                          |
| 6     | Destaques (regra por ramo na Q-10703)                 | carrossel                   | carrossel           | grade ou carrossel                   | `resumo.destaques`                                                              |
| 7     | Publicações e Sobre (abas ou seções, Q-10701)         | conforme a pergunta         | idem                | idem                                 | `postsDoCatalogo`, `loja.sobre`                                                 |
| 8     | Caminho para o Sobre                                  | sempre presente (AC-10720)  | idem                | idem                                 | `loja.apelido`                                                                  |

O que fica **oculto** até decisão: nota e avaliações, selo de verificada,
"mais vendidos", parcelas, contador de favoritos, compartilhar, garantia e
trocas (AC-10717 e Q-10705, Q-10707).

## 3. Decisões e alternativas

### D-1 — Estilos nas folhas que a página já carrega

Os estilos novos vão em `narrativa.css` e `sobre.css`, que o layout da loja
já importa, e não em `vitrine.css` (não carrega na página pública, só na
prévia). Alternativa: importar `vitrine.css` no layout, que é do #105 e
tornaria a ordem dos estilos da loja dependente de outro card. Risco: as
duas folhas não têm dono na tabela do #103 (Q-10710); mitigação: pedido ao
gerente antes de escrever as tarefas.

### D-2 — Composição síncrona para poder testar

`TelaDaLoja` é assíncrona e `renderToStaticMarkup` não desenha componente
assíncrono. Proposta: extrair um componente síncrono (`PerfilDaLoja`) que
recebe dados já prontos; `TelaDaLoja` só busca e o chama. Alternativa: manter
tudo em `TelaDaLoja` e provar só por leitura do fonte (prova fraca para a
ordem dos blocos e a omissão de campos).

### D-3 — Condições só com `RecebimentoDaLoja`

O componente de condições recebe o tipo que já não tem a chave PIX, e o teste
usa um fechamento de exemplo que traz uma chave para provar que ela não sai
(AC-10709). A guarda atual por leitura do fonte continua.

### Q-10701 e Q-10702 — Abas, seções e Sobre

| Alternativa                                                 | Sem JavaScript                                                                            | Buscador e endereço                                                          | Teclado                     | Observação                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| A. Seções empilhadas; Sobre continua janela com `/sobre`    | tudo no HTML                                                                              | um endereço por conteúdo, como hoje                                          | só links e botões comuns    | menor mudança; diverge do Stitch                                          |
| B. Abas no cliente (peça `Abas` do #104)                    | só a aba ativa visível, a menos que os painéis venham todos no HTML e o script os esconda | abas com `?aba=` ou `#` criariam endereços novos que disputam com o `/sobre` | setas, Home e End pela peça | precisa conferir se a peça do #104 renderiza todos os painéis no servidor |
| C. Abas por links (cada aba é uma rota, inclusive `/sobre`) | funciona                                                                                  | um endereço por aba, cada um com canônico próprio                            | links comuns                | mais fiel ao `/sobre` atual; exige rota para as publicações               |

Sem recomendação presumida: depende da resposta do dono. A B só é aceitável
se o AC-10721 passar (todo o conteúdo no HTML sem script).

### Q-10703 — Blocos por ramo

| Alternativa                                  | Efeito                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| A. Mostrar cada bloco sempre que houver dado | simples; o dono controla pelo que cadastra                                      |
| B. Reusar `blocos.vitrine`                   | o nome engana: hoje governa o catálogo; ligar o perfil a ele muda o significado |
| C. Chave nova de composição para o perfil    | fora do escopo (contrato e banco)                                               |

## 4. Dependências entre cards

| Card                   | O que este card usa ou combina                                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #104                   | `Abas`, `Chip`, ícone de compartilhar, estrela de favoritar, tokens `--cor-*`; verde só `#B7FF00`. Se `Abas` renderiza todos os painéis no servidor                                                       |
| #105                   | Moldura da loja (cabeçalho, navegação, rodapé): só referenciada                                                                                                                                           |
| #106                   | `BotaoFavoritar` e `feed.css` (regras novas restritas a `.sc-pagina-da-loja`)                                                                                                                             |
| #108                   | Ficou com `CapaDaVitrine` (variante compacta do topo do cardápio), `features/vitrine/*`, `server/catalogo-na-tela.ts` e `lib/catalogo.ts`. Este card só reusa `Destaques` e `prepararProduto`, sem editar |
| #114                   | Axe, teclado, contraste por loja, toque, movimento reduzido, estouro em 344px, estados, imagens e dados do Stitch; a matriz do #114 lista o #107                                                          |
| #117, #118, #124, #126 | Blocos ocultos até a decisão (P-107); nenhuma tarefa depende deles                                                                                                                                        |

## 5. Mapa de critérios e provas

| Critério                      | Prova proposta                                                  | Arquivo de teste futuro                                |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| AC-10701, AC-10703            | marcação da identidade, iniciais e capa padrão                  | `apps/web/tests/vitrine-loja-identidade.onp.test.tsx`  |
| AC-10702                      | marcação: foto do celular e véu; o visual por largura é do #114 | idem                                                   |
| AC-10704 a AC-10707           | cenários aberta, fechada, sem horário e exceção                 | `apps/web/tests/vitrine-loja-situacao.onp.test.tsx`    |
| AC-10708 a AC-10711, AC-10720 | loja sem dados, com chave PIX, com e sem WhatsApp, mapa         | `apps/web/tests/vitrine-loja-condicoes.onp.test.tsx`   |
| AC-10712, AC-10713            | rótulo do ramo, link real, destaques ausentes e presentes       | `apps/web/tests/vitrine-loja-destaques.onp.test.tsx`   |
| AC-10714, AC-10715, AC-10721  | publicações, Sobre no servidor, HTML sem script                 | `apps/web/tests/vitrine-loja-publicacoes.onp.test.tsx` |
| AC-10717                      | procura dos textos ocultos no HTML e no fonte                   | `apps/web/tests/vitrine-loja-guardas.onp.test.tsx`     |
| AC-10718, AC-10719            | leitura do fonte: mesma composição na prévia e na rota pública  | idem                                                   |

Método: `renderToStaticMarkup` com axe, como os testes atuais da vitrine
(`apps/web/tests/apresentacao-da-loja.test.tsx`), com títulos
`[CA-n] @spec:AC-107xx`. A prova da prévia e do `/sobre` é por leitura do
fonte, como hoje, porque a tela é assíncrona. Testes antigos que dependem da
estrutura atual (por exemplo `.sc-loja__detalhes`) só mudam em tarefa
explícita, com a equivalência declarada (ASM-10707).

## 6. Riscos

| Risco                                                           | Mitigação                                                                                                     | Detecção                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Mudar a estrutura quebra testes antigos e a animação de entrada | manter os blocos novos dentro de `[data-narrativa="apresentacao"]` ou ajustar `EntradaDaLoja` na mesma tarefa | `entrada-da-loja.test.tsx` e `apresentacao-da-loja.test.tsx` |
| Chave PIX vazar ao passar o fechamento inteiro                  | componente aceita só `RecebimentoDaLoja`; teste com chave de exemplo                                          | AC-10709                                                     |
| Estilo novo em `feed.css` alterar o /explorar                   | regras sob `.sc-pagina-da-loja`; testes do #106 sem mudança                                                   | testes do feed                                               |
| Prévia diferente da página pública                              | mesma composição e mesmas folhas (ASM-10706)                                                                  | AC-10718                                                     |
| #104 ou #108 mudarem peças e classes                            | referência pela nota do board; ajustar este documento                                                         | `board_notes`                                                |
| Aba que esconde conteúdo sem JavaScript                         | AC-10721 como condição de qualquer alternativa com abas                                                       | AC-10721                                                     |
