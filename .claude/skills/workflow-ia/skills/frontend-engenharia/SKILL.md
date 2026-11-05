---
name: frontend-engenharia
description: "Engenharia de front-end React/Next.js: arquitetura de componentes, estado de servidor vs estado de cliente (RSC, TanStack Query, Server Actions), estados de UI (loading, vazio, erro, sucesso, parcial), useEffect correto com cleanup e AbortController, formulários com schema Zod compartilhado, error boundaries, optimistic updates com rollback, TypeScript strict e design system. Use quando o diff tocar arquivos .tsx/.jsx, pastas app/ ou components/, hooks, stores (Zustand/Redux/Context), formulários, mutations ou telas novas. Não use para velocidade de carregamento e re-render (use frontend-performance), XSS/CSP/cookies (use frontend-seguranca) nem teclado/contraste/ARIA (use acessibilidade-ux)."
---

# Front-end: engenharia

Regras para construir interfaces React/Next.js corretas, previsíveis e fáceis de manter, e checklist para revisar diffs de front-end.
O `implementer`, o `test-writer` e o `fixer` usam as seções "Regras" e "Como construir"; o `quality-reviewer` e o `test-reviewer` usam o "Checklist de revisão" para gerar findings com severidade.
Exemplos em Next.js (App Router) + TypeScript + TanStack Query + Zod. Em outro stack, aplique o equivalente.

## Regras inegociáveis

1. **Estado de servidor não é estado de cliente.** Dado que vem da API vive em RSC, TanStack Query ou SWR; copiar para Redux/Zustand/useState cria duas fontes da verdade que divergem.
2. **Regra de negócio fora do componente.** Cálculo de preço, desconto, estoque e permissão fica no domínio/servidor; o componente só apresenta e coleta intenção.
3. **Todo dado assíncrono renderiza todos os estados: loading, vazio, erro, sucesso e parcial.** Estado não tratado vira tela branca ou dado errado mostrado como certo.
4. **Validação dupla com o mesmo schema Zod.** O cliente valida para UX; o servidor valida sempre, porque o cliente é controlado pelo usuário.
5. **useEffect não deriva estado nem busca dado sem cleanup.** Estado derivado é calculado no render; efeito com fetch precisa de AbortController ou flag de cancelamento para evitar race condition.
6. **Keys estáveis e únicas em listas.** Índice ou `Math.random()` como key embaralha estado de inputs e quebra animações ao reordenar.
7. **Toda mutation trata falha.** Optimistic update sem rollback deixa a UI mentindo; mutation sem `onError` engole erro de negócio (estoque insuficiente, caixa fechado).
8. **TypeScript strict sem `any`, sem `as` para calar o compilador e sem `!` injustificado.** O tipo é o contrato; burlá-lo move o bug para produção.
9. **Dados de fronteira são validados, não confiados.** Resposta de API, `searchParams`, `localStorage` e `postMessage` passam por schema antes de uso tipado.
10. **Error boundary em cada região que pode falhar isoladamente.** Uma exceção de render sem boundary derruba a página inteira.
11. **Server Action e Route Handler são endpoints públicos.** Validam entrada, autenticam e autorizam por conta própria; esconder o botão não protege nada.
12. **Sem segredo, `passwordHash` ou dado de outro tenant serializado para o cliente.** Props de Client Component viajam no payload RSC e ficam visíveis no navegador.
13. **Tokens do design system, não valores mágicos.** Cor, espaçamento e tipografia vêm dos tokens/componentes base; hex solto quebra tema e consistência.

## Como construir

### Onde cada coisa mora
- Página (`app/**/page.tsx`) é Server Component por padrão: busca dados chamando o service/use case direto, sem `fetch` para a própria API.
- Client Component só para interatividade (estado local, eventos, hooks de browser). Coloque `"use client"` na folha, não na página.
- Lógica de tela em hooks (`useCarrinho`, `useFiltroProdutos`); componente com mais de ~150 linhas ou mais de uma responsabilidade é dividido.
- Chamadas HTTP do cliente centralizadas em um módulo `api/` ou em `queryOptions` reutilizáveis; nada de `fetch` espalhado em componentes.
- Estrutura sugerida: `src/app` (rotas), `src/modules/<modulo>/ui` (componentes do módulo), `src/components/ui` (design system), `src/lib` (utilitários). Siga a estrutura existente no projeto quando divergir.

### Estado
- Classifique antes de codar: servidor (lista de produtos), URL (filtro, página, aba), formulário (campos), UI efêmera (modal aberto), global de cliente (tema, carrinho não persistido).
- Filtro, busca, paginação e aba ativa vão na URL (`searchParams`): compartilhável, sobrevive a refresh e ao botão voltar.
- Context só para valores que mudam pouco (tema, usuário logado, tenant). Context com valor que muda a cada tecla re-renderiza a árvore toda.
- Store global (Zustand) só para estado de cliente realmente compartilhado entre regiões distantes. Nunca para cache de API.
- Após mutation, invalide ou atualize o cache (`invalidateQueries`, `revalidatePath`, `revalidateTag`, `router.refresh()`), não recarregue manualmente em `useEffect`.

