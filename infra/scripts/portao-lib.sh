#!/usr/bin/env bash
# Mecanismo do portão de qualidade — o motor que TODA etapa usa para se
# anunciar, rodar, entrar no resumo e virar registro (AC-017, AC-042, AC-043).
#
# Por que existe separado de `verificar.sh`:
#
#   1. O portão cresce por acréscimo: cada tarefa que entrega soma uma etapa.
#      Juntar duas versões de uma LISTA DE CHAMADAS é trivial; juntar duas
#      versões de um script que mistura mecanismo e lista não é.
#   2. Mecanismo se prova. Com o motor aqui, `infra/tests/portao.test.ts`
#      exercita ordem, recusa e resumo em milissegundos, sem esperar a suíte
#      inteira rodar — e é isso que torna AC-017 e AC-041 verificáveis.
#
# Este arquivo é CARREGADO (`.`), nunca executado: quem carrega já fez `cd` para
# a raiz do repositório e é dono do `set`.
#
# Nomes com prefixo `PORTAO_`/`portao_` de propósito: a biblioteca convive com
# as variáveis do `.env` no mesmo processo, e um nome curto colidiria.

# ---------------------------------------------------------------------------
# Aparência
# ---------------------------------------------------------------------------

# Cor só quando há alguém olhando. Sem isto, a saída capturada por script (ou
# por teste) vem cheia de sequências de escape e duas execuções iguais parecem
# diferentes por motivo nenhum.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  PORTAO_NEGRITO=$'\033[1m'
  PORTAO_VERDE=$'\033[32m'
  PORTAO_VERMELHO=$'\033[31m'
  PORTAO_AMARELO=$'\033[33m'
  PORTAO_NORMAL=$'\033[0m'
else
  PORTAO_NEGRITO=""
  PORTAO_VERDE=""
  PORTAO_VERMELHO=""
  PORTAO_AMARELO=""
  PORTAO_NORMAL=""
fi

# ---------------------------------------------------------------------------
# Estado da execução
# ---------------------------------------------------------------------------

PORTAO_NOMES=()      # nome de cada etapa declarada, na ordem de declaração
PORTAO_EXECUTADAS=0  # quantas realmente rodaram (o filtro pode deixar de fora)
PORTAO_APROVADAS=0
PORTAO_REPROVADAS=() # nome das que reprovaram
PORTAO_DIARIOS=()    # arquivo com a saída de cada etapa, para apagar no fim
PORTAO_DIARIOS_REPROVADOS=() # só os das que reprovaram, para o resumo repetir
PORTAO_INICIO=$SECONDS

# Retrato do repositório tirado AGORA, antes de a primeira etapa rodar. É este
# retrato, e não o do fim, que diz o que o portão verificou: a etapa da
# auditoria grava o histórico de sinais dentro de `.spec/`, então perguntar
# "a árvore está limpa?" no fim responderia "não" em toda execução — e nenhuma
# versão jamais seria anotada como verificada.
PORTAO_VERSAO="$(git rev-parse HEAD 2>/dev/null || printf '')"
PORTAO_RAMO="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf '')"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  PORTAO_ARVORE_LIMPA=0
else
  PORTAO_ARVORE_LIMPA=1
fi

# Modo de operação, definido pelo chamador antes da primeira etapa:
#   PORTAO_LISTAR=1        só imprime o nome das etapas, sem rodar nada
#   PORTAO_SOMENTE=<txt>   roda só as etapas cujo nome contém <txt>
#   PORTAO_ENSAIO=1        nenhuma etapa roda de verdade; todas passam
#   PORTAO_ENSAIO=reprovar:<txt>  idem, mas as que contêm <txt> reprovam
PORTAO_LISTAR="${PORTAO_LISTAR:-0}"
PORTAO_SOMENTE="${PORTAO_SOMENTE:-}"
PORTAO_ENSAIO="${PORTAO_ENSAIO:-}"

# ---------------------------------------------------------------------------
# Ambiente
# ---------------------------------------------------------------------------

# O ambiente local vem do `.env`, que nunca é versionado (P-002). Sem ele, os
# testes que provam o isolamento contra um banco de verdade ficariam de fora em
# SILÊNCIO — e um portão que pula justamente a verificação mais importante é
# pior do que portão nenhum. Por isso o aviso é barulhento.
portao_carregar_ambiente() {
  if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
    return 0
  fi
  printf '%s⚠ .env não encontrado — os testes contra banco e cache reais vão reprovar.%s\n' \
    "$PORTAO_AMARELO" "$PORTAO_NORMAL"
  printf '  crie com: cp .env.example .env   (e complete os valores)\n'
  printf '  ou monte o ambiente inteiro: bash infra/scripts/setup.sh\n\n'
  return 0
}

# ---------------------------------------------------------------------------
# Etapas
# ---------------------------------------------------------------------------

