---
name: banco-seguranca-operacao
description: "Hardening e operação do PostgreSQL: papéis separados (migração, aplicação, leitura) com menor privilégio, rede privada e TLS verificado, RLS por tenant como segunda linha de defesa, cifra de colunas sensíveis e HMAC para busca, cartão nunca armazenado, auditoria append-only, timeouts por papel, backup criptografado com PITR e restore testado, dados anonimizados fora de produção, rotação de credenciais e exclusão LGPD no banco. Use quando o diff mexer em DATABASE_URL, GRANT/ROLE, policies RLS, extensões, dados pessoais ou de pagamento, auditoria, seed, dump ou retenção. Não use para IDOR e SQL injection na aplicação (use backend-seguranca) nem para pipeline e logs (use devops-observabilidade-lgpd)."
---

# Banco: segurança e operação

Objetivo: mesmo que a aplicação tenha uma falha, o banco limita o estrago (quem pode ler e alterar o quê, de onde, por quanto tempo) e os dados podem ser recuperados e apagados quando precisam. O `implementer` e o `fixer` seguem "Regras" e "Como construir" ao mexer em conexão, papéis, migrations de segurança e dados sensíveis; o `security-reviewer` usa o "Checklist de revisão" para gerar findings com a severidade padrão.

Exemplos em PostgreSQL 15+ e Prisma, com deploy em PaaS (Railway/Vercel). Em outro stack ou banco gerenciado, aplique o equivalente com os recursos do provedor.

Todo trabalho aqui é defensivo e no próprio projeto. Teste de invasão contra o banco segue `auditoria-seguranca-pentest`.

## Regras inegociáveis

1. **A aplicação conecta com papel próprio sem `SUPERUSER`, `BYPASSRLS`, `CREATEROLE`, `CREATEDB` e sem ser dono das tabelas.** Uma SQL injection com superuser vira leitura de arquivos, execução de comando e `DROP DATABASE`.
2. **Migrations rodam com credencial separada da aplicação (dona do schema); leitura analítica usa papel só leitura.** Separar DDL de DML impede que um bug do app altere estrutura e limita o raio de cada segredo.
3. **Banco fora da internet pública: rede privada do provedor ou allowlist de IP; conexão sempre com TLS verificado (`sslmode=verify-full` quando o provedor fornece a CA).** Banco exposto com senha é alvo de força bruta; TLS sem verificação aceita intermediário.
4. **Credenciais de banco só em variáveis de ambiente/cofre, diferentes por ambiente, nunca no repositório, em log ou em mensagem de erro.** Uma `DATABASE_URL` vazada é acesso total aos dados de todos os tenants.
5. **Tabelas multi-tenant com RLS habilitado e `FORCE`, policy por `tenant_id` lido de configuração da transação, falhando fechado.** É a segunda linha de defesa: um `where` esquecido na aplicação não vaza dado de outro tenant.
6. **Número de cartão, CVV e trilha nunca são armazenados; só token do gateway, bandeira e últimos 4 dígitos.** Guardar PAN coloca o sistema inteiro no escopo PCI-DSS e transforma vazamento em fraude.
7. **Senha e segredo verificável só como hash forte (Argon2id/bcrypt); dado sensível que precisa ser lido volta cifrado com chave fora do banco.** Dump roubado não pode revelar senhas, documentos ou tokens de integração.
8. **Busca por dado cifrado usa hash com chave (HMAC) em coluna separada, nunca descriptografia em massa nem cifra determinística caseira.** Descriptografar a tabela para achar um CPF expõe tudo e não escala.
9. **Backup automático, criptografado, com retenção definida, PITR em produção e restore testado periodicamente com evidência.** Backup nunca restaurado é hipótese; o dia do incidente não é o dia de descobrir que falha.
10. **Nenhum dado de produção em dev, staging, teste ou máquina local; use dados sintéticos ou cópia anonimizada irreversível.** Ambiente de desenvolvimento tem controles fracos e é a origem clássica de vazamento.
11. **Trilha de auditoria de ações sensíveis é append-only para o papel da aplicação (sem `UPDATE`/`DELETE`).** Quem invadiu não pode apagar o próprio rastro.
12. **Papel da aplicação tem `statement_timeout` e `idle_in_transaction_session_timeout`.** Uma query descontrolada ou transação esquecida não pode segurar locks e conexões indefinidamente.
13. **Exclusão ou anonimização por titular (LGPD) alcança todas as tabelas com dado pessoal e respeita retenção legal (ex.: fiscal).** Soft delete não é exclusão; dado esquecido em tabela lateral continua sendo dado pessoal.
14. **Views, funções `SECURITY DEFINER` e extensões novas passam por revisão de privilégio.** View ignora RLS por padrão (roda como o dono) e função `SECURITY DEFINER` sem `search_path` fixo é escalonamento de privilégio.

