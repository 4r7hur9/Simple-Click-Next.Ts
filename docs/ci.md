# CI — `.github/workflows/ci.yml` (card #141)

Pipeline do GitHub Actions do SimpleClick: lint, tipos, testes, cobertura com
mínimo declarado, SCA das dependências (pnpm audit + Trivy), gitleaks, lint do
OpenAPI (Spectral) e build. Roda em `pull_request` e `push` para a `main` (e
por disparo manual). O workflow de desempenho (k6) é outro arquivo,
`.github/workflows/desempenho.yml`, do card #131.

Validado localmente em 20/11/2026, em `/Users/stargrupo/Projetos/SC` (`main`,
HEAD `69cf095` + alterações pendentes dos cards vizinhos), com `actionlint
1.7.x` e cada comando dos jobs rodado à mão. **Ainda não há execução no
GitHub**: o workflow só roda depois do push, que depende de autorização do
usuário (ver "O que falta para a execução verde").

## Antes de implementar: o que já existia, parcial e faltando

| Grupo          | Item                                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Já existia** | Padrão de workflow com actions fixadas por SHA, pnpm do `packageManager`, Node 24 e cache (`.github/workflows/desempenho.yml:56-70`, #131) — reaproveitado passo a passo                                    |
| **Já existia** | Scripts de raiz `lint`, `typecheck`, `test:unit`, `test:int` (`package.json:20-28`), `openapi:verificar` e `openapi:lint` (#137, `package.json:31-32`), `build` via turbo                                   |
| **Já existia** | Variáveis de ambiente nomeadas em `.env.example` e `turbo.json › tasks.test:int.env`; suíte de integração que cria um banco por arquivo a partir de `DATABASE_URL_TEST` (`packages/testing/src/db-test.ts`) |
| **Já existia** | Suíte verde local (#136, `docs/estruturacao/08-suite-verde.md`); `.spectral.yaml` e `docs/openapi.yaml` (#137); `coverage/` já no `.gitignore` e no `.prettierignore`                                       |
| **Parcial**    | `turbo.json` declara `outputs: ["coverage/**"]` para os testes, mas não havia provedor de cobertura instalado, nem `coverage` no `vitest.config.ts`, nem mínimo declarado                                   |
| **Parcial**    | gitleaks instalado na máquina (8.30.1) e usado pelo Workflow IA; nenhum `.gitleaks.toml` nem passo de CI (o `.gitleaks.toml` é do card #140)                                                                |
| **Faltando**   | `.github/workflows/ci.yml`, `@vitest/coverage-v8`, `coverage.thresholds`, script `test:coverage`, `.trivyignore`, exceções documentadas do SCA, este documento                                              |

## Jobs

| Job          | O que roda                                                                                                       | Serviços               |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `qualidade`  | `pnpm lint` · `pnpm typecheck` · `pnpm test:unit`                                                                | —                      |
| `integracao` | confere `pg_dump`/`pg_restore`/`psql` no runner · `pnpm test:int`                                                | PostgreSQL 16, Redis 7 |
| `cobertura`  | `pnpm test:coverage` (= `vitest run --coverage`, suíte inteira) · resumo no sumário · artefato `cobertura-<sha>` | PostgreSQL 16, Redis 7 |
| `sca`        | `pnpm audit --audit-level high` · Trivy fs (`vuln,misconfig,secret`, HIGH+CRITICAL, `--ignore-unfixed`)          | —                      |
| `gitleaks`   | gitleaks 8.30.1 (binário com checksum conferido) · `gitleaks git --config .gitleaks.toml` no histórico inteiro   | —                      |
| `openapi`    | `pnpm openapi:verificar` · `pnpm openapi:lint` (Spectral 6.15.0 via npx, falha em `warn`)                        | —                      |
| `build`      | `pnpm build` (turbo: API com `tsc`, site com `next build`, pacotes)                                              | —                      |

Todos começam igual: `actions/checkout` (sem credencial persistida),
`pnpm/action-setup` (lê `packageManager`), `actions/setup-node` com Node 24 e
`cache: pnpm`, `pnpm install --frozen-lockfile`. As actions ficam fixadas por
SHA com a tag em comentário, como no `desempenho.yml`.

### Variáveis dos jobs com banco e cache

Os nomes são os do `.env.example`; os valores são **de teste, fixos no YAML**
e visíveis de propósito: o runner é descartável e nenhuma porta é pública. A
API recusa iniciar sem `JWT_SECRET`, `SEGREDO_DE_REVALIDACAO` e as três
`SENHA_BANCO_*`, então algum valor precisa existir — nunca um valor real, nunca
um `secret` do repositório (não há segredo real a proteger no CI).

`DATABASE_URL_TEST` aponta para o superusuário `postgres` do serviço: a
migração 0001 cria os papéis `sc_migrator`/`sc_app`/`sc_admin` e o apoio de
teste cria um banco por arquivo; os dois exigem mais poder que a credencial de
migração. `NEXT_PUBLIC_API_URL`/`URL_DO_SITE` usam as portas 3100/3101 (as
3000/3001 são do preview do usuário na máquina; no runner tanto faz, mas a
convenção fica igual).

A prova AC-052 (`packages/database/src/copia-de-seguranca.test.ts`) pula sem
`pg_dump` na máquina, **mas na CI (`CI` definida) a falta reprova**. O runner
`ubuntu-24.04` traz o cliente PostgreSQL 16, da mesma versão do serviço
(`postgres:16-alpine`) — um passo confere isso antes da suíte.

## Cobertura

- Provedor: `@vitest/coverage-v8` **5.0.4**, mesma versão do `vitest` do
  catálogo (`pnpm-workspace.yaml › catalog`). Única dependência nova do card.
- Configuração em `vitest.config.ts › test.coverage`: só código de produto
  (`apps/*/src/**`, `packages/*/src/**`, sem testes, apoio de teste, código
  gerado pelo Prisma e `.next`), relatórios `text-summary`, `html`, `lcov` e
  `json-summary` em `coverage/`, `reportOnFailure: true`.
- Comando: `pnpm test:coverage`. Só liga com `--coverage`; `pnpm test:unit` e
  `pnpm test:int` não pagam a instrumentação.

### Medição real e mínimo declarado

| Recorte                                            | Linhas | Instruções | Funções | Ramos  |
| -------------------------------------------------- | ------ | ---------- | ------- | ------ |
| Só unidade (`unit` + `web` + `agente`), 20/11/2026 | 60,20% | 58,86%     | 57,48%  | 56,45% |
| Suíte inteira (unidade + integração), 20/11/2026   | 80,10% | 77,99%     | 79,75%  | 71,07% |
| **Mínimo declarado** (`coverage.thresholds`)       | **75** | **73**     | **75**  | **66** |

Suíte inteira: 570 arquivos, 5.175 testes (5.166 ok, 7 pulados, 2 falhas — ver
abaixo), 26.223/32.735 linhas cobertas, ~25 min nesta máquina com a
instrumentação. O mínimo fica ~5 pontos abaixo da medição (variação entre
máquinas, testes pulados por ferramenta ausente) e **acima do que a suíte
cumpre hoje por acidente**: baixá-lo é decisão escrita neste arquivo, nunca
ajuste silencioso. Quando a cobertura subir de forma estável, suba o piso
junto. Conferido que o piso é aplicado: rodar só um pacote com `--coverage`
termina em `ERROR: Coverage for lines (0%) does not meet global threshold
(75%)`.

Risco conhecido do job `cobertura` (não é defeito do produto): a instrumentação
v8 deixa o código mais lento, e dois testes afirmam TEMPO —
`apps/api/tests/vitrine-filtros-e-ordens.onp.int.test.ts` `[CA-9]` ("custo
extra abaixo de 45 ms em 10.000 produtos") falharam na medição local com a
cobertura ligada **e** outro `test:int` rodando ao mesmo tempo na máquina;
passam em `pnpm test:int` sem instrumentação (#136). Também
`apps/web/tests/vitrine-ui-a11y.test.tsx` estourou o `hookTimeout` de 10 s no
`beforeAll` sob a mesma carga. Se o runner reproduzir isso, o caminho é relaxar
só a janela de tempo desses testes **quando a cobertura está ligada** (ou
mover a prova de custo para o workflow de desempenho), nunca desligar o teste.

**Resolvido (card #156):** `vitest.config.ts` define `SC_COM_COBERTURA=1` quando
o comando leva `--coverage`, e as duas provas de tempo
(`metricas-desempenho.test.ts` e `vitrine-filtros-e-ordens.onp.int.test.ts`)
multiplicam o limite por 3 só nesse modo. Sem cobertura os limites são os de
sempre (1 s e 45/60 ms de custo extra); o teste continua rodando e medindo a
mesma coisa.

### Ambiente do CI (como o `.env` é reproduzido)

O `.env` nunca é versionado, então o `ci.yml` declara no nível do workflow as
mesmas variáveis do `.env.example`, com valores só de teste, e o
`globalPassThroughEnv` do `turbo.json` as repassa às tarefas. Os jobs que rodam
testes de API sobem **dois** PostgreSQL (5432 = desenvolvimento, 5433 = teste:
o AC-003 prova que o banco efêmero nunca nasce no servidor de desenvolvimento)
e um Redis; o passo "Banco de desenvolvimento" cria `simpleclick_dev` e aplica
as migrações com o superusuário do serviço, o que cria os papéis `sc_migrator`,
`sc_app` e `sc_admin`. A API conecta como `sc_app` (ela recusa superusuário e
cadeias iguais em `DATABASE_URL` e `DATABASE_URL_DIRETA`).

## SCA — pnpm audit e Trivy

Medição de 20/11/2026 na `main` **antes** das correções deste card:
`pnpm audit` com 48 vulnerabilidades (4 critical, 18 high, 23 moderate, 3 low)
e Trivy com 17 no `pnpm-lock.yaml` (4 critical, 13 high). Nenhuma era do
código do projeto; todas de dependências com correção publicada, menos uma.

Correções aplicadas (autorizadas pelo gerente: só patch/minor no mesmo major):

| Pacote                        | De → para       | Caminho                                   | Aviso                                                                         |
| ----------------------------- | --------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `next`                        | 16.4.0 → 16.4.1 | `apps/web/package.json` (direto)          | GHSA-2464-fhr4-w9xw (RCE, critical), GHSA-673q-mjm6-r5xr, GHSA-p3m5-59mp-jv5r |
| `body-parser@2`               | 2.3.0 → 2.4.0   | override (via `express` 5.3.0)            | GHSA-27r3-jxmh-p828 (DoS)                                                     |
| `handlebars@4`                | 4.7.9 → 4.7.10  | override (via `eslint-plugin-boundaries`) | GHSA-p8wg-vrv2-v86f, GHSA-8r5x-fm3f-whwj (critical)                           |
| `mysql2@3`                    | 3.15.3 → 3.22.0 | override (via `prisma`)                   | GHSA-3f6p-5ww8-9rcr                                                           |
| `fast-uri@3`                  | 3.1.5 → 3.1.7   | override (via `prisma`)                   | GHSA-f65p-4m7j-42xc e outras 4                                                |
| `effect@3`                    | 3.20.0 → 3.22.1 | override (via `@prisma/config`)           | GHSA-7589-6fvf-x4pw (ReDoS)                                                   |
| `brace-expansion@>=4 <5.0.11` | 5.0.9 → 5.0.11  | override (via `eslint`)                   | GHSA-6j4f-fj2g-mc7p, GHSA-qhr7-859c-m2p7                                      |
| `source-map-js@1`             | 1.2.1 → 1.2.2   | override (via `@vitest/coverage-v8`)      | GHSA-68fv-2mgg-jv7q                                                           |
| `undici@8`                    | 8.11.2 → 8.12.2 | override (via `vitest` › `jsdom`, só dev) | GHSA-2m5v-pch6-74hx e outras 3                                                |
| `vite@8`                      | 8.2.1 → 8.2.4   | override (via `vitest`, só dev)           | GHSA-587h-7wmj-h5pm                                                           |

Os overrides ficam em `pnpm-workspace.yaml › overrides` (o pnpm 11 não lê mais
o campo `pnpm` do `package.json`), com seletor de major
(`pacote@N`) para não alcançar outras linhas de versão. Quando o pacote
de origem (express, prisma, eslint, vitest) passar a pedir a versão corrigida,
o override pode sair.

### Exceções do SCA (justificadas, com data de revisão)

| Identificador                        | Pacote               | Motivo                                                                                                                                                                                                                                                                                                         | Revisão                        | Onde                                                            |
| ------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| GHSA-ggr8-5vv4-36mx / CVE-2026-40345 | `deepmerge-ts` 7.1.5 | Prototype pollution no merge. Chega só por `@prisma/config` (o CLI do Prisma lê `prisma.config.ts` em `prisma generate`/migrações); nunca roda na API em execução nem recebe entrada de usuário. A correção é MAJOR (8.0.0) e o `@prisma/config` 7.10.0 ainda não a pede. Reavaliar no próximo bump do Prisma. | 2026-11-20 (expira 2027-02-20) | `pnpm-workspace.yaml › auditConfig.ignoreGhsas`, `.trivyignore` |

Depois das correções (20/11/2026): `pnpm audit --audit-level high` → exit 0
(17 vulnerabilidades restantes: 2 low, 14 moderate, 1 high **ignorada** = a
exceção acima); Trivy fs → **0** vulnerabilidades no `pnpm-lock.yaml`, exit 0
numa cópia só dos arquivos versionados (como o runner vê o repositório). Pós-bump:
`pnpm install --frozen-lockfile`, `pnpm typecheck` (9/9), `pnpm test:unit`
(426 arquivos, 0 falhas) e `pnpm build` verdes.

O que o Trivy aponta na máquina e **não** chega ao CI: `infra/traefik/certs/*.key`
(chaves TLS locais) estão no `.gitignore` — só o `.gitkeep` é versionado.

## gitleaks

Conforme o card de ambientes (#140, `docs/ambientes-e-deploy.md` §4.3):
checkout com `fetch-depth: 0`; binário 8.30.1 (mesma versão da máquina) baixado
da release oficial com checksum SHA-256 conferido; **configuração lida do
branch base** (`git show origin/<base>:.gitleaks.toml`), para um PR não
afrouxar a regra que o julga, com fallback para o `.gitleaks.toml` do checkout
enquanto a `main` ainda não tiver o arquivo; comando
`gitleaks git --config <cfg> --log-opts=--all --no-banner --redact` (histórico
inteiro, todas as referências) e relatório SARIF como artefato. Nunca
`gitleaks dir` na raiz: leria um `.env` real.

Local, 20/11/2026: o mesmo comando com o `.gitleaks.toml` do #140 sobre 426
commits → `no leaks found`, exit 0 (o arquivo abre exceções estreitas só para
os 5 falsos positivos do histórico; ainda não está commitado — ver "O que
falta").

## OpenAPI

Comandos do card #137: `pnpm openapi:verificar` (o `contrato/openapi.json` e o
`docs/openapi.yaml` estão em dia com o contrato Zod) e `pnpm openapi:lint`
(Spectral 6.15.0 via `npx --yes`, ruleset `.spectral.yaml`, falha em `warn`).
Precisa de rede para o `npx`. Documentação em `docs/arquitetura/openapi-lint.md`.

## Resultados locais (20/11/2026)

| Passo                                 | Resultado                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actionlint .github/workflows/ci.yml` | ✅ sem achados                                                                                                                                    |
| `pnpm install --frozen-lockfile`      | ✅                                                                                                                                                |
| `pnpm lint`                           | ✅ exit 0 (0 erros, 40 avisos `max-depth`/`max-params`)                                                                                           |
| `pnpm typecheck`                      | ✅ exit 0 (9/9)                                                                                                                                   |
| `pnpm test:unit`                      | ✅ exit 0 depois do bump: 426 arquivos (api 104, web 271, core 23, ui 17, contracts 7, agente 2, config-eslint 2), 0 falhas                       |
| `pnpm test:int`                       | ✅ no #136 (`08-suite-verde.md`); aqui rodou dentro de `test:coverage`                                                                            |
| `pnpm test:coverage`                  | 80,10% linhas · 77,99% instruções · 79,75% funções · 71,07% ramos; 5.166 ok, 2 falhas de TEMPO sob instrumentação + carga (ver "Risco conhecido") |
| `pnpm audit --audit-level high`       | ✅ exit 0 depois do bump (antes: 4 critical + 18 high); 1 high ignorada com justificativa                                                         |
| Trivy fs                              | ✅ exit 0 na cópia versionada depois do bump (antes: 17 no lockfile); na máquina aponta só as chaves TLS locais, ignoradas pelo git               |
| gitleaks                              | ✅ `gitleaks git --config .gitleaks.toml --redact` (comando do CI): 426 commits, 0 vazamentos                                                     |
| `pnpm openapi:verificar`              | ✅ contrato e yaml em dia                                                                                                                         |
| `pnpm openapi:lint`                   | ✅ "No results with a severity of 'warn' or higher"                                                                                               |
| `pnpm build`                          | ✅ turbo 2/2 (API `tsc` + site `next build` com next 16.4.1), 24 s                                                                                |

`act` não está instalado na máquina; a validação do YAML foi com `actionlint`
(instalado via Homebrew para este card) e cada `run:` executado à mão.

## O que falta para a execução verde no GitHub

1. **Push autorizado pelo usuário.** Nada roda no GitHub sem o push; o link da
   execução verde (exigência da entrega) só existe depois disso.
2. **Commit do `.gitleaks.toml` do #140** junto com (ou antes de) este
   workflow: o job `gitleaks` usa `--config .gitleaks.toml` e falha se o
   arquivo não existir no checkout. Já existe na árvore de trabalho e o comando
   do CI passou com ele.
3. **Testes de tempo no job `cobertura`** (ver "Risco conhecido" em Cobertura):
   podem reprovar no runner por causa da instrumentação; se acontecer, o
   ajuste é na janela de tempo desses testes com cobertura ligada, não no
   workflow. (`barras-fixas.onp.test.ts` `[CA-27]`, que falhava por um CSS não
   commitado de outro card, já passa.)
4. **Prettier** (`pnpm format:check`) não está no `ci.yml` porque não era do
   pedido e reprova em 2 arquivos versionados (`scripts/telas-da-landing/variantes.mjs`,
   `scripts/testes-mobile/landing-mobile.mjs`, card #40). Formatados, cabe um
   passo `pnpm format:check` no job `qualidade`.
5. Rede no runner para `npx @stoplight/spectral-cli` e para o download do
   gitleaks e do banco do Trivy (padrão nos runners hospedados).
