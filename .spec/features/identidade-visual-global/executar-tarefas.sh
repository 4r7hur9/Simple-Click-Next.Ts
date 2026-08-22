#!/usr/bin/env bash
# executar-tarefas.sh — gerado por `onp-spec plano identidade-visual-global` em 2026-08-22 05:23
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
# resumo do que está rolando, a qualquer momento: onp-spec resumo identidade-visual-global
set -u
set -o pipefail

RUN_ID='Simple-Click-Next.Ts-identidade-visual-global-mt3xnf5g'
FEATURE='identidade-visual-global'
BASE_BRANCH='spec/identidade-visual-global'
ENGINE='C:\Users\arthu\.agents\skills\onp-spec-driven\scripts\onp-spec.mjs'
CODEX_FLAGS=(--sandbox 'workspace-write')
STREAM_FLAGS=(--json)
FALHAS=""
COM_GATE=1
RESUMO_MODEL='gpt-5.6-luna'
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
  command -v codex >/dev/null 2>&1 || falhar "Codex CLI (codex) não encontrado — instale-o ou siga o modo manual em plano-execucao.md"
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
  git ls-files --error-unmatch -- '.spec/features/identidade-visual-global/spec.md' >/dev/null 2>&1 || falhar "spec.md não está commitada — os worktrees das faixas precisam dela no git"
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
  LOG_DIR="$(dirname "$TOPLEVEL")/onp-worktrees/Simple-Click-Next.Ts-identidade-visual-global-logs"
  WT_BASE="$(dirname "$TOPLEVEL")/onp-worktrees/Simple-Click-Next.Ts-identidade-visual-global"
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

