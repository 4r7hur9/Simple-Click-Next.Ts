# Estruturação 1 — Inventário e primeira execução

Card #127 · executado em 19/11/2026 · seção 1 do plano (`Simple_Click_Plano_de_Estruturacao.md`).

## Revisão examinada

| Item | Valor |
|---|---|
| Revisão de referência do plano | `69cf0958ae929d3decadcc10c856cdd61184d0d7` |
| Revisão usada nesta execução | `69cf0958ae929d3decadcc10c856cdd61184d0d7` (HEAD da `main` em `/Users/stargrupo/Projetos/SC`) |
| Diferença | Nenhuma. `git status --short` vazio antes da execução (0 arquivos alterados). |
| Ferramentas | Node v24.18.0 · pnpm 11.22.0 · Docker (Postgres 16 dev na 5432, Postgres 16 teste na 5533, Redis 7, Traefik v3.7) |

Observação de caminho: o board aponta `Documents/SC`, que não tem o código. Tudo abaixo foi rodado em `/Users/stargrupo/Projetos/SC`.

## Comando × resultado × evidência

Todos os comandos foram rodados na raiz, na revisão `69cf0958ae`. Os logs ficaram em `/tmp/inv/*.log` (fora do repositório).

| Comando | Resultado | Duração | Evidência |
|---|---|---|---|
| `bash infra/scripts/up.sh core test` | ✅ ok | 7,4 s | postgres-dev, postgres-test (5533), redis e traefik "saudável" |
| `GET http://localhost:3001/v1/health/ready` | ✅ 200 | 0,07 s | `{"pronto":true,"dependencias":{"banco":"ok","cache":"ok"}}` (API iniciada com `node --env-file=../../.env dist/main.js`, ver lacuna L-05) |
| `GET http://localhost:3000/loja/pastelaria-da-vila` (após `pnpm build`, `start:web`) | ✅ 200 | 0,12 s | 17 `<img>`; `/demo/pastelaria-da-vila/capa.webp` 200 image/webp 55 KB, `logo.webp` 12 KB, `pastel-de-carne-frente.webp` 15 KB |
| `pnpm lint` | ❌ exit 1 | 9 s | 145 problemas: **64 erros**, 81 avisos. Todos os erros estão em `.claude/skills/workflow-ia/**` e `.rmcode/capturas/**` (ferramentas versionadas, fora do produto). Regras: no-unused-vars 19, no-useless-assignment 12, no-undef 12, no-require-imports 6, no-regex-spaces 5, no-console 5, outros 5 |
| `pnpm typecheck` | ✅ exit 0 | 8 s (`--force`; sem `--force` foi 0 s, 9/9 em cache) | 9 pacotes sem erro |
| `pnpm test:unit` | ✅ exit 0 | 36 s | 3.931 testes passando: web 2.655 (269 arquivos), api 692, core 262, ui 247, contracts 49, config-eslint 14, agente-impressao 12 |
| `pnpm test:int` | ❌ exit 1 | 78 s (para no 1º pacote) / 188 s com `--continue` | database: 101 ok, 3 pulados, 1 suíte falha. testing: 27 ok. api: **788 ok, 40 falhas, 2 pulados** (830; 9 arquivos falham). Filas e cache-int (Redis) passam |
| `pnpm test:e2e` | ❌ exit 1 | 830 s (13,8 min) | 338 testes em 5 workers, projetos `publico` e `celular`: **261 ok, 73 falhas, 4 não rodaram** |
| `pnpm build` | ✅ exit 0 | 19 s | api (tsc) + web (Next.js 16.4.0, Turbopack, "Compiled successfully"). Cache do turbo: miss nos dois |

Nota sobre o e2e: a primeira tentativa foi interrompida por mim em 560 s (limite do comando) e deixou um processo `e2e/iniciar-api.mjs` vivo durante a segunda execução. Ele foi encerrado depois. Não dá para descartar que tenha interferido em algumas falhas. Por isso, a recontagem limpa ficou como critério da lacuna L-03.

