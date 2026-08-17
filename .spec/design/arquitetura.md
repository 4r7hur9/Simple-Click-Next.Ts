# Arquitetura — SimpleClick v2

> Consolidação da arquitetura vencedora (lente de entrega em fatias verticais),
> ajustada às decisões registradas em [decisoes.md](decisoes.md) e às lacunas
> apontadas em [critico-de-completude.md](critico-de-completude.md).
> O modelo de dados está em [modelo-de-dados.md](modelo-de-dados.md) e o
> inventário de telas em [mapa-de-telas.md](mapa-de-telas.md).

## 1. Princípio organizador

Uma **fatia vertical** é uma linha completa que atravessa o sistema inteiro e é
demonstrável para alguém que não é programador: da loja cadastrada até o pedido
saindo no WhatsApp. O projeto é construído fatia por fatia, e cada fatia deixa o
sistema em estado apresentável. Nenhuma fase entrega "só o backend" ou "só a
tela".

## 2. Árvore de pastas

Regra que atende ao pedido de clareza sem cascata: **no máximo quatro níveis**
dentro de `src/`. Onde a árvore precisaria de um quinto nível, o nome do arquivo
carrega a distinção em vez da pasta.

```
SC/
├─ package.json                  # workspace raiz (pnpm)
├─ pnpm-workspace.yaml           # apps/*, packages/* + catálogo de versões
├─ turbo.json                    # build, typecheck, lint, test:unit, test:int, test:e2e, contrato, guardas
├─ vitest.config.ts              # projetos: unit | api-int | web | db-rls
├─ lefthook.yml                  # antes do commit: formatação, tipos; antes do envio: testes de unidade
├─ Makefile                      # setup, up, down, seed, test, guards  (AC-001: um comando sobe tudo)
├─ .env.example                  # toda variável obrigatória, sem valor real (P-002)
│
├─ .spec/                        # metodologia (já existe)
│  ├─ constituicao.md            # P-001..P-014
│  ├─ design/                    # arquitetura, modelo de dados, mapa de telas, decisões
│  └─ features/<feature>/        # spec.md + tasks.md
│
├─ .github/workflows/
│  ├─ pr.yml                     # tipos, formatação, unidade, integração, build, fumaça, auditoria da spec
│  ├─ main.yml                   # ponta a ponta completo + acessibilidade + regressão visual
│  ├─ db-guards.yml              # guardas estruturais do banco (G1..G9)
│  └─ contrato.yml               # regenera o contrato e reprova qualquer divergência (AC-007)
│
├─ infra/
│  ├─ compose/docker-compose.yml # perfis: core | app | test | print
│  │                             #   traefik, postgres-dev, postgres-test (efêmero), redis,
│  │                             #   api, web, emulador-de-impressora
│  ├─ traefik/                   # roteador local: *.localhost com TLS de desenvolvimento
│  ├─ scripts/
│  │  ├─ setup.sh                # idempotente: certificado local, dependências, validação
│  │  ├─ db-guards.sh            # executa as guardas SQL; qualquer linha devolvida reprova
│  │  ├─ check-sem-middleware.sh # reprova se existir middleware.ts (Next 16 o ignora em silêncio)
│  │  └─ check-ambientes.sh      # reprova se produção e teste apontarem para o mesmo banco (AC-031)
│  └─ railway/pre-deploy.sh      # migração com credencial de migração, antes de trocar a versão (AC-029)
│
├─ e2e/                          # Playwright na raiz
│  ├─ playwright.config.ts       # projetos: setup | publico | cliente | dono | admin | a11y | visual
│  ├─ fixtures/                  # sessão salva por papel, loja de teste, interceptação do WhatsApp
│  └─ specs/                     # um arquivo por área + manifesto de rotas
│
├─ apps/
│  ├─ web/                       # Next 16 · App Router · Server Components
│  │  └─ src/
│  │     ├─ proxy.ts             # host → apelido da loja, reescrita, redirecionamento otimista. SEM autorização real
│  │     ├─ app/                 # rotas (ver mapa-de-telas.md)
│  │     │  ├─ (loja)/l/[slug]/  # subárvore pública: vitrine, produto, carrinho, checkout, acompanhamento
│  │     │  ├─ (conta)/          # entrar, cadastrar, verificar e-mail, minha conta
│  │     │  ├─ (painel)/painel/  # dono: pedidos, catálogo, clientes, configurações, métricas
│  │     │  ├─ (admin)/admin/    # administração: lojas, documentos, funcionalidades, auditoria
│  │     │  ├─ imprimir/[id]/    # HTML puro do cupom, para impressão por clique
│  │     │  └─ (dev)/ui/         # vitrine do design system (alvo da verificação de acessibilidade)
│  │     ├─ features/            # UI por feature; marcação de cliente só nas folhas interativas
│  │     ├─ server/              # tudo com marcação de servidor
│  │     │  ├─ api-client.ts     # única porta de saída HTTP para a API
│  │     │  ├─ sessao.ts         # leitura e verificação de sessão, memoizada por requisição
│  │     │  ├─ cache.ts          # envelopes de cache: identificador da loja SEMPRE no primeiro argumento
│  │     │  └─ actions/          # ações de servidor: SÓ mutação
│  │     └─ lib/                 # formatação, dados estruturados, tema, tabela de rotas
│  │
│  └─ api/                       # Express + TypeScript · fonte única de verdade de negócio
│     └─ src/
│        ├─ main.ts              # inicialização: valida ambiente, monta middlewares, sobe servidor
│        ├─ app.ts              # composição do Express (sem escutar porta — testável)
│        ├─ core/                # preocupações transversais
│        │  ├─ env.ts            # validação das variáveis na partida (AC-002)
│        │  ├─ contexto.ts       # contexto da requisição: quem, qual loja, qual transação
│        │  ├─ db.ts             # abre transação e define o contexto da loja — ÚNICO caminho ao banco
│        │  ├─ erros.ts          # tipos de erro do domínio → resposta sem vazar interno (AC-024)
│        │  ├─ log.ts            # registro estruturado com lista do que é permitido registrar (AC-022)
│        │  ├─ validar.ts        # borda única de validação de entrada (P-007)
│        │  ├─ cors.ts           # lista fechada de origens autorizadas (AC-125..AC-128)
│        │  ├─ limite.ts         # limite de tentativas por conta e por origem (AC-119, AC-120)
│        │  └─ cache.ts          # chaves de cache sempre com identificador da loja (AC-027)
│        ├─ modules/             # um diretório por domínio, cada um com a mesma forma
│        │  ├─ auth/             # rotas, casos de uso, esquemas de entrada, e-mails
│        │  ├─ stores/           # cadastro, configurações, horários, domínios
│        │  ├─ catalog/          # categorias, especificações, produtos, preços, opções, estoque
│        │  ├─ storefront/       # leitura pública da vitrine (saída com lista de campos permitidos)
│        │  ├─ cart/             # carrinho e conferência de preço
│        │  ├─ orders/           # criação, status, histórico, pedido manual
│        │  ├─ printing/         # fila de impressão, pareamento e entrega ao agente
│        │  ├─ customers/        # clientes da loja
│        │  ├─ metrics/          # métricas por período
│        │  ├─ admin/            # administração da plataforma
│        │  └─ files/            # upload por link assinado
│        ├─ jobs/                # trabalho em segundo plano: e-mail, impressão, rollup
│        └─ contracts/           # geração do documento de contrato a partir dos esquemas
│
└─ packages/
   ├─ contracts/                 # esquemas compartilhados web ↔ API ↔ aplicativos nativos
   ├─ database/                  # migrações, políticas, guardas SQL, dados de exemplo
   │  ├─ migrations/             # numeradas, versionadas, aplicadas em ordem (AC-032)
   │  ├─ policies/               # políticas de isolamento por tabela
   │  ├─ guards/                 # G1..G9: reprovam tabela sem isolamento, única global indevida etc.
   │  └─ seed/                   # dados de exemplo determinísticos (AC-036, AC-037)
   ├─ core/                      # regras puras, sem dependência de framework
   │  ├─ dinheiro.ts             # centavos inteiros, formatação (P-005)
   │  ├─ pedido-total.ts         # cálculo do total: itens, opções, taxa, mínimo
   │  ├─ cupom-texto.ts          # gerador do texto do WhatsApp (função pura, testada por comparação)
   │  ├─ cupom-blocos.ts         # gerador dos blocos do cupom impresso (mesmo conteúdo, outra saída)
   │  ├─ horario-loja.ts         # está aberta agora? no fuso da loja
   │  └─ maquina-status.ts       # transições válidas do pedido
   ├─ ui/                        # design system: tokens, componentes base, tema por loja
   ├─ testing/                   # construtores de dados de teste determinísticos
   └─ config-*/                  # configurações compartilhadas de tipos e formatação
```

