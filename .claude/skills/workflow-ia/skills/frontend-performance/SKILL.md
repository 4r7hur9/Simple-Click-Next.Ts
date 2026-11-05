---
name: frontend-performance
description: "Performance de front-end e Core Web Vitals (LCP < 2,5s, INP < 200ms, CLS < 0,1): RSC por padrão e 'use client' baixo na árvore, estratégia SSG/ISR/SSR/streaming por página, code splitting e dynamic import, peso de bundle e libs pesadas, next/image, next/font, next/script, waterfalls, chamadas redundantes, re-renders, virtualização, cache HTTP/CDN e offline-first para PDV. Use quando o diff adicionar dependência no client, imagens, fontes, scripts de terceiros, listas grandes, animações, polling, busca com digitação ou mexer em layout/página. Não use para correção de estado e fluxo de UI (use frontend-engenharia) nem para queries e índices (use banco-performance)."
---

# Front-end: performance

Regras para entregar telas rápidas de carregar e rápidas de responder, e checklist para revisar diffs que afetam bundle, rede, renderização e Core Web Vitals.
O `implementer` e o `fixer` usam as regras ao construir; o `performance-reviewer` usa o checklist para gerar findings com severidade.
Exemplos em Next.js (App Router) + React + TanStack Query. Em outro stack, aplique o equivalente (Vite/Remix/Nuxt têm os mesmos conceitos).

## Regras inegociáveis

1. **Metas de Core Web Vitals no p75 de usuários reais: LCP < 2,5s, INP < 200ms, CLS < 0,1.** São as métricas que o usuário sente e que o Google usa.
2. **Server Component por padrão; `"use client"` só na folha interativa.** Cada Client Component e suas dependências vão para o bundle JS que o navegador baixa, parseia e hidrata.
3. **Nenhuma lib pesada no bundle do cliente sem justificativa.** moment, lodash inteiro, SDKs de gráfico ou editor carregados na rota inicial derrubam LCP e INP.
4. **Imagens com `next/image` (ou equivalente) com dimensões declaradas; a imagem LCP com prioridade e sem lazy.** Imagem sem dimensão causa CLS; LCP lazy atrasa a métrica principal.
5. **Buscas independentes em paralelo.** `await` em sequência para dados que não dependem um do outro cria waterfall que soma latências.
6. **Nada de chamada redundante.** Mesma query duas vezes no request, fetch a cada tecla sem debounce e polling agressivo multiplicam carga e latência.
7. **Lista potencialmente grande é paginada ou virtualizada.** Renderizar milhares de linhas trava a thread principal e estoura o INP.
8. **Trabalho pesado fora da thread principal.** Cálculo de relatório, parsing de CSV grande e compressão de imagem vão para servidor ou Web Worker.
9. **Animar apenas `transform` e `opacity`.** Animar `width`, `top` ou `height` força layout a cada frame.
10. **Scripts de terceiros carregados tarde (`lazyOnload`/`afterInteractive`) e só onde usados.** Chat, analytics e pixels no `<head>` bloqueiam render.
11. **Fontes via `next/font` (self-hosted, subset, `display: 'swap'`).** Fonte externa sem preload causa texto invisível e CLS.
12. **Otimização se prova com medida.** `useMemo`/`memo` espalhados sem Profiler adicionam custo e complexidade; meça antes e depois.
13. **Operação que não pode parar (PDV) funciona offline.** Queda de internet no caixa não pode impedir a venda; fila local com sincronização idempotente.

## Como construir

### Renderização por página
- Página de conteúdo estável (landing, catálogo público): estática (SSG) ou ISR com `export const revalidate = <segundos>` ou revalidação por tag.
- Página autenticada com dado do usuário: dinâmica (SSR) com streaming. Envolva regiões lentas em `<Suspense fallback={<Skeleton />}>` para o shell aparecer rápido.
- `loading.tsx` no segmento dá feedback instantâneo na navegação.
- Tela altamente interativa (PDV): shell em RSC + ilha client com TanStack Query.
- Não torne a rota inteira dinâmica por ler `cookies()`/`headers()` num layout alto sem necessidade.

### Bundle e code splitting
- `"use client"` no menor componente possível; passe Server Components como `children` para Client Components.
- Componente pesado e não crítico (gráfico, editor rich text, mapa, modal raro): `next/dynamic(() => import(...))`. `ssr: false` só dentro de Client Component e só para o que depende de `window`.
- Import pontual: `import debounce from 'lodash/debounce'` ou `es-toolkit`; datas com `date-fns`/`dayjs` em vez de `moment`.
- Rode `@next/bundle-analyzer` (`ANALYZE=true`) quando adicionar dependência client. Registre o tamanho antes/depois no relatório.
- `experimental.optimizePackageImports` para libs de ícones/barrel files, se o projeto usa.
- Nunca importe módulo de servidor (Prisma, SDKs) em Client Component; use `import 'server-only'` nos módulos de servidor.

