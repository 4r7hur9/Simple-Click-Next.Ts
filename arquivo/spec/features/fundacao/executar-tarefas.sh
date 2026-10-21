#!/usr/bin/env bash
# executar-tarefas.sh — gerado por `onp-spec plano fundacao` em 2026-08-17 17:59
# NÃO edite à mão: mudou tasks.md ou a config, regenere o plano.
#
# uso:
#   bash executar-tarefas.sh                  tudo (ondas → sequenciais → gate)
#   bash executar-tarefas.sh --faixa <id>     reexecuta UMA faixa (+ merge + gate)
#   bash executar-tarefas.sh --seq <T-xxx>    reexecuta UMA tarefa sequencial
#   bash executar-tarefas.sh --gate           só o gate (verify + audit)
#   bash executar-tarefas.sh --listar         mostra faixas, tarefas e estados
#   (acrescente --sem-gate para não rodar o gate ao final)
#
# resumo do que está rolando, a qualquer momento: onp-spec resumo fundacao
set -u
set -o pipefail

RUN_ID='SC-fundacao-msxjgned'
FEATURE='fundacao'
BASE_BRANCH='spec/fundacao'
ENGINE='/Users/stargrupo/.claude/skills/onp-spec-driven/scripts/onp-spec.mjs'
CLAUDE_FLAGS=(--permission-mode acceptEdits --allowedTools 'Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(pnpm:*)')
STREAM_FLAGS=(--output-format stream-json --verbose)
FALHAS=""
COM_GATE=1
RESUMO_MODEL='claude-haiku-4-5'
RESUMO_PID=""

verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
vermelho() { printf '\033[31m%s\033[0m\n' "$*"; }
amarelo()  { printf '\033[33m%s\033[0m\n' "$*"; }
info()     { printf '· %s\n' "$*"; }
falhar()   { vermelho "✘ $*"; exit 1; }

# eventos vão para o ledger GLOBAL (~/.onp-spec/painel/ledger.jsonl):
# um arquivo para todos os projetos, é o que o onp-spec resumo lê
evento() { node "$ENGINE" evento --run "$RUN_ID" "$@" >/dev/null 2>&1 || true; }

# ── ambiente (todos os modos passam por aqui) ────────────────────────
preparar_ambiente() {
  command -v git >/dev/null 2>&1 || falhar "git não encontrado"
  command -v node >/dev/null 2>&1 || falhar "node não encontrado"
  command -v claude >/dev/null 2>&1 || falhar "Claude Code CLI (claude) não encontrado — instale-o ou siga o modo manual em plano-execucao.md"
  TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null) || falhar "fora de um repositório git"
  cd "$TOPLEVEL" || exit 1
  # artefatos recém-gerados pelo `onp-spec plano` são sujeira esperada:
  # se forem a ÚNICA sujeira, o script mesmo commita; qualquer outra, aborta
  if [ -n "$(git status --porcelain)" ]; then
    if [ -z "$(git status --porcelain | grep -v -e 'plano-execucao\.' -e 'plano\.json' -e 'executar-tarefas\.sh')" ]; then
      git add -A
      git commit -q -m "plano de execução: $FEATURE (artefatos gerados)"
      info "artefatos do plano commitados"
    else
      falhar "árvore suja além dos artefatos do plano — commite ou faça git stash antes (os worktrees partem do último commit)"
    fi
  fi
  git ls-files --error-unmatch -- '.spec/features/fundacao/spec.md' >/dev/null 2>&1 || falhar "spec.md não está commitada — os worktrees das faixas precisam dela no git"
  ATUAL=$(git rev-parse --abbrev-ref HEAD)
  [ "$ATUAL" != "HEAD" ] || falhar "HEAD destacado — troque para uma branch"
  if [ "$ATUAL" != "$BASE_BRANCH" ]; then
    if git show-ref --verify --quiet "refs/heads/$BASE_BRANCH"; then
      git checkout -q "$BASE_BRANCH" || falhar "não consegui trocar para $BASE_BRANCH"
    else
      git checkout -q -b "$BASE_BRANCH" || falhar "não consegui criar $BASE_BRANCH"
    fi
    info "branch de trabalho: $BASE_BRANCH (a partir de $ATUAL)"
  fi
  git worktree prune
  LOG_DIR="$TOPLEVEL/worktrees/SC-fundacao-logs"
  WT_BASE="$TOPLEVEL/worktrees/SC-fundacao"
  STREAMS_DIR="${ONP_SPEC_HOME:-$HOME/.onp-spec}/painel/streams/$RUN_ID"
  mkdir -p "$LOG_DIR" "$STREAMS_DIR"
}

# worktree limpo mesmo depois de uma tentativa que falhou
preparar_worktree() { # $1=faixa $2=branch $3=worktree
  git worktree prune
  if [ -e "$3" ]; then git worktree remove --force "$3" >/dev/null 2>&1; rm -rf "$3"; fi
  if git show-ref --verify --quiet "refs/heads/$2"; then git branch -D "$2" >/dev/null 2>&1; fi
  git worktree add "$3" -b "$2" >/dev/null 2>&1 || { vermelho "✘ não consegui criar o worktree de $1 em $3"; return 1; }
}

tentativa() { # $1=faixa — conta reexecuções (vai para o ledger)
  local arq="$LOG_DIR/.tentativa-$1"
  local n=1
  [ -f "$arq" ] && n=$(( $(cat "$arq") + 1 ))
  printf "%s" "$n" > "$arq"
  printf "%s" "$n"
}

