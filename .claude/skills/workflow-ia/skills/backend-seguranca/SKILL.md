---
name: backend-seguranca
description: Segurança do código de servidor (OWASP Top 10, OWASP API Top 10, ASVS) em Route Handlers, Server Actions, Express e Prisma. Cobre autenticação (senha, login, sessão, JWT, refresh, reset), autorização (BOLA/IDOR, tenant, RBAC), mass assignment, SQL raw, SSRF, path traversal, upload, exposição de dados, CORS, rate limit, lógica de negócio, webhooks assinados e supply chain. Use quando o diff tocar login, sessão, token, permissão, query por id vindo do cliente, SQL raw, upload, fetch de URL do usuário, webhook, segredo ou dependência nova. Não use para XSS/CSP no navegador (use frontend-seguranca), RLS e privilégios do banco (use banco-seguranca-operacao) nem pentest (use auditoria-seguranca-pentest).
---

# Back-end: segurança

Regras para que o servidor seja a fronteira de confiança: toda decisão de identidade, permissão, preço e validade acontece aqui. O `implementer` e o `fixer` seguem "Regras" e "Como construir"; o `security-reviewer` usa o "Checklist de revisão" e gera findings com a severidade padrão. Na dúvida entre duas severidades para uma falha explorável, escolha a maior.

Exemplos em Next.js (App Router), Express, Prisma, Zod e `jose`. Em outro stack, aplique o equivalente.

## Regras inegociáveis

1. **Toda query sobre recurso identificado pelo cliente filtra por dono/tenant no próprio `where`.** Buscar por `id` e confiar no front é IDOR (BOLA), a falha número 1 de APIs.
2. **Toda rota, Route Handler e Server Action verifica autenticação e permissão no servidor; o padrão é negar.** Server Action é endpoint público; esconder botão não é controle de acesso.
3. **Nunca repassar objeto do cliente direto ao ORM (`data: body`, `where: query`).** Mass assignment deixa o cliente definir `role`, `tenantId`, `precoCentavos` ou injetar operadores.
4. **SQL só com parâmetros: `$queryRaw` com template tag ou `Prisma.sql`; nunca `$queryRawUnsafe`/`$executeRawUnsafe` com dado externo.** Concatenação é SQL injection.
5. **Senha com Argon2id (ou bcrypt com custo adequado); login com rate limit por IP e por conta, bloqueio progressivo e mensagem genérica.** Hash rápido e login sem limite viram vazamento em massa e força bruta.
6. **JWT verificado com algoritmo fixo, `exp`, `iss` e `aud`; access token curto; refresh com rotação e detecção de reuso.** `alg: none`, token eterno e refresh reutilizável permitem sequestro de sessão.
7. **Trocar senha, resetar senha ou fazer logout invalida sessões e refresh tokens.** Senão o atacante que já entrou continua dentro.
8. **Token de reset/convite/verificação é aleatório (CSPRNG), de uso único, expira rápido e é guardado como hash.** Token previsível ou reutilizável é tomada de conta.
9. **Resposta nunca expõe campo sensível (`passwordHash`, tokens, dados de outro tenant, flags internas); sempre `select`/DTO explícito.** Excessive data exposure vaza em toda listagem.
10. **Preço, desconto, total, quantidade e transição de estado são recalculados e validados no servidor.** Confiar no valor do cliente é fraude de lógica de negócio.
11. **URL fornecida pelo usuário só é buscada após allowlist de esquema/host e bloqueio de IPs internos (incluindo 169.254.169.254).** SSRF expõe metadados de nuvem e serviços internos.
12. **Upload validado por magic bytes, tamanho e tipo permitido; nome gerado pelo servidor; armazenado fora do webroot/em object storage.** Upload é vetor de RCE, XSS e path traversal.
13. **Segredos só em variável de ambiente/secret manager, nunca no repositório, em log, em mensagem de erro ou em `NEXT_PUBLIC_`.** Segredo vazado precisa ser rotacionado, não apenas removido.
14. **Webhook recebido tem assinatura HMAC verificada sobre o corpo bruto, com comparação em tempo constante e janela de timestamp.** Sem isso, qualquer um forja "pagamento aprovado".
15. **Toda rota tem limite de payload; rotas sensíveis e caras têm rate limit por IP/usuário/chave.** Abuso de recurso derruba e encarece o serviço.

## Como construir