Nota sobre `next dev`: não foi usado. O e2e e a verificação manual usaram `next build` + `next start`, então o aviso de segurança da 16.4.0 com `next dev` não apareceu nesta rodada.

## Casos relevantes (aumento de preço e reenvio de pedido)

| Caso | Arquivo | Resultado |
|---|---|---|
| `@spec:AC-503 preço que subiu é avisado com os dois valores` (e mais 7 casos AC-503: preço que caiu, esgotado, saiu do catálogo, várias mudanças…) | `packages/core/src/pedido-total.test.ts:75` | ✅ (unit) |
| `@spec:AC-504 total manipulado pelo cliente é descartado e a divergência fica marcada` | `packages/core/src/pedido-total.test.ts:50` | ✅ (unit) |
| `@spec:AC-503 preço que mudou desde a tela é mostrado item a item` | `apps/api/tests/carrinho-rota.int.test.ts:612` | ✅ (int, 37/37 no arquivo) |
| `@spec:AC-516 a segunda tentativa com a mesma chave devolve o mesmo pedido` / `…não gasta um número da sequência` / `…sem chave continuam distintos` / `…a mesma chave em outra loja cria pedido` | `apps/api/tests/pedido-idempotente.test.ts` | ✅ (int, 17/17) |
| `@spec:AC-516 a mesma chave devolve o mesmo pedido, com os valores e a mensagem do pedido guardado` | `apps/api/tests/carrinho-convertido.int.test.ts:257` | ✅ (int) |
| `@spec:AC-515 renomear e reprecificar o produto deixa o pedido intacto` | `apps/api/tests/pedido-imutavel.test.ts:125` | ✅ (int) |
| `@spec:AC-514 o pedido é criado e ganha código, do carrinho ao fim` | `e2e/specs/checkout.spec.ts:50` | ✅ (e2e, publico e celular) |
| Recusa 409 `preco_divergente` no **POST de pedido** | `apps/api/src/modules/orders/pedidos.routes.ts:373-381` | ⚠️ **sem teste de API nem e2e** (só o front confere que envia `subtotalVistoCentavos`, em `apps/web/tests/fechamento-total-idempotencia.onp.test.tsx:155`). Ver L-06 |

## Falhas: causa e menor caso que reproduz

### test:int — `packages/database`

- **Falha**: `packages/database/src/copia-de-seguranca.test.ts` (suíte inteira, 3 casos AC-052 pulados).
- **Causa**: ambiente. `ErroDeFerramenta: pg_dump não foi encontrado` (`packages/database/src/ferramentas-do-postgres.ts:67`). A máquina não tem cliente PostgreSQL (`which pg_dump` → não encontrado) e `PG_BIN` não está definido.
- **Menor caso**: `npx vitest run --project db-rls packages/database/src/copia-de-seguranca.test.ts`.
- **Efeito colateral**: `turbo run test:int --concurrency=1` para no primeiro pacote que falha. Sem `--continue`, os testes da API nem rodam.

### test:int — `apps/api` (40 falhas em 9 arquivos)

