# Modelagem e constraints no PostgreSQL com Prisma

Referência aprofundada da skill `banco-modelagem`. Leia quando for desenhar ou revisar tabelas, relações, tipos e regras de integridade. Os exemplos usam o domínio de um PDV multi-tenant para lojas de moda. Em outro ORM, as mesmas constraints são criadas no SQL da migration.

## 1. Normalização na prática

Objetivo da 3FN: cada fato guardado em um único lugar, dependendo da chave inteira e de nada além dela.

Sinais de que falta normalizar:
- Colunas repetidas com sufixo numérico (`telefone1`, `telefone2`, `telefone3`) → tabela filha `cliente_telefones`.
- Mesmo dado copiado em várias tabelas sem ser snapshot (nome da loja em `vendas`, `caixas`, `usuarios`) → FK para `lojas`.
- Coluna que depende de outra não-chave (`cidade_nome` ao lado de `cidade_id`) → remova a derivada.
- Texto com lista (`tamanhos = 'P,M,G'`) → tabela de variações.

Quando desnormalizar é legítimo:
- Snapshot histórico (não é redundância: é outro fato, "o preço naquele momento").
- Contador ou total lido em rota quente, com medição que prove o custo do cálculo (ver `banco-performance`).
- Tabela de leitura para relatório (resumo diário), reconstruível a partir da fonte.

Toda desnormalização declara:
1. Qual é a fonte da verdade.
2. Como a cópia é mantida: mesma transação, trigger, ou job assíncrono.
3. Como detectar divergência: consulta de reconciliação, alerta ou teste.

```prisma
model Produto {
  /// Derivado de movimentos_estoque. Atualizado na mesma transação de cada movimento.
  /// Reconciliação diária: job estoque-reconciliar compara com SUM(movimentos).
  estoqueAtual Int @default(0) @map("estoque_atual")
}
```

## 2. Tipos

| Dado | PostgreSQL | Prisma | Observação |
|---|---|---|---|
| Dinheiro (centavos) | `integer` / `bigint` | `Int` / `BigInt` | `Int` vai até ~21 milhões de reais em centavos; use `BigInt` para totais agregados ou valores altos |
| Dinheiro (decimal) | `numeric(12,2)` | `Decimal @db.Decimal(12, 2)` | Chega ao JS como `Prisma.Decimal`; nunca converta para `number` antes de somar |
| Percentual/alíquota | `numeric(7,4)` ou inteiro em pontos-base | `Decimal @db.Decimal(7, 4)` / `Int` | 18% = `0.1800` ou `1800` bps |
| Quantidade fracionada | `numeric(12,3)` | `Decimal @db.Decimal(12, 3)` | Tecido por metro, granel |
| Instante | `timestamptz` | `DateTime @db.Timestamptz(3)` | Sempre UTC; conversão só na UI |
| Data de calendário | `date` | `DateTime @db.Date` | Vencimento, data fiscal de competência |
| Id | `uuid` / `bigint` | `String @db.Uuid` / `BigInt` | Siga o padrão existente; não misture na mesma relação |
| Texto | `text` | `String` | Limite por CHECK quando é regra |
| E-mail para busca | `text` normalizado ou `citext` | `String` / `@db.Citext` | `citext` exige a extensão; alternativa: coluna `email_normalizado` em minúsculas |
| Semiestruturado | `jsonb` | `Json` | Nunca `json` (sem índice, sem dedupe de chaves) |
| Estado finito estável | enum ou `text` + CHECK | `enum` | Ver seção 7 |

Sobre ids:
- `uuid` evita enumeração e facilita geração fora do banco; UUIDv7 (ordenado por tempo) reduz fragmentação de índice. Versões recentes do Prisma aceitam `@default(uuid(7))`, e o PostgreSQL 18 tem `uuidv7()`; confirme a versão do projeto antes de usar.
- `bigint` sequencial é menor e mais rápido, mas não deve ser exposto como identificador público se enumerar for problema.

