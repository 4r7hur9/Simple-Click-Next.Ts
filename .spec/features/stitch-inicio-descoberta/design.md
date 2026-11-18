# Design: Início e Descoberta do cliente (redesign Stitch)

> feature: stitch-inicio-descoberta · card #106 · 06/11/2026

Documento de projeto da spec `spec.md`. Nada aqui está aprovado para
implementação: as decisões do dono do produto estão nas perguntas
Q-10601…Q-10612 da spec. Caminhos relativos a `apps/web/src/` salvo indicação.

## 1. Origem, escopo e divisão com outros cards

- Referência visual: `simpleclick_in_cio_descoberta` (celular, 390px) e
  `simpleclick_desktop_in_cio_descoberta` (computador, 1280px) do ZIP do
  Stitch (sha256 no design do #103). É referência de composição, não conteúdo:
  Universokar, autopeças, "45 min • Grátis", notas e avaliações, "Entrega
  Flash", "Suporte 24h", "Sem taxas ocultas", CNPJ e as dicas de mecânica não
  são copiados (P-104, P-105, AC-10628).
- **#105 (stitch-navegacao-cliente)**: topo global (marca, indicador de
  localização ou cidade, ícone de busca, sacola, avatar), abas do topo no
  computador, barra inferior do celular e rodapé. O #105 confirmou a divisão
  em 06/11: o #106 consome só o estado "com localização" ou "sem
  localização" e a ordem "mais perto" que já existe. Os IDs de critério do
  #105 ainda não existem; quando saírem, entram nas referências deste
  documento.
- **#104 (stitch-base-visual)**: Chip (T-10405), Abas (T-10405), Gaveta
  (T-10406), AvisoFlutuante, ícones ✦ e ★ (AC-10405, AC-10406), foco visível
  (AC-10417). O #106 só usa essas peças e faz a troca nas telas do feed.
- **#114 (stitch-validacao-visual)**: testes transversais de axe por tela e
  largura (AC-11409), teclado na jornada (AC-11410), toque (AC-11412),
  movimento reduzido (AC-11413), estouro lateral em 344px (AC-11415), estados
  vazio, erro e carregamento (AC-11416), imagens (AC-11417), regressão da busca
  (AC-11404) e dados do Stitch (AC-11421). O #106 **não duplica** esses
  testes; ele entrega os critérios próprios da descoberta, e a lista de
  estados que o #114 deve cruzar está na seção 7.
- **Dono de arquivos** (contrato aplicado pelo #103 em 06/11 ao design de
  planejamento, §7): o #106 é dono de `app/(explorar)/explorar/page.tsx`,
  `_dados.ts`, `acoes.ts`, `produtos/`, `lojas/`, de `features/feed/*` e de
  `server/feed.ts` e `server/feed-social.ts`. O `layout.tsx` do /explorar
  fica na fila #105 → #106.

## 2. Estado atual (fatos com evidência)