# uma tarefa = uma sessão claude headless com contexto limpo.
# o JSONL da sessão vira o stream da tarefa no ledger
rodar_tarefa() { # $1=escopo(faixa|seq) $2=T-xxx $3=prompt $4=modelo $5=esforço
  local chave="$1--$2"
  local stream="$STREAMS_DIR/$chave.jsonl"
  evento --tipo tarefa --tarefa "$2" --faixa "$1" --estado executando --stream "$chave"
  info "$2 — claude -p ($4 · $5) · stream: $chave"
  if claude -p "$3" --model "$4" --effort "$5" "${STREAM_FLAGS[@]}" "${CLAUDE_FLAGS[@]}" > "$stream" 2>>"$LOG_DIR/$1.log"; then
    evento --tipo tarefa --tarefa "$2" --faixa "$1" --estado concluida --stream "$chave"
    node "$ENGINE" stream-resumo "$RUN_ID" "$chave" 2>/dev/null || true
    return 0
  fi
  evento --tipo tarefa --tarefa "$2" --faixa "$1" --estado falhou --stream "$chave"
  node "$ENGINE" stream-resumo "$RUN_ID" "$chave" 2>/dev/null || true
  return 1
}

mesclar_faixa() { # $1=faixa $2=branch $3=worktree $4=exit-da-faixa
  if [ "$4" -ne 0 ]; then
    evento --tipo faixa --faixa "$1" --estado falhou
    vermelho "✘ $1 falhou (log: $LOG_DIR/$1.log) — worktree mantido para inspeção: $3"
    amarelo "  reexecute só ela: bash .spec/features/fundacao/executar-tarefas.sh --faixa $1"
    FALHAS="$FALHAS $1"; return 1
  fi
  evento --tipo faixa --faixa "$1" --estado mesclando
  if git merge --no-ff "$2" -m "merge $1 ($FEATURE)"; then
    git worktree remove --force "$3" >/dev/null 2>&1
    git branch -d "$2" >/dev/null 2>&1
    evento --tipo faixa --faixa "$1" --estado mesclada
    verde "✔ $1 mesclada em $BASE_BRANCH"
  else
    git merge --abort >/dev/null 2>&1
    evento --tipo faixa --faixa "$1" --estado conflito
    vermelho "✘ conflito ao mesclar $1 — resolva na mão: git merge $2 (worktree mantido: $3)"
    FALHAS="$FALHAS $1"; return 1
  fi
}

marcar_concluidas() { # $@=T-xxx
  for t in "$@"; do node "$ENGINE" tarefa "$FEATURE" "$t" concluida >/dev/null || true; done
}

# ── resumo geral de andamento: 1/min enquanto a execução roda ─────────
# escrito por IA (claude -p, sem ferramentas) com fallback do motor; vai
# para o terminal e para o ledger — o agente repassa o texto no chat.
gerar_resumo() {
  local ctx ia
  ctx=$(node "$ENGINE" resumo "$FEATURE" --contexto 2>/dev/null) || ctx=""
  [ -n "$ctx" ] || return 0
  ia=$(claude -p "Você narra, para o dono do produto, uma execução de tarefas de código em andamento. Estado mecânico:

$ctx

Escreva o RESUMO GERAL DE ANDAMENTO: um parágrafo único de 2 a 4 frases, em português simples, dizendo o que está acontecendo agora, o que já terminou, o que falhou e se o usuário precisa agir. Sem markdown, sem listas." --model "$RESUMO_MODEL" 2>/dev/null)
  if [ -n "$ia" ]; then
    node "$ENGINE" resumo "$FEATURE" --gravar --origem ia --texto "$ia" >/dev/null 2>&1 || true
    printf '\n📣 resumo (IA): %s\n' "$ia"
  else
    node "$ENGINE" resumo "$FEATURE" --gravar >/dev/null 2>&1 || true
    printf '\n📣 resumo: %s\n' "$(node "$ENGINE" resumo "$FEATURE" 2>/dev/null)"
  fi
}

# mata o loop E o sleep filho — senão o sleep herda o stdout e quem chamou
# o script via pipe fica esperando EOF por até 60s depois do exit
parar_resumos() {
  [ -n "$RESUMO_PID" ] || return 0
  command -v pkill >/dev/null 2>&1 && pkill -P "$RESUMO_PID" 2>/dev/null
  kill "$RESUMO_PID" 2>/dev/null
  RESUMO_PID=""
}

iniciar_resumos() {
  ( while :; do sleep 60; gerar_resumo; done ) &
  RESUMO_PID=$!
  # ao sair: para o loop e grava um último resumo (o estado final, do motor)
  trap 'parar_resumos; node "$ENGINE" resumo "$FEATURE" --gravar >/dev/null 2>&1 || true' EXIT
}

# ── faixa-1: T-002 ──
executar_faixa_1() {
  local WT="$WT_BASE-faixa-1"
  preparar_worktree 'faixa-1' 'spec/fundacao-faixa-1' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-1' --estado executando --tentativa "$(tentativa 'faixa-1')"
  : > "$LOG_DIR/faixa-1.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-1' 'T-002' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-002 — "Ambiente local sobe com um comando"
  critérios/refs: AC-001 (Um comando sobe web, API, banco, cache e roteador)
  arquivos permitidos (e seus testes): infra/compose/docker-compose.yml, infra/compose/docker-compose.ci.yml, infra/compose/.env.compose.example, infra/traefik/traefik.yml, infra/traefik/dynamic/tls.yml, infra/traefik/dynamic/middlewares.yml, infra/scripts/setup.sh, infra/scripts/certs.sh
  mensagem de commit: "T-002 fundacao: Ambiente local sobe com um comando"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' high
  ) >> "$LOG_DIR/faixa-1.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-1' 'spec/fundacao-faixa-1' "$WT" "$st" || return 1
  marcar_concluidas T-002
  return 0
}