## 3. Constraints que o Prisma não expressa

O `schema.prisma` não declara CHECK, índice parcial e FK `NOT VALID`. Crie a migration com `--create-only` e adicione o SQL à mão. Registre a regra no modelo com comentário `///` para que o leitor do schema saiba que ela existe.

```sql
-- CHECKs de linha
ALTER TABLE produtos        ADD CONSTRAINT produtos_preco_check      CHECK (preco_centavos >= 0);
ALTER TABLE produtos        ADD CONSTRAINT produtos_estoque_check    CHECK (estoque_atual >= 0);
ALTER TABLE itens_venda     ADD CONSTRAINT itens_venda_qtd_check     CHECK (quantidade > 0);
ALTER TABLE itens_venda     ADD CONSTRAINT itens_venda_desc_check    CHECK (desconto_centavos BETWEEN 0 AND preco_unitario_centavos * quantidade);
ALTER TABLE promocoes       ADD CONSTRAINT promocoes_periodo_check   CHECK (fim_em > inicio_em);
ALTER TABLE clientes        ADD CONSTRAINT clientes_nome_len_check   CHECK (char_length(nome) BETWEEN 1 AND 200);

-- Exatamente uma origem preenchida (substitui associação polimórfica)
ALTER TABLE anexos ADD CONSTRAINT anexos_origem_check
  CHECK (num_nonnulls(venda_id, cliente_id, produto_id) = 1);

-- Unicidade condicionada (soft delete)
CREATE UNIQUE INDEX produtos_tenant_sku_ativo_key
  ON produtos (tenant_id, sku) WHERE deleted_at IS NULL;

-- Um único caixa aberto por loja
CREATE UNIQUE INDEX caixas_loja_aberto_key
  ON caixas (tenant_id, loja_id) WHERE fechado_em IS NULL;
```

Depois de adicionar SQL manual, rode `prisma migrate diff` (ou `migrate dev` local) e confirme que a próxima migration gerada não tenta remover o que você criou. Se tentar, o schema e o banco estão divergentes: ajuste o schema (quando a versão do Prisma suportar o recurso) ou documente o procedimento no README do módulo.

Tradução de violação para erro de domínio:
- `23505` unique_violation → conflito (409), ex.: "SKU já cadastrado".
- `23503` foreign_key_violation → referência inválida (422) ou "em uso" (409) no delete.
- `23514` check_violation → regra de negócio violada: 409 quando depende do estado atual (ex.: estoque insuficiente), 422 quando é entrada inválida.
- `23502` not_null_violation → bug de aplicação (500), não erro de usuário.

No Prisma, `P2002` é unique e `P2003` é FK. CHECK pode chegar como erro conhecido genérico ou desconhecido dependendo da versão; trate pelo nome da constraint presente na mensagem/meta, com teste de integração que prove o mapeamento.

## 4. Multi-tenant com FK composta

Objetivo: é impossível, no banco, uma linha do tenant A referenciar uma linha do tenant B.

