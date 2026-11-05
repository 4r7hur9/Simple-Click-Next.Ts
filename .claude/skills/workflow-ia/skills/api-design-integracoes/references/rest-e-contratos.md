# REST, contratos e padrões de API

## Métodos e semântica

| Método | Uso | Seguro | Idempotente | Corpo na resposta |
|---|---|---|---|---|
| GET | Ler recurso ou coleção | sim | sim | sim |
| POST | Criar recurso ou disparar ação | não | não (use `Idempotency-Key`) | sim, `201` + `Location` ao criar |
| PUT | Substituir recurso inteiro | não | sim | `200` ou `204` |
| PATCH | Atualizar campos parciais | não | depende; torne idempotente quando possível | `200` |
| DELETE | Remover (ou soft delete) | não | sim | `204` |

- GET nunca altera estado (nem "marcar como lida").
- DELETE repetido de recurso já removido responde `204` ou `404` de forma consistente no projeto.

## Status codes

| Situação | Status |
|---|---|
| Leitura ou atualização com corpo | 200 |
| Criado | 201 + header `Location` |
| Aceito para processamento assíncrono | 202 + recurso de acompanhamento |
| Sucesso sem corpo | 204 |
| JSON malformado, tipo errado, campo obrigatório ausente | 400 |
| Não autenticado | 401 |
| Autenticado sem permissão | 403 |
| Não existe ou pertence a outro tenant | 404 |
| Conflito de estado (já cancelado), versão desatualizada, unique violado | 409 |
| Pré-condição de `If-Match` falhou | 412 |
| Payload grande demais | 413 |
| Regra de negócio violada com entrada bem formada | 422 |
| Rate limit | 429 + `Retry-After` |
| Erro interno | 500 |
| Dependência respondeu erro | 502 |
| Serviço indisponível (manutenção, circuit aberto) | 503 + `Retry-After` quando possível |
| Dependência não respondeu a tempo | 504 |

Escolha entre 400 e 422 para validação e mantenha em todo o projeto. Recomendação: 400 para schema inválido, 422 para regra de negócio.

## Problem Details (RFC 9457)

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{
  "type": "https://errors.exemplo.com/estoque-insuficiente",
  "title": "Estoque insuficiente para o produto",
  "status": 409,
  "detail": "Disponível: 1, solicitado: 2.",
  "instance": "/api/v1/vendas",
  "codigo": "ESTOQUE_INSUFICIENTE",
  "produtoId": "0b6c..."
}
```

- `type`, `title`, `status` sempre presentes. `detail` legível. Extensões (`codigo`, `erros`) permitidas.
- Erros de validação listam os campos: `"erros": [{ "campo": "itens.0.quantidade", "mensagem": "..." }]`.
- Nunca inclua stack, SQL, nome de tabela, caminho de arquivo ou mensagem crua de exceção.
- Inclua um identificador de correlação (header `X-Request-Id` ou campo `requestId`) para suporte cruzar com logs.

## Paginação por cursor

```ts
// app/api/v1/produtos/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';

const listarSchema = z.object({
  limite: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
  status: z.enum(['ATIVO', 'INATIVO']).optional(),
  busca: z.string().trim().max(100).optional(),
});