# ── faixa-2: T-003 ──
executar_faixa_2() {
  local WT="$WT_BASE-faixa-2"
  preparar_worktree 'faixa-2' 'spec/fundacao-faixa-2' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-2' --estado executando --tentativa "$(tentativa 'faixa-2')"
  : > "$LOG_DIR/faixa-2.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-2' 'T-003' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-003 — "Variáveis de ambiente validadas na partida"
  critérios/refs: AC-002 (Variável de ambiente faltando falha na hora com mensagem clara), AC-031 (Ambiente de produção e de teste nunca compartilham banco)
  arquivos permitidos (e seus testes): .env.example, apps/api/src/core/env.ts, apps/api/src/core/env.test.ts, infra/scripts/check-ambientes.sh
  mensagem de commit: "T-003 fundacao: Variáveis de ambiente validadas na partida"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' low
  ) >> "$LOG_DIR/faixa-2.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-2' 'spec/fundacao-faixa-2' "$WT" "$st" || return 1
  marcar_concluidas T-003
  return 0
}

# ── faixa-3: T-004 ──
executar_faixa_3() {
  local WT="$WT_BASE-faixa-3"
  preparar_worktree 'faixa-3' 'spec/fundacao-faixa-3' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-3' --estado executando --tentativa "$(tentativa 'faixa-3')"
  : > "$LOG_DIR/faixa-3.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-3' 'T-004' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-004 — "Migrações base, credenciais separadas e isolamento por linha"
  critérios/refs: AC-008 (Toda tabela de loja tem isolamento ligado), AC-009 (Consulta sem contexto de loja não devolve nada), AC-012 (Migração roda com credencial separada da aplicação), AC-032 (Banco vazio chega ao estado atual só com as migrações), AC-033 (Migração aplicada duas vezes não quebra nem duplica), AC-034 (Migração pendente é detectada antes de o código subir)
  arquivos permitidos (e seus testes): packages/database/package.json, packages/database/migrations/0001_extensoes_e_roles.sql, packages/database/migrations/0002_identidade.sql, packages/database/migrations/0003_lojas.sql, packages/database/migrations/0004_catalogo.sql, packages/database/migrations/0005_pedidos.sql, packages/database/migrations/0006_impressao_e_auditoria.sql, packages/database/policies/README.md, packages/database/src/migrate.ts, packages/database/src/migrate.test.ts
  mensagem de commit: "T-004 fundacao: Migrações base, credenciais separadas e isolamento por linha"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' max
  ) >> "$LOG_DIR/faixa-3.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-3' 'spec/fundacao-faixa-3' "$WT" "$st" || return 1
  marcar_concluidas T-004
  return 0
}

# ── faixa-4: T-005 ──
executar_faixa_4() {
  local WT="$WT_BASE-faixa-4"
  preparar_worktree 'faixa-4' 'spec/fundacao-faixa-4' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-4' --estado executando --tentativa "$(tentativa 'faixa-4')"
  : > "$LOG_DIR/faixa-4.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-4' 'T-005' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-005 — "Guardas estruturais do banco no portão de qualidade"
  critérios/refs: AC-008 (Toda tabela de loja tem isolamento ligado), AC-035 (Estrutura do banco fora do padrão reprova na integração)
  arquivos permitidos (e seus testes): packages/database/guards/g1_isolamento_ativo.sql, packages/database/guards/g2_politica_por_comando.sql, packages/database/guards/g3_unica_por_loja.sql, packages/database/guards/g4_politica_cita_loja.sql, packages/database/guards/g5_indice_cobre_politica.sql, packages/database/guards/g6_sem_matview_multi_loja.sql, packages/database/guards/g7_view_com_invocador.sql, packages/database/guards/g8_pedido_imutavel.sql, packages/database/guards/g9_auditoria_sem_alteracao.sql, infra/scripts/db-guards.sh, .github/workflows/db-guards.yml
  mensagem de commit: "T-005 fundacao: Guardas estruturais do banco no portão de qualidade"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' high
  ) >> "$LOG_DIR/faixa-4.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-4' 'spec/fundacao-faixa-4' "$WT" "$st" || return 1
  marcar_concluidas T-005
  return 0
}

# ── faixa-5: T-006 ──
executar_faixa_5() {
  local WT="$WT_BASE-faixa-5"
  preparar_worktree 'faixa-5' 'spec/fundacao-faixa-5' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-5' --estado executando --tentativa "$(tentativa 'faixa-5')"
  : > "$LOG_DIR/faixa-5.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-5' 'T-006' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-006 — "Caminho único de acesso ao banco com contexto por transação"
  critérios/refs: AC-010 (Loja A não alcança dado da loja B por nenhum caminho), AC-011 (Contexto de loja não escapa de uma requisição para outra), AC-009 (Consulta sem contexto de loja não devolve nada)
  arquivos permitidos (e seus testes): apps/api/src/core/db.ts, apps/api/src/core/db.test.ts, apps/api/src/core/contexto.ts, apps/api/src/core/contexto.test.ts
  mensagem de commit: "T-006 fundacao: Caminho único de acesso ao banco com contexto por transação"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' max
  ) >> "$LOG_DIR/faixa-5.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-5' 'spec/fundacao-faixa-5' "$WT" "$st" || return 1
  marcar_concluidas T-006
  return 0
}

