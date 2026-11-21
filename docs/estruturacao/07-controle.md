# Estruturação 7 — Controle da entrega e checklist acadêmico

Card #133 · consolidado em 19/11/2026 · seção 7 do plano (`Simple_Click_Plano_de_Estruturacao.md`).
Revisão de referência: `69cf095` (HEAD de `/Users/stargrupo/Projetos/SC`). A árvore de trabalho tem alterações de
outros cards em andamento; nenhum resultado abaixo foi medido nelas, salvo onde o documento de origem diz o contrário.

Legenda: ✅ rodado e observado · ⚠️ rodado com ressalva · ❌ falhou · **a verificar** = não rodou ou não há evidência.

## 1. Registro por etapa

| Etapa | Card | Responsável | Revisão | Estado | Evidência | Pendência |
|---|---|---|---|---|---|---|
| 1. Inventário e primeira execução | #127 | Agente do card #127 | `69cf095` | ✅ rodado (com falhas) | `docs/estruturacao/01-inventario.md` | Lacunas L-01 a L-14 (seção 2 abaixo) |
| 2. Arquitetura (C4, ADR, OpenAPI) | #128 | Agente do card #128 | não registrada no documento de origem | ⚠️ documentos prontos; testes **só lidos**, não rodados | `docs/arquitetura/c4.md`, `docs/adr/0001-pedido-e-carrinho-na-mesma-transacao.md`, `docs/arquitetura/openapi-pedidos.yaml` | Contrato gerado sem 201, sem GET e sem exemplos (ver 2.5); teste de queda de conexão ausente |
| 3. Testes e critérios do checkout | #129 | Agente do card #129 (defeito reencaminhado à #134) | `69cf095` | ❌ defeito de produção confirmado; demais casos ✅ | `docs/estruturacao/03-testes-checkout.md` | Correção do P2002 em curso na #134; depois trocar `it.fails` por `it` |
| 4. Seed de simulação (100 lojas, 1.000 pedidos) | #130 / #135 | Agentes dos cards #130 e #135 | a verificar | **a verificar** (#135 em andamento) | nenhum `docs/estruturacao/04-simulacao.md` no disco | Execução do plano v6 e reconciliação |
| 5. Desempenho (smoke, carga, estresse) | #131 | Agente do card #131 | a verificar | **a verificar** (#131 em andamento) | nenhum `05-desempenho.md`, nenhum `tests/performance/`, nenhum `.github/workflows/` | k6 não rodado; sem relatório |
| 6. Operação, observabilidade e IA | #132 | Agente do card #132 | `69cf095` | ✅ parcial (4 testes verdes) | `docs/estruturacao/06-operacao.md`, `apps/api/tests/log-de-pedido-sem-pii.test.ts`, `apps/api/tests/preco-vigente-virada.test.ts` | Latência/SLO e diagnóstico (dependem da #131); ensaio de preço em homologação; decisão humana da IA |

Teste de ambiente (README do zero): ver seção 3.

### 1.1 Etapa 1 — inventário (`69cf095`)

Ambiente: Node 24.18.0, pnpm 11.22.0, Docker com Postgres 16 dev (5432), Postgres 16 de teste (5533), Redis 7 e Traefik v3.7.

| Comando | Resultado |
|---|---|
| `bash infra/scripts/up.sh core test` | ✅ serviços saudáveis em 7,4 s |
| `GET /v1/health/ready` (API na 3001) | ✅ 200, banco e cache ok |
| `GET /loja/pastelaria-da-vila` após `pnpm build` e `start:web` | ✅ 200, imagens 200 |
| `pnpm lint` | ❌ exit 1: 145 problemas (64 erros, todos em `.claude/skills/workflow-ia/**` e `.rmcode/capturas/**`) |
| `pnpm typecheck` | ✅ 9 pacotes sem erro |
| `pnpm test:unit` | ✅ 3.931 testes (web 2.655, api 692, core 262, ui 247, contracts 49, config-eslint 14, agente-impressao 12) |
| `pnpm test:int` | ❌ `database`: 1 suíte falha (`pg_dump` ausente, ambiente); `api`: 40 falhas em 9 arquivos (788 ok, 2 pulados) |
| `pnpm test:e2e` | ❌ 261 ok, 73 falhas, 4 não rodaram (de 338, em `publico` e `celular`); pode ter sofrido interferência de processo residual, por isso a recontagem é a lacuna L-03 |
| `pnpm build` | ✅ api (tsc) e web (Next.js 16.4.0) |

