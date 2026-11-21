# Uso de IA neste projeto

A IA foi usada como **assistente de desenvolvimento**: ela propõe código, texto e testes; o autor decide o que entra; a revisão humana e os testes sustentam o resultado. Não há decisão de produto ou de arquitetura tomada só pela IA: quando ela sugeriu algo, o registro abaixo diz se a decisão foi aceita, e por quem.

> **Para o Arthur confirmar:** os itens marcados como **PREENCHER** e os campos "Decisão humana" estão pendentes até você ler, aceitar ou rejeitar e datar. Também confirme a afirmação de que nenhum dado de cliente, `.env` ou log real foi entregue à IA (o repositório não permite verificar isso).

## Ferramentas e modelos

- **Code Crew (RM Code):** painel onde cada card do board é executado por um agente (Claude ou Codex). Cada agente trabalha numa pasta do repositório, reserva os arquivos que vai editar (para não pisar no trabalho de outro card) e registra o andamento no card.
- **Workflow IA:** plugin de execução de cards com gates, instalado no projeto (`.workflow-ia/config.json`, versionado). A configuração dos gates é editada só por humanos.
- **Modelos usados:** PREENCHER: confirmar os modelos e versões usados em cada agente (o board registra o agente de cada card, não o modelo).

## Como o trabalho foi conduzido

1. **Card com critério.** Cada entrega nasce de um card com o que deve ser feito e como provar. Quando há critério de aceite, ele vira teste com a tag `[CA-n]`.
2. **Reserva de arquivos.** O agente só edita os arquivos que reservou no board; havendo conflito, ele avisa o card dono e espera combinação antes de editar.
3. **Gates e testes.** Typecheck, lint e testes rodam antes de qualquer entrega. A CI do GitHub Actions roda os mesmos gates em cada push ([docs/ci.md](ci.md)).
4. **Revisão humana.** Um card só vai para "Em revisão" depois do agente. Quem confere, aceita ou pede ajuste é o autor. Commit, push e pull request são sempre decisão humana: o agente entrega o branch e o texto do PR, e não publica sozinho.
5. **Regras do Workflow IA** que valem para qualquer agente: não fazer push em branch protegido, não fazer force push, não ler nem editar `.env`, não editar migration já existente no branch base e não usar `--no-verify`.

## O que foi decisão do Arthur e o que foi sugestão da IA

| Tipo | Exemplos neste repositório |
|---|---|
| **Decisão do Arthur** | o produto (vitrine, pedido pelo WhatsApp, painel do dono); o modelo de pedido e de preço; a topologia de ambientes (staging e produção); a escolha de Railway; o escopo de cada entrega; o que entra no merge |
| **Sugerido pela IA e aceito após revisão** | registros 1 a 3 abaixo (testes e ADR), com decisão humana registrada em cada um |
| **Trabalho executado pela IA e revisado** | implementação de cards, scripts de teste, documentação técnica (C4, ADRs, OpenAPI), relatórios de desempenho |

## Registro 1 — lacuna de cobertura na regra de preço vigente

| Campo | Registro |
|---|---|
| **Prompt** | "Esta é a função `precoQueVale` e os 10 testes que a cobrem (dados sintéticos: preço de R$ 20,00, promoção de R$ 15,00, datas fixas em 2026). Aponte uma lacuna de cobertura relevante para a operação — um comportamento que a função tem e que nenhum teste prova — e proponha o teste. Não altere a função. Diga qual valor você espera e por quê." |
| **Sugestão recebida** | Os testes provam que o **fim** da janela é exclusivo, mas nenhum prova o **início** nem a **virada** (preço antigo termina em T, novo começa em T). Proposta: 4 testes (início inclusivo; virada sem buraco nem sobreposição; aumento sem encerrar o antigo, o menor vence; voltar atrás com `ativo=false`). |
| **Decisão humana** | **PENDENTE — confirmar:** ____ / data: ____. Proposta do agente: aceitar (o teste não muda código de produção e documenta uma regra com consequência real). |
| **Teste que sustenta** | `apps/api/tests/preco-vigente-virada.test.ts` (4/4 verdes). Prova de que pega defeito: 3 mutações em cópia fora do repositório (início exclusivo, fim inclusivo, `Math.min`→`Math.max`) derrubaram ao menos uma asserção cada. |
| **O que a IA não decidiu** | Se "o menor vence" é desejado para o negócio. Foi documentado como está. |

A fonte detalhada deste registro é a seção 6 de [`docs/estruturacao/06-operacao.md`](estruturacao/06-operacao.md).

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

## Registro 4 — estrutura de entrega

O agente montou o `docker-compose.yml` da raiz, o README, o C4 em `docs/c4/` e o roteiro [`apresentacao.md`](apresentacao.md). **Decisão humana: PENDENTE — confirmar.** Verificação: `docker compose config` resolve os serviços do compose da raiz sem duplicar `infra/compose`.
