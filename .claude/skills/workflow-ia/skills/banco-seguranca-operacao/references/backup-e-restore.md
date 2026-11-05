# Backup, restore, dados fora de produção e retenção

Referência aprofundada da skill `banco-seguranca-operacao`. Leia quando a task mexer em backup, PITR, recuperação de desastre, restore, migration destrutiva, cópia de dados entre ambientes, anonimização, seed, retenção ou exclusão de dados pessoais por titular.

A estratégia geral de DR (RPO/RTO do produto, runbooks, alertas) está em `devops-observabilidade-lgpd`. Aqui o foco é o banco.

## 1. Conceitos

| Termo | Significado | Pergunta que responde |
|---|---|---|
| RPO | Quanto dado se aceita perder, em tempo | "Se o banco sumir agora, até quando conseguimos voltar?" |
| RTO | Quanto tempo até voltar a operar | "Quanto tempo o PDV fica parado?" |
| Backup lógico | `pg_dump`: SQL/arquivo com o conteúdo | Portável entre versões; restaura banco inteiro ou tabelas; lento em bases grandes |
| Backup físico + WAL | Cópia dos arquivos + log de transações contínuo | Permite PITR (voltar a qualquer instante dentro da janela) |
| Snapshot do provedor | Cópia do volume/disco num instante | Rápido; granularidade limitada ao horário do snapshot |
| PITR | Point-in-time recovery | "Volte ao estado de 14:32:10, antes do `DELETE` errado" |

Para um SaaS transacional (PDV, precificação), o mínimo razoável em produção é PITR com janela de alguns dias a semanas, mais cópias diárias retidas por mais tempo. Os números finais (RPO, RTO, retenção) são decisão do dono do produto e ficam registrados.

## 2. Política mínima

- Automático: nenhum backup depende de alguém lembrar.
- PITR em produção (nativo do provedor, ou WAL archiving com pgBackRest/WAL-G quando o banco é gerenciado por você).
- Cópia lógica periódica (`pg_dump`) guardada fora do provedor do banco, para portabilidade e proteção contra perda de conta.
- Criptografado em repouso e em trânsito; chave de cifra do backup separada da credencial do banco.
- Armazenamento com imutabilidade/retenção bloqueada (object lock) para resistir a ransomware e a erro humano.
- Cópia em outra região ou conta.
- Credenciais de backup distintas da aplicação; a aplicação não consegue apagar backups.
- Monitoramento: alerta se o último backup bem-sucedido for mais antigo que o esperado ou se o tamanho variar de forma anormal.
- Restore testado periodicamente (seção 5), com evidência.
- Retenção definida e compatível com a LGPD (seção 8).

Banco gerenciado em PaaS: confirme o que o provedor oferece de fato (snapshots agendados, PITR, janela, região, restauração para nova instância) e documente as lacunas. Se não houver PITR, complemente com `pg_dump` frequente para object storage e registre o RPO resultante.

## 3. Backup lógico com pg_dump

```bash
# formato custom: comprimido, permite restore seletivo e paralelo
pg_dump --format=custom --no-owner --no-privileges \
  --dbname="$BACKUP_DATABASE_URL" \
  --file="app-$(date -u +%Y%m%dT%H%M%SZ).dump"

# papéis (sem senhas) para reconstruir privilégios
pg_dumpall --roles-only --no-role-passwords --dbname="$BACKUP_ADMIN_URL" > roles.sql
```
- Use um papel de leitura dedicado ao backup, com `BYPASSRLS` e credencial restrita ao job de backup. Com `FORCE ROW LEVEL SECURITY`, nem o dono das tabelas escapa das policies, e o `pg_dump` falha em vez de gerar backup incompleto quando o RLS filtraria linhas.
- `pg_dump` gera snapshot consistente sem bloquear escrita, mas pesa em I/O; agende fora do pico.
- Cifre o arquivo antes de enviar (por exemplo com `age` ou `gpg`) ou envie para bucket com cifra no servidor e chave gerenciada; nunca bucket público.
- Registre tamanho, duração e checksum de cada backup.
- Versão do `pg_dump` igual ou maior que a do servidor.

Restore:
```bash
createdb --maintenance-db="$ADMIN_URL" app_restore
pg_restore --no-owner --no-privileges --jobs=4 --dbname="$RESTORE_URL" app-20260929T030000Z.dump
psql "$RESTORE_ADMIN_URL" -f roles.sql   # quando for recriar papéis
```

