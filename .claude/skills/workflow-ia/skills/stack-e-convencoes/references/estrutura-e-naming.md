# Estrutura de pastas e naming

Padrão de referência para projetos Next.js App Router com camada de domínio. Se a codebase já tem outra organização, siga a codebase.

## Árvore de referência

```
src/
  app/
    (loja)/vendas/page.tsx              # página (RSC por padrão)
    (loja)/vendas/actions.ts            # server actions finas: validar, autorizar, chamar caso de uso
    api/v1/vendas/route.ts              # route handler REST
    api/v1/vendas/[id]/route.ts
    api/webhooks/pagamentos/route.ts
    layout.tsx
  modules/
    vendas/
      domain/
        venda.ts                        # entidade/valores e regras puras
        erros.ts                        # erros de domínio do módulo
      application/
        registrar-venda.ts              # caso de uso
        portas.ts                       # interfaces (VendaRepository, GatewayPagamento)
      infra/
        venda-repository-prisma.ts
        gateway-pagamento-adapter.ts
      index.ts                          # só o que outros módulos podem usar
    estoque/
    caixa/
  components/
    ui/                                 # design system (botão, input, tabela)
    vendas/                             # componentes específicos de tela
  lib/
    env.ts                              # validação de env no boot
    prisma.ts                           # instância única do PrismaClient
    logger.ts
    http/problem.ts                     # helper de resposta de erro
  hooks/                                # hooks de UI reutilizáveis
prisma/
  schema.prisma
  migrations/
tests/
  integracao/
  e2e/
```

## O que vai onde

| Tipo de código | Local | Pode importar |
|---|---|---|
| Regra de negócio pura | `modules/<m>/domain` | nada de infra, Next ou Prisma |
| Orquestração de caso de uso | `modules/<m>/application` | `domain`, portas |
| Acesso a banco e fornecedores | `modules/<m>/infra` | Prisma, SDKs, `lib` |
| Rotas, actions, páginas | `app/` | `modules/<m>` via `index.ts`, `lib`, `components` |
| UI | `components/` | `hooks`, tipos públicos; nunca Prisma |
| Utilidade transversal | `lib/` | libs externas; nunca `modules` |

- Um módulo não importa `infra/` nem `domain/` interno de outro módulo; importa apenas o `index.ts` dele.
- `lib/prisma.ts` exporta uma instância única (singleton), para evitar esgotar conexões em dev com hot reload.
- Código que só pode rodar no servidor importa `server-only` no topo do arquivo.

## Naming

| Elemento | Convenção | Exemplo |
|---|---|---|
| Arquivo TS | kebab-case | `registrar-venda.ts` |
| Componente React | kebab-case ou PascalCase, conforme a codebase | `resumo-venda.tsx` / `ResumoVenda.tsx` |
| Tipo, interface, classe | PascalCase | `Venda`, `VendaRepository` |
| Função, variável | camelCase com verbo para funções | `calcularTotal`, `itensVenda` |
| Booleano | prefixo `is`/`has`/`can` ou `deve`/`possui`/`pode` | `isAtivo`, `possuiEstoque` |
| Constante global | UPPER_SNAKE_CASE | `LIMITE_MAXIMO_PAGINA` |
| Schema Zod | sufixo `Schema` | `registrarVendaSchema` |
| Tipo de entrada/saída | sufixo `Input`/`Output` ou `Dto` | `RegistrarVendaInput` |
| Erro | sufixo `Error` ou `Erro` | `EstoqueInsuficienteError` |
| Teste | mesmo nome + `.test.ts` / `.spec.ts` | `registrar-venda.test.ts` |
| Rota REST | substantivo plural, kebab-case | `/api/v1/formas-pagamento` |
| Tabela/coluna | conforme `schema.prisma` existente (`@@map` para snake_case no banco) | `model ItemVenda { @@map("itens_venda") }` |
| Variável de ambiente | UPPER_SNAKE_CASE, prefixo por serviço | `GATEWAY_API_KEY` |

- Identificadores de domínio seguem o idioma da codebase. Se o domínio é em português (`venda`, `caixa`), não crie `Sale` ao lado de `Venda`.
- Nomes descrevem intenção, não tipo (`produtosAtivos`, não `listaArray`).
- Evite abreviações obscuras (`qtd` é aceitável se já usado; `vlrTtlDsc` não).

## Formato único de erro

- Na API HTTP: o padrão da codebase. Se não houver, use Problem Details (RFC 9457) conforme a skill `api-design-integracoes`.
- No código: erros de domínio com classe e código estável; erros técnicos propagam com `cause`. Ver `arquitetura-design`.
- Em Server Actions: retorno tipado `{ ok: true, data } | { ok: false, erro: { codigo, mensagem, campos? } }` ou o padrão da codebase. Não misture `throw` e retorno de erro para o mesmo tipo de falha.

## Testes: localização e nomes

- Unitário ao lado do código (`registrar-venda.test.ts`) ou em `tests/unit`, conforme o projeto.
- Integração com banco real em `tests/integracao` ou sufixo `.int.test.ts`.
- E2E Playwright em `tests/e2e` ou `e2e/`.
- Nome do teste referencia o critério de aceite: `it('[CA-3] recusa desconto acima do limite do perfil', ...)`.