Observação de caminho: o board aponta `Documents/SC`, sem código. Tudo foi rodado em `/Users/stargrupo/Projetos/SC`.

### 1.2 Etapa 2 — arquitetura (#128)

- Entregues: C4 em Mermaid (contexto e contêineres, três usos do Redis com arquivo:linha), ADR 0001 (pedido e carrinho na mesma transação, com queda antes da resposta), OpenAPI à parte do gerado com POST (201/200), GET e exemplos.
- Testes citados como proteção (`carrinho-convertido.int.test.ts`, `pedido-idempotente.test.ts`) foram **lidos**, não rodados.
- README: alterado só na árvore de trabalho (sequência local e links). **No HEAD `69cf095` ainda não há essa alteração.**

### 1.3 Etapa 3 — checkout (#129)

Linha de base (isolada): `pedido-total.test.ts` 20/20; `carrinho-convertido` 3/3; `pedido-idempotente` 17/17; `carrinho-rota` 37/37; `pedido-manual.spec.ts` 2/2 depois do conserto.

Seis casos de aceite, todos com teste: preço alterado (✅, incl. 409 `preco_divergente` novo), produto esgotado (✅), resposta perdida com a mesma chave (✅), concorrência (✅ exceto o defeito abaixo), isolamento entre lojas (✅), pedido manual e2e (✅).

### 1.4 Etapa 6 — operação (#132)

Testes rodados isolados: `log-de-pedido-sem-pii` 1/1, `preco-vigente-virada` 4/4, `pedido-imutavel` 7/7, `isolamento-entre-lojas-dono` 18/18. Lint e tipos dos dois arquivos novos sem apontamentos.

## 2. Falhas: causa conhecida e menor caso que reproduz

| ID | Falha | Causa conhecida | Menor caso que reproduz | Onde está registrado |
|---|---|---|---|---|
| F-01 | 500 quando duas confirmações simultâneas usam a mesma chave | P2002 em `orders_idempotency_uk` não tratado em `criar-pedido.usecase.ts:351`. O banco fica certo (1 pedido) | `apps/api/tests/checkout-aceite.int.test.ts`, teste `it.fails` "DEFEITO: … não 500" (dois `POST` em `Promise.all`) | `03-testes-checkout.md` §1; correção na #134 |
| F-02 | `copia-de-seguranca.test.ts` falha inteiro | Ambiente sem `pg_dump` (`PG_BIN` não definido) | `npx vitest run --project db-rls packages/database/src/copia-de-seguranca.test.ts` | Inventário, L-02 |
| F-03 | 429 em suítes da API (`vitrine-catalogo-paginado`, `disponibilidade-do-produto`, `busca-vitrine`, `vitrine-filtros-e-ordens.onp`, `precos-do-produto`, `admin-situacao`) | Limite de requisições compartilhado entre suítes (hipótese: contador no Redis). Não confirmada | `npx vitest run --project api-int apps/api/tests/vitrine-filtros-e-ordens.onp.int.test.ts` (falha sozinho, 25/43) | Inventário, L-07 |
| F-04 | 403 `origem_nao_autorizada` em `conta-duas-contas` | Origem usada por `fecharPeloSite` fora da lista da app de teste | `npx vitest run --project api-int apps/api/tests/conta-duas-contas.test.ts` | Inventário, L-08 |
| F-05 | 401 em `POST /v1/conta/senha` e `GET /v1/conta/sessoes` | Não diagnosticado: teste desatualizado ou defeito na rota | `npx vitest run --project api-int apps/api/tests/rotas-da-conta-segura.test.ts` | Inventário, L-09 |
| F-06 | cor salva `#ff0055`, lida `#b7ff00` | Não diagnosticado | `npx vitest run --project api-int apps/api/tests/feed-e-tema.test.ts` | Inventário, L-10 |
| F-07 | 73 falhas e2e (39 cenários × 2 projetos) | Seletores e tempos desatualizados depois do redesign; uma causa determinística: `manifesto-cobre-arquivos` (telas `/ui/capas`, `/ui/catalogo`, `/ui/landing-secoes`, `/ui/recortador` sem linha no manifesto) | `pnpm --filter @simpleclick/e2e exec playwright test specs/manifesto-cobre-arquivos.spec.ts` | Inventário, L-03 e L-04 |
| F-08 | `pnpm lint` reprova | 64 erros em `.claude/` e `.rmcode/`, fora do produto | `pnpm lint` | Inventário, L-01 |
| F-09 | `pnpm start` recusa partir sem variáveis | `start` não carrega `.env` como o `dev` faz | `pnpm build && pnpm start` sem exportar variáveis | Inventário, L-05 |
| F-10 | 409 `preco_divergente` sem teste de API antes do #129 | Lacuna de teste, não defeito conhecido | agora coberto por `checkout-aceite.int.test.ts` | Inventário, L-06; resolvido no #129 |

