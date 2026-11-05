# Estado e dados no front-end

Aprofundamento de onde cada estado mora, como buscar e mutar dados em Next.js App Router com TanStack Query e Server Actions, e como manter a UI consistente com o servidor.

## 1. Mapa de decisão de estado

| Tipo de estado | Exemplo | Onde mora | Nunca |
|---|---|---|---|
| Servidor | produtos, vendas, saldo do caixa | RSC (fetch no servidor) ou TanStack Query | Redux/Zustand/useState como cópia |
| URL | busca, filtro, página, ordenação, aba | `searchParams` / `useSearchParams` | useState que some no refresh |
| Formulário | campos em edição | react-hook-form ou `useActionState` | store global |
| UI efêmera | modal aberto, hover, accordion | useState local | Context global |
| Cliente compartilhado | carrinho do PDV antes de finalizar, tema | Zustand/Context (com persistência se preciso) | misturar com cache de API |
| Sessão | usuário, tenant, permissões | servidor (cookie) + Context só leitura | localStorage com token |

Regra prática: se o dado existe no banco, o cliente tem uma cópia em cache, não a verdade.

## 2. RSC primeiro

```tsx
// app/(app)/produtos/page.tsx — Server Component
import { Suspense } from 'react';
import { exigirSessao } from '@/lib/auth';
import { produtosService } from '@/modules/catalogo/application/produtos-service';
import { ListaProdutos } from '@/modules/catalogo/ui/lista-produtos';
import { filtroProdutosSchema } from '@/modules/catalogo/schemas';

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await exigirSessao();
  const filtro = filtroProdutosSchema.parse(await searchParams); // valida a URL
  const [produtos, categorias] = await Promise.all([
    produtosService.listar(sessao.tenantId, filtro),
    produtosService.categorias(sessao.tenantId),
  ]);
  return <ListaProdutos produtos={produtos} categorias={categorias} filtro={filtro} />;
}
```

Notas:
- Em Next.js 15+, `params` e `searchParams` são Promises. Siga a versão do projeto.
- Não chame `fetch('/api/...')` da própria aplicação dentro de RSC: chame o service direto (menos latência, sem serialização dupla).
- `filtroProdutosSchema` deve usar `z.coerce.number()` para página e `.catch()`/defaults para valores inválidos, para a URL manipulada não quebrar a página.
- Selecione só os campos que a UI usa antes de passar como props. Tudo que vai para Client Component é serializado e visível.

## 3. TanStack Query no cliente

Use quando a tela é altamente interativa (PDV, filtros ao vivo, polling) ou o dado muda sem navegação.

```ts
// modules/vendas/ui/queries.ts
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

const vendaSchema = z.object({
  id: z.string().uuid(),
  totalCentavos: z.number().int(),
  criadaEm: z.string().datetime(),
});

export const vendasDoDiaQuery = (tenantId: string, dia: string) =>
  queryOptions({
    queryKey: ['vendas', tenantId, 'dia', dia],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/vendas?dia=${encodeURIComponent(dia)}`, { signal });
      if (!res.ok) throw new Error(`Falha ao listar vendas (${res.status})`);
      return z.array(vendaSchema).parse(await res.json());
    },
    staleTime: 30_000,
  });
```

Pontos de atenção:
- `queryKey` hierárquica e completa: `[recurso, tenantId, ...parâmetros]`. Invalidação por prefixo (`['vendas', tenantId]`) fica trivial.
- v5: `isPending` (sem dado ainda), `isFetching` (buscando em background), `isError`. `isLoading` = `isPending && isFetching`.
- Paginação sem piscar: `placeholderData: keepPreviousData`.
- `enabled` para queries dependentes; nunca encadeie com `useEffect`.
- `refetchInterval` só onde o dado precisa ser vivo; prefira SSE/WebSocket para tempo real de verdade.
- Hidratação a partir do servidor: `prefetchQuery` no RSC + `HydrationBoundary` com `dehydrate(queryClient)` quando a mesma tela usa Query no cliente.
- Um `QueryClient` por request no servidor e um por aba no cliente (criado em `useState(() => new QueryClient())`), nunca singleton de módulo no servidor.

## 4. Mutations

### Server Action

```ts
// modules/catalogo/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { exigirPermissao } from '@/lib/auth';
import { atualizarPrecoSchema } from './schemas';
import { produtosService } from './application/produtos-service';

