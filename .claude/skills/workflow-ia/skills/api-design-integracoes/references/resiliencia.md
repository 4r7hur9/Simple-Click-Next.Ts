# Resiliência em integrações

Fornecedores externos (gateway de pagamento, emissor fiscal, frete, WhatsApp, marketplace) ficam lentos, caem, mudam contrato e repetem eventos. O sistema precisa continuar correto em todos esses casos.

## Adapter e anti-corruption layer

```ts
// modules/pagamentos/application/portas.ts
export type ResultadoCobranca =
  | { status: 'APROVADA'; idExterno: string }
  | { status: 'PENDENTE'; idExterno: string }
  | { status: 'RECUSADA'; motivo: 'SALDO' | 'FRAUDE' | 'DADOS_INVALIDOS' | 'OUTRO' };

export interface GatewayPagamento {
  cobrar(input: { tenantId: string; pedidoId: string; valorCentavos: number; chaveIdempotencia: string }): Promise<ResultadoCobranca>;
}
```

```ts
// modules/pagamentos/infra/gateway-x-adapter.ts
import { z } from 'zod';
import type { GatewayPagamento } from '../application/portas';

const respostaSchema = z.object({
  id: z.string(),
  status: z.enum(['approved', 'pending', 'rejected']),
  status_detail: z.string().optional(),
});

export function criarGatewayX(cfg: { baseUrl: string; apiKey: string; timeoutMs: number }): GatewayPagamento {
  return {
    async cobrar(input) {
      const resposta = await fetch(`${cfg.baseUrl}/v1/payments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.chaveIdempotencia,
        },
        body: JSON.stringify({ amount: input.valorCentavos, reference: input.pedidoId }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      if (resposta.status >= 500 || resposta.status === 429) {
        throw new FornecedorIndisponivelError('gateway-x', resposta.status);
      }
      const dados = respostaSchema.parse(await resposta.json());
      if (dados.status === 'approved') return { status: 'APROVADA', idExterno: dados.id };
      if (dados.status === 'pending') return { status: 'PENDENTE', idExterno: dados.id };
      return { status: 'RECUSADA', motivo: mapearMotivo(dados.status_detail) };
    },
  };
}
```

- Nomes, enums e códigos do fornecedor morrem no adapter.
- Os campos do exemplo são ilustrativos. Use a documentação oficial do fornecedor; não invente endpoints ou campos.
- Credenciais vêm da config validada; nunca hardcoded.
- Se o fornecedor tem SDK oficial mantido, prefira o SDK dentro do adapter.

## Timeout

- Todo `fetch` externo com `signal: AbortSignal.timeout(ms)`. Axios: opção `timeout`.
- Valor derivado do SLA do fornecedor e do orçamento de latência da rota (ex.: rota com p95 alvo de 800 ms não pode esperar 30 s pelo frete).
- Timeout em operação não idempotente gera incerteza (cobrou ou não?). Trate como `PENDENTE` e reconcilie consultando o fornecedor, em vez de cobrar de novo.

## Retry com backoff exponencial e jitter

```ts
type OpcoesRetry = { tentativas: number; baseMs: number; maxMs: number; deveRepetir: (e: unknown) => boolean };

export async function comRetry<T>(fn: () => Promise<T>, o: OpcoesRetry): Promise<T> {
  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa < o.tentativas; tentativa++) {
    try {
      return await fn();
    } catch (e) {
      ultimoErro = e;
      if (!o.deveRepetir(e) || tentativa === o.tentativas - 1) break;
      const teto = Math.min(o.maxMs, o.baseMs * 2 ** tentativa);
      const espera = Math.random() * teto; // full jitter
      await new Promise((r) => setTimeout(r, espera));
    }
  }
  throw ultimoErro;
}
```

Quando repetir:
- Sim: erro de rede, timeout em operação idempotente, `429` (respeitando `Retry-After`), `502`, `503`, `504`.
- Não: `400`, `401`, `403`, `404`, `409`, `422`, erro de validação de resposta.
- Operação não idempotente: só com chave de idempotência aceita pelo fornecedor.

Limites:
- Poucas tentativas síncronas (2 ou 3) no caminho do usuário; retries longos vão para a fila.
- Retry em várias camadas multiplica tentativas (3 x 3 x 3 = 27). Faça retry em uma camada só.

## Circuit breaker

Evita martelar um fornecedor fora do ar e libera o usuário rápido. Com `opossum`:

```ts
import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker((input: CotacaoInput) => freteAdapter.cotar(input), {
  timeout: 3000,                 // considera falha acima de 3 s
  errorThresholdPercentage: 50,  // abre com 50% de falhas na janela
  resetTimeout: 30_000,          // tenta meio-aberto após 30 s
});
breaker.fallback(() => ({ status: 'INDISPONIVEL' as const }));