### Autenticação
- Hash: `argon2.hash(senha, { type: argon2.argon2id })`; verificação com `argon2.verify`.
- Login: mesma mensagem e tempo semelhante para usuário inexistente e senha errada ("E-mail ou senha inválidos").
- Rate limit no login por IP e por identificador; bloqueio progressivo; MFA obrigatório para admin.
- Sessão: cookie `HttpOnly`, `Secure`, `SameSite=Lax` (ou `Strict`), expiração definida; regenerar identificador no login.
- JWT: access 5-15 min; refresh opaco guardado como hash, com família para detectar reuso.
- Detalhes e código em [references/authn.md](references/authn.md).

### Autorização
- Contexto de autenticação (`userId`, `tenantId`, `papel`) vem da sessão validada, nunca do body/query.
- Filtre pelo tenant em toda leitura e escrita (`findFirst({ where: { id, tenantId } })`, `updateMany`/`deleteMany` com `tenantId`).
- Recurso de outro tenant retorna 404 (não confirme existência); falta de permissão no próprio tenant retorna 403.
- Permissões centralizadas (`can(usuario, 'venda:estornar', recurso)`), checadas no use case ou no início do handler.
- Ao referenciar IDs em relações (`connect`), valide que o recurso relacionado pertence ao tenant.
- Detalhes em [references/authz.md](references/authz.md).

### Entrada e injeção
- Schema Zod com whitelist de campos por operação (criar ≠ editar ≠ admin).
- Campos que o cliente nunca define (`tenantId`, `role`, `createdById`, `status` de aprovação, preço) vêm do servidor.
- `ORDER BY`/coluna dinâmica: mapa de valores permitidos, nunca string do cliente em `Prisma.raw`.
- Comando de sistema: `execFile(bin, [args])`, nunca `exec` com string montada.
- Caminho de arquivo: `path.resolve(base, nome)` e confirme que começa com `base + path.sep`.
- Nunca `eval`, `new Function`, template engine com string do usuário.
- Armadilhas específicas do Prisma em [references/prisma-armadilhas.md](references/prisma-armadilhas.md).

### Exposição e transporte
- `select` explícito ou DTO; o cliente Prisma pode usar `omit` global para `passwordHash` como segunda linha.
- Error handler sem stack/SQL em produção.
- Express: `helmet()`, `cors({ origin: [lista], credentials: true })`, `express.json({ limit: '100kb' })`, `app.disable('x-powered-by')`.
- Logs sem senha, token, cookie, CPF completo, cartão; use redaction no logger.
- TLS até o banco (`sslmode=require` ou superior).

### Abuso e lógica de negócio
- Rate limit com store compartilhado (Redis) quando houver mais de uma instância.
- Quantidade `> 0` e inteira; desconto limitado pela regra e pelo papel; cupom com uso único garantido por constraint.
- Máquina de estados explícita: só transições permitidas (`aberta → paga`, nunca `cancelada → paga`).
- Operações sensíveis (estorno, troca de papel, exportação) geram audit log com quem, quando, o quê, de onde.

### Supply chain
- Dependência nova: justificar, checar manutenção, downloads, typosquatting, licença.
- Lockfile versionado; `npm audit`/SCA sem vulnerabilidade alta ou crítica nova.
- Scripts `postinstall` de pacotes desconhecidos são suspeitos.

## Checklist de revisão