### 2.1 Lacunas de arquitetura e operação (sem correção)

- Contrato gerado (`contrato/openapi.json`): POST só com 200, sem GET `/pedido/{token}`, sem exemplos. Precisa de card próprio em `packages/contracts`.
- Nenhum teste derruba a conexão de fato entre o commit e a resposta; a propriedade é provada pelo reenvio depois de um 201 concluído (ADR 0001).
- Logs: sem evento de domínio de pedido, sem `lojaId` nem id do pedido nas linhas, sem duração por etapa, `papel` sempre `PUBLIC`, rota sem o prefixo `/v1/vitrine` nos 4xx tratados (`06-operacao.md` §1.5).

## 3. Teste de ambiente — README do zero

Objetivo: seguir o README num terminal limpo até abrir a vitrine. Feito em um clone limpo de `HEAD` (`69cf095`) em `/tmp/sc-limpo`, fora do repositório. Não foi lido `.env` nem alterado nada fora de `/tmp`.

| Passo do README | Resultado |
|---|---|
| Pré-requisitos: Node 24, pnpm 11, Docker | ✅ Node 24.18.0, pnpm 11.22.0 |
| `pnpm install` | ✅ `pnpm install --frozen-lockfile` em 4,4 s, sem erro |
| `bash infra/scripts/setup.sh` | ❌ **não executado**. O script chama `docker compose restart traefik` (`setup.sh` linhas 103–108). Com o projeto Compose `simpleclick` no ar, isso reinicia o Traefik compartilhado (`simpleclick-traefik-1`), que outros cards usam |
| `cp .env.example .env` | **a verificar**: o README diz "preencha os valores"; não se sabe quais faltam sem o passo anterior |
| `bash infra/scripts/up.sh core test` | **a verificar**: no momento as portas 5432, 5533, 6379 e 80 estão ocupadas pelos contêineres do projeto `simpleclick`; o passo usaria o mesmo banco de dev que o seed da #135 usa |
| `pnpm --filter @simpleclick/database migrar` | **a verificar** (depende de `up`) |
| `pnpm --filter @simpleclick/database seed` | **a verificar**: o inventário mostra o banco de dev com 62 lojas e 696 pedidos, em uso pela #135 |
| `pnpm dev` (site em 3000, API em 3001) | **a verificar**: 3000 e 3001 estavam livres na checagem |

