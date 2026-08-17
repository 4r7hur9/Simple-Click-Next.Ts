#!/usr/bin/env bash
# Produção e teste nunca compartilham banco nem cache (AC-031).
#
# É o acidente mais caro possível deste projeto: a suíte de testes apaga e
# recria dados sem cerimônia, então bastaria a conexão de teste apontar para o
# banco da aplicação para que uma execução comum destruísse dados reais.
#
# A comparação NÃO é textual. Credencial, parâmetro de conexão e apelido da
# máquina mudam sem mudar o destino — `usuario_a@localhost:5432/sc` e
# `usuario_b@127.0.0.1:5432/sc?sslmode=require` são o mesmo banco. O que
# identifica o destino é máquina, porta e nome do banco (ou índice do cache).
#
# Uso:
#   bash infra/scripts/check-ambientes.sh              # usa o ambiente atual
#   bash infra/scripts/check-ambientes.sh .env         # usa um arquivo
#
# Saída: 0 ambientes separados · 1 mesmo destino · 2 configuração ausente ou
# malformada (que também reprova: sem a conexão de teste, a suíte cai na
# conexão do vizinho, que é exatamente o acidente).

set -uo pipefail

PORTA_PADRAO_POSTGRES=5432
PORTA_PADRAO_REDIS=6379

# Mensagem de recusa vai para a saída de erro: a saída padrão carrega o valor
# calculado pelas funções, e misturar as duas corromperia esse valor.
recusar() { printf '\033[31m✘ %s\033[0m\n' "$1" >&2; }
detalhar() { printf '    %s\n' "$1" >&2; }

# ---------------------------------------------------------------------------
# Leitura de um arquivo de ambiente, quando um caminho é passado
# ---------------------------------------------------------------------------

carregar_arquivo() {
  local arquivo="$1" linha nome valor
  if [ ! -f "$arquivo" ]; then
    recusar "arquivo de ambiente não encontrado: $arquivo"
    exit 2
  fi
  while IFS= read -r linha || [ -n "$linha" ]; do
    linha="${linha%$'\r'}"
    linha="${linha#"${linha%%[![:space:]]*}"}"
    case "$linha" in '' | '#'*) continue ;; esac
    linha="${linha#export }"
    case "$linha" in *=*) ;; *) continue ;; esac
    nome="${linha%%=*}"
    valor="${linha#*=}"
    case "$nome" in '' | [0-9]* | *[!A-Za-z0-9_]*) continue ;; esac
    valor="${valor%\"}" && valor="${valor#\"}"
    valor="${valor%\'}" && valor="${valor#\'}"
    printf -v "$nome" '%s' "$valor"
  done <"$arquivo"
}

# ---------------------------------------------------------------------------
# Identidade do destino de uma cadeia de conexão
# ---------------------------------------------------------------------------

# Nomes diferentes para a mesma máquina são a mesma máquina — e essa é
# justamente a forma disfarçada do acidente.
canonizar_maquina() {
  local maquina
  maquina=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  maquina="${maquina#"["}"
  maquina="${maquina%"]"}"
  case "$maquina" in
    '' | localhost | 127.0.0.1 | 0.0.0.0 | ::1) printf 'localhost' ;;
    *) printf '%s' "$maquina" ;;
  esac
}

# Reduz a URL a "maquina:porta/recurso" — o que de fato aponta para um destino.
identidade_do_destino() {
  local url="$1" porta_padrao="$2" recurso_padrao="$3"
  local resto autoridade recurso maquina porta

  case "$url" in *://*) ;; *) return 1 ;; esac

  resto="${url#*://}"
  resto="${resto##*@}"  # credencial não distingue destino
  resto="${resto%%\?*}" # parâmetro de conexão também não
  resto="${resto%%#*}"

  autoridade="${resto%%/*}"
  [ -z "$autoridade" ] && return 1

  case "$resto" in
    */*) recurso="${resto#*/}" ;;
    *) recurso="" ;;
  esac
  [ -z "$recurso" ] && recurso="$recurso_padrao"

  case "$autoridade" in
    *:*)
      maquina="${autoridade%:*}"
      porta="${autoridade##*:}"
      ;;
    *)
      maquina="$autoridade"
      porta="$porta_padrao"
      ;;
  esac
  [ -z "$porta" ] && porta="$porta_padrao"

  printf '%s:%s/%s' "$(canonizar_maquina "$maquina")" "$porta" "$recurso"
}

