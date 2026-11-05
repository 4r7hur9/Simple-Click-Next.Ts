# Next.js: renderização, cache, bundle e assets

Detalhes práticos para o App Router. Confira a versão do Next.js no `package.json` do projeto: APIs de cache mudaram entre as versões 14, 15 e 16.

## 1. Escolha de renderização por rota

| Página | Estratégia | Como |
|---|---|---|
| Landing, preços, blog | estática | sem APIs dinâmicas; `generateStaticParams` para rotas com parâmetro |
| Catálogo público que muda às vezes | ISR | `export const revalidate = 300` ou revalidação por tag na mutação |
| Dashboard do lojista | dinâmica com streaming | RSC + `Suspense` por widget + `loading.tsx` |
| PDV / tela de caixa | shell RSC + ilha client | TanStack Query, Service Worker para offline |
| Relatório pesado | dinâmica + cache por tag | pré-agregar no banco (ver `banco-performance`) |

O que torna uma rota dinâmica: `cookies()`, `headers()`, `searchParams`, `fetch` com `cache: 'no-store'`, `connection()`. Mantenha isso nas folhas que precisam.

## 2. Cache de dados

- `cache` de `react`: memoiza por request. Use em funções de leitura chamadas por vários componentes da mesma árvore (`getSessao`, `getTenant`, `getProduto(id)`).

```ts
import { cache } from 'react';
export const getProduto = cache(async (tenantId: string, id: string) =>
  prisma.produto.findFirst({ where: { id, tenantId }, select: { id: true, nome: true, precoCentavos: true } }),
);
```

- Cache entre requests: `fetch` com `next: { revalidate, tags }`, `unstable_cache`, ou a diretiva `'use cache'` com `cacheTag`/`cacheLife` nas versões que a suportam. Use o mecanismo que o projeto já usa.
- Em multi-tenant, a key/tag de cache inclui `tenantId`. Cache compartilhado sem tenant pode servir dado de um lojista para outro (finding urgente).
- Invalide na mutação com `revalidateTag`/`revalidatePath`. Defina a invalidação antes de adicionar o cache.

## 3. Streaming

```tsx
export default async function Dashboard() {
  const tenantId = await tenantAtual();
  return (
    <>
      <ResumoDoDia tenantId={tenantId} />          {/* rápido, bloqueia pouco */}
      <Suspense fallback={<SkeletonGrafico />}>
        <GraficoMensal tenantId={tenantId} />      {/* lento, faz streaming */}
      </Suspense>
      <Suspense fallback={<SkeletonLista />}>
        <UltimasVendas tenantId={tenantId} />
      </Suspense>
    </>
  );
}
```

- Cada `Suspense` independente começa a buscar em paralelo.
- Fallback com a mesma altura do conteúdo final para evitar CLS.

## 4. Bundle

### Analisar

```js
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: process.env.ANALYZE === 'true' });
module.exports = withBundleAnalyzer({ /* config */ });
```

`ANALYZE=true npm run build` abre o relatório. Veja o "First Load JS" por rota na saída do `next build`.

### Substituições comuns

| Pesado | Alternativa |
|---|---|
| `moment` | `date-fns` (import por função) ou `dayjs` |
| `lodash` (import do pacote inteiro) | `lodash/debounce`, `es-toolkit` ou nativo |
| lib de ícones via barrel | import por ícone ou `optimizePackageImports` |
| lib de gráfico no carregamento inicial | `next/dynamic` com skeleton |
| `axios` só para GET simples | `fetch` nativo |
| validação duplicada em várias libs | uma só (Zod) |

### Fronteira client

- Client Component importa tudo que ele importa. Um `utils.ts` que importa Prisma e é importado por um Client Component quebra o build ou vaza código.
- `import 'server-only'` no topo de módulos de servidor faz o build falhar se forem importados no cliente.
- Passe Server Components como `children`/props para Client Components em vez de importá-los dentro deles.

### Dynamic import

```tsx
'use client';
import dynamic from 'next/dynamic';

const EditorDescricao = dynamic(() => import('./editor-descricao'), {
  ssr: false, // depende de window; permitido porque este arquivo é Client Component
  loading: () => <div className="h-40 animate-pulse rounded bg-muted" />,
});
```

Carregue sob demanda também por interação: `const { gerarPdf } = await import('./gerar-pdf')` dentro do handler do botão.

## 5. Imagens

```js
// next.config.js
module.exports = {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.exemplo.com.br' }],
  },
};
```

- `remotePatterns` específico (host e, se possível, pathname). Coringa amplo transforma o otimizador em proxy aberto.
- `sizes` descreve a largura renderizada; sem ele, com `fill`, o navegador baixa a versão grande.
- `placeholder="blur"` com `blurDataURL` para fotos grandes.
- Miniaturas em listas: largura pequena (ex.: 96px) e `quality` moderada.

## 6. Fontes

```ts
// app/fonts.ts
import { Inter } from 'next/font/google';
export const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });
```

Aplique a classe/variável no `<html>` do layout raiz. Evite carregar pesos não usados em fontes não variáveis.

## 7. Scripts de terceiros

```tsx
import Script from 'next/script';

<Script src="https://widget.exemplo.com/chat.js" strategy="lazyOnload" />
```

- `beforeInteractive`: só para o que precisa rodar antes da hidratação (raro; ex.: consentimento obrigatório).
- `afterInteractive` (padrão): analytics.
- `lazyOnload`: chat, widgets, pixels secundários.
- Carregue o script só nas rotas que usam, não no layout raiz.
- Para GA/GTM, `@next/third-parties` quando o projeto já usa.

## 8. Cabeçalhos de cache

```js
// next.config.js (trecho)
async headers() {
  return [
    { source: '/fonts/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  ];
}
```

- `/_next/static/*` já sai com `immutable`.
- Rotas autenticadas: não defina cache público. Route Handlers com dado do usuário: `Cache-Control: private, no-store`.
- Em Railway/Express servindo estático: `express.static(dir, { maxAge: '1y', immutable: true })` para arquivos com hash; `compression()` ou compressão na CDN/proxy.

## 9. Navegação

- `<Link>` faz prefetch automático das rotas visíveis em produção. Em listas com centenas de links, considere `prefetch={false}` para não saturar a rede.
- Formulários com Server Actions e `useFormStatus` dão feedback imediato sem JS extra.
