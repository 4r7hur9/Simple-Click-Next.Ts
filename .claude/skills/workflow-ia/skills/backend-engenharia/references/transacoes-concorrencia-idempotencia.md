# Transações, concorrência e idempotência

Referência aprofundada da skill `backend-engenharia`. Leia quando a task gravar em várias tabelas, disputar um recurso (estoque, saldo, sequência, cupom), receber pagamento/webhook ou precisar publicar efeito colateral de forma confiável.

Exemplos com Prisma + PostgreSQL. Em outro ORM/banco, aplique o equivalente (transação explícita, `SELECT ... FOR UPDATE`, constraint UNIQUE).

## 1. Transações no Prisma

### Formas disponíveis
- **Interativa**: `prisma.$transaction(async (tx) => { ... }, opções)`. Use quando um passo depende do resultado do anterior.
- **Em lote**: `prisma.$transaction([op1, op2])`. Use quando as operações são independentes e já conhecidas.
- **Nested write**: `create` com relações aninhadas é atômico por si só.

### Opções
```ts
await prisma.$transaction(async (tx) => { /* ... */ }, {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, // padrão do Postgres
  maxWait: 2_000,  // espera máxima por conexão do pool
  timeout: 5_000,  // duração máxima da transação (padrão 5 s)
});
```

### Armadilhas
- Dentro do callback, use **somente `tx`**. Chamar `prisma.x` ali executa fora da transação e não é desfeito no rollback.
- Não capture exceção dentro do callback só para "seguir em frente": o rollback depende da exceção sair do callback.
- Transação longa segura conexão do pool e locks. Nada de `fetch`, e-mail, upload ou `queue.add` lá dentro.
- Não use `Promise.all` com `tx` para escritas dependentes; a ordem importa para locks.

### Serializable com retry
Serializable elimina anomalias, mas o banco aborta transações em conflito. Prisma sinaliza com `P2034`. Retente um número limitado de vezes.

```ts
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export async function emTransacaoSerializavel<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  tentativas = 3,
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10_000,
      });
    } catch (e) {
      const conflito = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034';
      if (conflito && i < tentativas) continue;
      throw e;
    }
  }
}
```

## 2. Exemplo completo: registrar venda (PDV)

Requisitos típicos: preço vem do banco (nunca do cliente), estoque não pode ficar negativo, venda, itens, movimento de caixa e evento de nota fiscal são atômicos.

```ts
export async function registrarVenda(tx: Prisma.TransactionClient, ctx: Ctx, input: RegistrarVendaInput) {
  // 1. ordem consistente de lock evita deadlock entre duas vendas com os mesmos itens
  const itens = [...input.itens].sort((a, b) => a.produtoId.localeCompare(b.produtoId));

  // 2. preço e existência vêm do banco, filtrados pelo tenant
  const produtos = await tx.produto.findMany({
    where: { tenantId: ctx.tenantId, id: { in: itens.map((i) => i.produtoId) } },
    select: { id: true, precoCentavos: true },
  });
  const preco = new Map(produtos.map((p) => [p.id, p.precoCentavos]));

  // 3. baixa de estoque condicional e atômica
  for (const item of itens) {
    const { count } = await tx.produto.updateMany({
      where: { id: item.produtoId, tenantId: ctx.tenantId, estoque: { gte: item.quantidade } },
      data: { estoque: { decrement: item.quantidade } },
    });
    if (count === 0) throw new EstoqueInsuficienteError(item.produtoId);
  }

  // 4. snapshot do preço no item (histórico não é redundância)
  const totalCentavos = itens.reduce((s, i) => s + preco.get(i.produtoId)! * i.quantidade, 0);
  const venda = await tx.venda.create({
    data: {
      tenantId: ctx.tenantId,
      operadorId: ctx.userId,
      totalCentavos,
      itens: {
        create: itens.map((i) => ({
          produtoId: i.produtoId,
          quantidade: i.quantidade,
          precoUnitarioCentavos: preco.get(i.produtoId)!,
        })),
      },
    },
  });

  // 5. movimento de caixa e outbox na mesma transação
  await tx.movimentoCaixa.create({
    data: { tenantId: ctx.tenantId, caixaId: input.caixaId, vendaId: venda.id, valorCentavos: totalCentavos },
  });
  await tx.outboxEvento.create({
    data: { tenantId: ctx.tenantId, tipo: 'venda.registrada', payload: { vendaId: venda.id } },
  });
  return venda;
}
```

Observação: o `!` após `preco.get` só é seguro porque o passo 3 falharia antes se o produto não existisse no tenant. Se o fluxo mudar, troque por checagem explícita.

## 3. Escolhendo a estratégia de concorrência

| Situação | Estratégia | Como |
|---|---|---|
| Decremento/incremento com limite (estoque, saldo, vagas) | Update condicional atômico | `updateMany` com condição no `where` e checagem de `count` |
| Edição de registro por dois usuários (cadastro, rascunho) | Lock otimista | coluna `version`; `where: { id, version }`, `version: { increment: 1 }`; `count === 0` vira 409 |
| Decisão que lê várias linhas antes de gravar | Lock pessimista | `SELECT ... FOR UPDATE` via `tx.$queryRaw` |
| Sequência por tenant (número da venda) | Linha contadora | `tx.contador.update({ data: { valor: { increment: 1 } } })` retorna o novo valor com a linha travada |
| Unicidade de negócio (um caixa aberto por operador) | Constraint no banco | índice UNIQUE (parcial, se preciso); `P2002` vira 409 |
| Seção crítica sem linha natural para travar | Advisory lock | `SELECT pg_advisory_xact_lock(hashtext(${chave}))` dentro da transação |

