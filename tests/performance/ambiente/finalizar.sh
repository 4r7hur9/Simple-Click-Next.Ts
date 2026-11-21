#!/usr/bin/env bash
# Fecha uma etapa: reconcilia com o banco, derruba os servidores e monta o
# relatório. Roda mesmo se o k6 falhou (no CI, com `if: always()`). O código de
# saída é o da reconciliação.
#
#   bash tests/performance/ambiente/finalizar.sh <smoke|carga|estresse>
set -uo pipefail

etapa="${1:-}"
case "$etapa" in
  smoke | carga | estresse) ;;
  *) echo "uso: finalizar.sh <smoke|carga|estresse>" >&2; exit 2 ;;
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
ts() { node --env-file-if-exists=.env "tests/performance/ambiente/$1" "${@:2}"; }

codigo=0
ts reconciliar.ts "$etapa" || codigo=$?
ts subir.ts parar "$etapa" || true
ts relatorio.ts "$etapa" || true
exit "$codigo"
