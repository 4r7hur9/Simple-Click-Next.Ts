# Cache, pool de conexões, concorrência e streams

Referência aprofundada da skill `backend-performance`. Leia quando a task criar ou alterar cache (memória, Redis, HTTP, Next.js), mexer em pool de conexões ou deploy serverless, mover trabalho para worker thread, limitar concorrência ou gerar export grande.

Exemplos com Next.js, Express, Prisma, ioredis, lru-cache, p-limit e Piscina. Em outro stack, aplique o equivalente.

## 1. Cache em camadas

| Camada | Escopo | Bom para | Cuidado |
|---|---|---|---|
| Memo por request (`cache()` do React, `Map` no contexto) | um request | mesma leitura em vários componentes/funções | nenhum risco de inconsistência entre usuários |
| Memória do processo (LRU) | uma instância | dado pequeno, quase imutável (config, tabela de NCM) | cada instância tem sua cópia; invalidação não propaga |
| Redis | todas as instâncias | leitura cara e repetida, por tenant | serialização, invalidação, stampede |
| HTTP (`Cache-Control`, `ETag`) | navegador e proxies | respostas públicas ou por usuário no navegador | nunca `public` para dado privado |
| CDN | global | assets, páginas e APIs públicas | chave de cache e purga |

Pergunta obrigatória antes de cachear: **quem invalida, quando e como?** Se não há resposta, não crie o cache.

### Memo por request (Next.js)
```ts
import { cache } from 'react';

export const obterConfigLoja = cache(async (tenantId: string) =>
  prisma.configLoja.findUnique({ where: { tenantId }, select: { moeda: true, fuso: true, logoUrl: true } }),
);
// vários Server Components chamam obterConfigLoja(tenantId) no mesmo render: uma query só
```

### Memória local com limite
```ts
import { LRUCache } from 'lru-cache';

const tabelaFiscal = new LRUCache<string, AliquotaFiscal>({ max: 5_000, ttl: 60 * 60 * 1000 });
```
Nunca use `Map` de módulo sem limite como cache: vira vazamento de memória.

### Redis: cache-aside com single-flight e jitter
```ts
import type { z } from 'zod';

const emVoo = new Map<string, Promise<unknown>>();

export async function comCache<T>(
  chave: string,
  ttlSeg: number,
  carregar: () => Promise<T>,
  schema: z.ZodType<T>,
): Promise<T> {
  const bruto = await redis.get(chave);
  if (bruto !== null) return schema.parse(JSON.parse(bruto)); // valida: JSON perde Date, BigInt, Decimal

  const pendente = emVoo.get(chave);
  if (pendente) return pendente as Promise<T>; // single-flight dentro da instância

  const promessa = (async () => {
    try {
      const valor = await carregar();
      const jitter = Math.floor(Math.random() * ttlSeg * 0.1); // evita expiração em massa
      await redis.set(chave, JSON.stringify(valor), 'EX', ttlSeg + jitter);
      return valor;
    } finally {
      emVoo.delete(chave);
    }
  })();
  emVoo.set(chave, promessa);
  return promessa;
}
```
- Com muitas instâncias e recomputação muito cara, adicione lock distribuído (seção 5) para que só uma recalcule.
- Falha do Redis não pode derrubar a rota: em erro de leitura, caia para `carregar()` e registre métrica.
- Schemas com datas usam `z.coerce.date()` para reconstituir `Date` a partir do JSON.

### Chaves
- Formato: `v{versão}:tenant:{tenantId}:{recurso}:{variante}:{hash dos parâmetros}`.
- Inclua **tudo** que muda o resultado: tenant, usuário (se a resposta depende de permissão), filtros, página, idioma.
- O prefixo de versão permite descartar tudo ao mudar o formato do valor.

### Invalidação
- **Direta**: o use case que grava apaga as chaves afetadas **após o commit** (apagar antes permite que um leitor repopule com o valor antigo).
- **Por namespace**: guarde `tenant:{id}:versao-catalogo` e inclua o número na chave; para invalidar tudo do catálogo do tenant, `INCR` nessa chave.
- **Por evento**: quando várias partes gravam o mesmo dado, publique evento (outbox) e um consumidor invalida.
- **TTL** é rede de segurança, não estratégia principal para dado que muda por ação do usuário.

### Stale-while-revalidate
Quando servir um valor levemente velho é aceitável (dashboard, ranking): guarde `{ valor, geradoEm }` com TTL longo; se `geradoEm` passou do limite, devolva o valor e dispare recomputação em background (com single-flight).

## 2. Cache HTTP

| Resposta | `Cache-Control` |
|---|---|
| Asset com hash no nome | `public, max-age=31536000, immutable` |
| API pública que muda pouco | `public, max-age=0, s-maxage=60, stale-while-revalidate=300` |
| API autenticada (dado do usuário/tenant) | `private, no-cache` (revalida com ETag) ou `no-store` |
| Dado sensível (financeiro, pessoal) | `no-store` |

- Express gera `ETag` fraco para `res.send`/`res.json` e responde 304 quando `If-None-Match` casa: economiza banda, não economiza a query. Para economizar a query, calcule o ETag a partir de algo barato (ex.: `updatedAt` máximo) antes de buscar tudo.
- `Vary` correto quando a resposta depende de header (`Accept-Encoding`, `Accept-Language`). Não confie em `Vary: Authorization`/`Cookie` para proteger dado privado em CDN: use `private`/`no-store`.

## 3. Cache do Next.js

