---
name: api-design-integracoes
description: "Design de APIs e integrações externas: REST consistente (recursos, métodos, status), erros RFC 9457, paginação, filtros e ordenação padronizados, OpenAPI e versionamento, idempotency key, limites de GraphQL, adapters para fornecedores, webhooks, timeout, retry com backoff e jitter, circuit breaker, DLQ, outbox e consistência eventual. Use quando a task cria ou altera route handler, endpoint, contrato público, cliente de API de terceiro (pagamento, fiscal, frete, mensageria), webhook ou job de sincronização. Não use para autenticação, autorização e hardening (use backend-seguranca), transações e locks internos (use backend-engenharia) nem camadas do domínio (use arquitetura-design)."
---

# APIs e integrações

Garante APIs previsíveis para quem consome e integrações que sobrevivem a fornecedor lento, fora do ar ou repetindo eventos.
`implementer` e `fixer` seguem as regras ao criar endpoints e clientes externos. `quality-reviewer`, `security-reviewer` e `performance-reviewer` usam o checklist; observabilidade de webhooks e filas (log rastreável, métrica, alerta, DLQ) é revisada pelo `ops-reviewer`. Exemplos em Next.js Route Handlers, Express, Zod e BullMQ; em outro stack, aplique o equivalente.

## Regras inegociáveis

1. **Recursos no plural, métodos HTTP com semântica correta (GET seguro, PUT e DELETE idempotentes) e status corretos.** Semântica errada quebra cache, retry de clientes e proxies.
2. **Um único formato de erro, Problem Details (RFC 9457) com `application/problem+json`, sem stack trace.** Formatos misturados quebram o front e vazam detalhes internos.
3. **Toda listagem é paginada com limite máximo no servidor e segue o padrão único de paginação, filtro e ordenação.** Listagem sem limite derruba o banco quando a loja cresce.
4. **Ordenação e filtros só por campos em allowlist.** Campo livre vira injeção, vazamento ou query sem índice.
5. **Resposta é um DTO explícito, nunca o registro do banco.** Campo novo no banco (hash, custo, token) vaza automaticamente.
6. **Breaking change não entra em versão publicada: use nova versão (`/v2`) ou expand/contract.** Cliente mobile ou integração antiga quebra em produção sem aviso.
7. **POST que cria efeito financeiro ou pedido aceita `Idempotency-Key` e deduplica.** Retry de rede ou duplo clique gera cobrança ou pedido duplicado.
8. **Toda chamada externa tem timeout explícito.** Sem timeout, um fornecedor lento esgota conexões e derruba a API inteira.
9. **Retry só em operação idempotente ou com chave de idempotência, com backoff exponencial, jitter e limite de tentativas.** Retry cego duplica cobrança e amplifica incidentes.
10. **Webhook recebido: valida assinatura (HMAC + timestamp) sobre o corpo bruto, responde 2xx rápido, enfileira e deduplica por event id.** Sem isso, qualquer um forja evento de pagamento, e reentregas processam duas vezes.
11. **Nunca chamar API externa dentro de transação de banco; efeitos pós-commit usam outbox.** Transação longa trava linhas; commit sem evento, ou evento sem commit, deixa sistemas divergentes.
12. **Fornecedor externo fica atrás de adapter; tipos e códigos do fornecedor não vazam para o domínio.** Troca de gateway ou mudança de contrato vira reescrita do sistema.
13. **Resposta de fornecedor é entrada não confiável: valide com schema.** Payload inesperado corrompe estado interno.
14. **Rate limit por cliente (usuário, tenant ou chave de API) com `429` e `Retry-After`.** Um cliente abusivo ou com bug derruba todos os outros.
15. **Estados assíncronos são explícitos (`PENDENTE`, `CONFIRMADO`, `FALHOU`) e há reconciliação.** Consistência eventual implícita vira pedido pago marcado como não pago.

## Como construir