Restore seletivo (uma tabela):
```bash
pg_restore --list app.dump | grep 'TABLE DATA public produtos'
pg_restore --data-only --table=produtos --dbname="$RESTORE_URL" app.dump
```

## 4. PITR

Com provedor gerenciado: restaure para uma nova instância no instante desejado pelo painel/API. Nunca sobre a instância de produção em uso.

Com banco próprio (pgBackRest ou WAL-G): backup base periódico + arquivamento contínuo de WAL; restore com alvo de tempo (`recovery_target_time`) numa instância nova. Siga a documentação da ferramenta escolhida e mantenha o procedimento no runbook do projeto.

### Recuperar de um erro de dados (DELETE/UPDATE errado)
1. Anote o instante aproximado do erro (log da aplicação, auditoria, `pg_stat_statements` não ajuda aqui).
2. Restaure uma nova instância para alguns segundos antes do erro.
3. Extraia só as linhas afetadas da instância restaurada (`COPY ... TO`, `pg_dump --table` com filtro ou query).
4. Reaplique em produção por script revisado, em transação, respeitando o que mudou depois do erro (não sobrescreva vendas legítimas feitas no intervalo).
5. Registre o incidente, o impacto e a causa; adicione teste ou constraint que impeça a repetição.

Voltar a produção inteira para o passado descarta tudo que aconteceu depois: é a última opção.

## 5. Teste de restore (drill)

Frequência: pelo menos mensal, e sempre após mudar a estratégia de backup, a versão do PostgreSQL ou o provedor.

Procedimento:
1. Restaure o backup mais recente (e, em alternância, um PITR para instante arbitrário) num ambiente isolado, com os mesmos controles de acesso de produção: ele contém dados reais.
2. Verifique:
   - Última migration aplicada: `SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1;` bate com a produção.
   - Contagem de linhas das tabelas críticas comparada com a origem no instante do backup (tolerância documentada).
   - Somas de controle de negócio: `SELECT date_trunc('day', created_at) AS dia, count(*), sum(total_centavos) FROM vendas WHERE created_at >= now() - interval '7 days' GROUP BY 1 ORDER BY 1;`.
   - Aplicação sobe apontando para o restore em modo somente leitura e responde a um fluxo de leitura.
3. Meça o tempo total (início do restore até verificação ok): é o RTO real.
4. Registre a evidência: data, backup usado, tempos, resultados das verificações, responsável.
5. Destrua o ambiente restaurado e as credenciais temporárias.

Automatizar o drill (job agendado que restaura, verifica e reporta) é a melhor forma de garantir que ele acontece.

## 6. Antes de migration destrutiva ou operação de dados em massa

- Confirme backup recente bem-sucedido ou gere um sob demanda (snapshot do provedor ou `pg_dump` das tabelas afetadas).
- Anote no card o identificador do backup e o instante.
- Para `DELETE`/`UPDATE` em massa manual: rode primeiro o `SELECT` equivalente com contagem, depois o comando em transação, confira o `count` retornado e só então `COMMIT`.
- Contract de expand/contract só depois de confirmar que a coluna não é mais usada (ver `banco-modelagem`).

## 7. Dados fora de produção

Regra: dev, staging, CI, preview deployments e máquinas locais não recebem dados reais.

### 7.1 Dados sintéticos (padrão)
- `prisma/seed.ts` determinístico (seed fixa do gerador), com volume configurável para testes de performance.
- Casos de borda explícitos: tenant grande, produto sem estoque, venda cancelada, cliente com nome acentuado.
- Factories nos testes de integração criam o que cada teste precisa.

### 7.2 Quando for inevitável partir de produção
Exemplo: reproduzir bug de performance que depende da distribuição real dos dados.
- Exige aprovação do dono do produto e registro (quem, quando, por quê, retenção da cópia).
- A anonimização roda num ambiente controlado antes de qualquer exportação; o dado em claro nunca sai desse ambiente.
- Anonimização deve ser irreversível. Pseudonimização (substituir por código que pode ser revertido com tabela ou chave) continua sendo dado pessoal para a LGPD.
- Ferramentas: extensão PostgreSQL Anonymizer (`anon`) ou script SQL de mascaramento revisado.

