# Roteiro de fala — apresentação do SimpleClick (projeto final Full Cycle 4)

Acompanha `docs/apresentacao/index.html` (43 slides, arquivo único, abre offline). Card #154 do board; atualizado pelo card #161 (Entrega 7) com CI verde, estresse e lacunas.

- **Abrir:** dois cliques em `index.html` (ou `file:///…/docs/apresentacao/index.html`). Não precisa de servidor nem de internet.
- **Teclas:** `→` e `←` (ou espaço e PageDown/PageUp) navegam; `Home` e `End` vão às pontas; `I` abre o índice; `T` troca o tema; `F` põe em tela cheia. O endereço guarda o slide (`#s27`).
- **Em tela pequena** (menos de 900 px de largura) os slides viram uma página que rola; os botões e as setas continuam funcionando.
- **Prints:** vêm de `apps/web/public/landing/` e mostram dados fictícios do seed de demonstração.

Regra do roteiro: **todo número tem a fonte ao lado**. Onde está escrito "ressalva", diga a ressalva: o curso desconta "número sem medição", e as lacunas (o que foi resolvido e o que ainda falta) estão no slide 30.

## Duas durações

| Versão | Slides | Tempo |
|---|---|---|
| **Completa** | 1 a 43 | 25 a 30 min |
| **10 minutos (roteiro do curso)** | 1 · 4 · 5 · 7 · 10 · 13 · 23 · 27 · 30 · 32 · 36 · 40 · 42 · 43 | 10 min |

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
"Antes dos detalhes, o placar. Verde é atendido com evidência. Amarelo é atendido com ressalva. Vermelho é o que falta." Não esconda os amarelos. Desde a atualização, a CI está verde e o compose está como atende; os amarelos que sobram são a publicação (ambientes no Railway) e a medição de SLO em produção.

- Fontes: slides do curso (pesos M1 35, M2 20, M3 15, M4 30 e as tabelas "Projeto A"); as situações estão justificadas nos slides 14 a 30.

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

### 15. M1 — Compose com 1 comando (45 s) · ATENDE
"O compose da raiz sobe PostgreSQL, Redis, a migração, a API e o site, todos construídos do repositório, com `docker compose up --build`."
Ressalva a dizer: "validei a sintaxe; a subida inteira ainda não foi medida nesta entrega. Antes de apresentar, eu subo do zero."

- Fontes: `docker-compose.yml` no HEAD (commit `7f6d4ef`: serviços `postgres`, `redis`, `migrar`, `api`, `web`, com `build:`, sem `nginx`); `README.md` › "Subir com 1 comando (Docker)" (`docker compose up --build`, site `:4000`, API `:4001`); `docs/apresentacao.md` §4.
- Antes de apresentar: rode `docker compose up --build` do zero. Se subir, mantenha "atende"; se não subir, troque o selo do slide 15 e a linha da tabela do slide 10 por "parcial".

### 16. M1 — SOLID, pattern e Database Pattern (1 min)
- Fontes: `docs/adr/0003-ports-e-adapters-solid-armazenamento-de-midia.md`; `docs/adr/0002-database-pattern-prisma-e-sql.md`; testes `apps/api/src/core/armazenamento-de-midia.test.ts`, `apps/api/src/core/db.test.ts`, `apps/api/tests/isolamento-entre-lojas-dono.test.ts`.

### 17. M2 — Testes (1 min)
- 3.943 de unidade (web 2.655, api 692, core 274, ui 247, contracts 49, config-eslint 14, agente-impressão 12) e integração (api 847, database 161, testing 27 = 1.035): `docs/estruturacao/08-suite-verde.md` (19/11/2026).
- Contrato: `apps/api/tests/contrato-openapi.test.ts`.
- E2E 338/338, 0 falhas: `docs/estruturacao/10-e2e.md` (20/11/2026).
- Casos de aceite do checkout: `docs/estruturacao/03-testes-checkout.md` e `07-controle.md` §1.3.
- Ressalva: medições locais naquelas datas. A execução que vale como CI é a do slide 19 (run 44890192508).

