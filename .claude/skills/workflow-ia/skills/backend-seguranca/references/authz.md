# Autorização (authz)

Referência aprofundada da skill `backend-seguranca`. Leia quando a task criar rota, Route Handler ou Server Action, consultar/alterar recurso por id, envolver multi-tenant, papéis, permissões, convites ou transição de estado.

Base: OWASP API Security Top 10 (API1 BOLA, API3 BOPLA, API5 BFLA), OWASP ASVS V4 (Controle de acesso). Exemplos com Next.js, Express e Prisma. Em outro stack, aplique o equivalente.

## 1. Princípios

- **Negar por padrão.** Uma rota nova sem checagem explícita é uma falha, não um "depois a gente vê".
- **O servidor decide.** Esconder botão, desabilitar campo ou redirecionar no front é UX.
- **Contexto vem da sessão validada.** `userId`, `tenantId` e `papel` nunca vêm do body, da query ou de header controlado pelo cliente.
- **Checar em todo ponto de entrada.** Route Handler, Server Action, rota Express, resolver GraphQL, worker que age em nome de usuário, job agendado que recebe id externo.
- **Menor privilégio.** Cada papel recebe só o necessário; tokens de integração com escopo mínimo.

### Middleware não é suficiente
- O `middleware` do Next.js é útil para redirecionar não logados, mas não pode ser a única barreira: já houve bypass por header (CVE-2025-29927) e ele não conhece o recurso acessado.
- A checagem que importa é a que acontece junto da query, no use case ou no handler.

## 2. Contexto de autorização

```ts
// src/lib/auth/contexto.ts
export type ContextoAuth = { userId: string; tenantId: string; papel: Papel };

export async function exigirSessao(): Promise<ContextoAuth> {
  const sessao = await obterSessaoValidada(); // helper do projeto (cookie → sessão no banco)
  if (!sessao) throw new NaoAutenticadoError(); // 401
  return { userId: sessao.usuarioId, tenantId: sessao.tenantId, papel: sessao.papel };
}
```
- O use case recebe `ContextoAuth` como parâmetro obrigatório. Assim, é impossível chamá-lo "esquecendo" o tenant.

## 3. BOLA / IDOR

### Leitura
```ts
// errado
const cliente = await prisma.cliente.findUnique({ where: { id } });

// certo
const cliente = await prisma.cliente.findFirst({ where: { id, tenantId: ctx.tenantId }, select: clienteSelect });
if (!cliente) throw new NaoEncontradoError('cliente'); // 404
```

### Escrita
`update`/`delete` por `id` também precisam do tenant. Duas formas:
```ts
// A) updateMany com tenant e checagem de count
const { count } = await prisma.cliente.updateMany({ where: { id, tenantId: ctx.tenantId }, data });
if (count === 0) throw new NaoEncontradoError('cliente');

// B) update com filtro extra no where único (Prisma 5+ aceita campos não únicos junto do id)
await prisma.cliente.update({ where: { id, tenantId: ctx.tenantId }, data }); // P2025 → 404
```

### Recursos aninhados
- Rota `/lojas/:lojaId/vendas/:vendaId`: confirme que a venda pertence à loja **e** que a loja pertence ao tenant. Não basta checar só o pai ou só o filho.
```ts
const venda = await prisma.venda.findFirst({
  where: { id: vendaId, lojaId, loja: { tenantId: ctx.tenantId } },
});
```

### Operações em lote
- `ids: string[]` vindo do cliente: filtre por tenant e compare quantidades.
```ts
const { count } = await prisma.produto.updateMany({
  where: { id: { in: ids }, tenantId: ctx.tenantId },
  data: { ativo: false },
});
if (count !== ids.length) throw new NaoEncontradoError('produto'); // dentro de transação, para desfazer
```

### IDs
- UUID não é controle de acesso: dificulta adivinhar, mas IDs vazam em URL, log e e-mail. O filtro por tenant continua obrigatório.

## 4. Escopo automático por tenant (defesa em profundidade)

Um client Prisma "do tenant" reduz o risco de esquecer o filtro. É segunda linha: não substitui o `where` explícito nem o RLS (ver `banco-seguranca-operacao`).

```ts
const MODELOS_COM_TENANT = new Set(['Produto', 'Venda', 'Cliente', 'MovimentoCaixa']);
const OPERACOES_COM_WHERE = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany',
]);

export function prismaDoTenant(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!MODELOS_COM_TENANT.has(model)) return query(args);
          // ajuste a tipagem de args conforme a versão do Prisma do projeto
          if (OPERACOES_COM_WHERE.has(operation)) args.where = { ...args.where, tenantId };
          if (operation === 'create') args.data = { ...args.data, tenantId };
          if (operation === 'upsert') throw new Error('upsert exige tratamento explícito de tenant');
          return query(args);
        },
      },
    },
  });
}
```
Limites conhecidos: não cobre `$queryRaw`, `createMany`, nested writes (`create` aninhado, `connect`) nem relações carregadas por `include` a partir de modelo sem tenant. Trate esses casos explicitamente.

## 5. Relações e `connect`

