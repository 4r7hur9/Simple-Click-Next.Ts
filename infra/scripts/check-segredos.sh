#!/usr/bin/env bash
# Segredo nunca entra no histórico (P-002, AC-020).
set -uo pipefail
[ $# -eq 0 ] && exit 0

# Valor literal atribuído a chave, senha, token ou cadeia de conexão.
# Referência a variável de ambiente (${...}, process.env) não é segredo.
padrao='(api[_-]?key|secret|senha|password|token|DATABASE_URL|REDIS_URL)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"'$\{][^"'"'"']{7,}'
achou=0

for arquivo in "$@"; do
  [ -f "$arquivo" ] || continue
  case "$arquivo" in
    *.example|*.md|*/check-segredos.sh|*.test.*|*/tests/*) continue ;;
  esac
  if grep -nEi "$padrao" "$arquivo" >/dev/null 2>&1; then
    printf '\033[31m✘ possível segredo em %s:\033[0m\n' "$arquivo"
    grep -nEi "$padrao" "$arquivo" | sed 's/^/    /'
    achou=1
  fi
done

if [ $achou -eq 1 ]; then
  printf '\nSegredo vem de variável de ambiente, nunca do código (P-002).\n'
  exit 1
fi
exit 0
