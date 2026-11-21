# Uso de IA neste projeto

Ferramenta: Claude (Sonnet 5.5), como **assistente**: propõe, o autor decide e um teste sustenta. Nenhum dado de cliente, `.env` ou log real foi entregue à IA; só código e dados sintéticos.

> **Para o Arthur confirmar:** os campos "Decisão humana" abaixo estão como **PENDENTE** até você ler, aceitar ou rejeitar e datar. A proposta do agente está escrita, mas a decisão é sua.

A fonte detalhada do registro 1 é a seção 6 de [`docs/estruturacao/06-operacao.md`](estruturacao/06-operacao.md).

## Registro 1 — lacuna de cobertura na regra de preço vigente

| Campo | Registro |
|---|---|
| **Prompt** | "Esta é a função `precoQueVale` e os 10 testes que a cobrem (dados sintéticos: preço de R$ 20,00, promoção de R$ 15,00, datas fixas em 2026). Aponte uma lacuna de cobertura relevante para a operação — um comportamento que a função tem e que nenhum teste prova — e proponha o teste. Não altere a função. Diga qual valor você espera e por quê." |
| **Sugestão recebida** | Os testes provam que o **fim** da janela é exclusivo, mas nenhum prova o **início** nem a **virada** (preço antigo termina em T, novo começa em T). Proposta: 4 testes (início inclusivo; virada sem buraco nem sobreposição; aumento sem encerrar o antigo, o menor vence; voltar atrás com `ativo=false`). |
| **Decisão humana** | **PENDENTE — confirmar:** ____ / data: ____. Proposta do agente: aceitar (o teste não muda código de produção e documenta uma regra com consequência real). |
| **Teste que sustenta** | `apps/api/tests/preco-vigente-virada.test.ts` (4/4 verdes). Prova de que pega defeito: 3 mutações em cópia fora do repositório (início exclusivo, fim inclusivo, `Math.min`→`Math.max`) derrubaram ao menos uma asserção cada. |
| **O que a IA não decidiu** | Se "o menor vence" é desejado para o negócio. Foi documentado como está. |

## Registro 2 — onde ficam as consultas ao banco (Database Pattern)

| Campo | Registro |
|---|---|
| **Prompt** | "Dado o `core/db.ts` e os `*.repo.ts` da API, descreva a decisão de acesso a dados no formato MADR, com a alternativa descartada, citando só o que está no código." |
| **Sugestão recebida** | Registrar Prisma tipado + repositório com SQL cru atrás de um único ponto (`core/db.ts`), descartando "Prisma direto nas rotas", "só `pg`" e "Prisma Migrate". Texto em [ADR 0002](adr/0002-database-pattern-prisma-e-sql.md). |
| **Decisão humana** | **PENDENTE — confirmar:** ____ / data: ____. Proposta do agente: aceitar; a decisão já era o comportamento do código. |
| **Teste que sustenta** | `apps/api/src/core/db.test.ts` e `apps/api/tests/isolamento-entre-lojas-dono.test.ts`. |

## Registro 3 — pattern de design justificado com SOLID

| Campo | Registro |
|---|---|
| **Prompt** | "Escolha, no código da API, um pattern de design que já existe e justifique-o com SOLID, com a alternativa descartada. Não invente: aponte arquivo e linha." |
| **Sugestão recebida** | Strategy/Adapter em `ArmazenamentoDeMidia` (Cloudinary, disco, memória), descartando `if` por ambiente nas rotas e o SDK direto nos casos de uso. Texto em [ADR 0003](adr/0003-ports-e-adapters-solid-armazenamento-de-midia.md). |
| **Decisão humana** | **PENDENTE — confirmar:** ____ / data: ____. |
| **Teste que sustenta** | `apps/api/src/core/armazenamento-de-midia.test.ts`. |

## Registro 4 — estrutura de entrega (este card)

O agente montou o `docker-compose.yml` da raiz, o README, o C4 em `docs/c4/` e o roteiro [`apresentacao.md`](apresentacao.md). **Decisão humana: PENDENTE — confirmar.** Verificação: `docker compose config` resolve os 5 serviços sem duplicar `infra/compose`.
