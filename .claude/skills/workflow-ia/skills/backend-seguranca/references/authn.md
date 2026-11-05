# Autenticação (authn)

Referência aprofundada da skill `backend-seguranca`. Leia quando a task tocar cadastro, login, sessão, JWT, refresh token, MFA, reset de senha, convite, verificação de e-mail ou webhook assinado.

Base: OWASP ASVS (V2 Autenticação, V3 Sessão), OWASP Cheat Sheets (Password Storage, Authentication, Session Management, JWT). Exemplos com Node 20+, `argon2`, `jose`, Prisma, Next.js e Express. Em outro stack, aplique o equivalente.

Antes de implementar do zero, verifique se o projeto já usa uma biblioteca de autenticação (Auth.js, Lucia, Clerk, Supabase Auth etc.). Se usa, siga-a e aplique estas regras à configuração dela; não crie um segundo mecanismo paralelo.

## 1. Armazenamento de senha

- **Argon2id** é a primeira escolha. Parâmetros mínimos OWASP: memória 19 MiB, 2 iterações, paralelismo 1. Os padrões da lib `argon2` (64 MiB, 3 iterações, 4 lanes) atendem.
- **bcrypt** é aceitável com custo 10 ou mais; lembre que bcrypt ignora bytes após o 72º.
- Nunca MD5, SHA-1, SHA-256 simples, nem criptografia reversível.
- Rehash transparente no login quando os parâmetros mudarem.

```ts
import argon2 from 'argon2';

export const hashSenha = (senha: string) => argon2.hash(senha, { type: argon2.argon2id });

export async function verificarSenha(hash: string, senha: string) {
  const ok = await argon2.verify(hash, senha);
  const precisaRehash = ok && argon2.needsRehash(hash);
  return { ok, precisaRehash };
}
```

### Política de senha (NIST 800-63B)
- Mínimo de 8 caracteres (12 ou mais recomendado); aceite pelo menos 64.
- Sem regras de composição obrigatória ("1 maiúscula, 1 símbolo"); sem expiração periódica forçada.
- Bloqueie senhas vazadas/comuns (lista local ou HIBP com k-anonymity).
- Aceite qualquer caractere Unicode, incluindo espaços.

## 2. Login

### Requisitos
- Mensagem única: "E-mail ou senha inválidos." para usuário inexistente, senha errada e conta bloqueada.
- Tempo semelhante nos dois ramos: verifique contra um hash falso quando o usuário não existir.
- Rate limit por IP **e** por identificador (e-mail normalizado), com store compartilhado.
- Bloqueio progressivo por conta (atraso crescente ou bloqueio temporário), com alerta ao dono da conta.
- MFA obrigatório para papéis administrativos e operações de alto risco.
- Regenere o identificador de sessão após login bem-sucedido (evita session fixation).

```ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const limitePorIp = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '10 m'), prefix: 'login-ip' });
const limitePorConta = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '15 m'), prefix: 'login-conta' });

let hashFalso: Promise<string> | undefined;
const obterHashFalso = () => (hashFalso ??= hashSenha('senha-inexistente-apenas-para-tempo'));

export async function autenticar(input: LoginInput, ip: string) {
  const email = input.email.trim().toLowerCase();
  const [porIp, porConta] = await Promise.all([limitePorIp.limit(ip), limitePorConta.limit(email)]);
  if (!porIp.success || !porConta.success) throw new MuitasTentativasError(); // 429

  const usuario = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true, tenantId: true, papel: true, passwordHash: true, bloqueadoAte: true, mfaAtivo: true },
  });
  const { ok, precisaRehash } = await verificarSenha(usuario?.passwordHash ?? (await obterHashFalso()), input.senha);
  const bloqueado = !!usuario?.bloqueadoAte && usuario.bloqueadoAte > new Date();

  if (!usuario || !ok || bloqueado) {
    if (usuario) await registrarFalhaDeLogin(usuario.id); // incrementa contador, aplica bloqueio progressivo
    throw new CredenciaisInvalidasError(); // 401, mensagem genérica
  }
  if (precisaRehash) await prisma.usuario.update({ where: { id: usuario.id }, data: { passwordHash: await hashSenha(input.senha) } });
  await zerarFalhasDeLogin(usuario.id);
  return usuario.mfaAtivo ? iniciarDesafioMfa(usuario.id) : criarSessao(usuario);
}
```
Em Express, `express-rate-limit` com store Redis cumpre o mesmo papel. Em memória só serve com instância única.

### Cadastro e recuperação sem enumeração
- Cadastro com e-mail existente: responda igual ("Enviamos um e-mail para continuar") e avise o dono por e-mail.
- "Esqueci minha senha": sempre "Se o e-mail existir, você receberá instruções."