- As APIs de cache mudaram entre versões (`fetch` com `next.revalidate`, `unstable_cache`, diretiva `'use cache'` com `cacheTag`/`cacheLife`). **Verifique a versão do Next no projeto e siga a documentação dela.**
- Princípios que valem para todas:
  - Dado por usuário/tenant não entra em cache compartilhado sem tenant/usuário na chave; na dúvida, rota dinâmica.
  - Toda mutação (Server Action/Route Handler) que altera dado cacheado chama `revalidateTag` ou `revalidatePath` correspondente.
  - Tags nomeadas por recurso e tenant: `produtos:${tenantId}`.
  - `cache()` do React é memo por request, não cache persistente.

## 4. Pool de conexões

### Singleton do Prisma
```ts
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalParaPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalParaPrisma.prisma = prisma; // hot reload em dev
```

### Dimensionamento
- Orçamento: `max_connections` do Postgres menos reserva (migrations, admin, réplicas, jobs) = conexões disponíveis para a aplicação.
- Divida pelo número máximo de instâncias/processos (servidor web + workers).
- No Prisma com o engine padrão (até a v6), o pool é configurado na URL: `?connection_limit=10&pool_timeout=10`. O padrão é `núcleos x 2 + 1`. Em projetos com driver adapter (`@prisma/adapter-pg` etc.), o pool é configurado no adapter/driver.
- Mais conexões não é mais velocidade: acima do ponto ótimo, o banco disputa CPU e locks. Transações curtas liberam conexões mais rápido que qualquer ajuste de pool.

### Serverless (Vercel e similares)
- Cada instância de função abre suas conexões; picos criam centenas de instâncias.
- Use pooler em modo transação (PgBouncer, pooler do provedor do banco, Prisma Accelerate) e poucas conexões por função.
- Com PgBouncer em modo transação no Prisma (engine padrão), adicione `pgbouncer=true` na URL; migrations usam conexão direta (`directUrl` no `datasource`).
- Workers de longa duração e filas rodam em processo persistente (Railway), não em função serverless.

## 5. Lock distribuído simples (Redis)

Para cron que deve rodar em uma única instância ou recomputação cara de cache.
```ts
import { randomUUID } from 'node:crypto';

const LIBERAR = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

export async function comLock<T>(nome: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
  const chave = `lock:${nome}`;
  const token = randomUUID();
  const obtido = await redis.set(chave, token, 'PX', ttlMs, 'NX');
  if (obtido !== 'OK') return null; // outra instância está executando
  try {
    return await fn();
  } finally {
    await redis.eval(LIBERAR, 1, chave, token); // só libera se ainda for o dono
  }
}
```
- O TTL deve ser maior que a duração esperada; se o trabalho puder passar do TTL, use renovação ou a abordagem de jobs repetíveis da fila (BullMQ) em vez de lock manual.
- Para exclusão mútua que protege **dados**, prefira lock no banco (ver `backend-engenharia`); Redis lock é para coordenação de trabalho.

## 6. Concorrência limitada

```ts
import pLimit from 'p-limit';

const limite = pLimit(5);
const resultados = await Promise.allSettled(
  lojas.map((loja) => limite(() => sincronizarEstoque(loja.id))),
);
```
- Escolha o limite pelo gargalo: conexões do pool, rate limit do fornecedor, CPU.
- Para milhares de itens, enfileire jobs em lote em vez de manter tudo em memória no request.
- Bulkhead: dependências diferentes com limites diferentes, para que um fornecedor lento não consuma toda a capacidade.

## 7. Worker threads para CPU

```ts
// src/infra/pdf/pool.ts
import Piscina from 'piscina';

export const poolPdf = new Piscina({
  filename: new URL('./gerar-pdf.worker.js', import.meta.url).href,
  maxThreads: 2,
});

// uso no use case
const pdf: Uint8Array = await poolPdf.run({ vendaId });
```
```ts
// src/infra/pdf/gerar-pdf.worker.ts (compilado para .js)
export default async function gerarPdf({ vendaId }: { vendaId: string }): Promise<Uint8Array> {
  const dados = await carregarDadosDaVenda(vendaId); // conexão própria do worker, se precisar de banco
  return renderizarPdf(dados); // renderização pesada fora da thread principal
}
```
- Passe dados pequenos e serializáveis; o worker não compartilha a instância do Prisma do processo principal.
- Se o trabalho também é lento ou pode falhar e precisar de retry, fila é melhor que worker thread.

## 8. Export por stream com lotes

```ts
// src/app/api/v1/vendas/export/route.ts
export async function GET() {
  const ctx = await exigirSessao();
  exigirPermissao(ctx, 'relatorio:ver');
  const enc = new TextEncoder();
  let cursor: string | undefined;
  let cabecalhoEnviado = false;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) { // chamado sob demanda: respeita backpressure
      if (!cabecalhoEnviado) {
        controller.enqueue(enc.encode('id,total_centavos,criada_em\n'));
        cabecalhoEnviado = true;
        return;
      }
      const lote = await prisma.venda.findMany({
        where: { tenantId: ctx.tenantId, ...(cursor && { id: { gt: cursor } }) },
        orderBy: { id: 'asc' },
        take: 1_000,
        select: { id: true, totalCentavos: true, criadaEm: true },
      });
      if (lote.length === 0) {
        controller.close();
        return;
      }
      controller.enqueue(enc.encode(lote.map((v) => `${v.id},${v.totalCentavos},${v.criadaEm.toISOString()}\n`).join('')));
      cursor = lote[lote.length - 1].id;
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="vendas.csv"',
      'cache-control': 'no-store',
    },
  });
}
```
- Campos de texto livre no CSV (nome de cliente, observação) precisam de escape de aspas e proteção contra injeção de fórmula (prefixar `'` em valores iniciados por `=`, `+`, `-`, `@`).
- Se o export pode passar do limite de duração da plataforma serverless, gere o arquivo em fila, grave em object storage e envie link assinado.
- No Express, `pipeline` de `node:stream/promises` conecta streams com tratamento de erro e backpressure.
