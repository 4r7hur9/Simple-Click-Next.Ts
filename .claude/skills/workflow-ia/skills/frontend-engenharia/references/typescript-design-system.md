# TypeScript strict e design system no front-end

## 1. Configuração mínima

```jsonc
// tsconfig.json (trecho)
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false // ligar só se o projeto já usa
  }
}
```

ESLint recomendado: `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-non-null-assertion` (warn), `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`. Se o projeto já tem config, siga-a e não afrouxe regras no diff.

## 2. Tipos vêm do contrato

- Tipo de entrada de formulário e de action: `z.infer<typeof schema>`.
- Tipo de saída do servidor para o cliente: DTO explícito (`type ProdutoListaDTO = { id: string; nome: string; precoCentavos: number }`), não o tipo do model Prisma inteiro. Passar `Prisma.Produto` direto acopla a UI ao banco e vaza campos.
- Datas atravessam a fronteira como string ISO; converta explicitamente.
- `Decimal` do Prisma não é serializável para Client Components: converta para string ou centavos no servidor.

## 3. Alternativas a `any` e `as`

| Situação | Em vez de | Use |
|---|---|---|
| JSON externo | `as Produto` | `produtoSchema.parse(json)` |
| Catch | `catch (e: any)` | `catch (e: unknown)` + `instanceof Error` |
| Objeto indexado | `obj[key] as string` | `Record<K, V>` tipado ou `Map`; trate `undefined` |
| Evento | `e: any` | `React.ChangeEvent<HTMLInputElement>` |
| Ref | `ref.current!` | checagem `if (!ref.current) return;` |
| Exaustividade | `default: return null` | `default: { const _x: never = valor; throw new Error(...) }` |
| Literais | `as` em objeto de config | `satisfies Config` |

`as const` e `satisfies` são aceitáveis; o problema é `as` que afirma algo não verificado.

## 4. Props bem tipadas

```tsx
type BotaoProps = React.ComponentPropsWithoutRef<'button'> & {
  variante?: 'primario' | 'secundario' | 'perigo';
  carregando?: boolean;
};

export function Botao({ variante = 'primario', carregando = false, disabled, children, ...rest }: BotaoProps) {
  return (
    <button {...rest} disabled={disabled || carregando} aria-busy={carregando} data-variante={variante}>
      {children}
    </button>
  );
}
```

- Estenda as props nativas para herdar `aria-*`, `type`, `onClick` corretamente.
- Union discriminada para variantes mutuamente exclusivas (`{ modo: 'link'; href: string } | { modo: 'botao'; onClick: () => void }`).
- Evite `React.FC`; declare a função com props tipadas.
- Componente que aceita `ref`: em React 19, `ref` é prop comum; em React 18, `forwardRef`.

## 5. Design system

- Camada base em `src/components/ui` (Button, Input, Select, Dialog, Table, Toast, Skeleton, EmptyState). Se o projeto usa shadcn/ui, Radix ou MUI, estenda os componentes existentes em vez de criar paralelos.
- Tokens como CSS variables (`--cor-primaria`, `--espaco-4`, `--raio-md`) mapeados no tema Tailwind ou no theme provider. Tema escuro troca as variables, não os componentes.
- Variantes com `class-variance-authority` (cva) ou equivalente já presente no projeto.
- Componentes de estado padronizados: `<EmptyState titulo acao />`, `<ErrorState mensagem onRetry />`, `<Skeleton />`. Telas novas usam esses, não markup ad hoc.
- Formatação centralizada: `formatarMoeda(centavos)`, `formatarData(iso)`, usando `Intl` com `pt-BR` e `BRL`.

```ts
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarMoeda = (centavos: number) => brl.format(centavos / 100);
```

## 6. O que o revisor procura

- `any`, `as X`, `!` novos: cada um precisa de motivo. Sem motivo: finding medio.
- `// @ts-ignore` ou `// @ts-expect-error` sem comentário: medio; em código de dinheiro/autorização: alto.
- Tipo do Prisma em props de Client Component: medio (alto se incluir campo sensível).
- Cores hex, `px` mágicos e fontes fora dos tokens: baixo.
- Componente base duplicado (novo `Button` quando já existe um): medio.
