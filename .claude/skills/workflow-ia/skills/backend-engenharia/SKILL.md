---
name: backend-engenharia
description: Engenharia de back-end em Node.js/TypeScript para Route Handlers, Server Actions, Express, services e workers. Cobre validação de entrada, transações atômicas, idempotência, concorrência (update condicional, lock otimista, FOR UPDATE), filas BullMQ, chamadas externas com timeout/retry/circuit breaker, erros em Problem Details, paginação, stateless, graceful shutdown e config validada no boot. Use quando o diff criar ou alterar endpoint, use case, job, webhook recebido, operação que grava várias tabelas (venda, estoque, caixa) ou bootstrap do servidor. Não use para authn/authz e injeção (use backend-seguranca), latência e cache (use backend-performance) nem contrato REST (use api-design-integracoes).
---

# Back-end: engenharia

Regras para escrever lógica de servidor correta sob concorrência, falha parcial e entrada hostil. O `implementer` e o `fixer` usam as seções "Regras" e "Como construir"; o `quality-reviewer` usa o "Checklist de revisão" para gerar findings com a severidade padrão indicada.

Exemplos em Next.js (App Router), Express, Prisma, Zod e BullMQ. Em outro stack, aplique o equivalente.

## Regras inegociáveis

1. **Toda entrada é validada na fronteira com schema (Zod): body, query, params, headers, payload de fila e de webhook.** Tipo TypeScript não existe em runtime; dado não validado vira bug ou vulnerabilidade.
2. **Operação que grava em mais de uma tabela ou agregado roda numa única transação.** Venda sem transação deixa estoque baixado e venda inexistente, ou o inverso.
3. **Recurso disputado (estoque, saldo, sequência, cupom, vaga) é protegido contra concorrência.** Ler, checar e gravar em passos separados vende a última peça duas vezes.
4. **Operação não idempotente por natureza (pagamento, criação de pedido, webhook) exige idempotency key com UNIQUE no banco.** Retry de rede e duplo clique são normais, não exceção.
5. **Nenhuma chamada externa (HTTP, e-mail, fila, storage) dentro de transação de banco.** Segura conexão e locks pelo tempo do terceiro e não é desfeita no rollback; use outbox.
6. **Toda chamada de saída tem timeout explícito.** Sem timeout, um fornecedor lento esgota conexões e derruba o serviço.
7. **Retry só em operação idempotente, com backoff exponencial, jitter e limite de tentativas.** Retry sem critério multiplica carga e duplica efeitos.
8. **Nunca engolir exceção.** Catch vazio, ou que loga e devolve sucesso, esconde perda de dados.
9. **Erros de domínio são tipados e mapeados para HTTP num handler central, no formato Problem Details (RFC 9457), sem stack trace em produção.** Formato único simplifica cliente e evita vazamento.
10. **Toda listagem é paginada, com limite máximo imposto pelo servidor.** Listagem sem limite cresce com o cliente até derrubar a rota.
11. **Dinheiro em centavos inteiros ou Decimal; nunca `number` de ponto flutuante. Datas em UTC.** `0.1 + 0.2 !== 0.3`; fuso na persistência corrompe relatório.
12. **Processo stateless: sessão, carrinho, contador, lock ou cache que precisa ser consistente não vivem na memória do processo.** Com duas instâncias ou após restart, o estado some ou diverge.
13. **Operação longa (mais de ~1 s ou dependente de terceiro lento) vai para fila com retry e DLQ; a rota responde 202.** Request HTTP não é lugar de trabalho pesado.
14. **Regra de negócio fica no service/use case; handler e Server Action só traduzem HTTP para domínio e de volta.** Regra no handler não é reutilizável nem testável.
15. **Config por variável de ambiente validada no boot, com falha imediata; graceful shutdown no SIGTERM.** Falhar no boot é melhor que falhar na primeira venda; deploy não pode cortar requisição no meio.

## Como construir

### Camadas
- Rota/Route Handler/Server Action → use case (service) → repository/Prisma. Dependências apontam para o domínio.
- O handler: autentica, valida, chama o use case, mapeia resultado/erro para HTTP. Nada de `prisma.*` com regra de negócio no handler.
- Use case recebe dados já validados e o contexto (`tenantId`, `userId`); não conhece `Request` nem `NextResponse`.
- Server Action é endpoint público: mesma validação e mesma checagem de permissão de uma rota.

