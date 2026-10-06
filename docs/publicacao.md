# Publicação

O que roda, em que ordem, o que fazer quando falha e como voltar atrás.

> **Nada está publicado.** O domínio fica para o fim do projeto (decisão de
> 17/08). Este documento descreve o mecanismo que já existe e é verificado por
> teste; a conta no provedor, o domínio e a primeira publicação são tarefas da
> fase de publicação.

## Onde cada coisa mora

| Peça                                      | Onde                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| Site (Next)                               | Vercel — constrói do repositório                                               |
| API, banco e cache                        | Railway — constrói `apps/api/Dockerfile`                                       |
| Configuração da publicação da API         | `infra/railway/railway.json`                                                   |
| Comando que roda antes da troca de versão | `infra/railway/pre-deploy.sh`                                                  |
| Imagem de produção da API                 | `apps/api/Dockerfile`                                                          |
| Imagem de produção do site                | `apps/web/Dockerfile` (só para rodar fora da Vercel; ela não usa este arquivo) |

## A ordem, e por que ela é assim

```
  1. portão de qualidade local          bash infra/scripts/verificar.sh
        │                                (não passou → não publica)
        ▼
  2. imagem nova construída             docker build -f apps/api/Dockerfile .
        │                                (versão ANTIGA continua atendendo)
        ▼
  3. pré-publicação DENTRO da imagem    bash infra/railway/pre-deploy.sh
        │   ├─ separação de ambientes   (AC-031)
        │   ├─ migração compatível      (AC-030)
        │   ├─ conexão direta           (sem agrupador)
        │   ├─ aplicar migrações        (credencial de MIGRAÇÃO)
        │   └─ conferir o banco
        │                                (falhou → publicação interrompida,
        │                                 versão ANTIGA continua atendendo)
        ▼
  4. troca de versão                    o provedor manda tráfego para a nova
        │
        ▼
  5. verificação de saúde               GET /v1/health/ready
```

O ponto inteiro do desenho está entre 3 e 4: **a migração acontece antes de a
versão nova receber a primeira requisição** (AC-029). Migrar depois — ou na
partida do processo — deixaria a versão nova atendendo com o esquema ainda
mudando, que é o estado misto que o critério proíbe.

E se o passo 3 falhar, nada acontece: a versão nova nunca entra em rotação, a
antiga nunca sai. Não existe janela em que ninguém esteja atendendo.

### Por que a migração usa outra conexão

Duas diferenças, e as duas importam:

- **Outra credencial.** `sc_migrator` é o dono do esquema. A aplicação roda como
  `sc_app`, que não pode alterar estrutura. Se fosse a mesma credencial, uma
  falha de injeção numa rota de lojista teria poder de mudar o banco.
- **Conexão direta, sem agrupador.** Migração cria função, gatilho e política, e
  agrupador em modo transação descarta o estado da sessão entre comandos. O
  pré-publicação recusa publicar se `DATABASE_URL_DIRETA` apontar para o
  agrupador.

## Voltar à versão anterior sem perder dado (AC-030)

Voltar atrás não é coragem: é uma propriedade das migrações. Quando a versão
nova volta para a anterior, o banco **não volta junto** — ele continua com o
esquema que a migração já aplicou. Então a pergunta que decide se dá para voltar
é sempre a mesma:

> a versão ANTERIOR do código continua funcionando neste banco?

A regra que garante que sim, e que o verificador
`infra/scripts/check-migracao-compativel.mjs` cobra a cada publicação e a cada
passagem pelo portão:

| Situação                      | Como se faz                                                                                  | Por quê                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Coluna nova                   | entra **aceitando nulo**, ou com valor padrão                                                | a versão anterior não conhece a coluna e nunca vai preenchê-la        |
| Coluna que não serve mais     | **duas etapas, duas publicações**: primeiro uma versão que para de usar, depois a que remove | entre as duas há uma janela em que as duas versões funcionam          |
| Tornar uma coluna obrigatória | só depois que a versão que sempre a preenche já estiver no ar (duas etapas também)           | a versão anterior grava linha sem ela, e a gravação passaria a falhar |
| Renomear                      | **nunca**: adicionar, copiar, parar de usar e remover depois                                 | não existe instante em que as duas versões concordem sobre o nome     |
| Trocar o tipo                 | coluna nova com o tipo novo, copiar, remover a antiga depois                                 | a versão anterior escreve no tipo antigo                              |

A segunda etapa precisa de prova de que a primeira aconteceu. Essa prova é uma
linha no cabeçalho da migração, e o verificador exige que o arquivo citado
exista e seja anterior:

```sql
-- 0008_remove_apelido.sql
-- @janela-cumprida: 0007_para_de_usar_apelido.sql
ALTER TABLE app.stores DROP COLUMN apelido;
```

Sem essa linha, a migração acima reprova — e a publicação é interrompida antes
de o esquema mudar.

### O passo a passo de voltar atrás

1. **Volte a versão do serviço** pelo painel do provedor (ou pelo comando dele).
   A imagem anterior ainda está lá; publicar é trocar qual imagem recebe
   tráfego.
