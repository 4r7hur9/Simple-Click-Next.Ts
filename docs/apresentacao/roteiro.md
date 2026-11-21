# Roteiro de fala — apresentação do SimpleClick (projeto final Full Cycle 4)

Acompanha `docs/apresentacao/index.html` (42 slides, arquivo único, abre offline). Card #154 do board.

- **Abrir:** dois cliques em `index.html` (ou `file:///…/docs/apresentacao/index.html`). Não precisa de servidor nem de internet.
- **Teclas:** `→` e `←` (ou espaço e PageDown/PageUp) navegam; `Home` e `End` vão às pontas; `I` abre o índice; `T` troca o tema; `F` põe em tela cheia. O endereço guarda o slide (`#s27`).
- **Em tela pequena** (menos de 900 px de largura) os slides viram uma página que rola; os botões e as setas continuam funcionando.
- **Prints:** vêm de `apps/web/public/landing/` e mostram dados fictícios do seed de demonstração.

Regra do roteiro: **todo número tem a fonte ao lado**. Onde está escrito "ressalva", diga a ressalva: o curso desconta "número sem medição", e as lacunas estão no slide 29.

## Duas durações

| Versão | Slides | Tempo |
|---|---|---|
| **Completa** | 1 a 42 | 25 a 30 min |
| **10 minutos (roteiro do curso)** | 1 · 4 · 5 · 7 · 10 · 13 · 23 · 27 · 29 · 31 · 35 · 39 · 41 · 42 | 10 min |

Na versão de 10 minutos, a ordem do curso é: problema e nível (1 min) → demonstração (3 min) → uma decisão e a alternativa descartada (3 min) → números e o que faria diferente (3 min). A demonstração ao vivo entra depois do slide 7; o passo a passo dela está em `docs/apresentacao.md` §2.

---

## Abertura

### 1. Capa (30 s)
"O SimpleClick é o meu projeto final, nível A, individual. Vou mostrar o que ele faz, como atende cada exigência do curso e em que o desenvolvimento se apoiou: um board de agentes e um fluxo com portões que rodam na minha máquina."

- Fonte: `README.md` linha 1 ("Nível: Projeto A (avançado)"); `CONTRIBUTORS.md`; rubrica nos slides do curso (encontro 24, `24-projeto-final.html`).

### 2. O caminho (20 s)
Três partes. Avise que todo número tem caminho de arquivo e que há um slide só de lacunas.

## Parte 1 — O SimpleClick

### 3. Divisória (5 s)

### 4. O problema e o público (1 min)
"A pequena loja já vende pelo WhatsApp. O que falta é vitrine, catálogo e controle do pedido. O SimpleClick dá os três, sem tirar a loja do WhatsApp."

- Fontes: `README.md` (descrição); `docs/apresentacao.md` §1; 22 modelos de loja em `docs/estruturacao/04-simulacao.md` ("clonadas dos 22 modelos de `seed/demo/lojas`").

### 5. O fluxo de um pedido (1 min)
Conte os seis passos. Dois pontos para frisar: o sistema **não envia** a mensagem (quem envia é o cliente) e a **chave de idempotência** evita pedido duplicado em rede ruim.

- Fontes: `docs/arquitetura/c4.md` §1; `docs/adr/0001-pedido-e-carrinho-na-mesma-transacao.md`.

### 6. Para o cliente (45 s)
Explorar, loja e catálogo, sacola e checkout, conta.

- Fontes: rotas em `apps/web/src/app/(explorar)`, `(loja)`, `(conta)/conta/`; print `apps/web/public/landing/explorar-computador-720.webp`.

### 7. Para o dono da loja (1 min)
Kanban em 6 etapas, métricas, personalização. Cite também catálogo, equipe, stories e feed.

- Fontes: `packages/contracts/src/etapas-do-pedido.ts` (as 6 etapas); rotas em `apps/web/src/app/(painel)/painel/`; prints `pedidos-`, `metricas-` e `aparencia-computador-720.webp`.
- **Aqui entra a demonstração ao vivo**, se houver (`docs/apresentacao.md` §2). Não use as portas do preview.

### 8. Para a administração (30 s)
Aprovação de lojas, contas, métricas da plataforma, auditoria.

- Fontes: `apps/web/src/app/(admin)/admin/{lojas,contas,auditoria}`; `apps/api/src/modules/{admin,admin-metricas}`.