# Identidade de uma variável obrigatória. Escreve o valor na saída padrão e
# devolve status diferente de zero quando ela falta ou não é reconhecível.
identidade_obrigatoria() {
  local nome="$1" porta_padrao="$2" recurso_padrao="$3"
  local valor="${!nome:-}" identidade

  if [ -z "$valor" ]; then
    recusar "$nome não está configurada"
    detalhar "sem ela o ambiente cai na conexão do vizinho — o acidente que esta verificação existe para impedir"
    return 1
  fi

  if ! identidade=$(identidade_do_destino "$valor" "$porta_padrao" "$recurso_padrao"); then
    recusar "$nome não é uma cadeia de conexão reconhecível"
    detalhar "esperado algo como esquema://maquina:porta/recurso"
    return 1
  fi

  printf '%s' "$identidade"
}

# ---------------------------------------------------------------------------
# Execução
# ---------------------------------------------------------------------------

falhas_de_configuracao=0
colisoes=0

# Lê a variável obrigatória e contabiliza a falha no shell principal — por isso
# a contagem mora aqui, e não dentro da função chamada por substituição.
ler_destino() {
  local destino_nome="$1" variavel="$2" porta_padrao="$3" recurso_padrao="$4"
  local identidade
  if identidade=$(identidade_obrigatoria "$variavel" "$porta_padrao" "$recurso_padrao"); then
    printf -v "$destino_nome" '%s' "$identidade"
  else
    printf -v "$destino_nome" '%s' ""
    falhas_de_configuracao=$((falhas_de_configuracao + 1))
  fi
}

# Reprova quando duas variáveis apontam para o mesmo destino.
exigir_destinos_distintos() {
  local rotulo="$1" nome_a="$2" identidade_a="$3" nome_b="$4" identidade_b="$5"

  if [ "$identidade_a" = "$identidade_b" ]; then
    recusar "$nome_a e $nome_b apontam para o mesmo $rotulo: $identidade_a"
    detalhar "rodar a suíte de testes assim destrói os dados do outro ambiente"
    colisoes=$((colisoes + 1))
    return 1
  fi
  printf '  ✔ %s e %s usam %ss distintos\n' "$nome_a" "$nome_b" "$rotulo"
}

[ $# -gt 0 ] && carregar_arquivo "$1"

printf 'Verificando separação entre os ambientes (AC-031)\n'

ler_destino banco_app DATABASE_URL "$PORTA_PADRAO_POSTGRES" postgres
ler_destino banco_teste DATABASE_URL_TEST "$PORTA_PADRAO_POSTGRES" postgres
ler_destino cache_app REDIS_URL "$PORTA_PADRAO_REDIS" 0
ler_destino cache_teste REDIS_URL_TEST "$PORTA_PADRAO_REDIS" 0

if [ -n "$banco_app" ] && [ -n "$banco_teste" ]; then
  exigir_destinos_distintos banco DATABASE_URL "$banco_app" DATABASE_URL_TEST "$banco_teste"
fi

# A conexão direta alcança a mesma base da aplicação por outro caminho, sem o
# agrupador. Apontar o teste para ela é o mesmo acidente, disfarçado.
if [ -n "${DATABASE_URL_DIRETA:-}" ] && [ -n "$banco_teste" ]; then
  if banco_direto=$(identidade_do_destino "$DATABASE_URL_DIRETA" "$PORTA_PADRAO_POSTGRES" postgres); then
    exigir_destinos_distintos banco DATABASE_URL_DIRETA "$banco_direto" DATABASE_URL_TEST "$banco_teste"
  else
    recusar "DATABASE_URL_DIRETA não é uma cadeia de conexão reconhecível"
    falhas_de_configuracao=$((falhas_de_configuracao + 1))
  fi
fi

if [ -n "$cache_app" ] && [ -n "$cache_teste" ]; then
  exigir_destinos_distintos cache REDIS_URL "$cache_app" REDIS_URL_TEST "$cache_teste"
fi

printf '\n'
if [ "$colisoes" -gt 0 ]; then
  recusar "ambientes compartilhados: $colisoes colisão(ões)"
  detalhar "aponte o ambiente de teste para um banco e um cache próprios antes de rodar qualquer suíte"
  exit 1
fi
if [ "$falhas_de_configuracao" -gt 0 ]; then
  recusar "configuração incompleta: $falhas_de_configuracao problema(s)"
  detalhar "cada variável está documentada em .env.example"
  exit 2
fi

printf '\033[32m✔ produção e teste usam bancos e caches separados\033[0m\n'
exit 0
