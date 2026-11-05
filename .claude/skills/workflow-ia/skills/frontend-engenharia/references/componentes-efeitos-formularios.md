# Componentes, efeitos, formulários e erros

Guia aprofundado para escrever componentes React previsíveis e testáveis.

## 1. Composição de componentes

- Um componente, uma responsabilidade. Separe "container" (busca/estado) de "apresentação" (props -> JSX) quando isso simplificar o teste.
- Extraia hook quando houver estado + efeito + handlers relacionados (`useLeitorCodigoBarras`, `useCarrinho`).
- Prefira composição (`children`, slots) a props booleanas em cascata (`showHeader`, `showFooter`, `compact`, `withBorder`...).
- Props de callback nomeadas por intenção: `onConfirmarVenda`, não `onClick2`.
- Evite prop drilling profundo com composição antes de recorrer a Context.
- Componentes definidos dentro de outro componente são recriados a cada render e perdem estado. Declare no módulo.

## 2. useEffect: quando e como

Use efeito apenas para sincronizar com algo externo ao React: DOM imperativo, subscription, timer, WebSocket, biblioteca não React, analytics.

Não use efeito para:
- Derivar estado de props/estado (calcule no render).
- Reagir a evento do usuário (faça no handler).
- Buscar dado que pode vir do servidor (RSC) ou de TanStack Query.
- Resetar estado quando uma prop muda (use `key`).
- Notificar o pai de mudança de estado (chame o callback no handler que mudou o estado).

### Fetch manual (quando não há Query disponível)

```tsx
useEffect(() => {
  const controller = new AbortController();
  setStatus('carregando');
  fetch(`/api/clientes/${id}`, { signal: controller.signal })
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    })
    .then((json) => {
      setCliente(clienteSchema.parse(json));
      setStatus('ok');
    })
    .catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setStatus('erro');
    });
  return () => controller.abort();
}, [id]);
```

### Subscriptions e timers

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => { if (e.key === 'F2') abrirBusca(); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [abrirBusca]);
```

- Com React Strict Mode em dev, efeitos montam, desmontam e montam de novo. Se isso quebra algo, falta cleanup.
- Para ler o valor mais recente dentro de listener sem re-registrar, use `useRef` atualizado no render ou `useEffectEvent` quando disponível na versão do React do projeto.

## 3. Keys

- Use o id do domínio (`produto.id`). Para itens sem id (linha nova de formulário), gere `crypto.randomUUID()` na criação do item e guarde no objeto.
- Índice como key só em lista estática que nunca reordena, filtra ou insere no meio.
- `key` também serve para resetar um componente: `<FormularioCliente key={clienteId} />`.

## 4. Formulários com Zod compartilhado

```ts
// modules/clientes/schemas.ts
import { z } from 'zod';

export const clienteSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome completo'),
  email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
  telefone: z.string().regex(/^\d{10,11}$/, 'Use DDD + número, só dígitos'),
  limiteCreditoCentavos: z.coerce.number().int().min(0),
});
export type ClienteInput = z.infer<typeof clienteSchema>;
```

```tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { clienteSchema, type ClienteInput } from '../schemas';

export function FormCliente({ onSalvar }: { onSalvar: (d: ClienteInput) => Promise<{ ok: boolean; message?: string }> }) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } =
    useForm<ClienteInput>({ resolver: zodResolver(clienteSchema) });

  const submit = handleSubmit(async (dados) => {
    const r = await onSalvar(dados);
    if (!r.ok) setError('root', { message: r.message ?? 'Não foi possível salvar.' });
  });

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="nome">Nome</label>
      <input id="nome" {...register('nome')} aria-invalid={!!errors.nome} aria-describedby="nome-erro" />
      {errors.nome && <p id="nome-erro">{errors.nome.message}</p>}
      {/* demais campos */}
      {errors.root && <p role="alert">{errors.root.message}</p>}
      <button type="submit" disabled={isSubmitting}>Salvar</button>
    </form>
  );
}
```

Com Server Action pura, use `useActionState(action, null)` e `useFormStatus()` (de `react-dom`) no botão para o estado pendente. Erros de campo vêm do retorno da action.

Regras:
- O servidor revalida com o mesmo schema. Validação só no cliente é finding urgente se a action/rota não validar.
- Mensagens de erro em pt-BR, específicas e acionáveis.
- Máscaras (CPF, telefone, moeda) formatam a exibição; o valor enviado é normalizado (só dígitos, centavos).
- Upload: valide tipo e tamanho no cliente para UX; o servidor valida magic bytes e tamanho de novo.

## 5. Error boundaries

Next.js App Router:
- `app/(app)/vendas/error.tsx` isola falhas do segmento `vendas`.
- `error.tsx` precisa de `"use client"` e recebe `{ error, reset }`. Em produção, `error.message` de erros do servidor é genérico; use `error.digest` para correlacionar com o log.
- `global-error.tsx` cobre o layout raiz e precisa renderizar `<html>` e `<body>`.
- `notFound()` de `next/navigation` + `not-found.tsx` para recurso inexistente ou de outro tenant (não revela existência).

Cliente:

```tsx
import { ErrorBoundary } from 'react-error-boundary';

<ErrorBoundary
  fallbackRender={({ resetErrorBoundary }) => (
    <div role="alert">
      <p>Não foi possível carregar o gráfico de vendas.</p>
      <button onClick={resetErrorBoundary}>Tentar novamente</button>
    </div>
  )}
  onError={(error) => reportarErro(error)}
>
  <GraficoVendas />
</ErrorBoundary>
```

Boundaries não capturam erro em handler de evento nem em código assíncrono fora do render: trate com try/catch e estado.

## 6. Estados de UI por componente

Modele o estado como union discriminada, não como vários booleanos que podem entrar em combinação impossível:

```ts
type Estado<T> =
  | { tipo: 'carregando' }
  | { tipo: 'vazio' }
  | { tipo: 'erro'; mensagem: string; tentarDeNovo: () => void }
  | { tipo: 'ok'; dados: T; parcial?: boolean };
```

Critério de aceite com "exibir mensagem quando não houver itens" exige estado vazio implementado e testado.

## 7. Testes de componente (para o test-writer)

- Testing Library com queries por papel e nome: `getByRole('button', { name: 'Salvar' })`. Isso também valida acessibilidade básica.
- Teste os estados: loading, vazio, erro com retry, sucesso, submit desabilitado durante envio.
- Mock de rede com MSW em vez de mockar `fetch` à mão.
- Teste de formulário: envia inválido e vê mensagem; envia válido e vê chamada com payload normalizado.
- Fluxos críticos ponta a ponta (venda, fechamento de caixa) ficam em Playwright.
- Nome do teste referencia o critério: `it('[CA-2] mostra estado vazio quando não há vendas no dia')`.