**Onde travou:** no `setup.sh`, por decisão de não derrubar o Traefik compartilhado. O README até aqui não traz o aviso de que o script reinicia o roteador se ele já estiver no ar.

**Para fechar o teste:** rodar em máquina sem o stack ou depois que a #135 terminar, com `COMPOSE_PROJECT_NAME` próprio e portas livres. Lembrar que o README em `HEAD` ainda não tem a sequência de #128; repetir o teste depois que ela entrar no `main`.

## 4. Checklist da seção 7

Marcado só o que tem evidência real.

- [ ] **Ambiente:** outra pessoa consegue abrir a vitrine a partir do README. **Não confirmado**: passo 2 bloqueado, passos 3 a 8 a verificar (seção 3).
- [ ] **Arquitetura:** o desenho, a decisão de transação e o contrato refletem a revisão executada. **Parcial**: C4 e ADR existem; o contrato gerado não tem GET nem 201 (2.1); os testes citados não foram rodados.
- [x] **Qualidade:** os resultados unitários, de integração e da jornada crítica estão identificados. Identificados, **não verdes**: int com 40 falhas na API, e2e com 73 (seção 1.1 e seção 2).
- [ ] **Dados:** 100 lojas, exatamente 10 pedidos em cada, imagens acessíveis e repetição sem duplicar. **a verificar** (#130 e #135). O banco dev tem 62 lojas, não 100.
- [ ] **Desempenho:** há relatório separado de smoke, carga e estresse e reconciliação dos pedidos adicionais. **a verificar** (#131): não há relatório nem `tests/performance/`.
- [x] **Operação:** uma requisição pode ser investigada sem expor dados de cliente. Sustentado pelo teste `log-de-pedido-sem-pii` e pela linha do tempo de uma compra por retirada (`06-operacao.md` §1 e §3). Ressalvas: sem `lojaId` nem id do pedido nas linhas; entrega com endereço e pedido manual **a verificar**.
- [ ] **Entrega acadêmica:** registrar problema, nível, demonstração, decisões de escopo, evidências e contribuição individual. **Não preenchido**: campos em branco na seção 5.

## 5. Entrega acadêmica

Campos para preencher pela equipe. Nenhum nome ou nível foi inventado. O nome oficial do nível deve ser confirmado com a turma.

| Campo | Conteúdo |
|---|---|
| Problema | _a preencher_ |
| Nível escolhido | _a preencher (nome oficial a confirmar com a turma)_ |
| Demonstração | _a preencher (roteiro e link, quando houver)_ |
| Decisões de escopo | _a preencher_ (ex.: 6 casos de aceite do checkout, ADR 0001; ver `docs/adr/`) |
| Evidências de engenharia | _a preencher_ (links para `01-inventario.md`, `03-testes-checkout.md`, `06-operacao.md`, `docs/arquitetura/`) |
| Contribuição individual | _a preencher por pessoa_ |

## 6. Correções para o gerente (fora dos meus arquivos)

Não alterei estes arquivos; cada um precisa de card próprio:

1. **README (`HEAD`)**: avisar que `setup.sh` reinicia o Traefik se ele estiver no ar; citar o pré-requisito `pg_dump`/`PG_BIN` (L-02); explicar `migrar` → `seed` → `demo` (L-13).
2. **`apps/api/package.json` (`start`)**: carregar o `.env` como o `dev` (L-05).
3. **`docs/estruturacao/03-testes-checkout.md`**: quando a #134 entrar, atualizar o estado do defeito F-01 e o `it.fails`.
4. **`docs/estruturacao/06-operacao.md`**: a lacuna do `papel` (sempre `PUBLIC`) e da rota 4xx sem prefixo são defeitos de instrumentação; decidir se viram card.
5. **Contrato (`packages/contracts`)**: o gerado não tem 201, GET nem exemplos (#128 pediu card próprio).
6. **`docs/estruturacao/04-simulacao.md` e `05-desempenho.md`**: ainda não existem no disco; sem eles as seções 4 e 5 seguem "a verificar".
