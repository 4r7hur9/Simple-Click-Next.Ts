#!/usr/bin/env bash
# Sobe o ambiente local e só devolve o controle quando todo serviço estiver
# saudável (AC-001).
#
# Esperar de verdade importa: `up -d` volta assim que o contêiner existe, não
# quando o serviço aceita conexão. Quem confia no retorno do `up` acaba rodando
# migração contra um PostgreSQL que ainda está iniciando.
#
# Uso:
#   bash infra/scripts/up.sh                 # perfis core e app
#   bash infra/scripts/up.sh core            # só a base
#   bash infra/scripts/up.sh core test       # base mais banco de teste
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose="$raiz/infra/compose/docker-compose.yml"
ambiente="$raiz/infra/compose/.env.compose"

ESPERA_MAXIMA=180
INTERVALO=3

perfis=("$@")
[ ${#perfis[@]} -eq 0 ] && perfis=(core app)

etapa() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
ok() { printf '\033[32m  ✔\033[0m %s\n' "$1"; }
erro() {
  printf '\033[31m  ✘ %s\033[0m\n' "$1" >&2
  exit 1
}

[ -f "$ambiente" ] ||
  erro "$ambiente não existe — rode antes: bash infra/scripts/setup.sh"

argumentos_de_compose=(--env-file "$ambiente" -f "$compose")
for perfil in "${perfis[@]}"; do
  argumentos_de_compose+=(--profile "$perfil")
done

# Estado de saúde de um serviço: `healthy`, `starting`, `unhealthy`, ou o
# estado do contêiner quando ele não declara verificação — o que neste projeto
# não deveria acontecer, porque todo serviço declara a sua.
saude_de() {
  local servico="$1" id
  id="$(docker compose "${argumentos_de_compose[@]}" ps -q "$servico" 2>/dev/null | head -n 1)"
  [ -n "$id" ] || {
    echo "ausente"
    return
  }
  docker inspect \
    -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}sem-verificacao:{{.State.Status}}{{end}}' \
    "$id" 2>/dev/null || echo "ausente"
}

# Mostra o porquê da reprovação em vez de só dizer que deu errado.
explicar_falha() {
  local servico="$1" id
  id="$(docker compose "${argumentos_de_compose[@]}" ps -q "$servico" 2>/dev/null | head -n 1)"
  [ -n "$id" ] || return 0
  printf '\n\033[33m  última saída da verificação de %s:\033[0m\n' "$servico"
  docker inspect \
    -f '{{if .State.Health}}{{range .State.Health.Log}}{{.Output}}{{end}}{{end}}' \
    "$id" 2>/dev/null | tail -n 5 | sed 's/^/    /'
  printf '\033[33m  últimas linhas do registro:\033[0m\n'
  docker compose "${argumentos_de_compose[@]}" logs --tail 15 "$servico" 2>&1 | sed 's/^/    /'
}

esperar_saude() {
  local servicos=("$@")
  local decorrido=0

  while [ "$decorrido" -lt "$ESPERA_MAXIMA" ]; do
    local pendentes=() doentes=() servico estado

    for servico in "${servicos[@]}"; do
      estado="$(saude_de "$servico")"
      case "$estado" in
        healthy) ;;
        unhealthy) doentes+=("$servico") ;;
        *) pendentes+=("$servico") ;;
      esac
    done

    if [ ${#doentes[@]} -gt 0 ]; then
      for servico in "${doentes[@]}"; do explicar_falha "$servico"; done
      erro "serviço reprovado na verificação de saúde: ${doentes[*]}"
    fi

    if [ ${#pendentes[@]} -eq 0 ]; then
      return 0
    fi

    printf '\r  aguardando (%ss): %s\033[K' "$decorrido" "${pendentes[*]}"
    sleep "$INTERVALO"
    decorrido=$((decorrido + INTERVALO))
  done

  printf '\n'
  erro "tempo esgotado (${ESPERA_MAXIMA}s) esperando a verificação de saúde"
}

main() {
  etapa "subindo os perfis: ${perfis[*]}"
  docker compose "${argumentos_de_compose[@]}" up -d --remove-orphans

  etapa "esperando a verificação de saúde"
  # `config --services` devolve exatamente os serviços dos perfis pedidos, então
  # a espera acompanha o que foi subido, sem lista repetida à mão.
  # Lido em laço, e não com `mapfile`, porque o bash 3.2 que vem no macOS não
  # tem `mapfile` — e este roteiro é o primeiro comando que alguém roda.
  servicos=()
  while IFS= read -r servico; do
    [ -n "$servico" ] && servicos+=("$servico")
  done < <(docker compose "${argumentos_de_compose[@]}" config --services)
  [ ${#servicos[@]} -gt 0 ] || erro "nenhum serviço nos perfis ${perfis[*]}"

  esperar_saude "${servicos[@]}"
  printf '\r\033[K'
  for servico in "${servicos[@]}"; do
    ok "$servico saudável"
  done

  printf '\n\033[32m✔ ambiente no ar\033[0m\n\n'
  docker compose "${argumentos_de_compose[@]}" ps
  printf '\n  para derrubar: make down\n\n'
}

main "$@"
