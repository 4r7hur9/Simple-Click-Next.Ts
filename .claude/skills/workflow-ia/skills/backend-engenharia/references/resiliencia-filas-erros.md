# Resiliência, filas, erros e ciclo de vida

Referência aprofundada da skill `backend-engenharia`. Leia quando integrar com serviço externo, criar job/worker, montar o error handler, a config de ambiente, o health check ou o graceful shutdown.

Exemplos com Node 20+, Express, Next.js Route Handlers, BullMQ, opossum e Zod. Em outro stack, aplique o equivalente.

## 1. Chamadas externas

### Timeout sempre
```ts
const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(3_000),
});
```
- Escolha o timeout pelo SLA do fornecedor e pelo orçamento da rota, não pelo "maior possível".
- Clientes HTTP de SDK também têm opção de timeout; configure explicitamente.
- Leia o corpo com o mesmo cuidado: resposta gigante ou lenta também é falha.

### Retry com backoff exponencial e jitter
```ts
import { setTimeout as sleep } from 'node:timers/promises';

type OpcoesRetry = {
  tentativas: number;
  baseMs?: number;
  maxMs?: number;
  deveRetentar: (erro: unknown) => boolean;
};

export async function comRetry<T>(fn: () => Promise<T>, o: OpcoesRetry): Promise<T> {
  const base = o.baseMs ?? 200;
  const max = o.maxMs ?? 5_000;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (erro) {
      if (i >= o.tentativas - 1 || !o.deveRetentar(erro)) throw erro;
      await sleep(Math.random() * Math.min(max, base * 2 ** i)); // full jitter
    }
  }
}

export class HttpError extends Error {
  constructor(readonly status: number, readonly retryAfterSeg?: number) {
    super(`HTTP ${status}`);
  }
}

export function erroTransitorio(e: unknown): boolean {
  if (e instanceof HttpError) return [408, 429, 502, 503, 504].includes(e.status);
  if (e instanceof DOMException && e.name === 'TimeoutError') return true;
  return e instanceof TypeError; // falha de rede no fetch do Node
}
```
- `fetch` não lança em 4xx/5xx: converta `!res.ok` em `HttpError` antes do retry decidir.
- Respeite `Retry-After` em 429/503 quando existir.
- Nunca retente 400, 401, 403, 404, 409, 422: o resultado não muda.
- Operação não idempotente (cobrança, envio de e-mail) só pode ser retentada com idempotency key aceita pelo fornecedor.
- Limite o tempo total: tentativas x timeout precisa caber no orçamento da rota. Se não cabe, é trabalho de fila.

### Circuit breaker
Evita martelar um fornecedor que já está fora e libera a rota rapidamente.

```ts
import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker(cotarFrete, {
  timeout: 3_000,                // falha a chamada após 3 s
  errorThresholdPercentage: 50,  // abre com 50% de erro na janela
  resetTimeout: 30_000,          // tenta meio-aberto após 30 s
});
breaker.fallback(() => ({ disponivel: false as const }));

export const cotarFreteResiliente = (cep: string) => breaker.fire(cep);
```
- O fallback precisa ser uma degradação explícita que o chamador sabe tratar, não um valor falso que parece real.
- Exponha o estado do breaker em métricas.

### Adapter (anti-corruption layer)
- Um módulo por fornecedor em `infra/`, com interface definida pelo domínio (`GatewayPagamento`, `EmissorNotaFiscal`).
- O adapter valida a resposta do fornecedor com Zod e converte para tipos do domínio.
- O domínio nunca importa tipos do SDK do fornecedor. Trocar de fornecedor muda só o adapter.

## 2. Filas com BullMQ

### Produtor
```ts
import { Queue } from 'bullmq';

export const filaNotaFiscal = new Queue('nota-fiscal', { connection: redisConnection });

await filaNotaFiscal.add(
  'emitir',
  { vendaId },
  {
    jobId: `nf-${vendaId}`,                  // dedupe: mesmo id não enfileira duas vezes
    attempts: 5,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: true,
    removeOnFail: false,                     // mantém falhas para análise
  },
);
```

### Consumidor
```ts
import { Worker } from 'bullmq';

const PayloadSchema = z.object({ vendaId: z.string().uuid() });

export const workerNotaFiscal = new Worker(
  'nota-fiscal',
  async (job) => {
    const { vendaId } = PayloadSchema.parse(job.data);
    await emitirNotaFiscal(vendaId); // idempotente: verifica se já emitiu antes de emitir
  },
  { connection: redisConnection, concurrency: 5 },
);

workerNotaFiscal.on('failed', (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    logger.error({ jobId: job.id, err }, 'job esgotou tentativas'); // alerta + DLQ
  }
});
```
- BullMQ não tem DLQ nativa: jobs esgotados ficam no conjunto `failed`. Monitore e, se o projeto exigir, mova para uma fila de falhas no evento `failed`.
- Job pode rodar mais de uma vez (crash após efeito, antes do ack). Idempotência é obrigatória.
- Payload pequeno: passe IDs, não objetos inteiros; o worker lê o estado atual do banco.
- Worker roda em processo separado do servidor web quando a carga justificar.
- Em serverless (Vercel), worker de longa duração não roda: use o serviço de fila/cron da plataforma ou um processo no Railway.

