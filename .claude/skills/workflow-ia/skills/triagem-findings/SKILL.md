---
name: triagem-findings
description: "Rubrica única de severidade (urgente, alto, médio, baixo), formato JSON dos findings, taxonomia de categorias, regras de deduplicação, reaproveitamento de IDs entre iterações, critérios de falso positivo e de dívida técnica do Workflow IA. Use quando um revisor for gravar findings, quando o triager consolidar revisões de uma rodada, quando o fixer marcar status ou quando alguém perguntar 'qual a severidade disso'. Não use para decidir o que o agente pode fazer sozinho (use politica-autonomia) nem para gerar o relatório final (use entrega-relatorio)."
---

# Triagem de findings

Todos os revisores usam **a mesma régua**. Sem isso, o loop fica instável: um revisor chama de "alto" o que outro chama de "baixo", e a correção vira sorteio.

## Regras inegociáveis

1. **Severidade pela rubrica, não pela opinião.** Na dúvida entre duas, escolha a maior e justifique na `descricao`.
2. **Todo finding tem evidência verificável:** `arquivo`, `linha` e um trecho do código ou da saída. Sem evidência não há finding.
3. **Todo finding tem recomendação concreta**, que o fixer consegue executar sem adivinhar.
4. **Todo finding aponta a `skill`** que orienta a correção.
5. **Mesmo problema, mesmo `id`.** Na re-revisão, se o problema continua, informe o `id` existente (o registro está em `wf findings listar`). Não crie outro.
6. **Falso positivo precisa de motivo** que um humano aceitaria.
7. **Só um humano aceita risco.** O agente nunca marca `aceito-risco`.
8. **Urgente e alto nunca viram dívida técnica.** A CLI recusa.

## Rubrica

| Severidade | Definição | Exemplos |
|---|---|---|
| **urgente** | Vulnerabilidade explorável, perda ou corrupção de dados, gate quebrado, critério de aceite não atendido | IDOR/BOLA, SQL injection, XSS armazenado, segredo no código ou no bundle, mass assignment de campo sensível, venda sem transação, teste falhando, critério CA-n sem implementação, migration destrutiva |
| **alto** | Risco sério com impacto provável em produção | N+1 em rota quente, login sem rate limit, critério sem teste, falta de lock em concorrência, listagem sem paginação, erro interno exposto ao cliente, chamada externa sem timeout, teste enfraquecido, falta de índice em FK de tabela grande |
| **medio** | Problema real de impacto limitado | Índice faltando em tabela pequena, tratamento de erro incompleto em caminho raro, duplicação relevante, estado de UI faltando (vazio/erro), acessibilidade parcial, bundle maior que o necessário |
| **baixo** | Melhoria ou estilo | Naming, comentário, pequena refatoração, ordem de imports |

**Ajustes de contexto:**
- Superfície pública (sem login) ou dados pessoais/financeiros: suba um nível os achados de segurança médios.
- Código morto, só de teste ou só de desenvolvimento: desça um nível, exceto segredos (sempre urgente).
- "Rota quente" = usada em fluxo principal (login, venda, listagem inicial). Na dúvida, trate como quente.

## Taxonomia de categorias (`<área>/<tema>`)

A área define qual revisor re-revisa depois da correção:

- `seguranca/`: autenticacao, autorizacao, injecao, xss, csrf, segredos, upload, ssrf, exposicao-dados, rate-limit, logica-negocio, dependencias, headers, criptografia
- `performance/`: n-mais-1, indice, query, paginacao, cache, bundle, renderizacao, waterfall, event-loop, pool
- `qualidade/`: arquitetura, camadas, erros, transacao, concorrencia, idempotencia, modelagem, migration, contrato-api, escopo, acessibilidade, estado-ui, tipos, duplicacao
- `testes/`: cobertura-criterio, autorizacao, enfraquecimento, assercao-fraca, flaky, isolamento, e2e
- `operacao/`: pii-log, lgpd, migration-deploy, config-env, observabilidade, resiliencia, health, ci-cd, container (ops-reviewer, revisor condicional)
- `gate/<etapa>` e `verificacao/<tema>`: criados pela CLI e pelo verificador

