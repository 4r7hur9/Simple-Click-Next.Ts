#!/usr/bin/env bash
# A mensagem de commit cita a tarefa: 1 tarefa = 1 commit rastreável.
# Formato: "T-000 <feature>: resumo"  ou  "<tipo>: resumo" para trabalho fora de tarefa.
set -uo pipefail
arquivo="${1:-}"
[ -f "$arquivo" ] || exit 0
primeira=$(head -1 "$arquivo")

# Commits gerados pelo git (merge, revert, fixup) passam direto.
case "$primeira" in
  Merge*|Revert*|fixup!*|squash!*) exit 0 ;;
esac

# `test`: uma prova commitada sozinha, antes da correção — é assim que a falha
# reproduzida fica no histórico separada do conserto dela.
if printf '%s' "$primeira" | grep -qE '^(T-[0-9]{3} [a-z-]+|chore|docs|infra|spec|fix|feat|test)(\(.+\))?: .{5,}'; then
  exit 0
fi

printf '\033[31m✘ mensagem fora do formato\033[0m\n'
printf '  esperado: "T-004 fundacao: resumo do que foi feito"\n'
printf '        ou: "chore: resumo" (trabalho fora de tarefa)\n'
printf '  recebido: %s\n' "$primeira"
exit 1
