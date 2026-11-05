# Sessão, CSRF, redirects e comunicação entre janelas

## 1. Onde guardar a credencial

| Opção | XSS rouba? | CSRF? | Quando usar |
|---|---|---|---|
| Cookie `HttpOnly; Secure; SameSite=Lax` | não (JS não lê) | mitigado pelo SameSite + checagem de Origin | padrão para app web |
| Cookie `SameSite=None` | não | sim, precisa de token CSRF | só se o front e a API estão em sites diferentes e não há BFF |
| `localStorage`/`sessionStorage` | sim | não | evitar para sessão |
| Memória (variável JS) + refresh em cookie HttpOnly | parcial (durante a sessão) | refresh protegido por SameSite | SPA que precisa de Bearer para API externa |

Padrão recomendado no stack: Next.js como BFF. O navegador só tem o cookie de sessão HttpOnly; o servidor Next.js resolve a sessão e chama serviços com o token que ele mesmo guarda.

Atributos do cookie:
- `HttpOnly`: sempre para sessão.
- `Secure`: sempre em produção.
- `SameSite=Lax`: permite navegação vinda de link externo e bloqueia POST cross-site. `Strict` para painéis administrativos sensíveis.
- `Path=/`, sem `Domain` (fica host-only) salvo necessidade real de subdomínio.
- Prefixo `__Host-` (exige `Secure`, `Path=/` e sem `Domain`) dificulta sobrescrita por subdomínio comprometido.
- `Max-Age` coerente com a política de sessão; renovação deslizante no servidor.

Use a biblioteca de autenticação que o projeto já adota (Auth.js, Better Auth, sessão própria). Não misture dois mecanismos.

## 2. Ciclo de vida no cliente

- Login bem-sucedido: `router.refresh()`/redirect para o servidor recarregar a sessão; não guarde o usuário em `localStorage`.
- Troca de tenant/loja: invalide todo o cache de dados (`queryClient.clear()`), não só algumas keys.
- Logout: chamada ao servidor que apaga o cookie e invalida a sessão no armazenamento; no cliente, limpe TanStack Query, stores e IndexedDB do tenant.
- 401 em qualquer chamada: redirecionar ao login preservando `next` validado.
- Expiração em tela de caixa: aviso antes de expirar e reautenticação sem perder a venda em andamento.

## 3. CSRF

### Server Actions
- São POST e o Next.js compara o header `Origin` com o `Host` (ou `X-Forwarded-Host`). Isso, somado a cookies SameSite, cobre o caso comum.
- Atrás de proxy/domínio diferente, configure `experimental.serverActions.allowedOrigins` com a lista exata. Não use coringa amplo.
- Nunca exponha mutação via GET (link ou `<img>` disparam GET cross-site).

### Route Handlers e Express com cookie de sessão
Verifique a origem em todo método que muda estado:

```ts
// lib/csrf.ts
const ORIGENS = new Set([process.env.APP_ORIGIN!]); // ex.: https://app.exemplo.com.br, validado no boot

export function exigirMesmaOrigem(req: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') throw new ErroProibido('Origem inválida');
  if (!origin || !ORIGENS.has(origin)) throw new ErroProibido('Origem inválida');
}
```

- Com `SameSite=None` ou formulários de terceiros, adicione token CSRF (double submit cookie ou token sincronizado). Em Express, use uma lib mantida (ex.: `csrf-csrf`); `csurf` está descontinuado.
- CORS não substitui CSRF: CORS controla leitura da resposta, não o envio da requisição simples.
- API pública com Bearer (sem cookie) não precisa de CSRF, mas precisa de CORS restrito.

## 4. Open redirect

Pontos de entrada: `?next=`, `?returnTo=`, `?redirect=`, `redirect_uri` de OAuth, links de e-mail, callback de pagamento.

```ts
const BASE = 'https://app.invalid';

export function caminhoInternoSeguro(valor: string | null | undefined, padrao = '/'): string {
  if (!valor || !valor.startsWith('/') || /[\\\x00-\x1f]/.test(valor)) return padrao;
  const u = new URL(valor, BASE);
  return u.origin === BASE ? u.pathname + u.search + u.hash : padrao;
}
```

- Destinos externos legítimos (gateway de pagamento): allowlist de hosts exatos, comparando `new URL(v).host`, nunca `includes()` ou `startsWith()` em string (`https://pagamento.com.evil.io`).
- Testes: `//evil.com`, `/\evil.com`, `/%09/evil.com`, `https://evil.com`, `javascript:alert(1)` devem cair no padrão.

## 5. Clickjacking e iframes

- A app não pode ser embutida por terceiros: `frame-ancestors 'none'` (CSP) + `X-Frame-Options: DENY`.
- Se precisa ser embutida (widget), `frame-ancestors` com a lista de origens do cliente, gerenciada por tenant, e ações sensíveis exigem confirmação fora do iframe.
- Iframe de terceiro dentro da app: `sandbox` com o mínimo (`allow-scripts allow-same-origin` só se a integração exige), `allow` explícito para câmera/pagamento, `referrerPolicy="no-referrer"`.

## 6. postMessage

```ts
// enviar para janela conhecida
iframe.contentWindow?.postMessage({ tipo: 'tema', valor: 'escuro' }, 'https://widget.parceiro.com.br');

// receber
window.addEventListener('message', (e: MessageEvent) => {
  if (e.origin !== 'https://widget.parceiro.com.br') return;
  const msg = mensagemSchema.safeParse(e.data);
  if (!msg.success) return;
  tratar(msg.data);
});
```

- Compare origem por igualdade exata, não por `endsWith`/`includes`.
- Valide o formato com Zod; nunca use `e.data` como HTML, URL de redirect ou seletor.
- Remova o listener no cleanup do efeito.

## 7. Dados sensíveis no navegador

- URL: nada de token, CPF, e-mail ou id de sessão em query string (vai para logs do servidor, histórico, Referer e analytics). Links de reset de senha usam token de uso único, curto, e a página troca o token por sessão via POST e limpa a URL com `history.replaceState`.
- Console: sem `console.log` de payloads de cliente/pagamento; em produção, remova logs de debug (lint `no-console` ou remoção no build).
- Storage: só preferências e dados não sensíveis. Rascunho de venda offline guarda o mínimo (ver `frontend-performance/references/offline-first-pdv.md`).
- Autocomplete: `autocomplete="one-time-code"` em OTP, `new-password` em cadastro de senha; nunca `autocomplete="off"` para impedir gerenciador de senha.
- Mensagens de login genéricas ("E-mail ou senha inválidos") para não enumerar contas.
