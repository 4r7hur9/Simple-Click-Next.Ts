# Templates de entrega

## pr.md (somente CONCLUIDA)

```markdown
# <tipo>(<ID>): <título curto>

Card: <URL do card>

## O que muda
- <mudança 1, em linguagem de produto>
- <mudança 2>

## Por quê
<1 a 3 linhas do contexto do card>

## Critérios de aceite → testes
| Critério | Testes | Resultado |
|---|---|---|
| CA-1 — <nome> | `tests/...` › [CA-1] ... | ✔ |
| CA-2 — <nome> | ... | ✔ |

## Como testar
1. <passo manual curto, se fizer sentido>
2. Preview: <URL do preview, se houver>

## Provas
- RED: testes falharam no commit `<sha>`; passam no commit `<sha>`
- Gate em checkout limpo: typecheck ✔ · lint ✔ · unitários ✔ · integração ✔ · E2E ✔ · build ✔
- Segurança: SAST <✔/não configurado> · dependências <✔/alerta> · segredos ✔ · autorização ✔
- Performance: <EXPLAIN / bundle / Lighthouse ou "não aplicável">
- Verificação independente: aprovada no commit `<sha>`

## Suposições (revise)
- D-1: <decisão> — <por quê>

## Banco de dados
- Migrations: <nenhuma | lista, todas aditivas>
- Variáveis de ambiente novas: <nenhuma | lista, documentadas em .env.example>

## Pendências
- Dívida técnica: <F-012 → VST-131, ...> ou "nenhuma"

## Ajustes desde a entrega <n>   (só quando a task voltou por ajuste pós-entrega)
- A-<n> — "<feedback do humano, literal>" (análise: .workflow-ia/tasks/<ID>/ajustes/A-<n>.md)
  - A-<n>.1 (correção de CA-1): <o que mudou> — teste de regressão `<nome do teste>`
  - A-<n>.2 (mudança, decisão H-<k>): <critério novo CA-<m>> — testes `<nomes>`
```

## report.md: CONCLUIDA

```markdown
<bloco-resumo com ✅>

## Findings
| ID | Severidade | Categoria | Descrição | Status |
|---|---|---|---|---|

## Iterações
| # | Gate | Revisores | Bloqueantes após triagem | Correções |
|---|---|---|---|---|

Gate incremental no loop: <resumo.gateCache.etapasReaproveitadas> etapas reaproveitadas do cache · <resumo.gateCache.tempoEconomizadoMs em h/min> economizados (por iteração: <resumo.gateCache.porIteracao>). A verificação final rodou o gate completo, sem cache.

## Suposições
<cópia resumida de decisoes.md>

## Ajustes pós-entrega   (só quando a task voltou por ajuste)
| Ajuste | Feedback do humano | Pontos | Como foi resolvido e provado | Decisão |
|---|---|---|---|---|
| A-<n> | "<literal>" | A-<n>.1 correção (CA-1); A-<n>.2 mudança (CA-<m>) | <commits, testes de regressão, RED do ajuste> | H-<k> ou — |

Análise completa: `ajustes/A-<n>.md`.

## Histórico de entregas
| Entrega | Commit | Data | Relatório |
|---|---|---|---|
| 1 | <sha curto> | <data> | relatorios/entrega-1-report.md |
| <atual> | <sha do HEAD> | <data> | este relatório |

## Provas
<lista dos itens do manifest, com o caminho de cada arquivo>
```

## report.md: BLOQUEADA

```markdown
⛔ <ID> — BLOQUEADA
<título>

Motivo: <CÓDIGO: explicação em uma frase>
Fase em que parou: <fase>

## O que o humano precisa decidir
1. <decisão> — opções: (a) ... (recomendado) (b) ...

## O que já foi feito
- <spec pronto / plano aprovado / testes escritos / ...>
- Branch: <nome> (<com push | só local | não criado>)

## Decisões humanas
<H-n: pergunta → resposta → efeito; "nenhuma" se não houve>

## Como retomar
`/workflow-ia:retomar <ID>`: o agente faz as perguntas acima, aplica a sua resposta e a mesma task continua na fase "<fase>", sem refazer o que já foi feito. Se for ambiente, resolva-o antes (o agente confere de novo).
```

## report.md: INTERROMPIDA

```markdown
⏸️ <ID> — INTERROMPIDA
<título>

Motivo: <LIMITE_ITERACOES | SEM_PROGRESSO | OSCILACAO | GATE_TRAVADO | VERIFICACAO_REPROVADA>: <detalhe>
Iterações (rodadas de code review): <n>/<max> · Tokens: <usados> (medido, sem teto)

## Onde travou
<o finding ou o problema que não convergiu, com arquivo e linha>

## Findings em aberto
| ID | Severidade | Descrição | Tentativas |
|---|---|---|---|

## Estado do código
- Branch: <nome> · último commit <sha> · gate: <verde/vermelho>
- O que funciona: <critérios atendidos>
- O que não funciona: <critérios pendentes>

## Opções para o humano
1. Mais rodadas de code review (ou, em `GATE_TRAVADO`, mais tentativas do gate) só para esta task: `/workflow-ia:retomar <ID>` (o agente pergunta e a task continua de onde parou)
2. Ajustar o spec (também pelo `/workflow-ia:retomar <ID>`, opção "ajustar o spec")
3. Encerrar e assumir a partir do branch
```
