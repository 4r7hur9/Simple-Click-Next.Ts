# Camadas, módulos e ADR

Exemplo completo de um caso de uso atravessando as camadas, regras de fronteira entre módulos e modelo de ADR.

## Fluxo de uma requisição

```
Borda (route handler / Server Action / consumer)
  -> autentica e obtém contexto { userId, tenantId, papel }
  -> valida entrada (Zod)
  -> chama caso de uso
Caso de uso (application)
  -> carrega dados pelos repositories (sempre com tenantId)
  -> aplica regras do domínio (funções puras)
  -> persiste dentro de transação quando há mais de uma escrita
  -> retorna DTO de saída ou lança erro de domínio
Borda
  -> mapeia resultado para resposta (status, corpo)
  -> erros: handler central converte domínio -> 4xx e técnico -> 500
```

## Exemplo: registrar venda

### Domínio (puro)

```ts
// modules/vendas/domain/venda.ts
import { EstoqueInsuficienteError, DescontoAcimaDoLimiteError } from './erros';

export type ItemVenda = { produtoId: string; quantidade: number; precoUnitarioCentavos: number };

export function calcularSubtotalCentavos(itens: ItemVenda[]): number {
  return itens.reduce((soma, i) => soma + i.precoUnitarioCentavos * i.quantidade, 0);
}

export function aplicarDesconto(subtotal: number, descontoCentavos: number, limitePercentual: number): number {
  const limite = Math.floor((subtotal * limitePercentual) / 100);
  if (descontoCentavos > limite) throw new DescontoAcimaDoLimiteError(limite);
  return subtotal - descontoCentavos;
}

export function garantirEstoque(disponivel: number, solicitado: number, produtoId: string): void {
  if (solicitado > disponivel) throw new EstoqueInsuficienteError(produtoId, disponivel);
}
```

### Caso de uso

```ts
// modules/vendas/application/registrar-venda.ts
import type { PrismaClient } from '@prisma/client';
import { calcularSubtotalCentavos, aplicarDesconto } from '../domain/venda';
import { EstoqueInsuficienteError } from '../domain/erros';

export type RegistrarVendaInput = {
  tenantId: string;
  operadorId: string;
  itens: { produtoId: string; quantidade: number }[];
  descontoCentavos: number;
};

export function criarRegistrarVenda(deps: { prisma: PrismaClient; limiteDescontoPercentual: number }) {
  return async function registrarVenda(input: RegistrarVendaInput) {
    return deps.prisma.$transaction(async (tx) => {
      // preços SEMPRE do banco, nunca do cliente
      const produtos = await tx.produto.findMany({
        where: { tenantId: input.tenantId, id: { in: input.itens.map((i) => i.produtoId) } },
        select: { id: true, precoCentavos: true },
      });
      const precoPorId = new Map(produtos.map((p) => [p.id, p.precoCentavos]));

      const itens = input.itens.map((i) => {
        const preco = precoPorId.get(i.produtoId);
        if (preco === undefined) throw new ProdutoNaoEncontradoError(i.produtoId);
        return { ...i, precoUnitarioCentavos: preco };
      });

      // baixa condicional: atômica e segura contra dois caixas vendendo a última peça
      for (const item of itens) {
        const { count } = await tx.estoque.updateMany({
          where: { tenantId: input.tenantId, produtoId: item.produtoId, quantidade: { gte: item.quantidade } },
          data: { quantidade: { decrement: item.quantidade } },
        });
        if (count === 0) throw new EstoqueInsuficienteError(item.produtoId);
      }

      const subtotal = calcularSubtotalCentavos(itens);
      const total = aplicarDesconto(subtotal, input.descontoCentavos, deps.limiteDescontoPercentual);

      const venda = await tx.venda.create({
        data: {
          tenantId: input.tenantId,
          operadorId: input.operadorId,
          subtotalCentavos: subtotal,
          descontoCentavos: input.descontoCentavos,
          totalCentavos: total,
          itens: { create: itens }, // snapshot do preço no item
        },
        select: { id: true, totalCentavos: true, criadaEm: true },
      });
      return venda;
    });
  };
}
```

