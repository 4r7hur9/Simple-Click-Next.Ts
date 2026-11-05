---
name: politica-autonomia
description: "Política de decisão do agente autônomo do Workflow IA: o que ele pode decidir sozinho, como resolver ambiguidade de card sem perguntar ao humano (convenções da codebase, contexto do card, interpretação mais conservadora), como registrar suposições em decisoes.md e quando parar com veredito BLOQUEADA. Use sempre que um agente do pipeline encontrar dúvida de requisito, conflito entre card e sistema, necessidade de credencial, migration destrutiva, mudança de configuração ou qualquer decisão sem aprovação humana. Não use para decidir severidade de finding (use triagem-findings) nem para escolher skills (use roteamento-skills)."
---

# Política de autonomia

O agente trabalha sem ninguém para perguntar. Isso só é seguro com regras claras sobre **o que ele pode decidir** e **quando ele precisa parar**. Esta skill substitui as aprovações humanas do fluxo tradicional.

## Regras inegociáveis

1. **Não pergunte ao humano o que esta política resolve.** Ambiguidade se resolve pela ordem abaixo. Só as **paradas obrigatórias** (tabela abaixo) chegam ao humano, e sempre do mesmo jeito: veredito BLOQUEADA (ou INTERROMPIDA, nos limites) e a decisão pedida pela CLI — `wf decisao pedir`, AskUserQuestion com as perguntas devolvidas e `wf decisao aplicar`. A resposta dele reabre a mesma task, na fase em que parou.
2. **Toda suposição vai para `decisoes.md`**, com alternativas e justificativa. Decisão não registrada é tratada como erro de processo pelo verificador.
3. **Na dúvida, a opção mais conservadora:** menos dados expostos, menos permissões, nada apagado, nada irreversível.
4. **Reversível pode; irreversível para.** O critério para decidir sozinho é: um humano consegue desfazer com um revert ou uma migration aditiva?
5. **Nunca mude o escopo do card.** Sugestões de melhoria viram registro em `decisoes.md` ou dívida técnica, não código.
6. **Nunca contorne uma cerca.** Hook bloqueou? A resposta é mudar de abordagem ou parar, nunca achar outro caminho para o mesmo efeito.

## Ordem para resolver ambiguidade

1. **Convenções da codebase.** Como o sistema já faz algo parecido? Imite: mesmo padrão de validação, de erro, de paginação, de permissão.
2. **Contexto do card.** Anexos, prints, comentários, cards relacionados citados.
3. **Interpretação conservadora.** Por exemplo:
   - Visibilidade: restrita ao dono/tenant, não global.
   - Permissão: só os papéis que já fazem operação parecida.
   - Exclusão: soft delete, se o sistema já usa; senão, bloquear exclusão com dependentes.
   - Valores: recalculados no servidor; limites mínimos/máximos explícitos.
   - Dados pessoais: não expor na listagem; mascarar em logs.
4. **Não há base nem opção conservadora segura?** Então é caso de BLOQUEADA.

## O que o agente decide sozinho

- Estrutura de código, nomes, componentes, organização de pastas seguindo as convenções.
- Queries, índices novos, paginação, cache com invalidação clara.
- Migrations **aditivas**: tabela nova, coluna nova nullable ou com default, índice (criado sem travar a tabela quando o banco permitir).
- Dependência nova madura e mantida, justificada no plano.
- Textos de UI e mensagens de erro, seguindo o tom existente.
- Correção de bug encontrado no caminho **se** for necessário para o critério; caso contrário, registrar como dívida técnica.

## Paradas obrigatórias (veredito BLOQUEADA)

