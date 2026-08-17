#!/usr/bin/env bash
# Portão de qualidade — roda inteiramente nesta máquina (AC-017, AC-041).
# Cresce junto com o projeto: cada etapa entra quando a tarefa que a cria conclui.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

ONP="node $HOME/.claude/skills/onp-spec-driven/scripts/onp-spec.mjs"
falhas=()

etapa() {
  local nome="$1"; shift
  printf '\n\033[1m▸ %s\033[0m\n' "$nome"
  if "$@"; then
    printf '\033[32m  ✔ %s\033[0m\n' "$nome"
  else
    printf '\033[31m  ✘ %s\033[0m\n' "$nome"
    falhas+=("$nome")
  fi
}

etapa "formatação" pnpm prettier --check .
etapa "qualidade de código" pnpm eslint . --max-warnings=0
etapa "testes de unidade" pnpm vitest run
etapa "auditoria de regressão" node infra/scripts/audit-regressao.mjs

# Etapas que entram conforme as tarefas concluem:
#   T-004/T-005 → guardas estruturais do banco
#   T-007       → testes de integração contra o banco de teste
#   T-020       → telas de ponta a ponta e acessibilidade

printf '\n'
if [ ${#falhas[@]} -eq 0 ]; then
  printf '\033[32m✔ portão limpo\033[0m\n'
  exit 0
fi
printf '\033[31m✘ portão reprovou em: %s\033[0m\n' "${falhas[*]}"
printf '  para enviar mesmo assim: LEFTHOOK=0 git push — e registre em docs/pendencias.md (AC-043)\n'
exit 1
