# CI/CD, containers, ambientes e DR

## Ambientes

| Ambiente | Banco | Credenciais | Dados | Quem acessa |
|---|---|---|---|---|
| dev (local) | local ou container | fictícias | seeds sintéticos | dev |
| preview/staging | próprio, isolado | próprias, de teste (sandbox de gateways) | sintéticos ou anonimizados | time |
| produção | próprio, rede privada | próprias, rotacionáveis | reais | deploy automatizado e poucos humanos com MFA |

- Nenhuma variável de produção é reutilizada em outro ambiente.
- Gateways de pagamento, fiscal e mensageria em modo sandbox fora de produção.
- Preview deploys (Vercel) usam banco de preview ou staging, nunca produção.

## Pipeline de CI

Os comandos devem ser os de `.workflow-ia/config.json` (campo `comandos`). O workflow abaixo é um exemplo em pnpm.

```yaml
# .github/workflows/ci.yml
name: ci
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verificar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - run: pnpm tsc --noEmit
      - run: pnpm lint
      - run: pnpm vitest run          # integração com Testcontainers usa o Docker do runner
      - run: pnpm audit --audit-level=high
      - run: pnpm build

  segredos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0              # histórico completo para o scan
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Regras:
- `permissions` mínimas no nível do workflow; eleve só no job que precisa.
- Actions de terceiros fixadas por SHA de commit; actions oficiais (`actions/*`) podem usar tag major.
- Nenhum `continue-on-error: true` em gate. Nenhum `if:` que desliga gate em branch da task.
- Segredos do CI via `secrets.*`, nunca ecoados. Workflows de `pull_request` de forks não recebem segredos; não troque para `pull_request_target` para contornar isso.
- Deploy para nuvem com OIDC em vez de chave de longa duração, quando a plataforma suporta.
- Complementos recomendados: SAST (CodeQL ou Semgrep), Dependabot ou Renovate, scan de imagem (Trivy), SBOM (CycloneDX) em releases. Detalhes de testes de segurança em `testes-qualidade`.

## Containers

Exemplo para Next.js com `output: 'standalone'` no `next.config`:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate && pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

- Multi-stage: ferramentas de build e dependências de desenvolvimento não chegam à imagem final.
- `USER node` (a imagem oficial já traz esse usuário sem privilégios).
- Nada de `ARG`/`ENV` com segredo: fica gravado nas camadas. Segredos entram em runtime pela plataforma. Se o build precisa de segredo, use BuildKit secret mount.
- Prisma em Alpine pode exigir `openssl` e `binaryTargets` compatíveis; confira a documentação da versão do Prisma em uso.
- `.dockerignore` com `node_modules`, `.next`, `.git`, `.env*`, `coverage`.
- Copie `package.json` e lockfile antes do código para aproveitar cache de camadas.
- `CMD` em forma exec (`["node", "server.js"]`) para o processo receber `SIGTERM`.
- Scan da imagem no CI e rebuild periódico para pegar patches da base.

## Deploy

### Railway
- Um environment por estágio, com variáveis próprias.
- Configure o health check do serviço apontando para `/readyz` e o comando de pre-deploy para rodar migrations (`prisma migrate deploy`), via painel ou config-as-code do projeto.
- Banco e Redis em rede privada do projeto; nada exposto publicamente sem necessidade.

### Vercel
- Variáveis por ambiente (Production, Preview, Development).
- Funções serverless abrem muitas conexões: use pooler (PgBouncer, Prisma Accelerate ou o pooler do provedor) e a URL direta só para migrations. Ver `backend-performance`.
- Migrations não rodam no build de cada preview contra banco compartilhado; rode num passo controlado do CI antes da promoção.

### Migrations em produção
- Sempre `prisma migrate deploy` (ou equivalente). Nunca `migrate dev`, `db push` ou `migrate reset` em produção.
- Expand/contract para mudanças incompatíveis:

| Passo | Deploy | Exemplo: renomear `nome` para `razaoSocial` |
|---|---|---|
| 1. Expand | migration + código que escreve nos dois | adiciona `razaoSocial` nullable; código grava nos dois |
| 2. Backfill | job em lotes | copia `nome` para `razaoSocial` |
| 3. Migrar leitura | código | lê de `razaoSocial` |
| 4. Contract | migration | torna `razaoSocial` NOT NULL e remove `nome` |

- Índices em tabelas grandes com `CREATE INDEX CONCURRENTLY` (migration SQL manual, fora de transação). Detalhes em `banco-modelagem`.
- Rollback: código anterior precisa funcionar com o schema novo; por isso, nada destrutivo no mesmo deploy.

## Segredos

- Armazenados na plataforma (Railway, Vercel, GitHub Secrets) ou em secret manager.
- `.env.example` com nomes e valores fictícios; `.env*` reais no `.gitignore`.
- Rotação periódica e imediata em caso de exposição: revogar, gerar novo, atualizar, verificar logs de uso do antigo.
- Secret scanning no CI (gitleaks) e, se disponível, push protection do GitHub.
- Variável com prefixo `NEXT_PUBLIC_` é embutida no bundle do navegador: nunca segredo.

## IAM e acessos

- Token de deploy por ambiente, com escopo mínimo e expiração.
- Acesso humano a produção com MFA, nominal, registrado e revisado periodicamente.
- Contas de serviço separadas por finalidade (app, migrations, leitura para BI).
- Permissões de banco em `banco-seguranca-operacao`.

## Borda

- WAF e proteção DDoS (ex.: Cloudflare) na frente da aplicação.
- TLS automático, redirecionamento para HTTPS, HSTS. Entre proxy e origem, TLS verificado.
- Rate limit na borda para rotas de autenticação, complementar ao rate limit da aplicação.

## DR, backups e custos

- Defina por sistema: RPO (quanto dado pode perder) e RTO (quanto tempo pode ficar fora). Exemplo para PDV: RPO 5 min, RTO 1 h.
- Backups automáticos com PITR, criptografados e em local separado da conta principal quando possível.
- Teste de restore periódico (ex.: trimestral) num ambiente isolado, cronometrando contra o RTO.
- Runbook de recuperação versionado no repositório.
- Alertas de billing e limites de gasto em todas as contas de nuvem; alerta de custo anômalo.
