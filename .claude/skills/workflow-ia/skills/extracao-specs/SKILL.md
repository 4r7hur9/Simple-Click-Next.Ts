---
name: extracao-specs
description: "Transforma um card do board (texto informal, critérios soltos, prints) em um spec executável: requisitos, critérios de aceite numerados CA-n em Gherkin (Dado/Quando/Então), casos de borda, cenários de erro, requisitos não funcionais de segurança/performance/LGPD, impacto na codebase, classificação de complexidade (P/M/G) e risco, e checagem de Definition of Ready. Use na fase F1 do Workflow IA, quando o spec-analyst for escrever spec.md, ou quando pedirem para 'extrair specs', 'refinar o card', 'escrever critérios de aceite'. Não use para planejar a implementação (use roteamento-skills/arquitetura-design) nem para escrever testes (use testes-qualidade)."
---

# Extração de specs

O spec é o contrato da task. Tudo que vem depois (plano, testes, revisão, verificação) é julgado contra ele. Um critério ambíguo vira teste fraco; um critério esquecido vira feature incompleta que "passa em tudo".

## Regras inegociáveis

1. **Todo comportamento pedido no card vira pelo menos um critério `CA-n`.** O verificador final relê o card original e reprova se algo ficou de fora.
2. **Critérios são testáveis.** Cada `CA-n` descreve entrada, ação e resultado observável. "Deve ser rápido" não é critério; "a listagem de 1.000 produtos responde em < 300 ms p95 no teste de integração" é.
3. **Numeração estável.** `CA-1`, `CA-2`, ... Cada critério é um título `### CA-n: ...` (só os títulos contam). Critério removido vira `### CA-n (removido: motivo)`, **mas só antes de `wf fase plano`**: ao entrar no plano o spec congela e a lista de critérios vira a Definition of Done. Depois disso, mudar o spec é decisão humana (`wf spec recongelar`) ou BLOQUEADA (`SPEC_MUDOU`).
4. **Cenários de erro e de autorização são critérios também.** Não deixe "usuário sem permissão", "recurso de outro tenant" e "entrada inválida" só em "casos de borda".
5. **Sem invenção de regra de negócio.** O que o card não define e a codebase não indica é resolvido pela skill `politica-autonomia` e registrado em `decisoes.md`. Se envolver dinheiro, preço, permissão ou dados pessoais sem pista nenhuma, a DoR é `BLOQUEAR`.
6. **Escopo explícito.** Liste o que está **fora** do escopo. Isso protege contra inflar a task.
7. **Leia a codebase antes de escrever.** Nomes de entidades, rotas, padrões de erro e convenções vêm do código existente, não da imaginação.

## Formato do spec.md

Use exatamente o template em [references/template-spec.md](references/template-spec.md). As linhas de metadados do topo são lidas pela CLI (`wf meta --do-spec`):

```markdown
- **Complexidade:** M
- **Risco:** alto
- **UI:** sim
- **Dados pessoais:** nao
```

**Dados pessoais** é `sim` quando a task coleta, grava, exibe, exporta, loga ou apaga dado pessoal (CPF, e-mail, telefone, endereço, dados de pagamento). Com `sim`, a CLI inclui o revisor de operação e LGPD (`ops-reviewer`) na revisão. Na dúvida, `sim`.

## Como escrever critérios em Gherkin

```gherkin
### CA-3: Vendedor não vê venda de outra loja
Dado que existe a venda V1 da loja A
E estou autenticado como vendedor da loja B
Quando eu consulto a venda V1 pelo id
Então recebo 404
E nenhum dado da venda V1 é retornado
```

- Um cenário por comportamento. `Esquema do Cenário` com `Exemplos` quando a regra varia por dados (faixas de desconto, estados de pedido).
- O "Então" é observável: status HTTP, mensagem, registro no banco, evento emitido, elemento na tela.
- Valores concretos ("R$ 10,00", "3 itens"), não "um valor válido".
- Para UI, descreva o que o usuário vê e faz, não a implementação.

## Classificação

| Complexidade | Sinais | Orçamento padrão |
|---|---|---|
| **P** | 1 módulo, sem migration ou com migration aditiva trivial, até ~5 critérios, sem auth/pagamento | 2 iterações |
| **M** | 2–3 módulos, migration aditiva, UI + API, 5–12 critérios | 3 iterações |
| **G** | vários módulos, concorrência/transação complexa, integração externa, >12 critérios | 4 iterações |

| Risco | Quando |
|---|---|
| **alto** | autenticação, autorização, pagamento, dinheiro, dados pessoais, migration em tabela grande, concorrência, integração externa |
| **medio** | regra de negócio nova, mudança de contrato de API interna, performance sensível |
| **baixo** | UI sem regra nova, texto, ajuste isolado |

Se a task for G e risco alto com muitos critérios independentes, registre em `decisoes.md` a sugestão de quebra em cards menores, mas execute o card como veio (a política de autonomia não autoriza mudar o escopo).

## Definition of Ready (fim do spec)

Termine o spec com a seção `## Resultado DoR` contendo `PRONTO` ou `BLOQUEAR`, e o motivo. É `BLOQUEAR` quando:
- o objetivo do card não pode ser entendido nem pela codebase;
- falta regra de negócio de dinheiro, preço, permissão ou dados pessoais sem nenhuma pista;
- depende de credencial, serviço externo ou decisão que não existe no ambiente;
- só é possível com mudança destrutiva de dados.

Qualquer outra lacuna se resolve com suposição conservadora registrada.

## Checklist de revisão do spec

| # | Verificação | Severidade se falhar |
|---|---|---|
| 1 | Todo pedido do card tem ao menos um CA-n | urgente |
| 2 | Todo CA-n é testável e tem "Então" observável | alto |
| 3 | Há critérios de erro/validação para as entradas novas | alto |
| 4 | Há critério de autorização quando há recurso com dono/tenant | urgente |
| 5 | Metadados Complexidade/Risco/UI presentes e coerentes | medio |
| 6 | Fora de escopo explícito | medio |
| 7 | Impacto lista tabelas, rotas e migrations | medio |
| 8 | Suposições estão em decisoes.md com justificativa | alto |
| 9 | Requisitos não funcionais relevantes (segurança, performance, LGPD) listados | medio |
| 10 | Resultado DoR presente | alto |

## Referências

- [references/template-spec.md](references/template-spec.md): template completo do spec.md e do decisoes.md. Leia sempre antes de escrever.
