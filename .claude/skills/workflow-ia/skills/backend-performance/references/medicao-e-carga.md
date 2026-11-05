# Medição, profiling e teste de carga

Referência aprofundada da skill `backend-performance`. Leia quando precisar medir latência, CPU, memória ou número de queries, investigar lag do event loop, escrever teste de carga ou montar a evidência de performance da task.

Ferramentas citadas: Node 20+, Prisma, clinic.js, k6. Em outro stack, aplique o equivalente (profiler da linguagem, contagem de queries do ORM, ferramenta de carga).

## 1. Método

1. **Defina a métrica** que importa para a task: p95 da rota, número de queries por request, tempo de um job, pico de memória.
2. **Meça a linha de base** no mesmo ambiente e com os mesmos dados em que vai medir depois.
3. **Mude uma coisa por vez.**
4. **Meça de novo** e registre a diferença. Sem melhora mensurável, reverta a otimização complexa.
5. **Olhe percentis, não média.** Média esconde a cauda que o usuário sente (p95, p99).

Evidência mínima no pacote de provas:
```text
Rota: GET /v1/vendas?limit=50
Ambiente: local, Postgres 16 em container, seed com 20.000 vendas no tenant de teste
Antes: 51 queries/request, p95 412 ms (k6, 20 VUs, 60 s)
Depois: 2 queries/request, p95 38 ms (mesmo cenário)
Como reproduzir: npm run test:perf -- vendas
```

## 2. Contar queries (guarda contra N+1)

O jeito mais barato de provar que um N+1 foi resolvido, e de impedir que volte, é um teste de integração que conta queries.

```ts
import { PrismaClient } from '@prisma/client';

export function criarPrismaContador(url: string) {
  const prisma = new PrismaClient({
    datasourceUrl: url,
    log: [{ emit: 'event', level: 'query' }],
  });
  let total = 0;
  prisma.$on('query', () => { total++; });
  return {
    prisma,
    zerar: () => { total = 0; },
    total: () => total,
  };
}

// no teste
it('[CA-4] lista 50 vendas com número constante de queries', async () => {
  await semearVendas(tenantId, 50, { itensPorVenda: 3 });
  contador.zerar();
  await listarVendas(contador.prisma, { tenantId, limit: 50 });
  expect(contador.total()).toBeLessThanOrEqual(3); // não cresce com N
});
```
- Compare com N diferente (10 e 50): se o total cresce com N, há N+1.
- `datasourceUrl` existe no Prisma 5.2+; em versões com driver adapter, passe a conexão pelo adapter conforme o projeto.

## 3. Medir tempo dentro da aplicação

### Server-Timing
Expõe no DevTools do navegador quanto tempo cada etapa levou.
```ts
const t0 = performance.now();
const vendas = await listarVendas(ctx, params);
const tDb = performance.now() - t0;
return Response.json(vendas, { headers: { 'Server-Timing': `db;dur=${tDb.toFixed(1)}` } });
```
Não exponha em produção se os tempos revelarem algo sensível; habilite por flag.

### Lag e utilização do event loop
```ts
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const atraso = monitorEventLoopDelay({ resolution: 20 });
atraso.enable();

setInterval(() => {
  const elu = performance.eventLoopUtilization();
  logger.info({
    eventLoopP99Ms: atraso.percentile(99) / 1e6, // valores em nanossegundos
    eventLoopUtilizacao: elu.utilization,
  }, 'saude-event-loop');
  atraso.reset();
}, 30_000).unref();
```
- p99 de lag acima de ~100 ms indica bloqueio: procure código síncrono ou CPU pesada.
- Utilização perto de 1 com CPU alta: o processo está saturado; escale ou mova trabalho para worker.

## 4. Profiling

| Pergunta | Ferramenta |
|---|---|
| Onde está o gargalo (CPU, I/O, event loop, GC)? | `npx clinic doctor -- node dist/server.js` |
| Quais funções consomem CPU? | `npx clinic flame -- node dist/server.js` ou `node --cpu-prof` (abre o `.cpuprofile` no Chrome DevTools) |
| Onde o tempo assíncrono se acumula? | `npx clinic bubbleprof -- node dist/server.js` |
| Memória cresce sem parar? | `node --heap-prof`, `v8.writeHeapSnapshot()`, `npx clinic heapprofiler` |
| Depuração interativa | `node --inspect` + Chrome DevTools (aba Performance/Memory) |

