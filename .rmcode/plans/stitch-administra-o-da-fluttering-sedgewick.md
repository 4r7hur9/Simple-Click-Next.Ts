# Plano #113 — Stitch · Administração da plataforma (visual proposto) — v2 (READY)

## Contexto
`/admin` não tem tela no Stitch. A spec `.spec/features/stitch-admin-plataforma` (T-11301…T-11312) pede só retoque visual com as peças do #104
e os padrões do #112, sem mexer em acesso, ponte, contratos, trilha, cache nem dado pessoal. O risco é a reforma soltar dado pessoal ou
enfraquecer uma confirmação, por isso as provas de regressão vêm antes de qualquer tela. Revisão adversarial (arquitetura + segurança) feita; achados resolvidos no plano.

## Fatos que mudaram o plano
- A web não guarda acesso (quem barra é a API). Os testes web provam texto das mensagens, repasse da ponte e apresentação; a prova real de acesso e de trilha está nos testes de API (`pnpm test:int`) e nos e2e.
- `PilulasDeFiltro` tem 3 consumidores (`ListaLojas`, `ListaDeContas`, `MetricasDaLoja`); dois testes atuais dependem de `nav[aria-label]` (`admin-lista-lojas`, `admin-gestao`). Trocar por `Chip(aoAlternar)+FaixaDeChips` tudo na T-11303. Chip nunca com `href` (Link pré-carregaria `?busca=`).
- AC-11308 literal reprova o código atual (3 importações de contratos "para o dono"): varredura por par (arquivo, símbolo), por nome importado do barril, com caso sintético; avisar o gerente para corrigir a spec.
- `corpoDoAto` existe, privada; atos de `AcoesLoja` confirmam em passo na tela (não usam `JanelaDeConfirmacao`); exclusão só trava por `disabled` → provar clique e Enter com nome quase igual.
- Conflitos de fila: #117 (`HistoricoDeAuditoria`, `JanelaDeConfirmacao`) e #118 (`FichaLoja`, `AbasDaLoja`, `DocumentosDaLoja`): `board_peers/board_claim` é passo bloqueante.

## Ordem (uma tarefa após a outra, sem commit)
1. **T-11301** testes: `admin-acesso`, `admin-ponte`, `admin-varredura`, `admin-atos` (verdes no código atual).
2. **T-11302** moldura (pedido ao #112; teste `admin-moldura`).
3. **T-11303** chips nos 3 consumidores + lista de lojas + 2 seletores de teste.
4. **T-11304** contas · **T-11305** abas/cabeçalho · **T-11306** resumo e atos (+ `admin-atos-tom`, api-int/e2e) · **T-11307** cadastro · **T-11308** nova loja/documentos/funcionalidades · **T-11309** início · **T-11310** auditoria · **T-11311** teclado/toque/tema · **T-11312** proposta ao #114 e fechamento.

## Validação
`pnpm exec vitest run --project web apps/web/tests/admin-` (a partir da raiz), `pnpm typecheck`, `pnpm lint` (42 erros pré-existentes em `.claude/skills/workflow-ia`), `pnpm test:int`/`pnpm test:e2e` de admin em T-11306/T-11308 se houver banco (senão registrar e avisar o gerente).

## Rollback
Sem commit/branch: restaurar só os arquivos listados da tarefa (features/admin* estava limpo no baseline) e apagar os testes criados; conferir `git status` deles antes de cada tarefa.

## Fora
`.spec/`, `features/painel*`, `packages/ui/*`, API, contratos, `server/*` (só leitura), funções "A decidir", e2e novo, commit/push.