## Como construir

### Papéis e privilégios
- Três papéis de login: `app_migrator` (dono do schema, usado só pelo pipeline), `app_runtime` (DML nas tabelas do app), `app_readonly` (SELECT para relatórios/BI).
- `app_runtime` recebe `SELECT, INSERT, UPDATE, DELETE` nas tabelas e `USAGE, SELECT` nas sequences; nada de `TRUNCATE`, `REFERENCES`, `TRIGGER`, `CREATE`.
- `ALTER DEFAULT PRIVILEGES` para que tabelas criadas por migrations futuras já nasçam com os grants certos.
- `REVOKE` explícito de `UPDATE, DELETE` nas tabelas de auditoria para `app_runtime`.
- No Prisma, a URL da aplicação usa `app_runtime`; o comando `prisma migrate deploy` recebe outra URL (variável separada no pipeline ou configuração de datasource do Prisma, conforme a versão).
- SQL completo em [references/privilegios-rls.md](references/privilegios-rls.md).

### Rede e conexão
- PaaS: use a URL de rede privada entre serviços; desative o acesso público ao banco se ninguém de fora precisa; se precisa, restrinja por IP.
- `sslmode=verify-full` com o certificado da CA do provedor quando disponível; `require` só criptografa, não autentica o servidor.
- `password_encryption = scram-sha-256`; nada de `trust` ou `md5` em `pg_hba.conf` quando você controla o servidor.
- Acesso humano a produção: bastion/túnel, papel pessoal só leitura por padrão, sessão registrada.

### RLS
- Habilite em toda tabela com `tenant_id`: `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`.
- Policy `USING (tenant_id = current_setting('app.tenant_id', true)::uuid)` com `WITH CHECK` igual; sem configuração, a expressão é nula e nenhuma linha passa.
- Na aplicação, defina o tenant com `set_config('app.tenant_id', $1, true)` dentro da mesma transação das queries (compatível com pooler em modo transação).
- Jobs que atravessam tenants usam papel próprio e explícito, nunca desligam RLS do papel do app.
- RLS não substitui o filtro por tenant e a checagem de permissão na aplicação (ver `backend-seguranca`).

### Dados sensíveis
- Classifique colunas: pública, interna, pessoal, pessoal sensível, segredo. Registre com `///` no `schema.prisma`.
- Cifra na aplicação (AES-256-GCM via `node:crypto`, chave em KMS/cofre, versão da chave junto do dado) para documentos, tokens de integração e dados sensíveis que precisam ser lidos.
- `pgcrypto` é opção quando a cifra precisa ocorrer no banco, mas a chave trafega na query e pode aparecer em logs e `pg_stat_statements`; prefira cifrar na aplicação.
- Coluna de lookup: `cpf_hash = HMAC-SHA256(chave_lookup, cpf_normalizado)` com índice único por tenant.
- Minimização: não crie coluna para dado que o fluxo não usa.

### Auditoria
- Tabela `auditoria` com quem, quando, tenant, ação, entidade, id, antes/depois (sem segredo nem dado sensível em claro), IP e correlation id.
- Gravada na mesma transação da ação.
- `pgaudit` (quando o provedor permitir) para DDL, mudanças de papel e acesso administrativo.