Procedimento:
1. Suba o servidor com o profiler.
2. Gere carga representativa (k6 ou autocannon) na rota suspeita.
3. Encerre e leia o relatório: barras largas no flame graph são onde o tempo está.
4. Corrija o topo da lista primeiro; repita.

### Sinais de vazamento de memória
- Heap cresce a cada ciclo de carga e não volta após GC.
- Suspeitos comuns: `Map`/array de módulo que só cresce (cache sem limite), listeners adicionados por request, closures guardando requests, timers não cancelados.
- Cache em memória sempre com limite de itens (LRU) e TTL.

## 5. Observabilidade contínua

- Tracing distribuído com OpenTelemetry (`@opentelemetry/sdk-node` + auto-instrumentações de HTTP, Express, pg/Prisma, ioredis).
- Métricas por rota: taxa, erros, duração (RED) com p50/p95/p99.
- Métricas do processo: CPU, memória, lag do event loop, conexões do pool em uso e em espera.
- Configuração e alertas são responsabilidade de `devops-observabilidade-lgpd`; aqui, garanta que o código novo não fique invisível (spans e atributos com `tenantId` e rota, nunca dado pessoal).

## 6. Teste de carga com k6

### Onde rodar
- Local ou staging, com dados semeados em volume realista (um tenant grande, não só o de teste vazio).
- **Nunca contra produção ou sistema de terceiros sem autorização por escrito.**
- Desative ou ajuste o rate limit do ambiente de teste, ou teste justamente o rate limit, mas saiba qual dos dois está medindo.

### Script
```js
// perf/vendas-listagem.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    rampa: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 20 },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300', 'p(99)<800'],
  },
};

export function setup() {
  const res = http.post(`${__ENV.BASE_URL}/v1/auth/login`, JSON.stringify({
    email: __ENV.PERF_EMAIL,
    senha: __ENV.PERF_SENHA,
  }), { headers: { 'Content-Type': 'application/json' } });
  return { token: res.json('accessToken') };
}

export default function (data) {
  const res = http.get(`${__ENV.BASE_URL}/v1/vendas?limit=50`, {
    headers: { Authorization: `Bearer ${data.token}` },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}
```
Execução: `k6 run -e BASE_URL=http://localhost:3000 -e PERF_EMAIL=... -e PERF_SENHA=... perf/vendas-listagem.js`.

- `thresholds` fazem o k6 sair com código de erro quando a meta não é atingida; use isso como gate opcional.
- Credenciais de teste por variável de ambiente, nunca no script.
- Para escrita (registrar venda), gere dados únicos por iteração e limpe depois; cuidado com efeitos colaterais (e-mail, nota fiscal) desligados no ambiente de teste.

### Tipos de teste
| Tipo | Objetivo | Forma |
|---|---|---|
| Smoke | script funciona | 1-2 VUs por 30 s |
| Carga | comportamento no volume esperado | rampa até o pico normal, sustentar |
| Estresse | onde quebra | subir além do pico até degradar |
| Pico (spike) | abertura de loja, Black Friday | salto brusco de VUs |
| Resistência (soak) | vazamento, pool, conexões | carga moderada por 30-60 min |

Alternativas: Artillery (YAML/JS), autocannon (rápido para uma rota local).

## 7. Lendo resultados

- **p95 sobe e erros sobem juntos**: saturação (pool, CPU, fornecedor). Veja conexões em espera e lag do event loop.
- **p95 alto com CPU baixa**: espera de I/O; procure queries lentas (`banco-performance`), chamadas externas em série, locks.
- **Latência cresce ao longo do teste de resistência**: vazamento de memória ou de conexões, fila crescendo.
- **Timeouts de conexão ao banco**: pool pequeno para a concorrência, ou transações longas segurando conexões.
- **Throughput para de crescer ao adicionar VUs**: encontrou o gargalo; identifique o recurso saturado antes de otimizar outra coisa.
