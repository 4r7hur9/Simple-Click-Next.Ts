#!/usr/bin/env bash
# Roda uma etapa de desempenho no computador, do jeito do CI: com Postgres 16 e
# Redis 7 DESCARTÁVEIS (servicos.sh). Não toca na base de desenvolvimento nem na
# simpleclick_simulacao do seed de simulação.
#
#   bash tests/performance/ambiente/local.sh <smoke|carga|estresse>
#
# Variáveis: K6_BIN (caminho do k6), PERFIL=curto (ensaio rápido: durações ÷ 12),
# PORTA_PG, PORTA_REDIS, VOLUME=sim (carrega os 100 mil pedidos do seed:volume na
# base descartável, #142) e ROTULO (pasta da saída; recusa pasta que já existe). Precisa de Docker e de nenhum `next dev` do site rodando
# (o build do ensaio usa a mesma pasta .next).
set -uo pipefail

etapa="${1:-}"
case "$etapa" in
  smoke | carga | estresse) ;;
  *) echo "uso: local.sh <smoke|carga|estresse>" >&2; exit 2 ;;
esac

# ROTULO (#142): a pasta da saída, para duas execuções da mesma etapa não se
# sobrescreverem (ex.: carga-antes-1). Sem ele, a pasta é a da etapa.
rotulo="${ROTULO:-$etapa}"
if ! [[ "$rotulo" =~ ^[a-z0-9-]{1,40}$ ]]; then
  echo "ROTULO inválido (use a-z, 0-9 e hífen, até 40): $rotulo" >&2
  exit 2
fi
export ROTULO="$rotulo"
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$raiz"
if [ -n "${ROTULO_EXIGE_PASTA_NOVA:-}" ] || [ "$rotulo" != "$etapa" ]; then
  if [ -e "tests/performance/saida/$rotulo" ]; then
    echo "A pasta tests/performance/saida/$rotulo já existe: escolha outro ROTULO." >&2
    exit 2
  fi
fi

export SC_PERF_PG="sc-perf-pg-$$" SC_PERF_REDIS="sc-perf-redis-$$"
export SERVICOS_ENV="$raiz/tests/performance/.servicos-$$.env"
limpar() { bash tests/performance/ambiente/servicos.sh derrubar > /dev/null 2>&1 || true; }
trap limpar EXIT

echo "==> sobe Postgres 16 e Redis 7 descartáveis"
bash tests/performance/ambiente/servicos.sh subir || exit 1
set -a
# shellcheck disable=SC1090
. "$SERVICOS_ENV"
set +a
# Nada do .env da raiz pode redirecionar o ensaio (o Node não sobrescreve o que já está definido).
export DATABASE_URL_ADMINISTRACAO=""
export MIGRAR_BASE_MESTRE=1

codigo=0
bash tests/performance/ambiente/preparar.sh "$etapa" || codigo=$?
if [ "$codigo" -eq 0 ]; then
  bash tests/performance/ambiente/executar-k6.sh "$etapa" || codigo=$?
fi
bash tests/performance/ambiente/finalizar.sh "$etapa" || codigo=$?
echo
echo "Etapa $etapa terminou com código $codigo. Artefatos em tests/performance/saida/$rotulo/"
exit "$codigo"
