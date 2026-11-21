#!/usr/bin/env bash
# Postgres 16 e Redis 7 DESCARTÁVEIS de uma etapa (Docker, só em 127.0.0.1,
# senhas aleatórias). É o mesmo script no CI e no computador.
#
#   bash tests/performance/ambiente/servicos.sh subir
#   bash tests/performance/ambiente/servicos.sh derrubar
#
# `subir` grava as variáveis que o preparo precisa em tests/performance/.servicos.env
# (NOME=valor, modo 600, ignorado pelo git e FORA da pasta de artefatos, porque
# tem senha). No CI o workflow as mascara e as manda para $GITHUB_ENV; no
# computador o local.sh as carrega.
#
# Variáveis: SC_PERF_PG e SC_PERF_REDIS (nomes dos containers), PORTA_PG,
# PORTA_REDIS, SERVICOS_ENV (onde gravar o arquivo).
set -euo pipefail

acao="${1:-}"
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
nome_pg="${SC_PERF_PG:-sc-perf-pg}"
nome_redis="${SC_PERF_REDIS:-sc-perf-redis}"
porta_pg="${PORTA_PG:-55440}"
porta_redis="${PORTA_REDIS:-63790}"
arquivo="${SERVICOS_ENV:-$raiz/tests/performance/.servicos.env}"

segredo() { node -e 'process.stdout.write(require("node:crypto").randomBytes(16).toString("hex"))'; }

case "$acao" in
  subir)
    docker rm -f "$nome_pg" "$nome_redis" > /dev/null 2>&1 || true
    senha_pg="$(segredo)"
    docker run -d --rm --name "$nome_pg" \
      -e POSTGRES_PASSWORD="$senha_pg" -e POSTGRES_DB=simpleclick \
      -e POSTGRES_INITDB_ARGS="--locale=C --encoding=UTF8" \
      -p "127.0.0.1:$porta_pg:5432" postgres:16-alpine > /dev/null
    docker run -d --rm --name "$nome_redis" \
      -p "127.0.0.1:$porta_redis:6379" redis:7-alpine > /dev/null

    # O pg_isready já responde durante o init do cluster: a prova de que o
    # servidor definitivo subiu é uma consulta de verdade.
    pronto=0
    for _ in $(seq 1 90); do
      if docker exec "$nome_pg" psql -U postgres -d simpleclick -Atc "select 1" > /dev/null 2>&1; then
        pronto=1
        break
      fi
      sleep 1
    done
    [ "$pronto" = "1" ] || { echo "O Postgres não ficou pronto em 90 s." >&2; exit 1; }
    for _ in $(seq 1 30); do
      [ "$(docker exec "$nome_redis" redis-cli ping 2> /dev/null)" = "PONG" ] && break
      sleep 1
    done
    [ "$(docker exec "$nome_redis" redis-cli ping)" = "PONG" ] || { echo "O Redis não respondeu." >&2; exit 1; }

    # Prova de que este Postgres é o DESCARTÁVEL desta execução (#142): o nome
    # simpleclick_simulacao e o marcador do seed são iguais aos da base
    # compartilhada. O nonce vai para o comentário do banco `postgres` e o
    # system_identifier do cluster é lido aqui; o descartavel.ts confere os dois
    # na primeira consulta antes de qualquer escrita ou EXPLAIN.
    nonce="$(segredo)"
    docker exec "$nome_pg" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
      -c "COMMENT ON DATABASE postgres IS 'sc-perf-descartavel:$nonce'" > /dev/null
    sysid="$(docker exec "$nome_pg" psql -U postgres -d postgres -Atc "SELECT system_identifier FROM pg_control_system()")"
    [ -n "$sysid" ] || { echo "Não consegui ler o system_identifier do Postgres descartável." >&2; exit 1; }

    migrador="$(segredo)"
    aplicacao="$(segredo)"
    administracao="$(segredo)"
    umask 077
    {
      echo "SENHA_BANCO_MIGRADOR=$migrador"
      echo "SENHA_BANCO_APLICACAO=$aplicacao"
      echo "SENHA_BANCO_ADMINISTRACAO=$administracao"
      echo "DATABASE_URL_DIRETA=postgresql://postgres:$senha_pg@localhost:$porta_pg/simpleclick"
      echo "DATABASE_URL=postgresql://sc_app:$aplicacao@localhost:$porta_pg/simpleclick"
      echo "DATABASE_URL_TEST=postgresql://sc_app:$aplicacao@localhost:$porta_pg/simpleclick"
      echo "REDIS_URL=redis://localhost:$porta_redis/0"
      echo "REDIS_URL_TEST=redis://localhost:$porta_redis/0"
      echo "PORTA_PG=$porta_pg"
      echo "SC_PERF_NONCE=$nonce"
      echo "SC_PERF_SYSID=$sysid"
    } > "$arquivo"
    echo "Postgres 16 (porta $porta_pg) e Redis 7 (porta $porta_redis) no ar."
    ;;
  derrubar)
    docker rm -f "$nome_pg" "$nome_redis" > /dev/null 2>&1 || true
    rm -f "$arquivo"
    echo "serviços descartáveis removidos."
    ;;
  *)
    echo "uso: servicos.sh <subir|derrubar>" >&2
    exit 2
    ;;
esac