### 18. M2 — Coverage (45 s)
- 80,10 / 77,99 / 79,75 / 71,07 e mínimos 75 / 73 / 75 / 66; 570 arquivos, 5.175 testes, 26.223 de 32.735 linhas; só unidade 60,20%: `docs/ci.md` › "Cobertura".
- Mínimo declarado: `vitest.config.ts` › `coverage.thresholds`.
- Resolvido: os testes de tempo têm limite proporcional sob cobertura (commit `2ada0f4`, `docs/ci.md`). A execução verde do slide 19 já roda com cobertura.

### 19. M3 — CI (1 min) · VERDE NO GITHUB
"São 8 jobs, e a execução verde existe: run 44890192508, no commit 2ada0f4, 8 de 8. Desde então só mudaram documentação, README e CONTRIBUTORS."

- Link para mostrar: `https://github.com/4r7hur9/Simple-Click-Next.Ts/actions/runs/44890192508`.
- Fontes: `.github/workflows/ci.yml` (8 jobs: qualidade, unitarios, integracao, cobertura, sca, gitleaks, openapi, build); `docs/ci.md` (SCA com 48 vulnerabilidades antes, 4 críticas e 18 altas, e Trivy com 17; correções por atualização e `overrides`).
- Antes de apresentar: a run do commit de entrega (`cce49fd`) estava em andamento na atualização. Confira o resultado; se ela falhar, troque a frase por "verde no commit 2ada0f4" e diga o motivo da falha.

### 20. M3 — Ambientes e segredos (45 s) · DESCRITOS, NÃO PUBLICADOS
- Fontes: `docs/ambientes-e-deploy.md` (matriz de variáveis; staging como `production`); `docs/deploy-railway.md` (staging = `entrega/projeto-final`, produção = `main`, domínio ainda `DOMINIO`); `.env.example`; `.gitleaks.toml`; `apps/api/src/core/env.test.ts`.
- Não mostre nem leia nenhum `.env`.

### 21. M3 — Observabilidade (1 min)
- Fontes: `docs/observabilidade.md` (pino, RED, trace de 131 spans e 37 ms, SLO de 99% em menos de 1 s em 28 dias, orçamento de 10 por 1.000, alertas 14,4× e 6×); evidências em `docs/observabilidade/`; `infra/compose/regras-slo.yml`.
- Ressalva: "declarado e instrumentado"; conformidade só em produção.

### 22. M3 — Feature flag e deploy (1 min)
- Fontes: `docs/ambientes-e-deploy.md` §5 (flag `FLAG_VITRINE_PROXIMO_PRECO`, valores, recusa de valor inválido, alternativa Unleash/GrowthBook) e §6 (fluxo, expand/contract); `docs/deploy-railway.md` (Railway para API e site; a Vercel saiu do plano); `apps/api/src/core/flags.ts`; `apps/api/tests/flag-proximo-preco.int.test.ts`.
- Ressalvas: o site ainda não exibe o campo; nenhum ambiente foi criado no Railway.

### 23. M4 — ADRs (1 min 30) — a "decisão e a alternativa descartada" do roteiro do curso
Conte o ADR 0001 como uma história: "a compra foi gravada e a conexão caiu. O que acontece?"

- Fontes: `docs/adr/0001…`, `0002…`, `0003…`; testes citados em `docs/estruturacao/07-controle.md` §1.2.

### 24. M4 — OpenAPI (45 s)
- Fontes: `docs/openapi.yaml` (cabeçalho "GERADO de packages/contracts", `openapi: 3.1.1`, 65 caminhos); `docs/arquitetura/openapi-lint.md`; `.github/workflows/ci.yml` (job `openapi`: `pnpm openapi:verificar` e `pnpm openapi:lint`).

### 25. M4 — Plano de p95 (1 min)
- Fontes: `docs/desempenho.md` §1 (metas), §2.1 (cache com tolerância) e §2.2 (idempotência do pedido, da impressão e do e-mail).

### 26. M4 — k6 em 3 estágios (1 min)
- Fontes: `docs/desempenho.md` §3; `tests/performance/k6/comum.js` (`TABELA_DA_CARGA`) e `carga.js`; `.github/workflows/desempenho.yml` (smoke → carga → estresse; o ensaio foi rodado localmente, não no Actions).

### 27. M4 — O gargalo, antes e depois (1 min 30) — os "números" do roteiro do curso
"Um gargalo, uma hipótese, uma mudança. 481 milissegundos viraram 9, sem índice novo."

