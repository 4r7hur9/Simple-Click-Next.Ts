# Migrations seguras e expand/contract

Referência aprofundada da skill `banco-modelagem`. Leia quando a task gerar migration, alterar ou remover coluna existente, adicionar NOT NULL, FK, UNIQUE ou índice em tabela com dados, fazer backfill, ou quando uma migration falhar em algum ambiente.

Premissa: durante o deploy, a versão antiga e a nova do app rodam ao mesmo tempo contra o mesmo banco (rolling deploy, várias instâncias, funções serverless em cache). Toda migration precisa ser compatível com as duas versões.

## 1. Ciclo com Prisma

1. Altere o `schema.prisma`.
2. `npx prisma migrate dev --create-only --name <verbo_objeto>` gera o SQL sem aplicar.
3. Leia o SQL. Procure: `DROP`, `ALTER COLUMN ... TYPE`, `SET NOT NULL`, `CREATE INDEX` sem `CONCURRENTLY`, `ADD CONSTRAINT ... FOREIGN KEY` sem `NOT VALID`, `RENAME`.
4. Complete com o que o Prisma não gera: CHECK, índice parcial, `NOT VALID`/`VALIDATE`, `SET lock_timeout`.
5. `npx prisma migrate dev` aplica localmente e regenera o client.
6. Rode os testes de integração contra banco criado só pelas migrations (Testcontainers), nunca por `db push`.
7. Commit do `schema.prisma` e da pasta da migration juntos.
8. Produção e staging: `npx prisma migrate deploy` no pipeline ou no comando de pré-deploy do provedor, antes da nova versão do app receber tráfego.

Proibido fora do ambiente local: `prisma migrate dev`, `prisma migrate reset`, `prisma db push`.

Nunca edite migration aplicada em qualquer ambiente compartilhado. O Prisma guarda checksum em `_prisma_migrations`; editar gera erro de drift ou, pior, ambientes com schemas diferentes.

### Migration falhou
- `prisma migrate deploy` para e marca a migration como falha. As seguintes não rodam.
- Não assuma atomicidade: parte do SQL pode ter sido aplicada. Inspecione o banco.
- Corrija o estado à mão (desfazendo o parcial ou completando), depois `prisma migrate resolve --rolled-back <nome>` (para reaplicar) ou `--applied <nome>` (se você completou manualmente).
- Prefira SQL reexecutável quando fizer sentido: `IF NOT EXISTS`, `IF EXISTS`.

### Rollback
- O Prisma não tem migration "down" nativa. A estratégia padrão é forward-fix: nova migration que corrige.
- Por isso toda migration deve ser pequena e compatível com a versão anterior do app: se o app novo falhar, volta-se o app, não o banco.
- Antes de migration destrutiva (contract), confirme backup recente e testado (ver `banco-seguranca-operacao`).

## 2. Locks: o que trava o quê

No PostgreSQL, a maioria dos `ALTER TABLE` pega `ACCESS EXCLUSIVE`, que bloqueia até leituras. Se for rápido (só metadado), tudo bem. O perigo é quando ele é demorado ou fica na fila.

| Operação | Custo | Seguro em tabela grande? |
|---|---|---|
| `ADD COLUMN` anulável sem default | Metadado | Sim |
| `ADD COLUMN ... DEFAULT <constante>` (PG11+) | Metadado | Sim |
| `ADD COLUMN ... DEFAULT <volátil>` (`gen_random_uuid()`, `clock_timestamp()`) | Reescreve a tabela | Não: adicione sem default, faça backfill |
| `ALTER COLUMN TYPE` | Em geral reescreve tabela e índices | Não, exceto conversões binárias (`varchar(n)` para `varchar(m>n)` ou `text`) |
| `SET NOT NULL` | Varre a tabela sob `ACCESS EXCLUSIVE` | Só com CHECK validado antes (PG12+) |
| `ADD CONSTRAINT CHECK` | Varre sob lock | Use `NOT VALID` + `VALIDATE` |
| `ADD FOREIGN KEY` | Varre e trava as duas tabelas | Use `NOT VALID` + `VALIDATE` |
| `CREATE INDEX` | Bloqueia escrita durante toda a criação | Use `CONCURRENTLY` |
| `ADD CONSTRAINT UNIQUE` | Cria índice bloqueando escrita | Crie índice único `CONCURRENTLY` e depois `USING INDEX` |
| `DROP COLUMN` | Metadado | Sim, mas só no contract |
| `RENAME COLUMN/TABLE` | Metadado | Quebra a versão antiga do app: só via expand/contract |
| `ALTER TYPE ... ADD VALUE` (enum) | Barato | Sim; o valor novo não pode ser usado na mesma transação |