## 3. Regras de fronteira (verificadas por AC-005)

| Camada                | Pode importar                        | Nunca importa                                              |
| --------------------- | ------------------------------------ | ---------------------------------------------------------- |
| `packages/core`       | nada do projeto                      | banco, HTTP, React, Express                                |
| `packages/contracts`  | nada do projeto                      | qualquer aplicação                                         |
| `packages/database`   | `contracts`                          | `apps/*`                                                   |
| `apps/api/modules/*`  | `core`, `contracts`, `apps/api/core` | outro módulo diretamente, cliente de banco próprio (P-004) |
| `apps/web/features/*` | `ui`, `contracts`, `lib`             | `apps/api`, banco, `server/*` diretamente                  |
| `apps/web/app/*`      | `features`, `server`, `ui`           | `apps/api`                                                 |
| `apps/web/server/*`   | `contracts`, `core`                  | `features`                                                 |

Módulo fala com módulo **pelo caso de uso**, nunca importando o repositório do
vizinho. Quando dois módulos precisam da mesma regra, ela sobe para
`packages/core`.

## 4. Caminho de uma requisição autenticada até o banco

O trecho mais importante da arquitetura, porque é o que faz o isolamento valer.

1. **Navegador** → `simpleclick.app`. O cookie de sessão viaja no domínio
   compartilhado (`Domain=.simpleclick.app`, `Secure`, `httpOnly`,
   `SameSite=Lax`), consequência da decisão de domínio próprio.
