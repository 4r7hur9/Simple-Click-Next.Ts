#!/usr/bin/env bash
# Registro de portão pulado (AC-043).
#
# POR QUE ISTO NÃO É UM GANCHO NO MOMENTO DO PULO
#
# `LEFTHOOK=0 git push` desliga o lefthook no PRIMEIRO comando do gancho gerado
# por ele — antes de qualquer configuração nossa ser lida. Nenhum comando do
# `lefthook.yml` roda nesse push, e nunca vai rodar: é assim que a saída de
# emergência funciona, e mexer nisso seria transformar a saída em armadilha.
#
# Então o registro é RECONSTRUÍDO, e não emitido. O portão anota cada versão que
# aprovou (`.git/portao-verificados`, escrito por `portao-lib.sh`). Este script
# compara o que já foi ENVIADO com o que foi APROVADO: versão enviada que não
# consta como aprovada só pode ter passado por fora do portão. O gancho antes do
# registro chama isto a cada commit, então a dívida aparece no primeiro trabalho
# seguinte — e fica escrita em docs/pendencias.md, visível, com data e com a
# lista do que ficou sem verificação.
#
# Uso:
#   bash infra/scripts/registrar-pulo.sh                     audita e registra se achar
#   bash infra/scripts/registrar-pulo.sh --motivo "texto"    idem, com motivo declarado
#   bash infra/scripts/registrar-pulo.sh --versao <sha>      registra uma versão específica
#   bash infra/scripts/registrar-pulo.sh --iniciar           marca o ponto de partida
#
# O PONTO DE PARTIDA
#
# O registro do portão diz o que ESTA máquina verificou, e ele nasce vazio a
# cada clone. Sem ponto de partida, o primeiro commit depois de um clone acusaria
# como "contornado" todo o histórico que já estava no remoto antes de a máquina
# existir — dívida falsa, e dívida falsa ensina a ignorar o arquivo. Por isso a
# primeira execução (e o `prepare` da instalação) apenas marca onde a vigilância
# começou. Do ponto de partida em diante, todo envio sem portão vira linha.
#
# Variáveis (existem para a prova poder trabalhar em cópia descartável):
#   PORTAO_PENDENCIAS   arquivo de pendências (padrão: docs/pendencias.md)
#   PORTAO_REGISTRO     arquivo das versões aprovadas (padrão: dentro do .git)
#
# Saída: 0 sempre que o repositório está em dia OU a dívida foi registrada.
#        1 só quando não deu para registrar (arquivo de pendências ausente) —
#        dívida que não foi anotada não pode passar por anotada.

set -uo pipefail

PORTAO_RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PORTAO_RAIZ" || exit 1

PENDENCIAS="${PORTAO_PENDENCIAS:-docs/pendencias.md}"
MARCA_INICIO="<!-- portao-contornado:inicio -->"
MARCA_FIM="<!-- portao-contornado:fim -->"

motivo=""
versao=""
iniciar=0

while [ $# -gt 0 ]; do
  case "$1" in
    --motivo)
      motivo="${2:-}"
      shift 2
      ;;
    --motivo=*)
      motivo="${1#--motivo=}"
      shift
      ;;
    --versao)
      versao="${2:-}"
      shift 2
      ;;
    --versao=*)
      versao="${1#--versao=}"
      shift
      ;;
    --iniciar)
      iniciar=1
      shift
      ;;
    --auditar) shift ;;
    -h | --ajuda)
      sed -n '2,40p' "$0"
      exit 0
      ;;
    *)
      printf 'opção desconhecida: %s (use --ajuda)\n' "$1" >&2
      exit 2
      ;;
  esac
done

arquivo_de_registro() {
  if [ -n "${PORTAO_REGISTRO:-}" ]; then
    printf '%s\n' "$PORTAO_REGISTRO"
    return 0
  fi
  local gitdir
  gitdir="$(git rev-parse --git-dir 2>/dev/null)" || return 1
  printf '%s/portao-verificados\n' "$gitdir"
}

# A versão enviada é a ponta do ramo de acompanhamento do remoto: é o que o
# repositório remoto já recebeu desta máquina.
versao_enviada() {
  git rev-parse --verify --quiet '@{upstream}' 2>/dev/null
}

# Versão aprovada é a que consta no registro do portão.
foi_verificada() {
  local sha="$1" registro
  registro="$(arquivo_de_registro)" || return 1
  [ -f "$registro" ] || return 1
  grep -q "^$sha " "$registro"
}