2. **Não desfaça a migração.** Ela é compatível com a versão anterior por
   construção — é isso que as regras acima garantem. Migração de volta ("para
   baixo") não existe neste projeto de propósito: ela é justamente o comando que
   apaga dado, e quase sempre é escrita às pressas, sob pressão, sem ensaio.
3. **Confira** `GET /v1/health/ready` e o registro estruturado.
4. **Registre em `docs/pendencias.md`** o que voltou e por quê, para a correção
   não virar folclore.

Se algum dia uma migração **precisar** ser desfeita, o caminho é uma migração
NOVA que desfaz o que a anterior fez, seguindo as mesmas regras da tabela acima.
Nunca editar um arquivo de migração já aplicado: o aplicador guarda a impressão
digital de cada um e recusa o banco que divergir.

## Produção e teste nunca compartilham banco nem cache (AC-031)

Este é o acidente mais caro possível: a suíte de testes apaga e recria dados. Se
a conexão de teste apontar para o banco da aplicação — ou se a variável de teste
apenas EXISTIR no ambiente que atende loja —, uma execução comum de teste alcança
o banco errado.

Por isso o mesmo verificador roda nos dois lados, em modos diferentes:

| Onde                                | Comando                                            | O que exige                                                                                       |
| ----------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Portão de qualidade, na sua máquina | `bash infra/scripts/check-ambientes.sh`            | `DATABASE_URL_TEST` e `REDIS_URL_TEST` apontam para banco e cache **diferentes** dos da aplicação |
| Primeiro passo da publicação        | `bash infra/scripts/check-ambientes.sh --producao` | `DATABASE_URL_TEST` e `REDIS_URL_TEST` **não existem** no ambiente                                |

Ele compara destino, não texto: máquina, porta e nome do banco (ou índice do
cache). Trocar de usuário, de senha ou acrescentar um parâmetro não transforma um
banco em outro, e `localhost` e `127.0.0.1` são a mesma máquina.

## As imagens de produção

Ambas seguem as mesmas três regras, e as três são verificadas por teste:

1. **Vários estágios.** Gerenciador de pacotes, compilador e gerador de esquema
   ficam no estágio de construção e não viajam para o que vai ao ar.
2. **Nenhuma dependência de desenvolvimento na imagem final.** A árvore de
   dependências é jogada fora e reinstalada só com o que é de execução.
   Reinstalar do zero importa: "instalar por cima" refaz as ligações e deixa os
   arquivos no depósito interno do gerenciador.
3. **Usuário sem privilégio.** O processo roda como `node`, nunca como
   administrador.

Construir e conferir na sua máquina:

```bash
docker build -f apps/api/Dockerfile -t simpleclick-api .
docker build -f apps/web/Dockerfile -t simpleclick-web .

# quem é o dono do processo (tem de ser `node`)
docker run --rm simpleclick-api id -un

# a API sobe e responde que está viva
docker run --rm -d -p 3001:3001 --name sc-api simpleclick-api
curl -s http://127.0.0.1:3001/v1/health/live
docker stop sc-api
```

O site é construído pela Vercel a partir do repositório, e ela não usa o
`Dockerfile`. Ele existe para que o site continue publicável em qualquer lugar
que rode contêiner — o plano gratuito da Vercel proíbe uso comercial, e a virada
para plano pago tem data marcada (decisão de 17/08).

## Quando falha

| Onde reprovou                           | O que dizer a si mesmo                                                         | O que fazer                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `separação de ambientes`                | o ambiente do serviço tem variável de teste carregada                          | remova `DATABASE_URL_TEST` / `REDIS_URL_TEST` do serviço e publique de novo                              |
| `compatibilidade com a versão anterior` | a migração impede voltar atrás                                                 | reescreva seguindo a tabela acima, ou parta em duas publicações e cite a primeira em `@janela-cumprida:` |
| `conexão de migração`                   | falta `DATABASE_URL_DIRETA`, ou ela aponta para o agrupador                    | use o endereço direto do banco, com a credencial de migração                                             |
| `aplicar migrações`                     | o banco não aceitou a migração                                                 | leia a mensagem: ela nomeia o arquivo. Nada ficou pela metade — cada migração roda em uma transação      |
| `banco em dia com o código`             | o banco não é o que esta versão espera (migração pendente, alterada ou sumida) | acerte o repositório e publique de novo                                                                  |
| verificação de saúde, depois da troca   | a versão nova subiu mas não alcança banco ou cache                             | volte à versão anterior (seção acima) e investigue com calma, com as lojas no ar                         |

Em todos os casos acima, menos o último, **nada foi trocado**: a versão anterior
continua atendendo, porque ela nunca chegou a ser desligada.

## A partida e a troca de versão (T-023)

A API valida o ambiente inteiro ANTES de abrir qualquer conexão e recusa partir
nomeando cada variável ausente ou inválida (AC-002). Em produção, as filas de
segundo plano sobem no mesmo processo sem precisar de variável nenhuma
(`SEGUNDO_PLANO=desligado` desliga de propósito; AC-046). Na troca de versão, o
sinal de término faz a instância antiga parar de aceitar conexão, entregar o
que está em curso e fechar filas, banco e cache nessa ordem, com prazo de 8 s
(AC-047) — o provedor precisa esperar pelo menos 10 s antes de matar à força
(ver `infra/railway/README.md`).

Enquanto o provedor de e-mail não é escolhido (dívida 35), o trabalhador de
e-mail sobe com o adaptador que falha alto: o trabalho esgota as tentativas e
fica falho e inspecionável, e cada tentativa sai no registro como
`segundo_plano.tentativa_falhou`, sem o endereço de ninguém.

## O que ainda não existe

Registrado também em `docs/pendencias.md`:

- Conta no provedor, domínio e primeira publicação — fase de publicação.
- ~~A porta da API com dois nomes~~ — resolvido pela T-023 em 03/10: a porta se
  chama `PORT` na imagem, no `.env.example`, em `core/env.ts` e em `main.ts`
  (AC-048). `API_PORT` é nome aposentado: tolerado quando aponta para a mesma
  porta, recusado na partida quando aponta para outra.
- Publicação com duas instâncias ao mesmo tempo (uma nova e uma antiga atendendo
  juntas) ainda não foi ensaiada. A regra de compatibilidade das migrações já foi
  escrita para esse mundo — é exatamente a janela que ela protege.