2. **`apps/web/src/proxy.ts`** resolve host e apelido da loja, reescreve para a
   subárvore correta e faz redirecionamento otimista por papel. **Não autoriza
   nada** — é otimista por natureza e não pode ser a única defesa.
3. **Server Component** chama `server/sessao.ts`, que verifica a sessão de fato.
   Aqui mora a autorização real da camada web.
4. **`server/api-client.ts`** chama `api.simpleclick.app` com o token no
   cabeçalho de autorização. É a única porta de saída HTTP do web.
5. **`apps/api/core/cors.ts`** confere a origem contra a lista fechada e recusa o
   que não estiver nela (AC-125..AC-128).
6. **`core/validar.ts`** valida corpo, parâmetros e consulta pelo esquema
   declarado. Entrada não validada não passa (P-007).
7. **Middleware de autenticação** decodifica o token, descobre quem é e a qual
   loja pertence, e monta o contexto da requisição.
8. **`core/db.ts`** abre **uma transação** e define nela o contexto da loja e do
   papel, com valores que valem só até o fim daquela transação. É o único caminho
   para o banco (P-004), e é isso que impede o contexto de escapar entre
   requisições quando as conexões são reaproveitadas (AC-011).
9. **Caso de uso** no módulo executa a regra de negócio, chamando o repositório
   que usa a transação do contexto.
10. **PostgreSQL** aplica as políticas de isolamento. Consulta sem contexto não
    devolve nada (AC-009); tentativa de alcançar outra loja falha ou devolve
    vazio (AC-010).
11. **Resposta** volta com lista de campos permitidos por tipo de leitor — a
    vitrine pública nunca serializa configuração interna da loja (AC-904).