| Situação | Motivo sugerido |
|---|---|
| Só funciona com migration destrutiva (DROP, rename sem expand/contract, mudança de tipo com perda) | `MIGRATION_DESTRUTIVA: ...` |
| Regra de dinheiro, preço, desconto, comissão, imposto ou permissão sem definição no card e sem pista na codebase | `REGRA_INDEFINIDA: ...` |
| Precisa de segredo, credencial, conta ou serviço externo inexistente no ambiente | `AMBIENTE: ...` |
| Card contradiz o comportamento atual e as duas leituras são plausíveis | `CONFLITO_DE_REQUISITO: ...` |
| Exige mudar CI, hooks, `.claude/settings.json` ou `.workflow-ia/config.json` | `CONFIGURACAO_HUMANA: ...` |
| Working tree com alterações que não são da task | `WORKING_TREE_SUJO` |
| Plano reprovado três vezes pelo plan-reviewer (rodadas 1, 2 e 3) | `PLANO_REPROVADO: ...` |
| Etapa obrigatória do gate não roda por causa do ambiente (Docker, banco, browser) | `AMBIENTE: ...` |
| O spec precisa mudar depois do plano (critério errado, faltando ou impossível) | `SPEC_MUDOU: ...` e a decisão humana: com "Ajustar o spec", o spec-analyst ajusta e você roda `wf spec aceitar-ajuste` (o humano também pode recongelar no terminal dele com `wf spec recongelar`) |
| Ajuste pós-entrega com ponto que muda o comportamento combinado (critério novo ou alterado) | Sem veredito: a CLI pede a decisão `AJUSTE_MUDA_SPEC` depois do `wf ajuste registrar`. Mostre os critérios propostos na pergunta de contexto. Nunca reclassifique a mudança como correção por conta própria |
| Conflito com a base: outra mudança tocou os mesmos arquivos durante a task | `CONFLITO_COM_BASE: ...` (não faça rebase nem merge da base) |
| Verificação aprovada, mas o manifest continua incompleto e não há como completar a prova | `PROVAS_INCOMPLETAS: ...` |
| O comportamento pedido já existe (testes do RED passam sem mudança e não é refactor) | `JA_ATENDIDO: ...` (cite os testes e o código que já atendem) |

Os limites do loop param com INTERROMPIDA, decididos pela CLI (`wf proximo`), e seguem o mesmo pedido de decisão: `LIMITE_ITERACOES` (5 rodadas de code review com bloqueantes ou médios abertos), `SEM_PROGRESSO`, `OSCILACAO`, `GATE_TRAVADO` (a mesma etapa do gate falhou 5 vezes seguidas) e `VERIFICACAO_REPROVADA`. Médios não viram dívida técnica para fugir do limite: são corrigidos no loop; só baixos ficam registrados no relatório.

BLOQUEADA não é fracasso: é o agente fazendo exatamente o que um bom desenvolvedor faria. O relatório deve dizer **o que falta** e **qual decisão o humano precisa tomar**, com as opções.

## Pedir a decisão ao humano

Numa parada obrigatória, a sessão principal (nunca um subagente) pergunta ao humano, e a task continua com a resposta:

1. `wf veredito BLOQUEADA --motivo "<CÓDIGO>: <o que falta>"` — o código abre o motivo (é ele que define as opções).
2. Escreva até 3 perguntas de contexto em um JSON (cada uma com `question`, `header` de até 12 caracteres e 2 a 4 `options` com `label` e `description`): o que exatamente o humano precisa decidir, com as opções concretas e a sua recomendação primeiro, marcada "(Recomendado)". Seja específico ("Os scripts rebuild/seed devem gravar competenceDate?"), não genérico ("Como prosseguir?").
3. `wf decisao pedir --contexto <arquivo.json> [--recomendar <opção>]`. A CLI acrescenta a pergunta "Como seguir?" com os efeitos (continuar, ajustar o spec, mais rodadas de revisão ou tentativas do gate, encerrar) e devolve as `questions` finais.
4. Chame **AskUserQuestion com essas `questions` exatamente** (sem mudar texto nem ordem e sem preencher respostas: o hook nega).
5. `wf decisao aplicar`. "Continuar" reabre a task na fase em que parou: siga `wf proximo` e passe as respostas (state.json `decisoes` / `decisoes.md`) ao subagente da fase. "Encerrar": relatório e `wf encerrar`. Texto livre na "Como seguir?": leve em conta e pergunte de novo.

Sem humano (CI, `claude -p` sem AskUserQuestion, ou ele não respondeu): relatório com as opções e `wf encerrar`; a decisão fica pendente e o humano retoma com `/workflow-ia:retomar <ID>`. Nunca responda por ele, nunca invente a resposta em `decisoes.md` e nunca aplique uma decisão sem a resposta atestada (a CLI recusa).

## Formato do registro em decisoes.md

```markdown
| D-4 | implementacao | Listagem de vendas restrita à loja do usuário logado | Mostrar todas as lojas do tenant | Card não define; codebase filtra por loja em /estoque (src/modules/estoque/...); opção conservadora | sim |
```

## Checklist de revisão (usado pelo quality-reviewer e pelo verificador)

| # | Verificação | Severidade |
|---|---|---|
| 1 | Toda decisão não trivial fora do card está em decisoes.md | alto |
| 2 | Nenhuma decisão irreversível foi tomada sem BLOQUEADA | urgente |
| 3 | Escopo do diff corresponde ao spec (nada a mais) | medio |
| 4 | Suposições seguem a opção mais conservadora ou citam a convenção da codebase | alto |
| 5 | Nenhuma variável de ambiente nova sem registro em .env.example e decisoes.md | alto |