### Imagens e mídia
- `next/image` com `width`/`height` ou `fill` + container com tamanho; `sizes` correto em imagens responsivas.
- Imagem LCP (hero, foto principal do produto): `priority` (ou `preload`/`fetchPriority="high"` conforme a versão do Next.js). As demais ficam lazy (padrão).
- Formatos AVIF/WebP via `images.formats` no `next.config`; fotos de produto redimensionadas no upload, não servidas originais de 5 MB.
- Vídeo com `preload="none"` e poster.

### Fontes
- `next/font/google` ou `next/font/local` com `subsets: ['latin']`, `display: 'swap'` e só os pesos usados.
- Uma família para texto e no máximo uma para títulos.

### Rede e dados
- RSC: `Promise.all` para buscas independentes; `cache()` do React para deduplicar a mesma leitura no request.
- Cliente: TanStack Query deduplica por `queryKey`; defina `staleTime` para evitar refetch a cada foco/montagem.
- Busca por digitação: debounce de 250 a 400 ms e `AbortController` (o `signal` do Query faz isso).
- Scroll/resize: throttle ou `requestAnimationFrame`; prefira `IntersectionObserver` para detectar visibilidade.
- Tempo real: SSE/WebSocket em vez de `refetchInterval` curto.
- `<Link>` do Next.js faz prefetch de rotas visíveis; `router.prefetch` para a próxima ação provável.
- Não busque no cliente o que o servidor já entregou na página.

### Renderização no cliente
- Meça com React DevTools Profiler antes de otimizar.
- Estado o mais local possível; Context com valor estável (`useMemo` no value) e dividido por frequência de mudança.
- `memo` em item de lista grande ou componente caro que recebe props estáveis; `useCallback`/`useMemo` para manter essas props estáveis. Se o projeto usa React Compiler, não adicione memo manual.
- Listas com centenas+ de itens: `@tanstack/react-virtual` ou paginação/infinite scroll.
- `useTransition`/`useDeferredValue` para manter digitação responsiva enquanto filtra lista grande.
- Web Worker para processamento acima de ~50 ms (INP).

### Cache e entrega
- Assets com hash no nome: `Cache-Control: public, max-age=31536000, immutable` (Next.js faz em `/_next/static`).
- HTML dinâmico autenticado: `private, no-store`. Nunca cache público em página com dado do usuário.
- Compressão Brotli/gzip na CDN. `preconnect` para origens críticas de terceiros.

### Offline-first (PDV)
- Service Worker (Serwist/Workbox) cacheia o shell e o catálogo; IndexedDB guarda vendas pendentes.
- Cada venda offline tem id gerado no cliente (UUID) usado como idempotency key no servidor.
- Indicador visível de modo offline e de itens pendentes de sincronização.
- Detalhes em [references/offline-first-pdv.md](references/offline-first-pdv.md).