Referenciar um id em relação também é acesso ao recurso.
```ts
// errado: categoriaId pode ser de outro tenant; o produto passa a "enxergar" a categoria alheia
await prisma.produto.create({
  data: { ...dados, tenantId: ctx.tenantId, categoria: { connect: { id: input.categoriaId } } },
});

// certo: valide a posse antes (ou use FK composta (tenantId, id) no schema)
const categoria = await prisma.categoria.findFirst({ where: { id: input.categoriaId, tenantId: ctx.tenantId }, select: { id: true } });
if (!categoria) throw new EntradaInvalidaError('categoriaId');
```
Solução estrutural: chave composta `@@unique([tenantId, id])` no pai e FK composta no filho, de modo que o banco rejeite a ligação entre tenants (ver `banco-modelagem`).

## 6. BOPLA: autorização em nível de propriedade

- **Leitura**: cada papel vê um conjunto de campos. `custoCentavos` e margem, por exemplo, só para dono/gerente. Use `select` por papel ou DTO por papel.
- **Escrita**: schemas distintos por operação e papel.
```ts
const ProdutoOperador = z.object({ estoqueMinimo: z.number().int().min(0) }).strict();
const ProdutoGerente = ProdutoOperador.extend({
  nome: z.string().min(1).max(120),
  precoCentavos: z.number().int().positive(),
}).strict();

const schema = pode(ctx, 'produto:editar-preco') ? ProdutoGerente : ProdutoOperador;
const data = schema.parse(input);
```
- Campos nunca editáveis pelo cliente: `id`, `tenantId`, `criadoPor`, `papel` (exceto em fluxo próprio), `status` controlado por máquina de estados, contadores, saldos.

## 7. BFLA: autorização em nível de função

- Rotas administrativas (`/admin`, `/v1/usuarios/:id/papel`, exportações) checam papel explicitamente; caminho "escondido" não é proteção.
- Métodos diferentes na mesma rota podem exigir permissões diferentes (`GET` vs `DELETE`).

### RBAC centralizado
```ts
type Permissao =
  | 'venda:criar' | 'venda:estornar' | 'produto:editar' | 'produto:editar-preco'
  | 'usuario:gerenciar' | 'relatorio:ver';
type Papel = 'dono' | 'gerente' | 'operador';

const PERMISSOES: Record<Papel, ReadonlySet<Permissao>> = {
  dono: new Set(['venda:criar', 'venda:estornar', 'produto:editar', 'produto:editar-preco', 'usuario:gerenciar', 'relatorio:ver']),
  gerente: new Set(['venda:criar', 'venda:estornar', 'produto:editar', 'produto:editar-preco', 'relatorio:ver']),
  operador: new Set(['venda:criar']),
};

export const pode = (ctx: ContextoAuth, p: Permissao) => PERMISSOES[ctx.papel].has(p);

export function exigirPermissao(ctx: ContextoAuth, p: Permissao): void {
  if (!pode(ctx, p)) throw new SemPermissaoError(p); // 403
}
```

### ABAC quando o papel não basta
- Regras com atributos do recurso e do contexto: "operador estorna só venda própria do mesmo dia", "desconto acima de 10% exige gerente".
```ts
export function exigirPodeEstornar(ctx: ContextoAuth, venda: { operadorId: string; criadaEm: Date }) {
  if (pode(ctx, 'venda:estornar')) return;
  const mesmaData = venda.criadaEm.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  if (venda.operadorId === ctx.userId && mesmaData) return;
  throw new SemPermissaoError('venda:estornar');
}
```
Atenção: "mesmo dia" em UTC pode diferir do dia local da loja; use o fuso da loja quando a regra de negócio for por dia local.

## 8. Escalonamento de privilégio

- Usuário não altera o próprio papel.
- Ninguém concede papel acima do próprio (gerente não cria dono).
- `tenantId` nunca muda por API de usuário comum.
- Convite: o papel do convite é definido e validado por quem convida, gravado no servidor, e o token do convite é de uso único.
- Troca de papel invalida sessões do afetado (ver `authn.md`) e gera audit log.

## 9. Máquina de estados e lógica de negócio

```ts
const TRANSICOES: Record<StatusVenda, readonly StatusVenda[]> = {
  aberta: ['paga', 'cancelada'],
  paga: ['estornada'],
  cancelada: [],
  estornada: [],
};

const STATUS = Object.keys(TRANSICOES) as StatusVenda[];
const origensPermitidas = (destino: StatusVenda) => STATUS.filter((o) => TRANSICOES[o].includes(destino));

const { count } = await tx.venda.updateMany({
  where: { id, tenantId: ctx.tenantId, status: { in: origensPermitidas('estornada') } },
  data: { status: 'estornada', estornadaPor: ctx.userId, estornadaEm: new Date() },
});
if (count === 0) throw new TransicaoInvalidaError(id, 'estornada'); // 409
```
- A transição é condicional no `where`: evita estorno duplo concorrente.
- Não permita pular etapas (ex.: marcar pedido como entregue sem pago).

## 10. Códigos de resposta

| Situação | Status |
|---|---|
| Sem sessão/token válido | 401 |
| Recurso de outro tenant ou inexistente | 404 (não confirme existência) |
| Recurso do próprio tenant, sem permissão para a ação | 403 |
| Transição de estado inválida | 409 |

## 11. Como provar
Para cada rota nova ou alterada, testes de integração com pelo menos:
- sem autenticação → 401;
- usuário do tenant A acessando recurso do tenant B → 404 (e nada alterado no banco);
- papel sem permissão → 403;
- papel com permissão → sucesso.
Ver `testes-qualidade` para a matriz de autorização.