### Validação
- Um schema por fronteira; reutilize o schema no front quando fizer sentido (validação dupla).
- Use `safeParse` e devolva 400 com os `issues` (schema inválido; 422 fica para regra de negócio, 409 para conflito de estado, como em `api-design-integracoes`); não deixe exceção de Zod virar 500.
- Query string chega como string: `z.coerce.number().int().min(1).max(100)`.
- Objetos com `.strict()` quando campos extras indicam erro do cliente; nunca repasse o objeto bruto ao ORM.
- Valide também mensagem de fila e payload de webhook: o produtor pode ser outra versão do código.

### Transações e concorrência
- Prisma: `prisma.$transaction(async (tx) => { ... })`; use só `tx` dentro do callback.
- Transação curta: nada de chamada externa, nada de loop de I/O desnecessário.
- Decremento disputado: `updateMany` condicional (`estoque: { gte: qtd }`) e checar `count`.
- Edição concorrente de registro (cadastro, pedido em rascunho): lock otimista com coluna `version`.
- Leitura que decide escrita complexa: `SELECT ... FOR UPDATE` via `tx.$queryRaw` com template tag.
- Travar recursos em ordem consistente (ex.: itens ordenados por `produtoId`) para evitar deadlock.
- Serializable exige retry no erro de conflito (Prisma `P2034`). Detalhes em [references/transacoes-concorrencia-idempotencia.md](references/transacoes-concorrencia-idempotencia.md).

### Idempotência
- Cliente envia header `Idempotency-Key`; servidor grava a chave com UNIQUE `(tenantId, key)` e o hash do request.
- Mesma chave + mesmo request: devolve a resposta original. Mesma chave + request diferente: 422.
- Webhook recebido: dedupe por `eventId` do provedor com UNIQUE; responda 2xx rápido e processe na fila.
- Job de fila também é idempotente: pode rodar duas vezes.

### Efeitos colaterais e filas
- Efeito externo decorrente de gravação (e-mail, nota fiscal, integração) usa outbox: grava o evento na mesma transação; um worker publica.
- BullMQ: `attempts` + `backoff` exponencial, `jobId` determinístico para dedupe, `removeOnComplete`, fila de falhas monitorada.
- Worker valida o payload, é idempotente e tem concorrência explícita.

### Chamadas externas
- `fetch(url, { signal: AbortSignal.timeout(ms) })` ou timeout do cliente HTTP usado.
- Retry apenas em erro transitório (rede, 429, 502, 503, 504) e só se a operação for idempotente.
- Circuit breaker em dependência instável; fallback ou degradação explícita.
- Isole o fornecedor atrás de um adapter com tipos próprios (anti-corruption layer).
- Detalhes em [references/resiliencia-filas-erros.md](references/resiliencia-filas-erros.md).

### Erros
- Hierarquia: `DomainError` (esperado, 4xx) vs erro técnico (inesperado, 500).
- Um único ponto converte erro em resposta Problem Details (`type`, `title`, `status`, `detail`, `instance`).
- Log do erro técnico com correlation ID; resposta ao cliente sem stack, SQL ou mensagem interna.
- Mapear erros conhecidos do Prisma: `P2002` → 409, `P2025` → 404.

### Paginação e respostas
- Siga a convenção de paginação já existente no projeto; sem convenção, use a da skill `api-design-integracoes`: `limite` (padrão 20, máximo 100) e `cursor`, resposta `{ dados, proximoCursor }`.
- Ordenação determinística (inclua `id` como desempate).
- Selecione só os campos que o contrato expõe.

### Ciclo de vida do processo
- `env.ts` com schema Zod executado no import; o resto do código importa `env`, nunca `process.env` solto.
- Um único `PrismaClient` por processo.
- SIGTERM: readiness passa a 503, `server.close()`, espera requisições e jobs em curso, fecha fila, Redis e Prisma, timeout de força.

## Checklist de revisão

