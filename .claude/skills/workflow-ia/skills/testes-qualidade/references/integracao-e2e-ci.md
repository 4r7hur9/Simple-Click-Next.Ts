# Integração com banco real, autorização, concorrência, E2E e CI

Referência aprofundada da skill `testes-qualidade`. Leia ao configurar Testcontainers, escrever testes de integração, de autorização entre tenants ou de concorrência, escrever testes Playwright, ou alterar o pipeline de CI e as ferramentas de segurança.

Exemplos com Vitest, Testcontainers, Prisma, Supertest, MSW e Playwright. Em outro stack, aplique o equivalente. Antes de criar estrutura nova, veja como o projeto já organiza testes e imite; os comandos reais estão em `.workflow-ia/config.json`.

## 1. Banco real com Testcontainers

### Por que não mock do Prisma
Mock do client prova que o código chamou `prisma.venda.create` com certos argumentos. Não prova que a query retorna o que se espera, que a constraint existe, que a transação desfaz, que o `updateMany` condicional impede venda dupla nem que a migration roda.

### Subir o banco e aplicar migrations
```ts
// test/support/banco.ts
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';

export async function iniciarBanco() {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start(); // mesma versão maior de produção
  const url = container.getConnectionUri();
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
  const prisma = new PrismaClient({ datasourceUrl: url });
  return {
    prisma,
    url,
    async parar() {
      await prisma.$disconnect();
      await container.stop();
    },
  };
}
```
```ts
// uso num arquivo de integração
let banco: Awaited<ReturnType<typeof iniciarBanco>>;
beforeAll(async () => { banco = await iniciarBanco(); }, 120_000);
afterAll(async () => { await banco.parar(); });
```

### Como o código testado recebe o banco
- **Preferível**: use cases recebem o client (ou repositórios) por parâmetro/injeção. O teste passa `banco.prisma`.
- **Alternativa**: um container por execução no `globalSetup` do Vitest, repassando a URL aos testes com `provide`/`inject` (confira a assinatura na versão do Vitest do projeto), e o módulo de config lendo essa URL antes de instanciar o client.
- Nunca aponte testes para banco de desenvolvimento compartilhado, staging ou produção.

### Isolamento entre testes
- **Tenant novo por teste**: cada teste cria sua loja; consultas filtram por tenant; permite paralelismo dentro do arquivo. É o padrão recomendado para SaaS multi-tenant e ainda exercita o filtro de tenant.
- **Truncate entre testes**: quando o teste precisa de banco vazio.
```ts
export async function limparBanco(prisma: PrismaClient) {
  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tabelas.length === 0) return;
  // nomes vêm do catálogo do próprio banco, não de entrada externa
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tabelas.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}
```

### Convenções
- `*.test.ts` para unitário e `*.int.test.ts` para integração (ou a convenção já existente no projeto), com comandos separados para rodar cada grupo.
- Timeout maior só no `beforeAll` do container, não nos testes.

## 2. Factories

```ts
// test/support/factories.ts
let seq = 0;

export async function criarLoja(prisma: PrismaClient, over: Partial<{ nome: string }> = {}) {
  seq++;
  const tenant = await prisma.tenant.create({ data: { nome: over.nome ?? `Loja ${seq}` } });
  const dono = await prisma.usuario.create({
    data: { tenantId: tenant.id, email: `dono${seq}@teste.local`, nome: 'Dono', papel: 'dono', passwordHash: HASH_TESTE },
  });
  return { tenant, dono, ctx: { tenantId: tenant.id, userId: dono.id, papel: 'dono' as const } };
}

export function criarProduto(prisma: PrismaClient, ctx: ContextoAuth, over: Partial<{ nome: string; estoque: number; precoCentavos: number }> = {}) {
  seq++;
  return prisma.produto.create({
    data: {
      tenantId: ctx.tenantId,
      nome: over.nome ?? `Produto ${seq}`,
      sku: `SKU-${seq}`,
      estoque: over.estoque ?? 10,
      precoCentavos: over.precoCentavos ?? 1_000,
    },
  });
}
```
- Valores padrão válidos; o teste sobrescreve só o que importa para o cenário.
- E-mails em domínio reservado (`.local`, `example.com`), nomes fictícios, CPF gerado válido e fictício.
- `HASH_TESTE` pré-calculado: não rode Argon2 real a cada factory.

