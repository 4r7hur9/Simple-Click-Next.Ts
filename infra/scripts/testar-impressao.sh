#!/usr/bin/env bash
# Testa a impressão sem impressora (T-610 — AC-620, AC-621).
#
# Sobe o emulador de impressora (`apps/agente-impressao/src/emulador.ts`) numa
# porta livre, envia por TCP um cupom de exemplo com acento, cedilha e marca de
# 2ª via, mostra a prévia do papel e confere que o que chegou é exatamente o
# que foi compilado. Sai com erro se o papel lido divergir.
#
# Uso:
#   bash infra/scripts/testar-impressao.sh                       # só o emulador
#   bash infra/scripts/testar-impressao.sh 192.168.0.50:9100     # impressora real
#   bash infra/scripts/testar-impressao.sh --escutar             # emulador na 9100
#
# Com `--escutar`, o emulador fica de pé na porta 9100 (ou PORTA_IMPRESSORA) e
# mostra cada cupom que o agente de impressão mandar — aponte o agente para
# 127.0.0.1:9100 e crie pedidos.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
emulador="$raiz/apps/agente-impressao/src/emulador.ts"

case "${1:-}" in
  "") exec node "$emulador" --demonstrar ;;
  --escutar) exec node "$emulador" ;;
  *) exec node "$emulador" --impressora "$1" ;;
esac