export async function GET(request: Request) {
  const sessao = await exigirSessao();
  const q = listarSchema.parse(Object.fromEntries(new URL(request.url).searchParams));

  const itens = await prisma.produto.findMany({
    where: {
      tenantId: sessao.tenantId,
      status: q.status,
      nome: q.busca ? { contains: q.busca, mode: 'insensitive' } : undefined,
    },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: q.limite + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    select: { id: true, nome: true, precoCentavos: true, status: true, criadoEm: true },
  });

  const temMais = itens.length > q.limite;
  const dados = temMais ? itens.slice(0, q.limite) : itens;
  return NextResponse.json({ dados, proximoCursor: temMais ? dados[dados.length - 1]!.id : null });
}
```

- `take: limite + 1` detecta se há próxima página sem `COUNT`.
- Desempate por `id` garante ordem estável.
- Cursor de outro tenant não vaza nada porque o `where` filtra pelo tenant; ainda assim, trate cursor inválido como 400.
- Busca textual com `contains` em tabela grande precisa de índice adequado (pg_trgm); ver `banco-performance`.

## Filtros e ordenação

- Filtros explícitos e tipados no schema. Nada de `where` montado a partir de objeto arbitrário do cliente.
- Ordenação: `?ordenar=nome` ou `?ordenar=-criadoEm`, validada contra allowlist e mapeada para o `orderBy`.

```ts
const ORDENACOES = {
  nome: { nome: 'asc' },
  '-nome': { nome: 'desc' },
  criadoEm: { criadoEm: 'asc' },
  '-criadoEm': { criadoEm: 'desc' },
} as const;
const ordenar = z.enum(['nome', '-nome', 'criadoEm', '-criadoEm']).default('-criadoEm').parse(param);
const orderBy = [ORDENACOES[ordenar], { id: 'desc' as const }];
```

## Idempotência (Idempotency-Key)

Para POST com efeito financeiro ou criação de pedido/venda.

Modelo:
```prisma
model ChaveIdempotencia {
  tenantId        String
  chave           String
  hashRequisicao  String
  status          String   // EM_ANDAMENTO | CONCLUIDA
  respostaStatus  Int?
  respostaCorpo   Json?
  criadaEm        DateTime @default(now()) @db.Timestamptz(6)

  @@id([tenantId, chave])
}
```

Fluxo:
1. Cliente envia `Idempotency-Key: <uuid>` gerado uma vez por intenção (ex.: ao abrir a tela de pagamento).
2. Servidor calcula hash do corpo e tenta `create` com `EM_ANDAMENTO`.
3. Se violar a PK (`P2002`), lê o registro existente:
   - hash diferente: `422` (chave reutilizada com outro payload);
   - `EM_ANDAMENTO`: `409` (requisição concorrente em processamento);
   - `CONCLUIDA`: devolve `respostaStatus` e `respostaCorpo` gravados, sem reexecutar.
4. Executa o caso de uso e grava a resposta. Idealmente na mesma transação do efeito.
5. Em falha técnica antes do efeito, remova o registro para permitir nova tentativa.
6. Expire chaves antigas (ex.: 24 a 72 horas) por job.

Alternativa mais simples quando cabe: unique de negócio (`@@unique([tenantId, numeroPedidoCliente])`) e tratar `P2002` como "já criado", retornando o existente.

## Rate limit

- Chave por identidade: `tenantId` + `userId` para rotas autenticadas, IP para anônimas, chave de API para integrações.
- Limites mais baixos para login, reset de senha, criação de conta e endpoints caros.
- Em serverless (Vercel), use armazenamento compartilhado (Redis). Contador em memória não funciona com várias instâncias.
- Express: `express-rate-limit` com store Redis. Next.js: ex.: `@upstash/ratelimit` no route handler ou middleware.
- Resposta: `429` com `Retry-After` em segundos, corpo em Problem Details.

## Versionamento e evolução

- Versão no caminho: `/api/v1/...`. Nova major só para breaking change.
- Expand/contract: adicione o campo novo, publique, migre clientes, depois remova o antigo em outra versão.
- Endpoint depreciado: headers `Deprecation` e `Sunset` com data, e aviso na documentação.
- Enum novo em resposta pode quebrar cliente com `switch` exaustivo: documente que clientes devem tolerar valores desconhecidos.

## OpenAPI

- Fonte única: gere a spec dos schemas Zod (ex.: `@asteasolutions/zod-to-openapi`) ou mantenha o YAML junto do código.
- Cada endpoint documenta: parâmetros, corpo, respostas de sucesso, respostas de erro possíveis com `codigo`, autenticação e rate limit.
- Atualizada no mesmo commit da mudança de contrato. Se houver teste de contrato, ele faz parte do gate.

## Route Handlers e Express: detalhes

- Next.js 15+: `params` de rotas dinâmicas é uma Promise.

```ts
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ...
}
```

- Limite de tamanho do corpo: no Express, `express.json({ limit: '100kb' })`; em Next.js, valide `content-length` e tamanhos no schema.
- Content-Type: rejeite com 415 corpo que não seja `application/json` quando o endpoint só aceita JSON.
- CORS restrito à allowlist de origens; detalhes em `backend-seguranca`.

## GraphQL

- Limite de profundidade (ex.: `graphql-depth-limit`) e de complexidade (ex.: `graphql-query-complexity`) como validation rules.
- DataLoader por request para batch de relações.
- Paginação por conexão com `first` máximo; nunca listas sem limite.
- Erros de domínio mapeados para `extensions.code`, sem stack em produção.
- Persisted queries quando o cliente é próprio, para reduzir superfície.
