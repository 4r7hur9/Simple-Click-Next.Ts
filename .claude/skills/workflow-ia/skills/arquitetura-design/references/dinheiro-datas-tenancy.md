# Dinheiro, datas e multi-tenancy

Três decisões que, erradas, corrompem dados em silêncio e são caras de corrigir depois. Decida no início e registre em ADR.

## Dinheiro

### Representação

| Opção | Prisma | Quando usar | Cuidados |
|---|---|---|---|
| Centavos inteiros | `precoCentavos Int` | Preços, itens, totais de venda | `Int` do Postgres vai até ~2,1 bilhões de centavos (R$ 21 milhões). Para agregados e saldos grandes use `BigInt` |
| Centavos em `BigInt` | `saldoCentavos BigInt` | Saldos acumulados, relatórios | Prisma retorna `bigint` do JS; `JSON.stringify` falha com bigint. Converta para string ou number seguro no DTO |
| Decimal | `preco Decimal @db.Decimal(12, 2)` | Quando a codebase já usa, ou precisa de mais de 2 casas (custo unitário, câmbio) | Prisma retorna `Prisma.Decimal` (decimal.js). Use `.plus`, `.times`, `.toDecimalPlaces`; nunca converta para `number` no meio do cálculo |

- Um módulo usa uma representação. Conversões ficam na infra.
- Percentuais como inteiros em pontos-base (1250 = 12,50%) ou `Decimal`; nunca `0.125` em float.
- Quantidade fracionária (tecido em metros, produto a granel) também é `Decimal` ou inteiro na menor unidade (milímetros, gramas).

### Arredondamento e rateio

- Defina a regra (ex.: meio para cima, por item) e implemente numa única função do domínio.
- Desconto no total distribuído entre itens precisa fechar ao centavo. Use rateio com maior resto:

```ts
export function ratearCentavos(totalCentavos: number, pesos: number[]): number[] {
  const somaPesos = pesos.reduce((a, b) => a + b, 0);
  if (somaPesos === 0) return pesos.map(() => 0);
  const brutos = pesos.map((p) => (totalCentavos * p) / somaPesos);
  const partes = brutos.map(Math.floor);
  let resto = totalCentavos - partes.reduce((a, b) => a + b, 0);
  const ordem = brutos
    .map((b, i) => ({ i, fracao: b - Math.floor(b) }))
    .sort((a, b) => b.fracao - a.fracao);
  for (const { i } of ordem) {
    if (resto <= 0) break;
    partes[i]! += 1;
    resto -= 1;
  }
  return partes;
}
```

- Regras fiscais (ICMS, arredondamento em NFC-e) seguem a especificação fiscal vigente; não invente. Se a spec não define, registre como dúvida.

### Entrada e exibição

- Converta texto do usuário para centavos sem passar por float:

```ts
export function reaisParaCentavos(texto: string): number {
  const limpo = texto.trim().replace(/\s|R\$/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) throw new Error('Valor monetário inválido');
  const [inteiro = '0', frac = ''] = limpo.split('.');
  return Number(inteiro) * 100 + Number(frac.padEnd(2, '0'));
}
```

- Exiba só na UI: `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100)`. A divisão por 100 para exibição é aceitável; para cálculo, não.
- Preço, desconto, total, frete e juros são sempre recalculados no servidor. Valor vindo do cliente é, no máximo, uma intenção a validar.

### Snapshot histórico

- O item da venda guarda o preço praticado no momento (`precoUnitarioCentavos`). Isso não é redundância: o preço do produto muda, a venda não.

## Datas e horários

### Tipos

| Conceito | Tipo no Postgres | Prisma | Exemplo |
|---|---|---|---|
| Instante (algo aconteceu) | `timestamptz` | `DateTime @db.Timestamptz(6)` | `criadaEm`, `pagoEm` |
| Data de calendário | `date` | `DateTime @db.Date` | vencimento, aniversário |
| Hora do dia recorrente | `time` + fuso do tenant | `DateTime @db.Time` ou string `HH:mm` validada | abertura da loja |