## 3. Rotas e Server Actions

### Express com Supertest
```ts
import request from 'supertest';

it('[CA-1] cria a venda e responde 201', async () => {
  const res = await request(app)
    .post('/v1/vendas')
    .set('Authorization', `Bearer ${await tokenDe(operadora)}`)
    .set('Idempotency-Key', 'teste-ca1')
    .send({ caixaId, itens: [{ produtoId, quantidade: 2 }] })
    .expect(201);
  expect(res.body).toMatchObject({ totalCentavos: 9_980 });
});
```

### Next.js
- Mantenha Route Handlers e Server Actions finos; a regra e a autorização por recurso ficam no use case, testado em integração com `ContextoAuth` explícito.
- Para testar o handler em si, mocke apenas a fronteira de sessão (o helper que lê cookie), nunca o use case:
```ts
vi.mock('@/lib/auth/contexto', () => ({ exigirSessao: vi.fn() }));
import { exigirSessao } from '@/lib/auth/contexto';
import { GET } from '@/app/api/v1/vendas/[id]/route';

it('[CA-1] não expõe venda de outro tenant', async () => {
  vi.mocked(exigirSessao).mockResolvedValue(ctxLojaB);
  const res = await GET(new Request(`http://localhost/api/v1/vendas/${vendaA.id}`), { params: Promise.resolve({ id: vendaA.id }) });
  expect(res.status).toBe(404);
});
```
A forma do segundo argumento do handler (`params` como Promise desde o Next 15) depende da versão do projeto.
- Fluxos que dependem de cookies, middleware e redirecionamento reais são cobertos no E2E.

## 4. Matriz de autorização

Para cada rota/ação nova ou alterada que acessa recurso:

| Caso | Esperado | Verificar também |
|---|---|---|
| Sem sessão/token | 401 | nada gravado |
| Usuário do tenant B, recurso do tenant A | 404 | recurso de A intacto |
| Usuário do tenant A com papel sem permissão | 403 | nada gravado |
| Usuário do tenant A com permissão | sucesso | efeito esperado |
| Id inexistente | 404 | mesma resposta do caso "outro tenant" |
| Campo proibido no body (`tenantId`, `papel`, `precoCentavos`) | 400 ou ignorado | valor não mudou no banco |

```ts
describe('[CA-4] estorno de venda: autorização', () => {
  it('[CA-4] sem sessão responde 401', async () => {
    await request(app).post(`/v1/vendas/${vendaA.id}/estorno`).expect(401);
  });
  it('[CA-4] outro tenant responde 404 e não estorna', async () => {
    await request(app).post(`/v1/vendas/${vendaA.id}/estorno`).set(auth(gerenteB)).expect(404);
    expect((await banco.prisma.venda.findUniqueOrThrow({ where: { id: vendaA.id } })).status).toBe('paga');
  });
  it('[CA-4] operador de outro dia responde 403', async () => {
    await request(app).post(`/v1/vendas/${vendaAntigaA.id}/estorno`).set(auth(operadorA)).expect(403);
  });
  it('[CA-4] gerente do tenant estorna', async () => {
    await request(app).post(`/v1/vendas/${vendaA.id}/estorno`).set(auth(gerenteA)).expect(200);
  });
});
```

## 5. Concorrência e idempotência

```ts
it('[CA-5] mesma Idempotency-Key em paralelo cria uma única venda', async () => {
  const enviar = () =>
    request(app).post('/v1/vendas').set(auth(operadoraA)).set('Idempotency-Key', 'chave-unica').send(corpo);

  const [r1, r2] = await Promise.all([enviar(), enviar()]);

  expect([r1.status, r2.status].sort()).toEqual([201, 201]);
  expect(r1.body.id).toBe(r2.body.id);
  expect(await banco.prisma.venda.count({ where: { tenantId: lojaA.tenant.id } })).toBe(1);
});
```
- O pool do client de teste precisa ter mais de uma conexão, senão as operações são serializadas e o teste não prova nada.
- Race conditions são probabilísticas: repetir o cenário em loop (ex.: 20 vezes) aumenta a chance de expor o bug sem deixar o teste lento demais.
- Verifique sempre o **estado final** do banco, não só as respostas.
- Se o projeto responder 409 para a duplicata em processamento, ajuste o esperado ao contrato definido na spec.

## 6. Tempo, rede e aleatoriedade

- Relógio: injete um `Relogio` no use case ou use `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime(...)`. Falsificar todos os timers atrapalha drivers de banco e Testcontainers.
- Rede externa: bloqueie e simule com MSW.
```ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const servidor = setupServer(
  http.post('https://gateway.exemplo.com/v1/cobrancas', () => HttpResponse.json({ id: 'pg_1', status: 'aprovado' })),
);
beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' })); // qualquer chamada não prevista falha o teste
afterEach(() => servidor.resetHandlers());
afterAll(() => servidor.close());
```
- Teste também o caminho de falha do fornecedor (timeout, 503, resposta inválida) com handlers específicos por teste.
- Aleatoriedade: IDs e valores fixos ou gerador com semente.

## 7. E2E com Playwright

### Quando
Somente fluxos críticos: login, venda no PDV do início ao pagamento, fluxo principal da task quando o critério é de interface. Regras e variações ficam em unitário/integração.

### Configuração essencial
```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/operadora.json' }, dependencies: ['setup'] },
  ],
  webServer: { command: 'npm run start:e2e', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI },
});
```
- `e2e/.auth/` no `.gitignore`.
- O comando do `webServer` usa banco de teste descartável, nunca staging/produção.

### Teste
```ts
import { expect, test } from '@playwright/test';