| Fato                                                                                                                             | Evidência                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `/explorar` só redireciona para `/explorar/produtos`                                                                             | `app/(explorar)/explorar/page.tsx`                                                      |
| A moldura é escura, com `LateralDaSessao` e `RodapeLegal`                                                                        | `app/(explorar)/explorar/layout.tsx`                                                    |
| `TelaDoFeed` monta título, abas Produtos e Lojas, `BarraDoFeed`, chips, `FileiraDeStories` (só em produtos) e o conteúdo         | `features/feed/TelaDoFeed.tsx`                                                          |
| Consulta por endereço: `lerConsulta`, `ordemEfetiva`, `enderecoDoFeed` (monta `/explorar/${aba}`), `POR_PAGINA = 24`             | `features/feed/consulta.ts`                                                             |
| Localização só por `navigator.geolocation` e `localStorage` (`sc:feed:local`), arredondada a 3 casas só no navegador             | `features/feed/BarraDoFeed.tsx` (`CHAVE_DO_LOCAL`), `consulta.ts` (`arredondarLocal`)   |
| Sem localização a ordem "mais perto" cai para relevância e a distância é nula                                                    | `consulta.ts` (`ordemEfetiva`, `escreverDistancia`), SQL `app.distancia_km`             |
| Rolagem infinita por página e deslocamento; tira repetidos pela chave                                                            | `features/feed/useMaisItens.ts`, `FeedDePosts.tsx` (`FimDaLista`)                       |
| Tipos de negócio vêm da API; se falhar, só "Tudo"                                                                                | `server/feed.ts` (`buscarTiposDeNegocio`), `consulta.ts` (`categoriasDoFeed`)           |
| Favoritas e recentes exigem sessão; sem sessão o estado é `precisa-entrar`                                                       | `_dados.ts` (`conteudoDasLojas`), `server/feed.ts` (`buscarLojasDaContaNoFeed`)         |
| Recentes: janela de 30 dias e no máximo 20 lojas                                                                                 | `packages/contracts/src/feed.ts` (`JANELA_DOS_RECENTES_EM_DIAS`, `LIMITE_DOS_RECENTES`) |
| **Lacuna**: a leitura de produtos do feed não manda a sessão, então `favorito` e `curtiu` vêm sempre falsos                      | `_dados.ts` (`conteudoDosProdutos`), `acoes.ts` (`maisPosts`), `server/feed.ts`         |
| Com sessão vencida, `buscarProdutosDoFeed` tenta de novo sem sessão (estrelas falsas em silêncio)                                | `server/feed.ts`                                                                        |
| Sem stories, a fileira devolve nada                                                                                              | `features/feed/Stories.tsx` (`FileiraDeStories`)                                        |
| O contrato do produto traz `precoOriginalCentavos` (preço "de"), `atacado`, `distanciaKm`, `favorito`, `curtidas`, `comentarios` | `packages/contracts/src/feed.ts` (`esquemaDoProdutoDoFeed`)                             |
| O contrato não tem campo de destaque, de patrocínio, de horário de funcionamento nem de prazo estimado                           | `packages/contracts/src/feed.ts`                                                        |
| `/explorar` está no mapa do site e nos passos do tutorial                                                                        | `app/sitemap.ts`, `features/tutorial/passos.ts`, `lib/routes.ts`                        |
| Nenhum teste do feed tem `@spec`; não há `*.onp.test.*` no repositório                                                           | `apps/web/tests/feed-*.test.ts(x)`                                                      |

## 3. Mapa dos blocos do Stitch (celular IM e computador ID)

Situação: **E** existe · **P** parcial · **N** nova · **AD** a decidir ·
**FORA** fora de escopo. A coluna "Decisão" é proposta, sujeita às perguntas.