| Grupo | Arquivos (falhas na rodada completa) | Sozinho | Causa observada |
|---|---|---|---|
| 429 do limite de requisições | `vitrine-catalogo-paginado.int` (14), `disponibilidade-do-produto.int` (7), `busca-vitrine.int` (6), `vitrine-filtros-e-ordens.onp.int` (6), `precos-do-produto.int` (3), `admin-situacao` (1) | Os quatro primeiros e `precos-do-produto` **passam sozinhos**. `vitrine-filtros-e-ordens.onp.int` falha sozinho (25/43) e `admin-situacao` também (1/13) | Esperado 200/404, recebido **429**. O limite da vitrine (`apps/api/src/app.ts:706`, `limiteDoCatalogo`) é atingido pelas requisições da própria suíte. Hipótese: o contador fica no Redis compartilhado e passa de um arquivo para outro. Não confirmado |
| 403 de origem | `conta-duas-contas` (suíte inteira) | Falha sozinho | `{"erro":"origem_nao_autorizada","motivo":"fora_da_lista"}` em `fecharPeloSite` (`apps/api/tests/apoio-de-compra.ts:105`). Manda `Origin: https://painel.exemplo.test`, que não está na lista da app desse teste. Forçar `ORIGENS_PERMITIDAS` no ambiente não resolve, então a lista vem da configuração montada pelo teste |
| 401 na troca de senha | `rotas-da-conta-segura` (2: `[CA-3] @spec:AC-11117`, `[CA-4] @spec:AC-11118`) | Falha sozinho | `POST /v1/conta/senha` com Bearer recém-emitido devolve 401 (esperado 204), linha 111. `GET /v1/conta/sessoes` devolve 401 (esperado 200), linha 175 |
| Tema da vitrine | `feed-e-tema` (1: "o dono escolhe cor e imagens…") | Falha sozinho | `corDestaque` esperado `#ff0055`, recebido `#b7ff00`. O valor gravado não volta na leitura |

Menores casos:
- `npx vitest run --project api-int apps/api/tests/conta-duas-contas.test.ts`
- `npx vitest run --project api-int apps/api/tests/rotas-da-conta-segura.test.ts`
- `npx vitest run --project api-int apps/api/tests/feed-e-tema.test.ts`
- `npx vitest run --project api-int apps/api/tests/vitrine-filtros-e-ordens.onp.int.test.ts`

### test:e2e (73 falhas = 39 cenários × projeto publico/celular, quase sempre os dois)

Arquivos com falha: navegacao-do-cliente.onp (8), login-2fa (6), admin-lojas (6), manifesto-cobre-arquivos (4), loja-pela-sessao (4), landing (4), config-pagamento (4), config-horarios (3), e 2 em cada um destes: vitrine, specs-categoria, recuperar-senha, pedido-manual, painel-catalogo, estoque, detalhe-do-produto.onp, desempenho-vitrine, dashboard, config-impressao, config-contato, config-aparencia, clientes, cardapio-na-tv, canonical, cadastro, admin-documentos.

Sintomas mais frequentes: `toBeVisible()` falhou (14), `toBe` diferente (10), elemento não encontrado (9), tempo esgotado de 30 s a 180 s (24, em geral nos fluxos com e-mail/login: cadastro, login-2fa, recuperar-senha, config-*), violação de modo estrito (`getByRole('status')…categoria` com 2 elementos; `getByLabel('PIX')` com 3).

Causa determinística confirmada:
- `e2e/specs/manifesto-cobre-arquivos.spec.ts:52` falha com "tela sem linha no manifesto: /ui/capas, /ui/catalogo, /ui/landing-secoes, /ui/recortador" (faltam em `.spec/design/mapa-de-telas.md` e `apps/web/src/lib/routes.ts`).
- Menor caso: `pnpm --filter @simpleclick/e2e exec playwright test specs/manifesto-cobre-arquivos.spec.ts`.

Os demais grupos sugerem que os seletores dos testes ficaram para trás depois do redesign das telas (rótulos duplicados, elementos que mudaram). Isso precisa de triagem arquivo a arquivo (L-03).

## Criação de pedido: da vitrine à API