## 3. Sessão

### Sessão opaca (recomendada para apps web próprios)
- ID aleatório de 256 bits (`randomBytes(32).toString('base64url')`), guardado no banco como hash, com `expiraEm`, `ultimoUsoEm`, `ip`, `userAgent`.
- Revogação imediata é trivial: apague/marque a linha.
- Expiração ociosa (ex.: 30 min para admin, mais longa para operador de PDV conforme decisão do produto) e absoluta.

### Cookie
```ts
import { cookies } from 'next/headers';

(await cookies()).set('sid', idSessao, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 8,
});
```
- Prefixo `__Host-` quando possível (exige `Secure`, `path=/`, sem `Domain`).
- Nunca guarde token de sessão em `localStorage`: qualquer XSS o lê.

### CSRF com cookie
- `SameSite=Lax` bloqueia a maior parte; complemente verificando `Origin` em métodos que alteram estado.
- Server Actions do Next.js comparam `Origin` com o host; se houver proxy/domínio extra, configure `serverActions.allowedOrigins` em vez de desligar a checagem.
- Rotas Express com cookie: token CSRF (double submit ou sincronizado) ou checagem estrita de `Origin`.

## 4. JWT

### Quando usar
- APIs consumidas por app mobile ou serviços; para web própria, sessão opaca costuma ser mais simples e revogável.

### Regras
- Algoritmo fixo na verificação (`algorithms: ['HS256']` ou `['EdDSA']`/`['RS256']`); nunca aceite `none` nem deixe o header decidir.
- Valide `exp`, `iss`, `aud`; use `nbf`/`iat` quando fizer sentido.
- Access token curto (5-15 min).
- Payload é legível por qualquer um: só `sub`, `tid` (tenant), papel e `jti`. Nada de e-mail, CPF, permissões detalhadas mutáveis.
- Segredo HS256 com pelo menos 256 bits aleatórios; com múltiplos serviços verificando, prefira chave assimétrica e `kid` para rotação.
- `decode` sem `verify` só serve para log/debug, nunca para decisão.

```ts
import { SignJWT, jwtVerify } from 'jose';

const chave = new TextEncoder().encode(env.JWT_SECRET);

export const emitirAccessToken = (u: { id: string; tenantId: string; papel: string }) =>
  new SignJWT({ tid: u.tenantId, papel: u.papel })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(u.id)
    .setIssuer('api.exemplo.com')
    .setAudience('app.exemplo.com')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(chave);

export async function verificarAccessToken(token: string) {
  const { payload } = await jwtVerify(token, chave, {
    algorithms: ['HS256'],
    issuer: 'api.exemplo.com',
    audience: 'app.exemplo.com',
  });
  return AccessClaimsSchema.parse(payload); // valida o formato das claims
}
```

## 5. Refresh token com rotação e detecção de reuso

- Refresh é opaco (não JWT), aleatório, guardado como hash, em cookie `HttpOnly` com `path` restrito à rota de renovação.
- Cada uso gera um novo e invalida o anterior. Todos da mesma cadeia compartilham `familiaId`.
- Token já usado apresentado de novo significa roubo: revogue a família inteira.

```prisma
model RefreshToken {
  id         String    @id @default(uuid())
  usuarioId  String
  familiaId  String
  tokenHash  String    @unique
  expiraEm   DateTime  @db.Timestamptz
  usadoEm    DateTime? @db.Timestamptz
  revogadoEm DateTime? @db.Timestamptz
  criadoEm   DateTime  @default(now()) @db.Timestamptz
  @@index([familiaId])
  @@index([usuarioId])
}
```

```ts
import { createHash, randomBytes } from 'node:crypto';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

export async function renovarSessao(refreshBruto: string) {
  const atual = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshBruto) } });
  if (!atual || atual.revogadoEm || atual.expiraEm <= new Date()) throw new NaoAutenticadoError();

  // marca como usado de forma atômica; só uma requisição vence
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: atual.id, usadoEm: null },
    data: { usadoEm: new Date() },
  });
  if (count === 0) {
    await prisma.refreshToken.updateMany({
      where: { familiaId: atual.familiaId, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
    await registrarEventoSeguranca('refresh_reutilizado', atual.usuarioId);
    throw new NaoAutenticadoError();
  }

  const novoBruto = randomBytes(32).toString('base64url');
  await prisma.refreshToken.create({
    data: {
      usuarioId: atual.usuarioId,
      familiaId: atual.familiaId,
      tokenHash: sha256(novoBruto),
      expiraEm: new Date(Date.now() + TRINTA_DIAS_MS),
    },
  });
  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id: atual.usuarioId },
    select: { id: true, tenantId: true, papel: true },
  });
  return { accessToken: await emitirAccessToken(usuario), refreshToken: novoBruto };
}
```
Se o cliente fizer renovações concorrentes legítimas (várias abas), trate no cliente (uma renovação por vez) em vez de afrouxar a detecção de reuso.