export const cotarFrete = (input: CotacaoInput) => breaker.fire(input);
```

- Um breaker por dependência, instanciado uma vez por processo.
- Exponha estado do breaker em métricas e alerte quando abrir.
- Fallback só com comportamento definido na spec.

## Degradação graciosa

| Dependência fora | Comportamento aceitável (definir na spec) |
|---|---|
| Cálculo de frete | Mostrar "frete a combinar" ou tabela fixa |
| Emissor fiscal | Contingência prevista pela regra fiscal, fila para emissão posterior |
| Gateway de pagamento | Oferecer outra forma de pagamento; nunca marcar como pago |
| Envio de WhatsApp/e-mail | Enfileirar e tentar depois; a venda não falha por isso |
| Busca externa de CEP | Permitir preenchimento manual |

Regra: efeitos secundários (notificação, analytics) nunca derrubam a operação principal.

## Filas, retries assíncronos e DLQ (BullMQ)

```ts
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const filaIntegracoes = new Queue('integracoes', { connection });

await filaIntegracoes.add('emitir-nfce', { tenantId, vendaId }, {
  jobId: `nfce-${vendaId}`,                 // deduplica (BullMQ não aceita ":" em jobId customizado)
  attempts: 8,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: false,                      // mantém falhas para análise
});

new Worker('integracoes', async (job) => {
  const dados = emitirNfceSchema.parse(job.data);
  await emitirNfce(dados); // idempotente: checa se a venda já tem nota antes de emitir
}, { connection, concurrency: 5 });
```

- Handler do worker é idempotente: pode rodar mais de uma vez para o mesmo job.
- Job que esgotou tentativas é a DLQ: fica em `failed`, gera alerta e tem procedimento de reprocessamento.
- Payload mínimo (IDs), não o objeto inteiro: o worker relê o estado atual do banco.
- Em outro stack (SQS, RabbitMQ, Cloud Tasks), aplique o equivalente: visibilidade/ack, max receives e DLQ nativa.

## Outbox pattern

Garante que "gravou no banco" e "publicou evento/chamou fornecedor" não divirjam.

```prisma
model Outbox {
  id           String    @id @default(uuid())
  tenantId     String
  tipo         String
  agregadoId   String
  payload      Json
  criadoEm     DateTime  @default(now()) @db.Timestamptz(6)
  processadoEm DateTime? @db.Timestamptz(6)
  reservadoEm  DateTime? @db.Timestamptz(6)
  tentativas   Int       @default(0)

  @@index([processadoEm, criadoEm])
}
```

1. O caso de uso grava a mudança de negócio e a linha de outbox na mesma transação.
2. Um relay (job periódico ou worker) reserva pendentes num único `UPDATE` atômico, sem bloquear outros relays, e publica fora de qualquer transação:

```ts
type LinhaOutbox = { id: string; tipo: string; payload: unknown };

export async function processarOutbox(): Promise<number> {
  // reserva atômica: SKIP LOCKED evita que dois relays peguem a mesma linha
  const linhas = await prisma.$queryRaw<LinhaOutbox[]>`
    UPDATE "Outbox" SET "reservadoEm" = now()
    WHERE id IN (
      SELECT id FROM "Outbox"
      WHERE "processadoEm" IS NULL
        AND ("reservadoEm" IS NULL OR "reservadoEm" < now() - interval '5 minutes')
      ORDER BY "criadoEm"
      LIMIT 50
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, tipo, payload`;

  for (const linha of linhas) {
    // fora de transação: a fila deduplica por jobId se o relay cair e republicar
    await filaIntegracoes.add(linha.tipo, linha.payload, { jobId: linha.id });
    await prisma.outbox.update({ where: { id: linha.id }, data: { processadoEm: new Date() } });
  }
  return linhas.length;
}
```

- Reserva expirada (relay caiu no meio) volta a ser elegível depois de 5 minutos.
- Entrega é pelo menos uma vez: consumidores deduplicam por id do evento.
- O nome da tabela e colunas no SQL cru segue o mapeamento real do schema (`@@map`, `@map`).
- Limpeza periódica de linhas processadas antigas.

## Consistência eventual e reconciliação

- Estado intermediário no modelo: `AGUARDANDO_PAGAMENTO`, `NOTA_PENDENTE`.
- UI mostra o estado real ("pagamento em confirmação"), não assume sucesso.
- Job de reconciliação periódico consulta o fornecedor para itens pendentes há mais de X minutos e corrige o estado.
- Transições de estado validadas no domínio: webhook atrasado de "pendente" não pode sobrescrever "aprovado".

## Testes de integração com fornecedor

- Adapter testado com servidor HTTP falso (ex.: MSW ou `nock`) cobrindo: sucesso, 4xx, 5xx, timeout, resposta fora do schema.
- Caso de uso testado com implementação fake da porta.
- Nunca chame o fornecedor real no CI; sandbox só em testes manuais ou suíte separada.