Valores exatos para o campo severidade dos findings: `urgente`, `alto`, `medio`, `baixo`.

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | Query por `id` vindo do cliente sem filtro de dono/tenant no `where` (IDOR/BOLA) | urgente |
| 2 | Route Handler, Server Action ou rota Express sem checagem de autenticação/permissão | urgente |
| 3 | `data: body`, spread de input não validado ou `where` montado com objeto do cliente | urgente |
| 4 | `$queryRawUnsafe`/`$executeRawUnsafe`/`Prisma.raw` com dado externo, ou SQL concatenado | urgente |
| 5 | Segredo, chave ou token hardcoded, em `NEXT_PUBLIC_`, em log ou commitado | urgente |
| 6 | Senha com hash rápido (MD5, SHA-*), sem hash, ou comparação em texto | urgente |
| 7 | JWT decodificado sem verificar, sem `algorithms` fixo, ou aceitando `none` | urgente |
| 8 | Preço, desconto ou total aceito do cliente em vez de recalculado no servidor | urgente |
| 9 | Resposta inclui `passwordHash`, token, segredo ou dados de outro tenant | urgente |
| 10 | Webhook processado sem verificar assinatura HMAC | urgente |
| 11 | Fetch de URL do usuário sem allowlist e sem bloqueio de IP interno (SSRF) | urgente |
| 12 | Caminho de arquivo montado com input sem normalizar e confinar ao diretório base | urgente |
| 13 | `updateMany`/`deleteMany` cujo filtro de tenant pode ser `undefined` | urgente |
| 14 | Login, reset ou verificação de código sem rate limit | alto |
| 15 | Mensagem de login/reset que diferencia "usuário não existe" de "senha errada" | alto |
| 16 | Token de reset previsível, reutilizável, sem expiração ou guardado em texto puro | alto |
| 17 | Troca de senha/logout sem invalidar sessões e refresh tokens | alto |
| 18 | Refresh token sem rotação ou sem detecção de reuso | alto |
| 19 | `connect` em relação com id do cliente sem validar tenant do recurso relacionado | alto |
| 20 | Upload sem validação de magic bytes/tamanho ou salvo com nome do cliente | alto |
| 21 | CORS com `origin: '*'` (ou reflexo do Origin) junto de credenciais | alto |
| 22 | Stack trace, SQL ou mensagem interna retornados ao cliente em produção | alto |
| 23 | Cookie de sessão sem `HttpOnly`, `Secure` ou `SameSite` | alto |
| 24 | Transição de estado sem validar estado atual (ex.: estornar venda já estornada) | alto |
| 25 | Operação sensível (estorno, mudança de papel, exportação) sem audit log | medio |
| 26 | Sem limite de tamanho de body | medio |
| 27 | Dependência nova sem manutenção, com vulnerabilidade conhecida ou nome suspeito | medio |
| 28 | Log contendo e-mail, CPF, telefone ou payload completo sem redaction | medio |
| 29 | Ausência de `helmet`/headers de segurança em servidor Express | medio |
| 30 | Recurso de outro tenant respondendo 403 em vez de 404 (confirma existência) | baixo |

## Anti-padrões (errado → certo)

### IDOR por id
```ts
// errado: qualquer usuário logado lê a venda de qualquer loja
const venda = await prisma.venda.findUnique({ where: { id: params.id } });

// certo: tenant vem da sessão e está no where
const venda = await prisma.venda.findFirst({
  where: { id: params.id, tenantId: session.tenantId },
  select: vendaPublicaSelect,
});
if (!venda) throw new NaoEncontradoError('venda');
```

### Mass assignment
```ts
// errado: cliente envia { "role": "ADMIN", "tenantId": "outro" }
await prisma.usuario.update({ where: { id }, data: await req.json() });

// certo: whitelist por operação
const AtualizarPerfil = z.object({ nome: z.string().min(1).max(120), telefone: z.string().max(20).optional() }).strict();
const data = AtualizarPerfil.parse(await req.json());
await prisma.usuario.updateMany({ where: { id: session.userId, tenantId: session.tenantId }, data });
```

### SQL raw inseguro
```ts
// errado
await prisma.$queryRawUnsafe(`SELECT * FROM produto WHERE nome ILIKE '%${busca}%'`);

// certo: template tag parametriza
await prisma.$queryRaw`SELECT id, nome FROM produto WHERE tenant_id = ${tenantId} AND nome ILIKE ${'%' + busca + '%'}`;
```

### Server Action sem autorização
```ts
// errado
'use server';
export async function estornarVenda(id: string) {
  await vendaService.estornar(id);
}

// certo
'use server';
export async function estornarVenda(input: unknown) {
  const session = await exigirSessao();                 // helper do projeto; lança se não logado
  exigirPermissao(session, 'venda:estornar');           // deny by default
  const { id } = EstornarSchema.parse(input);
  await vendaService.estornar({ id, tenantId: session.tenantId, userId: session.userId });
}
```

### Comparação de assinatura
```ts
// errado: timing attack e corpo reserializado
if (req.headers['x-signature'] !== hmac(JSON.stringify(req.body))) return res.sendStatus(401);

// certo: corpo bruto, tempo constante, tamanhos checados
const esperado = createHmac('sha256', env.WEBHOOK_SECRET).update(rawBody).digest();
const recebido = Buffer.from(assinaturaHex, 'hex');
if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return res.sendStatus(401);
```

## Referências

- [references/authn.md](references/authn.md) — leia quando a task tocar cadastro, login, sessão, JWT, refresh token, MFA, reset de senha, convite ou webhook assinado.
- [references/authz.md](references/authz.md) — leia quando a task criar rota/Server Action, consultar recurso por id, envolver multi-tenant, papéis, permissões ou transição de estado.
- [references/prisma-armadilhas.md](references/prisma-armadilhas.md) — leia sempre que o diff usar Prisma com dado externo: raw SQL, `where`/`data` dinâmicos, `undefined` em filtros, `connect`, `include`, `omit`, logs de query.
