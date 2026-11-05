# Privilégios, RLS, auditoria e cifra de colunas

Referência aprofundada da skill `banco-seguranca-operacao`. Leia quando for criar ou revisar papéis e grants, `DATABASE_URL`, policies RLS, integração do tenant com Prisma, views e funções, trilha de auditoria, timeouts por papel ou cifra de colunas.

Os exemplos assumem PostgreSQL 15+, schema `public` e um banco por ambiente. Em banco gerenciado, o usuário inicial costuma ser administrador: use-o apenas para criar os papéis abaixo e guarde a credencial dele fora do alcance da aplicação. Alguns provedores restringem atributos (por exemplo, não permitem criar papéis com `BYPASSRLS`); adapte e registre a limitação.

## 1. Modelo de papéis

| Papel | Uso | Pode |
|---|---|---|
| `app_owner` (NOLOGIN) | Dono dos objetos do schema | Tudo no schema; ninguém conecta como ele |
| `app_migrator` | `prisma migrate deploy` no pipeline | Membro de `app_owner`; DDL |
| `app_runtime` | Aplicação (web, API, workers do tenant) | DML nas tabelas do app, sujeito a RLS |
| `app_readonly` | Relatórios, BI, suporte | `SELECT`, sujeito a RLS ou a views específicas |
| `app_jobs_global` (opcional) | Jobs que atravessam tenants (cobrança, retenção) | DML necessário; RLS contornado por policy própria ou `BYPASSRLS`, com credencial separada |

Pessoas usam papéis nominais (`joao_ro`) membros de `app_readonly`; acesso de escrita em produção é exceção registrada.

## 2. SQL de criação

```sql
-- executado uma vez por ambiente, com o usuário administrador do provedor
CREATE ROLE app_owner NOLOGIN;
CREATE ROLE app_migrator LOGIN PASSWORD :'senha_migrator' IN ROLE app_owner;
CREATE ROLE app_runtime  LOGIN PASSWORD :'senha_runtime'  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 60;
CREATE ROLE app_readonly LOGIN PASSWORD :'senha_readonly' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 10;

-- banco e schema
REVOKE ALL ON DATABASE app FROM PUBLIC;
GRANT CONNECT ON DATABASE app TO app_migrator, app_runtime, app_readonly;

ALTER SCHEMA public OWNER TO app_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;          -- PG15+ já remove CREATE de PUBLIC; explícito não custa
GRANT USAGE ON SCHEMA public TO app_runtime, app_readonly;

-- objetos existentes
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;

-- objetos futuros criados pelas migrations (como app_owner)
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO app_readonly;

-- limites por papel
ALTER ROLE app_runtime  SET statement_timeout = '15s';
ALTER ROLE app_runtime  SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE app_runtime  SET lock_timeout = '5s';
ALTER ROLE app_readonly SET statement_timeout = '120s';
ALTER ROLE app_readonly SET default_transaction_read_only = on;
```

Pontos:
- As migrations devem criar objetos com dono `app_owner`. Inclua `SET ROLE app_owner;` no início da sessão de migration ou configure o papel padrão de `app_migrator` (`ALTER ROLE app_migrator SET role = 'app_owner';`) e confirme o comportamento no seu fluxo.
- `CONNECTION LIMIT` coerente com o pool: `instâncias x conexões por instância` do app abaixo do limite.
- Os valores de timeout são ponto de partida; relatório pesado usa papel próprio, não aumenta o timeout do app.
- `:'senha_...'` é sintaxe de variável do `psql`; nunca escreva senha literal em arquivo versionado.

### Auditar o estado atual
```sql
-- papéis com login e atributos perigosos
SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolconnlimit
FROM pg_roles WHERE rolcanlogin ORDER BY rolname;

-- dono de cada tabela (não pode ser app_runtime)
SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- grants por tabela para o app e para PUBLIC
SELECT grantee, table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('app_runtime', 'PUBLIC')
GROUP BY grantee, table_name ORDER BY table_name;

-- tabelas sem RLS ou sem FORCE
SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS force
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);
```

## 3. Prisma com duas credenciais

