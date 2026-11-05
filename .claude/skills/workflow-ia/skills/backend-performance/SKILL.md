---
name: backend-performance
description: Performance do código de servidor em Node.js/TypeScript (Route Handlers, Server Actions, Express, workers). Cobre medição (APM, clinic.js, flame graph), event loop sem bloqueio, I/O paralelo com concorrência limitada, N+1 e chamadas redundantes na aplicação, cache em camadas com invalidação e anti-stampede, pool de conexões em serverless, payload enxuto, streams, teste de carga k6, escala horizontal e cold start. Use quando o diff mexer em rota quente, loop com await, cache, export/relatório, CPU pesada ou pool. Não use para índices e EXPLAIN (use banco-performance), bundle e Web Vitals (use frontend-performance) nem corretude transacional (use backend-engenharia).
---

# Back-end: performance

Regras para que o servidor responda rápido e de forma previsível sob carga, sem trocar corretude por velocidade. O `implementer` e o `fixer` seguem "Regras" e "Como construir"; o `performance-reviewer` usa o "Checklist de revisão" e gera findings com a severidade padrão. A severidade sobe um nível quando o problema está em rota quente (PDV no caixa, login, listagem principal, webhook de pagamento) e desce um nível em rota administrativa de uso raro.

Exemplos em Node 20+, Next.js (App Router), Express, Prisma, ioredis e k6. Em outro stack, aplique o equivalente.

## Regras inegociáveis

1. **Otimização entra com número: medição antes e depois (tempo, p95, queries, memória).** Otimizar no escuro adiciona complexidade sem ganho garantido.
2. **Nada bloqueia o event loop no caminho do request: sem APIs `*Sync`, sem CPU pesada inline.** Um request de 300 ms de CPU trava todos os outros usuários da instância.
3. **Sem N+1: nenhuma query dentro de loop sobre resultado de outra query.** 50 itens viram 51 round-trips; em rota quente isso derruba o p95.
4. **I/O independente roda em paralelo (`Promise.all`); fan-out grande tem concorrência limitada.** `await` em série soma latências; paralelismo ilimitado esgota pool e fornecedor.
5. **Toda listagem e todo export têm limite; conjuntos grandes são processados em lotes/stream, nunca carregados inteiros na memória.** Um tenant grande derruba o processo por OOM.
6. **Cache só com chave que inclui tenant e todos os parâmetros, TTL definido e invalidação decidida antes de escrever o cache.** Cache sem invalidação serve dado errado; sem tenant na chave vaza dado entre clientes.
7. **Resposta privada nunca é cacheada em CDN/proxy compartilhado (`Cache-Control: private` ou `no-store`).** CDN servindo a tela de um usuário para outro é incidente de segurança.
8. **Um único `PrismaClient` por processo, pool dimensionado ao limite do banco; em serverless, pooler.** Client por request ou pool sem teto esgota `max_connections`.
9. **O mesmo dado não é buscado duas vezes no mesmo request.** Chamada redundante é custo puro; passe o objeto adiante ou memoize por request.
10. **Resposta enxuta: `select` só dos campos que o contrato expõe.** Payload gordo custa banco, rede, serialização e memória.
11. **Trabalho pesado ou lento (relatório, importação, imagem, PDF, integração) vai para worker thread ou fila.** Request HTTP tem orçamento de tempo curto e limite de plataforma.
12. **Processo stateless e health check leve, para escalar horizontalmente.** Estado local impede adicionar instâncias; health pesado derruba o próprio serviço.
13. **Mudança em caminho crítico declara meta (ex.: p95 < 300 ms) e comprova com teste de carga ou medição comparável.** Sem meta, não há como dizer se piorou.

## Como construir

### Medir
- Local: `node --cpu-prof`, `clinic doctor`/`clinic flame`, contagem de queries via evento `query` do Prisma em teste.
- Produção/staging: APM (OpenTelemetry, Sentry Performance), p50/p95/p99 por rota, lag do event loop (`monitorEventLoopDelay`).
- Registre no pacote de provas: métrica antes, depois e como foi medida.
- Detalhes em [references/medicao-e-carga.md](references/medicao-e-carga.md).

