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
# A situação vai em TEXTO, e não só em cor: informação que existe apenas na cor
# some ao copiar e colar, e foi assim que dois agentes mortos há uma hora
# pareceram estar trabalhando.
morreu = "529" in acao or "Error" in acao
if morreu:
    situacao, cor = "MORTO", "31"
elif idade <= 180:
    situacao, cor = "escrevendo", "32"
elif idade <= 900:
    situacao, cor = "parado", "33"
else:
    situacao, cor = "ABANDONADO", "90"

def humano(s):
    if s < 90: return f"{s}s"
    if s < 5400: return f"{s // 60}min"
    return f"{s // 3600}h{(s % 3600) // 60:02d}"

print(f"  \033[{cor}m[{situacao}]\033[0m {os.path.basename(f)[6:14]}  última atividade há {humano(idade)}")
print(f"      {acao}\n")
PY
  done
}

if [ "${1:-}" = "-f" ]; then
  while true; do clear; foto; sleep 8; done
else
  foto
fi