### Lock otimista
```ts
const { count } = await prisma.pedido.updateMany({
  where: { id, tenantId, version: input.version },
  data: { observacao: input.observacao, version: { increment: 1 } },
});
if (count === 0) throw new ConflitoDeVersaoError(id); // 409, cliente recarrega
```

### Lock pessimista
```ts
const [caixa] = await tx.$queryRaw<{ id: string; aberto: boolean }[]>`
  SELECT id, aberto FROM caixa
  WHERE id = ${caixaId} AND tenant_id = ${tenantId}
  FOR UPDATE`;
if (!caixa?.aberto) throw new CaixaFechadoError(caixaId);
```
- O template tag parametriza os valores; nunca use `$queryRawUnsafe` com interpolação.
- Nomes de tabela/coluna seguem o `@@map`/`@map` do schema.
- `FOR UPDATE` só tem efeito dentro de transação.

## 4. Idempotência

### Modelo
```prisma
model IdempotencyKey {
  id          String   @id @default(uuid())
  tenantId    String
  key         String
  requestHash String
  resposta    Json?
  criadoEm    DateTime @default(now()) @db.Timestamptz
  @@unique([tenantId, key])
}
```

### Fluxo A: tudo no banco (sem terceiro no meio)
Grave a chave na **mesma transação** da operação. Uma requisição duplicada concorrente fica bloqueada no índice UNIQUE até a primeira terminar; se a primeira confirmar, a segunda recebe `P2002` e devolve a resposta guardada; se a primeira falhar, a segunda executa normalmente.

```ts
export async function criarVendaIdempotente(ctx: Ctx, key: string, input: RegistrarVendaInput) {
  const requestHash = sha256(JSON.stringify(input)); // input já normalizado pelo Zod
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.idempotencyKey.create({ data: { tenantId: ctx.tenantId, key, requestHash } });
      const venda = await registrarVenda(tx, ctx, input);
      const resposta = { status: 201, body: toVendaDTO(venda) };
      await tx.idempotencyKey.update({
        where: { tenantId_key: { tenantId: ctx.tenantId, key } },
        data: { resposta },
      });
      return resposta;
    });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    const existente = await prisma.idempotencyKey.findUnique({
      where: { tenantId_key: { tenantId: ctx.tenantId, key } },
    });
    if (!existente) throw e; // o P2002 veio de outra constraint
    if (existente.requestHash !== requestHash) throw new IdempotencyKeyReutilizadaError(); // 422
    return RespostaArmazenadaSchema.parse(existente.resposta);
  }
}
```

### Fluxo B: com chamada externa (gateway de pagamento)
A chamada não pode ficar dentro da transação. Use estados:
1. Transação curta: cria a chave com `status = 'processando'`.
2. Chama o gateway **repassando a mesma idempotency key** (os gateways sérios aceitam).
3. Transação curta: grava o resultado e `status = 'concluido'`.
4. Duplicata com `processando`: responda 409 ("em processamento") ou aguarde e releia.
5. Chave presa em `processando` além do timeout: reconcilie consultando o gateway, não reexecute às cegas.

### Retenção
- Guarde chaves por um período definido (ex.: 24 h a 7 dias) e limpe com job agendado.

## 5. Webhooks recebidos
1. Verifique assinatura (ver `backend-seguranca`).
2. Grave `ProcessedEvent` com UNIQUE `(provedor, eventId)`; `P2002` significa duplicata: responda 200 e pare.
3. Enfileire o processamento e responda 2xx rápido; o provedor reenvia se você demorar.
4. Não confie na ordem de entrega: compare timestamps/versões antes de aplicar mudança de estado.

## 6. Outbox pattern
Garante que "gravou no banco" e "avisou o mundo" não divergem.

```prisma
model OutboxEvento {
  id           String    @id @default(uuid())
  tenantId     String    @map("tenant_id")
  tipo         String
  payload      Json
  criadoEm     DateTime  @default(now()) @map("criado_em") @db.Timestamptz
  reservadoAte DateTime? @map("reservado_ate") @db.Timestamptz
  publicadoEm  DateTime? @map("publicado_em") @db.Timestamptz
  @@index([publicadoEm, criadoEm])
  @@map("outbox_evento")
}
```

Relay (worker agendado), reservando lote sem bloquear outros relays:
```ts
const lote = await prisma.$queryRaw<{ id: string; tipo: string; payload: unknown }[]>`
  UPDATE outbox_evento SET reservado_ate = now() + interval '60 seconds'
  WHERE id IN (
    SELECT id FROM outbox_evento
    WHERE publicado_em IS NULL AND (reservado_ate IS NULL OR reservado_ate < now())
    ORDER BY criado_em
    LIMIT 50
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id, tipo, payload`;

for (const ev of lote) {
  await filaEventos.add(ev.tipo, ev.payload, { jobId: ev.id }); // jobId dedupe na fila
  await prisma.outboxEvento.update({ where: { id: ev.id }, data: { publicadoEm: new Date() } });
}
```
- A entrega é "pelo menos uma vez": o consumidor precisa ser idempotente.
- Os nomes de colunas no SQL seguem o `@map` de cada campo; ajuste ao schema real.

## 7. Como provar que funciona
- Teste de integração com banco real (Testcontainers) disparando operações concorrentes com `Promise.allSettled`:
  - duas vendas da última unidade → exatamente uma sucede, estoque final 0;
  - mesma idempotency key duas vezes em paralelo → uma venda criada, duas respostas iguais;
  - webhook repetido → um processamento.
- Mocks de Prisma não provam concorrência. Ver `testes-qualidade`.