Detalhe que o modelo de dados provou e a camada de dados precisa respeitar:
alteração que atravessa loja devolve **zero linhas sem erro**. Por isso é norma
do repositório conferir quantas linhas foram afetadas e responder "não
encontrado" quando for zero — sem isso, o dono de outra loja recebe sucesso e
nada acontece, um defeito invisível.

## 5. Rotas da API

Prefixo de versão `/v1` em tudo, porque os aplicativos nativos vão depender de
estabilidade.

| Método e rota                                                      | Papel   | Propósito                                              |
| ------------------------------------------------------------------ | ------- | ------------------------------------------------------ |
| `POST /v1/auth/register`                                           | público | cadastro de cliente final                              |
| `POST /v1/auth/login`                                              | público | senha; devolve desafio de segundo fator quando exigido |
| `POST /v1/auth/2fa/verify`                                         | público | confirma código ou aplicativo e cria sessão            |
| `POST /v1/auth/refresh`                                            | sessão  | renova com rotação e detecção de reuso                 |
| `POST /v1/auth/logout` · `/logout-all`                             | sessão  | encerra sessão atual ou todas                          |
| `POST /v1/auth/verify-email` · `/resend`                           | público | verificação de e-mail                                  |
| `POST /v1/auth/password/forgot` · `/reset`                         | público | recuperação de senha                                   |
| `POST /v1/auth/totp/setup` · `/confirm` · `/recovery`              | sessão  | aplicativo autenticador                                |
| `GET /v1/storefront/:slug`                                         | público | dados da loja para a página de apresentação            |
| `GET /v1/storefront/:slug/catalog`                                 | público | catálogo completo, em cache por loja                   |
| `GET /v1/storefront/:slug/products/:id`                            | público | detalhe do produto com grupos de opção                 |
| `POST /v1/storefront/:slug/cart/price`                             | público | confere preços e total antes de fechar                 |
| `POST /v1/storefront/:slug/orders`                                 | público | cria o pedido (idempotente por chave)                  |
| `GET /v1/orders/track/:token`                                      | público | acompanhamento por token não enumerável                |
| `POST /v1/orders/track/:token/sent`                                | público | cliente sinaliza que enviou no WhatsApp                |
| `GET /v1/store/orders`                                             | dono    | fila de pedidos                                        |
| `GET /v1/store/orders/:id`                                         | dono    | detalhe do pedido                                      |
| `PATCH /v1/store/orders/:id/status`                                | dono    | avança, recusa ou cancela                              |
| `POST /v1/store/orders`                                            | dono    | pedido manual                                          |
| `POST /v1/store/orders/:id/print` · `/reprint`                     | dono    | enfileira cupom e segunda via                          |
| `GET /v1/store/categories` · `POST` · `PATCH /:id` · `DELETE /:id` | dono    | categorias                                             |
| `GET/POST/PATCH/DELETE /v1/store/categories/:id/specs`             | dono    | criador de especificações                              |
| `GET /v1/store/products` · `POST` · `PATCH /:id` · `DELETE /:id`   | dono    | produtos                                               |
| `PUT /v1/store/products/:id/prices`                                | dono    | preços do produto                                      |
| `PUT /v1/store/products/:id/option-groups`                         | dono    | grupos de escolha                                      |
| `PATCH /v1/store/variants/:id/stock`                               | dono    | ajuste de estoque com motivo                           |
| `GET /v1/store/customers` · `POST` · `PATCH /:id` · `DELETE /:id`  | dono    | clientes                                               |
| `GET /v1/store/customers/:id/orders`                               | dono    | histórico do cliente                                   |
| `GET /v1/store/settings` · `PUT /v1/store/settings/:secao`         | dono    | configurações por seção                                |
| `GET /v1/store/metrics`                                            | dono    | métricas por período                                   |
| `GET /v1/store/metrics/export`                                     | dono    | exportação do período                                  |
| `POST /v1/store/print-agents/pair`                                 | dono    | pareamento do agente                                   |
| `GET /v1/print/jobs` · `POST /v1/print/jobs/:id/ack`               | agente  | fila de impressão                                      |
| `GET /v1/admin/stores` · `POST` · `PATCH /:id`                     | admin   | lojas                                                  |
| `PATCH /v1/admin/stores/:id/vertical`                              | admin   | tipo de negócio                                        |
| `PATCH /v1/admin/stores/:id/status`                                | admin   | suspender e reativar                                   |
| `POST /v1/admin/stores/:id/contracts`                              | admin   | contrato e documentos                                  |
| `PUT /v1/admin/stores/:id/features`                                | admin   | funcionalidades liberadas                              |
| `GET /v1/admin/audit`                                              | admin   | histórico de auditoria                                 |
| `POST /v1/files/sign`                                              | sessão  | link assinado para upload direto                       |
| `GET /v1/health/live` · `/ready`                                   | público | verificações de saúde (AC-023)                         |

