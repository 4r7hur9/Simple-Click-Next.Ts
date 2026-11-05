# Core Web Vitals: diagnóstico e medição

## 1. As três métricas

| Métrica | Mede | Bom | Precisa melhorar | Ruim |
|---|---|---|---|---|
| LCP (Largest Contentful Paint) | quando o maior elemento visível renderizou | <= 2,5s | 2,5s a 4s | > 4s |
| INP (Interaction to Next Paint) | latência da interação mais lenta (clique, toque, tecla) até o próximo frame | <= 200ms | 200 a 500ms | > 500ms |
| CLS (Cumulative Layout Shift) | soma dos deslocamentos inesperados de layout | <= 0,1 | 0,1 a 0,25 | > 0,25 |

Avalie no percentil 75 de usuários reais, separado por mobile e desktop. Métricas de apoio: TTFB (< 800ms), FCP, TBT (laboratório, correlaciona com INP).

## 2. Diagnóstico de LCP

O LCP se decompõe em quatro partes. Descubra qual domina antes de mexer:
1. **TTFB**: servidor lento, sem cache, região distante, cold start. Solução: cache/ISR, streaming, query mais rápida (ver `backend-performance`, `banco-performance`).
2. **Atraso de carga do recurso**: a imagem LCP é descoberta tarde (CSS background, injetada por JS, lazy). Solução: `<Image priority>`, `preload`, nada de lazy acima da dobra.
3. **Tempo de carga do recurso**: imagem pesada. Solução: AVIF/WebP, `sizes` correto, CDN.
4. **Atraso de render**: JS/CSS bloqueando, fonte bloqueando, hidratação pesada. Solução: menos JS client, `next/font`, scripts de terceiros com `lazyOnload`.

## 3. Diagnóstico de INP

Uma interação tem três fases: atraso de entrada (thread ocupada), processamento (handlers) e apresentação (render + paint).
- Thread ocupada por tarefa longa (> 50ms): quebre o trabalho, mova para Worker, adie com `setTimeout`/`scheduler.yield()` onde suportado.
- Handler caro: evite `JSON.parse` grande, sort de milhares de itens e cálculo síncrono no clique.
- Render caro: re-render de árvore grande porque o estado está alto demais; lista não virtualizada; Context que muda a cada tecla.
- `useTransition` marca a atualização pesada como não urgente e mantém o input responsivo.
- No PDV, leitura de código de barras e digitação de quantidade são interações críticas: o feedback visual precisa ser imediato.

## 4. Diagnóstico de CLS

Causas comuns:
- Imagem, iframe ou vídeo sem dimensões.
- Banner, toast ou aviso inserido acima do conteúdo (use overlay ou espaço reservado).
- Skeleton com altura diferente do conteúdo final.
- Fonte web trocando com métricas diferentes (o `next/font` ajusta fallback com `size-adjust`).
- Conteúdo carregado no cliente empurrando o layout; reserve `min-height`.

## 5. Ferramentas

| Ferramenta | Tipo | Uso |
|---|---|---|
| Lighthouse (Chrome DevTools / CLI) | laboratório | auditoria rápida por página; rode em modo produção (`next build && next start`), nunca em `next dev` |
| Chrome DevTools > Performance | laboratório | tarefas longas, INP por interação, layout shifts marcados |
| WebPageTest | laboratório | filmstrip, waterfall de rede, conexões reais, comparar antes/depois |
| React DevTools Profiler | laboratório | quais componentes renderizam, quanto tempo, por quê |
| `@next/bundle-analyzer` | build | peso por módulo e por rota |
| `web-vitals` / `useReportWebVitals` | RUM | coleta real no navegador do usuário |
| Vercel Speed Insights / Sentry Performance | RUM | p75 por rota, por dispositivo |
| CrUX / PageSpeed Insights | campo | dados reais agregados do Chrome para URLs públicas |

### Coleta RUM no Next.js

```tsx
'use client';
import { useReportWebVitals } from 'next/web-vitals';

export function WebVitals() {
  useReportWebVitals((metric) => {
    const body = JSON.stringify({ name: metric.name, value: metric.value, id: metric.id, rating: metric.rating });
    if (!navigator.sendBeacon?.('/api/vitals', body)) {
      void fetch('/api/vitals', { method: 'POST', body, keepalive: true });
    }
  });
  return null;
}
```

Fora do Next.js, use `onLCP`, `onINP`, `onCLS` da lib `web-vitals`.

## 6. Como provar ganho (para o pacote de provas)

- Rode Lighthouse 3 vezes em build de produção, mesma página, mesmo perfil (mobile, throttling padrão), e registre a mediana antes e depois.
- Registre tamanho do First Load JS da rota (saída de `next build`) antes e depois.
- Para INP, grave um trace no DevTools da interação alvo e anote a duração.
- Para N chamadas redundantes, anexe a contagem de requests na aba Network antes e depois.
- Nunca afirme melhoria sem número. Se não for possível medir no ambiente, diga isso no relatório.

## 7. Orçamentos sugeridos (ajuste por projeto)

- First Load JS por rota: < 150 KB gzip em rota pública; < 250 KB em rota autenticada complexa.
- Imagem hero: < 200 KB. Foto de produto em lista: < 60 KB.
- Nenhuma tarefa longa > 200ms em interação de caixa.
- Requests por tela no carregamento: sem duplicatas para o mesmo recurso.
