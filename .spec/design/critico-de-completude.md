# Crítico de completude — lacunas apontadas contra os requisitos originais

> Gerado por agente independente que confrontou o pacote de especificações
> contra a lista de requisitos do dono do produto. Vale como pauta de correção.

## Estado do pacote auditado

`/Users/stargrupo/Documents/SC/.spec/` — 9 specs (211 critérios de aceite, 57 US), 1 documento de projeto (`design/modelo-de-dados.md`, 2.940 linhas, 59 entidades + policies RLS + 9 guardas de CI), `constituicao.md` (14 princípios), `verification/sinais.json`, `onpspec.config.json`. Zero código.

**Lacuna estrutural que atravessa tudo:** os 9 `tasks.md` são o template em branco (`T-001 — [título da tarefa]`, `Arquivos: src/exemplo.js`, refs para AC que não existem na feature — daí os 8 `REF_QUEBRADA` e 9 `ARQUIVO_INEXISTENTE` em `sinais.json`). A cadeia prometida pela metodologia (história → AC → **tarefa** → teste) está partida no meio: 165 `AC_SEM_TASK`, 199 `AC_SEM_TESTE`, e o `sinais.json` é de um estado com ~40 AC menos que o atual (foi rodado antes de US-306/307 e AC-214 entrarem) — ou seja, nem o número de "faltando prova" está atualizado. Também: **8 das 9 features não têm etapa de projeto** — só `fundacao` tem design; catálogo, checkout, operação, métricas, clientes, admin, vitrine e identidade vão de spec direto para nada.

---

## A) Requisitos do usuário não cobertos ou cobertos só de raspão

| Requisito original                               | O que falta                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CORS** (explícito na lista)                    | Zero ocorrências em todo o pacote. Nenhum AC, nenhuma suposição, nenhum princípio. Nem allowlist de origens, nem preflight, nem o caso real: web em domínio Vercel + API em domínio Railway = cookie de sessão _cross-site_.                                                                                                                                                                                                                                      |
| **JWT bearer + cookie httpOnly**                 | AC-109/110/111 cobrem bem rotação e reuso, mas **CSRF não existe no pacote** (grep vazio). Cookie httpOnly + rota mutável na API sem token anti-CSRF nem checagem de Origin é lacuna de segurança, e AC-109 exige "SameSite" sem dizer qual — `Lax` mata o fluxo cross-site, `None` exige HTTPS + terceiro-partidão bloqueado por Safari/Chrome.                                                                                                                  |
| **Campo de chave PIX manual**                    | Só o consumo existe (AC-510/511, "loja que **cadastrou** chave PIX"). **Não há uma única história do dono cadastrando/editando a chave**, o tipo de chave, o nome do recebedor, nem estado "loja sem PIX".                                                                                                                                                                                                                                                        |
| **LP por loja**                                  | AC-400 renderiza a LP; **ninguém a edita**. Sem US/AC para mensagem de boas-vindas, texto "sobre", banners do hero, logo, cor principal — tudo existe em `store_settings` no banco e em lugar nenhum na spec.                                                                                                                                                                                                                                                     |
| **Configurações da loja em geral**               | Lacuna maior do pacote: **não existe feature de configurações do OWNER**. Horário de funcionamento e exceções (`store_hours`, `store_hour_exceptions`), taxa de entrega (pressuposta em AC-507), modos entrega/retirada (pressuposto em AC-506), número de WhatsApp (pressuposto em AC-520), formas de pagamento (AC-512), largura de papel 58/80 mm (pressuposta em AC-618), tema/logo (AC-015) — **11 ACs consomem configurações que nenhum AC permite criar**. |
| **Impressão térmica automática ao criar pedido** | Invertido para opt-in (ASM-600 "confirmada": padrão é por clique). É decisão registrada, mas **contraria o requisito escrito** e vale reconfirmar. Pior: o **agente de impressão é um aplicativo desktop inteiro** (US-605, AC-622..626) sem feature própria, sem design, sem plano de instalação/atualização/pareamento/assinatura de binário, sem escolha de SO (Q-603 aberta).                                                                                 |
| **Testes Playwright cobrindo TODAS as telas**    | Não existe inventário de telas/rotas em nenhum documento. Sem mapa de telas, "todas as telas" é inauditável — e o motor de auditoria só verifica AC→teste, não tela→teste. Nenhum AC exige E2E por tela; nenhuma decisão sobre navegadores, viewports, regressão visual, ou tempo de CI.                                                                                                                                                                          |
| **Docker Compose com Traefik**                   | "Traefik" não aparece em nenhum arquivo. AC-001 fala em "roteador local" genérico. E falta a decisão óbvia: Traefik não tem papel em produção (Vercel + Railway), então ele existe só para reproduzir localmente subdomínio por loja + TLS — o que nunca é dito. Nenhum documento de projeto de infra.                                                                                                                                                            |
| **Skill de design para front moderno**           | AC-013..016 dão um sistema visual com quatro estados e acessibilidade, o que é sólido, mas não há **tokens declarados, mapa de telas, wireframe, referência visual nem critério do que é "moderno"** (nenhum AC de regressão visual). "Design system" hoje é uma promessa sem artefato.                                                                                                                                                                           |
| **Histórico de pedidos por cliente**             | AC-616 cobre o histórico do cliente **naquela loja**. O histórico _cross-store_ na conta do cliente (o que o modelo de dados viabiliza com `identities` 1:N `store_customers`) não tem US nem AC.                                                                                                                                                                                                                                                                 |
| **CRUD completo de clientes**                    | AC-705 diz "remoção tira o cliente das listagens", enquanto ASM-703 diz que remover é anonimização com retenção — o AC não prova o comportamento real. Endereços do cliente (`customer_addresses`) não têm nenhum AC.                                                                                                                                                                                                                                             |
| **Admin com CRUD de lojas**                      | Falta o ciclo de vida do acesso do dono: reenviar convite, trocar o responsável, resetar 2FA/senha do dono, ver membros da loja. AC-200 cria o convite e o fluxo de **aceitar convite e definir senha** não tem AC em `identidade-acesso` (que só cobre recuperação de senha).                                                                                                                                                                                    |
| **Futuro Kotlin/Swift**                          | AC-007 (contrato publicado) e AC-111 (auth sem cookie) existem, mas sem política de versionamento da API, sem prefixo de versão, sem regra de mudança quebrável — e sem decidir _como_ o contrato nasce (ver B2).                                                                                                                                                                                                                                                 |
| Áreas inteiras sem spec                          | Área da conta do CUSTOMER (dados, endereços, ativar 2FA — só citado dentro de AC-108, sem tela), notificação ao dono de pedido novo por e-mail (`notification_outbox` existe no banco, nenhum AC), páginas de termos/privacidade/consentimento (exigidas pelo próprio ASM-704 LGPD), 404/erro público, gestão de equipe STAFF (existe em `store_members`, Q-101 aberta).                                                                                          |

