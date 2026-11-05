set -euo pipefail
if [ "$(echo "$NEEDS" | jq -r '.mudancas.result')" != "success" ]; then echo "mudancas falhou"; exit 1; fi
# As saídas do reaproveitar só valem com ele em success (ele nunca reprova de propósito): sem elas, nada foi provado.
reap='{}'
if [ "$(echo "$NEEDS" | jq -r '.reaproveitar.result')" = "success" ] && echo "${REAP:-}" | jq -e 'type == "object"' > /dev/null 2>&1; then reap="$REAP"; fi
# Falha e cancelamento reprovam sempre; pulado só vale para app fora deste run ou com a prova de um run verde.
ruim=$(echo "$NEEDS" | jq -r --argjson jobs "$JOBS" --argjson apps "${APPS:-[]}" --argjson reap "$reap" --argjson saidas "$SAIDAS" '
  to_entries | map(select(.key != "mudancas" and .key != "reaproveitar")) | map(
    . as $e | ($jobs[] | select(.id == $e.key) | .app) as $app |
    if ($e.value.result == "failure" or $e.value.result == "cancelled") then "\($e.key): \($e.value.result)"
    elif ($e.value.result == "skipped" and $reap[$saidas[$app] // ""] != "true" and ($apps | index($app)) != null) then "\($e.key): pulado para app alterado sem prova de run verde"
    else empty end) | .[]')
if [ -n "$ruim" ]; then echo "$ruim"; exit 1; fi
usados=$(echo "${APPS:-[]}" | jq -r --argjson reap "$reap" --argjson saidas "$SAIDAS" '[.[] | select($reap[$saidas[.] // ""] == "true")] | join(", ")')
if [ -n "$usados" ]; then echo "ci-ok: $usados reaproveitado(s) do run $RUN_URL (workflow_dispatch da mesma branch, mesmo conteúdo do app e do workflow); os demais apps de $APPS passaram"; exit 0; fi
echo "ci-ok: todos os jobs dos apps $APPS passaram"
