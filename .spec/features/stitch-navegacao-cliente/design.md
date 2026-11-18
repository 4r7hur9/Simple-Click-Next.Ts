# Design: Cabeçalho, navegação móvel e rodapé do cliente

> feature: stitch-navegacao-cliente · card #105 · 09/11/2026

Documento de projeto da spec. Nada aqui está aprovado para implementação: as
decisões do dono do produto estão nas perguntas Q-10501…Q-10510. Caminhos
relativos a `apps/web/src/`, salvo indicação. O **#104** é dono das peças
(`BarraInferior`, `Abas`, `Gaveta`, `AvisoFlutuante`) e dos tokens; este
documento só as usa e pede o que falta.

## 1. Evidências do estado atual

Tudo abaixo foi lido no código em 06/11/2026 (fato), salvo o que está marcado
como inferência.

| Fato                                                                                                      | Onde                                                                                                            |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A navegação comum do cliente é a lateral do usuário: trilho fixo a partir de 64rem, pílula no topo abaixo | `features/usuario/LateralDoUsuario.tsx` (`LateralDoUsuario`), `packages/ui/styles/usuario.css`                  |
| A lateral é montada por um componente de servidor que lê a sessão e, para cliente, monta o tutorial       | `app/_usuario/sessao.tsx` (`LateralDaSessao`)                                                                   |
| Três molduras montam a lateral e o `RodapeLegal`                                                          | `app/(explorar)/explorar/layout.tsx`, `app/(conta)/conta/layout.tsx`, `app/(loja)/loja/[slug]/layout.tsx`       |
| Itens por papel e item ativo por prefixo de rota                                                          | `lib/quem-esta-logado.ts` (`itensDoUsuario`, `itemAtivo`)                                                       |
| O papel vem de `GET /v1/eu`, com tempo limite de 2,5 s; sem sessão vira visitante                         | `server/usuario-da-sessao.ts` (`usuarioDosCookies`, `usuarioDoPedidoAtual`)                                     |
| Telas sem barra: só a TV da loja                                                                          | `lib/quem-esta-logado.ts` (`caminhoSemBarra`), `features/legal/RodapeLegal.tsx` (outra expressão)               |
| As abas Produtos e Lojas moram na página do feed, e o estado ativo vem de `consulta.aba`                  | `features/feed/TelaDoFeed.tsx`, `features/feed/consulta.ts` (`enderecoDoFeed`)                                  |
| Localização: só o botão "Perto de mim"; coordenada em `localStorage` (`sc:feed:local`), sem cidade        | `features/feed/BarraDoFeed.tsx` (`CHAVE_DO_LOCAL`), `features/feed/consulta.ts` (`temLocal`, `arredondarLocal`) |
| Endereço salvo do cliente tem cidade, UF e padrão, mas não tem latitude nem longitude                     | `packages/contracts/src/clientes.ts` (`esquemaDoEnderecoSalvo`)                                                 |
| O consentimento de cookies existe, mas `temConsentimento` não tem nenhum chamador                         | `features/legal/consentimento.ts`                                                                               |
| O carrinho é por loja e fica na sessão; a contagem é uma chamada do navegador                             | `lib/carrinho-do-navegador.ts` (`contarItensDoCarrinho`, `AVISO_DE_CARRINHO_MUDOU`)                             |
| A sacola flutuante só existe no catálogo (cardápio, carrinho, checkout e produto)                         | `features/carrinho/SacolaFlutuante.tsx`, `app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx`                   |
| O retorno após entrar já existe: validador, janela de acesso e links do feed                              | `features/auth/destino-seguro.ts` (`destinoSeguro`, `comDestino`), `features/auth/JanelaDeAcesso.tsx`           |
| Páginas de conta mandam para `/entrar` sem `proximo`                                                      | `app/(conta)/conta/_token.ts` (`tokenOuEntrar`) e as páginas listadas na seção 4                                |
| A verificação em duas etapas reinicia em `/entrar` sem `proximo`                                          | `app/(conta)/entrar/verificacao/page.tsx`                                                                       |
| A regra de fronteira só deixa o servidor importar de `lib/`, contratos e núcleo                           | `packages/config-eslint/fronteiras.js`                                                                          |
| O rodapé em colunas só existe na página inicial e nas páginas legais                                      | `features/legal/RodapeDoSimpleClick.tsx`, `features/legal/PaginaLegal.tsx`                                      |
| A única barra inferior do projeto é a do painel                                                           | `features/painel/MenuLateral.tsx` (`nav` com `aria-label="Atalhos"`)                                            |
| O viewport não tem `viewportFit`. Inferência: no iPhone `env(safe-area-inset-*)` vale 0                   | `app/layout.tsx` (`viewport`)                                                                                   |
| O tutorial do cliente aponta para elementos da lateral                                                    | `features/tutorial/passos.ts`                                                                                   |