1. Tela de fechamento gera a chave de idempotência e monta o pedido: `apps/web/src/features/checkout/FechamentoDaCompra.tsx:513` (`chaveDeIdempotencia: chave`).
2. Cliente HTTP do navegador: `criarPedido` em `apps/web/src/lib/carrinho-do-navegador.ts:386`, que chama `chamar(apelido, "/pedidos", …)` (linha 391). O endereço é `${enderecoDaApiNoNavegador()}/v1/vitrine/:apelido/pedidos` (linha 533). 409 vira estado "conflito" (linha 393).
3. Rota Express: `POST /:apelido/pedidos` em `apps/api/src/modules/orders/pedidos.routes.ts:251`, montada sob `/v1/vitrine`.
4. Conferência do carrinho no servidor: `opcoes.conferirCarrinho(...)` em `pedidos.routes.ts:337`. Ela é injetada com **`conferirAntesDeFechar`**, em `apps/api/src/modules/cart/conferir-preco.usecase.ts:520`, que lê as linhas do carrinho, aplica preço vigente, promoção e atacado, e chama a regra pura.
5. **Função que confere o carrinho (regra pura): `conferirCarrinho` em `packages/core/src/pedido-total.ts:192`**, chamada em `conferir-preco.usecase.ts:596`.
6. Recusas 409: impedimento (loja fechada, item esgotado) em `pedidos.routes.ts:356`, e `preco_divergente` quando `subtotalVistoCentavos` ≠ subtotal recalculado em `pedidos.routes.ts:373-381`.
7. Gravação: `criarPedido` (use case) em `apps/api/src/modules/orders/criar-pedido.usecase.ts`. A idempotência é conferida antes de tudo (linhas 292-306, `pedidoJaCriado` na linha 182, chave única por loja).

A conferência sem fechar usa o mesmo `conferirAntesDeFechar`, pela rota do carrinho em `apps/api/src/modules/cart/carrinho.routes.ts:283`.

## Automação e seed

- **`.github/workflows/` não existe** na revisão (`ls .github` → "No such file or directory"). Confere com o plano.
- **Seed demo** (`packages/database/seed/demo/LEIA-ME.md`): documenta **24 lojas** abertas em Fortaleza/CE, uma por tipo de negócio (22 tipos; FOOD_SNACK e APPAREL têm 2), além de catálogo, fotos, vídeos, stories, clientes, pedidos, social e 4 contas de teste. Comando: `pnpm --filter @simpleclick/database demo` (com `-- --sem-videos` opcional).
  - **Depende do seed base**: exige `pastelaria-da-vila` e `lojaboavista` no banco. Num banco vazio, é preciso rodar antes `pnpm --filter @simpleclick/database seed`. O documento diz que é idempotente e que nunca roda em produção.
  - Imagens e vídeos vão para `apps/web/public/demo/`, que tem um `.gitignore` próprio com `*` (só esse arquivo é versionado). Uma base nova não tem as imagens até rodar o `demo`.
  - O LEIA-ME contém **senhas das contas de teste em texto claro** (inclusive a do admin da plataforma).
- **Banco dev atual**: `app.stores` = 62 (53 ativas) e `app.orders` = 696. É mais que as 24 documentadas, porque há resíduos de outros seeds e testes. O banco de teste (5533) é descartável por suíte.
- **README**: não menciona CI/GitHub Actions.

## Lacunas (para o gerente virar card)