- A aplicação usa `DATABASE_URL` com `app_runtime`.
- O pipeline roda `prisma migrate deploy` com a credencial de `app_migrator`, numa variável que só existe no ambiente de deploy.
- Como ligar isso depende da versão do Prisma: em versões com `directUrl` no bloco `datasource`, o CLI de migrations usa `directUrl`; em versões com `prisma.config.ts`, a URL do CLI é definida no arquivo de configuração, separada da conexão do runtime (driver adapter). Leia a configuração do projeto antes de alterar.
- `prisma migrate dev` (local) precisa criar shadow database: localmente o usuário pode ter `CREATEDB`; em ambientes compartilhados, nunca.
- Valide no boot que a URL de runtime não é a do migrador (por exemplo, comparando o usuário da URL com uma lista proibida) e que tem TLS.

## 4. Row Level Security por tenant

### 4.1 Policies
```sql
-- para cada tabela com tenant_id (gere via migration)
ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas FORCE ROW LEVEL SECURITY;  -- aplica também ao dono da tabela

CREATE POLICY vendas_isolamento_tenant ON vendas
  FOR ALL
  TO app_runtime, app_readonly
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```
Por que assim:
- `current_setting(..., true)` retorna NULL se o parâmetro não foi definido; `tenant_id = NULL` é nulo, nenhuma linha passa: falha fechada.
- Cuidado: se o parâmetro foi definido antes na sessão como string vazia, `''::uuid` gera erro; isso também falha fechado, mas vira erro 500. Defina sempre um valor válido.
- `WITH CHECK` impede inserir ou mover linha para outro tenant.
- `FORCE` faz o dono da tabela também respeitar a policy; superusuários e papéis `BYPASSRLS` continuam ignorando RLS, por isso o app nunca pode ser um deles.
- Sem policy e com RLS habilitado, nada é visível (negação padrão).
- Consequência do `FORCE` para migrations: um backfill (`UPDATE`) executado como `app_owner` não enxerga nenhuma linha, porque a policy acima não se aplica a esse papel, e termina "com sucesso" afetando 0 linhas. Rode backfills com papel `BYPASSRLS` dedicado ou definindo `app.tenant_id` por lote, e confira o número de linhas afetadas.

Tabela sem `tenant_id` direto (se existir) usa policy com subconsulta ao pai; prefira ter `tenant_id` em toda tabela (ver `banco-modelagem`), o que torna a policy simples e indexável.

### 4.2 Definir o tenant a partir do Prisma
A configuração precisa valer na mesma conexão e transação das queries. Com pooler em modo transação (PgBouncer, Prisma Accelerate), `SET` de sessão vaza para outro cliente ou se perde; use `set_config(..., true)` (local à transação).

Opção A: dentro do use case, em transação interativa.
```ts
export async function registrarVenda(ctx: ContextoTenant, entrada: EntradaVenda) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`;
    // todas as queries daqui em diante estão sob a policy do tenant
    const venda = await tx.venda.create({ data: { tenantId: ctx.tenantId, /* ... */ } });
    return venda;
  });
}
```

Opção B: Prisma Client extension que envolve cada operação numa transação em lote com o `set_config` (padrão usado no exemplo oficial de RLS do Prisma).
```ts
import { Prisma, PrismaClient } from '@prisma/client';