- p95 481 ms (588 / 374) → 9 ms (9 / 9): `docs/desempenho.md` §5 e `docs/desempenho/comparacao.md`.
- EXPLAIN 2.040 / 1.916 ms → 0,7 ms; buffers 1.644.403 → 991: `docs/desempenho.md` §4 e §5; `docs/desempenho/carga-antes-1/explain/` e `carga-depois-1/explain/`.
- Migração: `packages/database/migrations/0074_meus_pedidos_por_loja.sql`; teste `packages/database/tests/meus-pedidos-por-loja.test.ts`.
- No gráfico, a barra está na escala da meta (500 ms).

### 28. M4 — Estresse com volume (1 min 30) · EXECUTADO
"Com 101 mil pedidos na base, 20, 40 e 60 usuários virtuais: 57 mil requisições e nenhuma falha. O que eu não consigo dizer é onde o sistema quebra: não chegamos lá."

- Fontes: `docs/desempenho.md` §3.1 (tabela dos patamares, totais, reconciliação e "o que este estresse NÃO mostra"); `docs/desempenho/estresse-volume-3/` (`resumo.md`, `reconciliacao.md`); `tests/performance/k6/estresse.js`; commit `4fbd4db`.
- Ressalvas a dizer: teto acima de 60 VUs nesta máquina, não limite medido; execução única e válida (as duas tentativas descartadas estão no doc); a 0074 não entra no roteiro do estresse.

### 29. M4 — Integridade e limites (1 min)
- Fontes: `docs/desempenho.md` §6 (reconciliação das quatro execuções) e §7 (limites: notebook, horários diferentes, limitador levantado; carga e estresse agora rodados, o estresse no slide 28).

### 30. Lacunas (1 min 30)
Comece pelo verde: CI, commits, compose, estresse. Depois leia as caixas de "ainda falta". É o slide que dá credibilidade aos outros.

| Situação | Evidência |
|---|---|
| **Resolvido:** CI verde no GitHub (8/8) | run `44890192508`, commit `2ada0f4` |
| **Resolvido:** trabalho commitado no branch `entrega/projeto-final` (30 commits sobre `69cf095`, até `cce49fd`) | `git log --oneline 69cf095..HEAD` em `/Users/stargrupo/Projetos/SC`. A árvore local ainda tem alterações de outros cards, fora desta entrega |
| **Resolvido:** estresse 20/40/60 VUs com volume, 0 falhas, sem saturação até 60 | `docs/desempenho.md` §3.1; commit `4fbd4db` |
| **Resolvido:** testes de tempo sob cobertura | commit `2ada0f4`; `docs/ci.md` |
| **Resolvido:** compose sem placeholders nginx (imagens reais) | commit `7f6d4ef`; `docker-compose.yml` no HEAD |
| **Resolvido:** README sem "PENDENTE" no desempenho | commit `cce49fd`; `README.md` |
| **Falta:** subida completa do compose não medida nesta entrega | rodar `docker compose up --build` do zero antes de apresentar |
| **Falta:** carga e estresse não rodaram no GitHub Actions | `.github/workflows/desempenho.yml` existe; os ensaios foram locais |
| **Falta:** ponto de saturação não encontrado (teto acima de 60 VUs nesta máquina) | `docs/desempenho.md` §3.1 |
| **Falta:** nenhum ambiente no ar (Railway não criado; domínio é o marcador `DOMINIO`) | `docs/deploy-railway.md`; `README.md` (tabela de ambientes) |
| **Falta:** SLO de 28 dias só se mede em produção | `docs/observabilidade.md` › "Limites honestos" |
| **Falta:** site não exibe o campo da feature flag | `docs/ambientes-e-deploy.md` §5 |
| **Falta:** e-mail sem `jobId` determinístico; chave sem impressão do corpo | `docs/desempenho.md` §2.2 |
| **Falta (autor):** `docs/ia.md` com decisões humanas PENDENTE e modelos/versões em branco; confirmar ausência de dado real na IA | os próprios arquivos |
| **Falta (autor):** `CONTRIBUTORS.md` com nome, turma e declaração pessoal PENDENTE | o próprio arquivo |
| **Falta:** sem pacote de provas do Workflow IA no disco | não existe `.workflow-ia/tasks/` |
| **Falta:** aprovação final do plano do #142 não encontrada | `card-142-v4.json` (gate `NEEDS_REFINEMENT`, `review-missing`) |

