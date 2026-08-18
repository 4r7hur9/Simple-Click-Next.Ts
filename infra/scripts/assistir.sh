#!/usr/bin/env bash
# Painel ao vivo da implementação. Rode num terminal ao lado:
#     bash infra/scripts/assistir.sh
# Atualiza sozinho a cada 10 segundos, independente do que o assistente esteja
# fazendo — o chat só recebe mensagem quando ele está entre uma tarefa e outra.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

WF="$HOME/.claude/projects/-Users-stargrupo-Documents-SC/8a4532c2-839d-493b-b081-fae8975604b7/subagents/workflows"

while true; do
  clear
  printf '\033[1m  SimpleClick — implementação ao vivo\033[0m        %s\n' "$(date '+%H:%M:%S')"
  printf '  ─────────────────────────────────────────────────────\n\n'

  dir=$(ls -dt "$WF"/wf_* 2>/dev/null | head -1)
  if [ -n "${dir:-}" ]; then
    prontos=$(grep -c '"type":"result"' "$dir/journal.jsonl" 2>/dev/null | tr -d '\n' || echo 0)
    total=$(grep -c '"type":"started"' "$dir/journal.jsonl" 2>/dev/null | tr -d '\n' || echo 0)
    printf '  agentes: \033[1m%s/%s\033[0m concluídos\n\n' "$prontos" "$total"
    agora=$(date +%s)
    for f in "$dir"/agent-*.jsonl; do
      [ -e "$f" ] || continue
      idade=$(( agora - $(stat -f %m "$f") ))
      kb=$(( $(stat -f %z "$f") / 1024 ))
      if [ "$idade" -le 180 ]; then
        printf '    \033[32m●\033[0m %s  escrevendo há %ss  (%s KB)\n' "$(basename "$f" | cut -c7-14)" "$idade" "$kb"
      else
        printf '    \033[90m○\033[0m %s  parado há %ss  (%s KB)\n' "$(basename "$f" | cut -c7-14)" "$idade" "$kb"
      fi
    done
  else
    printf '  nenhum agente rodando\n'
  fi

  printf '\n  ─────────────────────────────────────────────────────\n'
  feitas=$(grep -cE '^## T-.*\[concluida\]' .spec/features/fundacao/tasks.md 2>/dev/null || echo 0)
  printf '  fundação: \033[1m%s/20\033[0m tarefas\n' "$feitas"
  if [ -f .spec/verification/fundacao.json ]; then
    printf '  último commit: %s\n' "$(git log --oneline -1 2>/dev/null | cut -c1-52)"
  fi
  printf '\n  \033[90mCtrl-C para sair · atualiza a cada 10s\033[0m\n'
  sleep 10
done
