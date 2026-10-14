# SimpleClick

Vitrine, catálogo e pedidos para pequenas lojas. A loja ganha uma vitrine na internet, o cliente monta o pedido e envia pelo WhatsApp, e o dono acompanha tudo num painel.

- `apps/web`: site em Next.js + Tailwind (vitrine, painel, conta, administração).
- `apps/api`: API em Express, rotas em `/v1`.
- `packages/database`: PostgreSQL com Prisma (migrações em SQL e dados de exemplo).
- `packages/contracts`, `packages/core`, `packages/ui`: contrato (Zod), regras puras e componentes.

## Como subir na sua máquina

Precisa de Node 24, pnpm 11 e Docker.

```bash
pnpm install                         # dependências e cliente do Prisma
bash infra/scripts/setup.sh          # cria infra/compose/.env.compose e o certificado local
cp .env.example .env                 # preencha os valores
bash infra/scripts/up.sh core test   # banco, Redis e banco de teste
pnpm --filter @simpleclick/database migrar   # aplica as migrações
pnpm --filter @simpleclick/database seed     # dados de exemplo
pnpm dev                             # site em :3000 e API em :3001
```

## Scripts

| Comando                     | O que faz                                     |
| --------------------------- | --------------------------------------------- |
| `pnpm dev`                  | site e API em modo de desenvolvimento         |
| `pnpm build` / `pnpm start` | compila e roda site e API                     |
| `pnpm typecheck`            | confere os tipos                              |
| `pnpm lint` / `pnpm format` | ESLint e Prettier                             |
| `pnpm test:unit`            | testes de unidade                             |
| `pnpm test:int`             | testes contra banco e Redis (precisa do `up`) |

Planos, especificação e o README antigo, mais detalhado, ficam em `arquivo/`, só para consulta.