Pontos importantes:
- Um caso de uso = uma transação. Nada de chamada HTTP externa dentro dela (ver `api-design-integracoes`, padrão outbox).
- Em casos simples, usar `tx` do Prisma direto no caso de uso é aceitável. Extraia repository quando a query se repete ou quando o caso de uso precisa ser testado sem banco.
- `ProdutoNaoEncontradoError` viria de `../domain/erros` (import omitido para brevidade).

### Repository com transação

Quando o projeto usa repositories, eles recebem o client (normal ou transacional):

```ts
// modules/vendas/infra/venda-repository-prisma.ts
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export function vendaRepository(db: Db) {
  return {
    buscarPorId(tenantId: string, id: string) {
      return db.venda.findFirst({ where: { tenantId, id }, include: { itens: true } });
    },
    async marcarCancelada(tenantId: string, id: string) {
      const { count } = await db.venda.updateMany({
        where: { tenantId, id, status: 'CONCLUIDA' },
        data: { status: 'CANCELADA' },
      });
      return count === 1;
    },
  };
}
```

- `findFirst` com `tenantId` no `where` em vez de `findUnique({ where: { id } })`: a unicidade por `id` não garante o tenant.
- `updateMany` com `tenantId` e estado esperado torna a atualização condicional e segura.

### Borda (route handler)

```ts
// app/api/v1/vendas/route.ts
import { NextResponse } from 'next/server';
// index.ts do módulo expõe o schema e registrarVenda já composto:
// export const registrarVenda = criarRegistrarVenda({ prisma, limiteDescontoPercentual: env.LIMITE_DESCONTO });
import { registrarVendaSchema, registrarVenda } from '@/modules/vendas';
import { exigirSessao } from '@/lib/auth';
import { responderErro } from '@/lib/http/problem';

export async function POST(request: Request) {
  try {
    const sessao = await exigirSessao();
    const dados = registrarVendaSchema.parse(await request.json());
    const venda = await registrarVenda({ ...dados, tenantId: sessao.tenantId, operadorId: sessao.userId });
    return NextResponse.json(venda, { status: 201, headers: { Location: `/api/v1/vendas/${venda.id}` } });
  } catch (erro) {
    return responderErro(erro, request);
  }
}
```

## Fronteiras entre módulos

- Cada módulo expõe em `index.ts` apenas casos de uso, schemas e tipos públicos.
- Um módulo não lê nem escreve tabelas de outro. Se `vendas` precisa baixar estoque, chama a API pública de `estoque` (ou, por pragmatismo, as duas escritas ficam no mesmo caso de uso transacional, documentado em ADR).
- Dependência circular entre módulos indica fronteira errada: extraia o conceito compartilhado ou inverta com uma porta.
- Eventos internos (em memória ou fila) só quando há mais de um consumidor ou necessidade de assincronia real.

## Quando extrair

| Sinal | Ação |
|---|---|
| Mesma regra em 2 lugares | Extraia para o domínio já |
| Mesmo trecho utilitário em 3 lugares | Extraia para `lib/` ou helper do módulo |
| Arquivo acima de ~300 linhas com vários temas | Divida por caso de uso |
| Service com métodos que não compartilham estado | Transforme em funções/casos de uso separados |
| Interface com uma implementação e sem teste que a substitua | Remova a interface |

## Monólito modular antes de microsserviços

Microsserviço só com motivo concreto registrado em ADR: escala muito diferente de uma parte, time independente, isolamento de falha exigido, requisito regulatório. Sem isso, módulos bem separados no mesmo deploy entregam o mesmo desacoplamento sem custo de rede, consistência distribuída e observabilidade multi-serviço.

## Modelo de ADR

```markdown
# ADR-0007: Isolamento multi-tenant por coluna tenant_id com RLS

- Status: aceito
- Data: 2026-09-29
- Task: VST-123

## Contexto
O PDV atende várias lojas no mesmo banco. Precisamos impedir vazamento entre lojas
sem multiplicar bancos e migrations.

## Decisão
Toda tabela de negócio tem tenant_id NOT NULL. Repositories exigem tenantId.
RLS no Postgres como segunda linha de defesa.

## Alternativas consideradas
- Banco por tenant: isolamento forte, custo operacional alto para centenas de lojas.
- Schema por tenant: migrations N vezes, pool de conexões complexo.

## Consequências
- Índices compostos começam por tenant_id.
- Testes de autorização entre tenants obrigatórios.
- Relatórios globais usam papel de leitura com bypass controlado.
```