# ── faixa-6: T-007 ──
executar_faixa_6() {
  local WT="$WT_BASE-faixa-6"
  preparar_worktree 'faixa-6' 'spec/fundacao-faixa-6' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-6' --estado executando --tentativa "$(tentativa 'faixa-6')"
  : > "$LOG_DIR/faixa-6.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-6' 'T-007' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-007 — "Banco de teste separado e efêmero"
  critérios/refs: AC-003 (Banco de teste é separado do banco de desenvolvimento)
  arquivos permitidos (e seus testes): vitest.config.ts, packages/testing/src/db-test.ts, packages/testing/src/db-test.test.ts, packages/testing/package.json
  mensagem de commit: "T-007 fundacao: Banco de teste separado e efêmero"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' high
  ) >> "$LOG_DIR/faixa-6.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-6' 'spec/fundacao-faixa-6' "$WT" "$st" || return 1
  marcar_concluidas T-007
  return 0
}

# ── faixa-7: T-008 ──
executar_faixa_7() {
  local WT="$WT_BASE-faixa-7"
  preparar_worktree 'faixa-7' 'spec/fundacao-faixa-7' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-7' --estado executando --tentativa "$(tentativa 'faixa-7')"
  : > "$LOG_DIR/faixa-7.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-7' 'T-008' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-008 — "Dados de exemplo determinísticos"
  critérios/refs: AC-004 (Dados de exemplo criam um cenário navegável), AC-036 (Dados de exemplo cobrem os ramos e os estados do sistema), AC-037 (Carga de exemplo é determinística e repetível), AC-039 (Carga de exemplo nunca roda em produção)
  arquivos permitidos (e seus testes): packages/database/seed/index.ts, packages/database/seed/lojas.ts, packages/database/seed/catalogo.ts, packages/database/seed/pedidos.ts, packages/database/seed/seed.test.ts
  mensagem de commit: "T-008 fundacao: Dados de exemplo determinísticos"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' high
  ) >> "$LOG_DIR/faixa-7.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-7' 'spec/fundacao-faixa-7' "$WT" "$st" || return 1
  marcar_concluidas T-008
  return 0
}

# ── faixa-8: T-009 ──
executar_faixa_8() {
  local WT="$WT_BASE-faixa-8"
  preparar_worktree 'faixa-8' 'spec/fundacao-faixa-8' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-8' --estado executando --tentativa "$(tentativa 'faixa-8')"
  : > "$LOG_DIR/faixa-8.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-8' 'T-009' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-009 — "Construtores de dados para teste"
  critérios/refs: AC-038 (Teste monta seu próprio cenário sem depender de outro teste)
  arquivos permitidos (e seus testes): packages/testing/src/factories.ts, packages/testing/src/factories.test.ts, packages/testing/src/index.ts
  mensagem de commit: "T-009 fundacao: Construtores de dados para teste"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' medium
  ) >> "$LOG_DIR/faixa-8.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-8' 'spec/fundacao-faixa-8' "$WT" "$st" || return 1
  marcar_concluidas T-009
  return 0
}

# ── faixa-9: T-010 ──
executar_faixa_9() {
  local WT="$WT_BASE-faixa-9"
  preparar_worktree 'faixa-9' 'spec/fundacao-faixa-9' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-9' --estado executando --tentativa "$(tentativa 'faixa-9')"
  : > "$LOG_DIR/faixa-9.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-9' 'T-010' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-010 — "Prova de isolamento entre lojas"
  critérios/refs: AC-010 (Loja A não alcança dado da loja B por nenhum caminho), AC-011 (Contexto de loja não escapa de uma requisição para outra)
  arquivos permitidos (e seus testes): apps/api/tests/isolamento.test.ts, apps/api/tests/isolamento-concorrente.test.ts
  mensagem de commit: "T-010 fundacao: Prova de isolamento entre lojas"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' high
  ) >> "$LOG_DIR/faixa-9.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-9' 'spec/fundacao-faixa-9' "$WT" "$st" || return 1
  marcar_concluidas T-010
  return 0
}

# ── faixa-10: T-011 ──
executar_faixa_10() {
  local WT="$WT_BASE-faixa-10"
  preparar_worktree 'faixa-10' 'spec/fundacao-faixa-10' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-10' --estado executando --tentativa "$(tentativa 'faixa-10')"
  : > "$LOG_DIR/faixa-10.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-10' 'T-011' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-011 — "Contrato compartilhado e documento publicado"
  critérios/refs: AC-006 (Tipos do contrato são compartilhados de uma fonte única), AC-007 (Contrato publicado para aplicativos nativos fica em dia)
  arquivos permitidos (e seus testes): packages/contracts/package.json, packages/contracts/src/index.ts, packages/contracts/src/comum.ts, apps/api/src/contracts/gerar.ts, apps/api/src/contracts/gerar.test.ts, contrato/openapi.json, .github/workflows/contrato.yml
  mensagem de commit: "T-011 fundacao: Contrato compartilhado e documento publicado"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' high
  ) >> "$LOG_DIR/faixa-10.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-10' 'spec/fundacao-faixa-10' "$WT" "$st" || return 1
  marcar_concluidas T-011
  return 0
}

