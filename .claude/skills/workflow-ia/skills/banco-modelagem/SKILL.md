---
name: banco-modelagem
description: "Modelagem de dados e evolução de schema no PostgreSQL com Prisma: normalização e desnormalização consciente, integridade no banco (PK, FK, UNIQUE, NOT NULL, CHECK), tipos corretos (dinheiro em centavos ou numeric, timestamptz, jsonb só para semiestruturado), snapshot histórico, colunas de auditoria, soft delete com índice parcial, tenant_id com FK composta, naming e migrations versionadas com expand/contract. Use quando o diff alterar schema.prisma ou prisma/migrations, criar tabela, coluna, relação, enum ou constraint, ou renomear/remover campo. Não use para índices por desempenho e EXPLAIN (use banco-performance) nem para privilégios, RLS e backup (use banco-seguranca-operacao)."
---

# Banco: modelagem e migrations

Objetivo: o banco guarda a verdade do negócio e se defende sozinho de dado inválido, mesmo quando o código falha. O `implementer` e o `fixer` seguem "Regras" e "Como construir" ao mexer em `schema.prisma` e migrations; o `quality-reviewer` e o `security-reviewer` usam o "Checklist de revisão" para gerar findings com a severidade padrão; o `ops-reviewer` usa a parte de migrations (expand/contract) para julgar se a migration sobrevive ao deploy (`operacao/migration-deploy`).

Exemplos em PostgreSQL 15+ e Prisma. Em outro stack (Drizzle, TypeORM, Knex, MySQL), aplique o equivalente: a regra vale para o banco, não para o ORM.

## Regras inegociáveis

1. **Invariante de negócio vira constraint no banco (NOT NULL, UNIQUE, FK, CHECK), não só validação Zod.** Validação na aplicação é contornada por script, job, bug ou concorrência; constraint não.
2. **Dinheiro nunca em `Float`/`double precision`: inteiro em centavos (`Int`/`BigInt`) ou `Decimal @db.Decimal(p,s)`.** Float soma errado (0,1 + 0,2) e gera divergência de caixa.
3. **Instante no tempo é `timestamptz` (`@db.Timestamptz(3)`), gravado em UTC.** O `DateTime` padrão do Prisma vira `timestamp` sem fuso e produz horários errados entre servidor, banco e UI.
4. **Toda tabela de dado de cliente tem `tenant_id NOT NULL`, e a unicidade de negócio inclui o tenant.** Sem isso, um tenant vê ou bloqueia dado de outro (`sku` único global impede dois lojistas de usarem o mesmo código).
5. **Referência entre entidades do mesmo tenant garante o mesmo tenant (FK composta `(tenant_id, x_id)`).** FK simples permite um item de venda apontar para produto de outro tenant.
6. **Uma fonte da verdade por fato; valor derivado guardado só com mecanismo de consistência explícito.** Saldo guardado e nunca reconciliado diverge em silêncio.
7. **Valor histórico é snapshot na linha do evento (preço, desconto, alíquota no item da venda).** Ler o preço atual do produto para uma venda antiga reescreve o passado.
8. **Migration aplicada nunca é editada nem apagada; correção é uma nova migration.** Editar quebra o checksum, o histórico e a reprodutibilidade entre ambientes.
9. **Mudança destrutiva ou incompatível segue expand/contract em deploys separados.** Renomear ou remover coluna no mesmo deploy derruba a versão do app ainda em execução.
10. **Migration em tabela grande não pode travar escrita: sem reescrita de tabela, `NOT NULL`/FK validados em etapas, índice com `CONCURRENTLY`, `lock_timeout` definido.** Um `ALTER TABLE` bloqueando `vendas` por minutos para o PDV.
11. **`onDelete: Cascade` só em composição verdadeira; dado de negócio usa `Restrict` (padrão) ou soft delete.** Cascade apaga vendas junto com o cliente e destrói histórico fiscal.
12. **Nada de coluna multivalorada (CSV em texto, array de ids, jsonb de entidades com relação).** Não tem FK, não indexa bem e não garante integridade.
13. **`jsonb` só para dado semiestruturado sem regra relacional, validado por schema na escrita.** Campo consultado, filtrado ou referenciado vira coluna.
14. **Unicidade com soft delete é índice único parcial `WHERE deleted_at IS NULL`.** Unique comum impede recriar um registro excluído logicamente.

## Como construir

### Processo
- Leia o `schema.prisma` inteiro e as últimas migrations antes de mudar: imite naming, tipos de id e padrão de auditoria existentes.
- Gere a migration com `prisma migrate dev --create-only`, leia o SQL gerado e complete o que o Prisma não expressa (CHECK, índice parcial, FK composta com `NOT VALID`, backfill).
- Em produção, somente `prisma migrate deploy`. Nunca `migrate dev`, `db push` ou `migrate reset` fora do ambiente local.
- Detalhes do ciclo e de locks em [references/migrations-expand-contract.md](references/migrations-expand-contract.md).