**Contradições spec ↔ projeto** (o design está à frente e às vezes em rota de colisão):

- `ASM-801` (métricas: consultar direto a tabela, rollup só se doer) × Decisão 14 do design (rollup `store_metrics_daily` + worker + array de 24 posições, matview proibida). Uma das duas está errada e ambas estão "confirmadas" no seu próprio documento.
- Design modela `password_hash NULL para CUSTOMER passwordless` + `LOGIN_OTP` × AC-100/AC-108 exigem senha para o cliente (Q-102 ainda aberta).
- Design tem `pix_brcode_snapshot` (BR Code montado no checkout) × checkout diz QR Code fora de escopo (Q-500 aberta).
- Design tem `cost_total_cents` "para permitir MARGEM no dashboard" × métricas põe custo/margem fora de escopo.
- Design tem `coupons`, `coupon_redemptions`, `scheduled_for`, `pickup_discount`, `product_waitlist`, `product_suggestions`, `delivery_zones` × todos fora de escopo ou sem nenhum AC.
- O adendo do topo de `modelo-de-dados.md` (specs por categoria, `stock_movements`, layout por ramo) **tem precedência declarada mas o corpo do documento não foi atualizado**: `attribute_definitions` continua escopada por `vertical_code`, `stock_movements` não tem entidade, nem policy RLS, nem entrada nas guardas de CI — e a Guarda 1 reprovaria a tabela nova por não ter política.
- `AC-200` (admin cria a loja e o dono recebe convite) decide na prática a `Q-100` que segue "aberta" em `identidade-acesso`.

---

## B) Decisões que ainda dependem de você (perguntas abertas de verdade)

As 40 perguntas Q-xxx do pacote são boas, mas estas **não foram feitas** e bloqueiam implementação:

