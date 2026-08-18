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
achou=0

for arquivo in "$@"; do
  [ -f "$arquivo" ] || continue
  case "$arquivo" in
    # Exemplo, documentação e teste falam SOBRE segredo — inclusive este script
    # e a prova dele, que precisam carregar o padrão e uma credencial de mentira
    # no corpo para poder verificar que a busca funciona.
    *.example | *.md | */check-segredos.sh | *.test.* | */tests/*) continue ;;
  esac
  if grep -nEi "$padrao" "$arquivo" >/dev/null 2>&1; then
    printf '\033[31m✘ possível segredo em %s:\033[0m\n' "$arquivo"
    grep -nEi "$padrao" "$arquivo" | sed 's/^/    /'
    achou=1
  fi
done

if [ $achou -eq 1 ]; then
  printf '\nSegredo vem de variável de ambiente, nunca do código (P-002).\n'
  printf 'Se for falso positivo, renomeie a variável ou mova o valor para o .env —\n'
  printf 'afrouxar esta busca deixa a próxima credencial de verdade passar.\n'
  exit 1
fi
exit 0
