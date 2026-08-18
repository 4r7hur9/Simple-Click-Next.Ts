#!/usr/bin/env bash
# Guardas estruturais do banco (AC-008, AC-035).
#
# Nove consultas ao catálogo do PostgreSQL, em packages/database/guards. Cada
# uma devolve UMA LINHA POR PROBLEMA; qualquer linha reprova, e a recusa diz
# qual guarda falhou e qual objeto do banco está errado.
#
# Sem argumento, roda contra um banco de prova efêmero: criado de molde vazio,
# migrado com as migrações do repositório, verificado e apagado. É o que faz a
# verificação falar sobre o REPOSITÓRIO, e não sobre o que a máquina de quem
# chamou tem hoje — um banco de desenvolvimento vazio passaria em todas as
# guardas sem que nenhuma tivesse olhado para coisa alguma.
#
# Uso:
#   bash infra/scripts/db-guards.sh                 # banco de prova efêmero
#   bash infra/scripts/db-guards.sh --url <cadeia>  # banco que já existe
#
# Saída: 0 estrutura dentro do padrão · 1 alguma guarda reprovou · 2 ambiente
# incompleto (que também reprova: sem banco não há verificação nenhuma).

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

# O ambiente local vem do .env, que nunca é versionado (P-002). Quem já exporta
# as variáveis na sessão não precisa dele — por isso a ausência não é erro
# aqui: quem recusa por variável faltando é o executor, com mensagem própria.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

node packages/database/src/guards.ts "$@"