## Parte 2 — O sistema destrinchado pelo curso

### 9. Divisória (5 s)

### 10. A régua: rubrica e placar (1 min)
"Antes dos detalhes, o placar. Verde é atendido com evidência. Amarelo é atendido com ressalva. Vermelho é o que falta." Não esconda os amarelos: três deles são a mesma causa (nada foi publicado ainda).

- Fontes: slides do curso (pesos M1 35, M2 20, M3 15, M4 30 e as tabelas "Projeto A"); as situações estão justificadas nos slides 14 a 29.

### 11. Arquitetura: o monorepo (45 s)
- Fontes: `README.md`; `CONTRIBUTORS.md`; `apps/api/src/modules/` (16 pastas); `packages/database/migrations/` (70 arquivos, o último é `0074_meus_pedidos_por_loja.sql`).

### 12. C4 — contexto (45 s)
- Fontes: `docs/c4/contexto.md` → `docs/arquitetura/c4.md` §1.

### 13. C4 — contêineres (45 s)
"Contêiner aqui é unidade de software ou de armazenamento, não Docker." Cite os três usos do Redis.

- Fontes: `docs/c4/containers.md` → `docs/arquitetura/c4.md` §2.

### 14. Monólito modular e 100 mil pedidos (1 min)
- 16 módulos: `apps/api/src/modules/`.
- Fronteiras no lint: `packages/config-eslint/fronteiras.js` (regra `boundaries/dependencies`).
- 101.000 pedidos (1.000 + 100.000), 390 a 2.220 por loja, 167.284 itens, 13 invariantes SQL com 0 violação: `docs/estruturacao/09-volume.md`.
- 100 lojas × 10 pedidos: `docs/estruturacao/04-simulacao.md`.
- Ressalva: só na base local `simpleclick_simulacao`.

### 15. M1 — Compose com 1 comando (45 s) · PARCIAL
Diga a ressalva com as suas palavras: "o compose sobe a infraestrutura com um comando; a API e o site ainda sobem com `pnpm dev`".

- Fontes: `docker-compose.yml`; `infra/compose/docker-compose.yml` (serviços `api` e `web` com `image: nginx:1.27-alpine`); `README.md` › "Subir com 1 comando (Docker)" ("ainda são placeholders nginx"); `docs/apresentacao.md` §4.

### 16. M1 — SOLID, pattern e Database Pattern (1 min)
- Fontes: `docs/adr/0003-ports-e-adapters-solid-armazenamento-de-midia.md`; `docs/adr/0002-database-pattern-prisma-e-sql.md`; testes `apps/api/src/core/armazenamento-de-midia.test.ts`, `apps/api/src/core/db.test.ts`, `apps/api/tests/isolamento-entre-lojas-dono.test.ts`.

### 17. M2 — Testes (1 min)
- 3.943 de unidade (web 2.655, api 692, core 274, ui 247, contracts 49, config-eslint 14, agente-impressão 12) e integração (api 847, database 161, testing 27 = 1.035): `docs/estruturacao/08-suite-verde.md` (19/11/2026).
- Contrato: `apps/api/tests/contrato-openapi.test.ts`.
- E2E 338/338, 0 falhas: `docs/estruturacao/10-e2e.md` (20/11/2026).
- Casos de aceite do checkout: `docs/estruturacao/03-testes-checkout.md` e `07-controle.md` §1.3.
- Ressalva: medições locais naquelas datas; não é uma execução de CI.

### 18. M2 — Coverage (45 s)
- 80,10 / 77,99 / 79,75 / 71,07 e mínimos 75 / 73 / 75 / 66; 570 arquivos, 5.175 testes, 26.223 de 32.735 linhas; só unidade 60,20%: `docs/ci.md` › "Cobertura".
- Mínimo declarado: `vitest.config.ts` › `coverage.thresholds`.
- Ressalva: 2 testes de tempo falharam com a instrumentação ligada (`docs/ci.md` › "Risco conhecido").

### 19. M3 — CI (1 min) · PRONTA, NUNCA RODOU NO GITHUB
"São 7 jobs. O que eu não tenho é o link verde: o workflow nunca rodou no GitHub, porque depende do push."

- Fontes: `.github/workflows/ci.yml`; `docs/ci.md` (jobs; SCA com 48 vulnerabilidades antes, 4 críticas e 18 altas, e Trivy com 17; correções por atualização e `overrides`; "Ainda não há execução no GitHub").