## 6. Invalidação de sessões

Obrigatória em: troca de senha, reset de senha, logout, desativação do usuário, mudança de papel, suspeita de comprometimento.

- Sessão opaca: apague/revogue as linhas do usuário (exceto a atual, na troca de senha voluntária, se o produto quiser).
- Refresh tokens: `updateMany({ where: { usuarioId, revogadoEm: null }, data: { revogadoEm: new Date() } })`.
- Access JWT já emitido vive até expirar. Se precisar corte imediato, inclua `sv` (session version) no token e compare com `usuario.sessionVersion` nas rotas sensíveis; incremente ao invalidar.
- Logout apaga o cookie **e** revoga no servidor.

## 7. Reset de senha, convite e verificação de e-mail

1. Gere token com `randomBytes(32).toString('base64url')`.
2. Guarde **apenas o hash** (SHA-256 basta para token de alta entropia), com `usuarioId`, `expiraEm` (15-60 min) e `usadoEm`.
3. Envie o link por e-mail; o token vai no path ou fragmento, não em log de acesso de terceiros. Página de reset com `Referrer-Policy: no-referrer`.
4. Consumo atômico e de uso único:
```ts
const novoHash = await hashSenha(novaSenha); // fora da transação: hash é CPU caro
await prisma.$transaction(async (tx) => {
  const token = await tx.tokenReset.findUnique({ where: { tokenHash: sha256(tokenBruto) } });
  if (!token) throw new TokenInvalidoError();
  const { count } = await tx.tokenReset.updateMany({
    where: { id: token.id, usadoEm: null, expiraEm: { gt: new Date() } },
    data: { usadoEm: new Date() },
  });
  if (count === 0) throw new TokenInvalidoError();
  await tx.usuario.update({
    where: { id: token.usuarioId },
    data: { passwordHash: novoHash, sessionVersion: { increment: 1 } },
  });
  await tx.refreshToken.updateMany({ where: { usuarioId: token.usuarioId, revogadoEm: null }, data: { revogadoEm: new Date() } });
  await tx.sessao.deleteMany({ where: { usuarioId: token.usuarioId } });
});
```
5. Novo pedido de reset invalida os tokens anteriores do usuário.
6. Rate limit no pedido e no consumo; notifique o usuário por e-mail que a senha mudou.
7. Código numérico curto (OTP de 6 dígitos) exige limite de tentativas por código, não só por IP.

## 8. MFA
- TOTP (RFC 6238) com biblioteca consolidada; segredo TOTP criptografado em repouso.
- Códigos de recuperação: gerados aleatoriamente, exibidos uma vez, guardados como hash, uso único.
- Rate limit na verificação do segundo fator.
- Desativar MFA ou trocar e-mail exige reautenticação recente.

## 9. Webhooks assinados (autenticação de máquina)
- Obtenha o **corpo bruto**: Express `express.raw({ type: 'application/json' })` na rota do webhook; Next.js `await req.text()` antes de qualquer `JSON.parse`.
- Se o provedor tem SDK de verificação (ex.: `stripe.webhooks.constructEvent`), use-o.
- Esquema genérico com timestamp contra replay:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export function assinaturaValida(rawBody: string, tsCabecalho: string, assinaturaHex: string, segredo: string) {
  const ts = Number(tsCabecalho);
  if (!Number.isInteger(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false; // janela de 5 min
  const esperado = createHmac('sha256', segredo).update(`${ts}.${rawBody}`).digest();
  const recebido = Buffer.from(assinaturaHex, 'hex');
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}
```
- Depois da assinatura: dedupe por `eventId` e processamento em fila (ver `backend-engenharia`).
- Segredo do webhook por ambiente, rotacionável.

## 10. Checklist rápido de authn para o revisor
- [ ] Hash Argon2id/bcrypt; nenhum hash rápido.
- [ ] Login e reset com rate limit por IP e por conta; mensagens genéricas.
- [ ] Cookie `HttpOnly` + `Secure` + `SameSite`; nada de token em `localStorage`.
- [ ] JWT com `algorithms` fixo, `exp`, `iss`, `aud`; payload sem dado sensível.
- [ ] Refresh opaco, com rotação, hash no banco e revogação de família no reuso.
- [ ] Troca/reset de senha e logout revogam sessões/refresh.
- [ ] Tokens de uso único com hash, expiração curta e consumo atômico.
- [ ] Webhook com HMAC sobre corpo bruto, tempo constante e janela de timestamp.
