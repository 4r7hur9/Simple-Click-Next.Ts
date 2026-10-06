# Agente de impressão

Programa pequeno que roda na máquina da loja e imprime o cupom sozinho quando o
pedido entra (US-605). Ele **pergunta** à API a cada 2,5 s se há cupom para
imprimir e escreve na impressora térmica de rede (TCP, porta 9100). Não abre
porta nenhuma para a internet.

- O cupom chega no formato semântico (contrato versão 1) e é compilado aqui,
  com as mesmas funções da impressão pelo navegador (`packages/core`).
- Antes de confirmar cada cupom à API, o agente grava o identificador do
  trabalho num diário local. Se a confirmação se perder na rede, o cupom
  reenviado é só confirmado de novo e não sai duas vezes (AC-625).
- Com a impressora fora do ar, o agente conta a falha à API e o cupom espera
  na fila; o painel avisa e o dono pode imprimir por clique (AC-624).

## Instalar

Requisitos: **Node 24** instalado na máquina da loja e uma impressora térmica
de rede (ESC/POS na porta 9100). A versão 1 não fala com impressora USB nem se
instala como serviço do sistema (Q-603).

Na máquina, com o repositório clonado:

```bash
pnpm install --filter @simpleclick/agente-impressao...
cd apps/agente-impressao
```

## Parear

1. No painel, em **Configurações > Impressão**, ligue a impressão automática e
   gere o código de pareamento (seis dígitos, vale 10 minutos).
2. Na máquina da loja:

```bash
pnpm parear --api https://api.exemplo.com --loja <apelido-da-loja> \
  --codigo <123456> --impressora 192.168.0.50:9100 --nome Caixa
```

Opções: `--tabela cp860|cp850` (tabela de caracteres da impressora; padrão
`cp860`, português), `--corte parcial|total|nenhum` (padrão `parcial`) e
`--origem <url>` (origem mandada nos `POST`; padrão, a da própria API, que
precisa estar em `ORIGENS_PERMITIDAS`).

A credencial chega uma vez e fica em `~/.simpleclick-agente/agente.json`
(ou na pasta de `SIMPLECLICK_AGENTE_DIR`), legível só pelo usuário. Parear de
novo revoga o agente anterior da loja: uma impressora por loja.

## Rodar

```bash
pnpm start
```

Cada evento sai no terminal como uma linha JSON. Ctrl+C encerra. O diário dos
trabalhos impressos fica em `diario.txt`, na mesma pasta da configuração.

## Testar sem impressora

```bash
pnpm emulador                               # escuta na 9100 e mostra cada cupom
bash infra/scripts/testar-impressao.sh      # (na raiz) manda um cupom de exemplo e confere
```

Aponte o agente para `127.0.0.1:9100` no pareamento e crie pedidos: a prévia
de cada cupom aparece no terminal do emulador. Os testes
(`pnpm exec vitest run --project agente`, na raiz) sobem o mesmo emulador numa
porta livre.