### Busca de dados
- RSC: `await` direto no componente, com `Promise.all` para buscas independentes e `Suspense` para streaming.
- Cliente: TanStack Query com `queryKey` que inclui todos os parâmetros (tenant, filtros, página). Key incompleta mostra dado de outro filtro.
- Passe o `signal` do `queryFn` para o `fetch`: a query cancelada aborta a requisição.
- `staleTime` explícito por tipo de dado (catálogo pode ser minutos; saldo de caixa, zero).
- Resposta validada com Zod na borda do cliente HTTP; o resto do app recebe tipo confiável.

### Estados de UI
- Loading: skeleton no formato do conteúdo; em RSC, `loading.tsx` ou `Suspense` com fallback.
- Vazio: mensagem e ação ("Nenhum produto cadastrado. Cadastrar produto").
- Erro: mensagem humana, botão de tentar de novo, detalhe técnico só em log.
- Parcial: parte carregou e parte falhou (ex.: vendas ok, gráfico falhou). Cada região com seu boundary.
- Sucesso de mutation: feedback visível (toast, mudança de estado) e botão desabilitado durante envio para evitar duplo submit.

### Efeitos
- Pergunte: "isso sincroniza com um sistema externo?" Se não, não é efeito.
- Estado derivado: calcule no render (`const total = itens.reduce(...)`); se caro, `useMemo`.
- Resetar estado quando uma prop muda: use `key` no componente, não efeito.
- Todo `addEventListener`, `setInterval`, `subscribe` e `WebSocket` tem cleanup no retorno do efeito.
- Dependências completas (regra `react-hooks/exhaustive-deps` ligada). Desabilitar a regra exige comentário justificando.

### Formulários
- Um schema Zod por comando, em arquivo compartilhado (`modules/<modulo>/schemas.ts`), importado pelo form e pela Server Action/rota.
- Formulário com `react-hook-form` + `zodResolver` ou `useActionState` com Server Action; erros de campo exibidos junto ao campo.
- Server Action retorna estado tipado (`{ ok: true } | { ok: false, fieldErrors, message }`), não lança erro de validação para o cliente.
- Dinheiro trafega como centavos inteiros ou string decimal; converta para exibição com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Datas trafegam em ISO UTC; formate no fuso do usuário só na exibição.

### Erros
- `error.tsx` por segmento de rota relevante (é Client Component e recebe `error` e `reset`); `global-error.tsx` para o layout raiz; `not-found.tsx` para 404.
- Em regiões client, `react-error-boundary` com fallback e reset.
- Erro de domínio (estoque insuficiente) vira mensagem específica; erro técnico vira mensagem genérica + log/Sentry.
- Nunca `catch {}` vazio. Nunca `console.log(error)` como único tratamento.

### TypeScript e design system
- `strict: true`, `noUncheckedIndexedAccess` recomendado. Tipos derivados do schema com `z.infer`.
- Props com tipos explícitos; union discriminada para variantes (`{ status: 'erro'; mensagem: string } | { status: 'ok'; dados: Venda[] }`).
- Componentes base (Button, Input, Dialog, Table) do design system; variantes via props, não CSS copiado.
- Tokens em CSS variables/tema Tailwind. Nada de `#3b82f6` solto no JSX.

## Checklist de revisão

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | Server Action ou Route Handler novo sem validação Zod da entrada no servidor | urgente |
| 2 | Server Action ou Route Handler sem checagem de autenticação/autorização e tenant | urgente |
| 3 | Props de Client Component ou retorno de action expondo segredo, `passwordHash` ou dado de outro tenant | urgente |
| 4 | Critério de aceite de UI não implementado (estado, mensagem ou fluxo exigido ausente) | urgente |
| 5 | Regra de negócio (preço, desconto, total, permissão) calculada só no componente e enviada ao servidor como verdade | alto |
| 6 | Dado de API copiado para Redux/Zustand/useState e mantido em paralelo ao cache | alto |
| 7 | Tela assíncrona sem estado de erro ou sem estado vazio | alto |
| 8 | Optimistic update sem rollback em `onError` | alto |
| 9 | `useEffect` com fetch sem AbortController/flag de cancelamento (race condition) | alto |
| 10 | Botão de submit não desabilitado durante envio em operação não idempotente (venda, pagamento) | alto |
| 11 | `queryKey` sem todos os parâmetros usados no `queryFn` (tenant, filtros, página) | alto |
| 12 | Mutation sem invalidação/atualização do cache afetado | medio |
| 13 | `useEffect` usado para derivar estado de props/estado | medio |
| 14 | Listener, timer ou subscription sem cleanup | medio |
| 15 | `any`, `as Tipo` ou `!` sem justificativa em código novo | medio |
| 16 | Resposta de API, `searchParams` ou `localStorage` usados sem validação de schema | medio |
| 17 | Key de lista por índice em lista reordenável/filtrável, ou key instável | medio |
| 18 | Região que pode falhar sem error boundary (`error.tsx` ou `ErrorBoundary`) | medio |
| 19 | `"use client"` na página/layout inteiro quando só uma folha precisa | medio |
| 20 | `catch` vazio ou erro só logado sem feedback ao usuário | medio |
| 21 | Filtro/paginação/aba em estado local em vez de URL | medio |
| 22 | Schema do formulário duplicado em vez de compartilhado com o servidor | medio |
| 23 | Dinheiro em `number` com casas decimais (float) ou formatado manualmente | medio |
| 24 | `react-hooks/exhaustive-deps` desabilitado sem comentário | baixo |
| 25 | Cor, espaçamento ou fonte hardcoded em vez de token/componente base | baixo |
| 26 | Componente com múltiplas responsabilidades ou acima de ~200 linhas | baixo |
| 27 | Naming inconsistente com o restante do módulo | baixo |

