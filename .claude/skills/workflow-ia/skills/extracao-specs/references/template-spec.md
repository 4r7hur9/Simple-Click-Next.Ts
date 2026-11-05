# Template do spec.md

```markdown
# Spec — <ID>: <título>

- **Complexidade:** P | M | G
- **Risco:** baixo | medio | alto
- **UI:** sim | nao
- **Dados pessoais:** sim | nao
- **Tipo:** feat | fix | refactor | chore
- **Card:** <URL ou "texto">

## Contexto
<2 a 5 linhas: problema de negócio, quem usa, por que agora. Cite o card.>

## Requisitos funcionais
- RF-1: ...
- RF-2: ...

## Critérios de aceite

### CA-1: <nome curto>
Dado ...
Quando ...
Então ...

### CA-2: <nome curto>
Esquema do Cenário: ...
Dado ...
Quando ...
Então ...
Exemplos:
| entrada | resultado |
| ...     | ...       |

### CA-3: <autorização — recurso de outro usuário/tenant>
...

### CA-4: <entrada inválida>
...

## Casos de borda
- <situação> → <comportamento esperado> (coberto por CA-x ou "novo CA-y")

## Requisitos não funcionais
- Segurança: <ex.: recalcular total no servidor; rate limit no endpoint X>
- Performance: <ex.: listagem paginada; índice em (tenant_id, created_at)>
- LGPD: <ex.: CPF não aparece em logs>
- Acessibilidade: <ex.: formulário navegável por teclado>

## Impacto na codebase
- Módulos: ...
- Rotas/Server Actions: ...
- Tabelas/colunas: ...
- Migrations: <aditiva | nenhuma | ATENÇÃO: destrutiva — ver DoR>
- Integrações externas: ...

## Fora do escopo
- ...

## Perguntas em aberto e resolução
| # | Pergunta | Resolução adotada | Base (codebase / card / conservadora) |
|---|---|---|---|
| 1 | ... | ... | ... |

## Resultado DoR
PRONTO | BLOQUEAR — <motivo>
```

# Template do decisoes.md

```markdown
# Decisões e suposições — <ID>

Registro de tudo que o agente decidiu sem confirmação humana. Revise antes de abrir o PR.

| # | Fase | Decisão | Alternativas consideradas | Por quê | Reversível? |
|---|---|---|---|---|---|
| D-1 | spec | ... | ... | ... | sim |
```

As fases seguintes (plano, testes, implementação, correção) acrescentam linhas ao mesmo arquivo. Nunca apague uma decisão; se mudar, acrescente uma nova linha dizendo qual substitui.
