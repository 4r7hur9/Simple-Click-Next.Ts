# Design: Planejamento do redesign Stitch

> feature: stitch-planejamento · card #103 · 05/11/2026

Documento de planejamento. Nada aqui está aprovado para implementação: as
decisões do dono do produto estão nas perguntas Q-10301…Q-10306 da spec.

## 1. Origem da referência

- Arquivo: `/Users/stargrupo/Downloads/stitch_redesign_e_commerce_simpleclick.zip`
  (fora do repositório).
- sha256: `607ec82649e594a33b6cef5f992482dd5c94f86d6e54d71f482fc235437bb589`.
- Conteúdo: 7 pares `code.html` + `screen.png` e `kinetic_retail_dark/DESIGN.md`.
- O export é **referência visual**, não instrução nem dado real. Ele usa
  Tailwind por CDN, Material Symbols e imagens geradas em googleusercontent
  (proibidos pelo P-103), tem CNPJ, telefone, endereço e cupom de exemplo e
  números inventados (notas, avaliações, estoques, prazos, "10x sem juros",
  garantias). Nada disso é copiado (P-105).
- Erros do próprio export, que não devem ser reproduzidos: o catálogo mobile
  tem o título "Detalhes do Produto"; há `<main>` dentro de `<main>` no
  catálogo desktop; o avatar transborda o topo em 390px; contagens e totais
  divergem entre telas.

| Pasta no ZIP                               | Tela                        | Formato    |
| ------------------------------------------ | --------------------------- | ---------- |
| `simpleclick_in_cio_descoberta`            | Início e descoberta         | celular    |
| `simpleclick_desktop_in_cio_descoberta`    | Início e descoberta         | computador |
| `vitrine_da_loja_universokar`              | Vitrine da loja             | celular    |
| `vitrine_da_loja_desktop_universokar`      | Vitrine da loja             | computador |
| `cat_logo_de_produtos_universokar`         | Catálogo da loja            | celular    |
| `cat_logo_de_produtos_tablet_universokar`  | Catálogo da loja            | tablet     |
| `cat_logo_de_produtos_desktop_universokar` | Catálogo com sacola lateral | computador |

## 2. Mapa de rotas (código atual → tela do Stitch)

Caminhos relativos a `apps/web/src/`.

| Rota atual                                     | Componente principal                                  | Tela do Stitch             | Card |
| ---------------------------------------------- | ----------------------------------------------------- | -------------------------- | ---- |
| `/explorar` → `/explorar/produtos`             | `features/feed/TelaDoFeed.tsx` (`TelaDoFeed`)         | Início e descoberta        | #106 |
| `/explorar/lojas`                              | `features/feed/FeedDeLojas.tsx` (`FeedDeLojas`)       | Início (lojas)             | #106 |
| `/loja/[slug]`, `/loja/[slug]/sobre`           | `app/(loja)/loja/[slug]/TelaDaLoja.tsx`               | Vitrine da loja            | #107 |
| `/loja/[slug]/cardapio`                        | `app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx`  | Catálogo                   | #108 |
| `/loja/[slug]/produto/[id]`                    | `TelaDoCatalogo` + `features/produto/JanelaDoProduto` | sem mockup                 | #109 |
| `/loja/[slug]/carrinho`, `/checkout`           | `TelaDoCatalogo` + `features/carrinho`, `checkout`    | sacola lateral (desktop)   | #110 |
| `/loja/[slug]/pedido/[token]`                  | `features/pedido/AcompanhamentoDoPedido`              | sem mockup                 | #111 |
| `/conta`, `/conta/favoritos`, `/conta/pedidos` | `features/conta/*`                                    | destinos da barra inferior | #111 |
| `/painel/*`                                    | `features/painel*`, `dashboard`, `config`…            | sem mockup                 | #112 |
| `/admin/*`                                     | `features/admin*`                                     | sem mockup                 | #113 |
| `/`                                            | `features/landing/LandingDoSimpleClick`               | fora do redesign (Q-10303) | —    |

Moldura da loja: `app/(loja)/loja/[slug]/layout.tsx` (`TemaDaMarca` com a cor
de destaque da loja, `LateralDaSessao`, `RodapeLegal`, `JanelaDeAcesso`).

