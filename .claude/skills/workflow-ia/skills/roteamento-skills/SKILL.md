---
name: roteamento-skills
description: "Matriz que diz qual skill de domínio do Workflow IA usar em cada tipo de mudança (rota de API, Server Action, tela, formulário, migration, query, autenticação, upload, webhook, integração externa, job em fila, teste) e em cada papel (implementer, test-writer, fixer, revisores). Use ao escrever o plan.md (cada etapa declara 'Skills:'), ao delegar uma etapa ao implementer, ao escolher a skill de um finding ou sempre que houver dúvida de qual conhecimento carregar. Não use para decidir severidade (use triagem-findings) nem para regras de autonomia (use politica-autonomia)."
---

# Roteamento de skills

A habilidade certa no momento certo não depende de o agente "lembrar": o plano declara as skills de cada etapa, e cada agente as carrega com a ferramenta **Skill** antes de trabalhar. Nomes completos têm o prefixo `workflow-ia:`.

## Regras inegociáveis

1. **Toda etapa do plan.md tem uma linha `Skills:`** com 1 a 4 skills. Mais que isso indica etapa grande demais: quebre.
2. **`stack-e-convencoes` é implícita em toda etapa de código.** Não precisa declarar, mas deve ser lida uma vez por agente.
3. **Mudança que toca segurança declara a skill de segurança da camada.** Isso vale para auth, permissão, entrada do usuário, upload, segredos e dados pessoais.
4. **Mudança que toca banco declara modelagem e performance do banco.** Isso inclui schema, migration e query nova.
5. **Todo finding carrega a skill que o fixer deve usar** (campo `skill`).

## Matriz: tipo de mudança → skills

| Mudança | Skills |
|---|---|
| Nova rota de API / Route Handler / endpoint Express | `backend-engenharia`, `backend-seguranca`, `api-design-integracoes` |
| Server Action (Next.js) | `backend-engenharia`, `backend-seguranca`, `frontend-engenharia` |
| Query nova ou alterada (Prisma/SQL) | `banco-performance`, `backend-seguranca` (filtro por tenant/dono) |
| Schema / migration | `banco-modelagem`, `banco-performance`, `banco-seguranca-operacao` |
| Operação com dinheiro, estoque, saldo | `backend-engenharia` (transação, idempotência, concorrência), `banco-modelagem`, `arquitetura-design` |
| Autenticação, sessão, senha, token | `backend-seguranca`, `frontend-seguranca` |
| Permissão / papéis / multi-tenant | `backend-seguranca`, `banco-seguranca-operacao` (RLS), `arquitetura-design` |
| Upload / download de arquivo | `backend-seguranca`, `backend-performance` (streams) |
| Webhook recebido ou enviado | `api-design-integracoes`, `backend-seguranca`, `backend-engenharia` |
| Integração com fornecedor externo | `api-design-integracoes`, `backend-engenharia` |
| Job em fila / processamento assíncrono | `backend-engenharia`, `backend-performance`, `devops-observabilidade-lgpd` |
| Nova tela / página | `frontend-engenharia`, `frontend-performance`, `acessibilidade-ux` |
| Formulário | `frontend-engenharia`, `acessibilidade-ux`, `frontend-seguranca` |
| Listagem grande / tabela | `frontend-performance`, `banco-performance`, `api-design-integracoes` (paginação) |
| Conteúdo gerado pelo usuário exibido na tela | `frontend-seguranca` (XSS) |
| Novo módulo / refatoração estrutural | `arquitetura-design`, `stack-e-convencoes` |
| Dados pessoais (CPF, e-mail, telefone, endereço) | `devops-observabilidade-lgpd`, `backend-seguranca` |
| Logs, métricas, alertas | `devops-observabilidade-lgpd` |
| Testes (qualquer tipo) | `testes-qualidade` + a skill da área testada |
| Endurecimento de segurança / auditoria | `auditoria-seguranca-pentest` + a skill de segurança da camada |

## Papel → skills base

| Agente | Skills que carrega sempre | Mais |
|---|---|---|
| spec-analyst | `extracao-specs`, `politica-autonomia`, `stack-e-convencoes` | `arquitetura-design` para entender módulos |
| arquiteto | `arquitetura-design`, `roteamento-skills`, `stack-e-convencoes` | `banco-modelagem`, `api-design-integracoes` conforme o spec |
| plan-reviewer | `arquitetura-design`, `politica-autonomia`, `roteamento-skills` | as de segurança se o risco for alto |
| test-writer | `testes-qualidade`, `stack-e-convencoes` | a skill da área de cada teste |
| implementer | as declaradas na etapa | — |
| fixer | a skill do campo `skill` de cada finding | `testes-qualidade` se tocar teste |
| security-reviewer | `backend-seguranca`, `frontend-seguranca`, `banco-seguranca-operacao`, `auditoria-seguranca-pentest` | — |
| performance-reviewer | `frontend-performance`, `backend-performance`, `banco-performance` | — |
| quality-reviewer | `arquitetura-design`, `frontend-engenharia`, `backend-engenharia`, `banco-modelagem` | `api-design-integracoes` (rotas e integrações), `acessibilidade-ux` (telas), `politica-autonomia` (escopo) |
| test-reviewer | `testes-qualidade` | — |
| ops-reviewer (condicional) | `devops-observabilidade-lgpd`, `banco-modelagem` (expand/contract), `stack-e-convencoes` (env) | — |
| triager | `triagem-findings` | — |
| verificador-final | `pacote-provas`, `testes-qualidade` | a de segurança se o risco for alto |

## Formato da etapa no plan.md

```markdown
### Etapa 3: Endpoint POST /api/vendas
Skills: backend-engenharia, backend-seguranca, banco-performance
Arquivos: src/app/api/vendas/route.ts, src/modules/vendas/application/registrar-venda.ts
Testes: [CA-2] [CA-3] [CA-5] em tests/integration/vendas.test.ts
Atenção: transação venda + baixa de estoque; SELECT ... FOR UPDATE no estoque; recalcular total no servidor; filtrar por tenantId
Commit: feat(VST-123): registrar venda com baixa de estoque
```

## Checklist de revisão do plano

| # | Verificação | Severidade |
|---|---|---|
| 1 | Toda etapa tem `Skills:` coerente com a matriz | alto |
| 2 | Todo CA-n aparece em alguma etapa (linha `Testes:`) | urgente |
| 3 | Etapas pequenas (um commit cada, poucos arquivos) | medio |
| 4 | Etapas de banco declaram modelagem + performance | alto |
| 5 | Etapas com entrada do usuário ou permissão declaram a skill de segurança | urgente |