### Quando usar fila
- Envio de e-mail, nota fiscal, relatório, importação de planilha, processamento de imagem, integração lenta.
- Rota responde `202 Accepted` com o id do job ou do recurso; o cliente consulta status ou recebe notificação.

## 3. Erros padronizados (RFC 9457)

### Hierarquia
```ts
export abstract class DomainError extends Error {
  abstract readonly status: number;
  abstract readonly type: string; // URI estável, ex.: https://erros.exemplo.com/estoque-insuficiente
  constructor(readonly detail: string) {
    super(detail);
    this.name = new.target.name;
  }
}

export class EstoqueInsuficienteError extends DomainError {
  readonly status = 409;
  readonly type = 'https://erros.exemplo.com/estoque-insuficiente';
  constructor(readonly produtoId: string) {
    super(`Estoque insuficiente para o produto ${produtoId}`);
  }
}
```

### Conversão central
```ts
type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: unknown;
};

export function toProblem(err: unknown, instance: string): ProblemDetails {
  if (err instanceof DomainError) {
    return { type: err.type, title: err.name, status: err.status, detail: err.detail, instance };
  }
  if (err instanceof z.ZodError) {
    return { type: 'about:blank', title: 'Entrada inválida', status: 400, errors: err.issues, instance };
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return { type: 'about:blank', title: 'Conflito', status: 409, instance };
    if (err.code === 'P2025') return { type: 'about:blank', title: 'Não encontrado', status: 404, instance };
  }
  return { type: 'about:blank', title: 'Erro interno', status: 500, instance }; // sem detalhe interno
}
```

### Express
```ts
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const problem = toProblem(err, req.originalUrl);
  if (problem.status >= 500) logger.error({ err, requestId: req.get('x-request-id') }, 'erro não tratado');
  res.status(problem.status).type('application/problem+json').json(problem);
});
```
- Express 4 não captura rejeição de handler `async`: use wrapper ou `express-async-errors`. Express 5 encaminha a rejeição ao error handler.
- O error handler é registrado por último.

### Next.js Route Handler
```ts
export function comTratamentoDeErro(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (err) {
      const problem = toProblem(err, new URL(req.url).pathname);
      if (problem.status >= 500) logger.error({ err }, 'erro não tratado');
      return new Response(JSON.stringify(problem), {
        status: problem.status,
        headers: { 'content-type': 'application/problem+json' },
      });
    }
  };
}

export const POST = comTratamentoDeErro(async (req) => { /* ... */ });
```
- Em Server Actions, devolva um resultado tipado (`{ ok: false, erro }`) para erros de domínio e deixe erro técnico propagar para o error boundary; nunca serialize a exceção inteira.

## 4. Config validada no boot
```ts
// src/lib/env.ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  GATEWAY_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
});

export const env = EnvSchema.parse(process.env); // lança no boot se faltar algo
```
- Nenhum outro módulo lê `process.env` diretamente.
- Segredos não têm valor padrão.
- Next.js: variáveis `NEXT_PUBLIC_` vão para o bundle do cliente; nunca coloque segredo nelas.

## 5. Health check e graceful shutdown

### Endpoints
- `GET /healthz` (liveness): processo responde (sem dependências). Usado para reiniciar.
- `GET /readyz` (readiness): dependências essenciais ok (banco com `SELECT 1`, Redis `PING`), e 503 durante o encerramento. Usado para tirar do balanceador.

### Encerramento
```ts
const server = app.listen(env.PORT);
let encerrando = false;

async function encerrar(sinal: string) {
  if (encerrando) return;
  encerrando = true; // /readyz passa a responder 503
  logger.info({ sinal }, 'encerrando');
  const forcar = setTimeout(() => process.exit(1), 25_000);
  forcar.unref();

  server.close(async () => {
    await Promise.allSettled([workerNotaFiscal.close(), prisma.$disconnect(), redis.quit()]);
    clearTimeout(forcar);
    process.exit(0);
  });
  server.closeIdleConnections(); // conexões keep-alive ociosas não seguram o close
}

process.on('SIGTERM', () => void encerrar('SIGTERM'));
process.on('SIGINT', () => void encerrar('SIGINT'));
```
- `worker.close()` do BullMQ espera o job em curso terminar.
- O timeout de força deve ser menor que o grace period da plataforma.
