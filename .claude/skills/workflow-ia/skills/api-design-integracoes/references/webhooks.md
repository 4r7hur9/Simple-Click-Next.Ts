# Webhooks

## Recebendo webhooks

Objetivo: aceitar só eventos autênticos, responder rápido, nunca processar o mesmo evento duas vezes e tolerar ordem trocada.

### Passo a passo

1. Ler o corpo bruto (`await request.text()` no Route Handler; `express.raw({ type: 'application/json' })` no Express).
2. Verificar assinatura sobre o corpo bruto, com comparação em tempo constante.
3. Verificar timestamp dentro de uma janela (ex.: 5 minutos) contra replay.
4. Validar o payload com schema.
5. Gravar o evento numa tabela de entrada com unique por `(provedor, eventoId)`. Duplicado responde 200 sem reprocessar.
6. Enfileirar o processamento e responder 2xx imediatamente.
7. Worker processa de forma idempotente, validando a transição de estado.

### Verificação de assinatura (esquema genérico)

Cada fornecedor define o seu esquema (quais headers, o que é assinado, hex ou base64). Siga a documentação oficial. Quando houver SDK oficial com verificação, use-o (ex.: Stripe: `stripe.webhooks.constructEvent(corpoBruto, assinatura, segredo)`).

Exemplo para um esquema HMAC-SHA256 sobre `${timestamp}.${corpo}` em hex:

```ts
// lib/webhooks/assinatura.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const JANELA_SEGUNDOS = 300;

export function assinaturaValida(params: {
  corpoBruto: string;
  assinatura: string | null;
  timestamp: string | null;
  segredo: string;
  agora?: number;
}): boolean {
  const { corpoBruto, assinatura, timestamp, segredo } = params;
  if (!assinatura || !timestamp) return false;

  const ts = Number(timestamp);
  const agora = Math.floor((params.agora ?? Date.now()) / 1000);
  if (!Number.isFinite(ts) || Math.abs(agora - ts) > JANELA_SEGUNDOS) return false;

  const esperada = createHmac('sha256', segredo).update(`${timestamp}.${corpoBruto}`).digest('hex');
  const a = Buffer.from(esperada, 'hex');
  const b = Buffer.from(assinatura, 'hex');
  return a.length === b.length && timingSafeEqual(a, b); // timingSafeEqual exige tamanhos iguais
}
```

- Nunca compare assinaturas com `===` (vaza tempo).
- Nunca reserialize o JSON antes de verificar: `JSON.stringify(JSON.parse(x))` pode diferir do original.
- Segredo por fornecedor (e por tenant, se cada loja tem sua conta), vindo da config validada.
- Fornecedor sem assinatura: exija pelo menos token secreto em header e, para eventos críticos (pagamento), confirme o estado consultando a API do fornecedor antes de agir.

### Route Handler de entrada

```ts
// app/api/webhooks/pagamentos/route.ts
import { Prisma } from '@prisma/client';
import { assinaturaValida } from '@/lib/webhooks/assinatura';

export const runtime = 'nodejs'; // node:crypto

export async function POST(request: Request) {
  const corpoBruto = await request.text();
  const ok = assinaturaValida({
    corpoBruto,
    assinatura: request.headers.get('x-assinatura'),
    timestamp: request.headers.get('x-timestamp'),
    segredo: env.GATEWAY_WEBHOOK_SECRET,
  });
  if (!ok) return new Response(null, { status: 401 });

  const evento = eventoGatewaySchema.safeParse(JSON.parse(corpoBruto));
  if (!evento.success) return new Response(null, { status: 400 });

  try {
    const registro = await prisma.webhookRecebido.create({
      data: { provedor: 'gateway-x', eventoId: evento.data.id, tipo: evento.data.type, payload: evento.data, status: 'PENDENTE' },
      select: { id: true },
    });
    await filaWebhooks.add('pagamento', { webhookId: registro.id }, { jobId: registro.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new Response(null, { status: 200 }); // já recebido
    }
    throw e; // 500: o fornecedor reenviará
  }
  return new Response(null, { status: 200 });
}
```

- Se o enfileiramento falhar depois do insert, o evento fica `PENDENTE` no banco. Um job periódico reenfileira pendentes antigos (padrão inbox). O `jobId` evita duplicar na fila.
- Webhook não passa por autenticação de sessão nem CSRF; a assinatura é a autenticação. Exclua a rota do middleware de sessão de forma explícita e restrita a esse caminho.
- Limite o tamanho do corpo aceito.