1. **Onde a API e o web moram, em relação ao cookie.** (a) API em `api.simpleclick.app` e web em `simpleclick.app` — mesmo domínio registrável, cookie funciona, exige domínio próprio já agora; (b) API em `*.railway.app` e web em `*.vercel.app` — cookie cross-site, precisa `SameSite=None` + CSRF token e quebra em navegador com bloqueio de terceiros; (c) web faz proxy da API por rota `/api/*` (mesma origem, adiciona um salto de latência). Isso decide também AC-109 e o CORS que falta. **Depende de Q-003/Q-200 e é pré-requisito delas, não consequência.**
2. **Como nasce o contrato da API.** (a) Zod → OpenAPI gerado → tipos para web e SDK para Kotlin/Swift; (b) tRPC (tipo perfeito web↔API, inútil para nativo, exigiria uma segunda camada REST depois); (c) OpenAPI escrito à mão. AC-006 e AC-007 empurram para lados opostos e a escolha decide meses de trabalho.
3. **Armazenamento de arquivos.** ASM-201 diz "objeto externo" sem escolher: (a) Cloudflare R2 (sem egress, free generoso); (b) S3; (c) Supabase Storage; (d) UploadThing. Decide custo, URL assinada, pipeline de re-encode e CORS de upload.
4. **Transporte de tempo real** (AC-600, AC-602, AC-613): (a) SSE na API do Railway; (b) WebSocket; (c) polling de 10 s. No free tier, (c) pode ser a única opção honesta — e muda 3 ACs.
5. **Agente de impressão entra na v1?** (a) Sim, Windows só; (b) sim, Windows + macOS; (c) não entra — v1 imprime só pelo navegador e o automático fica para depois. Precisa da sua palavra porque foi requisito explícito seu, e é o item mais caro por AC do pacote.
6. **Direção da mensagem no WhatsApp** (Q-501, aberta e bloqueante): decide se `wa.me` aponta para o número da loja (cliente envia) ou do cliente (loja envia), e portanto AC-519/520/609/610 inteiros.
7. **Estoque: reserva ou não?** (a) baixa só na confirmação (ASM-311) — janela de oversell entre carrinho e confirmação; (b) reserva com expiração no carrinho; (c) sem controle de estoque na v1. E: pedido manual (AC-707) e pedido recusado (AC-607) mexem no estoque? AC-334 só fala de cancelado.
8. **Qual status conta como venda** (Q-801) — bloqueia métricas, rollup e exportação; nada pode ser implementado antes.
9. **Divisão de poder OWNER × ADMIN nas configurações**: o dono muda chave PIX, taxa de entrega, horário e tema sozinho, ou algo disso é do admin? Define a feature que hoje não existe.
10. **ORM e camada de dados** (ver D1): Prisma (implícito na constituição) × Drizzle × SQL puro com Kysely. Com 59 tabelas, RLS forçada, políticas por comando, triggers, `tsvector`, uniques parciais e `SET LOCAL` por transação, o Prisma vira gerador de tipos com migrations escritas à mão — vale confirmar antes de escrever a primeira migration.

---

## C) Riscos técnicos subestimados