### Endpoints REST
- Rotas: `/api/v1/<recurso-plural>` e `/api/v1/<recurso>/{id}`; sub-recurso só quando a relação é de posse (`/vendas/{id}/itens`).
- Ações que não são CRUD: sub-recurso de ação com POST (`POST /vendas/{id}/cancelamento`), não verbo na raiz.
- Status: `200` leitura/atualização com corpo, `201` + `Location` na criação, `204` sem corpo, `400` payload malformado, `401` sem autenticação, `403` sem permissão, `404` inexistente ou de outro tenant, `409` conflito de estado ou versão, `422` regra de negócio violada, `429` rate limit, `502/503/504` falha de dependência.
- `PATCH` com campos parciais validados por schema próprio; nunca repasse o body ao ORM.
- Detalhes, tabela completa e exemplos: [references/rest-e-contratos.md](references/rest-e-contratos.md).

### Paginação, filtros e ordenação
- Padrão: cursor (`?limite=20&cursor=<opaco>`), `limite` default 20 e máximo 100. Offset só para tabelas pequenas ou telas com número de página obrigatório.
- Resposta: `{ "dados": [...], "proximoCursor": "..." | null }`. Contagem total só quando necessária (é cara).
- Filtros como query params nomeados (`?status=CONCLUIDA&criadaDe=...`), validados com Zod.
- Ordenação: `?ordenar=-criadaEm` com allowlist e desempate por `id`.

### Contrato e versionamento
- OpenAPI gerado dos schemas Zod ou mantido junto do código; atualize no mesmo commit que muda o contrato.
- Mudanças compatíveis: adicionar campo opcional, novo endpoint, novo valor de enum só se clientes toleram.
- Mudanças incompatíveis: remover/renomear campo, mudar tipo, tornar obrigatório, mudar semântica de status.

### Integrações com fornecedores
- Estrutura: porta no `application` (`GatewayPagamento`), adapter em `infra` que traduz para o fornecedor.
- Cliente HTTP com timeout (`AbortSignal.timeout`), validação da resposta e mapeamento de erros para tipos internos (`FornecedorIndisponivelError`, `PagamentoRecusadoError`).
- Retry com backoff e jitter só em falhas transitórias (rede, `429`, `5xx`) e operações idempotentes.
- Circuit breaker em dependências críticas chamadas no caminho do usuário.
- Degradação graciosa: fallback definido na spec (ex.: sem cálculo de frete, mostrar "a combinar"; NFC-e indisponível, emitir em contingência conforme regra fiscal).
- Detalhes e código: [references/resiliencia.md](references/resiliencia.md).

### Webhooks
- Recebidos: corpo bruto (`await request.text()`), verificação de assinatura com comparação em tempo constante, janela de timestamp (ex.: 5 min), `dedupe` por event id (unique no banco ou `jobId` na fila), resposta 2xx em milissegundos, processamento em worker idempotente.
- Enviados: assinados com HMAC, com id e timestamp, retries com backoff, DLQ após N falhas, endpoint do cliente validado contra SSRF.
- Detalhes e código: [references/webhooks.md](references/webhooks.md).

### GraphQL (quando o projeto usa)
- Limite de profundidade e de complexidade por query; limite de tamanho da query.
- DataLoader para evitar N+1 nos resolvers.
- Autorização em cada resolver de campo sensível, não só na query raiz.
- Paginação por conexão (cursor) com `first` máximo.
- Introspection e playground desativados em produção, salvo API pública documentada.

