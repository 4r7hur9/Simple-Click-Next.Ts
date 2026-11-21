#!/usr/bin/env bash
# Roda o cenário k6 de uma etapa, com a rodada do preparo, e registra versão e
# intervalo medido. O código de saída é o do k6 (thresholds reprovados = ≠ 0).
#
#   bash tests/performance/ambiente/executar-k6.sh <smoke|carga|estresse>
#
# Variáveis: K6_BIN (padrão: k6), PERFIL (completo | curto; o curto divide as
# durações por 12 e é só para ensaio local), PAUSA_MS (tempo de reflexão do
# comprador virtual).
set -uo pipefail

etapa="${1:-}"
case "$etapa" in
  smoke | carga | estresse) ;;
  *) echo "uso: executar-k6.sh <smoke|carga|estresse>" >&2; exit 2 ;;
esac

# ROTULO (#142): a pasta da saída, para duas execuções da mesma etapa não se
# sobrescreverem (ex.: carga-antes-1). Sem ele, a pasta é a da etapa.
rotulo="${ROTULO:-$etapa}"
if ! [[ "$rotulo" =~ ^[a-z0-9-]{1,40}$ ]]; then
  echo "ROTULO inválido (use a-z, 0-9 e hífen, até 40): $rotulo" >&2
  exit 2
fi
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$raiz"
saida="tests/performance/saida/$rotulo"
if [ ! -s "$saida/run-id" ]; then
  echo "sem $saida/run-id: rode o preparar.sh antes." >&2
  exit 2
fi
rodada="$(tr -d '[:space:]' < "$saida/run-id")"
k6="${K6_BIN:-k6}"
perfil="${PERFIL:-completo}"
export K6_NO_USAGE_REPORT=true

# Cenário painel da carga (#142): as lojas vêm da linha de base desta rodada e
# a senha dos donos de simulação vem do seed. Vão pelo AMBIENTE do processo do
# k6 (o __ENV lê o ambiente), nunca por -e: assim não aparecem no `ps` nem no log.
if [ "$etapa" = "carga" ]; then
  LOJAS_DO_PAINEL="$(node -e 'const b=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));const l=b.lojasDoPainel;if(!l)process.exit(1);process.stdout.write(`${l.menor},${l.maior}`)' "$saida/linha-de-base.json")" || {
    echo "sem lojasDoPainel em $saida/linha-de-base.json: rode o preparar.sh." >&2
    exit 2
  }
  SENHA_DOS_DONOS="$(node --input-type=module -e 'import { SENHA_DOS_DONOS } from "./packages/database/seed/demo/contas.ts"; process.stdout.write(SENHA_DOS_DONOS)')"
  export LOJAS_DO_PAINEL SENHA_DOS_DONOS
fi

inicio="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
"$k6" run \
  -e "ETAPA=$etapa" -e "PERFIL=$perfil" -e "RUN_ID=$rodada" \
  -e "MANIFESTO=$raiz/packages/database/seed/simulacao/saida/manifesto.json" \
  -e "SAIDA=$raiz/$saida" \
  -e "API=http://localhost:3301" -e "SITE=http://localhost:3300" \
  ${PAUSA_MS:+-e "PAUSA_MS=$PAUSA_MS"} \
  --out "json=$raiz/$saida/pontos.json.gz" \
  "tests/performance/k6/$etapa.js" 2>&1 | tee "$saida/k6.log"
codigo="${PIPESTATUS[0]}"
fim="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

versao="$("$k6" version 2>/dev/null | head -1 | tr -d '"\\')"
printf '{\n  "etapa": "%s",\n  "perfil": "%s",\n  "versao": "%s",\n  "inicio": "%s",\n  "fim": "%s",\n  "codigoDeSaida": %s\n}\n' \
  "$etapa" "$perfil" "$versao" "$inicio" "$fim" "$codigo" > "$saida/k6.json"
exit "$codigo"