export function prismaDoTenant(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends(
    Prisma.defineExtension((client) =>
      client.$extends({
        query: {
          $allModels: {
            async $allOperations({ args, query }) {
              const [, resultado] = await client.$transaction([
                client.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`,
                query(args),
              ]);
              return resultado;
            },
          },
        },
      }),
    ),
  );
}
```
Limitações da opção B:
- Cada operação vira uma transação (custo extra de BEGIN/COMMIT).
- Não compõe com `$transaction` interativa: dentro dela, use a opção A.
- Confirme a assinatura exata de extensions na versão do Prisma do projeto e cubra com teste.

Em qualquer opção, o `where: { tenantId }` continua nas queries: RLS é segunda linha de defesa, não a primeira.

### 4.3 Testar o isolamento
Teste de integração (Testcontainers) conectado como `app_runtime`, sem filtro de tenant na query, para provar que a policy bloqueia:
```ts
it('[CA-5] RLS impede leitura de vendas de outro tenant mesmo sem filtro na query', async () => {
  await semearVenda({ tenantId: tenantB });
  const vendas = await prismaRuntime.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA}, true)`;
    return tx.venda.findMany(); // sem where de propósito
  });
  expect(vendas.every((v) => v.tenantId === tenantA)).toBe(true);
  expect(vendas.some((v) => v.tenantId === tenantB)).toBe(false);
});

it('[CA-5] sem tenant definido, nenhuma linha é visível', async () => {
  const vendas = await prismaRuntime.$transaction((tx) => tx.venda.findMany());
  expect(vendas).toHaveLength(0);
});
```
No `psql`: `SET ROLE app_runtime; SELECT set_config('app.tenant_id', '<uuid>', false); SELECT count(*) FROM vendas;`.

### 4.4 Jobs que atravessam tenants
- Preferência: iterar por tenant, definindo `app.tenant_id` a cada lote, com o papel normal.
- Quando precisar ver tudo (retenção, faturamento): papel `app_jobs_global` com credencial própria, usado só pelo processo do job, com policy específica ou `BYPASSRLS`, e registro em auditoria.
- Nunca `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` para rodar um job.

## 5. Views, funções e extensões

- View roda com os privilégios do dono e, por padrão, ignora RLS de quem consulta. No PG15+, crie com `WITH (security_invoker = true)`:
  ```sql
  CREATE VIEW vendas_resumo WITH (security_invoker = true) AS
    SELECT tenant_id, date_trunc('day', created_at) AS dia, sum(total_centavos) AS total
    FROM vendas GROUP BY 1, 2;
  ```
- View materializada não tem RLS: filtre por tenant na leitura e restrinja o acesso a ela.
- Função `SECURITY DEFINER` executa como o dono: fixe `search_path` e restrinja quem executa.
  ```sql
  CREATE FUNCTION fechar_caixa(p_caixa_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = pg_catalog, public
  AS $$ BEGIN /* ... */ END $$;
  REVOKE EXECUTE ON FUNCTION fechar_caixa(uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION fechar_caixa(uuid) TO app_runtime;
  ```
- Extensões: criadas pela migration (`app_migrator`), só as necessárias (`pgcrypto`, `pg_trgm`, `citext`), cada uma justificada na spec. Extensões que leem arquivos ou fazem rede (`dblink`, `postgres_fdw`, `file_fdw`) exigem justificativa forte.

## 6. Trilha de auditoria append-only

```sql
CREATE TABLE auditoria (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    uuid        NOT NULL,
  ator_id      uuid,
  acao         text        NOT NULL,          -- ex.: 'produto.preco_alterado'
  entidade     text        NOT NULL,
  entidade_id  text        NOT NULL,
  antes        jsonb,
  depois       jsonb,
  ip           inet,
  correlation_id text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

REVOKE UPDATE, DELETE, TRUNCATE ON auditoria FROM app_runtime;
GRANT INSERT, SELECT ON auditoria TO app_runtime;

-- defesa extra contra UPDATE/DELETE por qualquer papel; quem é dono pode remover o trigger, por isso a cópia externa abaixo
CREATE FUNCTION auditoria_imutavel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'auditoria é somente inserção';
END $$;
CREATE TRIGGER auditoria_sem_update_delete
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_imutavel();
```
- Grave na mesma transação da ação auditada.
- `antes`/`depois` sem senha, token, cartão ou documento em claro; mascare.
- Retenção da auditoria definida (e expurgo feito por papel próprio, não pelo app).
- Para cópia fora do alcance de quem controla o banco, exporte periodicamente para armazenamento com imutabilidade (object lock).

## 7. Cifra de colunas e hash para busca

### 7.1 Decidir
| Dado | Tratamento |
|---|---|
| Senha de usuário | Hash Argon2id/bcrypt na aplicação (ver `backend-seguranca`) |
| Token de API de terceiro (gateway, fiscal, marketplace) | Cifra na aplicação; nunca em log |
| CPF/CNPJ de cliente pessoa física, RG | Cifra + HMAC para busca, se o fluxo precisa ler; senão só HMAC |
| Certificado digital (A1) e senha dele | Cifra com chave dedicada; preferir cofre/KMS |
| Cartão | Não armazenar; token do gateway |
| E-mail e telefone | Avaliar: normalmente em claro com controle de acesso; cifrar se a classificação exigir |

### 7.2 Cifra na aplicação (AES-256-GCM)
```ts
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

type Chaves = { atual: number; porVersao: Map<number, Buffer>; lookup: Buffer }; // chaves de 32 bytes vindas de KMS/cofre

export function cifrar(texto: string, chaves: Chaves, contexto: string): string {
  const chave = chaves.porVersao.get(chaves.atual);
  if (!chave) throw new Error('Chave atual ausente');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', chave, iv);
  cipher.setAAD(Buffer.from(contexto)); // ex.: `${tenantId}:clientes.cpf` impede mover o valor para outra linha/coluna
  const dados = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return [`v${chaves.atual}`, iv.toString('base64'), cipher.getAuthTag().toString('base64'), dados.toString('base64')].join(':');
}

export function decifrar(valor: string, chaves: Chaves, contexto: string): string {
  const [versao, iv, tag, dados] = valor.split(':');
  if (!versao || !iv || !tag || !dados) throw new Error('Formato inválido');
  const chave = chaves.porVersao.get(Number(versao.slice(1)));
  if (!chave) throw new Error('Versão de chave desconhecida');
  const decipher = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(contexto));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dados, 'base64')), decipher.final()]).toString('utf8');
}

export function hashLookup(valorNormalizado: string, chaves: Chaves): string {
  return createHmac('sha256', chaves.lookup).update(valorNormalizado).digest('hex');
}
```
- IV aleatório por valor, nunca reutilizado com a mesma chave.
- Versão da chave no valor permite rotação: novas escritas com a chave nova; job re-cifra as antigas em lotes.
- Chave de cifra e chave de lookup diferentes, fora do banco e fora da `DATABASE_URL`.
- Coluna de lookup com índice único por tenant: `@@unique([tenantId, cpfHash])`.
- Não use biblioteca de cripto caseira nem modos sem autenticação (CBC sem MAC, ECB).

### 7.3 pgcrypto
`pgp_sym_encrypt(dado, chave)` cifra dentro do banco, mas a chave vai no texto da query: aparece em `pg_stat_statements`, em logs de query lenta e em `auto_explain`. Use só quando a cifra no banco for requisito e com parâmetros (nunca literal), logs revisados e chave vinda de fora. `crypt()`/`gen_salt('bf')` para senha é aceitável, mas prefira hash na aplicação por consistência.

## 8. Rede, TLS e autenticação

- Rede privada do provedor entre app e banco; desative o endpoint público se não for necessário.
- Se houver endpoint público: allowlist de IPs (CI, bastion), nunca `0.0.0.0/0`.
- `sslmode=verify-full` com `sslrootcert` da CA do provedor verifica cadeia e hostname; `require` só cifra.
- Em servidor próprio: `pg_hba.conf` com `hostssl ... scram-sha-256`, sem `trust`, sem `host` (não TLS) para redes externas; `password_encryption = scram-sha-256`.

## 9. Rotação de credenciais

Sem downtime, com dois usuários alternados:
1. `app_runtime_a` em uso. Crie/reative `app_runtime_b` com os mesmos grants (ambos membros de um papel de grupo `app_runtime_grupo` que recebe os grants).
2. Atualize o segredo da aplicação para `app_runtime_b` e faça deploy.
3. Confirme em `pg_stat_activity` que ninguém mais conecta como `app_runtime_a`.
4. `ALTER ROLE app_runtime_a NOLOGIN;` e troque a senha dele para a próxima rotação.

Rotação imediata (vazamento): troque a senha, faça deploy, encerre sessões antigas (`pg_terminate_backend`) e investigue acessos no período.

## 10. Logs e pgaudit

- `log_connections`/`log_disconnections` ligados em produção.
- `log_min_duration_statement` com cuidado: parâmetros podem conter dado pessoal. Trate o destino do log como sensível (retenção, acesso).
- Evite `log_statement = 'all'` em produção.
- `pgaudit` (se o provedor oferecer): `pgaudit.log = 'ddl, role'` no mínimo; `write` para tabelas críticas se o volume permitir.
- Alertas: login falho repetido, criação de papel, `ALTER ROLE`, DDL fora de janela de deploy.
