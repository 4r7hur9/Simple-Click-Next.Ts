#!/usr/bin/env bash
# Portão de qualidade — roda inteiramente nesta máquina (AC-017, AC-041).
# Cresce junto com o projeto: cada etapa entra quando a tarefa que a cria conclui.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

ONP="node $HOME/.claude/skills/onp-spec-driven/scripts/onp-spec.mjs"
falhas=()

# O ambiente local vem do .env, que nunca e versionado. Sem ele, os testes que
# provam o isolamento contra o banco real ficariam de fora em silencio — e um
# portao que pula justamente a verificacao mais importante e pior do que nenhum.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
else
  printf '\033[33m⚠ .env nao encontrado — os testes contra o banco real nao vao rodar.\033[0m\n'
  printf '  crie com: cp .env.example .env  (e complete os valores)\n\n'
fi

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

# O cliente tipado do banco nasce do esquema declarado e nao e versionado. Sem
# ele, o caminho unico ate o banco nao compila e os testes de isolamento nem
# rodariam — um portao que pula a verificacao mais importante e pior que nenhum.
etapa "cliente tipado do banco" pnpm --filter @simpleclick/database run gerar

etapa "formatação" pnpm prettier --check .
etapa "qualidade de código" pnpm eslint . --max-warnings=0

# TypeScript sem verificação de tipos é JavaScript com comentários caros. Esta
# etapa entrou depois de a T-010 descobrir que packages/database não compilava
# havia dias, sem ninguém notar — o portão olhava formatação e testes, mas não
# tipos, e teste não exercita todo caminho tipado.
etapa "verificação de tipos" pnpm turbo run typecheck
# Os quatro projetos do Vitest estao em vitest.config.ts. Aqui eles entram em
# duas etapas separadas de proposito: quando o portao reprova, a primeira linha
# vermelha ja diz se o problema e de logica (unidade) ou de banco (integracao).
etapa "testes de unidade" pnpm vitest run --project unit --project web

# Cada arquivo deste grupo recebe um banco proprio, criado de um molde ja
# migrado e apagado no fim (AC-003). O banco de desenvolvimento nao e tocado.
etapa "testes de integração (banco efêmero)" pnpm vitest run --project api-int --project db-rls

# O limite de tentativas (T-013) decide dentro de um script que roda no Redis,
# entao a prova dele fala com um Redis de verdade — no indice de teste, nunca no
# da aplicacao. Projeto separado porque nao precisa de banco nenhum, e sem esta
# linha o projeto novo do Vitest ficaria de fora do portao em silencio.
etapa "testes contra o cache (limite de tentativas)" pnpm vitest run --project api-redis

etapa "auditoria de regressão" node infra/scripts/audit-regressao.mjs

# As guardas estruturais rodam contra um banco de prova efêmero, criado de molde
# vazio e migrado na hora (AC-008, AC-035). É o que faz elas falarem sobre o
# REPOSITÓRIO: rodar contra o banco de desenvolvimento de quem chamou diria
# apenas o que aquela máquina tem hoje — inclusive um banco vazio, que passaria
# em todas as guardas sem que nenhuma tivesse olhado para nada.
etapa "guardas estruturais do banco" bash infra/scripts/db-guards.sh

# Etapas que entram conforme as tarefas concluem:
#   T-020       → telas de ponta a ponta e acessibilidade
# A T-006 ja entra pela etapa de testes: `apps/api/src/core/db.test.ts` cria o
# proprio banco descartavel no PostgreSQL de teste e prova o isolamento la.

printf '\n'
if [ ${#falhas[@]} -eq 0 ]; then
  printf '\033[32m✔ portão limpo\033[0m\n'
  exit 0
fi
printf '\033[31m✘ portão reprovou em: %s\033[0m\n' "${falhas[*]}"
printf '  para enviar mesmo assim: LEFTHOOK=0 git push — e registre em docs/pendencias.md (AC-043)\n'
exit 1