## Parte 3 — Como foi desenvolvido

### 31. Divisória (5 s)

### 32. A base do desenvolvimento (1 min)
"Code Crew organiza quem faz o quê. Workflow IA organiza como um card é feito. Nos dois, um portão que roda na minha máquina decide se pode avançar."

- Fontes: `CLAUDE.md` do projeto; `.workflow-ia/README.md`; `.rmcode/plans/`; o aplicativo em `/Applications/Code Crew.app`.

### 33. Code Crew — o board (1 min)
Cards numerados, um agente por card (Claude ou Codex), um gerente que coordena, informe ao fim de cada turno.

- Fontes: o próprio board (a lista de cards mostra o agente de cada um; este card é o #154); os estados do informe (done, needs_input, paused) são os do protocolo do card.

### 34. Code Crew — coordenação (1 min)
Reservas, dependências, memória do time.

- Fontes: notas do board (memória do time), por exemplo a nota do #142 sobre a migração 0074 e o disco cheio, e a do ambiente de preview (portas 3000/3001); `card-153-v4.json` (apontamento "T-2 bloqueada até o #151 liberar").

### 35. Code Crew — risco decide modelo e rigor (1 min)
- Tabela de modelos: contagem do campo `subtasks[].execution.model` por `subtasks[].complexity` nas 44 versões de `/Users/stargrupo/Projetos/SC/.rmcode/plans/card-*-v*.json` (LOW: haiku 4, sonnet 71, opus 4; MEDIUM: sonnet 77, opus 57; HIGH: opus 34). A contagem repete a subtarefa a cada versão do plano e ignora as que não declararam modelo.
- Regras de HIGH e CRITICAL: mensagens do gate nos mesmos arquivos ("HIGH/CRITICAL exige a revisão adversarial", "Mudança CRITICAL exige rollback ou estratégia de recuperação", "valem as exigências de CRITICAL").
- MEDIUM sem revisão obrigatória: `card-107-v2.json` (gate READY sem `reviewRequired`).

### 36. Code Crew — o gate do plano (1 min 30)
"O agente não começa a editar antes de o plano passar. E o plano é conferido contra o repositório: se cita um arquivo que não existe, reprova."

- As 8 conferências: campo `gate.checklist` de qualquer `card-*-v*.json`.
- 44 versões, 14 cards, 1 aprovado de primeira (#111), 12 terminaram READY (#100 e #101 ficaram em NEEDS_REFINEMENT nos arquivos): contagem em `/Users/stargrupo/Projetos/SC/.rmcode/plans/`.
- Falhas mais comuns (`gate.failures[].code`): `command-unknown` 59, `path-outside-root` 39, `symbol-missing` 22, `review-missing` 20, `file-missing` 11.

### 37. Card real #153 — vidro líquido (1 min 30)
Conte as quatro versões como uma escada.

- Fontes: `/Users/stargrupo/Documents/SC/.rmcode/plans/card-153-v1.json` a `v4.json` (pasta do board). v1: 6 de 8, 25 falhas (17 `symbol-missing`, 6 `command-unknown`, 1 `review-missing`, 1 divergência de classificação). v2: 7 de 8, 48 `path-outside-root`. v3: 7 de 8, 1 `review-missing`. v4: READY, 8 de 8, 26 apontamentos de revisão, 11 requisitos, 11 CA, 4 subtarefas, 8 decisões.
- O que ficou: `packages/ui/styles/vidro.css`; `packages/ui/tests/vidro.test.ts` (tags `[CA-1]`…); nota do #153 no mural.

### 38. Card real #142 — desempenho (1 min 30)
Ligue com o slide 27: "aquele número saiu deste card".

- Fontes: `card-142-v1.json` a `v4.json` (mesma pasta do board): 6 subtarefas, 7 CA, 11 decisões, revisão de arquitetura + segurança em 2 rodadas com 23 apontamentos (as frases citadas estão em `plan.review.findings`); `docs/desempenho.md`; `packages/database/tests/meus-pedidos-por-loja.test.ts` (5 testes `[CA-5]`).
- Ressalva a dizer: a v4 salva ainda marca `review-missing`; a aprovação final não está nos arquivos.

### 39. Workflow IA — o fluxo (1 min 30)
Spec → plano → testes RED → implementação → gate → revisão paralela → triagem → correção em loop → verificador final → pacote de provas.

- Fontes: `CLAUDE.md` do projeto (seção "Workflow IA"); `.workflow-ia/README.md`; `.workflow-ia/config.json` (`limites.maxIteracoes` 5, `limites.maxRodadasPlano` 3, `severidades`); README do plugin Workflow IA 0.9.0 (13 subagentes; estado só pela CLI).
- Ressalva: não há task registrada em `.workflow-ia/tasks/` para abrir ao vivo.

### 40. Workflow IA — gates offline (1 min 30)
"Offline quer dizer três coisas: roda na máquina, não depende de serviço externo e não deixa passar sem prova."

- Fontes: `.workflow-ia/config.json` › `gate.etapas` (as 9 etapas e quais são obrigatórias), `comandos` (o comando de cada uma), `provas.exigirCI: false`, `ci.ativo: false`, `gate.falharRapido: true`; `CLAUDE.md` (regras: sem `--no-verify`, sem `.env`, sem push em branch protegido, config só por humanos); hooks `pre-commit` e `pre-push` presentes em `.git/hooks/`.

### 41. Critérios CA-n (45 s)
- Fontes: `CLAUDE.md` (regra da tag `[CA-n]`); `card-142-v4.json` (R-4 → CA-5); `packages/database/tests/meus-pedidos-por-loja.test.ts`; `packages/ui/tests/vidro.test.ts`; `[CA-9]` citado em `docs/ci.md`.

### 42. O papel do humano e o `docs/ia.md` (1 min 30)
"A IA propôs e executou. Decidir o produto, aprovar e publicar continuam comigo."

- Fontes: `docs/ia.md` (4 registros; registro 1 com as 3 mutações; "Decisão humana: PENDENTE"); `CLAUDE.md` (PR e merge do humano); `docs/ambientes-e-deploy.md` §6.2 (promoção manual); `CONTRIBUTORS.md`.
- **Antes de apresentar:** preencha as decisões humanas do `docs/ia.md`. Se estiverem preenchidas, atualize este slide e o 30.

### 43. Fechamento (45 s)
- "O que faria diferente": `docs/apresentacao.md` §4 e `docs/desempenho.md` §8 (imagens reais no compose, já feitas; homologação para ensaiar a virada de preço; impressão do corpo na idempotência; mesma correção em `app.meus_itens_de_pedidos()`).
- "O que está provado" agora inclui CI verde e o estresse de 20/40/60 VUs; o próximo passo é subir o compose do zero e publicar o staging.

---

## Antes de apresentar: o que pode ter mudado

Os slides são uma fotografia de 21/11/2026, depois da Entrega 7 (CI verde no commit 2ada0f4, estresse em 4fbd4db, commits até cce49fd). Confira e ajuste o HTML se algum destes tiver mudado:

1. **Run da CI do commit de entrega (`cce49fd`) verde?** Se sim, o slide 19 pode citar o novo link. Se não, troque a frase por "verde no commit 2ada0f4" e explique a falha. Os slides 10, 19 e 30 citam o link de 2ada0f4.
2. **Compose subiu do zero** (`docker compose up --build`)? Se sim, o slide 15 fica "atende". Se não, troque o selo do slide 15 e a linha do slide 10 para "parcial".
3. **Ambientes criados no Railway?** Se sim, troque "nada está no ar" (slides 20 e 30) pelos domínios reais e tire o marcador `DOMINIO` do README.
4. **`docs/ia.md` e `CONTRIBUTORS.md` preenchidos?** Atualize os slides 30 e 42, e tire as linhas PENDENTE do slide 30.

## O que esta apresentação não contém

Nenhum e-mail, telefone real, segredo ou conteúdo de `.env`. Os nomes e valores nos prints são do seed de demonstração. Nenhum servidor foi iniciado para montar os slides da Entrega 7: os números de CI e de estresse vêm dos arquivos e das execuções citadas (run 44890192508 e `docs/desempenho/estresse-volume-3/`), e nenhuma suíte foi rodada nesta atualização.