### Operação
- `ALTER ROLE app_runtime SET statement_timeout = '15s'` e `idle_in_transaction_session_timeout = '30s'` (ajuste ao projeto); relatórios com papel e timeout próprios.
- `CONNECTION LIMIT` por papel para que um serviço não esgote o banco.
- Rotação de credenciais sem downtime: dois usuários alternados ou troca de senha com janela de convivência.
- Extensões: só as necessárias, criadas pelo `app_migrator`.
- Backup, PITR, restore testado e anonimização: [references/backup-e-restore.md](references/backup-e-restore.md).

### LGPD no banco
- Mapa de onde cada dado pessoal vive (tabelas, colunas, jsonb, logs, backups).
- Exclusão por titular: apagar onde não há obrigação de guarda; anonimizar (substituir por valor não identificável) onde há, como venda com obrigação fiscal.
- Retenção por tipo de dado com job agendado que apaga ou anonimiza vencidos.
- Registro de pedidos de exclusão para reaplicar após eventual restore de backup.
- Processo, base legal e direitos do titular: `devops-observabilidade-lgpd`.

## Checklist de revisão

Valores exatos para o campo severidade dos findings: `urgente`, `alto`, `medio`, `baixo`.

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | Credencial de banco (URL, senha) em código, arquivo versionado, log, erro ou variável `NEXT_PUBLIC_` | urgente |
| 2 | Coluna ou log com número de cartão, CVV ou trilha | urgente |
| 3 | Senha ou segredo verificável salvo em claro, com hash rápido (MD5, SHA-1/256 sem KDF) ou cifra reversível | urgente |
| 4 | Aplicação conectando com superuser, dono do schema ou papel com `BYPASSRLS` | urgente |
| 5 | `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`, `DROP POLICY` ou policy `USING (true)` em tabela de tenant sem justificativa na spec | urgente |
| 6 | Seed, fixture ou script que copia dump de produção para dev/staging/teste sem anonimização | urgente |
| 7 | Policy RLS que aceita tenant ausente (ex.: `coalesce` para todos) ou sem `WITH CHECK` em tabela gravável | alto |
| 8 | Tabela nova com `tenant_id` sem `ENABLE` + `FORCE ROW LEVEL SECURITY`, quando o projeto usa RLS | alto |
| 9 | `set_config('app.tenant_id', ...)` fora da transação das queries ou com `is_local = false` atrás de pooler | alto |
| 10 | Dado pessoal sensível ou documento (CPF, RG, dados de saúde, token de integração) em coluna sem cifra | alto |
| 11 | Busca de dado cifrado descriptografando a tabela ou com cifra determinística caseira em vez de HMAC | alto |
| 12 | Conexão sem TLS ou com `sslmode=disable`/`prefer` em produção | alto |
| 13 | Banco com acesso público sem allowlist ou exposto por proxy público sem necessidade | alto |
| 14 | `GRANT ALL`, `GRANT ... TO PUBLIC` ou grant de `TRUNCATE`/`CREATE` para o papel da aplicação | alto |
| 15 | Tabela de auditoria com `UPDATE`/`DELETE` permitidos ao papel da aplicação | alto |
| 16 | Função `SECURITY DEFINER` sem `SET search_path` fixo ou executável por `PUBLIC` | alto |
| 17 | View sobre tabela com RLS sem `security_invoker = true` (PG15+) acessível ao papel da aplicação | alto |
| 18 | Migration destrutiva (`DROP`, backfill que sobrescreve) sem backup confirmado antes | alto |
| 19 | Fluxo de exclusão de titular que ignora tabelas com dado pessoal ou só aplica soft delete | alto |
| 20 | Chave de cifra no mesmo banco ou na mesma variável que a `DATABASE_URL` | alto |
| 21 | Uso de `pgcrypto` com chave passada em literal na query (vaza em log e estatísticas) | medio |
| 22 | Papel da aplicação sem `statement_timeout`/`idle_in_transaction_session_timeout` | medio |
| 23 | Coluna nova de dado pessoal sem classificação e sem regra de retenção | medio |
| 24 | Extensão nova sem justificativa ou criada pelo papel da aplicação | medio |
| 25 | Log de query (`log_statement = all`, log de eventos do Prisma) com parâmetros pessoais em produção | medio |
| 26 | Job que atravessa tenants usando o papel da aplicação com RLS desligado em vez de papel próprio | medio |
| 27 | Restore não testado ou sem evidência recente quando a task mexe em backup/DR | medio |
| 28 | Mesmo usuário/senha de banco em mais de um ambiente | medio |
| 29 | Dado sensível em `jsonb` genérico (payload bruto de terceiro) sem mascaramento | medio |
| 30 | Grants sem `ALTER DEFAULT PRIVILEGES` (tabelas futuras nascem sem ou com privilégio errado) | baixo |

