# Erros e contratos nas fronteiras

## Contratos com Zod

Toda fronteira tem um schema: entrada HTTP, Server Action, mensagem de fila, webhook, resposta de fornecedor externo, variáveis de ambiente.

```ts
// modules/vendas/application/schemas.ts
import { z } from 'zod';

export const itemVendaSchema = z.object({
  produtoId: z.string().uuid(),
  quantidade: z.number().int().positive().max(1000),
});

export const registrarVendaSchema = z.object({
  itens: z.array(itemVendaSchema).min(1).max(200),
  descontoCentavos: z.number().int().min(0).default(0),
  formaPagamento: z.enum(['DINHEIRO', 'PIX', 'CREDITO', 'DEBITO']),
});

export type RegistrarVendaDados = z.infer<typeof registrarVendaSchema>;
```

Regras:
- Schemas são estritos no que aceitam: limites de tamanho, inteiros onde cabe, enums em vez de string livre.
- O schema de entrada não contém `tenantId`, `userId`, `preco`, `total` nem `status` definidos pelo servidor. Esses campos vêm da sessão ou do cálculo no servidor.
- `z.object` descarta chaves desconhecidas por padrão no `parse`; ainda assim, nunca repasse o objeto inteiro ao Prisma. Monte o `data` campo a campo.
- Query string chega como texto: use `z.coerce.number()` para números e valide limites.
- Compartilhe o schema com o front para validação dupla, sem importar nada de servidor no arquivo do schema.

### Saída: DTO explícito

```ts
export const vendaSaidaSchema = z.object({
  id: z.string(),
  totalCentavos: z.number().int(),
  status: z.enum(['CONCLUIDA', 'CANCELADA']),
  criadaEm: z.date(),
});
export type VendaSaida = z.infer<typeof vendaSaidaSchema>;

export function paraVendaSaida(v: { id: string; totalCentavos: number; status: 'CONCLUIDA' | 'CANCELADA'; criadaEm: Date }): VendaSaida {
  return { id: v.id, totalCentavos: v.totalCentavos, status: v.status, criadaEm: v.criadaEm };
}
```

- Use `select` no Prisma para buscar só o que o DTO precisa.
- Nunca serialize o model inteiro: campos novos adicionados ao banco (hash, token, custo) vazariam automaticamente.

### Respostas de fornecedores

Resposta externa também é entrada não confiável. Valide com `safeParse` e trate formato inesperado como erro técnico com contexto:

```ts
const resultado = cobrancaFornecedorSchema.safeParse(await resposta.json());
if (!resultado.success) {
  throw new Error('Resposta inesperada do gateway de pagamento', { cause: resultado.error });
}
```

## Erros de domínio versus técnicos

| Tipo | Exemplo | Quem trata | Resposta |
|---|---|---|---|
| Validação de entrada | quantidade negativa | borda (Zod) | 400 |
| Domínio: não encontrado | venda de outro tenant ou inexistente | caso de uso | 404 |
| Domínio: regra violada | desconto acima do limite | domínio | 422 |
| Domínio: conflito com o estado atual | estoque insuficiente, venda já cancelada, versão desatualizada | caso de uso | 409 |
| Autorização | operador sem permissão | borda/caso de uso | 403 |
| Técnico | banco fora, timeout do gateway, bug | handler central | 500/502/503, log e alerta |

### Hierarquia

```ts
// modules/shared/domain/erro-dominio.ts (ou lib/erros.ts, conforme o projeto)
export abstract class ErroDominio extends Error {
  abstract readonly codigo: string;
  abstract readonly tipo: 'nao_encontrado' | 'regra_violada' | 'conflito' | 'proibido';
  constructor(mensagem: string, readonly detalhes?: Record<string, unknown>) {
    super(mensagem);
    this.name = new.target.name;
  }
}

// modules/vendas/domain/erros.ts
export class EstoqueInsuficienteError extends ErroDominio {
  readonly codigo = 'ESTOQUE_INSUFICIENTE';
  readonly tipo = 'conflito'; // conflito com o estado atual do estoque → 409 (padrão da api-design-integracoes)
  constructor(produtoId: string, disponivel?: number) {
    super('Estoque insuficiente para o produto', { produtoId, disponivel });
  }
}

export class VendaNaoEncontradaError extends ErroDominio {
  readonly codigo = 'VENDA_NAO_ENCONTRADA';
  readonly tipo = 'nao_encontrado';
  constructor(id: string) {
    super('Venda não encontrada', { id });
  }
}
```

- `codigo` é estável e documentado: o front decide mensagens por ele, não pelo texto.
- Mensagem de erro de domínio pode ir ao usuário; detalhes internos (SQL, stack, IDs de outros tenants) nunca.
- Recurso de outro tenant responde como inexistente (404), para não confirmar existência.

### Handler central

```ts
// lib/http/problem.ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ErroDominio } from '@/modules/shared/domain/erro-dominio';
import { logger } from '@/lib/logger';

const statusPorTipo = { nao_encontrado: 404, regra_violada: 422, conflito: 409, proibido: 403 } as const;

export function responderErro(erro: unknown, request: Request) {
  const instance = new URL(request.url).pathname;
  if (erro instanceof ZodError) {
    return problema(400, 'Entrada inválida', 'ENTRADA_INVALIDA', instance, { erros: erro.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })) });
  }
  if (erro instanceof ErroDominio) {
    return problema(statusPorTipo[erro.tipo], erro.message, erro.codigo, instance, erro.detalhes);
  }
  logger.error({ err: erro, path: instance }, 'erro não tratado');
  return problema(500, 'Erro interno', 'ERRO_INTERNO', instance);
}

function problema(status: number, title: string, codigo: string, instance: string, extras?: Record<string, unknown>) {
  return NextResponse.json(
    { type: `https://errors.exemplo.com/${codigo.toLowerCase()}`, title, status, instance, codigo, ...extras },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}
```

O formato do corpo segue RFC 9457; detalhes na skill `api-design-integracoes`.

### Regras de `try/catch`

- `catch` só onde se sabe o que fazer: converter, compensar, tentar de novo ou adicionar contexto.
- Ao converter, preserve a causa: `throw new Error('contexto', { cause: e })`.
- Nunca `catch` que retorna valor padrão silencioso (`return []`) em caminho de escrita ou de dinheiro.
- Erros conhecidos do Prisma: converta na infra. `P2002` (violação de unique) costuma virar conflito de domínio; `P2025` (registro não encontrado em operações que exigem registro) vira não encontrado.

```ts
import { Prisma } from '@prisma/client';

try {
  await tx.cupom.create({ data: { tenantId, codigo } });
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    throw new CupomDuplicadoError(codigo);
  }
  throw e;
}
```

## Server Actions

- Validar com o mesmo schema e checar sessão e permissão em toda action: action é endpoint público.
- Retorno tipado para erros esperados, para o formulário exibir mensagens; `throw` apenas para erro técnico.

```ts
type Resultado<T> = { ok: true; data: T } | { ok: false; erro: { codigo: string; mensagem: string; campos?: Record<string, string[]> } };
```

Escolha um padrão por projeto e mantenha.