```prisma
model Tenant {
  id        String    @id @default(uuid()) @db.Uuid
  nome      String
  produtos  Produto[]
  vendas    Venda[]
  @@map("tenants")
}

model Produto {
  id            String      @id @default(uuid()) @db.Uuid
  tenantId      String      @map("tenant_id") @db.Uuid
  sku           String
  nome          String
  precoCentavos Int         @map("preco_centavos")
  estoqueAtual  Int         @default(0) @map("estoque_atual")
  deletedAt     DateTime?   @map("deleted_at") @db.Timestamptz(3)
  createdAt     DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt     DateTime    @updatedAt @map("updated_at") @db.Timestamptz(3)
  tenant        Tenant      @relation(fields: [tenantId], references: [id])
  itens         ItemVenda[]

  /// Unicidade de SKU: índice parcial produtos_tenant_sku_ativo_key (WHERE deleted_at IS NULL), criado no SQL da migration.
  /// CHECK: preco_centavos >= 0, estoque_atual >= 0.
  @@unique([tenantId, id])
  @@index([tenantId, nome])
  @@map("produtos")
}

model Venda {
  id            String      @id @default(uuid()) @db.Uuid
  tenantId      String      @map("tenant_id") @db.Uuid
  numero        Int
  totalCentavos Int         @map("total_centavos")
  status        StatusVenda @default(ABERTA)
  createdAt     DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
  createdById   String      @map("created_by_id") @db.Uuid
  tenant        Tenant      @relation(fields: [tenantId], references: [id])
  itens         ItemVenda[]

  @@unique([tenantId, id])
  @@unique([tenantId, numero])
  @@index([tenantId, createdAt(sort: Desc)])
  @@map("vendas")
}

model ItemVenda {
  id                    String  @id @default(uuid()) @db.Uuid
  tenantId              String  @map("tenant_id") @db.Uuid
  vendaId               String  @map("venda_id") @db.Uuid
  produtoId             String  @map("produto_id") @db.Uuid
  quantidade            Int
  precoUnitarioCentavos Int     @map("preco_unitario_centavos") /// snapshot no momento da venda
  descontoCentavos      Int     @default(0) @map("desconto_centavos")
  descricaoProduto      String  @map("descricao_produto")        /// snapshot
  venda                 Venda   @relation(fields: [tenantId, vendaId], references: [tenantId, id], onDelete: Restrict)
  produto               Produto @relation(fields: [tenantId, produtoId], references: [tenantId, id], onDelete: Restrict)

  @@index([tenantId, vendaId])
  @@index([tenantId, produtoId])
  @@map("itens_venda")
}

enum StatusVenda {
  ABERTA
  FINALIZADA
  CANCELADA
}
```

Pontos:
- O `@@unique([tenantId, id])` no pai é o alvo da FK composta. É redundante para unicidade (o `id` já é único), mas é o que permite a FK.
- `onDelete: Restrict` deixa explícito que venda com itens não se apaga.
- Os índices das FKs começam por `tenant_id`, que é o primeiro filtro de toda query.
- A camada de segurança complementar (RLS) está em `banco-seguranca-operacao`.

## 5. Snapshot histórico

Regra: qualquer valor que pode mudar depois e que define o significado de um evento passado é copiado para o evento.

| Evento | Snapshot necessário |
|---|---|
| Item de venda | preço unitário, desconto, descrição, custo (para margem), alíquota |
| Pedido de compra | preço negociado, condição de pagamento |
| Nota fiscal | tudo que foi emitido (é documento, não relação viva) |
| Comissão | percentual vigente, base de cálculo |
| Assinatura/fatura | valor do plano no ciclo, desconto aplicado |

Não é snapshot: copiar o nome do cliente em toda venda "para não precisar de join". Isso é desnormalização e segue a seção 1.

## 6. Auditoria e soft delete

Colunas padrão em tabela de negócio:
- `created_at timestamptz NOT NULL DEFAULT now()`.
- `updated_at timestamptz NOT NULL`, mantido pelo `@updatedAt` do Prisma. Atenção: `@updatedAt` é preenchido pelo Prisma Client, não pelo banco; SQL raw, triggers e scripts fora do Prisma precisam atualizar a coluna (em `$executeRaw`, faça `updated_at = now()`).
- `created_by_id` quando a autoria tem valor de negócio ou auditoria.

Histórico completo de alterações (quem mudou o preço, de quanto para quanto) é tabela de auditoria append-only, não colunas extras. Ver `banco-seguranca-operacao`.

Soft delete:
```sql
ALTER TABLE clientes ADD COLUMN deleted_at timestamptz;
CREATE INDEX clientes_tenant_nome_ativos_idx ON clientes (tenant_id, nome) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX clientes_tenant_cpf_ativos_key ON clientes (tenant_id, cpf) WHERE deleted_at IS NULL;
```
- O filtro `deletedAt: null` fica no repository ou numa Prisma Client extension de leitura, nunca espalhado em cada chamada.
- Relações para registro soft-deleted continuam válidas (a FK aponta para linha existente); a UI decide como exibir.
- Soft delete não atende pedido de exclusão da LGPD: para dado pessoal, anonimize os campos pessoais ou apague de fato, conforme a retenção legal.

