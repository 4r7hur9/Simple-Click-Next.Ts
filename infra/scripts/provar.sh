#!/usr/bin/env bash
# Regrava a prova de TODA feature que já tem prova gravada (AC-018, AC-019).
#
# POR QUE ISTO EXISTE. A prova é gravada contra o código de um momento. Mexeu em
# qualquer arquivo de código ou de teste, a prova de TODAS as features envelhece
# junto — e a auditoria acusa `VERIFY_OBSOLETO` para cada uma. Isso está certo:
# prova gravada contra código antigo não prova o código de agora. Errado era o
# jeito de responder, uma feature por vez, lembrando de cada nome à mão.
#
# Este script roda `verify` para cada feature que JÁ tem prova, na ordem, e diz
# quantos critérios cada uma sustenta. Feature ainda sem prova nenhuma não entra:
# rodá-la aqui só gastaria tempo para gravar um arquivo de zeros.
#
# Uso:  bash infra/scripts/provar.sh          antes de registrar o trabalho
set -uo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RAIZ" || exit 1

MOTOR="$HOME/.claude/skills/onp-spec-driven/scripts/onp-spec.mjs"
if [ ! -f "$MOTOR" ]; then
  printf 'motor da especificação não encontrado em %s\n' "$MOTOR" >&2
  exit 1
fi

# O ambiente carrega as cadeias de conexão: parte das provas fala com o banco.
[ -f .env ] && set -a && . ./.env && set +a

falhou=0
for prova in .spec/verification/*.json; do
  [ -e "$prova" ] || continue
  feature="$(basename "$prova" .json)"
  # `sinais.json` é o histórico de problemas do motor, não a prova de uma
  # feature — tentar verificá-lo faria o script morrer num nome que não existe.
  [ "$feature" = "sinais" ] && continue

  # O código de saída do `verify` NÃO serve de régua aqui: ele sai diferente de
  # zero enquanto sobrar critério sem prova, e sobrar critério sem prova é o
  # estado normal de um projeto em andamento — 253 critérios não nascem provados.
  # A régua é ter gravado a prova. Critério que TINHA prova e perdeu não passa
  # em branco: a auditoria acusa pela tarefa marcada como concluída sem prova.
  node "$MOTOR" verify "$feature" > /tmp/provar-$$.log 2>&1
  if grep -q 'prova gravada' /tmp/provar-$$.log; then
    provados="$(grep -c '  ✔ AC-' /tmp/provar-$$.log || true)"
    printf '  ✔ %-22s %s critério(s) com prova\n' "$feature" "$provados"
  else
    printf '  ✘ %-22s não gravou prova — detalhe abaixo\n' "$feature"
    tail -15 /tmp/provar-$$.log
    falhou=1
  fi
  rm -f /tmp/provar-$$.log
done

if [ "$falhou" -ne 0 ]; then
  printf '\nalguma prova reprovou — corrija antes de registrar o trabalho\n' >&2
  exit 1
fi
printf '\nprova regravada; agora rode o portão\n'