# Marca onde a vigilância começou nesta máquina. Idempotente: registro que já
# existe não é reescrito, senão bastaria rodar isto para apagar a dívida.
marcar_ponto_de_partida() {
  local registro
  registro="$(arquivo_de_registro)" || return 1
  [ -f "$registro" ] && return 0

  local base
  base="$(versao_enviada)"
  mkdir -p "$(dirname "$registro")"
  if [ -n "$base" ]; then
    printf '%s %s ponto-de-partida\n' "$base" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >"$registro"
  else
    : >"$registro"
  fi
  return 0
}

# Já anotada é dívida que não se anota de novo: o gancho antes do registro roda
# a cada commit, e sem isto a mesma versão viraria uma linha por commit. A busca
# é pela versão curta entre crases, que é a forma como a entrada a escreve.
ja_registrada() {
  local curto="$1"
  [ -f "$PENDENCIAS" ] || return 1
  grep -q -- "\`$curto\` no ramo" "$PENDENCIAS"
}

etapas_sem_verificacao() {
  bash infra/scripts/verificar.sh --listar 2>/dev/null |
    sed '/^[[:space:]]*$/d' |
    paste -sd '@' - |
    sed 's/@/ · /g'
}

escrever_pendencia() {
  local sha="$1" curto="$2" ramo="$3" motivo="$4" etapas="$5"

  if [ ! -f "$PENDENCIAS" ]; then
    printf 'não achei %s — a dívida do portão pulado NÃO foi registrada.\n' "$PENDENCIAS" >&2
    return 1
  fi
  if ! grep -q "$MARCA_FIM" "$PENDENCIAS"; then
    printf 'não achei a marca %s em %s — a dívida NÃO foi registrada.\n' \
      "$MARCA_FIM" "$PENDENCIAS" >&2
    return 1
  fi

  local data entrada temporario
  data="$(date '+%d/%m/%Y')"
  temporario="$(mktemp)"
  entrada="$(
    printf -- '- **%s · `%s` no ramo `%s`** — enviado sem passar pelo portão.\n' \
      "$data" "$curto" "$ramo"
    printf -- '  Motivo: %s\n' "$motivo"
    printf -- '  Ficou sem verificação: %s.\n' "$etapas"
    printf -- '  Para quitar: volte a esta versão, rode `bash infra/scripts/verificar.sh`\n'
    printf -- '  até sair limpo e apague esta linha.\n'
  )"

  # Insere ANTES da marca de fim: entradas em ordem de acontecimento, e o resto
  # do arquivo intocado — dívida se acumula, não se sobrescreve. O corte é feito
  # com `head`/`tail` porque a entrada tem várias linhas, e passar texto com
  # quebra de linha para o `awk` não é portátil entre as versões dele.
  local linha
  linha="$(grep -n "$MARCA_FIM" "$PENDENCIAS" | head -1 | cut -d: -f1)"
  {
    head -n "$((linha - 1))" "$PENDENCIAS"
    printf '%s\n\n' "$entrada"
    tail -n "+$linha" "$PENDENCIAS"
  } >"$temporario" && mv "$temporario" "$PENDENCIAS" || return 1

  # Quem prepara a dívida para entrar é este script, e não o gancho: só aqui se
  # sabe que houve escrita. O gancho fazendo `git add` incondicional prepararia
  # o arquivo em TODO commit, inclusive quando nada foi escrito — e aí o
  # trabalho de outra pessoa entraria no commit por acidente.
  git add -- "$PENDENCIAS" 2>/dev/null || true
}

# ---------------------------------------------------------------------------

if [ "$iniciar" = "1" ]; then
  marcar_ponto_de_partida
  exit 0
fi

if [ -z "$versao" ]; then
  # Primeira execução nesta máquina: só marca de onde a vigilância começa.
  registro_atual="$(arquivo_de_registro || printf '')"
  if [ -z "$registro_atual" ] || [ ! -f "$registro_atual" ]; then
    marcar_ponto_de_partida
    exit 0
  fi

  versao="$(versao_enviada)"
  if [ -z "$versao" ]; then
    # Ramo sem remoto: nada foi enviado, logo nada foi pulado.
    exit 0
  fi
  if foi_verificada "$versao"; then
    exit 0
  fi
fi

curto="$(git rev-parse --short "$versao" 2>/dev/null || printf '%s' "$versao")"

if ja_registrada "$curto"; then
  exit 0
fi

ramo="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'desconhecido')"
[ -n "$motivo" ] || motivo="não informado — quem pulou não declarou"

if escrever_pendencia "$versao" "$curto" "$ramo" "$motivo" "$(etapas_sem_verificacao)"; then
  printf '⚠ portão contornado na versão %s — dívida registrada em %s\n' "$curto" "$PENDENCIAS"
  printf '  edite a linha para dizer o motivo, e quite rodando o portão nesta versão.\n'
  exit 0
fi
exit 1