# Devolve o que fazer com uma etapa: listar, pular, ensaiar (aprovando ou
# reprovando) ou rodar de verdade.
portao_destino_da_etapa() {
  local nome="$1"

  if [ "$PORTAO_LISTAR" = "1" ]; then
    printf 'listar\n'
    return 0
  fi
  if [ -n "$PORTAO_SOMENTE" ] && [ "${nome#*$PORTAO_SOMENTE}" = "$nome" ]; then
    printf 'pular\n'
    return 0
  fi
  case "$PORTAO_ENSAIO" in
    "") printf 'rodar\n' ;;
    reprovar:*)
      local alvo="${PORTAO_ENSAIO#reprovar:}"
      if [ "${nome#*$alvo}" != "$nome" ]; then
        printf 'ensaio-reprova\n'
      else
        printf 'ensaio-aprova\n'
      fi
      ;;
    *) printf 'ensaio-aprova\n' ;;
  esac
}

# portao_etapa <nome> <o que ela verifica> <comando...>
#
# O segundo argumento não é enfeite: quem lê a saída precisa saber O QUE foi
# verificado, e não só que "passou". É a diferença entre um portão que informa e
# um que dá um sinal verde sem conteúdo.
portao_etapa() {
  local nome="$1"
  local verifica="$2"
  shift 2

  PORTAO_NOMES[${#PORTAO_NOMES[@]}]="$nome"

  local destino
  destino="$(portao_destino_da_etapa "$nome")"

  case "$destino" in
    listar)
      printf '%s\n' "$nome"
      return 0
      ;;
    pular) return 0 ;;
  esac

  printf '\n%s▸ %s%s\n' "$PORTAO_NEGRITO" "$nome" "$PORTAO_NORMAL"
  printf '  verifica: %s\n' "$verifica"

  local inicio=$SECONDS
  local veredito=0
  # A saída é MOSTRADA ao vivo e GUARDADA ao mesmo tempo. O motivo é prático: o
  # portão tem dezesseis etapas e leva minutos, e quando uma reprova a
  # explicação fica soterrada centenas de linhas acima do veredito. Quem lê rola
  # para cima procurando, ou — pior — reexecuta filtrando a saída e não vê nada.
  # Guardando, o resumo repete o trecho da falha ao lado do nome dela.
  local diario
  diario="$(mktemp "${TMPDIR:-/tmp}/portao-etapa-XXXXXX")"
  PORTAO_DIARIOS[${#PORTAO_DIARIOS[@]}]="$diario"

  case "$destino" in
    ensaio-aprova) veredito=0 ;;
    ensaio-reprova) veredito=1 ;;
    *)
      # `PIPESTATUS` porque o código que importa é o do comando, não o do `tee`.
      if "$@" 2>&1 | tee "$diario"; then :; fi
      veredito=${PIPESTATUS[0]}
      ;;
  esac
  local gasto=$((SECONDS - inicio))

  PORTAO_EXECUTADAS=$((PORTAO_EXECUTADAS + 1))
  if [ "$veredito" -eq 0 ]; then
    PORTAO_APROVADAS=$((PORTAO_APROVADAS + 1))
    printf '%s  ✔ %s%s — %s (%ss)\n' \
      "$PORTAO_VERDE" "$nome" "$PORTAO_NORMAL" "$verifica" "$gasto"
  else
    PORTAO_REPROVADAS[${#PORTAO_REPROVADAS[@]}]="$nome"
    PORTAO_DIARIOS_REPROVADOS[${#PORTAO_DIARIOS_REPROVADOS[@]}]="$diario"
    printf '%s  ✘ %s%s — %s (%ss)\n' \
      "$PORTAO_VERMELHO" "$nome" "$PORTAO_NORMAL" "$verifica" "$gasto"
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Registro do que foi verificado (a memória do portão)
# ---------------------------------------------------------------------------
#
# Toda execução limpa e COMPLETA da versão registrada no histórico anota aqui a
# versão aprovada. O arquivo mora dentro do `.git` desta árvore de trabalho: é
# fato sobre ESTA máquina, não sobre o repositório, e versioná-lo criaria
# conflito a cada envio.
#
# Sem esta memória, `registrar-pulo.sh` não teria como saber que uma versão foi
# enviada sem passar pelo portão — que é exatamente o que AC-043 manda registrar.

# Apaga os arquivos de saída das etapas. Só é chamado quando o portão fica
# limpo: se alguma reprovou, os arquivos ficam para quem quiser ler inteiro.
portao_limpar_diarios() {
  local arquivo
  for arquivo in "${PORTAO_DIARIOS[@]}"; do
    [ -n "$arquivo" ] && rm -f "$arquivo"
  done
}

portao_arquivo_de_registro() {
  if [ -n "${PORTAO_REGISTRO:-}" ]; then
    printf '%s\n' "$PORTAO_REGISTRO"
    return 0
  fi
  local gitdir
  gitdir="$(git rev-parse --git-dir 2>/dev/null)" || return 1
  printf '%s/portao-verificados\n' "$gitdir"
}

# Anota a versão aprovada. Recusa anotar em três casos, todos honestos:
# execução de ensaio (nada rodou), execução parcial (nem tudo rodou) e árvore
# suja (o que foi verificado não é o que está no histórico).
portao_registrar_aprovacao() {
  local arquivo
  arquivo="$(portao_arquivo_de_registro)" || return 0

  if [ -n "$PORTAO_ENSAIO" ] || [ -n "$PORTAO_SOMENTE" ]; then
    printf '  (execução parcial ou de ensaio: nada foi anotado como verificado)\n'
    return 0
  fi
  if [ "$PORTAO_ARVORE_LIMPA" != "1" ]; then
    printf '  (árvore de trabalho suja quando o portão começou: ele aprovou o que\n'
    printf '   estava no disco, e não uma versão do histórico — nada foi anotado)\n'
    return 0
  fi
  [ -n "$PORTAO_VERSAO" ] || return 0

  local versao ramo
  versao="$PORTAO_VERSAO"
  ramo="$PORTAO_RAMO"
  mkdir -p "$(dirname "$arquivo")"
  printf '%s %s %s\n' "$versao" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$ramo" >>"$arquivo"
  printf '  versão %s anotada como verificada\n' "$(git rev-parse --short HEAD)"
}

# ---------------------------------------------------------------------------
# Resumo
# ---------------------------------------------------------------------------

portao_resumo() {
  # Listar é inspeção, não execução: resumo aqui só faria ruído em quem quer a
  # lista de etapas para outra coisa (o registro de pulo usa exatamente isto).
  if [ "$PORTAO_LISTAR" = "1" ]; then return 0; fi

  local total=${#PORTAO_NOMES[@]}
  local reprovadas=${#PORTAO_REPROVADAS[@]}
  local gasto=$((SECONDS - PORTAO_INICIO))
  local minutos=$((gasto / 60))
  local segundos=$((gasto % 60))

  printf '\n%s─── resumo do portão ───%s\n' "$PORTAO_NEGRITO" "$PORTAO_NORMAL"
  printf '  %s etapas declaradas · %s executadas · %s aprovadas · %s reprovadas\n' \
    "$total" "$PORTAO_EXECUTADAS" "$PORTAO_APROVADAS" "$reprovadas"
  printf '  tempo: %sm%ss\n' "$minutos" "$segundos"

  if [ -n "$PORTAO_ENSAIO" ]; then
    printf '%s  ENSAIO: nenhuma verificação de verdade foi executada.%s\n' \
      "$PORTAO_AMARELO" "$PORTAO_NORMAL"
  fi
  if [ -n "$PORTAO_SOMENTE" ]; then
    printf '%s  PARCIAL: só as etapas com "%s" no nome rodaram.%s\n' \
      "$PORTAO_AMARELO" "$PORTAO_SOMENTE" "$PORTAO_NORMAL"
  fi

  if [ "$reprovadas" -eq 0 ]; then
    printf '%s✔ portão limpo%s\n' "$PORTAO_VERDE" "$PORTAO_NORMAL"
    portao_registrar_aprovacao
    portao_limpar_diarios
    return 0
  fi

  # O trecho final de cada etapa que reprovou, AO LADO do veredito. Sem isto, a
  # explicação fica centenas de linhas acima e quem lê acaba reexecutando só
  # para vê-la — que é como uma falha intermitente vira "roda de novo que passa".
  local indice=0
  while [ "$indice" -lt "$reprovadas" ]; do
    local diario="${PORTAO_DIARIOS_REPROVADOS[$indice]:-}"
    if [ -n "$diario" ] && [ -s "$diario" ]; then
      printf '\n%s─ últimas linhas de "%s" ─%s\n' \
        "$PORTAO_NEGRITO" "${PORTAO_REPROVADAS[$indice]}" "$PORTAO_NORMAL"
      tail -n "${PORTAO_LINHAS_DA_FALHA:-25}" "$diario" | sed 's/^/    /'
    fi
    indice=$((indice + 1))
  done

  printf '%s✘ portão reprovou em %s etapa(s):%s\n' \
    "$PORTAO_VERMELHO" "$reprovadas" "$PORTAO_NORMAL"
  local i=0
  while [ "$i" -lt "$reprovadas" ]; do
    printf '    ✘ %s\n' "${PORTAO_REPROVADAS[$i]}"
    i=$((i + 1))
  done
  printf '  o que fazer com cada uma: docs/verificacao.md\n'
  printf '  para rodar só a que reprovou: bash infra/scripts/verificar.sh --somente "<parte do nome>"\n'
  printf '  para enviar mesmo assim: LEFTHOOK=0 git push — a dívida é registrada\n'
  printf '  em docs/pendencias.md pelo gancho antes do registro (AC-043).\n'
  return 1
}