Pelo Stitch (lido do ZIP, sem extrair; é referência visual, P-105):

- topo e barra inferior com altura de 4rem e camadas acima do resto;
- no catálogo do celular a barra da sacola **substitui** a barra inferior;
- no computador o topo tem duas fileiras (marca, localização, busca, sacola e
  avatar; depois as abas);
- o rodapé tem colunas com itens que não existem no produto (cupons,
  fidelidade, central de ajuda) e um CNPJ de exemplo. Esses itens não entram.

## 2. Desenho proposto

### 2.1 Topo do cliente

| Parte       | Celular (abaixo de 64rem)                                                            | Computador (64rem ou mais)                            |
| ----------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Marca       | à esquerda, leva a `/explorar`                                                       | à esquerda, leva a `/explorar`                        |
| Localização | botão com o rótulo da seção 5                                                        | o mesmo botão, com o rótulo por extenso               |
| Busca       | só o ícone; leva ao campo do feed                                                    | o ícone, igual ao celular (o campo do feed é do #106) |
| Sacola      | ícone com contagem, só dentro de uma loja                                            | o mesmo                                               |
| Avatar      | abre o menu do papel (seção 2.4); visitante vê "Entrar"                              | o mesmo                                               |
| Abas        | não há; vale a barra inferior                                                        | segunda fileira: Explorar, Lojas, Favoritos, Pedidos  |
| Cor         | só `--cor-primaria*` e `--cor-foco`, que a loja já sobrescreve; `--cor-marca*` nunca | idem                                                  |

Fora do Stitch, o desenho é o mesmo topo nas telas de conta, acompanhamento
do pedido e sobre da loja (ASM-10507). Em `/loja/[slug]` o bloco de identidade
da loja (`ApresentacaoDaLoja`, do #107) fica abaixo do topo; o cabeçalho curto
do cardápio é do #108. O topo não repete o nome da loja.

O topo é uma ilha do navegador (precisa de `usePathname`, `useSearchParams` e
dos eventos da sacola), com os dados do papel e da cidade entregues pelo
servidor. A busca e as abas leem `useSearchParams` para levar os filtros
compatíveis (AC-10525); isso depende de um contrato exportado pelo #106
(montar o endereço do feed preservando filtros e focar o campo).

### 2.2 Qual item fica ativo (um só por rota)

O `itemAtivo` atual compara por prefixo: `/explorar` fica ativo também em
`/explorar/lojas`. A tabela abaixo é o contrato: cada rota ativa um item.

| Rota                                                              | Item ativo | Observação                                          |
| ----------------------------------------------------------------- | ---------- | --------------------------------------------------- |
| `/explorar`, `/explorar/produtos`                                 | Explorar   |                                                     |
| `/explorar/lojas`                                                 | Lojas      | depende da Q-10501                                  |
| `/loja/[slug]`, `/sobre`, `/cardapio`, `/produto/[id]`            | Lojas      | proposta; o Stitch marca "Lojas" na vitrine         |
| `/loja/[slug]/carrinho`, `/checkout`                              | Lojas      | proposta                                            |
| `/loja/[slug]/pedido/[token]`                                     | Pedidos    | acompanhar pedido é "Pedidos"                       |
| `/conta/favoritos`                                                | Favoritos  |                                                     |
| `/conta/pedidos`, `/conta/pedidos/[id]`                           | Pedidos    |                                                     |
| `/conta`, `/conta/dados`, `/conta/enderecos`, `/conta/seguranca*` | Perfil     | no computador é o avatar, que recebe `aria-current` |

### 2.3 Itens por papel (menu do avatar)

Reaproveita `itensDoUsuario` (nenhum item novo). Tabela fixa, com teste
negativo:

| Papel         | Itens (rótulo → rota)                                                                                                 | Nunca recebe                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| visitante     | Explorar → `/explorar`; Entrar → `/entrar`; Criar conta → `/cadastrar`                                                | `/conta/*`, `/painel`, `/admin` |
| cliente       | Explorar; Visão geral → `/conta`; Pedidos; Dados; Endereços; Segurança; Favoritos; Voltar à loja (dentro de uma loja) | `/painel`, `/admin`             |
| dono e equipe | Painel da loja → `/painel`; Ver minha loja; Explorar; Minha conta → `/conta`; Trocar de loja (se houver outras)       | `/admin`                        |
| administrador | Administração → `/admin/lojas`; Auditoria → `/admin/auditoria`; Explorar; Minha conta                                 | —                               |

O papel vem só de `usuarioDoPedidoAtual`, no servidor. A interface não
autoriza nada: `GuardaDoPainel`, `exigirLojaDaPagina` e as guardas de
`/admin` não mudam.

### 2.4 Barra inferior

Usa a `BarraInferior` do #104 (contrato: `itens` com rótulo, `href`, ícone e
ativo; `nav` com `aria-label`; `aria-current="page"`; área segura). Itens:
Explorar, Lojas, Favoritos, Pedidos e Perfil, com as rotas da seção 2.2.

Três necessidades que o contrato do #104 ainda não cobre (Q-10510):

1. item que **age** em vez de navegar: "Entrar" e o visitante em
   Favoritos, Pedidos e Perfil dentro de uma loja abrem a janela de acesso,
   que hoje exige um `<a>` comum com `data-abre-acesso` (e não o `Link` do
   Next); "Perfil" logado pode abrir o menu do avatar;
2. estado **oculta**, para o teclado virtual (AC-10520);
3. o `aria-label` da barra do cliente é próprio (por exemplo "Navegação
   principal"). **Nunca** "Atalhos": `legal.css` (cookies sobem 4,5rem com
   `nav[aria-label="Atalhos"]`) e o tutorial do painel casam com esse nome.

O #105 não estende a peça: pede ao #104 ou monta uma barra própria (Q-10510).

## 3. Barras fixas, camadas e área segura

### 3.1 O que existe hoje (z-index positivos relevantes)

| Elemento                         | Camada | Arquivo                                   |
| -------------------------------- | ------ | ----------------------------------------- |
| Lateral do usuário (trilho)      | 40     | `packages/ui/styles/usuario.css`          |
| Lateral aberta no celular        | 61     | `usuario.css`                             |
| Fundo da lateral                 | 60     | `usuario.css`                             |
| Pílula do topo (rolagem)         | 30     | `usuario.css`                             |
| Atalhos do painel                | 30     | `features/painel/MenuLateral.tsx`         |
| Aviso rápido do produto          | 30     | `packages/ui/styles/produto.css`          |
| Sacola flutuante                 | 20     | `packages/ui/styles/vitrine.css`          |
| Aviso de cookies                 | 15     | `packages/ui/styles/legal.css`            |
| Ação do produto                  | 10     | `produto.css`                             |
| Tutorial, balão, editor de story | 1000   | `tutorial.css`, `info.css`, `stories.css` |

O Stitch usa 50 para topo e barra inferior e 40 para a barra da sacola; esses
números não servem como estão, porque o projeto usa valores bem menores.

### 3.2 Regras propostas

- **Uma barra fixa de baixo por vez** (Q-10502, recomendação A): a barra da
  sacola (#110) e a ação do produto substituem a barra inferior; ao sair,
  ela volta.
- **Quem sobe acima da barra** é decidido por deslocamento, não por camada:
  o cookie, a sacola flutuante e o aviso usam a altura da barra inferior
  (`--altura-da-barra-inferior`) mais a área segura, e o cookie continua
  expondo `--altura-do-aviso-de-cookies`.
- **Variáveis que já existem** e precisam ser reaproveitadas, não renomeadas:
  `--altura-da-barra` (definida em `vitrine.css` e `usuario.css`; usada por
  `vitrine.css` nas linhas 344, 1030 e 2210 e por `produto.css` na 830).
  Como `body:has(.sc-usuario-lateral)` e `.sc-sacola__area` dependem da
  lateral, a Q-10505 muda a lista de seletores a revisar (tarefa T-10508).
- **Níveis de camada** (barra, sacola, aviso, janela) são tokens novos, e o
  dono deles é a Q-10507. Sem eles, a ordem só é garantida por valores soltos.
- **Área segura:** `viewportFit: "cover"` em `app/layout.tsx` é o que faz
  `env(safe-area-inset-*)` valer algo no iPhone. É escopo do #104 ou do #105
  (Q-10507). A constituição P-108 não cobre camadas, então não é argumento.
- **Teclado virtual:** a barra inferior some quando um campo recebe foco e o
  teclado reduz a área visível (`window.visualViewport`), e volta depois.
- **Foco não encoberto:** `scroll-padding-block` do documento soma a altura do
  topo e da barra, para o Tab nunca parar atrás deles (WCAG 2.4.11).
- Conteúdo de página reserva espaço abaixo para a barra (`padding-block-end`
  com a altura da barra mais a área segura).

## 4. Retorno ao destino depois de entrar

### 4.1 Regra única

Hoje há dois validadores: `destinoSeguro` (recusa `//`, `\`, controle, `/api/`,
telas de acesso e mais de 512 caracteres) e `enderecoComRetorno` (só recusa
`//` e o próprio destino). A proposta é **um só**: mover `destinoSeguro`,
`destinoDosParametros` e `comDestino` para `lib/destino-seguro.ts`, deixar a
reexportação em `features/auth/destino-seguro.ts` (a regra de fronteira
impede o servidor de importar de `features/`) e fazer `enderecoComRetorno`
chamá-lo. Casos hostis obrigatórios nos testes: `//evil.com`, `/\evil`,
`%0d%0a`, `/api/x`, `/entrar?proximo=…`, mais de 512 caracteres.

### 4.2 Pontos de saída sem sessão

| Local                                                                   | Hoje                   | Proposto                                        |
| ----------------------------------------------------------------------- | ---------------------- | ----------------------------------------------- |
| `app/(conta)/conta/_token.ts` (`tokenOuEntrar`)                         | `redirect("/entrar")`  | recebe o caminho e usa `comDestino`             |
| `conta/page.tsx` (linha 26), `dados`, `pedidos`, `favoritos`            | `redirect("/entrar")`  | `comDestino("/entrar", caminho da página)`      |
| `conta/enderecos/page.tsx`, `conta/pedidos/[id]/page.tsx` (duas saídas) | `redirect("/entrar")`  | idem, nos dois `redirect`                       |
| `conta/seguranca/page.tsx` (usa `tokenOuEntrar`)                        | via `tokenOuEntrar`    | idem, mantendo `?estado=` fora do destino       |
| `escolher-loja/page.tsx`, `escolher-loja/nova/page.tsx`                 | `redirect("/entrar")`  | `comDestino`                                    |
| `entrar/verificacao/page.tsx` (linhas 42, 71 e 86)                      | recomeça sem `proximo` | mantém `proximo`; `orientarPara` tem prioridade |
| `server/loja-da-pagina.ts`, `app/(painel)/painel/layout.tsx`            | `redirect("/entrar")`  | **fora desta spec** (painel, #112; ASM-10511)   |

Prova estrutural futura: nenhum `redirect("/entrar")` literal em
`app/(conta)`. Cada página passa o próprio caminho, porque layouts do App
Router não conhecem a página filha; para o painel isso exige cabeçalho
interno gravado pelo `proxy.ts`, o que não é escopo daqui.

### 4.3 Rotas com segredo e coordenadas

- Em `/loja/[slug]/pedido/[token]` o token funciona como senha. O `proximo`
  gerado por menu e por `JanelaDeAcesso` (que hoje usa `pathname + search`)
  reduz para `/loja/[slug]` nessas rotas.
- `lat` e `lng` nunca entram no `proximo`.
- O aplicativo não define `Referrer-Policy`; sem ela o endereço da tela de
  entrada vai a qualquer link externo. Q-10508 decide (recomendação: política
  padrão do navegador moderno, `strict-origin-when-cross-origin`, no site
  todo). O dono do `next.config.ts` e do `app/layout.tsx` aplica.

## 5. Localização

O rótulo do topo e a fonte da ordenação são **duas coisas**:

| Situação                                | Rótulo                | Ordem "Mais perto"                   |
| --------------------------------------- | --------------------- | ------------------------------------ |
| Logado, endereço padrão, sem coordenada | cidade, UF            | pede a localização aproximada        |
| Coordenada aproximada autorizada        | "Perto de você"       | usa a coordenada                     |
| Visitante, sem coordenada               | "Definir localização" | pede a localização aproximada        |
| Leitura da cidade falhou ou 401         | "Definir localização" | igual ao visitante, sem redirecionar |

Regras de dados (LGPD, ASM-10504):

- a cidade vem de `GET /v1/conta/enderecos`, lida no servidor, com
  `cache: "no-store"` e tempo limite; ao navegador vão **só** cidade e UF;
  nunca `"use cache"` ou `unstable_cache` sem chave por usuário. Padrão a
  seguir: `server/conta-do-fechamento.ts`;
- `sc:feed:local` só é gravado e lido com `temConsentimento("funcionais")`,
  é regravado arredondado ao ler (`lerConsulta` hoje aceita qualquer
  precisão), apagado ao recusar e ao sair, e só é pedido por ação da pessoa;
- o botão Sair (`LateralDoUsuario` e `UsuarioNoMenu`) chama `limparDadosLocaisDoFeed()`,
  proposta do #106 (`features/feed/limpar-dados-locais.ts`, AC-10619 dele), que
  apaga `sc:feed:local` e os stories vistos do aparelho;
- a Política de Privacidade não cita localização hoje (Q-10509);
- a alternativa C da Q-10503 (geocodificação externa) exigiria proxy no
  servidor, coordenada arredondada, limite de pedidos, contrato com o
  operador, consentimento e revisão de segurança, e uma chave só do servidor.

A extração da leitura de `sc:feed:local` do `BarraDoFeed` para um módulo
comum é feita junto com o #106 (que é dono de `features/feed/*`).

## 6. Sacola no topo

- Só dentro de uma loja (Q-10504, recomendação A).
- A contagem é uma ilha do navegador: `contarItensDoCarrinho(apelido)` com
  `credentials: "include"`, atualizada por `AVISO_DE_CARRINHO_MUDOU`. Nunca no
  servidor: cada leitura regrava o cookie `sc_carrinho` e abre uma transação, e
  o arquivo já avisa que a chamada não pode sair do navegador.
- Fonte única com a `SacolaFlutuante` (que hoje faz a própria busca), para não
  duplicar chamadas; combinar com o #110.
- Abrir: evento `sc:abrir-sacola`, confirmado pelo #110 (dono do evento, AC-11029
  dele). No computador, com a coluna visível, leva o foco ao título da sacola;
  no celular abre o diálogo modal; com a sacola vazia avisa o cliente. Nas páginas da loja sem `CarrinhoFlutuante`
  (`TelaDaLoja`, sobre, acompanhamento) o ícone leva a `/loja/[slug]/carrinho`
  (hipótese; a Q-11010 do #110 pergunta se a sacola entra nessas páginas).

## 7. Rodapé

Proposta enxuta (Q-10506, alternativa A é o que existe): o `RodapeLegal` atual
(termos, privacidade, cookies, LGPD, preferências de cookies e ©). O rodapé em
colunas do Stitch, se escolhido (alternativa C), usa só isto:

| Coluna        | Itens → rota                                                                                    | Existe hoje |
| ------------- | ----------------------------------------------------------------------------------------------- | ----------- |
| Explorar      | Explorar → `/explorar`; Lojas → `/explorar/lojas`; Favoritos → `/conta/favoritos`               | sim         |
| Seus pedidos  | Acompanhar pedidos → `/conta/pedidos`; Minha conta → `/conta`                                   | sim         |
| Para lojistas | Criar minha loja → `/vender` (leva a `/cadastrar?tipo=dono`)                                    | sim         |
| Legal         | Termos de uso, Política de Privacidade, Cookies, LGPD → `ROTAS_LEGAIS`; preferências de cookies | sim         |
| Linha final   | © SimpleClick; "Loja criada com SimpleClick" só dentro da loja (alternativa B)                  | texto novo  |

Não entram: Carteira e Cupons (#119), Programa de Fidelidade (#125), Central
de Ajuda (não existe), "Rastreamento" como rota própria (é `/conta/pedidos`),
CNPJ, razão social, telefone, "Entrega Flash" e "Suporte 24h". As rotas
`/termos` e `/privacidade` não existem; o certo é `/termos-de-uso` e
`/politica-de-privacidade`. `RodapeLegal` é componente do navegador e não lê
e-mail de suporte do ambiente como o `RodapeDoSimpleClick`; se a alternativa C
precisar de e-mail, o rodapé vira componente de servidor. A regra de onde o
rodapé some é a mesma `caminhoSemBarra` (hoje o rodapé usa uma expressão
diferente da do topo).

## 8. Alternativas das perguntas

| Pergunta | Recomendação                                            | Impacto das outras                                                                                 |
| -------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Q-10501  | A: `/explorar/lojas`                                    | B cria página e rota novas (#106 ou #107); C exige guardar a "última loja" (preferência funcional) |
| Q-10502  | A: a barra da página substitui a inferior               | B precisa de duas alturas somadas e reserva dobrada; C mantém a sacola flutuante acima da barra    |
| Q-10503  | A: endereço padrão mais localização aproximada          | B perde a cidade para quem tem endereço; C custa dinheiro e é revisão de segurança própria         |
| Q-10504  | A: sem sacola fora da loja                              | B exige API nova que lê carrinhos de várias lojas fora do isolamento por loja; C idem              |
| Q-10505  | A: o topo e o avatar substituem a lateral               | B mantém duas navegações; C mantém a lateral só para dono, equipe e administração                  |
| Q-10506  | A: rodapé enxuto atual                                  | C cria colunas novas e leva o rodapé a componente de servidor                                      |
| Q-10507  | A: #104 define `viewportFit` e camadas                  | B coloca o #105 em fila depois do #104; C depende do gerente                                       |
| Q-10508  | A: política única no site todo                          | B protege só a entrada; C deixa o endereço de retorno vazar para links externos                    |
| Q-10509  | A: atualizar a política antes                           | B depende só do aviso do botão                                                                     |
| Q-10510  | #104 estende a `BarraInferior` (item como ação, oculta) | montar barra própria duplica a peça e foge do contrato do #104                                     |

## 9. Fila de donos dos arquivos

Pela seção 7 do design do #103. O que não tem dono lá ficou como pedido ao
gerente (ASM-10509). Cada tarefa de `tasks.md` cita o dono ao lado.

| Arquivo ou pasta                                                                        | Dono ou fila                                          |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `app/(loja)/loja/[slug]/layout.tsx`, rodapés, navegação                                 | #105 (§7 do #103)                                     |
| `app/(explorar)/explorar/layout.tsx`, `app/(conta)/conta/layout.tsx`                    | pedido ao gerente; proposta: #105                     |
| `app/(conta)/conta/*` (só as linhas de redirect), `escolher-loja`, `entrar/verificacao` | pedido ao gerente; proposta: #105, em fila com o #111 |
| `features/usuario/*`, `app/_usuario/sessao.tsx`, `features/tutorial/passos.ts`          | pedido ao gerente; proposta: #105                     |
| `packages/ui/styles/usuario.css`                                                        | #111 (§7); #105 em fila depois                        |
| `features/feed/*` (`BarraDoFeed.tsx`, `consulta.ts`)                                    | #106; o #105 só pede o contrato                       |
| `packages/ui/styles/vitrine.css`, `produto.css`                                         | #107 → #108 → #111 e #109; o #105 só pede             |
| `features/carrinho/*`                                                                   | #110; o #105 só pede o evento                         |
| `app/layout.tsx`, `packages/ui/styles/theme.css`                                        | #104; o #105 só pede (Q-10507)                        |
| `packages/ui/styles/legal.css`, `features/legal/*`                                      | #105 (rodapé e cookies acima da barra)                |
| `server/loja-da-pagina.ts`, `app/(painel)/painel/layout.tsx`                            | #112 (fora desta spec)                                |

## 10. Prova futura dos critérios

Os testes usam `*.onp.test.ts(x)` com `[CA-n] @spec:AC-105xx` no título. O
motor só roda vitest (projetos `web` e `unit`). O que depende de medida real
(layout, área segura, teclado virtual, foco encoberto) é e2e ou simulador e
fica com o #114 (Q-11405 do #114 lembra que e2e não conta no `verify`).
Arquivos `*.onp.test.tsx` abaixo são a criar.

| Critério           | O que se prova                                                                                 | Camada e arquivo                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| AC-10501, AC-10503 | tabela rota→item (um ativo), cinco itens, rótulos, `aria-current`                              | vitest `apps/web/tests/navegacao-do-cliente.onp.test.tsx`                 |
| AC-10502           | marca leva a `/explorar`; busca move o foco no feed                                            | vitest, mesmo arquivo                                                     |
| AC-10504           | só uma navegação por largura (CSS declara a quebra de 64rem)                                   | vitest (declaração) + e2e do #114                                         |
| AC-10505, AC-10507 | rótulo por situação; ordem independente do rótulo                                              | vitest `apps/web/tests/localizacao-do-topo.onp.test.tsx`                  |
| AC-10506           | gravação só com consentimento, arredondamento, apagar ao sair e ao recusar                     | vitest, mesmo arquivo                                                     |
| AC-10508           | o navegador recebe só cidade e UF; falha mostra "Definir localização"                          | vitest, mesmo arquivo                                                     |
| AC-10509, AC-10510 | contagem por evento, anúncio "Sacola, N itens", abertura da sacola, sem leitura no servidor    | vitest `apps/web/tests/sacola-do-topo.onp.test.tsx`                       |
| AC-10511, AC-10512 | `redirect` com destino em todas as páginas e na verificação; sem `redirect("/entrar")` literal | vitest `apps/web/tests/retorno-ao-destino.onp.test.ts`                    |
| AC-10513           | casos hostis recusados pelo validador único                                                    | vitest, mesmo arquivo                                                     |
| AC-10514           | rota com segredo reduz para a loja; `lat` e `lng` nunca no `proximo`                           | vitest, mesmo arquivo                                                     |
| AC-10515           | tabela papel→itens com negativos (`/painel`, `/admin`)                                         | vitest `apps/web/tests/navegacao-do-cliente.onp.test.tsx`                 |
| AC-10516           | "Ver tutorial", "Sair" e alvos dos passos existem                                              | vitest (regressão de `lateral-do-usuario.test.tsx` e `tutorial.test.tsx`) |
| AC-10517           | CSS reserva espaço com área segura (declaração)                                                | vitest (declaração); medida real: e2e e simulador do #114 (AC-11414)      |
| AC-10518, AC-10519 | uma barra fixa; deslocamentos declarados                                                       | vitest (declaração) + e2e do #114                                         |
| AC-10520, AC-10521 | teclado virtual e foco encoberto                                                               | e2e e simulador do #114 (AC-11410, AC-11414); sem vitest                  |
| AC-10522           | cada link do rodapé casa com uma rota de `app/`                                                | vitest `apps/web/tests/rodape-do-cliente.onp.test.tsx`                    |
| AC-10523           | ausência dos textos proibidos (cupom, fidelidade, CNPJ, "Entrega Flash"…)                      | vitest, mesmo arquivo (e AC-11421 do #114)                                |
| AC-10524           | uma regra de "sem barra" para topo, barra e rodapé em `/tv`                                    | vitest, `navegacao-do-cliente.onp.test.tsx`                               |
| AC-10525, AC-10526 | endereço do feed preserva filtros compatíveis; sacola intacta ao voltar                        | vitest `navegacao-do-cliente.onp.test.tsx`; contrato do #106              |

Sem implementação, o audit acusa "critério sem teste" para esta feature, e
isso é esperado (ASM-10508).