### 20. M3 — Ambientes e segredos (45 s) · DESCRITOS, NÃO PUBLICADOS
- Fontes: `docs/ambientes-e-deploy.md` (linha 11: "Nada disto está publicado"; matriz de variáveis; homologação como `production`); `.env.example`; `.gitleaks.toml`; `apps/api/src/core/env.test.ts`.
- Não mostre nem leia nenhum `.env`.

### 21. M3 — Observabilidade (1 min)
- Fontes: `docs/observabilidade.md` (pino, RED, trace de 131 spans e 37 ms, SLO de 99% em menos de 1 s em 28 dias, orçamento de 10 por 1.000, alertas 14,4× e 6×); evidências em `docs/observabilidade/`; `infra/compose/regras-slo.yml`.
- Ressalva: "declarado e instrumentado"; conformidade só em produção.

### 22. M3 — Feature flag e deploy (1 min)
- Fontes: `docs/ambientes-e-deploy.md` §5 (flag `FLAG_VITRINE_PROXIMO_PRECO`, valores, recusa de valor inválido, alternativa Unleash/GrowthBook) e §6 (Vercel + Railway, fluxo, expand/contract); `apps/api/src/core/flags.ts`; `apps/api/tests/flag-proximo-preco.int.test.ts`.
- Ressalvas: o site ainda não exibe o campo; nenhum deploy foi feito.

### 23. M4 — ADRs (1 min 30) — a "decisão e a alternativa descartada" do roteiro do curso
Conte o ADR 0001 como uma história: "a compra foi gravada e a conexão caiu. O que acontece?"

- Fontes: `docs/adr/0001…`, `0002…`, `0003…`; testes citados em `docs/estruturacao/07-controle.md` §1.2.

### 24. M4 — OpenAPI (45 s)
- Fontes: `docs/openapi.yaml` (cabeçalho "GERADO de packages/contracts", `openapi: 3.1.1`, 65 caminhos); `docs/arquitetura/openapi-lint.md`; `.github/workflows/ci.yml` (job `openapi`: `pnpm openapi:verificar` e `pnpm openapi:lint`).

### 25. M4 — Plano de p95 (1 min)
- Fontes: `docs/desempenho.md` §1 (metas), §2.1 (cache com tolerância) e §2.2 (idempotência do pedido, da impressão e do e-mail).

### 26. M4 — k6 em 3 estágios (1 min)
- Fontes: `docs/desempenho.md` §3; `tests/performance/k6/comum.js` (`TABELA_DA_CARGA`) e `carga.js`; `.github/workflows/desempenho.yml` (smoke → carga → estresse).

### 27. M4 — O gargalo, antes e depois (1 min 30) — os "números" do roteiro do curso
"Um gargalo, uma hipótese, uma mudança. 481 milissegundos viraram 9, sem índice novo."

- p95 481 ms (588 / 374) → 9 ms (9 / 9): `docs/desempenho.md` §5 e `docs/desempenho/comparacao.md`.
- EXPLAIN 2.040 / 1.916 ms → 0,7 ms; buffers 1.644.403 → 991: `docs/desempenho.md` §4 e §5; `docs/desempenho/carga-antes-1/explain/` e `carga-depois-1/explain/`.
- Migração: `packages/database/migrations/0074_meus_pedidos_por_loja.sql`; teste `packages/database/tests/meus-pedidos-por-loja.test.ts`.
- No gráfico, a barra está na escala da meta (500 ms).

### 28. M4 — Integridade e limites (1 min)
- Fontes: `docs/desempenho.md` §6 (reconciliação das quatro execuções) e §7 (limites: notebook, horários diferentes, limitador levantado, carga e não estresse).

### 29. Lacunas (1 min 30)
Leia as quatro caixas. É o slide que dá credibilidade aos outros.