# ── faixa-11: T-012 ──
executar_faixa_11() {
  local WT="$WT_BASE-faixa-11"
  preparar_worktree 'faixa-11' 'spec/fundacao-faixa-11' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-11' --estado executando --tentativa "$(tentativa 'faixa-11')"
  : > "$LOG_DIR/faixa-11.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-11' 'T-012' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-012 — "Registro, erros e verificações de saúde"
  critérios/refs: AC-021 (Registro é estruturado e permite seguir uma requisição inteira), AC-022 (Dado pessoal e segredo nunca aparecem no registro), AC-023 (Verificação de saúde distingue vivo de pronto), AC-024 (Erro não vaza detalhe interno para quem chamou)
  arquivos permitidos (e seus testes): apps/api/src/core/log.ts, apps/api/src/core/log.test.ts, apps/api/src/core/erros.ts, apps/api/src/core/erros.test.ts, apps/api/src/modules/health/health.routes.ts, apps/api/src/modules/health/health.test.ts
  mensagem de commit: "T-012 fundacao: Registro, erros e verificações de saúde"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' medium
  ) >> "$LOG_DIR/faixa-11.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-11' 'spec/fundacao-faixa-11' "$WT" "$st" || return 1
  marcar_concluidas T-012
  return 0
}

# ── faixa-12: T-013 ──
executar_faixa_12() {
  local WT="$WT_BASE-faixa-12"
  preparar_worktree 'faixa-12' 'spec/fundacao-faixa-12' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-12' --estado executando --tentativa "$(tentativa 'faixa-12')"
  : > "$LOG_DIR/faixa-12.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-12' 'T-013' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-013 — "Borda de validação, origens autorizadas e limite de tentativas"
  critérios/refs: AC-125 (Origem não autorizada é recusada), AC-126 (Requisição que muda dados exige origem confiável), AC-127 (Requisição de leitura pública continua livre), AC-128 (Sessão do navegador não vale para requisição de outro site nem por engano), AC-119 (Excesso de tentativas de login é barrado), AC-120 (Limite vale por conta e por origem)
  arquivos permitidos (e seus testes): apps/api/src/core/validar.ts, apps/api/src/core/validar.test.ts, apps/api/src/core/cors.ts, apps/api/src/core/cors.test.ts, apps/api/src/core/limite.ts, apps/api/src/core/limite.test.ts, apps/api/src/app.ts
  mensagem de commit: "T-013 fundacao: Borda de validação, origens autorizadas e limite de tentativas"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' high
  ) >> "$LOG_DIR/faixa-12.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-12' 'spec/fundacao-faixa-12' "$WT" "$st" || return 1
  marcar_concluidas T-013
  return 0
}

# ── faixa-13: T-014 ──
executar_faixa_13() {
  local WT="$WT_BASE-faixa-13"
  preparar_worktree 'faixa-13' 'spec/fundacao-faixa-13' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-13' --estado executando --tentativa "$(tentativa 'faixa-13')"
  : > "$LOG_DIR/faixa-13.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-13' 'T-014' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-014 — "Trabalho em segundo plano com repetição"
  critérios/refs: AC-025 (Envio de e-mail acontece fora do caminho da resposta), AC-026 (Trabalho em segundo plano que falha é repetido e não se perde)
  arquivos permitidos (e seus testes): apps/api/src/jobs/fila.ts, apps/api/src/jobs/fila.test.ts, apps/api/src/jobs/email.job.ts, apps/api/src/jobs/index.ts
  mensagem de commit: "T-014 fundacao: Trabalho em segundo plano com repetição"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' medium
  ) >> "$LOG_DIR/faixa-13.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-13' 'spec/fundacao-faixa-13' "$WT" "$st" || return 1
  marcar_concluidas T-014
  return 0
}

# ── faixa-14: T-015 ──
executar_faixa_14() {
  local WT="$WT_BASE-faixa-14"
  preparar_worktree 'faixa-14' 'spec/fundacao-faixa-14' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-14' --estado executando --tentativa "$(tentativa 'faixa-14')"
  : > "$LOG_DIR/faixa-14.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-14' 'T-015' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-015 — "Cache com identificação de loja e invalidação"
  critérios/refs: AC-027 (Cache acelera sem servir dado de outra loja), AC-028 (Cache é invalidado quando o dado muda)
  arquivos permitidos (e seus testes): apps/api/src/core/cache.ts, apps/api/src/core/cache.test.ts, apps/web/src/server/cache.ts, apps/web/src/app/api/revalidate/route.ts
  mensagem de commit: "T-015 fundacao: Cache com identificação de loja e invalidação"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' high
  ) >> "$LOG_DIR/faixa-14.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-14' 'spec/fundacao-faixa-14' "$WT" "$st" || return 1
  marcar_concluidas T-015
  return 0
}

# ── faixa-15: T-016 ──
executar_faixa_15() {
  local WT="$WT_BASE-faixa-15"
  preparar_worktree 'faixa-15' 'spec/fundacao-faixa-15' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-15' --estado executando --tentativa "$(tentativa 'faixa-15')"
  : > "$LOG_DIR/faixa-15.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-15' 'T-016' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-016 — "Design system com os quatro estados"
  critérios/refs: AC-013 (Componentes base existem com os quatro estados), AC-014 (Cor e espaçamento vêm de valores declarados, não soltos no código), AC-015 (Loja aplica sua identidade sem quebrar o sistema), AC-016 (Telas passam na verificação automática de acessibilidade)
  arquivos permitidos (e seus testes): packages/ui/package.json, packages/ui/styles/theme.css, packages/ui/src/index.ts, packages/ui/src/botao.tsx, packages/ui/src/campo.tsx, packages/ui/src/cartao.tsx, packages/ui/src/lista.tsx, packages/ui/src/aviso.tsx, packages/ui/src/dialogo.tsx, packages/ui/src/estados.tsx, packages/ui/src/tema-loja.tsx, apps/web/src/app/(dev)/ui/page.tsx
  mensagem de commit: "T-016 fundacao: Design system com os quatro estados"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' high
  ) >> "$LOG_DIR/faixa-15.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-15' 'spec/fundacao-faixa-15' "$WT" "$st" || return 1
  marcar_concluidas T-016
  return 0
}

