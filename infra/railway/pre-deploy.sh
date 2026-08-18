#!/usr/bin/env bash
# Publicação: migração ANTES da troca de versão (AC-029, AC-030, AC-031).
#
# Este é o comando que o provedor executa entre "a imagem nova está pronta" e
# "a imagem nova recebe tráfego" (em `infra/railway/railway.json`, o campo
# `preDeployCommand`). O contrato é o de sempre: sair com zero libera a troca,
# sair com qualquer outra coisa interrompe a publicação — e a versão ANTERIOR
# continua atendendo, porque ela nunca chegou a ser desligada.
#
# A ordem das etapas não é estilo, é a garantia:
#
#   1. separação de ambientes   — publicar apontando para o banco de teste, ou
#                                 com a conexão de teste presente no ambiente,
#                                 é o acidente mais caro possível (AC-031)
#   2. compatibilidade da migração — o que vai ser aplicado precisa deixar a
#                                 versão anterior funcionar, senão a volta
#                                 atrás deixa de existir (AC-030)
#   3. conexão direta           — migração cria função, gatilho e política, e
#                                 agrupador em modo transação não sustenta isso
#   4. aplicar migrações        — com a credencial de MIGRAÇÃO, uma transação
#                                 por arquivo: ou o arquivo inteiro entrou, ou
#                                 nada dele entrou (AC-029, sem estado misto)
#   5. conferir                 — o banco tem exatamente as migrações do
#                                 repositório, e nenhuma tabela de loja ficou
#                                 sem isolamento
#
# Este script NÃO lê `.env` de propósito. Em produção não existe arquivo de
# ambiente: as variáveis vêm do cofre do provedor. Ler um arquivo aqui faria a
# publicação depender de algo que só existe na máquina de quem desenvolve — e
# um `.env` local carrega justamente a conexão de teste, que a etapa 1 recusa.
#
# Ensaio local (banco descartável, nunca o de desenvolvimento):
#   env -i PATH="$PATH" HOME="$HOME" \
#     DATABASE_URL=postgresql://... DATABASE_URL_DIRETA=postgresql://... \
#     REDIS_URL=redis://... SENHA_BANCO_MIGRADOR=... \
#     SENHA_BANCO_APLICACAO=... SENHA_BANCO_ADMINISTRACAO=... \
#     bash infra/railway/pre-deploy.sh
#
# Saída: 0 publicação liberada · 1 alguma etapa reprovou · 2 ambiente
# incompleto (que também interrompe: sem conexão não há migração aplicada, e
# subir a versão nova assim é subir sobre um banco desconhecido).

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

LIBERADA=0
REPROVOU=1
AMBIENTE_INCOMPLETO=2

vermelho() { printf '\033[31m%s\033[0m\n' "$1" >&2; }
verde() { printf '\033[32m%s\033[0m\n' "$1"; }
detalhar() { printf '    %s\n' "$1" >&2; }

# Interrompe a publicação. A mensagem diz sempre a mesma coisa no fim, porque é
# a única coisa que quem lê o registro às três da manhã precisa saber: ninguém
# ficou sem loja no ar.
interromper() {
  local etapa="$1" codigo="$2"
  printf '\n' >&2
  vermelho "✘ publicação interrompida na etapa: ${etapa}"
  detalhar "a versão anterior continua atendendo — nada foi trocado"
  detalhar "corrija e publique de novo; nenhuma migração pela metade ficou no banco"
  exit "$codigo"
}

etapa() {
  local nome="$1"
  shift
  printf '\n\033[1m▸ %s\033[0m\n' "$nome"
  "$@" || interromper "$nome" "$REPROVOU"
}

printf '\033[1mPublicação do SimpleClick — migração antes da troca de versão\033[0m\n'

# ---------------------------------------------------------------------------
# Etapa 1 — produção e teste nunca compartilham banco nem cache (AC-031)
# ---------------------------------------------------------------------------

printf '\n\033[1m▸ separação de ambientes\033[0m\n'
bash infra/scripts/check-ambientes.sh --producao
codigo_dos_ambientes=$?
if [ "$codigo_dos_ambientes" -eq 2 ]; then
  interromper "separação de ambientes" "$AMBIENTE_INCOMPLETO"
fi
if [ "$codigo_dos_ambientes" -ne 0 ]; then
  interromper "separação de ambientes" "$REPROVOU"
fi

# ---------------------------------------------------------------------------
# Etapa 2 — a migração deixa a versão anterior funcionar (AC-030)
# ---------------------------------------------------------------------------

# É aqui que a possibilidade de voltar atrás é defendida, e não no momento em
# que alguém precisa voltar: nessa hora já é tarde, o esquema já mudou.
etapa "compatibilidade com a versão anterior" \
  node infra/scripts/check-migracao-compativel.mjs

# ---------------------------------------------------------------------------
# Etapa 3 — a migração fala direto com o banco, sem agrupador
# ---------------------------------------------------------------------------

exigir_conexao_direta() {
  local url="${DATABASE_URL_DIRETA:-}"

  if [ -z "$url" ]; then
    vermelho "✘ DATABASE_URL_DIRETA não está configurada"
    detalhar "é a conexão direta, com a credencial de migração — a única dona do esquema"
    return "$AMBIENTE_INCOMPLETO"
  fi

  # Agrupador em modo transação descarta o estado da sessão entre comandos, e
  # migração é feita de estado de sessão: papel corrente, função, gatilho.
  case "$url" in
    *pgbouncer*|*pool_mode=*|*pooler*|*:6432/*)
      vermelho "✘ DATABASE_URL_DIRETA aponta para o agrupador, e não para o banco"
      detalhar "migração cria função, gatilho e política — trabalho que não sobrevive a agrupador em modo transação"
      detalhar "use o endereço direto do banco, com a credencial de migração"
      return 1
      ;;
  esac

  printf '  ✔ conexão direta, sem agrupador\n'
}

printf '\n\033[1m▸ conexão de migração\033[0m\n'
exigir_conexao_direta
codigo_da_conexao=$?
if [ "$codigo_da_conexao" -eq "$AMBIENTE_INCOMPLETO" ]; then
  interromper "conexão de migração" "$AMBIENTE_INCOMPLETO"
fi
if [ "$codigo_da_conexao" -ne 0 ]; then
  interromper "conexão de migração" "$REPROVOU"
fi

# ---------------------------------------------------------------------------
# Etapa 4 e 5 — aplicar e conferir
# ---------------------------------------------------------------------------

# Uma transação por migração, com o registro no livro de controle dentro dela:
# falha no meio não deixa meio esquema, e é isso que impede o estado misto que
# AC-029 proíbe.
etapa "aplicar migrações" node packages/database/src/migrate.ts aplicar

# A conferência é separada da aplicação de propósito: ela responde "o banco
# ficou igual ao que este código espera?", que é outra pergunta — e é a
# pergunta que decide se a versão nova pode receber a primeira requisição.
etapa "banco em dia com o código" node packages/database/src/migrate.ts verificar

printf '\n'
verde "✔ publicação liberada — a versão nova pode receber tráfego"
printf '  o banco já está no estado que a versão nova espera\n'
exit "$LIBERADA"