# uma tarefa = uma sessão codex exec headless com contexto limpo.
# o JSONL da sessão vira o stream da tarefa no ledger
rodar_tarefa() { # $1=escopo(faixa|seq) $2=T-xxx $3=prompt $4=modelo $5=esforço
  local chave="$1--$2"
  local stream="$STREAMS_DIR/$chave.jsonl"
  evento --tipo tarefa --tarefa "$2" --faixa "$1" --estado executando --stream "$chave"
  info "$2 — codex exec ($4 · $5) · stream: $chave"
  # --add-dir: o .git compartilhado dos worktrees mora no repo principal —
  # sem ele o sandbox workspace-write bloquearia o commit da tarefa
  if codex exec "$3" --model "$4" -c model_reasoning_effort="$5" "${STREAM_FLAGS[@]}" "${CODEX_FLAGS[@]}" --add-dir "$TOPLEVEL" > "$stream" 2>>"$LOG_DIR/$1.log"; then
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
    amarelo "  reexecute só ela: bash .spec/features/identidade-visual-global/executar-tarefas.sh --faixa $1"
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
# escrito por IA (codex exec somente leitura) com fallback do motor; vai
# para o terminal e para o ledger — o agente repassa o texto no chat.
gerar_resumo() {
  local ctx ia
  ctx=$(node "$ENGINE" resumo "$FEATURE" --contexto 2>/dev/null) || ctx=""
  [ -n "$ctx" ] || return 0
  ia=$(codex exec "Você narra, para o dono do produto, uma execução de tarefas de código em andamento. Estado mecânico:

$ctx

Escreva o RESUMO GERAL DE ANDAMENTO: um parágrafo único de 2 a 4 frases, em português simples, dizendo o que está acontecendo agora, o que já terminou, o que falhou e se o usuário precisa agir. Sem markdown, sem listas." --model "$RESUMO_MODEL" --sandbox read-only --ephemeral 2>/dev/null)
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

# ── faixa-1: T-965 ──
executar_faixa_1() {
  local WT="$WT_BASE-faixa-1"
  preparar_worktree 'faixa-1' 'spec/identidade-visual-global-faixa-1' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-1' --estado executando --tentativa "$(tentativa 'faixa-1')"
  : > "$LOG_DIR/faixa-1.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-1' 'T-965' 'Você executa UMA tarefa da feature "identidade-visual-global" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/identidade-visual-global/spec.md, .spec/features/identidade-visual-global/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-965 — "Instalar ativos oficiais e congelar os tokens da marca"
  critérios/refs: AC-941 (A paleta oficial governa as superfícies da plataforma), AC-942 (A tipografia oficial tem hierarquia estável), AC-943 (A identidade continua legível e navegável), AC-945 (A marca oficial é aplicada sem deformação ou efeito indevido)
  arquivos permitidos (e seus testes): apps/web/public/brand/logo-primary.svg, apps/web/public/brand/logo-reverse.svg, apps/web/public/brand/logo-monochrome-black.svg, apps/web/public/brand/logo-monochrome-white.svg, apps/web/public/brand/app-icon-light.svg, apps/web/public/brand/app-icon-dark.svg, packages/ui/styles/theme.css, packages/ui/src/tokens.ts, packages/ui/tests/tokens.test.ts, packages/ui/tests/contraste.test.ts
  mensagem de commit: "T-965 identidade-visual-global: Instalar ativos oficiais e congelar os tokens da marca"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'gpt-5' high
  ) >> "$LOG_DIR/faixa-1.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-1' 'spec/identidade-visual-global-faixa-1' "$WT" "$st" || return 1
  marcar_concluidas T-965
  return 0
}

# ── faixa-2: T-966 ──
executar_faixa_2() {
  local WT="$WT_BASE-faixa-2"
  preparar_worktree 'faixa-2' 'spec/identidade-visual-global-faixa-2' "$WT" || return 1
  evento --tipo faixa --faixa 'faixa-2' --estado executando --tentativa "$(tentativa 'faixa-2')"
  : > "$LOG_DIR/faixa-2.log"
  (
    cd "$WT" || exit 9
    rodar_tarefa 'faixa-2' 'T-966' 'Você executa UMA tarefa da feature "identidade-visual-global" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/identidade-visual-global/spec.md, .spec/features/identidade-visual-global/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-966 — "Aplicar Space Grotesk e Inter sem depender da rede em execução"
  critérios/refs: AC-942 (A tipografia oficial tem hierarquia estável)
  arquivos permitidos (e seus testes): apps/web/src/app/layout.tsx, apps/web/tests/tipografia-identidade.test.ts
  mensagem de commit: "T-966 identidade-visual-global: Aplicar Space Grotesk e Inter sem depender da rede em execução"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'gpt-5' medium
  ) >> "$LOG_DIR/faixa-2.log" 2>&1
  local st=$?
  mesclar_faixa 'faixa-2' 'spec/identidade-visual-global-faixa-2' "$WT" "$st" || return 1
  marcar_concluidas T-966
  return 0
}

# ── sequencial T-967 (fora da seleção do usuário) ──
executar_seq_T_967() {
  info 'sequencial T-967 — Expor os tokens como API semântica do Tailwind 4'
  if rodar_tarefa seq 'T-967' 'Você executa UMA tarefa da feature "identidade-visual-global" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/identidade-visual-global/spec.md, .spec/features/identidade-visual-global/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-967 — "Expor os tokens como API semântica do Tailwind 4"
  critérios/refs: AC-946 (Tailwind e CSS falam o mesmo vocabulário), AC-948 (Valor visual solto é barrado antes de entrar)
  arquivos permitidos (e seus testes): apps/web/src/app/tokens.css, apps/web/src/app/globals.css, apps/web/tests/tailwind-identidade.test.ts
  mensagem de commit: "T-967 identidade-visual-global: Expor os tokens como API semântica do Tailwind 4"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'gpt-5' medium >> "$LOG_DIR/seq.log" 2>&1; then
    # commit de segurança se o agente esqueceu (rastreabilidade > perfeição)
    if [ -n "$(git status --porcelain)" ]; then
      git add -A && git commit -q -m 'T-967 identidade-visual-global: Expor os tokens como API semântica do Tailwind 4 (auto-commit do plano)'
    fi
    marcar_concluidas T-967
    verde "✔ T-967 concluída"
    return 0
  fi
  vermelho "✘ T-967 falhou (log: $LOG_DIR/seq.log)"
  amarelo "  reexecute só ela: bash .spec/features/identidade-visual-global/executar-tarefas.sh --seq T-967"
  FALHAS="$FALHAS T-967"
  return 1
}

# ── sequencial T-968 (fora da seleção do usuário) ──
executar_seq_T_968() {
  info 'sequencial T-968 — Definir a base global da interface'
  if rodar_tarefa seq 'T-968' 'Você executa UMA tarefa da feature "identidade-visual-global" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/identidade-visual-global/spec.md, .spec/features/identidade-visual-global/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-968 — "Definir a base global da interface"
  critérios/refs: AC-942 (A tipografia oficial tem hierarquia estável), AC-943 (A identidade continua legível e navegável), AC-947 (O padrão global nasce pronto para uso real), AC-950 (Nenhuma camada visual compete com a leitura), AC-951 (Texto não vira enfeite dentro de pílula)
  arquivos permitidos (e seus testes): apps/web/src/app/globals.css, apps/web/tests/css-global.test.ts
  mensagem de commit: "T-968 identidade-visual-global: Definir a base global da interface"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'gpt-5' high >> "$LOG_DIR/seq.log" 2>&1; then
    # commit de segurança se o agente esqueceu (rastreabilidade > perfeição)
    if [ -n "$(git status --porcelain)" ]; then
      git add -A && git commit -q -m 'T-968 identidade-visual-global: Definir a base global da interface (auto-commit do plano)'
    fi
    marcar_concluidas T-968
    verde "✔ T-968 concluída"
    return 0
  fi
  vermelho "✘ T-968 falhou (log: $LOG_DIR/seq.log)"
  amarelo "  reexecute só ela: bash .spec/features/identidade-visual-global/executar-tarefas.sh --seq T-968"
  FALHAS="$FALHAS T-968"
  return 1
}

# ── sequencial T-969 (fora da seleção do usuário) ──
executar_seq_T_969() {
  info 'sequencial T-969 — Alinhar os componentes base à identidade oficial'
  if rodar_tarefa seq 'T-969' 'Você executa UMA tarefa da feature "identidade-visual-global" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/identidade-visual-global/spec.md, .spec/features/identidade-visual-global/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-969 — "Alinhar os componentes base à identidade oficial"
  critérios/refs: AC-941 (A paleta oficial governa as superfícies da plataforma), AC-942 (A tipografia oficial tem hierarquia estável), AC-943 (A identidade continua legível e navegável), AC-948 (Valor visual solto é barrado antes de entrar), AC-950 (Nenhuma camada visual compete com a leitura), AC-951 (Texto não vira enfeite dentro de pílula)
  arquivos permitidos (e seus testes): packages/ui/styles/componentes.css, packages/ui/tests/componentes.test.tsx, apps/web/tests/cores-projeto.test.ts
  mensagem de commit: "T-969 identidade-visual-global: Alinhar os componentes base à identidade oficial"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'gpt-5' high >> "$LOG_DIR/seq.log" 2>&1; then
    # commit de segurança se o agente esqueceu (rastreabilidade > perfeição)
    if [ -n "$(git status --porcelain)" ]; then
      git add -A && git commit -q -m 'T-969 identidade-visual-global: Alinhar os componentes base à identidade oficial (auto-commit do plano)'
    fi
    marcar_concluidas T-969
    verde "✔ T-969 concluída"
    return 0
  fi
  vermelho "✘ T-969 falhou (log: $LOG_DIR/seq.log)"
  amarelo "  reexecute só ela: bash .spec/features/identidade-visual-global/executar-tarefas.sh --seq T-969"
  FALHAS="$FALHAS T-969"
  return 1
}

# ── sequencial T-970 (fora da seleção do usuário) ──
executar_seq_T_970() {
  info 'sequencial T-970 — Preservar a personalização isolada da loja e da landing'
  if rodar_tarefa seq 'T-970' 'Você executa UMA tarefa da feature "identidade-visual-global" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/identidade-visual-global/spec.md, .spec/features/identidade-visual-global/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-970 — "Preservar a personalização isolada da loja e da landing"
  critérios/refs: AC-943 (A identidade continua legível e navegável), AC-944 (A marca da loja não destrói a marca da plataforma)
  arquivos permitidos (e seus testes): packages/ui/src/tema-loja.tsx, packages/ui/tests/tema-loja.test.tsx, packages/ui/styles/landing.css, apps/web/tests/landing-previa.test.tsx
  mensagem de commit: "T-970 identidade-visual-global: Preservar a personalização isolada da loja e da landing"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'gpt-5' high >> "$LOG_DIR/seq.log" 2>&1; then
    # commit de segurança se o agente esqueceu (rastreabilidade > perfeição)
    if [ -n "$(git status --porcelain)" ]; then
      git add -A && git commit -q -m 'T-970 identidade-visual-global: Preservar a personalização isolada da loja e da landing (auto-commit do plano)'
    fi
    marcar_concluidas T-970
    verde "✔ T-970 concluída"
    return 0
  fi
  vermelho "✘ T-970 falhou (log: $LOG_DIR/seq.log)"
  amarelo "  reexecute só ela: bash .spec/features/identidade-visual-global/executar-tarefas.sh --seq T-970"
  FALHAS="$FALHAS T-970"
  return 1
}

# ── sequencial T-971 (fora da seleção do usuário) ──
executar_seq_T_971() {
  info 'sequencial T-971 — Completar a vitrine interna da identidade'
  if rodar_tarefa seq 'T-971' 'Você executa UMA tarefa da feature "identidade-visual-global" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/identidade-visual-global/spec.md, .spec/features/identidade-visual-global/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-971 — "Completar a vitrine interna da identidade"
  critérios/refs: AC-945 (A marca oficial é aplicada sem deformação ou efeito indevido), AC-949 (A vitrine visual mostra o sistema inteiro)
  arquivos permitidos (e seus testes): apps/web/src/app/(dev)/ui/page.tsx, apps/web/tests/vitrine-ui-a11y.test.tsx, apps/web/tests/vitrine-identidade.test.tsx
  mensagem de commit: "T-971 identidade-visual-global: Completar a vitrine interna da identidade"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `pnpm vitest run --reporter=json --outputFile=.spec/.vitest-report.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' 'gpt-5' medium >> "$LOG_DIR/seq.log" 2>&1; then
    # commit de segurança se o agente esqueceu (rastreabilidade > perfeição)
    if [ -n "$(git status --porcelain)" ]; then
      git add -A && git commit -q -m 'T-971 identidade-visual-global: Completar a vitrine interna da identidade (auto-commit do plano)'
    fi
    marcar_concluidas T-971
    verde "✔ T-971 concluída"
    return 0
  fi
  vermelho "✘ T-971 falhou (log: $LOG_DIR/seq.log)"
  amarelo "  reexecute só ela: bash .spec/features/identidade-visual-global/executar-tarefas.sh --seq T-971"
  FALHAS="$FALHAS T-971"
  return 1
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
      amarelo "  para o veredito: bash .spec/features/identidade-visual-global/executar-tarefas.sh --gate"
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
  # onda 1: faixa-1 ∥ faixa-2
  info "onda 1: faixa-1 ∥ faixa-2 — janelas limpas em paralelo"
  executar_faixa_1 & PID_FAIXA_1=$!
  executar_faixa_2 & PID_FAIXA_2=$!
  wait "$PID_FAIXA_1" || true
  wait "$PID_FAIXA_2" || true
  executar_seq_T_967 || true
  executar_seq_T_968 || true
  executar_seq_T_969 || true
  executar_seq_T_970 || true
  executar_seq_T_971 || true
  encerrar tudo
}

listar() {
  echo "execução: $RUN_ID (feature $FEATURE, branch $BASE_BRANCH)"
  echo "  faixa-1  onda 1  T-965"
  echo "  faixa-2  onda 1  T-966"
  echo "  seq       T-967 (sequencial)"
  echo "  seq       T-968 (sequencial)"
  echo "  seq       T-969 (sequencial)"
  echo "  seq       T-970 (sequencial)"
  echo "  seq       T-971 (sequencial)"
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
      *) falhar "faixa desconhecida: '$ALVO' — veja as disponíveis com --listar" ;;
    esac ;;
  seq)
    case "$ALVO" in
      T-967) evento --tipo inicio --escopo "seq:T-967"; iniciar_resumos; executar_seq_T_967 || true; encerrar "seq:T-967" ;;
      T-968) evento --tipo inicio --escopo "seq:T-968"; iniciar_resumos; executar_seq_T_968 || true; encerrar "seq:T-968" ;;
      T-969) evento --tipo inicio --escopo "seq:T-969"; iniciar_resumos; executar_seq_T_969 || true; encerrar "seq:T-969" ;;
      T-970) evento --tipo inicio --escopo "seq:T-970"; iniciar_resumos; executar_seq_T_970 || true; encerrar "seq:T-970" ;;
      T-971) evento --tipo inicio --escopo "seq:T-971"; iniciar_resumos; executar_seq_T_971 || true; encerrar "seq:T-971" ;;
      *) falhar "tarefa sequencial desconhecida: '$ALVO' — veja as disponíveis com --listar" ;;
    esac ;;
esac
