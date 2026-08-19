#!/usr/bin/env bash
# Portão de qualidade — UM comando roda a verificação inteira, nesta máquina
# (AC-017). O gancho antes do envio chama exatamente este script e bloqueia o
# envio se ele reprovar (AC-041). Nada roda em servidor externo: a decisão está
# em .spec/design/decisoes.md (17/08/2026).
#
# Uso:
#   bash infra/scripts/verificar.sh                  o portão inteiro
#   bash infra/scripts/verificar.sh --listar         só os nomes das etapas, na ordem
#   bash infra/scripts/verificar.sh --somente tipos  só as etapas com "tipos" no nome
#
# COMO O ARQUIVO ESTÁ ORGANIZADO
#
# O motor (impressão, cronometragem, resumo, registro) mora em `portao-lib.sh`.
# Aqui só existe a LISTA DE ETAPAS, agrupada em blocos numerados. Cada etapa é
# uma linha `portao_etapa "<nome>" "<o que ela verifica>" <comando...>`.
#
# ORDEM: barato e revelador primeiro. Quem reprova por vírgula fora do lugar
# descobre em dois segundos, e não depois de dez minutos de banco de dados. Os
# blocos vão do que só lê arquivo até o que precisa de serviço no ar.
#
# PARA ACRESCENTAR UMA ETAPA: escreva UMA linha no bloco a que ela pertence.
# Não mexa no motor. Assim duas tarefas que crescem o portão ao mesmo tempo
# juntam o trabalho sem conflito além da própria linha.

set -uo pipefail

PORTAO_RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PORTAO_RAIZ" || exit 1

# shellcheck source=infra/scripts/portao-lib.sh
. "$PORTAO_RAIZ/infra/scripts/portao-lib.sh"

while [ $# -gt 0 ]; do
  case "$1" in
    --listar)
      PORTAO_LISTAR=1
      shift
      ;;
    --somente)
      PORTAO_SOMENTE="${2:-}"
      shift 2
      ;;
    --somente=*)
      PORTAO_SOMENTE="${1#--somente=}"
      shift
      ;;
    -h | --ajuda)
      sed -n '2,28p' "$0"
      exit 0
      ;;
    *)
      printf 'opção desconhecida: %s (use --ajuda)\n' "$1" >&2
      exit 2
      ;;
  esac
done

# Varredura de segredo sobre tudo que está versionado. O gancho antes do
# registro já olha o que foi preparado para entrar; esta etapa existe para o
# caso de algo ter entrado por um caminho que não passou pelo gancho — inclusive
# um envio com o portão pulado (AC-020, AC-043).
portao_varrer_segredos() {
  git ls-files -z | xargs -0 bash infra/scripts/check-segredos.sh
}

[ "$PORTAO_LISTAR" = "1" ] || portao_carregar_ambiente

# ── Bloco 0 · o que precisa existir antes de qualquer verificação ──────────
# Primeiro de tudo: produção e teste nunca compartilham banco nem cache
# (AC-031). Quase toda etapa abaixo escreve no banco de teste — se ele for o
# mesmo banco da aplicação, a suíte apaga dado de gente antes de qualquer linha
# vermelha aparecer. Errado aqui não é um teste que reprova: é um estrago que já
# aconteceu. O mesmo verificador roda no primeiro passo da publicação.
portao_etapa "separação de ambientes" \
  "o banco e o cache de teste não são os da aplicação" \
  bash infra/scripts/check-ambientes.sh

# O cliente tipado do banco nasce do esquema declarado e NÃO é versionado. Sem
# ele, o caminho único até o banco não compila e os testes de isolamento nem
# rodariam — o portão passaria sem ter olhado o que mais importa.
portao_etapa "cliente tipado do banco" \
  "o cliente do Prisma foi gerado a partir do esquema declarado" \
  pnpm --filter @simpleclick/database run gerar

# ── Bloco 1 · leitura do repositório (segundos, sem serviço no ar) ─────────
portao_etapa "formatação" \
  "todo arquivo versionado está no formato do Prettier" \
  pnpm prettier --check .

portao_etapa "qualidade de código" \
  "ESLint sem erro nem aviso, incluindo as fronteiras entre camadas e a regra de cor" \
  pnpm eslint . --max-warnings=0

portao_etapa "segredo no código" \
  "nenhum arquivo versionado tem chave, senha ou cadeia de conexão escrita à mão (P-002)" \
  portao_varrer_segredos

# A auditoria completa exige prova para TODOS os critérios do projeto e reprova
# por construção enquanto houver trabalho pendente; aqui entra só a parte que
# acusa regressão — critério que tinha prova e perdeu, teste órfão, referência
# quebrada. O veredito completo é `make audit`, obrigatório para declarar uma
# feature pronta (AC-018, AC-019).
portao_etapa "auditoria da especificação" \
  "nenhuma regressão entre especificação, tarefas e testes; critério sem prova é contado" \
  node infra/scripts/audit-regressao.mjs