### Worker

```ts
new Worker('webhooks', async (job) => {
  const { webhookId } = z.object({ webhookId: z.string().uuid() }).parse(job.data);
  const w = await prisma.webhookRecebido.findUniqueOrThrow({ where: { id: webhookId } });
  if (w.status === 'PROCESSADO') return;

  const evento = eventoGatewaySchema.parse(w.payload);
  await prisma.$transaction(async (tx) => {
    const pagamento = await tx.pagamento.findFirst({ where: { idExterno: evento.data.paymentId } });
    if (!pagamento) throw new Error(`Pagamento ${evento.data.paymentId} não encontrado`);

    // transição condicional: evento atrasado não regride estado
    if (evento.type === 'payment.approved') {
      await tx.pagamento.updateMany({
        where: { id: pagamento.id, status: { in: ['PENDENTE', 'AGUARDANDO'] } },
        data: { status: 'APROVADO', aprovadoEm: new Date() },
      });
    }
    await tx.webhookRecebido.update({ where: { id: w.id }, data: { status: 'PROCESSADO', processadoEm: new Date() } });
  });
}, { connection });
```

- Confira que o valor e a moeda do evento batem com o pedido antes de marcar como pago.
- O tenant é derivado do registro interno (pagamento, pedido), nunca de um campo livre do payload.
- Eventos fora de ordem: use máquina de estados com transições permitidas, ou consulte o estado atual no fornecedor.
- Falhas definitivas vão para DLQ com alerta.

### Modelo de entrada

```prisma
model WebhookRecebido {
  id           String    @id @default(uuid())
  provedor     String
  eventoId     String
  tipo         String
  payload      Json
  status       String    // PENDENTE | PROCESSADO | FALHOU
  recebidoEm   DateTime  @default(now()) @db.Timestamptz(6)
  processadoEm DateTime? @db.Timestamptz(6)

  @@unique([provedor, eventoId])
  @@index([status, recebidoEm])
}
```

Retenção: payloads podem conter dados pessoais. Defina prazo e limpeza (ver `devops-observabilidade-lgpd`).

## Enviando webhooks

Quando o sistema notifica clientes ou parceiros (ex.: integração da loja com ERP).

### Formato

```http
POST <url do cliente>
Content-Type: application/json
X-Webhook-Id: 3f1c...                (id único do evento, estável entre retries)
X-Webhook-Timestamp: 1790000000
X-Webhook-Assinatura: v1=<hex HMAC-SHA256 de "timestamp.corpo">

{ "id": "3f1c...", "tipo": "venda.concluida", "criadoEm": "2026-09-29T12:00:00Z", "dados": { "vendaId": "..." } }
```

- Considere seguir a especificação Standard Webhooks, se os consumidores já a usam.
- Segredo por endpoint, exibido uma vez ao cliente; suporte a dois segredos ativos durante rotação.
- Payload mínimo; dados pessoais só se o cliente precisa e tem base legal.

### Entrega

- Sempre por fila, nunca inline na requisição que gerou o evento. O evento nasce no outbox.
- Timeout curto (5 a 10 s), `redirect: 'manual'` para não seguir redirecionamentos.
- Sucesso = qualquer 2xx. Retry com backoff exponencial e jitter por horas (ex.: até 24 h).
- Após esgotar tentativas: DLQ, registro visível ao cliente e reenvio manual.
- Muitas falhas consecutivas: desativar o endpoint e notificar o dono.
- Log de entregas (status, latência, tentativa) consultável pelo cliente, sem corpo sensível.

### Segurança da URL de destino (SSRF)

- Aceite só `https://`.
- Resolva o DNS e bloqueie IPs privados, loopback, link-local (incluindo `169.254.169.254`) e metadados de nuvem, antes de cada entrega.
- Não siga redirecionamentos.
- Detalhes em `backend-seguranca`.

## Checklist rápido de webhook

| Item | Recebido | Enviado |
|---|---|---|
| Assinatura HMAC com timestamp | verificar | gerar |
| Corpo bruto | obrigatório para verificar | assinar exatamente o que envia |
| Deduplicação | unique por event id | id estável entre retries |
| Assíncrono | fila após gravar | fila a partir do outbox |
| Retry | fornecedor reenvia; worker idempotente | backoff + jitter + DLQ |
| Ordem | máquina de estados | documentar que não há garantia de ordem |
| Dados pessoais | retenção definida | mínimo necessário |