## Anti-padrões (errado → certo)

### Estado derivado em efeito

```tsx
// errado: render extra e estado que pode divergir
const [total, setTotal] = useState(0);
useEffect(() => {
  setTotal(itens.reduce((s, i) => s + i.precoCentavos * i.quantidade, 0));
}, [itens]);

// certo: calcule no render
const totalCentavos = itens.reduce((s, i) => s + i.precoCentavos * i.quantidade, 0);
```

### Fetch em efeito com race condition

```tsx
// errado: resposta lenta da busca antiga sobrescreve a nova
useEffect(() => {
  fetch(`/api/produtos?q=${q}`).then((r) => r.json()).then(setProdutos);
}, [q]);

// certo: TanStack Query cancela e deduplica
const { data, isPending, isError } = useQuery({
  queryKey: ['produtos', tenantId, q],
  queryFn: ({ signal }) =>
    fetch(`/api/produtos?q=${encodeURIComponent(q)}`, { signal })
      .then((r) => r.json())
      .then((json) => produtosSchema.parse(json)),
});
```

### Cache de API duplicado em store

```tsx
// errado: duas fontes da verdade
const { data } = useQuery({ queryKey: ['clientes'], queryFn: listarClientes });
useEffect(() => { if (data) useStore.getState().setClientes(data); }, [data]);

// certo: consuma o cache onde precisar, com a mesma queryKey
export const clientesQuery = queryOptions({ queryKey: ['clientes'], queryFn: listarClientes });
const { data } = useQuery(clientesQuery);
```

### Server Action confiando no cliente

```ts
// errado: total vem do cliente, sem validação nem autorização
'use server';
export async function finalizarVenda(input: { itens: Item[]; totalCentavos: number }) {
  await prisma.venda.create({ data: input as any });
}

// certo: valida, autoriza, recalcula no servidor
'use server';
export async function finalizarVenda(raw: unknown) {
  const sessao = await exigirSessao();
  const parsed = finalizarVendaSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, fieldErrors: parsed.error.flatten().fieldErrors };
  return vendasService.finalizar({ tenantId: sessao.tenantId, operadorId: sessao.userId, itens: parsed.data.itens });
}
```

### Optimistic update sem rollback

```tsx
// errado: se o servidor recusar, a UI continua mostrando o item removido
useMutation({ mutationFn: removerItem, onMutate: (id) => qc.setQueryData(key, (old: Item[]) => old.filter((i) => i.id !== id)) });

// certo
useMutation({
  mutationFn: removerItem,
  onMutate: async (id: string) => {
    await qc.cancelQueries({ queryKey: key });
    const anterior = qc.getQueryData<Item[]>(key);
    qc.setQueryData<Item[]>(key, (old = []) => old.filter((i) => i.id !== id));
    return { anterior };
  },
  onError: (_err, _id, ctx) => qc.setQueryData(key, ctx?.anterior),
  onSettled: () => qc.invalidateQueries({ queryKey: key }),
});
```

## Referências

- [references/estado-e-dados.md](references/estado-e-dados.md): leia quando for decidir onde um estado mora, usar TanStack Query, Server Actions, `revalidatePath`/`revalidateTag` ou implementar optimistic update.
- [references/componentes-efeitos-formularios.md](references/componentes-efeitos-formularios.md): leia quando escrever `useEffect`, formulários com Zod, error boundaries, estados de UI ou testes de componente.
- [references/typescript-design-system.md](references/typescript-design-system.md): leia quando criar tipos de props, componentes base, variantes, tokens ou revisar uso de `any`/`as`.

Skills vizinhas: `frontend-performance` (bundle, CWV, re-render), `frontend-seguranca` (XSS, CSP, sessão), `acessibilidade-ux` (teclado, ARIA, contraste), `api-design-integracoes` (contrato da API consumida), `testes-qualidade` (estratégia de testes).