### Fila de locks
Mesmo uma operação de metadado espera um `SELECT` longo terminar. Enquanto espera, todas as queries novas na tabela entram na fila atrás dela: o PDV para. Defina `lock_timeout` para a migration desistir em vez de derrubar o sistema:

```sql
SET lock_timeout = '5s';
SET statement_timeout = '60s';
ALTER TABLE vendas ADD COLUMN canal text;
```

Se estourar o timeout, a migration falha de forma limpa e pode ser reexecutada em horário de menor uso.

## 3. Receitas

### 3.1 NOT NULL em coluna existente, sem travar
```sql
-- migration A (expand): coluna anulável; app novo passa a preencher em toda escrita
ALTER TABLE vendas ADD COLUMN canal text;

-- backfill em lotes (script/job, ver 3.6)

-- migration B: só cria a regra, sem varrer (lock curto)
SET lock_timeout = '5s';
ALTER TABLE vendas ADD CONSTRAINT vendas_canal_not_null CHECK (canal IS NOT NULL) NOT VALID;
```
```sql
-- migration C (arquivo separado): valida e promove a NOT NULL
-- O Prisma executa cada migration.sql numa transação implícita: se o VALIDATE
-- estivesse no mesmo arquivo do ADD ... NOT VALID, o ACCESS EXCLUSIVE do ADD
-- ficaria segurado durante a varredura inteira.
ALTER TABLE vendas VALIDATE CONSTRAINT vendas_canal_not_null;  -- SHARE UPDATE EXCLUSIVE: não bloqueia leitura nem escrita
ALTER TABLE vendas ALTER COLUMN canal SET NOT NULL;            -- PG12+: usa o CHECK validado e não varre
ALTER TABLE vendas DROP CONSTRAINT vendas_canal_not_null;
```

### 3.2 FK nova em tabela com dados
```sql
-- migration 1: cria a FK sem varrer
SET lock_timeout = '5s';
ALTER TABLE itens_venda
  ADD CONSTRAINT itens_venda_produto_fkey
  FOREIGN KEY (tenant_id, produto_id) REFERENCES produtos (tenant_id, id) NOT VALID;
```
```sql
-- migration 2 (arquivo separado, pelo mesmo motivo de 3.1): valida sem bloquear escrita
ALTER TABLE itens_venda VALIDATE CONSTRAINT itens_venda_produto_fkey;
```
Se `VALIDATE` falhar, há órfãos: corrija os dados (ou decida o que fazer com eles na spec) antes de validar.

### 3.3 Índice e unicidade em tabela grande
```sql
-- migration própria, com este único statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS vendas_tenant_created_idx ON vendas (tenant_id, created_at DESC);
```
```sql
-- unicidade sem bloquear escrita
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS clientes_tenant_email_key ON clientes (tenant_id, email_normalizado);
-- em migration seguinte (opcional, se quiser a constraint nomeada):
ALTER TABLE clientes ADD CONSTRAINT clientes_tenant_email_key UNIQUE USING INDEX clientes_tenant_email_key;
```
Cuidados:
- `CONCURRENTLY` não roda dentro de bloco de transação. Coloque-o sozinho em uma migration e confirme localmente que o Prisma o executa sem erro de transação.
- Se falhar no meio, sobra um índice `INVALID`. Verifique com `SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;`, faça `DROP INDEX CONCURRENTLY` e recrie.
- Declare o índice também no `schema.prisma` (`@@index`) para não haver drift.
- Em tabela pequena (milhares de linhas) o `CREATE INDEX` comum é aceitável; registre essa decisão.

### 3.4 Renomear coluna (expand/contract)
Exemplo: `clientes.fone` para `clientes.telefone`.

