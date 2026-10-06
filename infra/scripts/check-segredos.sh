#!/usr/bin/env bash
# Segredo nunca entra no histórico (P-002, AC-020).
#
# Roda em dois lugares, de propósito:
#   - gancho antes do registro (lefthook, comando `segredos`) sobre o que foi
#     preparado para entrar — é ali que o segredo é barrado ANTES do histórico;
#   - etapa "segredo no código" do portão, sobre TUDO que está versionado — é a
#     rede que pega o que entrou por um caminho que não passou pelo gancho.
#
# Uso: bash infra/scripts/check-segredos.sh <arquivo> [arquivo...]
# Saída: 0 quando nada foi encontrado; 1 apontando arquivo e linha quando foi.
set -uo pipefail
[ $# -eq 0 ] && exit 0

# Valor literal atribuído a chave, senha, token ou cadeia de conexão.
#
# O `[A-Za-z0-9_]*` depois da palavra não é enfeite: sem ele, o padrão só pegava
# `senha = "..."` e deixava passar `SENHA_DO_BANCO = "..."` e `senhaDaLoja:
# "..."`, que é justamente como segredo aparece em código de verdade.
#
# Referência a variável de ambiente não é segredo, e por isso o primeiro
# caractere depois da aspa não pode ser `$` nem `{`: `process.env.X`,
# `${SENHA}` e `"" + senha` continuam livres. O corpo precisa de 8 caracteres
# ou mais — abaixo disso é marcador de teste, não credencial.
padrao='(api[_-]?key|secret|senha|password|token|database_url|redis_url)[A-Za-z0-9_]*[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"'$\{][^"'"'"']{7,}'

alvos=()
for arquivo in "$@"; do
  [ -f "$arquivo" ] || continue
  case "$arquivo" in
    # Exemplo, documentação e teste falam SOBRE segredo — inclusive este script
    # e a prova dele, que precisam carregar o padrão e uma credencial de mentira
    # no corpo para poder verificar que a busca funciona. `*.spec.ts` é a prova
    # de ponta a ponta (Playwright, `e2e/specs/`): teste como qualquer
    # `*.test.ts`, com a senha de mentira da pessoa que a prova cadastra.
    *.example | *.md | */check-segredos.sh | *.test.* | *.spec.ts | */tests/*) continue ;;
  esac
  alvos+=("$arquivo")
done
[ ${#alvos[@]} -eq 0 ] && exit 0

# UMA busca sobre todos os arquivos, e não um `grep` por arquivo. No Windows
# cada processo novo custa de décimos de segundo a mais de um segundo, e a
# etapa do portão varre perto de mil arquivos: um processo por arquivo levava
# a varredura a quinze minutos. `-Z` separa o nome do arquivo com um byte nulo
# (nome com `:` não confunde a leitura) e `-a` lê binário como texto, para que
# arquivo binário com o padrão também seja apontado com a linha.
achou=0
anterior=""
while IFS= read -r -d '' arquivo && IFS= read -r linha; do
  if [ "$arquivo" != "$anterior" ]; then
    printf '\033[31m✘ possível segredo em %s:\033[0m\n' "$arquivo"
    anterior="$arquivo"
  fi
  printf '    %s\n' "$linha"
  achou=1
done < <(grep -naHZEi -- "$padrao" "${alvos[@]}" 2>/dev/null)

if [ $achou -eq 1 ]; then
  printf '\nSegredo vem de variável de ambiente, nunca do código (P-002).\n'
  printf 'Se for falso positivo, renomeie a variável ou mova o valor para o .env —\n'
  printf 'afrouxar esta busca deixa a próxima credencial de verdade passar.\n'
  exit 1
fi
exit 0
