#!/usr/bin/env bash
# Certificado curinga para *.localhost, usado pelo roteador local.
#
# Um único par cobre app.localhost e api.localhost — a mesma topologia que vai
# para produção (dois nomes sob um domínio comum), o que faz o cookie de sessão
# se comportar aqui como vai se comportar lá.
#
# O curinga sozinho NÃO basta, e isso custou uma depuração: `*.localhost` tem
# como resto uma etiqueta só, e cliente que segue a RFC 6125 — curl, OpenSSL e
# os navegadores — recusa casar curinga nesse caso. Por isso os nomes reais
# entram também, um a um, ao lado do curinga.
#
# Dois caminhos, na ordem de preferência:
#   1. mkcert, quando existir — instala a autoridade no depósito do sistema e
#      do navegador, então o cadeado fica verde sem aviso;
#   2. openssl com autoridade própria, como reserva — o certificado vale, mas o
#      navegador avisa até que a autoridade seja confiada à mão.
#
# As extensões vão por arquivo de configuração, e não pelos atalhos `-addext` e
# `-ext`: o macOS ainda entrega LibreSSL, que não os conhece. O arquivo funciona
# nas duas implementações.
#
# Idempotente: se o certificado existe, cobre os nomes certos e ainda vale por
# mais de 30 dias, não faz nada. Use --forcar para regerar mesmo assim.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
destino="$raiz/infra/traefik/certs"
crt="$destino/localhost.crt"
chave="$destino/localhost.key"
ca_crt="$destino/ca-local.crt"
ca_chave="$destino/ca-local.key"

# Segundos em 30 dias: abaixo disso, vale regerar antes que vença no meio de
# um dia de trabalho.
MARGEM_DE_VALIDADE=$((30 * 24 * 60 * 60))
DIAS_DE_VALIDADE=825

forcar=0
[ "${1:-}" = "--forcar" ] && forcar=1

ambiente="$raiz/infra/compose/.env.compose"
modelo="$raiz/infra/compose/.env.compose.example"

# Lê uma variável do arquivo de ambiente sem interpretá-lo como script — dar
# `source` em arquivo de configuração é porta aberta. Cai no modelo enquanto
# .env.compose ainda não existe, que é o caso na primeira execução do setup.
valor_de() {
  local chave="$1" arquivo
  for arquivo in "$ambiente" "$modelo"; do
    [ -f "$arquivo" ] || continue
    local valor
    valor="$(sed -n "s/^${chave}=//p" "$arquivo" | tail -n 1 | tr -d '[:space:]')"
    [ -n "$valor" ] && {
      printf '%s' "$valor"
      return 0
    }
  done
}

# Nomes que o certificado precisa cobrir. Os dois primeiros são fixos; os
# seguintes vêm da configuração, para que trocar HOST_WEB continue funcionando.
nomes_exigidos=("localhost" "*.localhost")
for variavel_de_host in HOST_WEB HOST_API; do
  nome_configurado="$(valor_de "$variavel_de_host")"
  [ -n "$nome_configurado" ] && nomes_exigidos+=("$nome_configurado")
done
unset variavel_de_host nome_configurado

temporarios="$(mktemp -d)"
trap 'rm -rf "$temporarios"' EXIT

info() { printf '\033[36m›\033[0m %s\n' "$1"; }
ok() { printf '\033[32m✔\033[0m %s\n' "$1"; }
erro() {
  printf '\033[31m✘ %s\033[0m\n' "$1" >&2
  exit 1
}

# Os nomes alternativos são lidos do texto do certificado porque `x509 -ext`
# não existe no LibreSSL.
nomes_do_certificado() {
  openssl x509 -in "$crt" -noout -text 2>/dev/null |
    grep -A 1 "Subject Alternative Name" || true
}

cobre_todos_os_nomes() {
  local presentes nome
  presentes="$(nomes_do_certificado)"
  for nome in "${nomes_exigidos[@]}"; do
    case "$presentes" in
      *"DNS:$nome"*) ;;
      *) return 1 ;;
    esac
  done
}

# Verdadeiro só quando o certificado existente serve de fato: cobre os nomes e
# vale pela margem inteira. Certificado quebrado precisa ser refeito, não
# aceito em silêncio.
certificado_ainda_serve() {
  [ -s "$crt" ] && [ -s "$chave" ] || return 1
  openssl x509 -in "$crt" -checkend "$MARGEM_DE_VALIDADE" -noout >/dev/null 2>&1 || return 1
  cobre_todos_os_nomes
}

gerar_com_mkcert() {
  info "gerando com mkcert (autoridade confiada pelo sistema)"
  mkcert -install >/dev/null 2>&1 || true
  mkcert \
    -cert-file "$crt" \
    -key-file "$chave" \
    "${nomes_exigidos[@]}" "127.0.0.1" "::1" >/dev/null
}