## Checklist de revisão

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | Webhook processado sem verificar assinatura, ou verificação sobre JSON reparseado em vez do corpo bruto | `urgente` |
| 2 | Pagamento, pedido ou cobrança criado por POST sem idempotência, com retry possível | `urgente` |
| 3 | Resposta devolve registro do banco com campos sensíveis (hash, token, dados de outro tenant) | `urgente` |
| 4 | Chamada HTTP externa dentro de `$transaction` | `alto` |
| 5 | Chamada externa sem timeout | `alto` |
| 6 | Retry em operação não idempotente, sem limite ou sem backoff | `alto` |
| 7 | Webhook processado de forma síncrona e sem deduplicação por event id | `alto` |
| 8 | Listagem sem paginação ou sem limite máximo | `alto` |
| 9 | Breaking change em endpoint publicado sem nova versão ou expand/contract | `alto` |
| 10 | Ordenação ou filtro por campo arbitrário vindo do cliente, sem allowlist | `alto` |
| 11 | Endpoint público ou de login sem rate limit | `alto` |
| 12 | Evento/efeito pós-commit publicado fora de outbox, podendo se perder ou duplicar | `alto` |
| 13 | Resposta de fornecedor usada sem validação de schema | `medio` |
| 14 | Tipos ou códigos de erro do fornecedor vazando para domínio ou para a resposta da API | `medio` |
| 15 | Erro fora do formato Problem Details ou com stack trace | `medio` |
| 16 | Status incorreto (200 em criação, 500 para regra violada, 404 vs 403 inconsistente) | `medio` |
| 17 | Estado assíncrono sem valor intermediário (`PENDENTE`) ou sem rotina de reconciliação | `medio` |
| 18 | Dependência crítica no caminho do usuário sem circuit breaker ou fallback definido | `medio` |
| 19 | Job de integração sem DLQ ou sem alerta após falhas definitivas | `medio` |
| 20 | Contrato alterado sem atualizar OpenAPI/documentação | `medio` |
| 21 | GraphQL sem limite de profundidade/complexidade | `alto` |
| 22 | `429` sem `Retry-After` ou `201` sem `Location` | `baixo` |
| 23 | Verbo na rota (`/criarVenda`) ou recurso no singular fora do padrão | `baixo` |
| 24 | Paginação com formato diferente do padrão do projeto | `baixo` |

## Anti-padrões (errado → certo)

**Chamada externa dentro da transação**
```ts
// errado
await prisma.$transaction(async (tx) => {
  const pedido = await tx.pedido.create({ data });
  await fetch(`${env.GATEWAY_URL}/cobrancas`, { method: 'POST', body: JSON.stringify({ pedidoId: pedido.id }) });
});

// certo: grava pedido e evento na mesma transação; worker chama o gateway depois
await prisma.$transaction(async (tx) => {
  const pedido = await tx.pedido.create({ data: { ...data, status: 'AGUARDANDO_PAGAMENTO' } });
  await tx.outbox.create({ data: { tenantId, tipo: 'cobranca.solicitada', agregadoId: pedido.id, payload: { pedidoId: pedido.id } } });
});
```

**Sem timeout nem validação**
```ts
// errado
const r = await fetch(url);
const frete = await r.json();

// certo
const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
if (!r.ok) throw new FornecedorIndisponivelError('frete', r.status);
const frete = cotacaoFreteSchema.parse(await r.json());
```

**Webhook verificado sobre JSON reparseado**
```ts
// errado
const evento = await request.json();
const assinaturaOk = verificar(JSON.stringify(evento), request.headers.get('x-assinatura'));

// certo
const corpoBruto = await request.text();
if (!assinaturaValida(corpoBruto, request.headers)) return new Response(null, { status: 401 });
const evento = eventoSchema.parse(JSON.parse(corpoBruto));
```

**Listagem sem limite e ordenação livre**
```ts
// errado
const { ordenar } = Object.fromEntries(new URL(request.url).searchParams);
const itens = await prisma.produto.findMany({ where: { tenantId }, orderBy: { [ordenar]: 'asc' } });

// certo
const query = z.object({
  limite: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
  ordenar: z.enum(['nome', 'criadoEm']).default('criadoEm'),
}).parse(Object.fromEntries(new URL(request.url).searchParams));
```

## Referências

- [references/rest-e-contratos.md](references/rest-e-contratos.md): leia ao criar ou alterar endpoints, status codes, paginação, erros, idempotência, OpenAPI, versionamento ou GraphQL.
- [references/resiliencia.md](references/resiliencia.md): leia ao integrar fornecedor externo, escrever cliente HTTP, retry, circuit breaker, fila, DLQ, outbox ou reconciliação.
- [references/webhooks.md](references/webhooks.md): leia ao receber ou enviar webhooks (pagamento, fiscal, marketplace, mensageria).