### Event loop
- Proibido no request: `fs.readFileSync`, `crypto.pbkdf2Sync`, `zlib.*Sync`, `bcrypt.hashSync`, `child_process.execSync`.
- `JSON.parse`/`stringify` de payload de vários MB, regex com backtracking, parse de planilha, geração de PDF/imagem: worker thread (Piscina) ou fila.
- Loop de CPU sobre milhares de itens: processe em lotes ou mova para worker.

### Consultas a partir da aplicação
- Relações: `include`/`select` aninhado (o Prisma resolve em poucas queries) ou `where: { id: { in: ids } }` + `Map`.
- GraphQL/resolvers ou múltiplos chamadores: DataLoader por request.
- Índices, planos e SQL: ver `banco-performance`.

### Paralelismo
- `Promise.all` para chamadas independentes; `Promise.allSettled` quando falha parcial é aceitável.
- Fan-out sobre lista do usuário: `p-limit` (ex.: 5 simultâneas) para não esgotar pool nem tomar 429.
- Dentro de `$transaction`, nada de `Promise.all` de escritas (uma conexão, ordem importa).

### Chamadas redundantes
- Next.js: envolva leituras usadas por vários Server Components com `cache()` do React (memo por request).
- Não verifique existência e depois busque de novo: busque uma vez e use o resultado.
- Não busque no servidor o que o front acabou de enviar e já foi validado, a menos que seja para recalcular valor sensível (preço, permissão).
- Evite polling agressivo; prefira SSE/WebSocket ou intervalos com backoff.

### Cache
- Ordem: evitar trabalho → memo por request → memória local (dado imutável/pequeno) → Redis → HTTP/CDN.
- Chave: `v1:tenant:{tenantId}:produtos:lista:{hash dos params}`.
- TTL com jitter; single-flight/lock para evitar stampede; stale-while-revalidate quando aceitável.
- Invalidação no mesmo use case que grava, após o commit.
- Next.js: `revalidateTag`/`revalidatePath` conforme a versão do projeto; nunca cache compartilhado para dado por usuário.
- Detalhes em [references/cache-pool-concorrencia.md](references/cache-pool-concorrencia.md).

### Conexões
- `PrismaClient` singleton (em dev com Next, guarde em `globalThis` para sobreviver ao hot reload).
- Tamanho do pool: `instâncias x conexões por instância` abaixo de `max_connections` com folga para migrations e admin.
- Serverless (Vercel): pooler em modo transação (PgBouncer, Prisma Accelerate ou equivalente) e poucas conexões por função.

### Payload e transporte
- `select` explícito; DTO sem campos internos.
- Paginação por cursor/keyset em listas grandes; `OFFSET` alto é lento.
- Compressão (Brotli/gzip) no proxy/CDN; no Express, `compression()` se não houver proxy que faça.
- Export: stream com lotes por cursor; arquivo gigante gerado em fila e entregue por link de storage.

### Escala e ciclo de vida
- Health `live` sem dependências; `ready` com checagens baratas e timeout curto.
- Cron/job agendado com lock distribuído para rodar em uma instância só.
- Cold start: import dinâmico de libs pesadas usadas em poucas rotas; sem trabalho pesado no top-level do módulo.

## Checklist de revisão