| Passo | Deploy | Banco | App |
|---|---|---|---|
| 1 Expand | N | `ADD COLUMN telefone text` | Escreve em `fone` e `telefone`; lê de `fone` |
| 2 Backfill | (job) | `telefone = fone` em lotes | Igual |
| 3 Migrar leitura | N+1 | (opcional) CHECK/NOT NULL em `telefone` | Lê de `telefone`; ainda escreve nas duas |
| 4 Parar escrita antiga | N+2 | Nenhuma | Só usa `telefone`; `fone` fora do schema do app |
| 5 Contract | N+3 | `DROP COLUMN fone` | Igual |

No Prisma, durante os passos 1 a 3 as duas colunas estão no `schema.prisma`. No passo 4 remova `fone` do schema criando a migration com `--create-only` e apague o `DROP` do SQL gerado se ainda for cedo para o contract, ou deixe o `DROP` para a migration do passo 5.

Atalho aceitável quando a spec permite janela de manutenção ou a tabela não é usada pela versão em produção: documente a decisão na spec e no pacote de provas.

### 3.5 Mudar tipo de coluna
Exemplo: `preco numeric(10,2)` para `preco_centavos integer`.
1. Expand: `ADD COLUMN preco_centavos integer`; app escreve nas duas (`Math.round` sobre Decimal, nunca float).
2. Backfill: `UPDATE ... SET preco_centavos = round(preco * 100)::int` em lotes.
3. Validação: CHECK `NOT VALID` + `VALIDATE`, depois `SET NOT NULL`.
4. App lê só a nova.
5. Contract: `DROP COLUMN preco` em deploy posterior.

### 3.6 Backfill em lotes
Nunca um `UPDATE` único em milhões de linhas: segura locks de linha por muito tempo, gera WAL enorme, incha a tabela e pode travar a replicação.

```ts
// script/job idempotente, executado fora da migration
async function backfillTelefone(prisma: PrismaClient) {
  const LOTE = 5000;
  for (;;) {
    const n = await prisma.$executeRaw`
      UPDATE clientes SET telefone = fone
      WHERE id IN (
        SELECT id FROM clientes
        WHERE telefone IS NULL AND fone IS NOT NULL
        LIMIT ${LOTE}
      )`;
    if (n === 0) break;
    await new Promise((r) => setTimeout(r, 200)); // alivia I/O e replicação
  }
}
```
- Idempotente: pode ser interrompido e reexecutado.
- Condição de parada baseada no dado, não em contagem prévia.
- Para tabelas pequenas, o backfill pode ficar dentro da migration.
- Backfill que depende de regra de negócio complexa usa o código do domínio (use case), não SQL duplicado.

### 3.7 Remover tabela ou coluna
1. App deixa de ler e escrever (deploy N).
2. Confirme em logs/`pg_stat_user_tables` que não há acesso.
3. Backup confirmado.
4. `DROP` em deploy posterior (N+1).

### 3.8 Enum: remover ou renomear valor
Não há `DROP VALUE`. Caminho: criar tipo novo, coluna nova do tipo novo, backfill com mapeamento, trocar leitura, remover coluna antiga e tipo antigo. Alternativa: migrar a coluna para `text` + CHECK, que é mais fácil de evoluir.

## 4. Ordem de deploy

- Migrations rodam antes do app novo receber tráfego (comando de pré-deploy no Railway, etapa do pipeline antes do deploy no Vercel ou equivalente).
- A migration de N é compatível com o app N-1 (expand) e o app N é compatível com o schema N (óbvio) e, se possível, com N-1 para permitir rollback do app.
- Contract nunca no mesmo deploy do expand.
- Um job de backfill longo não bloqueia o deploy: roda depois, e o passo seguinte só entra quando ele terminar (registre no card).

## 5. Revisão de uma migration: perguntas

1. O SQL tem `DROP`, `RENAME`, `TYPE`, `SET NOT NULL`, `CREATE INDEX`, `FOREIGN KEY` ou `UNIQUE`? Cada um segue a receita acima?
2. A versão atual do app em produção continua funcionando com o schema novo?
3. Qual o tamanho da tabela em produção? (Se desconhecido, trate como grande.)
4. Tem `lock_timeout`?
5. O `schema.prisma` bate com o SQL (sem drift)?
6. Há backfill? Ele é idempotente e em lotes?
7. Alguma migration antiga foi alterada? (`git diff --stat -- prisma/migrations` só deve mostrar pastas novas.)
8. Os testes de integração rodam sobre banco criado pelas migrations?