- Sem `@db.Timestamptz`, o Prisma mapeia `DateTime` no Postgres para `timestamp(3)` sem fuso. Em tabelas novas, declare o tipo explicitamente.
- No servidor, `new Date()` é um instante UTC. O problema é a conversão de/para texto.
- `new Date('2026-09-29')` é interpretado como meia-noite UTC; `new Date('2026-09-29T00:00')` como meia-noite no fuso do processo. Prefira ISO 8601 completo com `Z` ou offset nas APIs.
- Servidor e banco rodam em UTC. Não dependa de `TZ` do container.

### Fuso do tenant

- Cada tenant tem `fusoHorario` (IANA, ex.: `America/Fortaleza`, `America/Sao_Paulo`).
- "Vendas de hoje" = instantes entre o início e o fim do dia local do tenant, convertidos para UTC.

No banco:
```sql
SELECT date_trunc('day', criada_em AT TIME ZONE 'America/Fortaleza') AS dia, sum(total_centavos)
FROM vendas
WHERE tenant_id = $1
  AND criada_em >= $2 AND criada_em < $3   -- limites UTC calculados na aplicação
GROUP BY 1;
```

Na aplicação, com `date-fns-tz` v3:
```ts
import { fromZonedTime } from 'date-fns-tz';

export function limitesDoDia(diaLocal: string, fuso: string) { // diaLocal = '2026-09-29'
  const inicio = fromZonedTime(`${diaLocal}T00:00:00`, fuso);
  const seguinte = new Date(`${diaLocal}T00:00:00Z`);
  seguinte.setUTCDate(seguinte.getUTCDate() + 1);
  const fim = fromZonedTime(`${seguinte.toISOString().slice(0, 10)}T00:00:00`, fuso); // correto mesmo com horário de verão
  return { inicio, fim };
}
```

- Exibição: `new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' }).format(data)`.
- Em RSC, formate com o fuso do tenant explicitamente; não dependa do fuso do servidor nem do navegador sem saber qual é.

## Multi-tenancy

### Estratégia padrão

- Banco compartilhado, coluna `tenantId` NOT NULL em toda tabela de negócio.
- Unicidades de negócio escopadas: `@@unique([tenantId, sku])`, `@@unique([tenantId, codigo])`.
- Índices compostos começando por `tenantId` (detalhes em `banco-modelagem` e `banco-performance`).
- RLS no Postgres como segunda linha de defesa (detalhes em `banco-seguranca-operacao`).

### Origem do `tenantId`

- Sempre da sessão autenticada no servidor (cookie de sessão, token validado). Nunca de body, query, params, header livre ou subdomínio sem validar que o usuário pertence àquele tenant.
- Usuário com acesso a várias lojas: a loja ativa fica na sessão e cada troca é validada contra a tabela de vínculos.
- Jobs e filas carregam `tenantId` no payload gerado pelo servidor; o consumer revalida o formato e usa em todas as queries.

### Em toda query

```ts
// leitura
await prisma.produto.findFirst({ where: { tenantId, id } });

// escrita
await prisma.produto.updateMany({ where: { tenantId, id }, data: { nome } });
await prisma.produto.deleteMany({ where: { tenantId, id } });

// relação: garanta que o recurso relacionado também é do tenant
const cliente = await prisma.cliente.findFirst({ where: { tenantId, id: clienteId }, select: { id: true } });
if (!cliente) throw new ClienteNaoEncontradoError(clienteId);
```

- `findUnique({ where: { id } })` e `update({ where: { id } })` sem `tenantId` são IDOR entre tenants.
- `$queryRaw` precisa de `WHERE tenant_id = ${tenantId}` explícito.

### Escopo automático (opcional)

Uma extensão do Prisma Client pode injetar `tenantId` em consultas, mas não substitui filtros explícitos, testes e RLS: não cobre `$queryRaw` e exige cuidado com escritas aninhadas.

```ts
export function prismaDoTenant(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async findMany({ args, query }) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
      },
    },
  });
}
```

### Outros pontos de vazamento

- Chaves de cache incluem o tenant: `tenant:${tenantId}:produtos:pagina:1`.
- Caminhos de arquivos no storage prefixados pelo tenant e servidos por URL assinada após checar autorização.
- Logs e métricas carregam `tenantId` para investigação, sem dados pessoais.
- Testes de integração: usuário do tenant A tentando ler, alterar e excluir recurso do tenant B recebe 404.
