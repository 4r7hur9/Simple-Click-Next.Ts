# SimpleClick

Plataforma de vitrine, catálogo e pedidos para pequenos negócios. A loja ganha uma vitrine na internet, o cliente monta o pedido e o envia pelo WhatsApp, e o dono acompanha tudo num painel.

Este documento descreve o projeto como ele está no código. O estado do trabalho, o que falta e a ordem das próximas fases estão no [`HarnessPlan.md`](HarnessPlan.md), o único plano do projeto.

## Índice

1. [O que é e para quem serve](#1-o-que-é-e-para-quem-serve)
2. [Arquitetura em poucas linhas](#2-arquitetura-em-poucas-linhas)
3. [Mapa do repositório](#3-mapa-do-repositório)
4. [Como funciona por dentro](#4-como-funciona-por-dentro)
5. [Como rodar na sua máquina](#5-como-rodar-na-sua-máquina)
6. [Banco de dados](#6-banco-de-dados)
7. [Testes e verificação](#7-testes-e-verificação)
8. [Publicação](#8-publicação)
9. [Convenções](#9-convenções)
10. [Problemas conhecidos do ambiente](#10-problemas-conhecidos-do-ambiente)

## 1. O que é e para quem serve

O SimpleClick atende lojas pequenas de ramos diferentes: lanchonete, loja de roupas, loja de peças. O ramo (tipo de negócio) muda o vocabulário e alguns comportamentos, como o controle de estoque. A plataforma tem cinco frentes:

- **Vitrine da loja** (`/l/<apelido>`): apresentação, catálogo com busca e filtros, página do produto com variações e escolhas, carrinho, fechamento com entrega ou retirada e PIX, e o envio do pedido para o WhatsApp da loja. O cliente acompanha o pedido por um link, sem precisar de conta.
- **Painel do dono** (`/painel`): fila de pedidos que se atualiza sozinha, mudança de status, pedido de balcão, catálogo (categorias, produtos, preços, variações, estoque, imagens e especificações), clientes, configurações da loja e impressão do cupom.
- **Conta do cliente** (`/minha-conta`): pedidos em todas as lojas, endereços salvos e segurança da conta.
- **Administração da plataforma** (`/admin`): cadastro de lojas, tipo de negócio, apelido, contrato e documentos.
- **Cardápio na TV** (`/l/<apelido>/tv`): o catálogo em tela grande, com rodízio e código para abrir no celular.

A página inicial (`/`) é a landing da própria plataforma. **Nada está publicado ainda.** O que falta para produção (login de verdade, loja pela sessão, e-mail, armazenamento privado, contas e domínio) está no `HarnessPlan.md`.

## 2. Arquitetura em poucas linhas

```
navegador ──▶ site Next.js (apps/web) ──▶ API Express (apps/api) ──▶ PostgreSQL (RLS por loja)
                │ páginas no servidor        │ regra de negócio          └─ fila de impressão
                │ /api/* repassa o token     └──▶ Redis (cache e filas de e-mail)
                └─ cache por etiqueta  ◀──── aviso de "o catálogo mudou"
```

- **Site** (`apps/web`): Next.js 16 com App Router e React 19. As páginas públicas são montadas no servidor e funcionam sem JavaScript. O site não tem regra de negócio: tudo vem da API. As telas do painel chamam rotas do próprio site (`/api/*`), que leem o token do cookie `httpOnly` e repassam à API.
- **API** (`apps/api`): Express 5 rodando TypeScript direto no Node 24, com rotas versionadas em `/v1`. Cada área de negócio é um módulo em `src/modules`, e só `app.ts` junta um módulo com outro.
- **Banco**: PostgreSQL 16, esquema `app`, migrações em SQL escritas à mão. O Prisma 7 serve só como cliente tipado. Cada loja só enxerga os próprios dados por **isolamento por linha (RLS)**: o contexto da loja é gravado em cada transação, `app.is_store_staff()` exige vínculo ativo em `store_members`, e a ausência de contexto nega tudo.
- **Redis 7**: cache da API (toda chave começa pela loja) e filas de segundo plano (BullMQ). A fila de impressão fica no PostgreSQL, para não depender do cache.
- **Contrato compartilhado**: os esquemas Zod de `packages/contracts` são usados pela API (entrada e resposta) e pelo site (leitura das respostas), e geram `contrato/openapi.json`, que os futuros aplicativos nativos vão consumir.
- **Regras puras** (`packages/core`): dinheiro, preço, total, status do pedido, cupom, horário da loja. API e site usam as mesmas funções.
- **Ferramentas**: pnpm com catálogo de versões, Turborepo, Vitest, Playwright, ESLint (inclusive as fronteiras entre camadas), Prettier e lefthook. A verificação roda inteira na máquina de quem desenvolve, sem serviço externo.

## 3. Mapa do repositório

Uma frase por pasta ou arquivo que importa. Só conta o que está no Git; ficam fora dele o `.env`, o `infra/compose/.env.compose`, o certificado em `infra/traefik/certs/` e o cliente gerado em `packages/database/gerado/`.

### 3.1 Raiz

| Caminho                                          | O que é                                                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                   | scripts do monorepo (seção 5.7); fixa Node 24 e pnpm 11.22.0                                                                        |
| `pnpm-workspace.yaml`                            | pacotes do workspace (`apps/*`, `packages/*`, `e2e`), catálogo com uma versão por biblioteca e quem pode rodar script na instalação |
| `turbo.json`                                     | tarefas do Turborepo (`build`, `typecheck`, `lint`, `test:unit`, `test:int`, `test:e2e`) e as variáveis que cada uma enxerga        |
| `vitest.config.ts`                               | os seis projetos de teste (seção 7.1)                                                                                               |
| `eslint.config.js`                               | aplica `configBase()` de `packages/config-eslint`; afrouxa as fronteiras só em configuração, `infra`, `e2e` e scripts               |
| `lefthook.yml`                                   | ganchos do Git: o rápido antes do commit, o portão inteiro antes do envio (seção 7.5)                                               |
| `Makefile`                                       | atalhos `setup`, `up`, `down`, `certs`, `seed`, `test`, `verificar`, `audit`, `limpar`                                              |
| `tsconfig.base.json`                             | só aponta para `packages/config-ts/base.json`                                                                                       |
| `.env.example`                                   | modelo do `.env`, com todas as variáveis e nenhum valor real (seção 5.3)                                                            |
| `.gitattributes`                                 | força fim de linha LF em todo arquivo de texto (seção 10)                                                                           |
| `.prettierignore`, `.dockerignore`, `.gitignore` | o que fica fora da formatação, da imagem Docker e do Git                                                                            |
| `onpspec.config.json`                            | configuração do motor onp-spec: comando de teste, relatório do Vitest e globs de teste e de código (seção 7.6)                      |

### 3.2 `apps/api` — a API

| Caminho                                | O que é                                                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`                           | imagem de produção em vários estágios, sem dependência de desenvolvimento, rodando como `node`; leva o necessário para migrar no pré-publicação |
| `tsconfig.json`, `tsconfig.build.json` | tipos de `src` e `tests`; a construção gera `dist` sem os testes                                                                                |
| `src/app.ts`                           | monta o Express sem escutar porta, na ordem da seção 4.1, e costura os módulos entre si                                                         |
| `src/main.ts`                          | partida (valida o ambiente, sobe as filas, escuta `PORT`) e desligamento ordenado com prazo de 8 s                                              |
| `src/contracts/gerar.ts`               | gera ou confere `contrato/openapi.json` a partir de `@simpleclick/contracts`                                                                    |
| `src/jobs/`                            | filas de segundo plano: `fila.ts` (BullMQ), `email.job.ts` (porta de envio de e-mail) e `index.ts` (qual motor cada fila usa)                   |
| `tests/`                               | testes de integração contra PostgreSQL de verdade, um banco descartável por arquivo, e os apoios `apoio-*.ts`                                   |

`src/core` — a infraestrutura comum a todos os módulos:

| Arquivo                    | O que faz                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `db.ts`                    | único caminho até o banco: transação por requisição com o contexto da loja e conferência do vínculo |
| `contexto.ts`              | contexto da requisição (loja, identidade, papel, transação) por `AsyncLocalStorage`                 |
| `validar.ts`               | borda única de validação por esquema Zod                                                            |
| `env.ts`                   | valida as variáveis na partida e recusa iniciar nomeando o que falta                                |
| `cors.ts`                  | lista fechada de origens; método que muda estado exige origem confiável                             |
| `log.ts`                   | registro estruturado (pino) com lista do que pode entrar                                            |
| `erros.ts`                 | erro de domínio tipado e resposta genérica com código de referência                                 |
| `cache.ts`                 | cache no Redis com chave por loja, prazo de validade e tolerância a queda                           |
| `aviso-ao-site.ts`         | avisa o site quando o dono altera catálogo ou configuração                                          |
| `limite.ts`                | limite de tentativas por conta e por origem, com bloqueio progressivo no Redis                      |
| `sessao-do-carrinho.ts`    | token e cookie `httpOnly` que identificam o carrinho sem cadastro                                   |
| `midia.ts`                 | envio de logo e capa ao Cloudinary (`CLOUDINARY_URL`)                                               |
| `arquivo-privado.ts`       | guarda de contrato e documentos; sem armazenamento configurado responde "indisponível"              |
| `acesso-administrativo.ts` | tipo do registro de acesso da administração a dado de loja                                          |

`src/modules` — uma pasta por área de negócio:

| Módulo       | O que atende                                                                                                                                     | Onde monta                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `health`     | saúde: `live` (processo de pé) e `ready` (banco e cache alcançáveis)                                                                             | `/v1/health`                            |
| `auth`       | casos de uso de identidade (cadastro, login, segundo fator, recuperação, convite, sessão); hoje só o login local de desenvolvimento está montado | `/v1/auth`                              |
| `storefront` | vitrine pública: loja, catálogo, produto, busca, filtros, dados do fechamento e apelido antigo                                                   | `/v1/vitrine`                           |
| `cart`       | carrinho do visitante e conferência de preço contra o catálogo                                                                                   | `/v1/vitrine`                           |
| `orders`     | fechamento do pedido, acompanhamento, WhatsApp, fila do dono, status, pedido manual, repetir pedido e "meus pedidos"                             | `/v1/vitrine`, `/v1/lojas`, `/v1/conta` |
| `catalog`    | catálogo do dono: categorias, produtos, imagens, preços, grupos de escolha, variações, estoque e especificações                                  | `/v1/lojas`                             |
| `stores`     | configurações da loja por seção (pagamento, entrega, horário, contato, aparência, impressão) e pendências                                        | `/v1/lojas`                             |
| `customers`  | clientes da loja e endereços salvos da pessoa                                                                                                    | `/v1/lojas`, `/v1/conta`                |
| `printing`   | cupom da impressão por clique e a fila de impressão em banco (a fila ainda não tem rota)                                                         | `/v1/lojas`                             |
| `metrics`    | métricas do painel e exportação em planilha                                                                                                      | `/v1/lojas`                             |
| `admin`      | administração pela credencial `sc_admin`: lojas, tipo de negócio, apelido, documentos e trilha                                                   | `/v1/admin`                             |

Testes que vale conhecer em `apps/api/tests`: `isolamento-varredura.test.ts` pergunta ao banco quais são as tabelas de loja e cobra isolamento de cada uma (e reprova tabela sem construtor); `isolamento-entre-lojas-dono.test.ts` prova que o dono da loja A não alcança a loja B em nenhum módulo; `isolamento-concorrente.test.ts` prova que o contexto não vaza entre requisições simultâneas; `apoio-de-fila.ts` isola cada arquivo de teste num prefixo do Redis.

### 3.3 `apps/web` — o site

| Caminho                  | O que é                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `next.config.ts`         | carrega o `.env` da raiz, gera saída `standalone` e usa o carregador de imagem do Cloudinary                                                |
| `src/proxy.ts`           | converte o host em apelido de loja e reescreve para `/l/<apelido>`; não autoriza nada (não existe `middleware.ts`, e um teste garante isso) |
| `Dockerfile`             | imagem `standalone` na porta 3000, para rodar fora da Vercel                                                                                |
| `postcss.config.mjs`     | Tailwind 4                                                                                                                                  |
| `public/brand/`          | logotipos e ícones da marca                                                                                                                 |
| `AGENTS.md`, `CLAUDE.md` | aviso gerado pelo `next dev` para assistentes de código                                                                                     |
| `tests/`                 | testes de componentes e telas (jsdom), regras do servidor e provas estruturais (fronteiras, cores, tipografia, acessibilidade)              |

`src/app` — rotas do App Router, por grupo:

| Grupo         | Rotas                                                                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| raiz          | `/` (landing da plataforma), `layout.tsx`, `error.tsx`, `not-found.tsx` e os estilos globais                                                                                                                                                                               |
| `(loja)`      | `/l/[slug]` (apresentação), `/catalogo`, `/produto/[id]`, `/checkout`, `/pedido/[token]` (acompanhamento), `/sobre`, `/tv`, `/sitemap.xml` e a imagem de compartilhamento                                                                                                  |
| `(painel)`    | `/painel`, `/painel/pedidos` (fila, `/novo` e `/[id]`), `/painel/produtos` (com `/estoque`, `/opcoes` e `/variacoes`), `/painel/categorias` (e especificações), `/painel/clientes` e `/painel/config/{aparencia,contato,entrega,horarios,impressao,pagamento}`             |
| `(admin)`     | `/admin/lojas`, `/admin/lojas/nova`, `/admin/lojas/[id]` e `/admin/lojas/[id]/documentos`                                                                                                                                                                                  |
| `(conta)`     | `/entrar` (e `/entrar/verificacao`), `/definir-senha`, `/recuperar-senha`, `/verificar-email`, `/minha-conta/pedidos`, `/minha-conta/enderecos` e `/minha-conta/seguranca` (e `/aplicativo`)                                                                               |
| `(dev)`       | `/ui`, a vitrine do design system em todos os estados                                                                                                                                                                                                                      |
| fora de grupo | `/imprimir/[id]`, o cupom para impressão pelo navegador                                                                                                                                                                                                                    |
| `api/`        | rotas do próprio site: `revalidate` (aviso da API), `auth/[...action]` (sessão e cookies), `admin/[...caminho]`, `catalogo/...`, `conta/enderecos`, `loja/[secao]`, `loja/imagem/[tipo]`, `painel/clientes` e `painel/pedidos`; todas repassam à API com o token do cookie |

`src/features` — a interface por área: `admin`, `auth`, `carrinho`, `checkout`, `config`, `conta`, `impressao`, `landing` (narrativa com GSAP e mundo 3D com Three.js), `loja`, `painel-catalogo`, `painel-clientes`, `painel-pedidos`, `pedido` (acompanhamento), `produto`, `tv` e `vitrine`.

`src/server` — o que roda só no servidor do site:

| Arquivo                                                           | O que faz                                                                                                        |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `vitrine.ts`, `produto.ts`, `fechamento.ts`                       | buscam vitrine, produto e dados do fechamento na API e conferem pelo contrato (só o fechamento traz a chave PIX) |
| `cache.ts`, `revalidacao.ts`                                      | etiquetas de cache por loja e a regra autenticada da revalidação                                                 |
| `sessao.ts`, `session-cookie.ts`, `actions/auth.ts`               | ponte de sessão, nomes e opções dos cookies `sc_access` e `sc_refresh`, sair da conta                            |
| `encaminhar-ao-painel.ts`, `encaminhar-a-loja.ts`, `admin-api.ts` | repassam as chamadas do painel, da conta e da administração à API                                                |
| `cupom.ts`                                                        | pede o cupom à API e o diagrama para impressão                                                                   |
| `produtos-do-balcao.ts`                                           | catálogo usado no pedido de balcão                                                                               |
| `catalogo-na-tela.ts`, `resumo-de-valores.ts`                     | preparam catálogo e valores para a tela                                                                          |
| `mapa-do-site.ts`, `endereco-do-site.ts`, `apelido-antigo.ts`     | mapa do site por loja, endereço absoluto e redirecionamento do apelido antigo                                    |
| `exemplo-da-landing.ts`, `api-client.ts`                          | pedido de exemplo da landing e a consulta de identificação da API                                                |

`src/lib` — apoio sem estado de servidor: leitura pelo contrato (`api-contrato.ts`), chamadas feitas pelo navegador (`carrinho-do-navegador.ts`, `catalogo-do-navegador.ts`), abertura do WhatsApp (`whatsapp.ts`, `texto-whatsapp.ts`), dados estruturados (`dados-estruturados.tsx`), o inventário de telas (`routes.ts`, espelho de `.spec/design/mapa-de-telas.md`) e utilidades de dinheiro, imagem, host, produto, fila e conta.

### 3.4 `packages` — código compartilhado

| Pacote          | O que é                                                                                                                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config-eslint` | `index.js` (regra base e segurança), `fronteiras.js` (quem pode importar quem, por camada) e `cores.js` (cor literal só em `packages/ui/src/tokens.ts`)                                                                                                               |
| `config-ts`     | `base.json` (ES2023, NodeNext, estrito), `node.json` e `react.json`                                                                                                                                                                                                   |
| `contracts`     | esquemas Zod e catálogo de rotas da API (vitrine, carrinho, pedido, conta, clientes, admin, impressão, métricas, configurações); `src/index.ts` é a porta única                                                                                                       |
| `core`          | regras puras: dinheiro, preço vigente e por quantidade, total do item e do pedido, taxa de entrega, estoque, horário da loja, janela de venda, máquina de status, fila de pedidos, telefone, chave PIX, ramo, texto do WhatsApp e o cupom (blocos, largura e ESC/POS) |
| `database`      | tudo do banco (tabela abaixo)                                                                                                                                                                                                                                         |
| `testing`       | banco descartável por arquivo de teste (`db-test.ts`, `vitest-banco.ts`) e construtores de cenário (`factories.ts`: `criarLoja`, `criarProduto`, `comoLoja` e outros)                                                                                                 |
| `ui`            | componentes base (botão, campo, cartão, diálogo, lista, aviso, estados), contraste e foco, tema da loja, `tokens.ts` (o único lugar com cor literal) e as folhas de estilo                                                                                            |

Dentro de `packages/database`:

| Caminho                | O que é                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `migrations/`          | migrações SQL escritas à mão, com as políticas de isolamento junto de cada tabela (seção 6.1)             |
| `src/migrate.ts`       | aplicador próprio: `aplicar` e `verificar`                                                                |
| `src/guards.ts`        | executor das guardas estruturais                                                                          |
| `guards/`              | as dez guardas G1 a G10 em SQL (seção 6.4)                                                                |
| `seed/`                | carga de exemplo determinística: `index.ts`, `lojas.ts`, `catalogo.ts`, `pedidos.ts`, `deterministico.ts` |
| `prisma/schema.prisma` | esquema declarado só para gerar o cliente tipado em `gerado/cliente`                                      |
| `policies/README.md`   | o padrão canônico das políticas (resumido na seção 6.3)                                                   |
| `tests/`               | `esquema-cobre-o-banco.test.ts`: toda tabela das migrações tem modelo no Prisma                           |

As migrações, uma linha cada:

| Nº   | Cria ou muda                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 0001 | extensões, esquema `app`, os três papéis, funções de contexto e o gatilho que força RLS em tabela nova |
| 0002 | `identities` (global) e `platform_admins`                                                              |
| 0003 | `vertical_presets`, `stores`, `store_settings`, `store_domains`, `store_members` e `resolve_store`     |
| 0004 | `products` e o gatilho de versão do catálogo                                                           |
| 0005 | `store_customers` e a função das lojas do comprador                                                    |
| 0006 | `audit_log`                                                                                            |
| 0007 | catálogo completo: imagens, categorias, variações, preços, grupos de escolha e especificações          |
| 0008 | pedidos (sequência, pedido, contato, itens, escolhas, histórico) e carrinho                            |
| 0009 | inserção do pedido pelo cliente, amarrada ao token de acompanhamento                                   |
| 0010 | leitura do pedido pela chave de fechamento (idempotência)                                              |
| 0011 | índices do pedido passam a cobrir a chave de fechamento                                                |
| 0012 | carrinho do visitante amarrado ao token de sessão                                                      |
| 0013 | índice do carrinho passa a cobrir a sessão                                                             |
| 0014 | `storefront_settings`, a apresentação pública da loja                                                  |
| 0015 | horário de funcionamento e exceções                                                                    |
| 0016 | vitrine não vê categoria oculta ou apagada                                                             |
| 0017 | versão do catálogo muda também com categoria e imagem                                                  |
| 0018 | vitrine não vê variação, grupo ou escolha apagados                                                     |
| 0019 | `checkout_settings`, pagamento e entrega para o fechamento                                             |
| 0020 | `store_whatsapp`, o número da loja para montar a conversa                                              |
| 0021 | busca sem acento                                                                                       |
| 0022 | contatos públicos para a página Sobre                                                                  |
| 0023 | `stock_movements`                                                                                      |
| 0024 | baixa atômica de estoque no fechamento                                                                 |
| 0025 | registro do clique e da confirmação do WhatsApp                                                        |
| 0026 | especificações congeladas no item e índices de filtro                                                  |
| 0027 | baixa ignora variação sem controle de estoque                                                          |
| 0028 | janela de venda do produto                                                                             |
| 0029 | correções da operação do pedido e "meus pedidos"                                                       |
| 0030 | contagem de vias impressas do pedido                                                                   |
| 0032 | convite de membro, código de loja e apelido antigo                                                     |
| 0033 | `store_contracts`, só para a administração                                                             |
| 0034 | fila de impressão: `print_agents`, `print_jobs` e funções                                              |
| 0035 | clientes da loja: telefone normalizado, endereço e remoção                                             |
| 0036 | `customer_addresses`, endereços da pessoa                                                              |
| 0037 | índices das métricas                                                                                   |
| 0041 | `app.is_store_staff()` passa a exigir vínculo ativo com a loja                                         |

### 3.5 `infra` — ambiente, portão e publicação

| Caminho                         | O que é                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `compose/docker-compose.yml`    | ambiente local por perfis `core`, `app`, `test`, `print` (seção 5.4)                                            |
| `compose/docker-compose.ci.yml` | só banco de teste e Redis, sem roteador, para rodar testes                                                      |
| `compose/.env.compose.example`  | modelo do `.env.compose`                                                                                        |
| `traefik/`                      | roteador local: `traefik.yml`, cabeçalhos de segurança e compressão, TLS e a pasta do certificado               |
| `railway/railway.json`          | publicação da API como dado: imagem, comando de pré-publicação e caminho de saúde                               |
| `railway/pre-deploy.sh`         | o que roda entre "imagem pronta" e "imagem recebe tráfego" (seção 8)                                            |
| `railway/README.md`             | as peças da publicação e as variáveis do serviço (resumido na seção 8)                                          |
| `tests/`                        | provas da infraestrutura: compose, ambientes, imagens de produção, migração compatível, portão e pré-publicação |

`infra/scripts`, um por um:

| Script                           | O que faz                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `setup.sh`                       | confere Docker e openssl, cria `.env.compose` do modelo, exige as senhas, gera o certificado e valida o compose |
| `up.sh`                          | sobe os perfis pedidos e espera todo serviço ficar saudável                                                     |
| `certs.sh`                       | certificado para `*.localhost` (mkcert, ou openssl com autoridade própria)                                      |
| `verificar.sh`                   | o portão de qualidade: a lista de etapas (seção 7.4)                                                            |
| `portao-lib.sh`                  | o motor do portão: anúncio, tempo, resumo e registro das versões aprovadas                                      |
| `check-ambientes.sh`             | recusa banco ou cache de teste iguais aos da aplicação; com `--producao`, recusa a variável de teste presente   |
| `check-segredos.sh`              | procura chave, senha ou cadeia de conexão escrita à mão                                                         |
| `check-mensagem.sh`              | confere o formato da mensagem de commit                                                                         |
| `check-migracao-compativel.mjs`  | recusa migração que impede voltar à versão anterior                                                             |
| `db-guards.sh`                   | roda as guardas G1 a G10 contra um banco de prova migrado na hora                                               |
| `audit-regressao.mjs`            | a parte da auditoria da especificação que acusa regressão (o que falta é contado, não reprova)                  |
| `registrar-pulo.sh`              | transforma envio sem portão em dívida escrita em `docs/pendencias.md`                                           |
| `iniciar-registro-do-portao.mjs` | marca, na instalação, o ponto de partida desse registro                                                         |
| `provar.sh`                      | roda `verify` de novo em toda feature que já tem prova                                                          |
| `assistir.sh`, `espiar.sh`       | painéis de terminal para acompanhar agentes de implementação                                                    |

### 3.6 `e2e` — ponta a ponta com Playwright

| Caminho                               | O que é                                                                                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `playwright.config.ts`                | projetos `publico` (sem JavaScript) e `celular` (344 × 882); sobe a API na 3101 e o site construído na 3100                                                                                                    |
| `playwright.local.config.ts`          | a mesma configuração com o Chrome instalado fixo                                                                                                                                                               |
| `run-isolado.mjs`                     | cria um banco descartável, aplica migrações e carga, roda os cenários e apaga o banco mesmo na falha                                                                                                           |
| `iniciar-api.mjs`, `iniciar-site.mjs` | sobem a API e o site (`next build` e servidor `standalone`) para os cenários                                                                                                                                   |
| `fixtures/`                           | loja de teste sempre aberta, loja com página Sobre, loja do painel `e2e-painel` com sessão de dono e interceptação do WhatsApp                                                                                 |
| `specs/`                              | um arquivo por fluxo: vitrine, produto, carrinho, fechamento, painel do catálogo, estoque, clientes, pedido manual, impressão, TV, landing, acessibilidade, teclado, desempenho, canônico e manifesto de rotas |

`cadastro.spec.ts`, `login-2fa.spec.ts` e `recuperar-senha.spec.ts` são testes antigos em formato Vitest: o Playwright os ignora e o Vitest exclui `e2e/`, então hoje nenhum executor os roda.

### 3.7 `contrato`

`contrato/openapi.json` é o documento OpenAPI 3.1 gerado dos esquemas de `packages/contracts` por `pnpm --filter @simpleclick/api run contrato:escrever`. O portão confere que ele está em dia. Hoje cobre `/` e as rotas públicas de `/v1/vitrine`; as rotas do dono, da conta, da administração e de saúde ainda não estão nele.

### 3.8 `.spec` — a especificação

O projeto segue o método spec-driven ONP: todo requisito vira critério de aceite com prova executável. O motor `onp-spec` lê esta pasta.

| Caminho                                                                               | O que é                                                                                         |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `constituicao.md`                                                                     | os princípios inegociáveis P-001 a P-014 (seção 9)                                              |
| `design/arquitetura.md`                                                               | a arquitetura planejada e a tabela de fronteiras entre camadas                                  |
| `design/modelo-de-dados.md`                                                           | o modelo de dados, validado contra PostgreSQL com 300 mil pedidos                               |
| `design/mapa-de-telas.md`                                                             | o inventário de telas que o ponta a ponta precisa cobrir                                        |
| `design/decisoes.md`                                                                  | as decisões do dono e da orquestração, e as que faltam                                          |
| `design/critico-de-completude.md`, `design/plano-continuacao.md`, `plano-paralelo.md` | registros históricos de planejamento; o plano vigente é o `HarnessPlan.md`                      |
| `features/<feature>/spec.md`                                                          | histórias (US), critérios de aceite (AC-xxx), suposições e perguntas da feature                 |
| `features/<feature>/tasks.md`                                                         | tarefas (T-xxx) com estado, arquivos e critérios que cada uma prova                             |
| `features/<feature>/plano-*`, `executar-tarefas.sh`                                   | planos de execução gerados pelo motor                                                           |
| `verification/<feature>.json`                                                         | a prova gravada por `onp-spec verify`: o resultado de cada critério contra uma versão do código |
| `verification/sinais.json`                                                            | histórico de sinais derivado pela auditoria                                                     |

As 13 features: `fundacao`, `identidade-acesso`, `identidade-visual-global`, `landing-plataforma`, `vitrine-publica`, `catalogo-produtos`, `pedido-checkout`, `pedido-operacao`, `config-loja`, `clientes-loja`, `dashboard-metricas`, `admin-lojas` e `cardapio-na-tv`.

### 3.9 `.claude/skills/design-de-front` e `docs`

- `.claude/skills/design-de-front/SKILL.md`: como construir tela no SimpleClick. É a "regra do peso" por superfície: a landing pode ter narrativa por rolagem (GSAP e ScrollTrigger) e mundo 3D (Three.js); vitrine, produto, carrinho e fechamento só micro-interação; o painel é o mais sóbrio. As referências `scroll-story.md` e `mundo-3d.md` detalham cada técnica.
- `docs/`: `pendencias.md` (dívidas e registro de portão pulado), `publicacao.md` e `verificacao.md`. Serão absorvidos por este README e pelo `HarnessPlan.md` na fase de limpeza.

## 4. Como funciona por dentro

### 4.1 O caminho de uma requisição

Toda chamada à API atravessa as mesmas camadas, nesta ordem (`apps/api/src/app.ts`):

1. **Registro** (`core/log.ts`): abre o contexto da requisição com um identificador próprio. Cada linha de registro sai em JSON, com lista de campos permitidos — dado pessoal não entra (P-009).
2. **Origens fechadas** (`core/cors.ts`): requisição de origem fora de `ORIGENS_PERMITIDAS` é recusada antes de o corpo ser lido.
3. **Corpo JSON** com limite de 1 MB, depois as rotas de saúde (`/v1/health/live` e `/v1/health/ready`).
4. **Aviso ao site** (`core/aviso-ao-site.ts`), montado em `/v1/lojas` antes de toda rota do dono (seção 4.4).
5. **Borda de validação** (`core/validar.ts`): todo corpo, parâmetro e consulta passa por um esquema Zod declarado. Chave não declarada é descartada, o caso de uso só lê o que a borda devolveu, e a recusa nunca ecoa o valor recebido (P-007).
6. **Autenticação**: o token de acesso chega no cabeçalho `Authorization`. O navegador nunca vê o token: o site o guarda no cookie `httpOnly` `sc_access` e repassa à API pelas rotas próprias em `apps/web/src/app/api/*` (P-008).
7. **Loja pelo apelido**: a rota resolve a loja pelo apelido da URL, ainda sem contexto, por função dedicada do banco.
8. **Transação com contexto** (`core/db.ts`, o único caminho até o banco — P-004): abre uma transação interativa e grava, com `set_config(..., is_local => true)`, os parâmetros `app.store_id`, `app.user_id`, `app.role`, `app.order_token`, `app.checkout_key` e `app.cart_session`. O valor morre no fim da transação, então a conexão devolvida ao agrupador não carrega a loja da requisição anterior.
9. **Vínculo com a loja**: para `OWNER` e `STAFF`, logo depois de gravar o contexto, a API pergunta `app.is_store_staff()`. A função exige vínculo ativo em `store_members` (migração 0041). Sem vínculo, a resposta é "não encontrado", antes de qualquer consulta do caso de uso.
10. **Isolamento por linha (RLS)**: as políticas do PostgreSQL comparam `store_id` com o contexto. Sem contexto, nada passa. Alteração que mira linha de outra loja afeta zero linhas, e `exigirUmaLinhaAfetada` transforma isso em "não encontrado".
11. **Erros**: rota desconhecida responde 404 em JSON; o `manipuladorDeErros()` é o último middleware.

Papéis que o banco reconhece em `app.role` (`core/contexto.ts`): `PUBLIC` (vitrine, sem login), `CUSTOMER` (cliente com conta), `OWNER` e `STAFF` (equipe da loja) e `PRINT_AGENT` (agente de impressão da loja). A administração da plataforma não é um papel de sessão: é outra credencial de banco (`sc_admin`), usada só pelas rotas de `/v1/admin`.

As três credenciais de banco:

| Papel         | Uso                                                | Contorna o isolamento? |
| ------------- | -------------------------------------------------- | ---------------------- |
| `sc_migrator` | dono do esquema; aplica migrações; conexão direta  | sim                    |
| `sc_app`      | execução do dono de loja, da equipe e do cliente   | não                    |
| `sc_admin`    | execução da administração (enxerga todas as lojas) | não                    |

`core/db.ts` recusa abrir caminho se a credencial da aplicação puder contornar o isolamento.

### 4.2 O pedido, do carrinho ao acompanhamento

1. **Vitrine** (`/l/<apelido>`, `/l/<apelido>/catalogo`, `/l/<apelido>/produto/<id>`): páginas montadas no servidor, que funcionam sem JavaScript. Os dados vêm da API pelo papel `PUBLIC`, que não enxerga campo interno da loja (a chave PIX, por exemplo, não aparece aqui).
2. **Carrinho** (`modules/cart`): mora no banco, e não no navegador. É identificado por um token de sessão em cookie (`core/sessao-do-carrinho.ts`), e cada item é recalculado no servidor com `calcularItem` (`packages/core/src/item-total.ts`), a mesma função que a tela usa.
3. **Fechamento** (`/l/<apelido>/checkout`): a tela pede à API as formas de entrega, as taxas e, só nesse momento, a chave PIX. Ao confirmar, o corpo **não traz itens nem preços**: a API lê o carrinho da sessão, confere cada item contra o catálogo de agora (`cart/conferir-preco.usecase.ts`, P-006), calcula a taxa e só então cria o pedido. O total que a tela mostrou só serve para registrar divergência.
4. **Criação** (`orders/criar-pedido.usecase.ts`): numa transação só entram o pedido com número sequencial da loja, o contato, os itens como cópia congelada (nome, preço e escolhas do momento — P-010), o primeiro passo do histórico, a baixa de estoque (`app.reservar_estoque_do_pedido`, migração 0024) e o trabalho da fila de impressão, quando a loja ligou a impressão automática (`app.enfileirar_impressao`, migração 0034). Na mesma transação, a rota marca o carrinho da sessão como convertido (`app.converter_carrinho`, migração 0043): a sessão volta a um carrinho vazio, e um segundo "Fechar pedido" não cria outro pedido igual. A chave de fechamento (`app.checkout_key`) faz a segunda tentativa encontrar o pedido da primeira, sem duplicar — e a resposta dela vem do pedido guardado (`orders/pedido-fechado.usecase.ts`).
5. **WhatsApp**: a resposta traz o endereço da conversa, montado pela API (o número da loja não é campo público) e o token de acompanhamento. A tela abre a conversa no próprio clique (`apps/web/src/lib/whatsapp.ts`); se o navegador bloquear, mostra o link e o texto para copiar. O clique e a confirmação de envio ficam registrados (`whatsapp_clicked_at` e `whatsapp_confirmed_at`, migração 0025).
6. **Fila do painel** (`/painel/pedidos`): a tela lê a fila inteira a cada 5 segundos (`useAtualizarPedidos.ts`) e compara com a leitura anterior pela regra de `packages/core/src/fila-de-pedidos.ts`. O pedido que abriu o WhatsApp e não confirmou aparece marcado.
7. **Status**: `PENDING → ACCEPTED → PREPARING → READY_FOR_PICKUP` (retirada) ou `OUT_FOR_DELIVERY` (entrega) `→ COMPLETED`, com `CANCELLED` possível em qualquer passo aberto (antes de aceitar, o botão diz "Recusar"). A regra mora em `packages/core/src/maquina-status.ts`; a API recusa o caminho que não existe, cancelamento exige motivo e o histórico só acrescenta (guarda G8).
8. **Pedido de balcão** (`/painel/pedidos/novo`): o dono lança o pedido no lugar do cliente. É o mesmo `criarPedido`, com canal `MANUAL`, preço recalculado no servidor e a mesma fila.
9. **Acompanhamento** (`/l/<apelido>/pedido/<token>`): o token tem 32 bytes aleatórios e é a única chave de leitura; quem não o tem não vê pedido nenhum. O cliente com conta vê o histórico em `/minha-conta/pedidos`.

### 4.3 Impressão

- **Cupom em blocos** (`packages/core/src/cupom-blocos.ts`): o cupom é um documento semântico versionado (`versao: 1`), com papel de 58 ou 80 mm e uma lista de blocos. Ele não guarda bytes de impressora, então um pedido antigo é reimpresso igual. Daí saem duas saídas com as mesmas linhas: o HTML da impressão pelo navegador e os bytes ESC/POS (`cupom-escpos.ts`, com a tabela de caracteres certa para o acento).
- **Impressão por clique** (padrão): o dono abre `/imprimir/<id>`; a rota `POST` do cupom (`printing/cupom.routes.ts`) soma uma via na mesma transação em que gera o cupom. Duas impressões simultâneas saem como 2ª e 3ª via, nunca duas 2ª vias.
- **Fila de impressão** (`app.print_jobs`, migração 0034, `printing/fila.usecase.ts`): fica no PostgreSQL, e não no Redis, para a cozinha continuar recebendo cupom se o cache cair. O trabalho nasce na criação do pedido (só com o automático ligado). O agente reivindica com `FOR UPDATE SKIP LOCKED` e prazo de posse; a via é somada na primeira reivindicação e os blocos ficam guardados, então o reenvio não imprime de novo nem soma via. Falha volta com espera crescente e vira `DEAD` no limite. Imprimir por clique um trabalho pendente o cancela.
- **Agente de impressão** (`apps/agente-impressao`, T-609): programa Node 24 que roda na máquina da loja, pergunta à API a cada 2,5 s se há cupom e escreve na impressora de rede (TCP 9100), compilando o cupom com as mesmas funções de `packages/core`. Grava num diário local cada trabalho impresso ANTES de confirmar, então confirmação perdida não imprime duas vezes. Pareia pelo código de seis dígitos do painel (`pnpm parear`) e roda com `pnpm start`; instruções no README do próprio app. O emulador de impressora (T-610, `src/emulador.ts`) lê os bytes pelo mesmo decodificador do teste (`lerEscPos`) e mostra a prévia do papel: `bash infra/scripts/testar-impressao.sh` manda um cupom de exemplo e confere.

### 4.4 Cache e aviso ao site

- **Cache da API** (`apps/api/src/core/cache.ts`): Redis, com chave que sempre começa pela loja (`<loja>:<nome>[:<parte>]`). A montagem recusa chave sem loja. Toda entrada tem prazo de validade como rede de proteção, e a queda do Redis nunca derruba a resposta: o caso de uso vai ao banco. Hoje só as métricas do painel guardam dado ali, com a marca-d'água dos pedidos na chave (`modules/metrics/cache.ts`).
- **Cache do site** (`apps/web/src/server/cache.ts`): as leituras públicas (apresentação, catálogo, produto e fechamento) vão ao `fetch` do Next com a etiqueta `vitrine:<apelido>` e prazo de 60 s (15 s no fechamento).
- **Aviso ao site**: quando o dono altera algo em `/v1/lojas/<apelido>/catalogo/...` ou `/v1/lojas/<apelido>/configuracao/...` e a API responde 2xx, `core/aviso-ao-site.ts` chama `POST /api/revalidate` do site com `SEGREDO_DE_REVALIDACAO`. O site vence a etiqueta na hora. Sem `URL_DO_SITE` e o segredo, o aviso fica desligado e vale o prazo. Pedido e cupom não avisam: a vitrine não mostra pedido.
- **Filas de segundo plano** (`apps/api/src/jobs`, BullMQ no Redis): a de e-mail tem trabalhador; a de webhook só está declarada. Sobem no mesmo processo da API em produção (`SEGUNDO_PLANO`). O envio de e-mail ainda usa o adaptador que falha alto, porque o provedor não foi escolhido.

## 5. Como rodar na sua máquina

### 5.1 Pré-requisitos

- **Node 24** ou mais novo (`engines` do `package.json`).
- **pnpm 11** (o projeto fixa `pnpm@11.22.0`). Pelo Corepack: `corepack enable && corepack prepare pnpm@11.22.0 --activate`.
- **Docker Desktop** com o plugin `docker compose` v2, e de preferência 8 GB de memória para ele.
- **openssl** (vem com o Git Bash) e, se quiser o cadeado verde sem aviso, **mkcert**.
- **No Windows, use o Git Bash** em `C:/Program Files/Git/bin/bash.exe` para todo script `.sh`. No PowerShell, `bash` costuma abrir o WSL, que não enxerga a instalação do Windows. Exemplo: `& "C:/Program Files/Git/bin/bash.exe" infra/scripts/setup.sh`.

### 5.2 Primeira vez, passo a passo

```bash
# 1. dependências — o `prepare` instala os ganchos do lefthook,
#    marca o ponto de partida do registro do portão e gera o cliente do Prisma
pnpm install

# 2. arquivo do Docker e certificado local
bash infra/scripts/setup.sh        # cria infra/compose/.env.compose a partir do modelo e para
#    preencha POSTGRES_SENHA_DEV, POSTGRES_SENHA_TEST e REDIS_SENHA (ex.: openssl rand -hex 16)
bash infra/scripts/setup.sh        # de novo: gera o certificado e valida o compose

# 3. arquivo da aplicação
cp .env.example .env               # preencha conforme a seção 5.3

# 4. serviços: roteador, banco de desenvolvimento, Redis e banco de teste
bash infra/scripts/up.sh core test

# 5. migrações e dados de exemplo no banco de desenvolvimento
node --env-file=.env packages/database/src/migrate.ts aplicar
node --env-file=.env packages/database/seed/index.ts

# 6. site e API em modo de desenvolvimento
pnpm dev                           # site em http://localhost:3000, API em http://localhost:3001
```

`make setup` faz o passo 1 e chama o `setup.sh`. `make seed` e o script `seed` do pacote de banco **não leem o `.env`**: rode com `node --env-file=.env` como acima, ou exporte as variáveis antes (`set -a; . ./.env; set +a`).

A carga de exemplo só roda em banco vazio e nunca com `NODE_ENV=production`. Para recarregar, recrie o banco de desenvolvimento.

### 5.3 Variáveis de ambiente

São dois arquivos, os dois fora do Git. Nunca escreva segredo em arquivo versionado (P-002).

**`infra/compose/.env.compose`** (lido pelo Docker; modelo em `.env.compose.example`):

| Variável                                                                                     | Para quê                                                                |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `COMPOSE_PROJECT_NAME`                                                                       | prefixo dos contêineres (`simpleclick`)                                 |
| `HOST_WEB`, `HOST_API`                                                                       | nomes servidos pelo roteador com TLS (`app.localhost`, `api.localhost`) |
| `PORTA_HTTP`, `PORTA_HTTPS`, `PORTA_PAINEL_TRAEFIK`                                          | 80, 443 e 8081 (painel do roteador)                                     |
| `PORTA_INTERNA_API`, `PORTA_INTERNA_WEB`                                                     | porta para onde o roteador entrega dentro dos contêineres               |
| `POSTGRES_USUARIO_DEV`, `POSTGRES_BANCO_DEV`, `PORTA_POSTGRES_DEV`, `POSTGRES_SENHA_DEV`     | banco de desenvolvimento (porta 5432; os dados sobrevivem ao `down`)    |
| `POSTGRES_USUARIO_TEST`, `POSTGRES_BANCO_TEST`, `PORTA_POSTGRES_TEST`, `POSTGRES_SENHA_TEST` | banco de teste (porta 5433; em memória, sem volume)                     |
| `PORTA_REDIS`, `REDIS_MEMORIA_MAXIMA`, `REDIS_SENHA`                                         | Redis (porta 6379)                                                      |
| `PORTA_IMPRESSORA`                                                                           | emulador de impressora do perfil `print` (9100)                         |

**`.env`** (lido pela API, pelo site, pelos testes e pelos scripts; modelo em `.env.example`):

| Variável                                                                     | Para quê                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                   | `development`, `test` ou `production`                                                                                                                                                                                             |
| `PORT`                                                                       | porta da API (3001). `API_PORT` é o nome antigo: tolerado se for igual, recusado se for diferente                                                                                                                                 |
| `LOG_LEVEL`                                                                  | nível do registro estruturado                                                                                                                                                                                                     |
| `DATABASE_URL`                                                               | conexão da aplicação, com a credencial `sc_app`. Em produção passa pelo agrupador (`?pgbouncer=true`); na máquina local não há agrupador e ela aponta direto para a porta 5432. A API recusa credencial que contorne o isolamento |
| `DATABASE_URL_DIRETA`                                                        | conexão direta para migração. Num banco vazio precisa ser uma credencial de arranque, que pode criar papel (na máquina local, o usuário do Postgres de desenvolvimento)                                                           |
| `DATABASE_URL_TEST`                                                          | banco de teste (porta 5433). Tem de ser outro banco: a suíte apaga e recria dados                                                                                                                                                 |
| `SENHA_BANCO_MIGRADOR`, `SENHA_BANCO_APLICACAO`, `SENHA_BANCO_ADMINISTRACAO` | senhas dos papéis `sc_migrator`, `sc_app` e `sc_admin`, que a migração 0001 cria (12 caracteres ou mais)                                                                                                                          |
| `REDIS_URL`, `REDIS_URL_TEST`                                                | cache e filas; o de teste tem de ser outro servidor ou outro índice                                                                                                                                                               |
| `JWT_SECRET`                                                                 | assinatura dos tokens de sessão (32 caracteres ou mais)                                                                                                                                                                           |
| `ORIGENS_PERMITIDAS`                                                         | origens que podem chamar a API, separadas por vírgula (no local: `http://localhost:3000`, e `3100`/`3101` para o ponta a ponta)                                                                                                   |
| `NEXT_PUBLIC_API_URL`                                                        | endereço da API que o site e o navegador usam                                                                                                                                                                                     |
| `NEXT_PUBLIC_DEV_STORE_SLUG`                                                 | loja que o painel local usa (padrão `pastelaria-da-vila`)                                                                                                                                                                         |
| `NEXT_PUBLIC_SESSION_COOKIE_DOMAIN`                                          | domínio do cookie de sessão; deixe ausente em `http://localhost:3000`                                                                                                                                                             |
| `URL_DO_SITE`, `SEGREDO_DE_REVALIDACAO`                                      | aviso de "o catálogo mudou" da API para o site; andam juntas                                                                                                                                                                      |
| `SIMPLECLICK_DEV_TEST_EMAIL`, `SIMPLECLICK_DEV_TEST_PHRASE`                  | usuário de teste local (seção 5.5); nunca em produção                                                                                                                                                                             |
| `SEGUNDO_PLANO`                                                              | `ligado` ou `desligado`; sem valor, liga só em produção                                                                                                                                                                           |
| `CLOUDINARY_URL`                                                             | opcional; envio de logo, capa e imagem de produto                                                                                                                                                                                 |
| `ARMAZENAMENTO_PRIVADO_DIR`                                                  | opcional e só local; pasta dos documentos da loja (ignorada em produção)                                                                                                                                                          |

`bash infra/scripts/check-ambientes.sh` confere que banco e cache de teste não são os da aplicação. O portão roda essa conferência antes de tudo.

### 5.4 Docker: `up.sh` e os perfis

`bash infra/scripts/up.sh [perfis...]` sobe os perfis pedidos (sem argumento: `core app`) e só devolve o controle quando todo serviço está saudável. Se algum reprovar, mostra a saída da verificação de saúde.

| Perfil  | Serviços                           | Observação                                                                      |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| `core`  | `traefik`, `postgres-dev`, `redis` | a base de qualquer trabalho                                                     |
| `test`  | `postgres-test`                    | em memória, `fsync` desligado, sem volume                                       |
| `app`   | `api`, `web`                       | **ainda são nginx provisórios**; o site e a API de verdade rodam com `pnpm dev` |
| `print` | `emulador-de-impressora`           | emulador TCP 9100 em Node (T-610); a prévia de cada cupom sai no log            |

`make down` derruba todos os perfis. `make certs` regera o certificado local.

### 5.5 Login local de desenvolvimento

Ainda não existe login de produção ligado à API (é uma das lacunas do `HarnessPlan.md`). Para entrar no painel na sua máquina:

1. Preencha `SIMPLECLICK_DEV_TEST_EMAIL` e `SIMPLECLICK_DEV_TEST_PHRASE` (12 caracteres ou mais) no `.env`, com a carga de exemplo já aplicada.
2. Abra `http://localhost:3000/entrar` e entre com esse e-mail e essa frase.
3. A rota `POST /v1/auth/login` (`modules/auth/desenvolvimento.routes.ts`) só existe fora de produção. Ela cria a identidade pelo e-mail e o vínculo `OWNER` com a loja de `NEXT_PUBLIC_DEV_STORE_SLUG`. O site guarda a sessão nos cookies `httpOnly` `sc_access` e `sc_refresh`.
4. O painel fica em `http://localhost:3000/painel`.

### 5.6 Portas

| Porta      | O que é                                                             |
| ---------- | ------------------------------------------------------------------- |
| 3000       | site (`pnpm dev` ou `pnpm lp`)                                      |
| 3001       | API (`pnpm dev` ou `pnpm api`)                                      |
| 3100, 3101 | site e API que o Playwright sobe para o ponta a ponta               |
| 5432       | PostgreSQL de desenvolvimento                                       |
| 5433       | PostgreSQL de teste                                                 |
| 6379       | Redis                                                               |
| 6380       | Redis de teste desta máquina (o do compose de CI, seção 10)         |
| 80, 443    | roteador Traefik (`https://app.localhost`, `https://api.localhost`) |
| 8081       | painel do Traefik                                                   |
| 9100       | emulador de impressora (perfil `print`)                             |

### 5.7 Comandos

**`package.json` da raiz:**

| Comando                                                                | O que faz                                                               |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev` (ou `pnpm dev:all`)                                         | site e API juntos, em modo de desenvolvimento                           |
| `pnpm lp` / `pnpm api`                                                 | só o site / só a API                                                    |
| `pnpm build`, `pnpm typecheck`                                         | construção e tipos de todos os pacotes (Turborepo)                      |
| `pnpm build:web`, `pnpm start:web`, `pnpm build:api`, `pnpm start:api` | construir e rodar cada lado em modo de produção                         |
| `pnpm lint`, `pnpm lint:fix`                                           | ESLint                                                                  |
| `pnpm format`, `pnpm format:check`                                     | Prettier                                                                |
| `pnpm test:unit`, `pnpm test:int`, `pnpm test:e2e`                     | testes por pacote, via Turborepo (cobertura parcial: ver a nota abaixo) |
| `pnpm spec:audit`, `pnpm spec:verify`                                  | auditoria e prova do motor ONP                                          |
| `pnpm db:gerar`                                                        | regera o cliente tipado do Prisma                                       |

**`Makefile`:** `make` (lista os alvos), `make setup`, `make up`, `make down`, `make certs`, `make seed`, `make test`, `make verificar` (portão completo), `make audit` (auditoria completa da especificação) e `make limpar`.

**Nota sobre `make test` e `pnpm test:*`:** os scripts dos pacotes só cobrem os projetos `unit` e `web` (`test:unit`) e o `db-rls` de `packages/database` e `packages/testing` (`test:int`). Ficam de fora `api-int`, `filas`, `cache-int` e `infra/tests`. Para rodar tudo, use o portão ou `pnpm vitest run` (todos os projetos de uma vez, pesado).

**Pacotes:** `pnpm --filter @simpleclick/database run migrar | migrar:verificar | guardas | seed | gerar` (exigem as variáveis no ambiente) e `pnpm --filter @simpleclick/api run contrato:escrever | contrato:verificar`.

## 6. Banco de dados

### 6.1 Migrações

- Ficam em `packages/database/migrations`, **escritas à mão em SQL**, com nome `NNNN_nome_em_minusculas.sql` (quatro dígitos). O Prisma não gera migração aqui: `prisma/schema.prisma` serve só para gerar os tipos do cliente.
- Alguns números estão vagos (0031, 0038–0040, 0042–0043) porque foram reservados para faixas paralelas. A ordem de aplicação é a do número.
- `packages/database/src/migrate.ts` é o aplicador:
  - `aplicar` roda cada arquivo pendente uma vez, em ordem, **uma transação por arquivo**, com trava entre processos, e registra a impressão digital (sha256) no livro de controle. No fim, recusa o esquema se existir tabela de loja sem isolamento ligado e forçado.
  - `verificar` só confere: recusa migração pendente, migração alterada depois de aplicada ou arquivo sumido.
  - Senhas dos papéis entram no SQL como `@@NOME_DA_VARIAVEL@@` e são substituídas a partir do ambiente.
- **Nunca edite uma migração já aplicada.** O aplicador recusa o banco cuja impressão digital divergir. Para desfazer algo, escreva uma migração nova.
- **Compatibilidade com a versão anterior** (`infra/scripts/check-migracao-compativel.mjs`, AC-030), cobrada no portão e na publicação: coluna nova entra aceitando nulo ou com padrão; remoção acontece em duas publicações, e a segunda cita a primeira no cabeçalho com `-- @janela-cumprida: NNNN_arquivo.sql`; renomear é proibido (adicionar, copiar, parar de usar, remover depois); trocar tipo é coluna nova; tornar obrigatória só depois que a versão que sempre preenche estiver no ar.

### 6.2 Criar uma migração nova

1. Pegue o próximo número livre e escreva `NNNN_o_que_faz.sql` com um cabeçalho em comentário: o que cria, por quê e por que é compatível com a versão anterior.
2. Comece com `SET LOCAL ROLE sc_migrator;` e escreva de forma reaplicável (`IF NOT EXISTS`, `CREATE OR REPLACE`, política recriada).
3. Toda tabela de loja leva `store_id`, o bloco canônico de políticas (seção 6.3), índice liderado por `store_id` e chave única que começa por `store_id`.
4. Acrescente o modelo em `packages/database/prisma/schema.prisma` e rode `pnpm db:gerar` (o teste `esquema-cobre-o-banco.test.ts` cobra modelo para toda tabela).
5. Acrescente o construtor da tabela em `CONSTRUTORES`, na varredura `apps/api/tests/isolamento-varredura.test.ts`, que reprova tabela de loja sem construtor; se outros testes precisarem criar a linha, acrescente também um construtor em `packages/testing/src/factories.ts`.
6. Se a tabela entra no cenário de exemplo, acrescente-a em `packages/database/seed/`.
7. Aplique no banco local (`node --env-file=.env packages/database/src/migrate.ts aplicar`) e rode `bash infra/scripts/db-guards.sh` e `node infra/scripts/check-migracao-compativel.mjs`.

### 6.3 Isolamento por loja (RLS)

O modelo em uma frase: três credenciais com agrupadores separados, esquema único `app`, coluna de loja em toda tabela de negócio, contexto definido por transação e **negação por omissão**. Um esquecimento de filtro no código não vaza dado, porque o banco nega.

Funções de contexto (estáveis, toleram cadeia vazia com `nullif`):

```sql
app.current_store_id()    -- uuid · nulo sem contexto
app.current_user_id()     -- uuid
app.current_role_name()   -- text · 'PUBLIC' sem papel
app.is_store_staff()      -- bool · papel OWNER/STAFF com vínculo ativo em store_members (0041)
app.current_order_token() -- text · acompanhamento sem login
```

O bloco canônico de toda tabela com `store_id`:

```sql
ALTER TABLE app.<tabela> ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.<tabela> FORCE  ROW LEVEL SECURITY;

-- uma política POR COMANDO, nunca FOR ALL
CREATE POLICY <t>_staff_select ON app.<tabela> FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY <t>_staff_insert ON app.<tabela> FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY <t>_staff_update ON app.<tabela> FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY <t>_staff_delete ON app.<tabela> FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- sem contexto, nada
CREATE POLICY <t>_require_ctx ON app.<tabela> AS RESTRICTIVE FOR ALL TO sc_app
  USING ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

-- administração enxerga tudo por política explícita
CREATE POLICY <t>_admin_all ON app.<tabela> FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);
```

As regras que o bloco carrega, cada uma por uma falha real:

1. Ligado **e** forçado: um sem o outro não protege.
2. Uma política por comando: `FOR ALL` esconde permissão de remoção que ninguém quis dar.
3. `WITH CHECK` no `UPDATE`: é o que impede mover uma linha para outra loja.
4. A restritiva tem destinatário (`TO sc_app`); sem ele alcançaria a administração.
5. Toda política permissiva de tabela quente cita `store_id`. Medido com 300 mil pedidos: uma única política sem ele levou a consulta de 0,2 ms para 6,4 ms. O que cruza lojas por natureza (histórico do comprador, "minhas lojas") vira função `SECURITY DEFINER`.
6. Onde há duas políticas permissivas (dono e próprio cliente, em `store_customers`), as duas têm porteiro de papel, porque permissivas se combinam por OU.
7. Índice liderado por `store_id`, cobrindo também as colunas que as políticas citam.

Exceções revisadas: `stores` (sem a restritiva, porque a loja é descoberta antes do contexto por `app.resolve_store`; sem inserção nem remoção para `sc_app`; alteração por coluna), `identities` (global, uma pessoa uma conta), `platform_admins` (nenhuma política para `sc_app`), `vertical_presets` (leitura liberada) e `audit_log` (só acrescenta, em três camadas). Chaves únicas globais permitidas: `stores_slug_uk`, `stores_code_uk`, `store_domains_host_uk`, `identities_email_uk` e `orders_public_token_uk`; qualquer outra reprova a guarda G3.

### 6.4 As guardas G1 a G10

Consultas ao catálogo do PostgreSQL em `packages/database/guards`. Cada uma devolve uma linha por problema, e qualquer linha reprova. `bash infra/scripts/db-guards.sh` as roda contra um banco de prova criado e migrado na hora (ou `--url <cadeia>` contra um banco existente).

| Guarda | Recusa                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| G1     | tabela de loja sem o isolamento ligado **e** forçado                                                                |
| G2     | tabela com isolamento e sem política para algum dos quatro comandos                                                 |
| G3     | chave única global onde deveria ser única por loja (fora da lista de exceções)                                      |
| G4     | política permissiva de tabela quente sem citar `store_id` (exceção revisada: `sc_self_select` de `store_customers`) |
| G5     | índice cobridor sem as colunas que as políticas citam                                                               |
| G6     | visão materializada sobre tabela de loja                                                                            |
| G7     | visão de loja sem `security_invoker = true`                                                                         |
| G8     | tabela de pedido com política de alteração ou remoção                                                               |
| G9     | trilha de auditoria que aceite alteração ou remoção                                                                 |
| G10    | função `SECURITY DEFINER` sem dono migrador ou sem `search_path` fixo                                               |

### 6.5 Carga de exemplo (seed)

`packages/database/seed` planta tudo pela credencial de **administração**, que obedece às políticas escritas (o migrador as contornaria e esconderia erro de política):

- **duas lojas ativas**: `pastelaria-da-vila` (lanchonete, sem controle de estoque) e `moda-boa-vista` (roupas, com estoque e um tamanho zerado), com donos, equipe, configuração, horários, domínio local, clientes e endereços;
- **catálogo** das duas: categorias, especificações por categoria, imagens, variações, preços nomeados e grupos de escolha;
- **pedidos em todos os status**, incluindo recusado, cancelado e "aguardando confirmação no WhatsApp", com itens como cópia congelada e histórico;
- a trilha de auditoria correspondente.

É **determinística**: identificadores derivados de nomes estáveis por resumo criptográfico, datas por deslocamento a partir de 05/01/2026 12:00 UTC e ordem de inserção fixa. Duas cargas em bancos vazios dão o mesmo banco; a única coluna que difere é `stores.updated_at`, preenchida pelo gatilho. No fim, a carga abre uma conexão como `sc_app` e confere que cada vitrine enxerga só o próprio catálogo. Ela recusa banco que já tem dado e recusa produção.

## 7. Testes e verificação

### 7.1 Os projetos do Vitest

| Projeto     | O que roda                                                                                                   | Precisa de            |
| ----------- | ------------------------------------------------------------------------------------------------------------ | --------------------- |
| `unit`      | `apps/api/src/**/*.test.ts`, testes de `packages/*` (menos `database` e `testing`) e `infra/tests/*.test.ts` | nada além do processo |
| `web`       | `apps/web/tests` e testes em `apps/web/src`, com jsdom                                                       | nada além do processo |
| `api-int`   | `apps/api/tests` e `apps/api/src/**/*.int.test.ts` (menos `jobs`)                                            | PostgreSQL de teste   |
| `db-rls`    | testes de `packages/database`, `packages/testing` e `infra/tests/*.int.test.ts`                              | PostgreSQL de teste   |
| `filas`     | `apps/api/src/jobs/**/*.int.test.ts`                                                                         | Redis de teste        |
| `cache-int` | `apps/api/src/**/*.redis.test.ts`                                                                            | Redis de teste        |

**Banco descartável:** em `api-int` e `db-rls`, cada arquivo recebe um banco próprio (`sc_teste_*`), copiado de um molde já migrado (`sc_molde_<impressão digital das migrações>`) e apagado no fim, mesmo quando o teste falha (`packages/testing/src/vitest-banco.ts`). O banco de desenvolvimento nunca é tocado. Esses dois projetos e o `cache-int` rodam um arquivo por vez. Cada teste monta o próprio cenário com os construtores de `packages/testing`, e as filas e o cache isolam as chaves num prefixo por arquivo. Os testes leem o `.env` da raiz sozinhos.

### 7.2 Rodar um arquivo ou um projeto

```bash
bash infra/scripts/up.sh core test                         # bancos e Redis no ar
pnpm vitest run apps/api/tests/pedido-idempotente.test.ts  # um arquivo
pnpm vitest run --project web                               # um projeto inteiro
```

Nunca conserte pulando o teste: `skip` não conta como prova e a auditoria acusa.

### 7.3 Ponta a ponta (Playwright)

O Playwright sobe a API (porta 3101) e constrói e sobe o site (porta 3100) sozinho, contra o PostgreSQL e o Redis que o Docker mantém no ar. Os cenários rodam nos projetos `publico` (sem JavaScript) e `celular`. O ponta a ponta **não entra no portão**: roda antes de publicar e quando se mexe em fluxo.

```bash
# banco descartável (o jeito preferido): cria sc_e2e_<hex>, aplica as migrações
# da branch, planta a carga de exemplo, roda e apaga o banco mesmo na falha
node e2e/run-isolado.mjs specs/checkout.spec.ts

# contra o banco de desenvolvimento do .env (cria lojas de teste, como e2e-painel)
PLAYWRIGHT_CHANNEL=chrome pnpm --filter @simpleclick/e2e test:e2e
```

- `PLAYWRIGHT_CHANNEL=chrome` usa o Chrome instalado na máquina, porque o navegador próprio do Playwright não está instalado aqui. No Windows, o `run-isolado.mjs` já define isso sozinho.
- Os cenários do painel usam a loja `e2e-painel`, com sessão de dono emitida pela fixture.
- Antes de rodar, derrube qualquer processo nas portas 3100 e 3101: o Playwright reaproveita o servidor que encontrar lá, mesmo que seja um antigo.
- A construção do site dentro do ponta a ponta pode levar minutos; o limite configurado é de 600 s.

### 7.4 O portão de qualidade

`bash infra/scripts/verificar.sh` (ou `make verificar`) roda tudo nesta máquina. Saída 0 é limpo; qualquer outra coisa é reprovado, e o resumo diz quais etapas falharam. `--listar` mostra as etapas e `--somente <trecho>` roda só as que têm o trecho no nome (serve para consertar, não conta como aprovação). As etapas, na ordem:

| #   | Etapa                                     | O que fazer quando reprova                                                                                                                                    |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | separação de ambientes                    | aponte `DATABASE_URL_TEST` e `REDIS_URL_TEST` para outro banco e outro Redis (ou índice)                                                                      |
| 2   | cliente tipado do banco                   | `pnpm db:gerar`; se falhar, o erro está em `schema.prisma`                                                                                                    |
| 3   | formatação                                | `pnpm prettier --write .`                                                                                                                                     |
| 4   | qualidade de código                       | leia a regra que o ESLint citou; não desligue regra de fronteira (P-004, P-013) nem de cor; `pnpm lint:fix` resolve o mecânico                                |
| 5   | segredo no código                         | tire o valor do código e leia de variável validada; se já entrou no histórico, troque o segredo                                                               |
| 6   | auditoria da especificação                | `TASK_CONCLUIDA_SEM_PROVA` (tarefa pronta sem prova), `TESTE_ORFAO` (teste cita critério que não existe), `REF_QUEBRADA`                                      |
| 7   | verificação de tipos                      | `pnpm turbo run typecheck`                                                                                                                                    |
| 8   | contrato publicado em dia                 | confira se a mudança é intencional e rode `pnpm --filter @simpleclick/api run contrato:escrever`                                                              |
| 9   | testes de unidade                         | `pnpm vitest run --project unit`                                                                                                                              |
| 10  | testes do site (estados e acessibilidade) | `pnpm vitest run --project web`                                                                                                                               |
| 11  | testes do cache (Redis de teste)          | suba o Redis de teste                                                                                                                                         |
| 12  | testes de fila (Redis)                    | suba o Redis de teste                                                                                                                                         |
| 13  | banco local em dia com as migrações       | `node --env-file=.env packages/database/src/migrate.ts aplicar`; se uma migração foi editada depois de aplicada, desfaça a edição e escreva uma migração nova |
| 14  | testes de integração (banco efêmero)      | suba o banco de teste (`up.sh core test`) e confira `DATABASE_URL_TEST`                                                                                       |
| 15  | migração compatível com a versão anterior | reescreva conforme a seção 6.1                                                                                                                                |
| 16  | guardas estruturais do banco              | conserte na migração, nunca no banco à mão (`bash infra/scripts/db-guards.sh`)                                                                                |

O portão carrega o `.env` antes de começar. O diário de cada etapa não fica guardado: para investigar, redirecione a saída inteira para um arquivo. A mesma versão verificada duas vezes dá o mesmo resultado (versões fixas, banco criado do zero, saída sem cor fora do terminal).

**A ordem que economiza tempo:** formatar, depois gravar as provas, depois o portão — `pnpm prettier --write .`, `bash infra/scripts/provar.sh`, `bash infra/scripts/verificar.sh`. O Prettier reescreve arquivo de teste, e isso envelhece a prova de todas as features.

### 7.5 Os ganchos (lefthook)

Instalados pelo `pnpm install`. A divisão entre eles é de custo:

- **antes do commit** (em paralelo, só no que foi preparado): `formatacao` (Prettier, e reprepara o que ajustou), `qualidade` (ESLint sem aviso), `tipos` (`turbo run typecheck`, que só paga pelo pacote alterado), `segredos` (`check-segredos.sh`) e `registro-de-pulo` (`registrar-pulo.sh`);
- **na mensagem**: `check-mensagem.sh` (seção 9);
- **antes do envio**: o portão inteiro, `verificar.sh`. Se reprovar, nada é enviado.

`LEFTHOOK=0 git push` desliga o gancho e funciona, mas não passa em silêncio: o portão anota em `.git/portao-verificados` cada versão que aprovou, e o próximo commit compara isso com o que foi enviado. Versão enviada sem aprovação vira uma linha em `docs/pendencias.md` ("Portão contornado"), com data, versão, ramo e o que ficou sem verificação. Para quitar: volte à versão, rode o portão até sair limpo e apague a linha.

### 7.6 O método spec-driven (ONP)

- Cada feature tem `spec.md` com histórias e critérios de aceite (`AC-xxx`) e `tasks.md` com tarefas (`T-xxx`). A constituição traz os princípios (`P-xxx`).
- O teste se liga ao critério pelo nome: `it("@spec:AC-043 o pulo vira dívida escrita…", …)`. Princípio usa `@principle:P-xxx`.
- O motor fica em `~/.claude/skills/onp-spec-driven/scripts/onp-spec.mjs`. Os comandos mais usados:
  - `node <motor> status` — visão geral das features e dos critérios provados;
  - `node --env-file=.env <motor> verify <feature>` — roda o `testCommand` do `onpspec.config.json`, lê o relatório JSON do Vitest e grava em `.spec/verification/<feature>.json` o resultado de cada critério e a versão do código;
  - `node <motor> audit` (`make audit`) — confronta especificação, tarefas e testes; é o veredito para declarar uma feature pronta. O portão usa só a parte de regressão (`audit-regressao.mjs`);
  - `node <motor> tarefa <feature> <T-xxx> <status>` — muda o estado de uma tarefa.
- Qualquer mudança em código ou teste envelhece a prova (`VERIFY_OBSOLETO`), e tarefa marcada concluída sem prova do critério dela reprova a auditoria.
- `verify` roda a suíte inteira e leva de 10 a 30 minutos nesta máquina; rode um de cada vez (seção 10).

## 8. Publicação

**Nada está publicado.** O domínio fica para o fim do projeto (decisão de 17/08). O mecanismo existe e é provado por teste; conta no provedor, domínio e primeira publicação são tarefas da fase de publicação.

| Peça                              | Onde                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| Site (Next)                       | Vercel, construindo do repositório (`apps/web/Dockerfile` existe para rodar fora dela) |
| API, PostgreSQL e Redis           | Railway, construindo `apps/api/Dockerfile`                                             |
| Configuração da publicação da API | `infra/railway/railway.json`                                                           |
| Comando antes da troca de versão  | `infra/railway/pre-deploy.sh`                                                          |

### 8.1 A ordem

1. **Portão local** (`verificar.sh`). Não passou, não publica.
2. **Imagem nova** construída. A versão antiga continua atendendo.
3. **Pré-publicação dentro da imagem** (`pre-deploy.sh`), em cinco etapas: separação de ambientes (`check-ambientes.sh --producao` recusa `DATABASE_URL_TEST` ou `REDIS_URL_TEST` presentes), compatibilidade da migração, conexão direta (recusa agrupador em `DATABASE_URL_DIRETA`), aplicar as migrações com a credencial de migração e conferir o banco. Qualquer falha interrompe a publicação, e a versão antiga continua no ar.
4. **Troca de versão**: o provedor manda tráfego para a nova.
5. **Saúde**: `GET /v1/health/ready`, que consulta banco e cache.

A migração acontece **antes** de a versão nova receber a primeira requisição (AC-029), nunca na partida do processo: migrar na partida põe a versão nova no ar com o esquema ainda mudando e faz duas instâncias disputarem a migração.

### 8.2 Variáveis do serviço da API

Vêm do cofre do provedor, nunca de arquivo: `DATABASE_URL` (pelo agrupador), `DATABASE_URL_DIRETA` (direta, credencial de migração), `REDIS_URL`, `SENHA_BANCO_MIGRADOR`, `SENHA_BANCO_APLICACAO`, `SENHA_BANCO_ADMINISTRACAO`, `JWT_SECRET`, `ORIGENS_PERMITIDAS`, `PORT` (o provedor injeta; a imagem traz 3001) e, opcional, `SEGUNDO_PLANO`. **Não podem existir** ali `DATABASE_URL_TEST` nem `REDIS_URL_TEST`. `API_PORT` não deve ser cadastrada. A lista ainda não inclui as variáveis que entraram depois (`URL_DO_SITE`, `SEGREDO_DE_REVALIDACAO`, `CLOUDINARY_URL` e as que virão com e-mail e armazenamento privado): ver as lacunas no `HarnessPlan.md`.

### 8.3 Troca de versão e desligamento

No sinal de término, a API para de aceitar conexão, entrega o que está em curso, fecha as filas, depois banco e cache, e sai com zero. Se passar de 8 s, sai sozinha com código 1 dizendo o que não fechou. O provedor precisa esperar pelo menos 10 s entre o sinal e a morte forçada (no Railway, `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`); o valor padrão ainda não foi conferido.

### 8.4 Voltar à versão anterior sem perder dado

1. Volte a versão do serviço pelo painel do provedor.
2. **Não desfaça a migração**: as regras da seção 6.1 garantem que a versão anterior funciona no banco migrado. Migração "para baixo" não existe neste projeto de propósito.
3. Confira `GET /v1/health/ready` e o registro.
4. Anote o que voltou e por quê no `HarnessPlan.md`.

Se algo precisar mesmo ser desfeito, escreva uma migração nova que desfaz, seguindo as mesmas regras.

### 8.5 As imagens

As duas seguem três regras verificadas por teste: vários estágios, nenhuma dependência de desenvolvimento na imagem final e processo rodando como `node`. A prova é da receita; construir e conferir de verdade se faz à mão:

```bash
docker build -f apps/api/Dockerfile -t simpleclick-api .
docker build -f apps/web/Dockerfile -t simpleclick-web .
docker run --rm simpleclick-api id -un            # tem de responder node
docker run --rm -d -p 3001:3001 --name sc-api simpleclick-api
curl -s http://127.0.0.1:3001/v1/health/live
docker stop sc-api
```

Para ensaiar o `pre-deploy.sh` sem publicar, rode-o com `env -i` e as variáveis apontando para um **banco descartável** (o script não lê `.env` de propósito); o roteiro está no cabeçalho do próprio script. Nunca aponte o ensaio para o banco de desenvolvimento.

## 9. Convenções

- **Mensagem de commit** (`check-mensagem.sh`): `T-xxx <feature>: resumo` para trabalho de tarefa (uma tarefa, um commit), ou `chore`, `docs`, `infra`, `spec`, `fix`, `feat` ou `test`, com escopo opcional entre parênteses, seguido de `: resumo` com pelo menos cinco caracteres. `test:` é a prova vermelha commitada sozinha, antes da correção. `Merge`, `Revert`, `fixup!` e `squash!` passam direto.
- **Nada de tecnologia nova sem o dono pedir.** A pilha é Node/TypeScript de ponta a ponta. Ferramenta, script ou agente novo nasce em TypeScript dentro do monorepo, e dependência nova precisa de benefício demonstrável (P-014).
- **Arquivos curtos**: arquivo novo fica abaixo de 500 linhas. Cada função tem um comentário curto e direto dizendo o que faz; o cabeçalho do arquivo diz por que ele existe.
- **Português** no código, nos testes, nas mensagens e na documentação. Os nomes das pastas ficam como estão.
- **Não edite migração aplicada**, não pule o portão e não desligue regra do ESLint para passar.
- **Os princípios da constituição** (`.spec/constituicao.md`):

| Princípio | Regra                                                        |
| --------- | ------------------------------------------------------------ |
| P-001     | todo requisito tem prova executável                          |
| P-002     | segredo nunca em código                                      |
| P-003     | isolamento entre lojas provado por teste                     |
| P-004     | acesso ao banco só pela camada de dados (`core/db.ts`)       |
| P-005     | dinheiro é inteiro em centavos                               |
| P-006     | preço e total vêm do servidor                                |
| P-007     | toda entrada externa é validada na borda                     |
| P-008     | token de sessão nunca fica acessível a script                |
| P-009     | dado pessoal não vai para o registro                         |
| P-010     | pedido é registro imutável                                   |
| P-011     | toda tela cobre carregando, vazio, erro e sucesso            |
| P-012     | interface acessível e pensada primeiro para o celular        |
| P-013     | função com uma responsabilidade (recomendado)                |
| P-014     | nada de dependência sem benefício demonstrável (recomendado) |

## 10. Problemas conhecidos do ambiente

**Fim de linha CRLF.** Com `core.autocrlf=true` no Windows, o checkout gravava CRLF, e o Prettier, a leitura de `verificar.sh` e o contrato reprovavam sem mudança real. O `.gitattributes` (`* text=auto eol=lf`) resolve para arquivos novos. Para regravar uma árvore antiga, com ela limpa (`git status` vazio):

```bash
# se o onpspec.config.json for local (skip-worktree), guarde-o antes
cp onpspec.config.json /tmp/onpspec.bak
git ls-files -z | xargs -0 rm -f && git checkout -- .
cp /tmp/onpspec.bak onpspec.config.json
git status --short    # tem de sair vazio
```

**O contêiner de CI tomando a porta 5433.** Ao abrir o Docker Desktop, o `simpleclick-ci-postgres-test-1` (do compose de CI, com volume antigo e outra senha) pode pegar a 5433, e o `postgres-test` do compose principal sobe sem porta. O sintoma é `password authentication failed for user simpleclick_test`. A correção:

```bash
docker stop simpleclick-ci-postgres-test-1
docker compose --env-file infra/compose/.env.compose -f infra/compose/docker-compose.yml \
  --profile test up -d --force-recreate postgres-test
```

O Redis de teste desta máquina é o do compose de CI, na porta 6380: `docker start simpleclick-ci-redis-1`. O `.env.example` propõe outra saída, igualmente válida: o índice 1 do mesmo Redis da 6379.

**Cliente do Prisma velho.** Depois de mudar `schema.prisma` (ou de trocar de branch), o cliente gerado pode ficar para trás e rotas respondem 500 em teste. Regenere: `pnpm --filter @simpleclick/database run gerar` (ou `pnpm db:gerar`).

**Máquina de 4 CPUs e 12 GB.** `verify`, a suíte inteira, o ponta a ponta e o portão são pesados: duas execuções ao mesmo tempo derrubam processos do Vitest e travam a máquina. Rode um de cada vez. Nas worktrees de faixa, use a trava compartilhada em `C:/Users/arthu/Desktop/SimpleClick/onp-worktrees/com-trava.sh`: `bash ../com-trava.sh <rotulo> <comando...>` espera a vez, mantém um batimento e descarta trava sem batimento há mais de 5 minutos. No máximo duas faixas pesadas ao mesmo tempo, e o Docker com 8 GB de memória.

**Worktrees de faixa.** Nelas o `onpspec.config.json` fica local (marcado `skip-worktree`) e aponta para `../vitest-feature.sh <feature>`, para a prova rodar só os testes da feature. Para commitar sem levar essa configuração, use `bash ../commit-faixa.sh "<mensagem>"` com os arquivos já preparados; ele também recusa `sinais.json`, logs e sobras `fora-de-formato-*`.

**Outras armadilhas:**

- No PowerShell, `bash` abre o WSL: use `C:/Program Files/Git/bin/bash.exe`.
- `.spec/verification/sinais.json` é derivado e conflita em todo merge: aceite qualquer lado e rode a auditoria de novo.
- Servidor antigo nas portas 3100 ou 3101 faz o ponta a ponta inteiro reprovar com erros que não falam disso: derrube os dois antes.
- `make seed` e os scripts do pacote de banco não carregam o `.env`: use `node --env-file=.env` (seção 5.2).
- Documentos antigos citam a porta 5533 para o banco de teste; a porta em uso é a 5433.