| Bloco do Stitch                                     | Telas  | Hoje                                                              | Decisão proposta                                                                                                     | Critérios                |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Topo, cidade, sacola, avatar, abas do topo          | IM, ID | P (#105)                                                          | Não é do #106; só consumir o estado de localização                                                                   | AC-10616                 |
| Barra inferior e rodapé                             | IM, ID | N, E (#105)                                                       | Não é do #106                                                                                                        | —                        |
| Busca "O que procura hoje?"                         | IM, ID | E: campo em `BarraDoFeed`                                         | Mantém, com o campo da base visual do #104 (AC-10409); rótulo genérico, sem "peças"                                  | AC-10606                 |
| Botão de filtros rápidos                            | IM     | P: botão "Filtros" com contagem em `BarraDoFeed`                  | Mantém entrega, retirada, atacado e ordem; mostra quantos estão ligados                                              | AC-10609                 |
| Stories "Novidades e Flashes", "Ao vivo", "24h"     | IM, ID | E: `FileiraDeStories`, `VisualizadorDeStories`                    | Mantém; título "Novidades" sem "Ao vivo" nem "Flashes"; some inteira sem stories; anel segue a cor da loja           | AC-10624                 |
| Chips de segmento                                   | IM, ID | E: `categoriasDoFeed` sobre `/v1/tipos-de-negocio`                | Troca para o Chip do #104; só tipos reais mais "Tudo"                                                                | AC-10607, AC-10608       |
| Lojas favoritas e recentes                          | IM, ID | E: aba Lojas com listas favoritas e recentes                      | Vira seção "Suas lojas" no início, só com sessão; visitante vê convite ou a seção some (Q-10610)                     | AC-10610…10612, AC-10615 |
| Cartão de loja: capa, logo, nome, "aberta agora"    | IM, ID | E: `CartaoDeLoja`, `PostDeLoja`                                   | Mantém capa, logo, nome, tipo e cidade e bairro; "aberta agora" só se a leitura trouxer o horário (ASM-10607)        | AC-10617                 |
| Cartão de loja: "45 min • Grátis", taxa e prazo     | IM, ID | FORA                                                              | Não existe prazo estimado; taxa é por bairro e fica na loja e no fechamento. Mostra só distância e formas de receber | AC-10616, AC-10617       |
| Banner principal com loja em destaque               | ID     | N: sem campo de destaque                                          | Fora até decidir (Q-10603, Q-10604); a página começa pelos stories                                                   | AC-10604                 |
| Filtros do banner: Mais vendidos, 4.8+, Oficiais    | ID     | AD (#124, #117, #118)                                             | Ocultos                                                                                                              | AC-10627                 |
| Filtro do banner: "Entrega Flash 30m"               | ID     | FORA                                                              | Promessa inventada                                                                                                   | AC-10628                 |
| Grade "Destaques e Ofertas"                         | IM, ID | P: produtos do feed em posts e em cartões                         | Seção própria, com os produtos reais do feed                                                                         | AC-10620                 |
| Cartão de produto: preço "de" riscado               | IM, ID | P: `precoOriginalCentavos`                                        | Só quando a loja informou                                                                                            | AC-10620                 |
| Cartão de produto: atacado "12+ un"                 | IM, ID | E: campo `atacado`                                                | Só quando há faixa de atacado                                                                                        | AC-10620                 |
| Cartão de produto: botão "+" na sacola              | IM, ID | N: a sacola é por loja                                            | Pergunta aberta (Q-10606); recomendado manter o toque que leva ao produto na loja                                    | —                        |
| Selos "Top oferta", "Em alta", "Alta demanda"       | IM, ID | AD (#124)                                                         | Ocultos                                                                                                              | AC-10627                 |
| Abas "Mais pedidos", "Promoção atacado", "Recentes" | ID     | P: ordens do feed e filtro de atacado                             | Só "Recentes" e "Atacado"; sem "Mais pedidos"                                                                        | AC-10621                 |
| Post "Dicas dos Especialistas"                      | IM, ID | AD (#115, #116)                                                   | Oculto; o feed mostra só publicações de produto                                                                      | AC-10627                 |
| Post: curtir, comentar, compartilhar, salvar        | IM, ID | E: `Post`, `MidiaDoPost`, `GavetaDeComentarios`, `BotaoFavoritar` | Mantém; ícones ✦ e ★ do #104; gaveta passa para a Gaveta do #104                                                     | AC-10623                 |
| Post: "Seguir loja"                                 | ID     | P: favoritar loja                                                 | Pergunta aberta (Q-10607); recomendado manter "favoritar"                                                            | —                        |
| Faixa de benefícios                                 | ID     | P                                                                 | Só o que é verdade (acompanhar pelo WhatsApp) ou sai (Q-10608); "Sem taxas ocultas" fica fora                        | AC-10628                 |
| Texto automotivo e "km de troca"                    | IM, ID | FORA                                                              | Conteúdo de exemplo; o feed usa posts reais das lojas                                                                | AC-10628                 |

## 4. Composição proposta

Ordem recomendada (Q-10601): busca → stories → segmentos → suas lojas →
destaques e ofertas → feed de publicações. Cada seção é independente.

**Celular (até 767px).** Uma coluna. Stories e segmentos em faixas que rolam na
horizontal dentro da própria faixa. "Suas lojas" em cartões de largura cheia ou
faixa de cartões. "Destaques e ofertas" em 2 colunas de cartões. Feed em uma
publicação por vez, no formato 4:5 que já existe.

**Tablet (768px a 1023px, sem mockup, ASM-10608).** A composição do computador
com menos colunas: "Suas lojas" em 2 colunas e destaques em 3.

**Computador (1024px ou mais).** Stories e segmentos em duas faixas largas.
"Suas lojas" em até 3 colunas, destaques em até 4 e cada publicação do feed
com a foto ao lado do texto. Largura máxima do conteúdo igual à da moldura do
#105.

Peças: Chip e Abas do #104 nos segmentos e nas abas da seção de destaques;
`Cartao` com `superficie="vitrine"` (#104) nos cartões; `Selo` com tom
`sucesso` só quando "aberta agora" existir; ícones ✦ e ★ do pacote de ícones.
Cores só pelos tokens `--cor-*` (P-102, P-108); o anel dos stories e o
destaque do cartão seguem `--cor-primaria` e, dentro de cartão de loja, o
tema da loja que já existe.

## 5. Dados por seção

Todas as seções usam leituras que já existem (ASM-10603).

| Seção                   | Leitura                                                                                     | Sessão                     | Falha ou vazio                                                |
| ----------------------- | ------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------- |
| Stories                 | `buscarStoriesDoFeed` (`server/feed-social.ts`), `/v1/stories`                              | opcional                   | Some inteira (AC-10624, AC-10605)                             |
| Segmentos               | `buscarTiposDeNegocio` (`server/feed.ts`), `/v1/tipos-de-negocio`, com revalidação pública  | nunca                      | Só "Tudo" ou some (AC-10608)                                  |
| Suas lojas              | `buscarLojasDaContaNoFeed` (`server/feed.ts`): `/v1/conta/favoritos` e `/v1/conta/recentes` | obrigatória                | Visitante: convite ou some; erro: "Tentar de novo" (AC-10612) |
| Destaques e ofertas     | `buscarProdutosDoFeed` (`server/feed.ts`), `/v1/feed/produtos`, ordem recentes e atacado    | opcional, para as estrelas | Aviso com caminho útil (AC-10625)                             |
| Feed de publicações     | `buscarProdutosDoFeed` por página; server action `maisPosts` (`acoes.ts`)                   | opcional                   | "Tentar de novo" na carga (AC-10622)                          |
| Aba Lojas e "ver todas" | `buscarLojasDoFeed`, `/v1/feed/lojas`                                                       | opcional                   | Aviso "O feed não carregou" (AC-10626)                        |

Fatos que o design registra:

- A lista de recentes vem de `/v1/conta/recentes` (e não de `/v1/feed/recentes`),
  com `porPagina=50` e o corte de 20 no caso de uso; as favoritas vêm sempre
  em ordem de relevância, então a ordem escolhida pelo cliente não vale nelas.
- A janela de 30 dias dos recentes é aplicada na API; a tela só filtra por
  tipo e busca (`filtrarLojasDaConta`).

### 5.1 Mudanças de dados previstas (únicas)

1. **Sessão na leitura de produtos.** `conteudoDosProdutos(consulta, token)`
   passa a receber o token, e a página (`produtos/page.tsx`) e a action
   `maisPosts` (`acoes.ts`) o obtêm por `tokenDaSessao()` **no servidor**,
   nunca como parâmetro vindo do navegador. `buscarProdutosDoFeed` recebe o
   token na 3ª posição (depois de `buscar`). Cobre as páginas 2 em diante
   (AC-10613). Evita que a estrela já marcada seja apagada pela página nova.
2. **Sessão vencida.** Hoje a nova tentativa sem sessão devolve estrelas falsas
   em silêncio. O design propõe devolver um estado "sessão vencida" que a tela
   trata (pedir para entrar de novo ou esconder estrelas e "Suas lojas"), em
   vez de tratar como "visitante" (AC-10614).
3. **Cache.** Toda leitura que leva `authorization` usa `cache: "no-store"` e
   não passa por `unstable_cache` nem por revalidação do Next. A única leitura
   com revalidação continua sendo a dos tipos de negócio, pública e sem sessão
   (AC-10611).
4. **Localização no servidor.** `lerConsulta` e `consultaDaApi` arredondam
   `lat` e `lng` a 3 casas e descartam valor fora da faixa válida, em vez de
   confiar só em `arredondarLocal` do navegador. Nenhuma coordenada vai para
   log da aplicação (AC-10618).
5. **Sair da conta.** Apagar `sc:feed:local` e os stories vistos do aparelho ao
   sair (AC-10619). O botão de sair está em `features/usuario/*`, que é do #105
   e do #111; o #106 expõe uma função `limparDadosLocaisDoFeed` em
   `features/feed/` e pede ao #105 que a chame (pedido por `board_message`,
   ainda sem resposta).

Nenhuma rota nova de API, nenhuma coluna nova e nenhuma dependência nova.

## 6. Alternativas e recomendação

### 6.1 Rota do Início (Q-10602)

| Alternativa                                                                                          | Efeito nos filtros e nos links atuais                                                                                          | Risco                                            |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| **A. Seções no topo de `/explorar/produtos` (recomendada)**: `/explorar` continua levando a produtos | Busca, chips e filtros continuam em `/explorar/produtos?...` (`enderecoDoFeed` não muda); todos os links atuais valem          | Página de produtos fica mais longa               |
| B. `/explorar` vira o Início com seções e "Ver tudo" leva a `/explorar/produtos` e `/explorar/lojas` | `enderecoDoFeed` precisa decidir se uma busca no Início leva à lista ou filtra o próprio Início; mapa do site e tutorial mudam | Quebra de link salvo se o redirecionamento sumir |
| C. Nova rota `/inicio`                                                                               | `/explorar` fica como está; duplica a descoberta                                                                               | Dois lugares para o mesmo conteúdo               |

Recomendação: A. Em B, o redirecionamento atual deve ser mantido para quem
chega com os parâmetros antigos (AC-10629). O título e o endereço canônico do
início são tratados em AC-10630 qualquer que seja a alternativa.

### 6.2 Banner de destaque (Q-10603, Q-10604)

| Alternativa                            | Dado necessário                                                     | Observação                                                                              |
| -------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Sem banner (recomendada, é a spec)** | nenhum                                                              | A página começa pelos stories                                                           |
| Regra automática (loja nova com capa)  | leitura nova de lojas ordenadas por criação; a capa já vem (`capa`) | Pode virar vantagem injusta; precisa de limite e de rodízio                             |
| Curadoria da administração             | campo novo e tela no admin (#113)                                   | Card próprio, só se aprovado                                                            |
| Espaço patrocinado                     | campo, preço, contrato, aprovação                                   | Sempre rotulado "Patrocinado", visível e lido por leitor de tela; separado do editorial |

Sem decisão, o banner não existe e nenhuma tarefa do redesign depende dele
(P-107).

### 6.3 Outras

- **"+" na sacola (Q-10606).** A sacola é por loja (`features/carrinho`).
  Recomendado manter o cartão levando ao produto na loja; adicionar direto
  pede escolher variações e adicionais (card #109) e criaria sacola de várias
  lojas.
- **"Seguir loja" (Q-10607).** Hoje favoritar loja cumpre o papel. Recomendado
  manter, sem função nova.
- **Coordenadas na URL (Q-10611).** Hoje `lat`, `lng` e `ordem=distancia` ficam
  no endereço. Alternativas: manter (resultado compartilhável, mas vaza o local
  em histórico, link e log) ou guardar só no aparelho e enviar por cabeçalho
  ou corpo. Recomendado tirar da URL e do log; mudança de rota de servidor e
  de testes pede decisão.
- **Desempate da ordem (Q-10612).** Hoje a paginação é por deslocamento. Um
  produto publicado entre duas leituras pode repetir ou pular item (a tela só
  tira repetidos pela chave). Recomendado desempate por `publicadoEm` e depois
  `id`; paginação por cursor é outra decisão e fica fora.

## 7. Estados que o #114 deve cruzar

| Estado                          | Critério do #106 | Comportamento                                                            |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------ |
| Sem stories                     | AC-10624         | Faixa e título somem, sem espaço em branco                               |
| Sem produtos publicados         | AC-10625         | Aviso curto com caminho útil, sem cartão de exemplo                      |
| Servidor de lojas fora do ar    | AC-10626         | "O feed não carregou" com "Tentar de novo"; topo do #105 continua usável |
| Uma seção falha, as outras não  | AC-10605         | A seção com problema some ou mostra "não carregou"                       |
| Visitante sem conta             | AC-10612         | Convite curto ou seção ausente; nenhum pedido de dados de conta          |
| Sessão vencida                  | AC-10614         | Pede para entrar de novo, sem estrelas falsas                            |
| Sem localização                 | AC-10616         | Sem distância; aviso de ordem por relevância                             |
| Lista de segmentos não carregou | AC-10608         | Só "Tudo" ou some; busca e feed seguem                                   |
| Carga da próxima página falhou  | AC-10622         | "Tentar de novo"; no fim, "não há mais publicações"                      |
| Carregamento inicial            | AC-10605         | Esqueleto por seção (`loading.tsx` de produtos), sem salto de layout     |

## 8. Donos de arquivo e fila

Vale quando houver autorização de implementação (uma tarefa após a outra, na
pasta principal, sem worktree).

| Arquivo ou pasta                                                                   | Dono ou fila                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------- |
| `app/(explorar)/explorar/page.tsx`, `_dados.ts`, `acoes.ts`, `produtos/`, `lojas/` | #106                                         |
| `app/(explorar)/explorar/layout.tsx`                                               | #105 → #106                                  |
| `features/feed/*` (exceto `feed.css`)                                              | #106                                         |
| `features/feed/feed.css`                                                           | #106 → #107                                  |
| `packages/ui/styles/stories.css`                                                   | #104 → #106 → #112                           |
| `server/feed.ts`, `server/feed-social.ts`                                          | #106                                         |
| `app/sitemap.ts`, `lib/routes.ts`, `features/tutorial/passos.ts`                   | #106 só se a rota mudar; o dono pede ao #105 |
| `features/usuario/*` (botão de sair)                                               | #105 (e #111 na conta)                       |
| Peças `Chip`, `Abas`, `Gaveta`, `Cartao`, ícones                                   | #104 cria; o #106 usa                        |

## 9. Estratégia de testes e limites do `verify`

- Arquivos `*.onp.test.ts` ou `*.onp.test.tsx` em `apps/web/tests/`, com título
  `it("[CA-n] @spec:AC-106xx …")`. Os testes legados do feed continuam como
  estão e não contam como prova.
- Projeto vitest `web` (jsdom): composição por largura, estados vazio e erro,
  segmentos, estrelas em várias páginas (ação do servidor com leitura falsa e
  `authorization` conferida), visitante sem chamada a `/v1/conta/*`,
  arredondamento, `no-store`, textos proibidos do Stitch, ausência de blocos "A
  decidir".
- **O que o `verify` não prova.** O isolamento de verdade entre contas (RLS em
  `favorite_stores` e `store_visits`) só se prova no projeto `api-int`
  (`apps/api/tests/favoritos-e-recentes.test.ts` é o ponto de partida), que o
  `onp-spec verify` não roda. O AC-10611 fica com prova parcial até o #114
  propor o segundo comando (ASM-10604).
- Prova visual por largura (344, 390, 768, 1024 e 1280), axe e teclado na
  jornada são do #114 (e2e, fora do `verify`).
- A auditoria acusa "critério sem teste" até a implementação; isso é esperado.

## 10. Riscos

| Risco                                                                        | Mitigação                                                             |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Cache do Next guardar resposta com sessão e servir a outra conta             | `no-store` obrigatório e teste que confere `authorization` (AC-10611) |
| Estrelas falsas nas páginas 2 em diante                                      | Token no servidor também em `maisPosts` (AC-10613)                    |
| Seção lenta segurar a página inteira (hoje 5 leituras em paralelo, 5 s cada) | Seções independentes e carga progressiva (AC-10605)                   |
| Link salvo de `/explorar` quebrar                                            | Alternativa A (recomendada) ou redirecionamento mantido (AC-10629)    |
| Dado do Stitch virar conteúdo de produção                                    | AC-10628 e AC-11421 do #114                                           |
| Banner patrocinado sem rótulo                                                | Fora até decidir; se aprovado, rótulo obrigatório (Q-10604)           |
| Coordenadas em URL e log                                                     | AC-10618 e pergunta Q-10611                                           |
| Conflito de `feed.css` e `stories.css` com #107 e #112                       | Filas da seção 8                                                      |