## 7. Enum, tabela de domínio ou text + CHECK

| Situação | Escolha |
|---|---|
| Conjunto pequeno, estável, controlado pelo código (status de venda) | `enum` Prisma |
| Conjunto que o tenant cadastra (categorias, formas de pagamento customizadas) | Tabela com FK |
| Conjunto controlado pelo código mas que muda com frequência | `text` + CHECK (alterar CHECK é simples) |

Sobre enum no PostgreSQL:
- Adicionar valor (`ALTER TYPE ... ADD VALUE`) é barato; o novo valor não pode ser usado na mesma transação em que foi criado.
- Remover ou renomear valor é caro: exige novo tipo e conversão da coluna. Planeje com expand/contract.

Estados com transições (máquina de estados) validam a transição na aplicação e, quando crítico, com CHECK que amarra estado a colunas: `CHECK (status <> 'CANCELADA' OR cancelado_em IS NOT NULL)`.

## 8. jsonb

Use para:
- Payload bruto recebido de terceiro (webhook, resposta fiscal) guardado para auditoria.
- Atributos variáveis por categoria que não são filtrados em SQL (ficha técnica de tecido).
- Configurações por tenant com schema versionado.

Não use para:
- Lista de entidades que têm vida própria (itens da venda, variações).
- Campo usado em `WHERE`, `ORDER BY`, JOIN ou soma em relatório.
- Contornar migration.

Sempre:
- Valide com Zod na escrita e na leitura (`Schema.parse(registro.atributos)`).
- Inclua `versao` no objeto quando o formato puder evoluir.
- Se um caminho precisar de filtro, promova a coluna ou crie índice de expressão (ver `banco-performance`).

## 9. Relações e exclusão

| Relação | onDelete |
|---|---|
| Venda → itens (composição, mas histórico fiscal) | `Restrict`; venda se cancela, não se apaga |
| Carrinho temporário → itens | `Cascade` aceitável |
| Produto → itens de venda | `Restrict` |
| Tenant → dados | `Restrict`; exclusão de tenant é processo (job) com exportação e retenção |
| Usuário → sessões | `Cascade` |
| Registro opcional (vendedor da venda) | `SetNull` se a coluna for anulável e perder a referência for aceitável |

`Cascade` em cadeia longa (tenant → loja → venda → item) transforma um clique em perda de dados irreversível.

## 10. Naming

Escolha um padrão e siga o que já existe no projeto:
- Tabelas: snake_case plural (`itens_venda`, `movimentos_estoque`).
- Colunas: snake_case; FK como `<entidade>_id`; instante como `<verbo>_em` ou `<verbo>_at` (um só padrão); unidade no sufixo (`_centavos`, `_kg`).
- Booleanos: `ativo`, `is_*` ou `tem_*`, um só padrão.
- Constraints: `<tabela>_<colunas>_key` (unique), `_fkey`, `_check`, `_idx`, `_pkey` (o padrão do Prisma).
- Prisma: modelos em PascalCase singular, campos camelCase, com `@map`/`@@map` para o nome físico.

## 11. Checklist rápido para tabela nova

1. `id`, `tenant_id NOT NULL`, `created_at`, `updated_at`.
2. Todas as referências com FK (composta com tenant quando aplicável) e índice.
3. Unicidades de negócio com `tenant_id`.
4. CHECKs de faixa e coerência.
5. Tipos: dinheiro inteiro/numeric, instantes timestamptz.
6. Snapshot de valores históricos.
7. Política de exclusão (Restrict, soft delete, anonimização) definida.
8. Comentários `///` para regras que só existem no SQL.
9. Teste de integração (Testcontainers) que prove pelo menos uma constraint crítica recusando dado inválido.