### Tipos
- Dinheiro: `Int` em centavos (padrão do projeto quando existir) ou `Decimal @db.Decimal(12, 2)`; quantidade fracionada (kg, m): `Decimal @db.Decimal(12, 3)`.
- Datas: `DateTime @db.Timestamptz(3)`; data de calendário sem hora (vencimento, aniversário): `DateTime @db.Date`.
- Ids: `String @db.Uuid @default(uuid())` ou `BigInt @default(autoincrement())`; siga o que o projeto usa. Nunca `@db.Uuid` misturado com `String` sem tipo na mesma relação.
- Texto: `String` (`text`); limite de tamanho por CHECK ou `@db.VarChar(n)` só quando o limite é regra de negócio.
- Estado finito: `enum` do Prisma quando o conjunto é estável; tabela de domínio quando o usuário/tenant cadastra valores.
- Booleano que carrega data ("ativo"/"cancelado") geralmente é melhor como `cancelado_em timestamptz NULL`.

### Integridade
- `NOT NULL` por padrão; opcional só quando a ausência tem significado.
- CHECK para regras locais da linha: `quantidade >= 0`, `total_centavos >= 0`, `desconto_centavos <= subtotal_centavos`, `fim > inicio`.
- UNIQUE para chaves naturais do negócio: `(tenant_id, sku)`, `(tenant_id, email)`, `(tenant_id, idempotency_key)`.
- FK em toda referência, com índice na coluna da FK (o Postgres não cria sozinho; ver `banco-performance`).
- Associação polimórfica (`entidade_tipo` + `entidade_id`) não tem FK: prefira FKs separadas anuláveis + `CHECK (num_nonnulls(a_id, b_id) = 1)`.

### Multi-tenant
- `tenantId` em todas as tabelas de dados do cliente, inclusive tabelas filhas (item de venda, movimento de estoque).
- Pais expõem `@@unique([tenantId, id])`; filhos referenciam com `@relation(fields: [tenantId, produtoId], references: [tenantId, id])`.
- Índices e uniques começam por `tenant_id`.
- Tabelas globais (plano, catálogo de NCM) são explícitas e sem `tenant_id`; documente no schema com comentário `///`.

### Histórico, auditoria e exclusão
- `createdAt @default(now()) @db.Timestamptz(3)`, `updatedAt @updatedAt @db.Timestamptz(3)`; `createdById` quando a autoria importa.
- Snapshot no evento: `ItemVenda.precoUnitarioCentavos`, `descricaoProduto`, `aliquota`.
- Soft delete: `deletedAt DateTime? @db.Timestamptz(3)`, índice parcial `WHERE deleted_at IS NULL` e filtro em toda leitura (repository, não em cada chamada).
- Exclusão por LGPD de dado pessoal pode exigir anonimização real, não soft delete (ver `banco-seguranca-operacao`).

### Desnormalização consciente
- Só com medição que justifique (ver `banco-performance`).
- Declare o mecanismo: atualização na mesma transação da escrita de origem, trigger, ou job de reconciliação com alerta de divergência.
- Documente no schema (`///`) qual é a fonte da verdade.

### Naming
- Modelos em PascalCase singular no Prisma, tabelas em snake_case plural via `@@map`, colunas snake_case via `@map`, se o projeto já segue isso. Não misture padrões.
- Nomes de constraints previsíveis: `<tabela>_<colunas>_key`, `_fkey`, `_check`, `_idx`.
- Sem abreviações obscuras; unidade no nome quando houver (`_centavos`, `_em`, `_kg`).

## Checklist de revisão