# Autoridade própria: só é criada uma vez e reaproveitada nas regerações, para
# que confiar nela no sistema seja trabalho de uma vez só.
garantir_autoridade_propria() {
  [ -s "$ca_crt" ] && [ -s "$ca_chave" ] && return 0

  info "criando autoridade local de desenvolvimento"
  cat >"$temporarios/ca.cnf" <<'CONF'
[ req ]
distinguished_name = dn
x509_extensions    = extensoes_da_autoridade
prompt             = no

[ dn ]
CN = SimpleClick Desenvolvimento
O  = SimpleClick
C  = BR

[ extensoes_da_autoridade ]
basicConstraints     = critical, CA:TRUE, pathlen:0
keyUsage             = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
CONF

  openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
    -keyout "$ca_chave" -out "$ca_crt" \
    -config "$temporarios/ca.cnf" 2>/dev/null
  chmod 600 "$ca_chave"
}

gerar_com_openssl() {
  garantir_autoridade_propria
  info "gerando certificado curinga assinado pela autoridade local"

  cat >"$temporarios/servidor.cnf" <<'CONF'
[ req ]
distinguished_name = dn
req_extensions     = extensoes_do_servidor
prompt             = no

[ dn ]
CN = *.localhost
O  = SimpleClick
C  = BR

[ extensoes_do_servidor ]
basicConstraints = CA:FALSE
keyUsage         = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName   = @nomes

[ nomes ]
CONF

  local indice=0 nome
  for nome in "${nomes_exigidos[@]}"; do
    indice=$((indice + 1))
    printf 'DNS.%d = %s\n' "$indice" "$nome" >>"$temporarios/servidor.cnf"
  done
  printf 'IP.1  = 127.0.0.1\nIP.2  = ::1\n' >>"$temporarios/servidor.cnf"

  openssl req -newkey rsa:2048 -nodes \
    -keyout "$chave" -out "$temporarios/servidor.csr" \
    -config "$temporarios/servidor.cnf" 2>/dev/null

  openssl x509 -req -in "$temporarios/servidor.csr" \
    -CA "$ca_crt" -CAkey "$ca_chave" -CAcreateserial \
    -CAserial "$temporarios/ca.srl" \
    -out "$crt" -days "$DIAS_DE_VALIDADE" -sha256 \
    -extfile "$temporarios/servidor.cnf" \
    -extensions extensoes_do_servidor 2>/dev/null
}

explicar_confianca_manual() {
  printf '\n'
  printf '  A autoridade local ainda pode não ser confiada por este computador.\n'
  printf '  Enquanto não for, o navegador avisa em cada acesso.\n'
  printf '  Para confiar, importe: %s\n' "$ca_crt"
  printf '    macOS: sudo security add-trusted-cert -d -r trustRoot \\\n'
  printf '             -k /Library/Keychains/System.keychain "%s"\n' "$ca_crt"
  printf '    Linux: sudo cp "%s" \\\n' "$ca_crt"
  printf '             /usr/local/share/ca-certificates/simpleclick.crt \\\n'
  printf '             && sudo update-ca-certificates\n'
  printf '  Ou instale o mkcert e rode este roteiro de novo — ele faz isso sozinho.\n\n'
}

# Certificado que não cobre os dois nomes é pior que nenhum: o erro aparece só
# no navegador, muito depois. Confere aqui, enquanto o contexto é claro — e
# apaga o que não presta, para que a próxima execução tente de novo.
validar() {
  descartar_e_falhar() {
    rm -f "$crt" "$chave"
    erro "$1"
  }

  cobre_todos_os_nomes ||
    descartar_e_falhar "o certificado gerado não cobre todos os nomes: ${nomes_exigidos[*]}"

  openssl x509 -in "$crt" -checkend 0 -noout >/dev/null 2>&1 ||
    descartar_e_falhar "o certificado gerado já está vencido"

  # Chave que não casa com o certificado produz um erro obscuro no roteador,
  # horas depois. Melhor reprovar agora.
  local mod_crt mod_chave
  mod_crt="$(openssl x509 -in "$crt" -noout -modulus 2>/dev/null || true)"
  mod_chave="$(openssl rsa -in "$chave" -noout -modulus 2>/dev/null || true)"
  if [ -n "$mod_crt" ] && [ -n "$mod_chave" ] && [ "$mod_crt" != "$mod_chave" ]; then
    descartar_e_falhar "a chave privada não corresponde ao certificado"
  fi
}

main() {
  command -v openssl >/dev/null 2>&1 ||
    erro "openssl não encontrado — instale-o para gerar o certificado local"

  mkdir -p "$destino"

  if [ "$forcar" -eq 0 ] && certificado_ainda_serve; then
    ok "certificado local já existe e continua válido ($crt)"
    return 0
  fi

  local usou_autoridade_propria=0
  if command -v mkcert >/dev/null 2>&1; then
    gerar_com_mkcert
  else
    gerar_com_openssl
    usou_autoridade_propria=1
  fi

  chmod 600 "$chave"
  validar
  [ "$usou_autoridade_propria" -eq 1 ] && explicar_confianca_manual
  ok "certificado pronto para: ${nomes_exigidos[*]}"
}

main "$@"
