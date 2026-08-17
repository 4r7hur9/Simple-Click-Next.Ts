#!/usr/bin/env bash
# Preparo do ambiente local — idempotente: pode rodar quantas vezes quiser.
#
# Faz três coisas e nada além: confere as ferramentas, garante o arquivo de
# variáveis e o certificado, e valida a composição antes de alguém tentar subir.
# Quem sobe é infra/scripts/up.sh.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose="$raiz/infra/compose/docker-compose.yml"
ambiente="$raiz/infra/compose/.env.compose"
modelo="$raiz/infra/compose/.env.compose.example"

# Variáveis que o compose recusa deixar vazias. A lista vive aqui para que a
# mensagem apareça no preparo, e não como erro cru do Docker na hora de subir.
OBRIGATORIAS=(POSTGRES_SENHA_DEV POSTGRES_SENHA_TEST REDIS_SENHA)

etapa() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
ok() { printf '\033[32m  ✔\033[0m %s\n' "$1"; }
aviso() { printf '\033[33m  ⚠\033[0m %s\n' "$1"; }
erro() {
  printf '\033[31m  ✘ %s\033[0m\n' "$1" >&2
  exit 1
}

conferir_ferramentas() {
  etapa "ferramentas"

  command -v docker >/dev/null 2>&1 ||
    erro "docker não encontrado — instale o Docker Desktop ou o Docker Engine"
  docker compose version >/dev/null 2>&1 ||
    erro "o plugin 'docker compose' não está disponível (v2 é obrigatória)"
  docker info >/dev/null 2>&1 ||
    erro "o Docker está instalado mas não está rodando — inicie-o e tente de novo"
  command -v openssl >/dev/null 2>&1 ||
    erro "openssl não encontrado — é ele quem gera o certificado local"

  ok "docker, docker compose e openssl disponíveis"

  if command -v mkcert >/dev/null 2>&1; then
    ok "mkcert disponível — o certificado vai nascer confiado pelo navegador"
  else
    aviso "mkcert ausente — o certificado usará autoridade própria, que pede confiança manual"
  fi
}

# Cria o arquivo de variáveis a partir do modelo, sem nunca sobrescrever o que
# já existe: rodar de novo não pode apagar a senha de ninguém.
garantir_arquivo_de_ambiente() {
  etapa "variáveis do ambiente"

  [ -f "$modelo" ] || erro "modelo ausente: $modelo"

  if [ -f "$ambiente" ]; then
    ok ".env.compose já existe — preservado"
  else
    cp "$modelo" "$ambiente"
    chmod 600 "$ambiente"
    ok ".env.compose criado a partir do modelo"
  fi
}

# Lê o valor de uma variável no arquivo de ambiente, sem interpretar o arquivo
# como script — `source` num arquivo de configuração é porta aberta.
valor_de() {
  local chave="$1"
  sed -n "s/^${chave}=//p" "$ambiente" | tail -n 1 | tr -d '[:space:]'
}

conferir_variaveis_obrigatorias() {
  local faltando=()
  local chave

  for chave in "${OBRIGATORIAS[@]}"; do
    [ -n "$(valor_de "$chave")" ] || faltando+=("$chave")
  done

  if [ ${#faltando[@]} -gt 0 ]; then
    printf '\033[31m  ✘ falta preencher em %s:\033[0m\n' "$ambiente"
    for chave in "${faltando[@]}"; do
      printf '      %s=\n' "$chave"
    done
    printf '\n  Gere um valor local para cada uma, por exemplo:\n'
    printf '      openssl rand -hex 16\n\n'
    printf '  Segredo nunca vai para o código nem para o histórico (P-002).\n'
    exit 1
  fi

  ok "todas as variáveis obrigatórias estão preenchidas"
}

garantir_certificado() {
  etapa "certificado local"
  bash "$raiz/infra/scripts/certs.sh" | sed 's/^/  /'
}

# O roteador lê o certificado uma vez, na partida: ele observa o diretório de
# configuração dinâmica, não o dos certificados. Se o ambiente já estava no ar
# quando o certificado mudou, sem este reinício o navegador continuaria vendo o
# certificado antigo — e o erro apareceria longe daqui.
reiniciar_roteador_se_estiver_no_ar() {
  local id
  id="$(docker compose --env-file "$ambiente" -f "$compose" --profile core \
    ps -q traefik 2>/dev/null | head -n 1)"
  [ -n "$id" ] || return 0

  docker compose --env-file "$ambiente" -f "$compose" --profile core \
    restart traefik >/dev/null 2>&1
  ok "roteador reiniciado para reler o certificado"
}

# A composição é validada agora, com as variáveis já no lugar: erro de sintaxe
# ou variável esquecida aparece aqui, não no meio da subida.
validar_composicao() {
  etapa "composição"

  docker compose --env-file "$ambiente" -f "$compose" \
    --profile core --profile app --profile test --profile print \
    config --quiet ||
    erro "a composição não validou — corrija o que o Docker apontou acima"

  ok "docker-compose.yml válido em todos os perfis"
}

proximo_passo() {
  printf '\n\033[32m✔ ambiente preparado\033[0m\n\n'
  printf '  Próximo passo:\n'
  printf '      make up            # sobe roteador, banco, cache, API e site\n\n'
  printf '  Depois disso os endereços locais respondem em:\n'
  printf '      https://%s\n' "$(valor_de HOST_WEB)"
  printf '      https://%s\n' "$(valor_de HOST_API)"
  printf '      http://localhost:%s   (painel do roteador)\n\n' "$(valor_de PORTA_PAINEL_TRAEFIK)"
  printf '  Nada a configurar no arquivo de hosts: *.localhost já resolve para\n'
  printf '  127.0.0.1 em macOS, Linux e navegadores atuais.\n\n'
}

main() {
  conferir_ferramentas
  garantir_arquivo_de_ambiente
  conferir_variaveis_obrigatorias
  garantir_certificado
  validar_composicao
  reiniciar_roteador_se_estiver_no_ar
  proximo_passo
}

main "$@"