# ── faixa-16: T-017 ──
executar_faixa_16() {
  local WT="$WT_BASE-faixa-16"
  preparar_worktree 'faixa-16' 'spec/fundacao-faixa-16' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-16' --estado executando --tentativa "$(tentativa 'faixa-16')"
  : > "$LOG_DIR/faixa-16.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-16' 'T-017' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-017 — "Portão de qualidade local, com ganchos"
  critérios/refs: AC-017 (Um comando roda a verificação completa), AC-018 (Critério de aceite sem teste reprova a entrega), AC-019 (Teste que apenas foi pulado não conta como prova), AC-020 (Segredo em código é barrado antes de entrar), AC-040 (Gancho antes do registro cobre o rápido), AC-041 (Gancho antes do envio cobre o portão inteiro), AC-042 (Verificação local é reproduzível e não depende do estado da máquina), AC-043 (Pular o portão exige ato deliberado e fica registrado)
  arquivos permitidos (e seus testes): Makefile, lefthook.yml, infra/scripts/verificar.sh, infra/scripts/check-segredos.sh, infra/scripts/check-sem-middleware.sh, docs/verificacao.md
  mensagem de commit: "T-017 fundacao: Portão de qualidade local, com ganchos"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' high
  ) >> "$LOG_DIR/faixa-16.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-16' 'spec/fundacao-faixa-16' "$WT" "$st" || return 1
  marcar_concluidas T-017
  return 0
}

# ── faixa-17: T-018 ──
executar_faixa_17() {
  local WT="$WT_BASE-faixa-17"
  preparar_worktree 'faixa-17' 'spec/fundacao-faixa-17' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-17' --estado executando --tentativa "$(tentativa 'faixa-17')"
  : > "$LOG_DIR/faixa-17.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-17' 'T-018' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-018 — "Publicação com migração antes da troca de versão"
  critérios/refs: AC-029 (Publicação aplica migração antes de trocar a versão), AC-030 (Voltar à versão anterior é possível sem perder dado), AC-031 (Ambiente de produção e de teste nunca compartilham banco)
  arquivos permitidos (e seus testes): infra/railway/pre-deploy.sh, infra/railway/README.md, apps/api/Dockerfile, apps/web/Dockerfile, docs/publicacao.md
  mensagem de commit: "T-018 fundacao: Publicação com migração antes da troca de versão"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' medium
  ) >> "$LOG_DIR/faixa-17.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-17' 'spec/fundacao-faixa-17' "$WT" "$st" || return 1
  marcar_concluidas T-018
  return 0
}

# ── faixa-18: T-019 ──
executar_faixa_18() {
  local WT="$WT_BASE-faixa-18"
  preparar_worktree 'faixa-18' 'spec/fundacao-faixa-18' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-18' --estado executando --tentativa "$(tentativa 'faixa-18')"
  : > "$LOG_DIR/faixa-18.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-18' 'T-019' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-019 — "Esqueleto do Next e da API que sobe vazio e verde"
  critérios/refs: AC-001 (Um comando sobe web, API, banco, cache e roteador), AC-005 (Importação proibida entre módulos quebra a verificação)
  arquivos permitidos (e seus testes): apps/web/package.json, apps/web/next.config.ts, apps/web/postcss.config.mjs, apps/web/src/app/layout.tsx, apps/web/src/app/globals.css, apps/web/src/app/error.tsx, apps/web/src/app/not-found.tsx, apps/web/src/proxy.ts, apps/api/package.json, apps/api/src/main.ts
  mensagem de commit: "T-019 fundacao: Esqueleto do Next e da API que sobe vazio e verde"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' medium
  ) >> "$LOG_DIR/faixa-18.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-18' 'spec/fundacao-faixa-18' "$WT" "$st" || return 1
  marcar_concluidas T-019
  return 0
}

# ── faixa-19: T-020 ──
executar_faixa_19() {
  local WT="$WT_BASE-faixa-19"
  preparar_worktree 'faixa-19' 'spec/fundacao-faixa-19' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-19' --estado executando --tentativa "$(tentativa 'faixa-19')"
  : > "$LOG_DIR/faixa-19.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-19' 'T-020' 'Você executa UMA tarefa da feature "fundacao" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/fundacao/spec.md, .spec/features/fundacao/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-020 — "Manifesto de rotas e cobertura de telas"
  critérios/refs: AC-016 (Telas passam na verificação automática de acessibilidade)
  arquivos permitidos (e seus testes): apps/web/src/lib/routes.ts, e2e/playwright.config.ts, e2e/specs/rotas-manifesto.spec.ts, e2e/specs/manifesto-cobre-arquivos.spec.ts, e2e/specs/a11y.spec.ts, e2e/fixtures/auth.setup.ts
  mensagem de commit: "T-020 fundacao: Manifesto de rotas e cobertura de telas"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'claude-sonnet-5' high
  ) >> "$LOG_DIR/faixa-19.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-19' 'spec/fundacao-faixa-19' "$WT" "$st" || return 1
  marcar_concluidas T-020
  return 0
}

# ── gate: quem decide é a máquina ────────────────────────────────────
rodar_gate() {
  echo
  info "gate: verify + audit --ci"
  evento --tipo gate --etapa inicio
  node "$ENGINE" verify "$FEATURE"
  local v=$?
  evento --tipo gate --etapa verify --exit "$v"
  node "$ENGINE" audit --ci
  AUDIT=$?
  evento --tipo gate --etapa audit --exit "$AUDIT"
  # fecha a contabilidade: status das tarefas + prova do verify no git
  if [ -n "$(git status --porcelain -- '.spec')" ]; then
    git add -A -- '.spec'
    git commit -q -m "$FEATURE: status das tarefas + prova do verify (plano)"
    info "status das tarefas e prova do verify commitados"
  fi
  return "$AUDIT"
}