## Anti-padrões (errado → certo)

### Conexão da aplicação
```ts
// errado: superuser, sem TLS, mesma URL para migrations e app
// DATABASE_URL=postgresql://postgres:senha@db.exemplo.com:5432/app

// certo: papel mínimo, rede privada, TLS verificado; migrations com outra variável
// DATABASE_URL=postgresql://app_runtime:<segredo>@db.internal:5432/app?sslmode=verify-full&sslrootcert=/etc/ssl/ca.pem
// MIGRATION_DATABASE_URL=postgresql://app_migrator:<outro-segredo>@db.internal:5432/app?sslmode=verify-full&sslrootcert=/etc/ssl/ca.pem
const Env = z.object({ DATABASE_URL: z.string().url().refine((u) => !u.includes('sslmode=disable')) });
```

### Tenant definido fora da transação
```ts
// errado: com pooler, o SET vai para uma conexão e as queries para outra
await prisma.$executeRaw`SET app.tenant_id = ${tenantId}`; // além disso, SET não aceita parâmetro
const vendas = await prisma.venda.findMany();

// certo: set_config local à transação, na mesma transação das queries
const [, vendas] = await prisma.$transaction([
  prisma.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`,
  prisma.venda.findMany({ where: { tenantId }, take: 50 }),
]);
```

### Cartão e segredos
```ts
// errado
await prisma.pagamento.create({ data: { vendaId, numeroCartao: body.cartao, cvv: body.cvv } });

// certo: o cartão vai direto do navegador ao gateway; o servidor recebe e guarda só o token
await prisma.pagamento.create({
  data: { tenantId, vendaId, gatewayToken: token.id, bandeira: token.brand, ultimos4: token.last4 },
});
```

### Busca por CPF cifrado
```ts
// errado: descriptografa todos os clientes para achar um
const todos = await prisma.cliente.findMany({ where: { tenantId } });
const cliente = todos.find((c) => decifrar(c.cpfCifrado) === cpf);

// certo: HMAC com chave de lookup, coluna indexada (tenant_id, cpf_hash)
const cpfHash = createHmac('sha256', chaves.lookup).update(normalizarCpf(cpf)).digest('hex');
const cliente = await prisma.cliente.findFirst({ where: { tenantId, cpfHash }, select: { id: true, nome: true } });
```

### Seed com dados reais
```ts
// errado: prisma/seed.ts importa dump de produção
await importarCsv('backups/clientes-prod.csv');

// certo: dados sintéticos determinísticos
import { fakerPT_BR as faker } from '@faker-js/faker';
faker.seed(42);
const clientes = Array.from({ length: 200 }, () => ({ tenantId, nome: faker.person.fullName(), email: faker.internet.email() }));
await prisma.cliente.createMany({ data: clientes });
```

## Referências

- [references/privilegios-rls.md](references/privilegios-rls.md) — leia quando for criar ou revisar papéis, grants, `DATABASE_URL`, policies RLS, integração do tenant com Prisma, views, funções `SECURITY DEFINER`, auditoria append-only, timeouts ou cifra de colunas.
- [references/backup-e-restore.md](references/backup-e-restore.md) — leia quando a task mexer em backup, PITR, DR, restore, migration destrutiva, cópia de dados entre ambientes, anonimização, seed, retenção ou exclusão de dados pessoais por titular.
