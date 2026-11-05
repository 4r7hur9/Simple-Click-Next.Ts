# XSS, CSP e headers de segurança

## 1. Onde o XSS entra em apps React/Next.js

React escapa `{texto}`. O XSS aparece nos pontos que contornam isso:

| Sink | Risco | Tratamento |
|---|---|---|
| `dangerouslySetInnerHTML` | HTML arbitrário | DOMPurify com allowlist, ou não usar |
| `ref.current.innerHTML = ...`, `insertAdjacentHTML` | idem | `textContent` ou DOMPurify |
| `href`, `src`, `action`, `formAction` dinâmicos | `javascript:`, `data:text/html` | validar protocolo com `new URL()` |
| `eval`, `new Function`, `setTimeout('código')` | execução direta | proibido com dado externo |
| Markdown com HTML (`rehype-raw`) | HTML embutido | sem `rehype-raw`, ou `rehype-sanitize` |
| `<script>` com JSON inline | quebra de `</script>` | escapar `<` como `\u003c` |
| Bibliotecas de rich text, tooltips e gráficos que aceitam HTML em labels | HTML injetado | passar texto, conferir a doc da lib |
| Atributos `style` com valor do usuário | exfiltração via `url()` em alguns cenários | allowlist de valores |
| SVG enviado pelo usuário exibido inline | scripts dentro do SVG | servir como `<img>` ou sanitizar |

Fontes típicas no SaaS: nome de produto, descrição, observação da venda, nome do cliente, nome da loja (vista por outros usuários do tenant e pelo suporte), parâmetros de URL, mensagens de erro refletidas.

### Sanitização

```ts
import DOMPurify from 'isomorphic-dompurify';

export function sanitizarHtmlBasico(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:)/i,
  });
}
```

- Sanitize na saída (render), não só na entrada: dados antigos no banco e outras fontes podem não ter passado pela sanitização.
- Se o conteúdo é texto puro, não sanitize: renderize como texto e pronto.

### JSON-LD e dados inline

```tsx
const jsonLd = { '@context': 'https://schema.org', '@type': 'Product', name: produto.nome };
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
/>
```

## 2. Content Security Policy com nonce (Next.js App Router)

O middleware gera um nonce por request, repassa na request (o Next.js lê e aplica aos scripts dele) e devolve o header na resposta. No Next.js 16+, o arquivo é `proxy.ts` e a função exportada se chama `proxy`; nas versões anteriores, `middleware.ts` com `middleware`.

```ts
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV === 'development';
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? ` 'unsafe-eval'` : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' blob: data: https://cdn.exemplo.com.br`,
    `font-src 'self'`,
    `connect-src 'self' https://o0.ingest.sentry.io`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
```

Para scripts próprios, leia o nonce em Server Component: `const nonce = (await headers()).get('x-nonce') ?? undefined;` e passe para `<Script nonce={nonce} />`.

Pontos de atenção:
- Nonce exige renderização dinâmica; páginas estáticas não recebem nonce. Para sites majoritariamente estáticos, use CSP sem inline (hashes) no `next.config`.
- `'unsafe-eval'` só em desenvolvimento. Em produção, é finding alto.
- Bibliotecas CSS-in-JS e alguns componentes injetam `style` inline; teste a política em `Content-Security-Policy-Report-Only` antes de aplicar. `'unsafe-inline'` em `style-src` é concessão aceitável e muito menos grave que em `script-src`, mas registre.
- `connect-src` lista APIs, Sentry, analytics. `img-src` lista o CDN de imagens.
- Relatórios: `report-to` com endpoint próprio ou serviço (Sentry aceita CSP reports).

## 3. Headers estáticos

```js
// next.config.js
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

module.exports = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
```

- `X-Frame-Options: DENY` complementa `frame-ancestors 'none'` para navegadores antigos. Se o app precisa ser embutido (widget do lojista), use `frame-ancestors` com a lista exata de origens.
- `camera=(self)` apenas se o PDV lê código de barras pela câmera; caso contrário `camera=()`.
- HSTS com `preload` só quando todos os subdomínios servem HTTPS. Comece sem `preload`.
- Express: `app.use(helmet())` e ajuste `contentSecurityPolicy` conforme a app.

## 4. Como verificar

- `curl -sI https://staging.exemplo.com.br | grep -iE 'content-security|strict-transport|x-content|referrer|permissions|x-frame'`.
- DevTools > Console mostra violações de CSP.
- Teste de XSS no E2E: cadastrar produto com nome `<img src=x onerror=alert(1)>` e verificar que aparece como texto e nenhum `dialog` é disparado (Playwright `page.on('dialog', ...)` deve não ser chamado).
- Teste de link: salvar site da loja `javascript:alert(1)` e verificar que o link não é renderizado.