encerrar() { # $1=escopo
  echo
  if [ -n "$FALHAS" ]; then vermelho "faixas/tarefas com falha:$FALHAS"; fi
  # sem gate não existe veredito: NUNCA anunciar alinhamento sem o audit
  if [ "$COM_GATE" -eq 0 ]; then
    evento --tipo fim --exit 1 --escopo "$1"
    if [ -z "$FALHAS" ]; then
      amarelo "○ trabalho de '$1' terminou SEM o gate (--sem-gate) — isto NÃO é prova de nada"
      amarelo "  para o veredito: bash .spec/features/fundacao/executar-tarefas.sh --gate"
      exit 0
    fi
    vermelho "e ainda há falhas — conserte e rode o gate"
    exit 1
  fi
  rodar_gate
  local audit=$?
  if [ "$audit" -eq 0 ] && [ -z "$FALHAS" ]; then
    evento --tipo fim --exit 0 --escopo "$1"
    verde "✔ plano concluído — especificação e código alinhados (audit exit 0) na branch $BASE_BRANCH"
    info "próximo passo: revise e leve para a main quando quiser (git merge $BASE_BRANCH)"
    exit 0
  fi
  evento --tipo fim --exit 1 --escopo "$1"
  vermelho "plano terminou com pendências — leia a saída do audit acima e os logs em $LOG_DIR"
  amarelo "dica: reexecute só o que falhou (--faixa <id> / --seq <T-xxx>)"
  exit 1
}

executar_tudo() {
  evento --tipo inicio --escopo tudo
  iniciar_resumos
  info "logs em: $LOG_DIR"
  info "resumo geral de andamento: a cada 1 min aqui no terminal (e via: onp-spec resumo)"
  # onda 1: faixa-1 ∥ faixa-2 ∥ faixa-3
  info "onda 1: faixa-1 ∥ faixa-2 ∥ faixa-3 — janelas limpas em paralelo"
  executar_faixa_1 & PID_FAIXA_1=$!
  executar_faixa_2 & PID_FAIXA_2=$!
  executar_faixa_3 & PID_FAIXA_3=$!
  wait "$PID_FAIXA_1" || true
  wait "$PID_FAIXA_2" || true
  wait "$PID_FAIXA_3" || true
  # onda 2: faixa-4 ∥ faixa-5 ∥ faixa-6
  info "onda 2: faixa-4 ∥ faixa-5 ∥ faixa-6 — janelas limpas em paralelo"
  executar_faixa_4 & PID_FAIXA_4=$!
  executar_faixa_5 & PID_FAIXA_5=$!
  executar_faixa_6 & PID_FAIXA_6=$!
  wait "$PID_FAIXA_4" || true
  wait "$PID_FAIXA_5" || true
  wait "$PID_FAIXA_6" || true
  # onda 3: faixa-7 ∥ faixa-8 ∥ faixa-9
  info "onda 3: faixa-7 ∥ faixa-8 ∥ faixa-9 — janelas limpas em paralelo"
  executar_faixa_7 & PID_FAIXA_7=$!
  executar_faixa_8 & PID_FAIXA_8=$!
  executar_faixa_9 & PID_FAIXA_9=$!
  wait "$PID_FAIXA_7" || true
  wait "$PID_FAIXA_8" || true
  wait "$PID_FAIXA_9" || true
  # onda 4: faixa-10 ∥ faixa-11 ∥ faixa-12
  info "onda 4: faixa-10 ∥ faixa-11 ∥ faixa-12 — janelas limpas em paralelo"
  executar_faixa_10 & PID_FAIXA_10=$!
  executar_faixa_11 & PID_FAIXA_11=$!
  executar_faixa_12 & PID_FAIXA_12=$!
  wait "$PID_FAIXA_10" || true
  wait "$PID_FAIXA_11" || true
  wait "$PID_FAIXA_12" || true
  # onda 5: faixa-13 ∥ faixa-14 ∥ faixa-15
  info "onda 5: faixa-13 ∥ faixa-14 ∥ faixa-15 — janelas limpas em paralelo"
  executar_faixa_13 & PID_FAIXA_13=$!
  executar_faixa_14 & PID_FAIXA_14=$!
  executar_faixa_15 & PID_FAIXA_15=$!
  wait "$PID_FAIXA_13" || true
  wait "$PID_FAIXA_14" || true
  wait "$PID_FAIXA_15" || true
  # onda 6: faixa-16 ∥ faixa-17 ∥ faixa-18
  info "onda 6: faixa-16 ∥ faixa-17 ∥ faixa-18 — janelas limpas em paralelo"
  executar_faixa_16 & PID_FAIXA_16=$!
  executar_faixa_17 & PID_FAIXA_17=$!
  executar_faixa_18 & PID_FAIXA_18=$!
  wait "$PID_FAIXA_16" || true
  wait "$PID_FAIXA_17" || true
  wait "$PID_FAIXA_18" || true
  # onda 7: faixa-19
  info "onda 7: faixa-19 — janelas limpas em paralelo"
  executar_faixa_19 & PID_FAIXA_19=$!
  wait "$PID_FAIXA_19" || true
  encerrar tudo
}

