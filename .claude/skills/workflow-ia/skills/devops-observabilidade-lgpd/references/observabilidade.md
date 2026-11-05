# Observabilidade

Logs dizem o que aconteceu, métricas dizem quanto e com que frequência, traces dizem onde o tempo foi gasto. Os três se ligam pelo correlation ID e pelo trace ID.

## Logger estruturado (pino)

```ts
// lib/logger.ts
import pino from 'pino';
import { env } from '@/lib/env';

export const logger = pino({
  level: env.LOG_LEVEL ?? 'info',
  base: { servico: 'vestics-api', ambiente: env.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.senha',
      '*.password',
      '*.token',
      '*.refreshToken',
      '*.cpf',
      '*.numeroCartao',
    ],
    censor: '[REDACTED]',
  },
});
```

- JSON em produção; formatação bonita (`pino-pretty`) só em dev, fora do bundle de produção.
- Redaction no logger é a rede de segurança; a regra principal é não passar o objeto sensível para o log.
- Logue IDs (`userId`, `clienteId`), não e-mail, nome, telefone ou CPF.
- Erros com `err` para o pino serializar stack: `logger.error({ err, requestId }, 'falha ao emitir nota')`.

## Correlation ID

### Express

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

type Contexto = { requestId: string; tenantId?: string; userId?: string };
export const contexto = new AsyncLocalStorage<Contexto>();

const ID_VALIDO = /^[A-Za-z0-9-]{8,64}$/;

app.use((req, res, next) => {
  const recebido = req.header('x-request-id');
  const requestId = recebido && ID_VALIDO.test(recebido) ? recebido : randomUUID();
  res.setHeader('x-request-id', requestId);
  contexto.run({ requestId }, next);
});

export function log() {
  return logger.child(contexto.getStore() ?? {});
}
```

### Next.js

- No `middleware.ts`, gere ou valide `x-request-id` e repasse ao handler com `NextResponse.next({ request: { headers } })`, também definindo o header na resposta.
- Em route handlers e Server Actions, leia o header (`(await headers()).get('x-request-id')`) e crie `logger.child({ requestId })`.

### Propagação
- Chamadas HTTP externas enviam `x-request-id` (e o contexto W3C `traceparent`, se houver tracing).
- Jobs de fila carregam `requestId` e `tenantId` nos dados do job; o worker cria o logger filho com eles.
- A resposta de erro (Problem Details) expõe o `requestId` para o suporte.

## Métricas

### RED por rota e USE por recurso

| Tipo | Métrica | Exemplo |
|---|---|---|
| Rate | requisições por segundo | `http_requests_total{route,method,status}` |
| Errors | taxa de 5xx e de falhas de negócio | `http_requests_total{status=~"5.."}` |
| Duration | latência p50/p95/p99 | `http_request_duration_seconds` (histograma) |
| Utilization | CPU, memória, conexões do pool em uso | métricas da plataforma e do pool |
| Saturation | fila de jobs, event loop lag, conexões esperando | `bullmq_waiting`, `nodejs_eventloop_lag_seconds` |
| Errors (recurso) | erros de conexão com banco/Redis | contador por dependência |

Com `prom-client`:

```ts
import client from 'prom-client';

client.collectDefaultMetrics(); // inclui event loop lag, heap, GC

export const duracaoHttp = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// middleware Express
app.use((req, res, next) => {
  const fim = duracaoHttp.startTimer();
  res.on('finish', () => {
    fim({ method: req.method, route: req.route?.path ?? 'desconhecida', status: String(res.statusCode) });
  });
  next();
});
```

- `route` é o template (`/vendas/:id`), nunca `req.originalUrl`: IDs na label explodem a cardinalidade.
- Nunca use `tenantId`, `userId` ou e-mail como label de métrica. Para análise por tenant, use logs ou eventos de negócio.
- Endpoint `/metrics` protegido (rede interna ou autenticação), não público.

### Métricas de negócio
- Vendas concluídas por minuto, ticket médio, falhas de pagamento por motivo, NFC-e pendentes, webhooks com falha, jobs na DLQ.
- Queda brusca de vendas em horário comercial é sintoma de incidente mesmo com taxa de erro normal.

## Tracing (OpenTelemetry)

### Next.js

```ts
// instrumentation.ts (raiz do projeto ou src/)
import { registerOTel } from '@vercel/otel';