test('[CA-1] operadora registra venda e vê o estoque atualizado', async ({ page }) => {
  await page.goto('/pdv');
  await page.getByLabel('Buscar produto').fill('Camiseta P');
  await page.getByRole('option', { name: /Camiseta P/ }).click();
  await page.getByLabel('Quantidade').fill('2');
  await page.getByRole('button', { name: 'Finalizar venda' }).click();

  await expect(page.getByRole('status')).toHaveText('Venda concluída');
  await expect(page.getByText('Total: R$ 99,80')).toBeVisible();
});
```
- Seletores por papel, rótulo e texto visível (também valida acessibilidade básica).
- Asserções `expect(locator)` já esperam; nada de `waitForTimeout`.
- Dados semeados por API/banco no `beforeEach`, não criados clicando pela interface.
- Regressão visual (`await expect(page).toHaveScreenshot()`) só em telas estáveis do design system.
- Verificação de acessibilidade automatizada opcional com `@axe-core/playwright` (`new AxeBuilder({ page }).analyze()`); ver `acessibilidade-ux`.

## 8. Gate e CI

### Ordem sugerida
1. Instalação com lockfile (`npm ci` ou equivalente).
2. Typecheck strict.
3. Lint.
4. Testes unitários.
5. Testes de integração (Docker disponível no runner).
6. E2E dos fluxos críticos.
7. Segurança: SAST, SCA, secret scanning.
8. DAST (ZAP baseline) contra staging, fora do caminho do PR ou em job agendado.

Os comandos concretos de 1 a 6 vêm de `.workflow-ia/config.json`. Nenhuma etapa é removida, marcada como `continue-on-error` ou tem limite afrouxado para fazer a task passar.

### Ferramentas de segurança
| Categoria | Ferramentas | O que bloqueia |
|---|---|---|
| SAST | Semgrep (`semgrep scan --config p/default --error`), CodeQL | padrões inseguros no código (injeção, eval, segredos óbvios) |
| SCA | `npm audit --audit-level=high`, Dependabot/Renovate, Snyk | dependência com vulnerabilidade alta/crítica |
| Secret scanning | gitleaks, push protection do GitHub | segredo commitado |
| DAST | OWASP ZAP baseline | headers ausentes, cookies inseguros, exposição em staging |

### Cobertura
- Provider v8 (`vitest run --coverage`); limites (`thresholds`) no config do projeto.
- Não reduza limites para passar. Cobertura nos arquivos alterados não pode cair.
- Cobertura mede execução, não verificação: combine com a revisão de asserts e, em módulos críticos, mutation testing.

### Testes intermitentes
- Teste intermitente é bug: investigue (tempo, ordem, dados compartilhados, espera ausente).
- Quarentena só com issue registrada e prazo; nunca `skip` silencioso.
- `retries` do Playwright no CI ajuda a coletar trace; não é correção.