## 3. Cor, tipografia e tema

**Cor (decisão D-4 do plano, princípio P-102).** O verde oficial é
`#B7FF00`: `--marca-verde-click` e `--cor-primaria` em
`packages/ui/styles/theme.css`, `PALETA_OFICIAL` em `packages/ui/src/tokens.ts`
e `COR_DE_DESTAQUE_PADRAO` em `packages/contracts/src/tema.ts`, com o teste de
sincronia `packages/ui/tests/tokens.test.ts`. O Stitch é inconsistente:

- o front matter do DESIGN.md diz `primary: #ffffff` e
  `primary-container: #b2f800`, mas o texto do guia diz que o primário é
  `#B7FF00`;
- o HTML pinta o verde com `primary-container` (`#b2f800`) e os brilhos usam
  `rgba(183,255,0)` no celular e `rgba(178,248,0)` no computador;
- os botões verdes usam texto verde-oliva (`#4d6e00`), de contraste baixo,
  enquanto o guia manda texto `#0B0F0D`.

Resultado: o redesign usa `#B7FF00` e os tokens `--cor-*`/`--marca-*`
existentes; os papéis do Stitch (surface, container, on-surface…) servem só
de mapa para o #104; texto sobre verde é escuro (P-106). A cor de destaque
por loja (`TemaDaMarca`, `marcaDaLoja`) continua valendo dentro da vitrine.

**Tipografia.** Hoje: Space Grotesk (títulos) e Inter (texto) via
`next/font` em `app/layout.tsx`. Stitch: Plus Jakarta Sans. Decisão do
usuário (Q-10302); o #104 especifica as duas alternativas.

**Tema.** O Stitch é só escuro; o site hoje segue o sistema e aceita
`data-tema="claro"`/`"escuro"`. Decisão do usuário (Q-10304).

**Símbolos.** O guia separa curtir (✦) de favoritar (★). O código já separa
as duas ações (`feed/MidiaDoPost.tsx`, `feed/BotaoFavoritar.tsx`); o #104
define os ícones no pacote de ícones do projeto, sem Material Symbols.

## 4. Matriz das telas

Situação: **E** existe · **P** parcial · **N** nova · **NC** não confirmada
(precisa de verificação ou decisão no card) · **AD** a decidir (card
próprio) · **FORA** fora de escopo. Evidência: caminhos em `apps/web/src/`
salvo indicação. Telas: IM/ID início celular/computador, VM/VD vitrine,
CM/CT/CD catálogo celular/tablet/computador.

### 4.1 Peças comuns