| # | Arquivo(s) afetado(s) | Mudança proposta | Critério de aceite |
|---|---|---|---|
| L-01 | `eslint.config.js` | Ignorar `.claude/**` e `.rmcode/**` no lint do produto, ou corrigir os 64 erros nesses arquivos | `pnpm lint` termina com exit 0 na `main`, e os avisos restantes estão só em código do produto |
| L-02 | `packages/database/src/copia-de-seguranca.test.ts`, `packages/database/src/ferramentas-do-postgres.ts`, README | Documentar o pré-requisito `pg_dump`/`PG_BIN` no README. Alternativa: pular a suíte com motivo explícito quando a ferramenta não existe, ou usar o `pg_dump` do contêiner | Numa máquina sem cliente Postgres, `pnpm test:int` não reprova por ferramenta ausente, ou o README diz como instalar. Com o cliente instalado, os 3 casos AC-052 passam |
| L-03 | `e2e/specs/*` (25 arquivos listados acima) | Triar as 39 falhas uma a uma: seletor desatualizado, fluxo de e-mail com tempo esgotado ou defeito real. Corrigir o teste ou abrir um card de defeito para cada uma | Numa base limpa, sem processo residual nas portas 3100/3101, `pnpm test:e2e` termina com 0 falhas e 0 "did not run", ou cada falha restante tem card próprio |
| L-04 | `.spec/design/mapa-de-telas.md`, `apps/web/src/lib/routes.ts` | Acrescentar as telas `/ui/capas`, `/ui/catalogo`, `/ui/landing-secoes` e `/ui/recortador` ao manifesto (ou tirá-las do código) | `e2e/specs/manifesto-cobre-arquivos.spec.ts` passa nos dois projetos |
| L-05 | `apps/api/package.json` (script `start`) | Carregar o `.env` como o `dev` já faz (`node --env-file-if-exists=../../.env dist/main.js`) | `pnpm build && pnpm start` sobe a API, e `/v1/health/ready` responde 200 sem exportar variáveis à mão. Hoje recusa a partida com 6 variáveis ausentes |
| L-06 | `apps/api/tests/` (novo caso), `apps/api/src/modules/orders/pedidos.routes.ts:373` | Teste de integração do POST de pedido com preço aumentado entre a tela e o fechamento: `subtotalVistoCentavos` antigo → 409 `preco_divergente`, nenhum pedido gravado e nenhum número de sequência gasto. Depois, reenvio com o subtotal novo e a mesma chave → pedido único | O caso existe com `@spec` e passa. Removida a checagem das linhas 373-381, o caso reprova |
| L-07 | `apps/api/tests/vitrine-filtros-e-ordens.onp.int.test.ts`, `admin-situacao.test.ts`, configuração de limite em `apps/api/src/app.ts:706` e no apoio de teste | Isolar o limite de requisições por suíte (limite alto ou desligado na app de teste, ou chave/índice do Redis por suíte) | `pnpm test:int --continue` sem nenhuma resposta 429 inesperada. Os arquivos passam sozinhos e na rodada completa |
| L-08 | `apps/api/tests/conta-duas-contas.test.ts`, `apps/api/tests/apoio-de-compra.ts` | Alinhar a origem usada por `fecharPeloSite` com a lista de origens da app montada no teste | `npx vitest run --project api-int apps/api/tests/conta-duas-contas.test.ts` passa (2 casos) |
| L-09 | `apps/api/tests/rotas-da-conta-segura.test.ts`, rotas `/v1/conta/senha` e `/v1/conta/sessoes` | Descobrir por que o Bearer recém-emitido recebe 401 (teste desatualizado ou defeito na rota) e corrigir o que estiver errado | `[CA-3] @spec:AC-11117` e `[CA-4] @spec:AC-11118` passam |
| L-10 | `apps/api/tests/feed-e-tema.test.ts`, módulo do tema da vitrine | Conferir se a cor salva pelo dono (`#ff0055`) é a que a vitrine devolve. Hoje volta `#b7ff00` | O caso "o dono escolhe cor e imagens…" passa |
| L-11 | `package.json` (script `test:int`) ou README | Usar `--continue` no `test:int` ou documentar que a 1ª falha esconde as camadas seguintes | Uma falha em `@simpleclick/database` não impede os testes de `@simpleclick/api` de rodar e reportar |
| L-12 | `.github/workflows/` (não existe) | Criar o workflow da etapa 5 do plano (lint, tipos, unit, int com Postgres/Redis de serviço, build) | O workflow roda num PR e reporta cada camada separadamente |
| L-13 | `packages/database/seed/demo/LEIA-ME.md`, README | Explicar o fluxo de base nova em um só lugar (`migrar` → `seed` → `demo`) e que as imagens só existem depois do `demo`. Avaliar tirar do documento versionado as senhas das contas de teste (inclusive a do admin) | Numa base vazia, seguir só o README deixa as 24 lojas com imagens, e nenhuma senha que valha fora da base de teste fica no repositório |
| L-14 | Banco dev | Ter um comando para recriar a base dev limpa (hoje são 62 lojas, contra 24 documentadas) | Depois do comando, `select count(*) from app.stores` bate com o documentado |