Valores exatos para o campo severidade dos findings: `urgente`, `alto`, `medio`, `baixo`.

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | Cache compartilhado (Redis, CDN, `Cache-Control: public`) com dado privado ou chave sem tenant/usuário | urgente |
| 2 | Export/relatório que carrega todas as linhas do tenant em memória | alto |
| 3 | Query ou chamada HTTP dentro de loop sobre resultado de query (N+1) em rota quente | alto |
| 4 | API `*Sync` (fs, crypto, zlib, child_process, bcrypt) no caminho do request | alto |
| 5 | CPU pesada inline no request (planilha, PDF, imagem, JSON de vários MB) | alto |
| 6 | Listagem sem `take`/limite máximo | alto |
| 7 | `new PrismaClient()` por request, por função ou fora de singleton | alto |
| 8 | Serverless sem pooler ou com pool por função acima do suportado pelo banco | alto |
| 9 | Fan-out `Promise.all` sobre lista sem limite de concorrência | alto |
| 10 | Cache criado sem estratégia de invalidação ou sem TTL | alto |
| 11 | Operação lenta/pesada síncrona no request em vez de fila/worker | alto |
| 12 | N+1 em rota de uso raro/administrativa | medio |
| 13 | `await` em série para chamadas independentes | medio |
| 14 | Mesma query/chamada executada mais de uma vez no mesmo request | medio |
| 15 | `findMany`/`include` sem `select`, trazendo colunas e relações não usadas | medio |
| 16 | Paginação por `skip`/`OFFSET` em lista que cresce sem limite | medio |
| 17 | Cache sem proteção contra stampede em chave quente | medio |
| 18 | TTL fixo idêntico para muitas chaves (expiração em massa) | medio |
| 19 | Health/readiness executando query pesada ou chamando terceiros sem timeout | medio |
| 20 | Job agendado que roda em todas as instâncias sem lock | medio |
| 21 | Otimização complexa (cache, desnormalização, worker) sem medição que a justifique | medio |
| 22 | Mudança em rota crítica sem meta de latência nem evidência de medição | medio |
| 23 | Import estático de lib pesada usada só em uma rota rara (cold start) | baixo |
| 24 | Log síncrono volumoso (`console.log` de objetos grandes) em rota quente | baixo |
| 25 | Compressão feita no Node quando o proxy/CDN já comprime | baixo |

## Anti-padrões (errado → certo)

### N+1 com await no loop
```ts
// errado: 1 + N queries
const vendas = await prisma.venda.findMany({ where: { tenantId }, take: 50 });
for (const v of vendas) {
  v.itens = await prisma.itemVenda.findMany({ where: { vendaId: v.id } });
}

// certo: relação carregada em lote, só com os campos usados
const vendas = await prisma.venda.findMany({
  where: { tenantId },
  take: 50,
  orderBy: { id: 'desc' },
  select: { id: true, totalCentavos: true, itens: { select: { produtoId: true, quantidade: true } } },
});
```

### Chamadas independentes em série
```ts
// errado: soma das latências
const resumo = await obterResumoCaixa(ctx);
const metas = await obterMetas(ctx);
const alertas = await obterAlertasEstoque(ctx);

// certo
const [resumo, metas, alertas] = await Promise.all([obterResumoCaixa(ctx), obterMetas(ctx), obterAlertasEstoque(ctx)]);
```

### Bloqueio do event loop
```ts
// errado
const hash = bcrypt.hashSync(senha, 12);
const modelo = fs.readFileSync('./templates/nota.html', 'utf8'); // a cada request

// certo
const hash = await argon2.hash(senha, { type: argon2.argon2id }); // assíncrono, fora da thread principal
const modelo = await carregarModeloUmaVez(); // lido de forma assíncrona e memoizado no módulo
```

### Cache sem tenant e sem invalidação
```ts
// errado: todos os tenants recebem a lista do primeiro que populou o cache, para sempre
const cached = await redis.get('produtos');

// certo
const chave = `v1:tenant:${ctx.tenantId}:produtos:ativos`;
const produtos = await comCache(chave, 300, () => listarProdutosAtivos(ctx), ProdutosSchema);
// no use case que altera produto, após o commit:
await redis.del(chave);
```

### Fan-out sem limite
```ts
// errado: 2.000 chamadas simultâneas ao fornecedor e ao pool
await Promise.all(produtos.map((p) => sincronizarNoMarketplace(p)));

// certo
import pLimit from 'p-limit';
const limite = pLimit(5);
await Promise.all(produtos.map((p) => limite(() => sincronizarNoMarketplace(p))));
// melhor ainda para volumes grandes: enfileirar um job por lote
```

## Referências

- [references/medicao-e-carga.md](references/medicao-e-carga.md) — leia quando precisar medir latência/CPU/memória, contar queries, investigar lag do event loop, escrever teste de carga k6 ou montar a evidência de performance.
- [references/cache-pool-concorrencia.md](references/cache-pool-concorrencia.md) — leia quando a task criar ou alterar cache (Redis, HTTP, Next.js), mexer em pool de conexões/serverless, mover trabalho para worker thread, fazer export por stream ou limitar concorrência.