| Lacuna | Fonte |
|---|---|
| Sem execução verde da CI | `docs/ci.md` › "O que falta para a execução verde no GitHub"; `README.md` ("PENDENTE — só existe após o push") |
| Trabalho não commitado (HEAD `69cf095`, 254 caminhos no `git status --short` em 21/11/2026) | `git log -1`, `git status --short` em `/Users/stargrupo/Projetos/SC`; `docs/desempenho.md` §7 ("Nada foi commitado") |
| Nenhum ambiente publicado | `docs/ambientes-e-deploy.md` linha 11 |
| README ainda marca desempenho como PENDENTE | `README.md` linha 17 |
| Compose com placeholders nginx | `infra/compose/docker-compose.yml`; `README.md` |
| Estresse com volume não executado; carga e estresse não rodaram no Actions | `docs/desempenho.md` §7; `docs/estruturacao/05-desempenho.md` |
| SLO sem medição em produção | `docs/observabilidade.md` › "Limites honestos" |
| 2 testes de tempo falham sob cobertura | `docs/ci.md` › "Risco conhecido" |
| Site não exibe o campo da flag | `docs/ambientes-e-deploy.md` §5 |
| E-mail sem `jobId`; chave sem impressão do corpo | `docs/desempenho.md` §2.2 |
| `docs/ia.md` e `CONTRIBUTORS.md` com campos PENDENTE | os próprios arquivos |
| Sem pacote de provas do Workflow IA no disco | não existe `.workflow-ia/tasks/` |
| Aprovação final do plano do #142 não encontrada | `card-142-v4.json` (gate `NEEDS_REFINEMENT`, `review-missing`) |

## Parte 3 — Como foi desenvolvido

### 30. Divisória (5 s)

### 31. A base do desenvolvimento (1 min)
"Code Crew organiza quem faz o quê. Workflow IA organiza como um card é feito. Nos dois, um portão que roda na minha máquina decide se pode avançar."

- Fontes: `CLAUDE.md` do projeto; `.workflow-ia/README.md`; `.rmcode/plans/`; o aplicativo em `/Applications/Code Crew.app`.

### 32. Code Crew — o board (1 min)
Cards numerados, um agente por card (Claude ou Codex), um gerente que coordena, informe ao fim de cada turno.