Valores exatos para o campo severidade dos findings: `urgente`, `alto`, `medio`, `baixo`.

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | Migration já aplicada (existente na base) foi editada, renomeada ou apagada | urgente |
| 2 | Coluna ou tabela removida/renomeada no mesmo deploy em que o código deixa de usá-la (sem expand/contract) | urgente |
| 3 | Valor monetário como `Float`, `double precision` ou `real` | urgente |
| 4 | Tabela nova de dado de cliente sem `tenant_id` ou com `tenant_id` anulável | urgente |
| 5 | `onDelete: Cascade` em relação que apaga histórico de negócio (venda, pagamento, movimento de estoque, nota) | urgente |
| 6 | Migration com `DROP`/`TRUNCATE`/`DELETE` sem backfill ou cópia prévia e sem justificativa na spec | urgente |
| 7 | Unicidade de negócio sem `tenant_id` (ex.: `sku @unique` global) | alto |
| 8 | Relação entre entidades de tenant sem FK composta ou sem garantia de mesmo tenant | alto |
| 9 | Regra de invariante só na aplicação (estoque, total, desconto) sem CHECK/UNIQUE correspondente | alto |
| 10 | `DateTime` sem `@db.Timestamptz` para instante no tempo | alto |
| 11 | Venda/pedido lê preço, desconto ou alíquota atual em vez de snapshot na linha | alto |
| 12 | Coluna `NOT NULL` adicionada a tabela existente sem default nem backfill em etapas | alto |
| 13 | `ALTER COLUMN TYPE` ou default volátil que reescreve tabela grande em migration comum | alto |
| 14 | `CREATE INDEX` sem `CONCURRENTLY` em tabela grande em produção | alto |
| 15 | FK nova em tabela grande sem `NOT VALID` + `VALIDATE CONSTRAINT` separado | alto |
| 16 | Soft delete com `@unique` comum em vez de índice único parcial | alto |
| 17 | Lista de ids, tags ou entidades em texto CSV, array ou `jsonb` onde cabe tabela com FK | alto |
| 18 | Valor derivado persistido (saldo, total, contador) sem mecanismo de consistência declarado | medio |
| 19 | `jsonb` para campo filtrado, ordenado ou com regra, ou escrito sem validação de schema | medio |
| 20 | Campo opcional (`?`) sem motivo de negócio para a ausência | medio |
| 21 | Tabela de negócio sem `created_at`/`updated_at` | medio |
| 22 | Associação polimórfica sem FK nem CHECK de exclusividade | medio |
| 23 | Migration sem `lock_timeout` em `ALTER` de tabela quente | medio |
| 24 | Schema e migration divergentes (constraint só no SQL sem comentário `///` no modelo, ou vice-versa) | medio |
| 25 | Enum do Prisma para lista que o usuário cadastra ou que muda com frequência | medio |
| 26 | Naming fora do padrão do schema (camelCase na tabela, mistura de singular/plural, abreviações) | baixo |
| 27 | Coluna sem unidade no nome quando ambígua (`valor`, `peso`, `prazo`) | baixo |

## Anti-padrões (errado → certo)

### Dinheiro e data com tipos errados
```prisma
// errado
model Venda {
  id        String   @id @default(uuid())
  total     Float
  criadaEm  DateTime @default(now())
}

// certo
model Venda {
  id            String   @id @default(uuid()) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  totalCentavos Int      @map("total_centavos")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  @@map("vendas")
}
```

### Unicidade e referência sem tenant
```prisma
// trechos: demais campos e o lado inverso das relações foram omitidos
// errado: SKU único no banco inteiro; item pode apontar para produto de outro tenant
model Produto {
  id  String @id @db.Uuid
  sku String @unique
}
model ItemVenda {
  produtoId String  @db.Uuid
  produto   Produto @relation(fields: [produtoId], references: [id])
}

// certo
model Produto {
  id       String @id @db.Uuid
  tenantId String @db.Uuid
  sku      String
  @@unique([tenantId, sku])
  @@unique([tenantId, id])
}
model ItemVenda {
  tenantId  String  @db.Uuid
  produtoId String  @db.Uuid
  produto   Produto @relation(fields: [tenantId, produtoId], references: [tenantId, id])
}
```

### Invariante só na aplicação
```ts
// errado: dois caixas simultâneos passam na checagem e o estoque fica negativo
if (produto.estoque < qtd) throw new EstoqueInsuficiente();
await prisma.produto.update({ where: { id }, data: { estoque: produto.estoque - qtd } });
```
```sql
-- certo: o banco recusa (SQLSTATE 23514); a aplicação traduz a violação em erro de domínio
ALTER TABLE produtos ADD CONSTRAINT produtos_estoque_check CHECK (estoque >= 0);
```
```ts
await prisma.produto.update({ where: { id }, data: { estoque: { decrement: qtd } } });
```

### Leitura do preço atual em venda histórica
```ts
// errado: relatório de 2025 muda quando o preço muda em 2026
const total = venda.itens.reduce((s, i) => s + i.produto.precoCentavos * i.quantidade, 0);

// certo: snapshot gravado no momento da venda
const total = venda.itens.reduce((s, i) => s + i.precoUnitarioCentavos * i.quantidade, 0);
```

### Rename direto
```sql
-- errado: a versão anterior do app, ainda no ar durante o deploy, quebra
ALTER TABLE clientes RENAME COLUMN fone TO telefone;

-- certo: expand (nova coluna + escrita dupla + backfill) → deploy → contract (drop) em deploy posterior
ALTER TABLE clientes ADD COLUMN telefone text;
```

## Referências

- [references/modelagem-e-constraints.md](references/modelagem-e-constraints.md) — leia quando for criar ou revisar tabelas, relações, tipos, CHECK, FK composta de tenant, soft delete, snapshot, jsonb, enums, desnormalização ou naming; traz schema Prisma completo e o SQL que o Prisma não gera.
- [references/migrations-expand-contract.md](references/migrations-expand-contract.md) — leia quando a task gerar migration, alterar coluna existente, renomear/remover campo, adicionar NOT NULL/FK/índice em tabela com dados, fazer backfill ou quando uma migration falhar em algum ambiente.
