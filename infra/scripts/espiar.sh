#!/usr/bin/env bash
# Mostra o que cada agente está fazendo AGORA — a última ação de cada um.
#     bash infra/scripts/espiar.sh          → uma foto
#     bash infra/scripts/espiar.sh -f       → acompanha ao vivo
set -uo pipefail
WF="$HOME/.claude/projects/-Users-stargrupo-Documents-SC/8a4532c2-839d-493b-b081-fae8975604b7/subagents/workflows"

foto() {
  local dir; dir=$(ls -dt "$WF"/wf_* 2>/dev/null | head -1)
  [ -z "${dir:-}" ] && { echo "nenhum agente rodando"; return; }
  printf '\033[1m%s\033[0m\n\n' "$(date '+%H:%M:%S')  o que cada agente está fazendo"
  for f in "$dir"/agent-*.jsonl; do
    [ -e "$f" ] || continue
    python3 - "$f" <<'PY'
import json, sys, os, time
f = sys.argv[1]
idade = int(time.time() - os.path.getmtime(f))
acao = "—"
try:
    linhas = open(f).readlines()
    for l in reversed(linhas[-60:]):
        e = json.loads(l)
        m = e.get("message")
        c = m.get("content") if isinstance(m, dict) else None
        if not isinstance(c, list):
            continue
        for b in c:
            if b.get("type") == "tool_use":
                nome = b.get("name", "?")
                ent = str(b.get("input", ""))[:90].replace("\n", " ")
                acao = f"{nome}  {ent}"
                break
            if b.get("type") == "text" and b.get("text", "").strip():
                acao = "escrevendo: " + b["text"].strip().replace("\n", " ")[:90]
                break
        if acao != "—":
            break
except Exception:
    pass
cor = "32" if idade <= 180 else "90"
print(f"  \033[{cor}m●\033[0m {os.path.basename(f)[6:14]}  ({idade}s atrás)")
print(f"      {acao}\n")
PY
  done
}

if [ "${1:-}" = "-f" ]; then
  while true; do clear; foto; sleep 8; done
else
  foto
fi