| Bloco                                                                     | Telas      | Situação | Evidência / observação                                                                                                                                                | Card |
| ------------------------------------------------------------------------- | ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Topo celular (marca, cidade, busca, sacola, avatar)                       | IM, VM     | P        | barra do feed `features/feed/BarraDoFeed.tsx`; moldura da loja `(loja)/loja/[slug]/layout.tsx`                                                                        | #105 |
| Seletor de cidade/endereço no topo                                        | IM, ID     | NC       | não há seletor de endereço global; é peça do topo (#105); o #106 só consome o estado com ou sem localização (feed ordena "mais perto" em `features/feed/consulta.ts`) | #105 |
| Topo computador com abas (Início, Lojas, Favoritos, Pedidos)              | ID, VD, CD | P        | navegação atual por rotas `/explorar/*` e `/conta/*`                                                                                                                  | #105 |
| Faixa "Entrega Flash • Suporte 24h"                                       | ID, VD, CD | FORA     | promessa inventada (P-105)                                                                                                                                            | —    |
| Barra de navegação inferior (Explorar, Lojas, Favoritos, Pedidos, Perfil) | IM, VM     | N        | nenhuma barra inferior no código                                                                                                                                      | #105 |
| Rodapé com colunas e links legais                                         | ID, VD, CD | E        | `features/legal/RodapeDoSimpleClick.tsx`, `RodapeLegal`                                                                                                               | #105 |
| Rodapé: "Carteira & Cupons"                                               | ID, VD, CD | AD       | cupom não existe                                                                                                                                                      | #119 |
| Rodapé: "Programa Fidelidade"                                             | ID, VD, CD | AD       | fidelidade não existe                                                                                                                                                 | #125 |
| Rodapé: "Rastreamento"                                                    | ID, VD, CD | E        | `/conta/pedidos`, `features/pedido/AcompanhamentoDoPedido.tsx`                                                                                                        | #105 |
| Rodapé: "Cadastrar Estabelecimento"                                       | ID, VD, CD | E        | `/vender` → `/cadastrar?tipo=dono` (`features/auth/CadastroDeDono.tsx`)                                                                                               | #105 |
| Rodapé: CNPJ e razão social de exemplo                                    | ID, VD, CD | FORA     | dado fictício (P-105)                                                                                                                                                 | —    |
| Curtir ✦ com contador                                                     | todas      | E        | `features/feed/MidiaDoPost.tsx`, `features/feed/Post.tsx`                                                                                                             | #104 |
| Favoritar ★ produto e loja                                                | todas      | E        | `features/feed/BotaoFavoritar.tsx`, `/conta/favoritos`                                                                                                                | #104 |
| Aviso flutuante (toast) de confirmação                                    | VM, VD     | N        | não existe peça de toast em `packages/ui`                                                                                                                             | #104 |
| Selo "loja aberta / fecha às…"                                            | todas      | E        | `features/vitrine/SeloDeStatus.tsx`; horários em `features/config/FormularioHorario`                                                                                  | #104 |
| Selo "loja verificada / certificada / homologada"                         | todas      | AD       | não existe                                                                                                                                                            | #118 |
| Nota ★ e número de avaliações                                             | todas      | AD       | não existe                                                                                                                                                            | #117 |

### 4.2 Início e descoberta (IM, ID) — card #106

| Bloco                                                       | Telas  | Situação | Evidência / observação                                                                   | Card |
| ----------------------------------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------- | ---- |
| Busca "O que procura hoje?"                                 | IM, ID | E        | `features/feed/BarraDoFeed.tsx`, `consulta.ts` (`busca`)                                 | #106 |
| Botão de filtros rápidos                                    | IM     | P        | filtros do feed em `consulta.ts` (categoria, entrega, ordenação)                         | #106 |
| Stories / "Novidades e Flashes"                             | IM, ID | E        | `features/feed/Stories.tsx` (`FileiraDeStories`, `VisualizadorDeStories`)                | #106 |
| Chips de segmento (ramos de loja)                           | IM, ID | E        | categorias por tipo de negócio no feed (`consulta.ts`)                                   | #106 |
| Lojas favoritas e recentes                                  | IM, ID | E        | `features/feed/FeedDePosts.tsx` (`useLojasFavoritas`), `features/conta/LojasDaConta.tsx` | #106 |
| Cartão de loja: capa, logo, nome, aberta                    | IM, ID | E        | `features/feed/Cartoes.tsx` (`CartaoDeLoja`)                                             | #106 |
| Cartão de loja: prazo e taxa de entrega ("45 min • Grátis") | IM, ID | NC       | não há prazo estimado; taxa é por bairro (`features/config/FormularioEntrega`)           | #106 |
| Banner principal (hero) com loja em destaque                | ID     | P        | banner rotativo só dentro da loja (`features/vitrine/BannersPromocionais.tsx`)           | #106 |
| Filtros do banner: "Mais vendidos"                          | ID     | AD       | não existe ranking público                                                               | #124 |
| Filtros do banner: "Lojas 4.8+"                             | ID     | AD       | depende de avaliações                                                                    | #117 |
| Filtros do banner: "Revendas oficiais"                      | ID     | AD       | depende de selos                                                                         | #118 |
| Filtros do banner: "Entrega Flash 30m"                      | ID     | FORA     | promessa de prazo inventada                                                              | —    |
| Grade "Destaques e Ofertas"                                 | IM, ID | P        | feed de produtos em posts (`features/feed/FeedDePosts.tsx`, `Post.tsx`)                  | #106 |
| Cartão de produto: preço "de" riscado                       | IM, ID | P        | já usado no feed (`features/feed/Cartoes.tsx`, `Post.tsx`)                               | #106 |
| Cartão de produto: preço de atacado ("12+ un")              | IM, ID | E        | `features/produto/TabelaDoAtacado.tsx`, `features/carrinho/atacado-na-linha.ts`          | #106 |
| Cartão de produto: botão "+" direto na sacola               | IM, ID | NC       | hoje adicionar acontece dentro da loja; carrinho é por loja                              | #106 |
| Selos "TOP OFERTA", "Em alta", "Alta demanda"               | IM, ID | AD       | não existe ranking                                                                       | #124 |
| Abas "Mais pedidos / Promoção atacado / Recentes"           | ID     | P        | ordenações do feed em `consulta.ts`; "mais pedidos" depende do #124                      | #106 |
| Post de dica em texto ("Dicas dos Especialistas")           | IM, ID | AD       | `FeedPost` é post de produto; texto livre é o #116                                       | #116 |
| Post: comentários, compartilhar, salvar                     | IM, ID | E        | `features/feed/GavetaDeComentarios.tsx`, `Post.tsx` (`compartilhar`)                     | #106 |
| Post: "Seguir loja"                                         | ID     | P        | favoritar loja cumpre o papel hoje (`BotaoFavoritar`)                                    | #106 |
| Texto técnico automotivo e "km de troca"                    | IM, ID | FORA     | conteúdo do exemplo; usar posts reais das lojas                                          | —    |
| Faixa de benefícios: "Acompanhe pelo WhatsApp"              | ID     | E        | `features/checkout/EnvioWhatsApp.tsx`, `features/pedido/BotaoJaEnviei.tsx`               | #106 |
| Faixa de benefícios: "Sem taxas ocultas / preço de balcão"  | ID     | FORA     | promessa inventada                                                                       | —    |

### 4.3 Vitrine da loja (VM, VD) — card #107

| Bloco                                             | Telas  | Situação | Evidência / observação                                                                         | Card |
| ------------------------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------- | ---- |
| Capa com degradê e selo "aberta agora"            | VM, VD | E        | `features/vitrine/CapaDaVitrine.tsx`, `SeloDeStatus.tsx`                                       | #107 |
| Compartilhar a loja                               | VM, VD | N        | compartilhar só existe no feed (`features/feed/Post.tsx`)                                      | #107 |
| Logo, nome e descrição da loja                    | VM, VD | E        | `features/loja/ApresentacaoDaLoja.tsx`, `features/config/FormularioAparencia.tsx`              | #107 |
| Favoritar a loja                                  | VM, VD | E        | `TelaDaLoja.tsx` (`favorita`), `features/feed/BotaoFavoritar.tsx`                              | #107 |
| Contador público de favoritos ("1.2k")            | VM, VD | NC       | contagem pública não confirmada                                                                | #107 |
| Botão de WhatsApp da loja                         | VM, VD | E        | `features/vitrine/CapaDaVitrine.tsx`, `features/loja/SobreDaLoja.tsx`                          | #107 |
| Nota, avaliações e aba "Avaliações"               | VM, VD | AD       | não existe                                                                                     | #117 |
| Selo "verificada / certificada"                   | VM, VD | AD       | não existe                                                                                     | #118 |
| Botão "Ver catálogo completo (N itens)"           | VM, VD | P        | entrada para `/loja/[slug]/cardapio` (`features/loja/EntradaDaLoja.tsx`); contagem a confirmar | #107 |
| Cartões de entrega/retirada, endereço e pagamento | VM, VD | E        | configs `FormularioEntrega`, `FormularioPagamento`; endereço da loja                           | #107 |
| "Cartão até 10x sem juros", "boleto a prazo"      | VM, VD | AD       | parcelamento não existe                                                                        | #126 |
| "NF-e inclusa", "Compra 100% protegida"           | VD     | FORA     | promessa sem base no produto                                                                   | —    |
| Mapa "Ver rota"                                   | VD     | NC       | não há mapa; um link externo de rota é decisão do card                                         | #107 |
| Aba "Publicações"                                 | VM, VD | E        | `features/feed/PostsDaLoja.tsx`                                                                | #107 |
| Aba "Sobre a loja e horários"                     | VM, VD | E        | `features/loja/SobreDaLoja.tsx`, `features/loja/sobre/`                                        | #107 |
| Aba "Garantia & Trocas"                           | VM     | NC       | não há campo de política de troca; pode virar texto do "Sobre"                                 | #107 |
| Aba "Mais vendidos"                               | VM, VD | AD       | depende de ranking                                                                             | #124 |
| Carrossel "Destaques desta loja"                  | VM, VD | E        | `features/vitrine/Destaques.tsx`                                                               | #107 |
| Grade "Peças recomendadas" com parcelas           | VD     | P        | grade de produtos `features/vitrine/GradeDeProdutos.tsx`; parcelas = #126                      | #107 |
| Linha "Compatível com …" nos cartões              | VM, VD | FORA     | compatibilidade veicular (P-104)                                                               | —    |
| Cartão "Envie placa ou chassi no WhatsApp"        | VM     | FORA     | substituir por "Fale com a loja no WhatsApp" (genérico)                                        | #107 |
| "Plantão técnico" com campo de placa              | VD     | FORA     | substituir por "Fale com a loja no WhatsApp" (genérico)                                        | #107 |
| "Despacho após validação do chassi"               | VD     | FORA     | P-104                                                                                          | —    |

### 4.4 Catálogo (CM, CT, CD) — card #108

| Bloco                                                     | Telas      | Situação | Evidência / observação                                                              | Card |
| --------------------------------------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------- | ---- |
| Topo com voltar e cabeçalho curto da loja                 | CM, CT     | P        | topo do catálogo em `packages/ui/styles/vitrine.css`, `TelaDoCatalogo.tsx`          | #108 |
| Subcabeçalho da loja (computador)                         | CD         | P        | idem; dados de nota e prazo seguem 4.1                                              | #108 |
| Abas da loja (Vitrine, Categorias, Ofertas, Coleções)     | CT         | P        | "Coleções" = favoritos (`/conta/favoritos`); "Ofertas" depende de preço "de"        | #108 |
| Busca de produto                                          | CM, CT, CD | E        | `features/vitrine/BuscaProduto.tsx`, `BarraDeCatalogo.tsx`                          | #108 |
| Busca "por código OEM / chassi"                           | CM, CT, CD | FORA     | texto genérico "buscar produto"; código do produto pode existir sem tema automotivo | #108 |
| Ler código de barras pela câmera                          | CM, CT     | AD       | não existe                                                                          | #123 |
| Chips de categoria                                        | CM, CT     | E        | `features/vitrine/AbasDeCategoria.tsx`                                              | #108 |
| Contagem de itens por categoria                           | CM, CT, CD | NC       | contagem não confirmada no contrato da vitrine                                      | #108 |
| Ordenar                                                   | CM, CD     | E        | contrato `packages/contracts/src/vitrine.ts` (relevância, menor e maior preço, A-Z) | #108 |
| Ordenar por "maior desconto atacado" e "lançamentos"      | CD         | NC       | não existem no contrato                                                             | #108 |
| Filtro "marcas" e filtros técnicos                        | CM, CD     | P        | filtro por especificação da categoria (`features/vitrine/FiltroEspecificacao.tsx`)  | #108 |
| Filtro "em estoque / pronta entrega"                      | CM, CD     | NC       | estoque existe no painel; filtro do cliente não                                     | #108 |
| Filtro "preço atacado disponível"                         | CD         | NC       | atacado existe; filtro não                                                          | #108 |
| Faixa de preço (mínimo e máximo)                          | CD         | N        | só existe no painel (`features/painel-catalogo/ListaProdutos.tsx`)                  | #108 |
| Barra lateral de filtros (computador)                     | CD         | P        | filtros atuais ficam na barra única do catálogo                                     | #108 |
| "Compatibilidade rápida" (seletor de veículo)             | CD         | FORA     | P-104                                                                               | —    |
| Faixa "Veículo selecionado / garagem ativa"               | CT         | FORA     | P-104                                                                               | —    |
| Cartão em lista (celular) e em grade (tablet, computador) | CM, CT, CD | E        | `features/vitrine/CartaoDeProduto.tsx`, `GradeDeProdutos.tsx`                       | #108 |
| Cartão: preço varejo e atacado                            | CM, CT, CD | E        | `features/produto/TabelaDoAtacado.tsx`, `SeloDePreco.tsx`                           | #108 |
| Cartão: quantidade −/+ no próprio cartão                  | CM, CT, CD | NC       | hoje a quantidade fica na janela do produto (`BotaoAdicionar`)                      | #108 |
| Cartão: "Escolher volume" (variações)                     | CM, CT, CD | E        | abre o produto: `features/produto/MatrizDeVariacao.tsx`, `SelecaoDeOpcoes.tsx`      | #109 |
| Cartão esgotado                                           | CM, CT, CD | E        | `features/vitrine/CartaoEsgotado.tsx`                                               | #108 |
| "Previsão de chegada" no esgotado                         | CM         | NC       | não há data de reposição                                                            | #120 |
| "Avise-me quando chegar"                                  | CM, CT, CD | AD       | não existe                                                                          | #120 |
| Linha de estoque ("142 em estoque")                       | CM, CD     | NC       | estoque existe; exibir para o cliente é decisão do card                             | #108 |
| "Garantia de 6 meses" no cartão                           | CD, CT     | FORA     | promessa inventada                                                                  | —    |
| Dicas de busca (sanfona)                                  | CM         | N        | genérico, sem "modelo + ano"; `Sanfona` existe em `packages/ui`                     | #108 |
| Faixa "Nota fiscal / tirar dúvida técnica"                | CT         | FORA     | trocar por "Fale com a loja" se o card quiser                                       | —    |
| Rodapé da loja "Powered by SimpleClick"                   | CT         | P        | `RodapeLegal` na moldura da loja                                                    | #105 |

### 4.5 Sacola e fechamento (CM, CT, CD) — card #110

| Bloco                                  | Telas  | Situação | Evidência / observação                                                               | Card |
| -------------------------------------- | ------ | -------- | ------------------------------------------------------------------------------------ | ---- |
| Barra fixa da sacola (itens e total)   | CM, CT | E        | `features/carrinho/SacolaFlutuante.tsx`, `CarrinhoFlutuante.tsx`                     | #110 |
| "Economia de atacado" na barra         | CT     | P        | desconto de atacado já é calculado (`carrinho/atacado-na-linha.ts`)                  | #110 |
| Sacola lateral fixa (computador)       | CD     | P        | gaveta `features/carrinho/GavetaCarrinho.tsx`                                        | #110 |
| Itens com miniatura, remover e −/+     | CD     | E        | `features/carrinho/LinhaCarrinho.tsx`                                                | #110 |
| Campo de cupom                         | CD     | AD       | não existe                                                                           | #119 |
| Taxa de entrega                        | CD     | E        | por bairro (`features/checkout/FechamentoDaCompra.tsx`, `FormularioEntrega`)         | #110 |
| "Previsão de entrega: hoje até 18:00"  | CD     | NC       | não há prazo estimado                                                                | #110 |
| "Fechar pedido pelo WhatsApp"          | CD, CT | E        | `features/checkout/EnvioWhatsApp.tsx`                                                | #110 |
| Selos "Compra segura", "PIX ou cartão" | CD     | P        | formas reais em `features/checkout/SeletorDePagamento.tsx`; sem promessa de proteção | #110 |
| "Checar chassi" com atendente          | CT     | FORA     | P-104                                                                                | —    |

### 4.6 Áreas sem mockup

| Área                                                                                        | Situação | Evidência                                                                                                                                                                                             | Card |
| ------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Detalhe do produto (fotos, vídeo, variações, adicionais)                                    | E        | `features/produto/JanelaDoProduto.tsx`, `DetalheDoProduto.tsx`, `MatrizDeVariacao.tsx`, `SelecaoDeOpcoes.tsx`                                                                                         | #109 |
| Favoritos, pedidos e perfil do cliente                                                      | E        | `features/conta/*` (`VisaoGeralDaConta`, `MeusPedidos`, `LojasDaConta`)                                                                                                                               | #111 |
| Painel do lojista (criar loja, aparência, atendimento, produtos, pedidos, clientes, equipe) | E        | `features/auth/CadastroDeDono.tsx`, `features/config/*`, `features/painel-catalogo/*`, `features/painel-pedidos/QuadroKanban.tsx`, `features/painel-clientes/*`, `features/equipe/PainelDaEquipe.tsx` | #112 |
| Administração da plataforma                                                                 | E        | `features/admin/*`, `features/admin-dashboard/*`                                                                                                                                                      | #113 |
| Validação visual, acessibilidade e regressão                                                | —        | `e2e/specs/a11y-vitrine.spec.ts`, `teclado-vitrine.spec.ts` (legado)                                                                                                                                  | #114 |

### 4.7 Funções opcionais encontradas (todas "A decidir")

| Função                                 | Onde aparece no Stitch                | Card |
| -------------------------------------- | ------------------------------------- | ---- |
| Blog com artigos e dicas               | posts "Dicas dos Especialistas"       | #115 |
| Posts de texto livre no feed           | post de dica em texto                 | #116 |
| Avaliações e reputação                 | notas ★, aba "Avaliações", "4.8+"     | #117 |
| Selos de loja verificada               | "verificada", "Oficial", "Homologada" | #118 |
| Cupons e carteira de cupons            | campo de cupom, rodapé                | #119 |
| Avise-me quando voltar ao estoque      | cartão esgotado                       | #120 |
| Busca lendo código pela câmera         | botão de leitor na busca              | #123 |
| Mais vendidos, em alta, recomendações  | selos, abas e filtros                 | #124 |
| Programa de fidelidade                 | rodapé                                | #125 |
| Parcelamento, boleto e novas condições | "10x sem juros", "boleto a prazo"     | #126 |

## 5. Jornada do dono da loja (referência para #112)

| Passo                                                | Onde está hoje                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Criar conta e loja                                   | `/vender` → `/cadastrar?tipo=dono` (`features/auth/CadastroDeDono.tsx`); outra loja em `/escolher-loja/nova` |
| Aguardar aprovação                                   | `features/aprovacao/TelaDeAprovacao.tsx` (loja em análise)                                                   |
| Identidade (logo, capa, cor, descrição)              | `/painel/aparencia` (`features/config/FormularioAparencia.tsx`)                                              |
| Atendimento (horários, entrega, pagamento, mensagem) | `/painel/config/*` (`FormularioHorario`, `FormularioEntrega`, `FormularioPagamento`, `EditorDeMensagem`)     |
| Produtos, categorias, variações, opções, estoque     | `/painel/produtos`, `/painel/categorias`, `/painel/variacoes`, `/painel/opcoes`, `/painel/estoque`           |
| Publicar                                             | botão "Salvar e publicar" na aparência + aprovação do admin                                                  |
| Pedidos                                              | `/painel/pedidos` (`features/painel-pedidos/QuadroKanban.tsx`), pedido manual                                |
| Clientes e equipe                                    | `/painel/clientes` (`features/painel-clientes/*`), `/painel/equipe`                                          |
| Feed, stories e comentários                          | `/painel/feed`, `/painel/stories`, `/painel/comentarios`                                                     |

## 6. Ondas e ordem dos cards

As dependências abaixo já estão no board; nenhuma depende de card "A decidir".

- **Onda 0**: #103 (este card).
- **Onda 1 — experiência do cliente (com mockup)**: #104 → #105 → (#106, #107
  e #111 podem especificar juntos) → #108 → #109 → #110 → #114.
- **Onda 2 — sem mockup, proposta visual própria**: #112 e #113, depois do
  #104 (Q-10301 decide se entram).
- **Trilha "A decidir"**: #115–#120 e #123–#126 só especificam. Até a
  decisão (Q-10305), o bloco visual correspondente fica oculto e nenhum card
  do redesign depende deles (P-107).

## 7. Donos de arquivo para a implementação futura

Vale quando houver autorização de implementação. Cada arquivo tem um dono ou
uma fila explícita; a execução é **uma tarefa após a outra**, na pasta
principal, sem worktrees e sem o executor paralelo do motor.

| Arquivo ou pasta                                                                                                                              | Dono ou fila                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `packages/ui/styles/theme.css`, `packages/ui/styles/componentes.css`                                                                          | #104                                              |
| `packages/ui/src/tokens.ts`, `packages/ui/src/index.ts`, `packages/ui/src/icones.ts`                                                          | #104                                              |
| `apps/web/src/app/tokens.css`, `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`                                                  | #104                                              |
| Peças novas da onda 1 em `packages/ui` (toast, barra inferior, ícone de compartilhar)                                                         | #104 cria; os outros só usam                      |
| `apps/web/src/app/(loja)/loja/[slug]/layout.tsx`, rodapés, navegação                                                                          | #105                                              |
| `apps/web/src/features/feed/*` (exceto `feed.css`)                                                                                            | #106                                              |
| `apps/web/src/app/(explorar)/explorar/page.tsx`, `_dados.ts`, `acoes.ts`, `produtos/`, `lojas/`                                               | #106                                              |
| `apps/web/src/server/feed.ts`, `apps/web/src/server/feed-social.ts`                                                                           | #106                                              |
| `apps/web/src/app/(explorar)/explorar/layout.tsx` (moldura com `LateralDaSessao` e `RodapeLegal`)                                             | #105 → #106                                       |
| `apps/web/src/features/feed/feed.css`                                                                                                         | #106 → #107                                       |
| `packages/ui/styles/stories.css`                                                                                                              | #104 → #106 → #112                                |
| `apps/web/src/app/(loja)/loja/[slug]/TelaDaLoja.tsx`, `features/vitrine/CapaDaVitrine.tsx`, `features/loja/*`                                 | #107                                              |
| `packages/ui/styles/vitrine.css`                                                                                                              | #107 → #108 → #111                                |
| `apps/web/src/app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx`                                                                             | #108 → #109 → #110                                |
| `packages/contracts/src/vitrine.ts`                                                                                                           | #108                                              |
| `apps/web/src/features/produto/*`, `packages/ui/styles/produto.css`                                                                           | #109                                              |
| `apps/web/src/lib/produto.ts`, `apps/web/src/server/produto.ts`, `apps/web/src/lib/atacado-na-vitrine.ts`                                     | #109 (o #108 e o #110 só consomem, sem redefinir) |
| `apps/web/src/features/carrinho/*`, `features/checkout/*`, `packages/ui/styles/fechamento.css`                                                | #110                                              |
| `apps/web/src/features/conta/*`, `packages/ui/styles/conta.css`, `packages/ui/styles/usuario.css`                                             | #111                                              |
| `apps/web/src/features/painel*`, `features/config/*`, `features/dashboard/*`, `packages/ui/styles/pedidos.css`, `filtros.css`, `cadastro.css` | #112                                              |
| `apps/web/src/features/admin*`                                                                                                                | #113                                              |
| Testes `*.onp.test.ts(x)` e e2e de regressão                                                                                                  | cada card os próprios; #114 os transversais       |

Regras: #112 e #113 não editam os arquivos do #104; se precisarem de peça
nova, ela entra numa rodada do #104 antes deles. Um card que precise de um
arquivo de outro pede ao dono por `board_message` e espera a vez.

## 8. Critérios de prova

| Critério                     | Como se prova nesta fase                                                         |
| ---------------------------- | -------------------------------------------------------------------------------- |
| AC-10301, AC-10302           | revisão do dono do produto sobre a seção 4                                       |
| AC-10303, AC-10304           | seções 4.7 e 6; dependências do board sem card "A decidir"                       |
| AC-10305, AC-10306           | seção 7 e `.spec/README.md` (proibições)                                         |
| AC-10307                     | tabela de pastas e blocos em `.spec/README.md`                                   |
| AC-10308, AC-10309, AC-10310 | `onp-spec audit --json` sem erro de estrutura, sem teste órfão e com P-102 limpo |

Quando houver autorização de implementação, AC-10307…AC-10310 podem ganhar
testes `*.onp.test.ts` que leem a config, o README e fazem a busca do P-102
(sugestão para o #114). Até lá, a auditoria acusa "critério sem teste" para
esta feature, e isso é esperado (ASM-10303).