1. **Prisma + RLS + `SET LOCAL` + pooler.** É o coração do projeto e o ponto mais frágil da stack escolhida. `SET LOCAL app.store_id` exige transação interativa em toda requisição (custo de conexão), o pool do Railway/PgBouncer em modo transaction quebra prepared statements do Prisma, e nada no pacote fala de limite de conexões (Vercel serverless × Postgres free = esgotamento clássico). AC-011 promete que o contexto não escapa entre requisições — provar isso com Prisma exige um padrão de acesso muito específico que não está projetado.
2. **Cookie cross-domain + CSRF ausente.** Risco duplo: pode simplesmente não funcionar em Safari, e o que funcionar fica sem proteção CSRF. Hoje não há nem AC, nem princípio, nem suposição.
3. **O worker de métricas roda como `sc_migrator` (BYPASSRLS)** no mesmo servidor da API (ASM-008: "um único servidor atende web e trabalho em segundo plano"). Isso coloca a credencial que ignora todo o isolamento dentro do processo exposto à internet — anula parte do valor do desenho de RLS, e o pacote não discute a contradição.
4. **Latência prometida no free tier.** AC-415 (conteúdo em 2,5 s em rede móvel) e AC-813 (painel < 1 s com dezenas de milhares de pedidos) com RSC na Vercel → API no Railway free (que hiberna) → Postgres free. Dois saltos, cold start e hibernação não cabem nesses números.
5. **Duas camadas de cache sem dono definido.** `catalog_version` + `revalidateTag` do Next + Redis por loja: invalidação distribuída entre Vercel e Railway exige webhook autenticado de revalidação que não está projetado. AC-028/AC-417 são fáceis de escrever e difíceis de provar.
6. **Cupom térmico com dois caminhos de renderização.** AC-617 promete imprimir "sem instalar nada" (navegador, CSS `@page`) e AC-620 exige acentuação correta (que na prática é codepage ESC/POS, caminho do agente). São dois renderizadores que precisam produzir o mesmo cupom, e nenhum AC amarra a equivalência.
7. **`wa.me` com texto longo.** AC-521 trata truncamento como detalhe de formatação; na prática há limite de URL por SO/navegador, encoding de emoji e comportamento diferente em iOS/Android/Desktop. Sem fallback de "copiar texto" como AC.
8. **E-mail é o único funil de entrada.** Verificação de conta _e_ 2FA por código saem por serviço free com cota diária (ASM-100). Se o e-mail atrasa ou cai em spam, o lojista não entra na própria loja — e SMS está fora de escopo. Não há AC de fallback, nem de bounce, nem de "não recebi o código".
9. **Motor de layout por vertical.** AC-318/AC-324 + adendo 3 do design ("o preset carrega composição de tela") = um mini-CMS de composição, multiplicado por 6-8 ramos × (cadastro, detalhe, vitrine, carrinho, cupom, WhatsApp). O custo combinatório de teste disso é maior que o de várias features somadas.
10. **Motor de especificações dinâmicas por categoria** (US-306) com Zod gerado do registro, valores órfãos preservados (AC-329), histórico de renomeação (AC-330) e filtro facetado na vitrine (AC-328). É um subsistema inteiro, adicionado _depois_ do design, sem entidade nem policy correspondente.
11. **Volume de prova.** 211 AC × (unit + integração + E2E) com portão que reprova AC sem teste (AC-018) significa **mais de 200 testes antes de poder declarar v1 pronta** — em projeto de uma pessoa. Não há estimativa, sequenciamento nem caminho crítico em nenhum lugar do pacote.
12. **Concorrência empilhada numa transação:** número sequencial por loja + lock da variação de estoque + resgate atômico de cupom + enfileirar impressão + outbox, tudo em uma transação por pedido, com `FOR UPDATE`. É o ponto de contenção do sistema e não tem projeto nem teste de carga previsto.
13. **LGPD como página, não só como coluna.** O banco tem `consents`, `anonymized_at`, `audit_log`; a superfície de usuário (política de privacidade, termos, exclusão de conta pelo cliente, portabilidade, contrato operador↔controlador com o lojista) não existe em nenhum AC. Q-700 está aberta e é obrigação legal, não escopo opcional.

---

## D) Suposições que o plano faz sem dizer

1. **O ORM é Prisma** — nunca decidido em spec ou ASM; aparece só como efeito colateral dos regex da constituição (`new PrismaClient`, `packages/database/prisma/schema.prisma`).
2. **Monorepo é pnpm + Turborepo** — dedutível apenas do `testCommand` em `/Users/stargrupo/Documents/SC/onpspec.config.json`.
3. **Validação é Zod** — imposto por P-007 (`z.object|string|...`) sem nunca ter sido escolhido.
4. **Express** aparece uma vez, no documento de dados; nenhuma spec descreve estrutura de rotas, middleware, camadas ou tratamento de erro da API — apesar de a API ser "fonte única de verdade de negócio".
5. **Argon2id + AES-256-GCM com chave "em KMS/env"** — sem plano de gestão, rotação ou perda de chave (perder a chave = todo mundo perde o TOTP).
6. **Um único processo serve API, jobs, rollup e fila de impressão** (ASM-008), com credencial de bypass dentro dele (ver C3).
7. **O dono tem computador/tablet ligado no expediente com a fila aberta** (ASM-606) e impressora térmica — modelo de operação inteiro apoiado nisso.
8. **A loja só existe se o admin criar** (AC-200) — assume que não há autosserviço, o que decide o modelo de crescimento do produto e contradiz Q-100 "aberta".
9. **Catálogo pequeno** (ASM-405, "algumas centenas") enquanto o design foi validado com 120 mil produtos e 300 mil pedidos — as duas premissas não convivem nas decisões de índice e paginação.
10. **A CI consegue subir Docker Compose e rodar Playwright dentro do free tier de minutos** — Q-001 (repo público/privado) está aberta e é exatamente o que define isso.
11. **Vitest no lugar do Jest** (ASM-005, confirmada) — legítimo, mas registre que divergiu do requisito escrito.
12. **A hora é confiável** para "loja aberta/fechada" e para o corte de "hoje" no fuso da loja; nenhum AC trata divergência de relógio do cliente.
13. **O `slug` é unique global** (documentado no design como intencional) — ou seja, um lojista pode descobrir a existência de outro por colisão de apelido; assumido, nunca discutido como decisão de produto.

