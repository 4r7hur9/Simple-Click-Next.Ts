#!/usr/bin/env bash
# Prepara o ambiente descartável de UMA etapa de desempenho.
#
#   bash tests/performance/ambiente/preparar.sh <smoke|carga|estresse>
#
# Pressupõe, no ambiente: DATABASE_URL_DIRETA (superusuário), DATABASE_URL e
# REDIS_URL locais, SENHA_BANCO_MIGRADOR/APLICACAO/ADMINISTRACAO. No CI vêm do
# `env` do job; no computador, use o local.sh, que cria Postgres e Redis
# descartáveis e exporta tudo isto.
#
# Falha em qualquer passo = código ≠ 0, ANTES de qualquer medição.
#
# #142: VOLUME=sim carrega os 100 mil pedidos do seed:volume (#138) na base
# DESCARTÁVEL comprovada (descartavel.ts), entre a validação do seed (5) e a
# subida da API (6); a validação da camada da aplicação (7) só roda sem volume
# (ela exige 10 pedidos por loja). ROTULO escolhe a pasta da saída.
set -euo pipefail

etapa="${1:-}"
case "$etapa" in
  smoke | carga | estresse) ;;
  *) echo "uso: preparar.sh <smoke|carga|estresse>" >&2; exit 2 ;;
esac

rotulo="${ROTULO:-$etapa}"
if ! [[ "$rotulo" =~ ^[a-z0-9-]{1,40}$ ]]; then
  echo "ROTULO inválido (use a-z, 0-9 e hífen, até 40): $rotulo" >&2
  exit 2
fi
export ROTULO="$rotulo"
volume="${VOLUME:-nao}"
case "$volume" in sim | nao) ;; *) echo "VOLUME deve ser sim ou nao." >&2; exit 2 ;; esac
export VOLUME="$volume"

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$raiz"
saida="tests/performance/saida/$rotulo"
mkdir -p "$saida"

export SEMENTE="${SEMENTE:-sc-2026}"
export REFERENCIA="${REFERENCIA:-2026-11-01T18:00:00-03:00}"

ts() { node --env-file-if-exists=.env "tests/performance/ambiente/$1" "${@:2}"; }
passo() { printf '\n==> %s\n' "$1"; }

passo "1/10 encerra servidores que uma execução anterior tenha deixado"
ts subir.ts parar "$etapa"

passo "2/10 identifica a rodada"
node -e 'process.stdout.write(require("node:crypto").randomBytes(4).toString("hex") + "\n")' > "$saida/run-id"
echo "rodada $(cat "$saida/run-id")"

passo "3/10 migra a base-mestre (cria os papéis sc_* do cluster)"
if [ "${MIGRAR_BASE_MESTRE:-1}" = "1" ]; then
  pnpm --filter @simpleclick/database migrar
else
  echo "pulado (MIGRAR_BASE_MESTRE=0): os papéis sc_* já existem no cluster."
fi

passo "4/10 seed de simulação: 100 lojas, 1.000 pedidos (semente $SEMENTE, referência $REFERENCIA)"
pnpm --filter @simpleclick/database seed:simulacao -- \
  --semente "$SEMENTE" --referencia "$REFERENCIA" --recriar

passo "5/10 valida o seed, camada do banco"
pnpm --filter @simpleclick/database seed:simulacao:validar -- \
  --semente "$SEMENTE" --referencia "$REFERENCIA"

if [ "$volume" = "sim" ]; then
  passo "5b/10 VOLUME=sim: prova a base descartável e carrega os 100 mil pedidos (seed:volume)"
  ts descartavel.ts provar
  # A saída do seed:volume é FIXA (packages/database/seed/volume/saida/) e hoje
  # guarda a evidência do #138: vai para um backup (mv, nunca apagada) e volta
  # no fim, por trap, mesmo com erro ou Ctrl-C. A saída desta carga fica em
  # $saida/volume/.
  volume_saida="packages/database/seed/volume/saida"
  backup_volume="$(mktemp -d "tests/performance/saida/.backup-volume-XXXXXX")"
  restaurar_volume() {
    [ -n "${backup_volume:-}" ] || return 0
    if [ -d "$volume_saida" ]; then
      rm -rf "${saida:?}/volume"
      mv "$volume_saida" "$saida/volume"
    fi
    if [ -d "${backup_volume:?}/saida" ]; then mv "$backup_volume/saida" "$volume_saida"; fi
    rmdir "$backup_volume" 2> /dev/null || true
    backup_volume=""
  }
  trap 'restaurar_volume' EXIT
  trap 'restaurar_volume; exit 130' INT TERM
  if [ -d "$volume_saida" ]; then mv "$volume_saida" "$backup_volume/saida"; fi
  pnpm --filter @simpleclick/database seed:volume carregar \
    --semente "$SEMENTE" --referencia "$REFERENCIA"
  restaurar_volume
fi

passo "6/10 sobe a API e o site (build de produção), com as imagens do seed"
ts subir.ts subir "$etapa"

if [ "$volume" = "sim" ]; then
  passo "7/10 pulado com VOLUME=sim (o validador do seed exige 10 pedidos por loja); a validação do volume rodou no 5b e a do painel roda no 9b"
else
  passo "7/10 valida o seed, camada da aplicação (vitrines, imagens, painel)"
  pnpm --filter @simpleclick/database seed:simulacao:validar -- \
    --semente "$SEMENTE" --referencia "$REFERENCIA" \
    --site http://localhost:3300 --api http://localhost:3301
fi
mkdir -p "$saida/validacao-do-seed"
for arq in relatorio.md validacao-banco.json validacao-aplicacao.json impressoes.json manifesto.json; do
  cp "packages/database/seed/simulacao/saida/$arq" "$saida/validacao-do-seed/" 2>/dev/null || true
done

passo "8/10 prova uma vitrine e uma imagem do manifesto"
ts linha-de-base.ts provar "$etapa"

passo "9/10 linha de base do banco"
ts linha-de-base.ts base "$etapa"

passo "9b/10 prova o login dos donos e a fila das lojas do painel (cenário painel da carga)"
ts linha-de-base.ts painel "$etapa"

passo "10/10 metadados da execução"
ts linha-de-base.ts metadados "$etapa"

if [ "$volume" = "sim" ]; then
  passo "11/10 EXPLAIN (ANALYZE, BUFFERS) do gargalo app.meus_pedidos, na base descartável"
  ts explicar-gargalo.ts "$etapa"
fi

printf '\nPreparo da etapa %s concluído.\n' "$etapa"