## 6. Onde mora cada preocupação transversal

| Preocupação              | Lugar                                                    | Regra                                                                                                 |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Validação de entrada     | `api/core/validar.ts` + `modules/*/…schema.ts`           | borda única; nada chega ao domínio sem validar (P-007)                                                |
| Erros                    | `api/core/erros.ts`                                      | erro de domínio tipado → resposta genérica com código de referência (AC-024)                          |
| Registro                 | `api/core/log.ts`                                        | lista do que pode ser registrado; dado pessoal nunca entra (P-009, AC-022)                            |
| Cache                    | `api/core/cache.ts` + `web/server/cache.ts`              | chave sempre começa com o identificador da loja (AC-027); invalidação por versão de catálogo (AC-028) |
| Filas                    | `api/jobs/*`                                             | e-mail, impressão e rollup; tentativa com espera crescente (AC-026)                                   |
| Upload                   | `api/modules/files`                                      | link assinado, conteúdo conferido pelos bytes, nunca pelo nome (AC-204, AC-306)                       |
| Impressão                | `packages/core/cupom-blocos.ts` + `api/modules/printing` | um só gerador de conteúdo, duas saídas (navegador e agente), equivalência testada                     |
| WhatsApp                 | `packages/core/cupom-texto.ts`                           | função pura, testada por comparação com texto esperado                                                |
| Isolamento               | `api/core/db.ts` + `packages/database/policies`          | contexto por transação; nenhum outro caminho ao banco (P-004)                                         |
| Funcionalidades por loja | `api/modules/admin`                                      | consultadas no contexto da requisição (AC-212)                                                        |

## 7. Fases de implementação

Cada fase termina com o portão de qualidade limpo e algo demonstrável.

| Fase   | Nome                    | Entrega demonstrável                                                                                                                                                  | Depende de |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **F0** | Fundação                | ambiente sobe com um comando, banco isolado com políticas e guardas, design system com os quatro estados, portão de qualidade reprovando critério sem teste           | —          |
| **F1** | Primeira fatia completa | administração cria loja → dono cadastra produto → cliente vê vitrine, abre produto, monta carrinho, fecha pedido → texto sai no WhatsApp → cliente acompanha por link | F0         |
| **F2** | Operação da loja        | fila de pedidos ao vivo, status, cupom impresso por clique, configurações (PIX, entrega, horário, contato, aparência, impressão)                                      | F1         |
| **F3** | Catálogo completo       | categorias com criador de especificações, grupos de escolha, preços múltiplos, imagens, estoque por variação                                                          | F1         |
| **F4** | Painel e clientes       | métricas por período com os três números, clientes da loja, pedido manual, histórico                                                                                  | F2, F3     |
| **F5** | Identidade completa     | segundo fator, aplicativo autenticador, recuperação, sessões, auditoria, documentos e funcionalidades no admin                                                        | F1         |
| **F6** | Impressão automática    | agente de impressão, pareamento, fila com confirmação, modo automático por chave                                                                                      | F2         |

F3 e F5 podem ser construídas em paralelo com F2, porque tocam arquivos
diferentes. F4 depende das duas.
