# Publicação da API — arquivos desta pasta

O roteiro completo (o que roda, em que ordem, o que fazer quando falha e como
voltar atrás) está em [`docs/publicacao.md`](../../docs/publicacao.md). Aqui
ficam só as peças e o que cada uma decide.

| Arquivo         | O que é                                                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `railway.json`  | A configuração da publicação como dado: qual imagem construir, qual comando roda ANTES da troca de versão, e por qual caminho o provedor confere se a versão nova pode receber tráfego. |
| `pre-deploy.sh` | O comando que roda entre "a imagem nova está pronta" e "a imagem nova recebe tráfego". Sair com zero libera a troca; sair com qualquer outra coisa interrompe a publicação.             |

## Por que a migração roda aqui, e não na partida da API

Migrar na partida do processo parece mais simples e cria dois problemas que só
aparecem em produção:

1. **Concorrência.** Com duas instâncias, duas migrações começam ao mesmo tempo.
   Há uma trava entre processos no aplicador, então a segunda espera — mas o que
   ela espera é a primeira TERMINAR, e enquanto isso o provedor já considera a
   instância lenta para responder e a reinicia. O laço se alimenta sozinho.
2. **Ordem invertida.** Migrar na partida significa que a versão nova já está
   recebendo tráfego quando o esquema ainda está mudando. É exatamente o estado
   misto que o AC-029 proíbe.

O comando de pré-publicação não tem esses dois problemas: roda uma vez, num
processo só, com a versão anterior ainda atendendo normalmente.

## Variáveis que o ambiente do serviço precisa ter

Nenhuma delas mora em arquivo versionado (P-002). Em produção vêm do cofre do
provedor; para ensaiar na sua máquina, exporte-as na sessão.

| Variável                    | Para quê                                                                        |
| --------------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Conexão da aplicação, pelo agrupador.                                           |
| `DATABASE_URL_DIRETA`       | Conexão **direta**, com a credencial de migração. É a que o pré-publicação usa. |
| `REDIS_URL`                 | Cache e filas.                                                                  |
| `SENHA_BANCO_MIGRADOR`      | Senha do papel dono do esquema, usada pela migração `0001`.                     |
| `SENHA_BANCO_APLICACAO`     | Senha do papel de execução do lojista e do cliente.                             |
| `SENHA_BANCO_ADMINISTRACAO` | Senha do papel de execução da administração.                                    |
| `JWT_SECRET`                | Assinatura dos tokens de sessão.                                                |
| `ORIGENS_PERMITIDAS`        | Lista fechada de origens autorizadas a chamar a API.                            |
| `API_PORT`                  | Porta em que a API escuta. A imagem já traz `3001`.                             |

E uma lista do que **não pode existir** neste ambiente: `DATABASE_URL_TEST` e
`REDIS_URL_TEST`. A suíte de testes apaga e recria dados; com essas variáveis
carregadas no serviço que atende loja, uma execução comum alcança o banco
errado. O primeiro passo do pré-publicação recusa a publicação se encontrar
qualquer uma delas (AC-031).

## Ensaiar na sua máquina, sem publicar nada

O script não lê `.env` de propósito — em produção não existe arquivo de
ambiente, e um `.env` local carrega justamente a conexão de teste que o primeiro
passo recusa. Para ensaiar, aponte-o para um banco descartável:

```bash
env -i PATH="$PATH" HOME="$HOME" \
  DATABASE_URL=postgresql://... \
  DATABASE_URL_DIRETA=postgresql://... \
  REDIS_URL=redis://... \
  SENHA_BANCO_MIGRADOR=... \
  SENHA_BANCO_APLICACAO=... \
  SENHA_BANCO_ADMINISTRACAO=... \
  bash infra/railway/pre-deploy.sh
```

Nunca aponte o ensaio para o banco de desenvolvimento: o que ele faz é aplicar
migração, e migração aplicada não volta sozinha.

## Nada está publicado ainda

O domínio fica para o fim do projeto (decisão de 17/08). O que existe aqui é o
mecanismo e a prova de que ele funciona; a conta no provedor, o domínio e a
primeira publicação são tarefas da fase de publicação.