export function register() {
  registerOTel({ serviceName: 'vestics-web' });
}
```

### Node/Express

```ts
// tracing.ts, carregado antes do resto da aplicação (ex.: node --import ./tracing.js server.js)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  serviceName: 'vestics-api',
  traceExporter: new OTLPTraceExporter(), // endpoint via OTEL_EXPORTER_OTLP_ENDPOINT
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```

- Auto-instrumentação cobre HTTP, Express, pg/Prisma (Prisma tem instrumentação própria, `@prisma/instrumentation`).
- Spans manuais nos casos de uso críticos (`registrarVenda`, `emitirNfce`) com atributos sem PII.
- Amostragem: 100% em staging; em produção, taxa ajustada ao volume, mantendo traces de erro.
- Inclua `trace_id` nos logs para pular do log para o trace.

## Sentry

- `@sentry/nextjs` no front e back do Next; `@sentry/node` em serviços Express.
- Configuração mínima: `dsn` via env, `environment`, `release` (SHA do commit), `tracesSampleRate` ajustado, `sendDefaultPii: false`.
- Source maps enviados no build com token de CI e removidos dos artefatos públicos (ex.: opção `sourcemaps.deleteSourcemapsAfterUpload` do plugin de build do Sentry, conforme a versão).
- `beforeSend` para remover dados pessoais que ainda passem (query strings, corpos).
- Erros de domínio esperados (422, 404) não viram issue; registre como breadcrumb ou métrica.
- Associe usuário por ID interno, não por e-mail.

## Health checks e graceful shutdown

```ts
// Express
const server = app.listen(env.PORT);

let encerrando = false;
app.get('/healthz', (_req, res) => res.status(200).json({ status: 'vivo' }));
app.get('/readyz', async (_req, res) => {
  if (encerrando) return res.status(503).json({ status: 'encerrando' });
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'pronto' });
  } catch {
    res.status(503).json({ status: 'indisponivel' });
  }
});

process.on('SIGTERM', () => {
  encerrando = true;                       // readiness passa a falhar: sai do balanceador
  server.close(async () => {               // para de aceitar e espera as requisições em andamento
    await worker?.close();                 // BullMQ: termina o job atual
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 25_000).unref(); // limite antes do SIGKILL da plataforma
});
```

- Liveness não verifica dependências: banco fora não deve reiniciar todas as instâncias em loop.
- Readiness verifica dependências essenciais com timeout curto.
- Em serverless (Vercel), não há processo longo; health check é a rota pública monitorada por uptime externo.

## Alertas

Bons alertas:
- Taxa de 5xx acima de X% por 5 minutos.
- p95 de rota crítica (checkout, fechamento de caixa) acima do SLO por 10 minutos.
- Jobs na DLQ acima de zero para integrações fiscais ou de pagamento.
- Circuit breaker aberto por mais de N minutos.
- Queda de vendas por minuto abaixo do esperado para o horário.
- Certificado TLS perto de expirar; backup não concluído; uso de disco do banco acima de 80%.

Cada alerta tem:
- Dono (quem é acionado).
- Severidade (acorda alguém ou vai para o canal do dia seguinte).
- Runbook com link: o que olhar, como mitigar, como escalar.

Evite: alerta por CPU alta isolada, por erro único, por log `warn`. Se ninguém age quando dispara, remova ou ajuste.

## O que revisar num diff

- Novo caminho de erro loga com `err` e contexto, e não engole a exceção.
- Nova integração tem métrica de sucesso/falha/latência e alerta de falhas acumuladas.
- Nenhum log imprime payload inteiro de request, resposta de fornecedor ou objeto de usuário.
- Novas labels de métrica têm cardinalidade limitada.
- Nova rota crítica entra no painel e no alerta de SLO.
