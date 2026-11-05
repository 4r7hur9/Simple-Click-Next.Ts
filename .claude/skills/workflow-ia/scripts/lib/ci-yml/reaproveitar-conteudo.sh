set -uo pipefail
REAP=""; U=""
# Saídas sempre gravadas, inclusive no "nao": <app>=true só para os apps reaproveitados.
gravar() {
  printf '%s' "${SAIDAS:-}" | jq -r --arg reap " $REAP " 'to_entries[] | . as $e | "\($e.value)=\($reap | contains(" " + $e.key + " "))"' >> "$GITHUB_OUTPUT" 2>/dev/null
  if [ -n "$U" ]; then echo "run_url=$U" >> "$GITHUB_OUTPUT"; fi
  true
}
trap gravar EXIT
nao() { echo "Sem reaproveitamento: $1 (os jobs dos apps rodam)"; exit 0; }
[ -n "${HEAD_REF:-}" ] || nao "fora de um pull_request"
[ "${HEAD_REPO:-}" = "${GITHUB_REPOSITORY:-}" ] || nao "PR de outro repositório (${HEAD_REPO:-?}): só a branch deste repositório tem a verificação"
[ "$(echo "${APPS:-[]}" | jq 'length' 2>/dev/null || echo 0)" -gt 0 ] || nao "nenhum app neste run"
info=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" --jq '"\(.workflow_id // "")|\(.path // "")"' 2>/dev/null) || info=""
WF_ID=${info%%|*}; arq=${info#*|}; arq=${arq%%@*}
export WF_ID
[ -n "$WF_ID" ] && [ -n "$arq" ] || nao "não consegui ler o workflow deste run"
# Conteúdo = linhas do ls-tree (modo, tipo, blob e caminho; nunca mtime) dos caminhos, em sha256.
hash_wf() { git -c core.quotepath=off ls-tree -r --full-tree "$1" -- "$arq" .github/actions | sha256sum | cut -d' ' -f1; }
hash_app() { git -c core.quotepath=off ls-tree -r --full-tree "$1" | RX="$2" awk -F '\t' '$2 ~ ENVIRON["RX"]' | sha256sum | cut -d' ' -f1; }
git cat-file -e "HEAD:$arq" 2>/dev/null || nao "o workflow $arq não está no commit testado"
wm=$(hash_wf HEAD) || nao "não consegui calcular o hash do workflow"
b=$(jq -rn --arg b "$HEAD_REF" '$b | @uri')
# Dispatches CONCLUÍDOS deste workflow na branch da PR (qualquer commit), do resultado mais novo ao mais antigo.
runs=$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/$WF_ID/runs?branch=$b&event=workflow_dispatch&status=completed&per_page=100" --jq '[.workflow_runs[] | select(.head_branch == env.HEAD_REF and .event == "workflow_dispatch" and .status == "completed" and ((.workflow_id // "") | tostring) == env.WF_ID)] | sort_by(.updated_at) | reverse | .[] | "\(.id)|\(.head_sha)|\(.conclusion)|\(.html_url)"' 2>/dev/null) || nao "não consegui listar os workflow_dispatch da branch $HEAD_REF"
[ -n "$runs" ] || nao "nenhum workflow_dispatch concluído na branch $HEAD_REF"
T=$(mktemp -d)
# jobs_de <id>: "<conclusão>|<nome>" da última tentativa de cada job (lido uma vez por run).
jobs_de() {
  [ -s "$T/$1" ] && return 0
  gh api --paginate "repos/$GITHUB_REPOSITORY/actions/runs/$1/jobs?filter=latest&per_page=100" --jq '.jobs[] | "\(.conclusion // "pendente")|\(.name)"' > "$T/$1" 2>/dev/null || { rm -f "$T/$1"; return 1; }
}
# Por app: o dispatch mais novo da branch que TESTOU o app (algum job dele não pulado) decide. Verde, cobrindo todos
# os jobs esperados do app, com o mesmo workflow e o mesmo conteúdo do app no merge testado: o app é reaproveitado.
for app in $(echo "$APPS" | jq -r '.[]'); do
  rx=$(echo "${CONTEUDO:-}" | jq -r --arg a "$app" '.[$a] // empty' 2>/dev/null) || rx=""
  esp=$(echo "${ESPERADOS:-}" | jq -c --arg a "$app" '.[$a] // []' 2>/dev/null) || esp="[]"
  if [ -z "$rx" ] || [ "$(echo "$esp" | jq 'length' 2>/dev/null || echo 0)" -eq 0 ]; then echo "$app: roda (sem caminhos de conteúdo ou sem jobs esperados)"; continue; fi
  decidiu=""
  for linha in $runs; do
    IFS='|' read -r id sha conc url <<< "$linha"
    if ! jobs_de "$id"; then echo "$app: roda (não consegui ler os jobs de $url)"; decidiu=1; break; fi
    awk -F'|' -v p="$app (" 'index($2, p) == 1 && $1 != "skipped" { achou = 1 } END { exit achou ? 0 : 1 }' "$T/$id" || continue
    decidiu=1
    if [ "$conc" != "success" ]; then echo "$app: roda (o dispatch mais novo que testou o app terminou $conc: $url)"; break; fi
    falta=$(awk -F'|' '$1 == "success" { sub(/^[^|]*[|]/, ""); print }' "$T/$id" | jq -rRn --argjson esperados "$esp" '[inputs] as $ok | [$esperados[] as $n | select(($ok | index($n)) == null) | $n] | join(", ")' 2>/dev/null) || { echo "$app: roda (não consegui conferir a cobertura)"; break; }
    if [ -n "$falta" ]; then echo "$app: roda (o dispatch $url não cobre: $falta)"; break; fi
    if ! git cat-file -e "$sha^{commit}" 2>/dev/null && ! git fetch -q --no-tags --depth=1 origin "$sha" 2>/dev/null; then echo "$app: roda (não consegui buscar o commit $sha do dispatch $url)"; break; fi
    wd=$(hash_wf "$sha") || wd=""
    if [ "$wd" != "$wm" ]; then echo "$app: roda (o workflow $arq mudou desde o dispatch $url)"; break; fi
    hm=$(hash_app HEAD "$rx") || hm=""
    hd=$(hash_app "$sha" "$rx") || hd=""
    if [ -z "$hm" ] || [ "$hm" != "$hd" ]; then echo "$app: roda (o conteúdo do app mudou desde $sha: $hd -> $hm)"; break; fi
    REAP="$REAP $app"
    case " $U " in *" $url "*) ;; *) U="${U:+$U }$url" ;; esac
    echo "$app: reaproveitado de $url (commit $sha, mesmo conteúdo $hm)"
    break
  done
  [ -n "$decidiu" ] || echo "$app: roda (nenhum workflow_dispatch concluído da branch testou o app)"
done
if [ -n "$REAP" ]; then echo "Reaproveitado:$REAP ($U)"; fi