## Checklist de revisão

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | Critério de aceite de performance (ex.: "carrega em < 2s", "funciona offline") não atendido ou não medido | urgente |
| 2 | Venda/operação do PDV depende de rede sem fila offline quando o critério exige operação contínua | urgente |
| 3 | HTML ou resposta com dado do usuário/tenant servida com cache público (CDN) | urgente |
| 4 | Lista sem paginação nem virtualização para dados que crescem sem limite | alto |
| 5 | `await`s sequenciais de buscas independentes (waterfall) em página ou rota quente | alto |
| 6 | Fetch por tecla sem debounce ou sem cancelamento | alto |
| 7 | Polling com intervalo curto (< 10s) sem necessidade de tempo real ou sem pausa em aba oculta | alto |
| 8 | Lib pesada nova no bundle client (moment, lodash inteiro, SDK grande) sem dynamic import | alto |
| 9 | `"use client"` em página/layout inteiro puxando árvore grande para o cliente | alto |
| 10 | Módulo de servidor (Prisma, SDK com segredo) importado em Client Component | alto |
| 11 | Imagem LCP com lazy loading ou sem prioridade | medio |
| 12 | `<img>` cru ou `next/image` sem dimensões/`sizes` (risco de CLS e imagem superdimensionada) | medio |
| 13 | Mesma leitura feita mais de uma vez no request sem `cache()`/dedupe | medio |
| 14 | Query client sem `staleTime` em dado estável, gerando refetch constante | medio |
| 15 | Componente pesado não crítico (gráfico, editor, mapa) carregado estaticamente na rota inicial | medio |
| 16 | Script de terceiro sem `next/script` ou com estratégia `beforeInteractive` sem necessidade | medio |
| 17 | Fonte carregada por `<link>` externo em vez de `next/font` | medio |
| 18 | Animação de propriedade de layout (`width`, `height`, `top`, `left`, `margin`) | medio |
| 19 | Processamento síncrono pesado em handler de evento (parse, sort de milhares de itens) | medio |
| 20 | Context com value recriado a cada render alimentando árvore grande | medio |
| 21 | Conteúdo inserido acima do conteúdo existente sem espaço reservado (CLS) | medio |
| 22 | Layout alto lendo `cookies()`/`headers()` e tornando dinâmicas rotas que poderiam ser estáticas | medio |
| 23 | Listener de `scroll`/`resize` sem throttle ou sem `passive` | baixo |
| 24 | `memo`/`useMemo`/`useCallback` adicionados sem medição ou onde não há ganho | baixo |
| 25 | Falta `preconnect` para origem crítica de terceiro | baixo |
| 26 | Dependência nova sem registro de impacto no bundle no relatório | baixo |

## Anti-padrões (errado → certo)

### Waterfall no Server Component

```tsx
// errado: 3 latências somadas
const vendas = await vendasService.doDia(tenantId);
const metas = await metasService.doMes(tenantId);
const caixa = await caixaService.atual(tenantId);

// certo: em paralelo
const [vendas, metas, caixa] = await Promise.all([
  vendasService.doDia(tenantId),
  metasService.doMes(tenantId),
  caixaService.atual(tenantId),
]);
```

### Página inteira no cliente

```tsx
// errado: app/relatorios/page.tsx com 'use client' no topo, busca em useEffect e gráfico estático

// certo: página RSC busca; só o gráfico é client e carregado sob demanda
// app/relatorios/page.tsx
import dynamic from 'next/dynamic';
const GraficoVendas = dynamic(() => import('@/modules/relatorios/ui/grafico-vendas'), {
  loading: () => <Skeleton className="h-72" />,
});
export default async function Page() {
  const dados = await relatoriosService.vendasPorDia(await tenantAtual());
  return <GraficoVendas dados={dados} />;
}
```

### Busca a cada tecla

```tsx
// errado
const { data } = useQuery({ queryKey: ['clientes', termo], queryFn: () => buscar(termo) });

// certo: debounce + mínimo de caracteres; o signal cancela a anterior
const termoDebounced = useDebouncedValue(termo, 300);
const { data } = useQuery({
  queryKey: ['clientes', tenantId, termoDebounced],
  queryFn: ({ signal }) => buscarClientes(termoDebounced, { signal }),
  enabled: termoDebounced.length >= 2,
  staleTime: 60_000,
});
```

### Imagem que causa CLS e atrasa LCP

```tsx
// errado
<img src={produto.fotoUrl} loading="lazy" />

// certo (foto principal, acima da dobra)
<Image src={produto.fotoUrl} alt={produto.nome} width={800} height={800}
  sizes="(max-width: 768px) 100vw, 50vw" priority />
```

### Lista gigante renderizada inteira

```tsx
// errado: 5.000 produtos no DOM
{produtos.map((p) => <LinhaProduto key={p.id} produto={p} />)}

// certo: virtualização
const virtualizer = useVirtualizer({
  count: produtos.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 48,
});
// renderiza só virtualizer.getVirtualItems()
```

## Referências

- [references/core-web-vitals-e-medicao.md](references/core-web-vitals-e-medicao.md): leia quando precisar diagnosticar LCP/INP/CLS, medir com Lighthouse/RUM ou provar ganho no pacote de provas.
- [references/nextjs-renderizacao-e-bundle.md](references/nextjs-renderizacao-e-bundle.md): leia quando escolher SSG/ISR/SSR, configurar cache, dynamic import, bundle analyzer, imagens, fontes e scripts.
- [references/offline-first-pdv.md](references/offline-first-pdv.md): leia quando o card envolver PDV, caixa, operação offline, Service Worker ou IndexedDB.

Skills vizinhas: `frontend-engenharia` (estado e fluxo), `backend-performance` (latência da API), `banco-performance` (N+1, índices), `devops-observabilidade-lgpd` (RUM, alertas).