Exemplo de script de mascaramento (ajuste às tabelas do projeto e revise a cada migration que adiciona dado pessoal):
```sql
BEGIN;
UPDATE clientes SET
  nome        = 'Cliente ' || left(md5(id::text), 8),
  email       = 'cliente+' || left(md5(id::text), 12) || '@exemplo.invalid',
  telefone    = NULL,
  cpf_cifrado = NULL,
  cpf_hash    = NULL,
  data_nascimento = NULL;
UPDATE usuarios SET
  nome  = 'Usuário ' || left(md5(id::text), 8),
  email = 'usuario+' || left(md5(id::text), 12) || '@exemplo.invalid',
  password_hash = '<hash argon2id de uma senha de teste conhecida>';
UPDATE enderecos SET logradouro = 'Rua Exemplo', numero = '1', complemento = NULL, cep = '00000000';
UPDATE integracoes SET token_cifrado = NULL, webhook_secret_cifrado = NULL;
UPDATE webhooks_recebidos SET payload = '{}'::jsonb;
DELETE FROM sessoes;
DELETE FROM auditoria;
COMMIT;
```
Depois de mascarar:
- Rode uma verificação que procure padrões de dado pessoal remanescente (e-mails com domínio real, CPFs válidos, telefones) em colunas de texto e jsonb.
- Troque todas as chaves de cifra do ambiente de destino: dados cifrados com chave de produção não podem ser decifráveis fora dela.

## 8. Retenção e exclusão por titular (LGPD) no banco

### 8.1 Mapa de dados pessoais
Mantenha, junto do schema, a lista de tabelas e colunas com dado pessoal e a regra de cada uma:

| Tabela.coluna | Classificação | Retenção | Ao excluir titular |
|---|---|---|---|
| `clientes.nome`, `email`, `telefone` | pessoal | enquanto houver relação + prazo definido | anonimizar |
| `clientes.cpf_cifrado`, `cpf_hash` | pessoal | idem | apagar (NULL) |
| `enderecos.*` | pessoal | idem | apagar linhas |
| `vendas` (vínculo com cliente) | fiscal | prazo legal de guarda definido com contador/jurídico | manter a venda; vínculo aponta para cliente anonimizado |
| `webhooks_recebidos.payload` | pode conter pessoal | curto (ex.: 90 dias) | expurgo por job |
| `auditoria.antes/depois` | pode conter pessoal | definido | mascarar na gravação |

Colunas `jsonb` com payload de terceiros e tabelas de log são onde dado pessoal costuma ser esquecido.

### 8.2 Exclusão/anonimização de um titular
```ts
export async function anonimizarCliente(ctx: ContextoTenant, clienteId: string, solicitacaoId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`;

    const { count } = await tx.cliente.updateMany({
      where: { id: clienteId, tenantId: ctx.tenantId, anonimizadoEm: null },
      data: {
        nome: 'Titular anonimizado',
        email: null,
        telefone: null,
        cpfCifrado: null,
        cpfHash: null,
        dataNascimento: null,
        anonimizadoEm: new Date(),
      },
    });
    if (count === 0) throw new ClienteNaoEncontradoOuJaAnonimizado(clienteId);

    await tx.endereco.deleteMany({ where: { tenantId: ctx.tenantId, clienteId } });
    await tx.solicitacaoTitular.update({
      where: { id: solicitacaoId },
      data: { status: 'CONCLUIDA', concluidaEm: new Date() },
    });
    await tx.auditoria.create({
      data: { tenantId: ctx.tenantId, atorId: ctx.usuarioId, acao: 'titular.anonimizado', entidade: 'cliente', entidadeId: clienteId },
    });
  });
}
```
- Uma transação: ou o titular fica todo anonimizado, ou nada muda.
- Vendas e documentos fiscais permanecem, ligados ao registro anonimizado.
- A solicitação guarda só o necessário para comprovar o atendimento (id, datas, status, hash do identificador), não o dado pessoal apagado.
- Teste de integração que cria o titular com dados em todas as tabelas mapeadas e verifica que nenhuma coluna pessoal sobrou.
- Arquivos em object storage, logs e ferramentas externas também precisam ser tratados: ver `devops-observabilidade-lgpd`.

### 8.3 Retenção automática
- Job agendado (com lock para rodar em uma instância só) que apaga ou anonimiza dados vencidos por tabela, em lotes.
- Cada execução registra quantas linhas tratou; alerta se falhar.
- Critério por data com índice (`created_at`, `encerrado_em`) para o job não varrer a tabela inteira.

### 8.4 Backups e exclusão
- Dado excluído continua existindo nos backups até eles expirarem. A retenção dos backups precisa ser finita e documentada.
- Não se edita backup para remover um titular. Em vez disso, mantenha o registro das solicitações concluídas e, em qualquer restore, reaplique as exclusões/anonimizações pendentes antes de devolver o banco ao uso.
- Inclua essa etapa no runbook de restore e no drill (seção 5).