# ── Bloco 2 · tipos e contrato publicado ──────────────────────────────────
# TypeScript sem verificação de tipos é JavaScript com comentário caro. Esta
# etapa entrou quando a T-010 descobriu que `packages/database` não compilava
# havia dias sem ninguém notar: o portão olhava formatação e testes, mas não
# tipos, e teste não exercita todo caminho tipado.
portao_etapa "verificação de tipos" \
  "todo pacote compila com tsc, sem emitir" \
  pnpm turbo run typecheck

# `contrato/openapi.json` é o que os aplicativos Kotlin e Swift vão ler para
# gerar o cliente deles. A etapa regenera o documento em memória a partir dos
# esquemas e reprova se o arquivo versionado divergir, apontando o campo. Não
# conserta sozinha de propósito: mudança de contrato se revisa, não se publica
# em silêncio (AC-007).
portao_etapa "contrato publicado em dia" \
  "contrato/openapi.json é idêntico ao que os esquemas geram hoje" \
  pnpm --filter @simpleclick/api run contrato:verificar

# ── Bloco 3 · testes que não precisam de serviço no ar ────────────────────
# Separados por projeto do Vitest de propósito: quando o portão reprova, a
# primeira linha vermelha já diz ONDE está o problema, sem ninguém precisar ler
# a saída inteira.
portao_etapa "testes de unidade" \
  "regra de negócio, esquemas e scripts de infraestrutura, sem banco nem cache" \
  pnpm vitest run --project unit

portao_etapa "testes do site (estados e acessibilidade)" \
  "componentes e páginas do Next: os quatro estados e a verificação de acessibilidade com axe" \
  pnpm vitest run --project web

# ── Bloco 4 · testes contra serviço de verdade ────────────────────────────
# Cada etapa cobra UM serviço. Misturar faria a prova do cache reprovar por
# PostgreSQL fora do ar — falha por motivo alheio é ruído, não informação.
portao_etapa "testes do cache (Redis de teste)" \
  "cache e limite de tentativas contra um Redis de verdade, no índice de teste" \
  pnpm vitest run --project cache-int

portao_etapa "testes de fila (Redis)" \
  "trabalho em segundo plano contra um Redis de verdade, cada arquivo no seu espaço de nomes" \
  pnpm vitest run --project filas

# O banco desta máquina bate com as migrações do repositório?
#
# Esta etapa nasceu de um erro real: as migrações 0007 e 0008 foram EDITADAS
# depois de já terem sido aplicadas aqui. Como elas criam com `IF NOT EXISTS`,
# reaplicar não alterou nada — a tabela de pedidos ficou com 28 colunas enquanto
# o arquivo declarava 45, faltando justamente a chave que impede pedido
# duplicado. Nada reclamou por duas migrações inteiras.
#
# O aplicador já sabia detectar (ele compara a soma de verificação de cada
# arquivo com a registrada), mas ninguém o chamava sem pedir. As demais etapas
# de banco rodam contra bancos EFÊMEROS, criados do zero a cada execução: elas
# nunca derivam, e por isso nunca acusariam isto.
portao_etapa "banco local em dia com as migrações" \
  "nenhuma migração foi alterada depois de aplicada nesta máquina" \
  pnpm --filter @simpleclick/database run migrar:verificar

# Cada arquivo deste grupo recebe um banco próprio, criado de um molde já
# migrado e apagado no fim (AC-003, AC-042). O banco de desenvolvimento não é
# tocado — e é essa propriedade que faz duas execuções seguidas darem o mesmo
# resultado.
portao_etapa "testes de integração (banco efêmero)" \
  "rotas da API e políticas de isolamento contra PostgreSQL, um banco descartável por arquivo" \
  pnpm vitest run --project api-int --project db-rls

# As guardas rodam contra um banco de prova efêmero, criado de molde vazio e
# migrado na hora (AC-008, AC-035). É o que as faz falarem sobre o REPOSITÓRIO:
# rodar contra o banco de desenvolvimento de quem chamou diria apenas o que
# aquela máquina tem hoje — inclusive um banco vazio, que passaria em todas as
# guardas sem que nenhuma tivesse olhado para nada.
# Descobrir que a migração impede voltar atrás no minuto da publicação é
# descobrir tarde demais: nessa hora o esquema já mudou (AC-030).
portao_etapa "migração compatível com a versão anterior" \
  "nenhuma migração nova quebra a versão que está no ar" \
  node infra/scripts/check-migracao-compativel.mjs

portao_etapa "guardas estruturais do banco" \
  "as nove guardas de isolamento, índice e imutabilidade contra um banco migrado do zero" \
  bash infra/scripts/db-guards.sh

# ── Bloco 5 · telas de ponta a ponta ──────────────────────────────────────
# Reservado para a T-020 (navegador de verdade e acessibilidade nas telas).
# Acrescente aqui as linhas `portao_etapa` das telas; nada mais precisa mudar.
# A acessibilidade dos componentes já é coberta no bloco 3, com axe em jsdom.

portao_resumo