---

## E) O que **não** deveria entrar na v1

Cortes por ordem de custo-benefício. Somados, tiram ~70 ACs e um aplicativo desktop do caminho crítico:

1. **Agente de impressão automático** (US-605, AC-622..626): é um app desktop com instalação, atualização, pareamento e suporte a SO. V1 imprime por clique (que você já aceitou como padrão em ASM-600). — _exige seu de-acordo, foi requisito explícito._
2. **Controle de estoque completo** (US-307, 7 ACs + `stock_movements` + trava de concorrência + devolução por cancelamento). V1: `is_available` / "esgotado" por variação, sem movimento nem histórico.
3. **Especificações dinâmicas por categoria com filtro facetado** (US-306, AC-325..330). V1: campos livres por categoria, sem geração de schema, sem histórico de renomeação, sem faceta na vitrine.
4. **Composição de tela por ramo** (AC-324 e a parte "layout" de AC-318). V1: só vocabulário (`labels`) + esconder/mostrar um punhado de blocos por flag simples.
5. **Rollup de métricas com worker** (Decisão 14 do design) e as métricas de segunda ordem: comparação com período anterior (AC-802), distribuição horária (AC-809), exportação em planilha (US-804). V1: hoje/3/7/custom + top produtos + evolução diária, consultando `orders` com os índices já projetados.
6. **Tempo real por conexão contínua** (AC-600/602/613): trocar por polling de 10 s na v1 e cortar AC-602 (recuperação de reconexão) inteiro.
7. **TOTP + códigos de recuperação para o dono** (US-108 quase inteira): manter obrigatório só para o ADMIN_GERAL, que é uma conta, e deixar o resto para depois.
8. **Domínio próprio, subdomínio por loja e redirect de slug antigo** (`store_domains` `CUSTOM`/`LEGACY_SLUG`, AC-208, Q-201): v1 em caminho (`/l/{slug}`), slug imutável. Isso também elimina wildcard TLS e metade da complexidade do Traefik local.
9. **As tabelas do design sem nenhum AC**: `coupons`, `coupon_redemptions`, `product_suggestions`, `product_waitlist`, `delivery_zones`, `usage_counters`, `feature_flags`, `option_price_overrides`, `product_type=FRACTIONED`, `scheduled_for`, `CLUB`/`COST` em `product_prices`. Cada tabela com `store_id` custa policy por comando, teste de isolamento (P-003) e passagem nas 9 guardas de CI. Manter `plans`/`plan_features`/`subscriptions` mínimos (a preparação para planos que você pediu) e cortar o resto até haver AC.
10. **Subcategoria** (hierarquia de um nível, Q-303) e **produto em várias categorias** (Q-300): um nível, uma categoria primária.
11. **Múltiplas imagens (5) + duplicar produto** (parte de AC-305/307): v1 com principal + 2, sem duplicação.
12. **2FA opcional para o cliente final** (AC-108) e **gestão de dispositivos/encerrar todas as sessões** (AC-113): manter só logout real (AC-112).
13. **Ambiente de homologação** (Q-002) e **plano de recuperação de desastre testado** (Q-004): manter backup automático + restauração documentada, sem ambiente extra.

**E o que deveria _entrar_ antes de qualquer código, mesmo cortando tudo acima:** a feature de configurações da loja (sem ela o checkout não tem PIX, taxa, horário nem WhatsApp), CORS + CSRF como ACs de primeira classe, o mapa de telas que torna "Playwright em todas as telas" verificável, e os 9 `tasks.md` de verdade — porque enquanto eles forem template, `onp-spec audit` vai reprovar por construção e nenhuma tarefa pode ser declarada pronta.