A CLI recusa área fora desta lista.

**Arquivo que só o humano edita** (`protecoes.arquivosSomenteHumano`: CI, `.husky`, config do Workflow IA): registre o finding normalmente, com `arquivo`, e a severidade da rubrica. Não rebaixe nem mande para dívida técnica por o fixer não poder editar: a CLI tira esses findings do fixer e, se sobrarem só eles, a task para com `CONFIGURACAO_HUMANA` para o humano decidir.

**Fronteiras entre áreas** (na deduplicação, a categoria é a da causa raiz):
- Segredo no código, no bundle ou em `NEXT_PUBLIC_`: `seguranca/segredos`. Dado pessoal em log, Sentry, URL ou analytics: `operacao/pii-log`.
- Dado exposto na resposta da API: `seguranca/exposicao-dados`. Finalidade, retenção e exclusão de dado pessoal: `operacao/lgpd`.
- Constraints, tipos e normalização do schema: `qualidade/modelagem`. Migration que não sobrevive ao deploy (sem expand/contract, sem rollback): `operacao/migration-deploy`.

## Formato de saída de um revisor

Arquivo `.workflow-ia/tasks/<ID>/revisoes/iter-<n>/<revisor>.json`, contendo uma lista:

```json
[
  {
    "id": "F-007",
    "severidade": "urgente",
    "categoria": "seguranca/autorizacao",
    "arquivo": "src/app/api/vendas/[id]/route.ts",
    "linha": 18,
    "descricao": "Busca venda por id sem filtrar por tenant (IDOR): usuário de outra loja lê a venda.",
    "evidencia": "prisma.venda.findUnique({ where: { id } })",
    "recomendacao": "Usar findFirst({ where: { id, tenantId: sessao.tenantId } }) e retornar 404 quando nulo; adicionar teste [CA-3].",
    "skill": "backend-seguranca",
    "revisor": "security-reviewer"
  }
]
```

- `id` só quando for um finding já registrado; omita para novos.
- Lista vazia `[]` é uma resposta válida e desejável quando não há problema.

## Triagem (o que o triager faz)

1. Junte todos os arquivos `iter-<n>/*.json` da rodada, exceto `triagem.json`.
2. **Deduplique:** mesmo arquivo e mesmo problema de raiz, vindos de revisores diferentes, viram um finding só. Fica a maior severidade e a recomendação mais completa; a categoria é a da causa raiz.
3. **Reaproveite IDs:** compare com `wf findings listar`. O mesmo problema de um finding existente leva o `id` dele. Isso é o que permite detectar reabertura e oscilação.
4. **Calibre a severidade** pela rubrica. Registre na `descricao` quando mudar a severidade dada pelo revisor. Um finding **já registrado** como urgente ou alto não é rebaixado pela triagem: a CLI recusa o rebaixamento e mantém o registro como está. Se ele não é problema real, use falso positivo (o verificador-final confirma).
5. **Descarte falsos positivos** incluindo o item com `"status": "falso-positivo"` e `"motivo"` (só para findings abertos; corrigido/verificado não precisa). Falso positivo de urgente ou alto fica pendente até o verificador-final confirmar. Exemplos válidos: o código citado não existe no diff; o risco já é tratado em outra camada, com evidência; o revisor leu errado o fluxo.
6. Grave `triagem.json` e o orquestrador roda `wf findings merge ... --revisados <prefixos>`.

## Dívida técnica

- Só `medio` e `baixo`.
- Vira card no board (skill `integracao-board`) quando o conector permitir. O `--ref` recebe o ID do card criado, ou `pendente`.
- `medio` é corrigido no loop, como os bloqueantes. Dívida técnica para médio é exceção justificada (ex.: fora do escopo do card), nunca saída para o limite de rodadas.
- `baixo` não consome iteração: fica registrado e aparece no relatório.

## Referências

- [references/exemplos-calibracao.md](references/exemplos-calibracao.md): 24 exemplos de findings com a severidade correta e o porquê. Leia quando estiver em dúvida entre duas severidades.