listar() {
  echo "execução: $RUN_ID (feature $FEATURE, branch $BASE_BRANCH)"
  echo "  faixa-1  onda 1  T-002"
  echo "  faixa-2  onda 1  T-003"
  echo "  faixa-3  onda 1  T-004"
  echo "  faixa-4  onda 2  T-005"
  echo "  faixa-5  onda 2  T-006"
  echo "  faixa-6  onda 2  T-007"
  echo "  faixa-7  onda 3  T-008"
  echo "  faixa-8  onda 3  T-009"
  echo "  faixa-9  onda 3  T-010"
  echo "  faixa-10  onda 4  T-011"
  echo "  faixa-11  onda 4  T-012"
  echo "  faixa-12  onda 4  T-013"
  echo "  faixa-13  onda 5  T-014"
  echo "  faixa-14  onda 5  T-015"
  echo "  faixa-15  onda 5  T-016"
  echo "  faixa-16  onda 6  T-017"
  echo "  faixa-17  onda 6  T-018"
  echo "  faixa-18  onda 6  T-019"
  echo "  faixa-19  onda 7  T-020"
  echo
  echo "reexecutar uma faixa:    --faixa <id>"
  echo "reexecutar sequencial:   --seq <T-xxx>"
  echo "só o gate:               --gate"
}

MODO="tudo"
ALVO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --listar) MODO="listar" ;;
    --gate) MODO="gate" ;;
    --sem-gate) COM_GATE=0 ;;
    --faixa) MODO="faixa"; ALVO="${2:-}"; shift ;;
    --seq) MODO="seq"; ALVO="${2:-}"; shift ;;
    -h|--help) sed -n "2,14p" "$0"; exit 0 ;;
    *) vermelho "argumento desconhecido: $1"; sed -n "2,14p" "$0"; exit 2 ;;
  esac
  shift
done

if [ "$MODO" = "listar" ]; then listar; exit 0; fi

preparar_ambiente

case "$MODO" in
  tudo) executar_tudo ;;
  gate) COM_GATE=1; iniciar_resumos; encerrar gate ;;
  faixa)
    case "$ALVO" in
      faixa-1) evento --tipo inicio --escopo "faixa:faixa-1"; iniciar_resumos; executar_faixa_1 || true; encerrar "faixa:faixa-1" ;;
      faixa-2) evento --tipo inicio --escopo "faixa:faixa-2"; iniciar_resumos; executar_faixa_2 || true; encerrar "faixa:faixa-2" ;;
      faixa-3) evento --tipo inicio --escopo "faixa:faixa-3"; iniciar_resumos; executar_faixa_3 || true; encerrar "faixa:faixa-3" ;;
      faixa-4) evento --tipo inicio --escopo "faixa:faixa-4"; iniciar_resumos; executar_faixa_4 || true; encerrar "faixa:faixa-4" ;;
      faixa-5) evento --tipo inicio --escopo "faixa:faixa-5"; iniciar_resumos; executar_faixa_5 || true; encerrar "faixa:faixa-5" ;;
      faixa-6) evento --tipo inicio --escopo "faixa:faixa-6"; iniciar_resumos; executar_faixa_6 || true; encerrar "faixa:faixa-6" ;;
      faixa-7) evento --tipo inicio --escopo "faixa:faixa-7"; iniciar_resumos; executar_faixa_7 || true; encerrar "faixa:faixa-7" ;;
      faixa-8) evento --tipo inicio --escopo "faixa:faixa-8"; iniciar_resumos; executar_faixa_8 || true; encerrar "faixa:faixa-8" ;;
      faixa-9) evento --tipo inicio --escopo "faixa:faixa-9"; iniciar_resumos; executar_faixa_9 || true; encerrar "faixa:faixa-9" ;;
      faixa-10) evento --tipo inicio --escopo "faixa:faixa-10"; iniciar_resumos; executar_faixa_10 || true; encerrar "faixa:faixa-10" ;;
      faixa-11) evento --tipo inicio --escopo "faixa:faixa-11"; iniciar_resumos; executar_faixa_11 || true; encerrar "faixa:faixa-11" ;;
      faixa-12) evento --tipo inicio --escopo "faixa:faixa-12"; iniciar_resumos; executar_faixa_12 || true; encerrar "faixa:faixa-12" ;;
      faixa-13) evento --tipo inicio --escopo "faixa:faixa-13"; iniciar_resumos; executar_faixa_13 || true; encerrar "faixa:faixa-13" ;;
      faixa-14) evento --tipo inicio --escopo "faixa:faixa-14"; iniciar_resumos; executar_faixa_14 || true; encerrar "faixa:faixa-14" ;;
      faixa-15) evento --tipo inicio --escopo "faixa:faixa-15"; iniciar_resumos; executar_faixa_15 || true; encerrar "faixa:faixa-15" ;;
      faixa-16) evento --tipo inicio --escopo "faixa:faixa-16"; iniciar_resumos; executar_faixa_16 || true; encerrar "faixa:faixa-16" ;;
      faixa-17) evento --tipo inicio --escopo "faixa:faixa-17"; iniciar_resumos; executar_faixa_17 || true; encerrar "faixa:faixa-17" ;;
      faixa-18) evento --tipo inicio --escopo "faixa:faixa-18"; iniciar_resumos; executar_faixa_18 || true; encerrar "faixa:faixa-18" ;;
      faixa-19) evento --tipo inicio --escopo "faixa:faixa-19"; iniciar_resumos; executar_faixa_19 || true; encerrar "faixa:faixa-19" ;;
      *) falhar "faixa desconhecida: '$ALVO' — veja as disponíveis com --listar" ;;
    esac ;;
  seq)
    case "$ALVO" in
      *) falhar "tarefa sequencial desconhecida: '$ALVO' — veja as disponíveis com --listar" ;;
    esac ;;
esac