export type AtualizarPrecoState =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string[] | undefined> };

export async function atualizarPreco(
  _prev: AtualizarPrecoState | null,
  formData: FormData,
): Promise<AtualizarPrecoState> {
  const sessao = await exigirPermissao('catalogo:editar');
  const parsed = atualizarPrecoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: 'Revise os campos.', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const r = await produtosService.atualizarPreco(sessao.tenantId, parsed.data);
  if (!r.ok) return { ok: false, message: r.mensagem }; // erro de domínio tratado
  revalidatePath('/produtos');
  return { ok: true };
}
```

- Em Zod 4, prefira `z.flattenError(parsed.error)`; `.flatten()` segue funcionando mas está depreciado.
- `Object.fromEntries(formData)` produz strings: o schema faz coerção explícita. Nunca repasse o objeto cru ao Prisma (mass assignment).
- Server Action é endpoint POST público: autentique, autorize e filtre por tenant dentro dela, sempre.
- Erros esperados retornam estado; erros inesperados lançam e caem no `error.tsx`.

### Mutation com TanStack Query

- `mutationFn` chama a API; `onSuccess` invalida as queries afetadas; `onError` mostra mensagem e desfaz optimistic update.
- `mutation.isPending` desabilita o botão. Em operação não idempotente (venda, pagamento), envie uma `Idempotency-Key` gerada uma vez por tentativa de negócio (`crypto.randomUUID()` guardado em ref), não por clique.

## 5. Optimistic updates

Use quando a operação quase sempre dá certo e a latência atrapalha (marcar item, reordenar). Evite em dinheiro, estoque e fechamento de caixa: ali o usuário precisa da confirmação real.

Opção A, TanStack Query (manipula o cache):
1. `onMutate`: `cancelQueries` da key, guarda snapshot, aplica mudança, retorna `{ anterior }`.
2. `onError`: restaura `ctx.anterior` e avisa.
3. `onSettled`: `invalidateQueries` para reconciliar.

Opção B, React 19 `useOptimistic` (estado otimista local enquanto a action roda):

```tsx
'use client';
import { useOptimistic, useTransition } from 'react';

export function ListaTarefas({ tarefas, alternar }: { tarefas: Tarefa[]; alternar: (id: string) => Promise<void> }) {
  const [otimistas, aplicar] = useOptimistic(tarefas, (atual, id: string) =>
    atual.map((t) => (t.id === id ? { ...t, feita: !t.feita } : t)),
  );
  const [, startTransition] = useTransition();
  return otimistas.map((t) => (
    <label key={t.id}>
      <input
        type="checkbox"
        checked={t.feita}
        onChange={() => startTransition(async () => { aplicar(t.id); await alternar(t.id); })}
      />
      {t.titulo}
    </label>
  ));
}
```

Com `useOptimistic`, quando a transição termina o estado volta a refletir `tarefas` vindo do servidor; se a action falhar, trate o erro (toast) porque a reversão é silenciosa.

## 6. Revalidação após mutação

| Situação | Ferramenta |
|---|---|
| Página RSC que mostra o dado | `revalidatePath('/rota')` na Server Action |
| Dado cacheado com tag | `revalidateTag('produtos:tenant-123')` |
| Cliente com TanStack Query | `queryClient.invalidateQueries({ queryKey: [...] })` |
| Forçar RSC a refazer render a partir do cliente | `router.refresh()` |

Tags de cache em multi-tenant incluem o tenant. Tag global invalida o cache de todos os clientes e, pior, uma key sem tenant pode servir dado de um tenant para outro.

## 7. Estado de URL

- Ler: `useSearchParams()` no cliente (componente dentro de `Suspense` em páginas estáticas) ou `searchParams` na página.
- Escrever: `router.replace(pathname + '?' + params.toString())` para filtros digitados (não polui histórico), `router.push` para navegação real.
- Debounce na busca antes de escrever na URL.
- Sempre valide com schema: a URL é entrada do usuário.

## 8. Checklist rápido de dados

- A lista tem paginação e a UI mostra "carregar mais" ou páginas?
- A queryKey muda quando o tenant muda (troca de loja)?
- Ao trocar de tenant/logout, o cache é limpo (`queryClient.clear()`)?
- Existe tratamento para 401 (redireciona ao login) e 403 (mensagem de permissão)?
- A mesma informação não é buscada duas vezes na mesma tela por componentes diferentes com keys diferentes?