Valores exatos para o campo severidade dos findings: `urgente`, `alto`, `medio`, `baixo`.

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | Operação que grava em 2+ tabelas (venda, estoque, caixa, pagamento) está fora de transação | urgente |
| 2 | Recurso disputado usa ler-checar-gravar sem update condicional, `version` ou `FOR UPDATE` | urgente |
| 3 | Pagamento, criação de pedido ou webhook sem idempotency key/dedupe com UNIQUE | urgente |
| 4 | Catch vazio ou que retorna sucesso após falha de gravação | urgente |
| 5 | Dinheiro calculado ou persistido como float (`Float`, `number` com decimais, `parseFloat`) | urgente |
| 6 | Critério de aceite da task não implementado ou implementado de forma divergente | urgente |
| 7 | Body/query/params/headers usados sem validação por schema | alto |
| 8 | Chamada HTTP de saída sem timeout | alto |
| 9 | Chamada externa, e-mail ou publicação em fila dentro de `$transaction` | alto |
| 10 | Listagem sem paginação ou sem limite máximo no servidor | alto |
| 11 | Retry em operação não idempotente, ou sem backoff/limite | alto |
| 12 | Operação longa executada de forma síncrona no request | alto |
| 13 | Estado de negócio mantido em memória do processo (Map global, variável de módulo) | alto |
| 14 | Job de fila ou handler de webhook não idempotente | alto |
| 15 | Erro técnico devolvido ao cliente com stack, SQL ou mensagem interna | alto |
| 16 | Uso de client/`prisma` global dentro do callback de `$transaction` em vez de `tx` | alto |
| 17 | Regra de negócio no handler, Server Action ou componente em vez de use case | medio |
| 18 | Resposta de erro fora do formato padrão do projeto (Problem Details) | medio |
| 19 | Erro de Prisma conhecido (`P2002`, `P2025`) virando 500 | medio |
| 20 | `process.env` lido fora do módulo de config validada | medio |
| 21 | Ordem de lock inconsistente entre operações que travam os mesmos recursos | medio |
| 22 | Sem tratamento de SIGTERM, ou shutdown sem fechar pool/filas | medio |
| 23 | Data persistida sem fuso (timestamp sem time zone) ou convertida para local no servidor | medio |
| 24 | Ordenação de paginação não determinística (sem desempate por `id`) | baixo |
| 25 | Nomes de use case/erro que não descrevem a intenção de negócio | baixo |

## Anti-padrões (errado → certo)

### Estoque com ler-checar-gravar
```ts
// errado: dois caixas leem estoque = 1 e ambos vendem
const p = await prisma.produto.findUniqueOrThrow({ where: { id } });
if (p.estoque < qtd) throw new EstoqueInsuficienteError(id);
await prisma.produto.update({ where: { id }, data: { estoque: p.estoque - qtd } });

// certo: decremento condicional e atômico, dentro da transação da venda
const { count } = await tx.produto.updateMany({
  where: { id, tenantId, estoque: { gte: qtd } },
  data: { estoque: { decrement: qtd } },
});
if (count === 0) throw new EstoqueInsuficienteError(id);
```

### Chamada externa sem timeout e com retry cego
```ts
// errado
const res = await fetch(`${env.FRETE_URL}/cotar`, { method: 'POST', body });

// certo: timeout e retry apenas em erro transitório (cotação é idempotente)
const res = await comRetry(
  () => fetch(`${env.FRETE_URL}/cotar`, { method: 'POST', body, signal: AbortSignal.timeout(3_000) }),
  { tentativas: 3, deveRetentar: erroTransitorio },
);
```

### Exceção engolida
```ts
// errado
try { await registrarPagamento(venda); } catch (e) { console.log(e); }
return { ok: true };

// certo: propaga; o handler central decide status e loga com correlation ID
await registrarPagamento(venda);
return { ok: true };
```

### Listagem sem limite
```ts
// errado
const vendas = await prisma.venda.findMany({ where: { tenantId } });

// certo
const { limite, cursor } = PaginacaoSchema.parse(query); // limite máx. 100
const vendas = await prisma.venda.findMany({
  where: { tenantId, ...(cursor && { id: { lt: cursor } }) },
  orderBy: { id: 'desc' },
  take: limite + 1,
});
const proximoCursor = vendas.length > limite ? vendas[limite - 1].id : null;
return { dados: vendas.slice(0, limite), proximoCursor };
```

### Float para dinheiro
```ts
// errado
const total = itens.reduce((s, i) => s + i.preco * i.qtd, 0); // preco = 19.9

// certo: centavos inteiros (ou Prisma.Decimal), recalculados no servidor
const totalCentavos = itens.reduce((s, i) => s + i.precoCentavos * i.qtd, 0);
```

## Referências

- [references/transacoes-concorrencia-idempotencia.md](references/transacoes-concorrencia-idempotencia.md) — leia quando a task gravar em várias tabelas, disputar estoque/saldo, receber pagamento ou webhook, ou precisar de outbox.
- [references/resiliencia-filas-erros.md](references/resiliencia-filas-erros.md) — leia quando integrar com serviço externo, criar job/worker BullMQ, montar o error handler, a config de ambiente ou o graceful shutdown.