- Fontes: o próprio board (a lista de cards mostra o agente de cada um; este card é o #154); os estados do informe (done, needs_input, paused) são os do protocolo do card.

### 33. Code Crew — coordenação (1 min)
Reservas, dependências, memória do time.

- Fontes: notas do board (memória do time), por exemplo a nota do #142 sobre a migração 0074 e o disco cheio, e a do ambiente de preview (portas 3000/3001); `card-153-v4.json` (apontamento "T-2 bloqueada até o #151 liberar").

### 34. Code Crew — risco decide modelo e rigor (1 min)
- Tabela de modelos: contagem do campo `subtasks[].execution.model` por `subtasks[].complexity` nas 44 versões de `/Users/stargrupo/Projetos/SC/.rmcode/plans/card-*-v*.json` (LOW: haiku 4, sonnet 71, opus 4; MEDIUM: sonnet 77, opus 57; HIGH: opus 34). A contagem repete a subtarefa a cada versão do plano e ignora as que não declararam modelo.
- Regras de HIGH e CRITICAL: mensagens do gate nos mesmos arquivos ("HIGH/CRITICAL exige a revisão adversarial", "Mudança CRITICAL exige rollback ou estratégia de recuperação", "valem as exigências de CRITICAL").
- MEDIUM sem revisão obrigatória: `card-107-v2.json` (gate READY sem `reviewRequired`).

### 35. Code Crew — o gate do plano (1 min 30)
"O agente não começa a editar antes de o plano passar. E o plano é conferido contra o repositório: se cita um arquivo que não existe, reprova."

- As 8 conferências: campo `gate.checklist` de qualquer `card-*-v*.json`.
- 44 versões, 14 cards, 1 aprovado de primeira (#111), 12 terminaram READY (#100 e #101 ficaram em NEEDS_REFINEMENT nos arquivos): contagem em `/Users/stargrupo/Projetos/SC/.rmcode/plans/`.
- Falhas mais comuns (`gate.failures[].code`): `command-unknown` 59, `path-outside-root` 39, `symbol-missing` 22, `review-missing` 20, `file-missing` 11.

### 36. Card real #153 — vidro líquido (1 min 30)
Conte as quatro versões como uma escada.

- Fontes: `/Users/stargrupo/Documents/SC/.rmcode/plans/card-153-v1.json` a `v4.json` (pasta do board). v1: 6 de 8, 25 falhas (17 `symbol-missing`, 6 `command-unknown`, 1 `review-missing`, 1 divergência de classificação). v2: 7 de 8, 48 `path-outside-root`. v3: 7 de 8, 1 `review-missing`. v4: READY, 8 de 8, 26 apontamentos de revisão, 11 requisitos, 11 CA, 4 subtarefas, 8 decisões.
- O que ficou: `packages/ui/styles/vidro.css`; `packages/ui/tests/vidro.test.ts` (tags `[CA-1]`…); nota do #153 no mural.

### 37. Card real #142 — desempenho (1 min 30)
Ligue com o slide 27: "aquele número saiu deste card".

- Fontes: `card-142-v1.json` a `v4.json` (mesma pasta do board): 6 subtarefas, 7 CA, 11 decisões, revisão de arquitetura + segurança em 2 rodadas com 23 apontamentos (as frases citadas estão em `plan.review.findings`); `docs/desempenho.md`; `packages/database/tests/meus-pedidos-por-loja.test.ts` (5 testes `[CA-5]`).
- Ressalva a dizer: a v4 salva ainda marca `review-missing`; a aprovação final não está nos arquivos.

### 38. Workflow IA — o fluxo (1 min 30)
Spec → plano → testes RED → implementação → gate → revisão paralela → triagem → correção em loop → verificador final → pacote de provas.

- Fontes: `CLAUDE.md` do projeto (seção "Workflow IA"); `.workflow-ia/README.md`; `.workflow-ia/config.json` (`limites.maxIteracoes` 5, `limites.maxRodadasPlano` 3, `severidades`); README do plugin Workflow IA 0.9.0 (13 subagentes; estado só pela CLI).
- Ressalva: não há task registrada em `.workflow-ia/tasks/` para abrir ao vivo.

### 39. Workflow IA — gates offline (1 min 30)
"Offline quer dizer três coisas: roda na máquina, não depende de serviço externo e não deixa passar sem prova."

- Fontes: `.workflow-ia/config.json` › `gate.etapas` (as 9 etapas e quais são obrigatórias), `comandos` (o comando de cada uma), `provas.exigirCI: false`, `ci.ativo: false`, `gate.falharRapido: true`; `CLAUDE.md` (regras: sem `--no-verify`, sem `.env`, sem push em branch protegido, config só por humanos); hooks `pre-commit` e `pre-push` presentes em `.git/hooks/`.

### 40. Critérios CA-n (45 s)
- Fontes: `CLAUDE.md` (regra da tag `[CA-n]`); `card-142-v4.json` (R-4 → CA-5); `packages/database/tests/meus-pedidos-por-loja.test.ts`; `packages/ui/tests/vidro.test.ts`; `[CA-9]` citado em `docs/ci.md`.

### 41. O papel do humano e o `docs/ia.md` (1 min 30)
"A IA propôs e executou. Decidir o produto, aprovar e publicar continuam comigo."

- Fontes: `docs/ia.md` (4 registros; registro 1 com as 3 mutações; "Decisão humana: PENDENTE"); `CLAUDE.md` (PR e merge do humano); `docs/ambientes-e-deploy.md` §6.2 (promoção manual); `CONTRIBUTORS.md`.
- **Antes de apresentar:** preencha as decisões humanas do `docs/ia.md`. Se estiverem preenchidas, atualize este slide e o 29.

### 42. Fechamento (45 s)
- "O que faria diferente": `docs/apresentacao.md` §4 e `docs/desempenho.md` §8 (imagens reais no compose, homologação para ensaiar a virada de preço, impressão do corpo na idempotência, mesma correção em `app.meus_itens_de_pedidos()`).

---

## Antes de apresentar: o que pode ter mudado

Os slides são uma fotografia de 21/11/2026. Confira e ajuste o HTML se algum destes tiver mudado:

1. **Commit e push feitos?** Atualize os slides 10, 19, 29 e 42 e cole o link da CI verde.
2. **`docs/ia.md` e `CONTRIBUTORS.md` confirmados?** Atualize os slides 29 e 41.
3. **README corrigido** (desempenho deixou de ser "PENDENTE")? Tire a linha do slide 29.
4. **Compose com imagens reais?** O slide 15 passa a "atende".

## O que esta apresentação não contém

Nenhum e-mail, telefone real, segredo ou conteúdo de `.env`. Os nomes e valores nos prints são do seed de demonstração. Nenhum servidor foi iniciado e nenhuma suíte foi rodada para montar os slides: tudo foi lido dos arquivos citados.
