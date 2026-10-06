# HarnessPlan — o plano único do SimpleClick

Levantado em 05/10/2026 e atualizado em 06/10/2026, depois do primeiro envio à `main` e da integração do segundo lote de faixas, a partir do Git, das worktrees, dos `tasks.md`, das provas gravadas e dos registros de execução. Este é o **único plano** do projeto. Ele substitui `docs/retomada-2026-09-27.md` e `docs/retomada-2026-09-27-codex.md` (apagados) e o papel de plano de `.spec/plano-paralelo.md` e `.spec/design/plano-continuacao.md`, que ficam em `.spec` como registro histórico. Como o projeto funciona está no [`README.md`](README.md).

Regra de manutenção: quando o estado muda (tarefa fecha, faixa integra, decisão sai), este arquivo muda no mesmo commit. Antes de agir, confira `git status` e `git log` da worktree: as faixas guardam trabalho sem commit.

## Índice

1. [Resumo](#1-resumo)
2. [Onde o trabalho está agora](#2-onde-o-trabalho-está-agora)
3. [Estado por feature](#3-estado-por-feature)
4. [Faixas em andamento](#4-faixas-em-andamento)
5. [O bloqueio do envio à main](#5-o-bloqueio-do-envio-à-main)
6. [Próximas fases](#6-próximas-fases)
7. [Lacunas para produção](#7-lacunas-para-produção)
8. [Decisões](#8-decisões)
9. [Dívidas abertas](#9-dívidas-abertas)
10. [Arquivos acima de 500 linhas](#10-arquivos-acima-de-500-linhas)

## 1. Resumo

- **Todas as 144 tarefas** das 13 features estão concluídas na `integracao/onda-1`. O segundo lote foi integrado em 06/10: métricas (T-801 a T-809), impressão (T-608 a T-610), administração (T-206 a T-209) e pendências (T-908, T-611 e a nova T-516 do checkout). Falta só a faixa de produção, que acrescenta T-111 a T-115 e T-024 (seção 4).
- **Primeiro envio à `main` feito em 06/10/2026**: o GitHub foi de `9dbd2f6` para **`d7cad26`** (153 commits), com o portão completo aprovado nas 16 etapas e **277 dos 287 critérios então escritos com prova** (13 features, nenhuma reprovada).
- Na integração, as provas gravadas somam **289 de 289 critérios com PASS**. Os dois critérios a mais são o AC-215 (auditoria) e o AC-524 (carrinho convertido). Essas provas vieram das faixas e ainda **não foram renovadas** sobre o código integrado: isso é o passo 3 da fase 2, antes do segundo envio.
- O bloqueio da fundação (10 critérios) foi resolvido em 05/10 (seção 5).
- Ainda trabalha uma faixa, a de produção. Ela volta para a integração e para a `main` num próximo envio.
- Mesmo com todas as tarefas fechadas, o sistema **não roda em produção**: faltam login de verdade, loja pela sessão, e-mail, armazenamento privado, arranque do banco, backup, LGPD, contas e domínio (seção 7). Login de verdade, loja pela sessão, arranque do banco e backup já estão feitos na faixa de produção, mas ainda não foram integrados.

## 2. Onde o trabalho está agora

| Ramo / árvore                                                      | Commit    | Situação                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` (`C:/Users/arthu/Desktop/SimpleClick/Simple-Click-Next.Ts`) | `d7cad26` | igual a `origin/main` desde 06/10, árvore limpa e toda em LF. As alterações locais antigas (`sinais.json`, os `fora-de-formato-*.ts` e `docs/retomada-2026-09-27.md`) foram resolvidas: o documento está guardado no histórico (`21d05c1`) e absorvido neste plano                                                                                                                     |
| `integracao/onda-1` (worktree `onp-worktrees/sc-integracao-onda1`) | `53ab0cf` | à frente da `main` com o segundo lote integrado em 06/10 (métricas `e9d79eb`, impressão `a7be6cb`, administração `9c29196`, correção `c5371fb`, pendências `53ab0cf`) e este plano. As migrações 0038 a 0040 e 0043 estão aplicadas no banco de desenvolvimento. É o ponto de encontro das faixas antes de cada envio. Não existe `origin/integracao/onda-1`: o remoto só tem a `main` |

As worktrees ficam em `C:/Users/arthu/Desktop/SimpleClick/onp-worktrees`. As faixas `sc-F3`, `sc-F4` e `sc-F5` são antigas e já foram integradas; as demais estão na seção 4.

**Prova na integração** (05/10, uma feature por vez com `vitest-feature.sh`, commitada em `d7cad26`): as 13 features aprovaram, 277 critérios com PASS e nenhum reprovado. Depois disso o pre-push rodou o portão completo (16/16) e o envio saiu.

## 3. Estado por feature

Tarefas lidas dos `tasks.md` da integração depois do segundo lote (06/10). Os critérios com prova `pass` vêm de `.spec/verification/<feature>.json` e são comparados com o total de critérios do `spec.md`. As provas de métricas, administração, operação, configurações e checkout vieram das faixas e precisam ser renovadas sobre o código integrado antes do envio.

| Feature                    | Tarefas | Concluídas            | Abertas                                                                                                    | Critérios com prova |
| -------------------------- | ------- | --------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------- |
| `fundacao`                 | 23/23   | T-001 a T-023         | na faixa de produção: T-024 Arranque do banco de produção, primeira administração e cópia de segurança     | 48/48               |
| `identidade-acesso`        | 11/11   | T-100 a T-110         | na faixa de produção: T-111 a T-114 (identidade real) e T-115 (loja do dono pela sessão), já concluídas lá | 29/29               |
| `identidade-visual-global` | 7/7     | T-965 a T-971         | —                                                                                                          | 11/11               |
| `landing-plataforma`       | 5/5     | T-960 a T-964         | —                                                                                                          | 8/8                 |
| `vitrine-publica`          | 12/12   | T-400 a T-410 e T-421 | —                                                                                                          | 24/24               |
| `catalogo-produtos`        | 14/14   | T-300 a T-313         | —                                                                                                          | 38/38               |
| `pedido-checkout`          | 17/17   | T-500 a T-516         | —                                                                                                          | 25/25               |
| `pedido-operacao`          | 12/12   | T-600 a T-611         | —                                                                                                          | 27/27               |
| `config-loja`              | 9/9     | T-900 a T-908         | —                                                                                                          | 24/24               |
| `clientes-loja`            | 9/9     | T-700 a T-708         | —                                                                                                          | 14/14               |
| `dashboard-metricas`       | 10/10   | T-800 a T-809         | —                                                                                                          | 18/18               |
| `admin-lojas`              | 10/10   | T-200 a T-209         | —                                                                                                          | 16/16               |
| `cardapio-na-tv`           | 5/5     | T-950 a T-954         | —                                                                                                          | 7/7                 |
| **Total**                  | 144/144 |                       | nenhuma na integração (mais 6 da faixa de produção: T-111 a T-115 e T-024)                                 | 289/289             |

A T-516 é nova: veio do conserto do carrinho que não era marcado como convertido (dívida 95), com o critério AC-524. O AC-215 foi escrito pela faixa da administração junto com a T-208.

Atenção a duas tarefas marcadas concluídas sem prova atual: a T-018 (publicação; a prova precisa de Docker) e a T-110 (telas de acesso; marcada sem navegador de verdade, refeita pela T-114 na faixa de produção). A T-409 diz cobrir a busca no ponta a ponta, e não cobre (dívida 89).

## 4. Faixas em andamento

Situação em 06/10, depois da integração do segundo lote. "Frente / atrás" conta os commits da faixa que a integração não tem e os da integração que a faixa não tem.

| Worktree / ramo                        | Commit    | Frente / atrás | Situação                                                                                                                                                                                                                                                                                                                                                                                                         | O que falta                                                                                                                                                                                                                 |
| -------------------------------------- | --------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sc-F9` · `faixa/P7-producao`          | `4b130ed` | 15 / 53        | **em andamento.** Concluídas na faixa: T-111 a T-114 (identidade real: banco, rotas `/v1/auth`, telas e ponta a ponta no navegador), T-115 (loja do dono pela sessão, `GET /v1/eu`, sem `NEXT_PUBLIC_DEV_STORE_SLUG` no site) e T-024 (arranque do banco vazio, primeira administração, cópia de segurança ensaiada e as duas imagens Docker construídas); a seção 7 deste plano é atualizada pela própria faixa | sincronizar com a integração, renumerando as dívidas 95 e 96 da faixa para 96 e 97 (a 95 da integração é da T-908); renovar as provas de `fundacao` e `identidade-acesso`; revisão; depois integrar (migrações 0044 a 0046) |
| `sc-F2` · `faixa/B-dashboard-metricas` | `dbae7cf` | 0 / —          | **integrada** (`e9d79eb`): métricas T-800 a T-809 completas, 18/18 critérios                                                                                                                                                                                                                                                                                                                                     | nada                                                                                                                                                                                                                        |
| `sc-F6` · `faixa/B-impressao`          | `637dceb` | 0 / —          | **integrada** (`a7be6cb`): pareamento e modo automático (T-608), emulador (T-610), agente em `apps/agente-impressao` (T-609) e pedido cancelado fora do papel (`ec80393`); migração 0038                                                                                                                                                                                                                         | nada                                                                                                                                                                                                                        |
| `sc-F8` · `faixa/F8-admin-lojas`       | `a4bdcf7` | 0 / —          | **integrada** (`9c29196`): suspender, reativar e excluir com retenção (T-206), funcionalidades por loja (T-207), auditoria consultável (T-208) e ponta a ponta (T-209); migrações 0039 e 0040. Na integração, as rotas do dono da impressão automática passaram pelo portão de `auto_print` (`c5371fb`)                                                                                                          | nada                                                                                                                                                                                                                        |
| `sc-F7` · `faixa/F7-dividas-sobre`     | `5bb3e87` | 0 / —          | **integrada** (`53ab0cf`): ponta a ponta das configurações (T-908) e da operação (T-611); correções da recusa de loja fechada (AC-517), do link de pedido adivinhado e do `imprimir.spec.ts`; carrinho convertido na mesma transação do pedido (T-516, migração 0043)                                                                                                                                            | nada                                                                                                                                                                                                                        |
| `sc-F1` · `faixa/B-clientes-loja`      | `d87d0e8` | 0 / —          | clientes-loja terminada (T-700 a T-708) e na `main`; também escreveu este plano e o README                                                                                                                                                                                                                                                                                                                       | nada                                                                                                                                                                                                                        |

Números de migração em uso: 0038 (impressão), 0039 e 0040 (administração), 0041 (equipe), 0043 (checkout) e, na faixa de produção, 0044 a 0046 (identidade). A 0042 não existe. As que foram integradas estão aplicadas no banco de desenvolvimento (`migrar:verificar` em dia).

## 5. O bloqueio do envio à main

**Resolvido em 05/10.** A prova da fundação reprovava 10 dos 48 critérios e impedia o envio. Depois do conserto, deu 48/48 (546 testes) sem nenhum teste afrouxado, e o envio de 06/10 passou pelo portão completo.

| Critério                                       | Causa confirmada                                                                                                                                                                                                                          | Correção                                                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-010 (e o princípio P-003)                   | a tabela `app.store_contracts` (0033) não tinha construtor na varredura de isolamento, e a conexão das lojas não tem acesso nenhum a ela                                                                                                  | `c5fca75`: construtor e o conjunto explícito `SO_DA_ADMINISTRACAO`, com sentinela se o acesso da loja voltar                                                              |
| AC-017, AC-020, AC-040, AC-041, AC-042, AC-043 | no Windows o pnpm instala `node_modules/.bin/*` como script `#!/bin/sh`, que o `spawnSync` não abre; ensaios estouravam 5 s; falso positivo de segredo em `auth/senha.ts`; a varredura de segredo levava 15 min com um `grep` por arquivo | `7f9d836`: scripts entregues ao bash no Windows, esperas explícitas, `portao-lib.sh` sem subprocesso por etapa, um `grep` só (5 s) e o falso positivo corrigido no código |
| AC-006                                         | o motor de prova carrega o `.env`, e o `NEXT_PUBLIC_API_URL` dele derrubava o teste do endereço padrão                                                                                                                                    | `5e636a3`: o teste isola a variável que lê e ganhou a contraprova                                                                                                         |
| AC-025                                         | o teto de 500 ms media a carga da máquina, não o critério                                                                                                                                                                                 | `1b3b6a5`: a prova passa a ser pela ordem, com o envio do e-mail preso até a resposta chegar                                                                              |
| AC-029                                         | o `pre-deploy.sh` leva cerca de 22 s nesta máquina e estourava o prazo padrão do Vitest                                                                                                                                                   | `14d7edf`: espera explícita nos testes que rodam o script de verdade                                                                                                      |
| (achados na mesma prova)                       | `db-test.test.ts` importava módulo por caminho `C:\`; projetos `unit` e `web` estouravam 5 s sob carga                                                                                                                                    | `a66ee22` (importa por URL `file://`) e `0e39502` (espera de 60 s e projeto `unit` por último na suíte inteira)                                                           |

## 6. Próximas fases

A onda 1 (as faixas paralelas e a integração) é a fase 1, quase terminada. Daqui em diante:

### Fase 2 — terminar, provar e enviar à main

Feito em 05 e 06/10: fundação consertada, provas renovadas e **primeiro envio à `main`** (`d7cad26`, portão 16/16). O ciclo se repete a cada lote de faixas prontas:

1. **Terminar as faixas** da seção 4, sempre pela trava (`bash ../com-trava.sh <rotulo> <comando>`) para provas, ponta a ponta e verificação de tipos. Cada faixa sincroniza com a integração e regrava a árvore em LF antes de integrar.
2. **Integrar** na `integracao/onda-1` (merge `--no-ff`, um por faixa), regenerar o cliente do Prisma e aplicar as migrações novas no banco de desenvolvimento (`migrar` e `migrar:verificar`).
3. **Renovar as provas** de todas as features, uma por vez (`bash ../provar-feature.sh <feature>`), porque qualquer mudança de código envelhece todas, e commitá-las.
4. **Enviar**: `bash ../com-trava.sh PUSH-main git push origin integracao/onda-1:main`, a partir da worktree da integração com a árvore limpa; o `pre-push` roda o portão inteiro. Depois, avançar a `main` local (`git merge --ff-only origin/main`).
5. Ao final de todas as faixas: o ponta a ponta inteiro em banco descartável (`node e2e/run-isolado.mjs`) e `onp-spec audit --ci` com saída 0.

### Fase 3 — limpeza pedida pelo dono

Começa só depois de as faixas terminarem, para não disputar arquivo com elas.

1. **Um README e um plano, nada redundante.** Absorver no `README.md` e neste plano o que ainda vale de `docs/pendencias.md`, `docs/publicacao.md`, `docs/verificacao.md`, `infra/railway/README.md` e `packages/database/policies/README.md`, e apagá-los. Cuidado com o que depende deles:
   - `infra/scripts/registrar-pulo.sh` **escreve** o registro de portão pulado em `docs/pendencias.md` (padrão de `PORTAO_PENDENCIAS`, entre os marcadores `<!-- portao-contornado:inicio -->` e `<!-- portao-contornado:fim -->`), e `infra/tests/portao.test.ts` prova isso (AC-043). Antes de apagar, levar os marcadores e as linhas para este plano, mudar o padrão do script, o teste e o texto do AC-043;
   - citações a trocar: `lefthook.yml`, `infra/scripts/portao-lib.sh` (mensagens do resumo), `apps/api/src/main.ts`, `infra/tests/imagens-de-producao.test.ts` e os `tasks.md` e planos da fundação;
   - a citação no comentário da migração `0009` **fica**: editar migração aplicada muda a impressão digital e o aplicador recusa o banco.
2. **Partir os arquivos acima de 500 linhas** (lista na seção 10), cada parte com uma responsabilidade.
3. **Comentário curto e direto** explicando cada função, e cabeçalho de arquivo dizendo por que ele existe.
4. **Auditar os testes**: duplicados e os que testam o que não existe mais. Já se sabe de três: `e2e/specs/cadastro.spec.ts`, `login-2fa.spec.ts` e `recuperar-senha.spec.ts` não rodam em executor nenhum (o Playwright os ignora e o Vitest exclui `e2e/`); `manifesto-cobre-arquivos.spec.ts` passa vazio no Windows por causa da barra invertida; a T-409 não cobre a busca.
5. **Acertar comentários e documentos que derivaram do código**: `vitest.config.ts` fala em "cinco" e "quatro" projetos (são seis); `verificar.sh`, `db-guards.sh` e o `policies/README.md` falam em nove guardas (são dez); o perfil `app` e o `print` do compose ainda são nginx "provisórios até a T-019"; o `.env.example` põe o banco de teste na porta 5432 (é 5433); o cabeçalho do `schema.prisma` diz que a 0007 não tem modelo; `health.cache.ts` e `contracts/src/saude.ts` falam de tarefas já feitas; `api-client.ts` se diz a "única porta" do site para a API, e não é; `arquitetura.md` cita `.github` e projetos que não existem; `decisoes.md` lista D3 e D5 como pendentes, já implementadas; `make test` diz rodar "unidade e integração", mas os scripts dos pacotes deixam de fora `api-int`, `filas`, `cache-int` e `infra/tests`.
6. **Não muda**: a pasta `.spec` fica inteira (decisão do dono) e os nomes das pastas de código ficam. Há logs de execução versionados dentro de `.spec` (`vitest-*.log`, `T101-commit.*.log`): perguntar ao dono antes de tirar.

## 7. Lacunas para produção

Nenhuma tarefa fechava estes pontos. Ordem sugerida: identidade real, loja pela sessão, e-mail e armazenamento privado, arranque do banco e backup, LGPD, contas e domínio, publicação.

| Lacuna                             | O que falta                                                                                                                                                                                                                                                                                                                                                                   | Estado                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Identidade real                    | só existe o login local (`POST /v1/auth/login`, recusado em produção). Faltam persistência, rotas de cadastro, login, segundo fator, renovação, saída, verificação, senha, autenticador e convite, a chave da cifra do autenticador, o limite de tentativas montado e o ponta a ponta real. O site já chama `/v1/auth/renovar` e o encerramento de sessões, que a API não tem | em andamento na `sc-F9` (T-111 a T-114) |
| Loja pela sessão                   | o painel descobre a loja por `NEXT_PUBLIC_DEV_STORE_SLUG` (27 usos em `apps/web/src`) e o token não carrega a loja. Falta a loja na sessão (ou uma rota "quem sou eu"), trocar as leituras e provar com dois donos                                                                                                                                                            | não iniciada                            |
| Partida da API                     | validar ambiente, subir filas, tratar o sinal de término, porta única                                                                                                                                                                                                                                                                                                         | **feita** (T-023)                       |
| Arranque do banco e primeiro admin | num banco vazio, a primeira migração precisa de uma credencial que cria papel; o caminho de hoje usa a credencial de teste, proibida em produção. Não há roteiro nem script, provado em banco descartável, que crie o primeiro administrador da plataforma                                                                                                                    | não iniciada                            |
| Backup                             | backup diário com retenção de 7 dias e restauração ensaiada (Q-004); escolher o mecanismo                                                                                                                                                                                                                                                                                     | não iniciada                            |
| E-mail                             | o adaptador de envio falha de propósito; dependem dele verificação, recuperação, convite e segundo fator por e-mail. Depois da escolha: adaptador, variáveis e SPF/DKIM/DMARC                                                                                                                                                                                                 | bloqueada: o dono escolhe o provedor    |
| Armazenamento privado (D2b)        | contrato e documentos da loja respondem 503 em produção (`core/arquivo-privado.ts`)                                                                                                                                                                                                                                                                                           | bloqueada: decisão do dono              |
| LGPD                               | páginas de termos e de privacidade, consentimento no cadastro e canal de exclusão (Q-700, ASM-704)                                                                                                                                                                                                                                                                            | bloqueada: texto jurídico do dono       |
| Contas e domínio                   | Vercel, Railway e Cloudinary pagos, domínio (D7), DNS, serviços do Railway (API, PostgreSQL, Redis, agrupador) e projeto na Vercel; completar a lista de variáveis de produção (`URL_DO_SITE`, `SEGREDO_DE_REVALIDACAO`, `CLOUDINARY_URL`, e-mail, armazenamento, chave do autenticador, as `NEXT_PUBLIC_*` e `ORIGENS_PERMITIDAS`)                                           | dono                                    |
| Agente de impressão em produção    | instalação, atualização e assinatura do agente na máquina da loja; Q-603                                                                                                                                                                                                                                                                                                      | sem tarefa                              |
| Telas sem tarefa                   | `/cadastrar`, "Meus dados" em `/minha-conta`, visão geral de `/admin` (Q-802) e o carrinho como página (hoje é gaveta; alinhar o mapa de telas)                                                                                                                                                                                                                               | sem tarefa                              |
| Contrato publicado                 | `contrato/openapi.json` cobre só a vitrine; faltam painel, conta, administração e saúde (dívida 26)                                                                                                                                                                                                                                                                           | sem tarefa                              |
| Observabilidade e ensaio           | monitorar `/v1/health/ready`, retenção de registros, e um ensaio no plano gratuito com domínio provisório (cookie, CORS, pré-publicação)                                                                                                                                                                                                                                      | sem tarefa                              |
| Imagens Docker                     | os `Dockerfile` da API e do site não copiam `packages/core/package.json` antes da instalação, e a imagem final da API não leva `packages/core`, de que 28 arquivos da API dependem. Provável quebra na construção ou na partida; não confirmado porque nada foi construído                                                                                                    | a conferir construindo as duas imagens  |

## 8. Decisões

### 8.1 Tomadas pela orquestração, para o dono confirmar

| Decisão                                                                                                                                                                                                                                                                                                                                                        | Onde está                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Agente de impressão em Node/TypeScript dentro do monorepo (`apps/agente-impressao`), só impressora de rede pela porta TCP 9100, exigindo Node 24 instalado na máquina da loja; sem USB e sem serviço do sistema na versão 1                                                                                                                                    | `decisoes.md`, 03/10                                                                |
| A fila de impressão enfileira na criação do pedido (inclusive o que aguarda o WhatsApp); a via soma na primeira reivindicação                                                                                                                                                                                                                                  | `decisoes.md`, 03/10                                                                |
| Imprimir por clique cancela o trabalho pendente da fila                                                                                                                                                                                                                                                                                                        | `decisoes.md`, 03/10                                                                |
| Uma impressora por loja na versão 1: parear um agente novo revoga os anteriores, e o agente perdido ou trocado deixa de reivindicar na hora                                                                                                                                                                                                                    | `decisoes.md`, 03/10 (pareamento, T-608)                                            |
| Gráficos das métricas em SVG e CSS próprios, sem biblioteca                                                                                                                                                                                                                                                                                                    | `decisoes.md`, 03/10                                                                |
| "Hoje" comparado com o mesmo pedaço de ontem (até o mesmo horário), e não com ontem inteiro; planilha em CSV genérico                                                                                                                                                                                                                                          | `decisoes.md`, 03/10                                                                |
| Loja suspensa ainda deixa o cliente acompanhar pedido em andamento; loja excluída sai do ar por inteiro (Q-203)                                                                                                                                                                                                                                                | `decisoes.md`, 03/10 (T-206)                                                        |
| Funcionalidades por loja só como exceções sobre o padrão ligado; sem planos nem assinaturas na versão 1                                                                                                                                                                                                                                                        | `decisoes.md`, 03/10 (T-207)                                                        |
| Loja excluída fica retida **30 dias** (o prazo da ASM-204, adotado sem confirmação); depois a remoção apaga dado operacional e pessoal e mantém pedidos, trilha e catálogo                                                                                                                                                                                     | `decisoes.md`, 03/10 (T-206)                                                        |
| O balcão do pedido manual espera 8 s pela API (a vitrine desiste em 2 s)                                                                                                                                                                                                                                                                                       | `apps/web/src/server/produtos-do-balcao.ts`                                         |
| D3: a fila do painel se atualiza por consulta a cada 5 s (já implementada)                                                                                                                                                                                                                                                                                     | `useAtualizarPedidos.ts`                                                            |
| D5: o estoque baixa no fechamento do pedido, e não no carrinho (já implementada, migração 0024)                                                                                                                                                                                                                                                                | `0024_reserva_de_estoque_no_checkout.sql`                                           |
| Dois preços do mesmo tipo valendo ao mesmo tempo: vale o menor (dívida 70)                                                                                                                                                                                                                                                                                     | `packages/core/src/preco-vigente.ts`                                                |
| O contrato assinado **continua guardado** depois da remoção definitiva da loja, como prova da relação com a plataforma (proposta da faixa)                                                                                                                                                                                                                     | `decisoes.md`, 03/10 (T-206)                                                        |
| O código de pareamento fecha no banco no **5º erro**, com ou sem Redis. Com o Redis fora do ar, o pareamento **fecha (503)**, porque sem contagem os seis dígitos ficariam abertos à força bruta; o agente já pareado continua imprimindo                                                                                                                      | `decisoes.md`, 03/10 (pareamento, T-608)                                            |
| Quando o dono desliga o modo automático, os cupons pendentes **não são cancelados**: ficam na fila, à vista para o clique (que os cancela), e voltam ao agente se o automático for religado                                                                                                                                                                    | `decisoes.md`, 03/10 (pareamento, T-608)                                            |
| Pedido cancelado **não vai ao papel**: o cupom que esperava o agente é cancelado junto e não sai quando o agente volta                                                                                                                                                                                                                                         | `ec80393` (faixa de impressão)                                                      |
| A chave `auto_print` responde pela **área de impressão térmica do painel** (cupom por clique, configuração do papel e o lado do dono da impressão automática: estado, pendentes e geração do código), e não só pela impressão automática. As rotas do próprio agente (`/v1/impressao/agente/*`) ficam fora do portão (ver 8.2). O nome segue o modelo de dados | `decisoes.md`, 03/10 (T-207); `ROTAS_DA_IMPRESSAO_TERMICA` em `apps/api/src/app.ts` |
| Só `auto_print` pode ser desligada, porque é a única chave com efeito hoje (as outras respondem 422). **Religar apaga a exceção** em vez de gravar "ligada"                                                                                                                                                                                                    | `decisoes.md`, 03/10 (T-207)                                                        |
| O texto do **AC-215** (histórico de auditoria consultável, com filtros e sem dado pessoal) foi escrito pela faixa junto com a T-208, e não veio da spec original                                                                                                                                                                                               | `.spec/features/admin-lojas/spec.md` (`40f9be5`)                                    |
| No histórico de auditoria, os registros `ADMIN_ACCESS` (consultas da própria administração) ficam **escondidos por padrão**. Aparecem quando se filtra por esse ato                                                                                                                                                                                            | `apps/api/src/modules/admin/auditoria.usecase.ts` (T-208)                           |
| O motivo da recusa por loja fechada (**AC-517**) é resolvido **só no site**: o 409 continua só com o código, e o site pergunta à vitrine quando a loja abre. Se o dono preferir o motivo no corpo do erro, a troca espera `CorpoDeErro` ganhar detalhe                                                                                                         | `docs/pendencias.md`, dívida 95; `lib/carrinho-do-navegador.ts`                     |
| Uma nova tentativa com a mesma chave de fechamento responde com o **pedido guardado** (valores, taxa, PIX e itens congelados), e não com o carrinho. O nome da taxa vem da configuração atual da loja, porque o pedido não o guarda                                                                                                                            | `pedido-fechado.usecase.ts` (T-516)                                                 |

### 8.2 Só o dono decide

- **Provedor de e-mail** (dívida 35): sem ele não há verificação, recuperação, convite nem segundo fator por e-mail.
- **Armazenamento privado do contrato e dos documentos (D2b)**: armazenamento de objeto sem custo de saída, AWS ou o do provedor do banco.
- **Domínio e contas**: domínio definitivo (D7), caminho ou subdomínio por loja (Q-200), domínio próprio da loja (Q-201), e as contas pagas na Vercel, no Railway e no Cloudinary.
- **Textos de termos de uso e de privacidade**, e as respostas de Q-700 e ASM-704.
- **Impressão**: Q-603 (o agente roda só no Windows ou também no macOS e no Linux) e Q-601 (mais de uma impressora por loja).
- **`auto_print` desligado pela administração com cupom já na fila**: o agente ainda pode imprimir esse cupom, porque as rotas do agente (`/v1/impressao/agente/*`) não têm apelido no endereço e não passam pelo portão (a reivindicação só consulta `impressao_automatica_ligada()`, nunca `store_feature_enabled('auto_print')`). Nada novo entra na fila (`12e5dfd`). Pelo mesmo motivo, um código de pareamento gerado pouco antes do desligamento (vale 10 min) ainda pareia um agente novo, que passa a receber esses pendentes. O desligamento deve também cancelar os pendentes e fechar as rotas do agente, inclusive o pareamento?
- Também abertas: Q-802 (visão geral da administração), Q-803 (planilha para um sistema de contabilidade específico), Q-701 a Q-703 (pedido manual), o texto da landing que fala "cardápio" para todos os ramos (dívida 72) e o que fazer quando um adicional ou variante esgota entre o carrinho e o fechamento (dívida 71).
- Autorizar o envio de `integracao/onda-1` ao remoto como cópia de segurança.

## 9. Dívidas abertas

Lista curta das dívidas de `docs/pendencias.md` que continuam abertas, com o mesmo número de lá. Foi conferida no código em 05/10 e revista em 06/10, depois da integração do segundo lote. Nenhuma das dívidas listadas em 05/10 foi quitada por esse lote. A 95 é nova e já veio com três dos quatro pontos resolvidos. A faixa de produção traz as suas, que entram como 96 e 97 quando ela for integrada.

- **2** — `setup.sh` gera só o `.env.compose`; o `.env` da raiz é montado à mão.
- **6** — `sinais.json` versionado conflita em todo merge.
- **8** — moldes de teste antigos (`sc_molde_*`) nunca são apagados do servidor de teste.
- **9** — `migrate.test.ts` aplica migrações sem a trava do servidor; o `CREATE ROLE` pode colidir entre worktrees.
- **13** — a mudança do Prisma 7 (conexão pelo adaptador) não está registrada em `decisoes.md`.
- **15** — o contexto por transação está repetido em `packages/testing` e já divergiu de `core/db.ts` (falta `app.checkout_key`).
- **26** — o contrato publicado não declara saúde, painel, conta nem administração.
- **28 e 69** — `NEXT_PUBLIC_API_URL` não é validada; sem ela o navegador cai em `api.simpleclick.localhost`.
- **32** — a saúde do cache fala o protocolo do Redis à mão em vez de usar o cliente de `core/cache.ts`.
- **42 e 79** — `URL_DO_SITE` e `SEGREDO_DE_REVALIDACAO` não passam por `core/env.ts`; sem `URL_DO_SITE` o link de acompanhamento no WhatsApp sai relativo.
- **44** — a regra da chave de cache está repetida na API e no site; deveria morar em `packages/core`.
- **47** — `validar()` não está costurado à declaração de rota; o contrato é um catálogo à parte.
- **48** — o aviso de bloqueio de tentativas (`aoBloquear`) não tem ouvinte.
- **49** — `proxiesConfiaveis` está fixo no código em vez de variável validada.
- **53** — o limite de tentativas não está montado em rota nenhuma da integração. A T-112, da faixa de produção, monta o limite nas rotas de `/v1/auth`.
- **54** — `app.test.ts` ainda abre um servidor por requisição.
- **58** — a prova das imagens é só da receita, e os `Dockerfile` da integração não levam `packages/core`. A faixa de produção construiu as duas imagens e corrigiu isso na T-024; a correção sai daqui quando a faixa for integrada.
- **64** — a construção do site depende de rede para baixar as fontes.
- **71** — a conferência ignora adicional esgotado e variante desligada entre o carrinho e o fechamento.
- **73** — o campo de busca não usa o texto do ramo (`rotulos.buscaPlaceholder`).
- **76** — a rota do fechamento lê a vitrine inteira, duas vezes, para saber entrega e abertura.
- **77** — o ponto de referência é digitado e descartado, embora a coluna exista no pedido.
- **80** — o texto do WhatsApp do primeiro fechamento sai da conferência, e não do pedido gravado. A nova tentativa com a mesma chave já responde a partir do pedido guardado (T-516).
- **82** — loja inexistente pode responder 200 (soft 404), e nenhum teste confere o status.
- **84** — a auditoria trata arquivo faltante de tarefa concluída como pendência, e não como regressão.
- **85** — o ponta a ponta padrão escreve no banco de desenvolvimento; o modo isolado é opcional.
- **86** — `provar.sh` roda a suíte inteira de uma vez, e não projeto a projeto como o portão.
- **87** — a coluna redundante `products.search_tsv` continua sendo mantida.
- **88** — a busca corta em 200 resultados sem dizer quantos casaram.
- **89** — a busca não tem ponta a ponta, embora a T-409 esteja concluída.
- **90** — o Playwright reaproveita servidor antigo nas portas 3100 e 3101.
- **91** — a imagem de compartilhamento sai sem as fontes da marca.
- **94** — sobras da T-023: `API_PORT` no ponta a ponta, falta o adaptador de e-mail que só registra, prazo de drenagem do provedor não conferido.
- **95** — achados do ponta a ponta das configurações (T-908). O carrinho convertido (T-516), o motivo da recusa (AC-517) e o `imprimir.spec.ts` já foram resolvidos. Falta um risco menor: arquivos do ponta a ponta que LEEM a loja do painel sem a trava podem rodar enquanto `config-horarios.spec.ts` a deixa fechada por alguns segundos.
- **Sem número (segundo lote)** — dois toques no botão ao mesmo tempo, com a mesma chave de fechamento, ainda podem terminar com o segundo batendo no índice único da chave e recebendo 500 em vez da resposta do pedido guardado. O problema já existia antes da T-516.
- **Sem número (segundo lote)** — com `auto_print` desligado pela administração, as rotas do agente (`/v1/impressao/agente/*`) não passam pelo portão. Um cupom que já estava na fila ainda pode ser impresso, e um código de pareamento gerado pouco antes ainda pareia um agente novo. Isso espera a decisão da seção 8.2.
- **Sem número (segundo lote)** — com `auto_print` desligado, o botão "Imprimir cupom" do detalhe do pedido (`BotaoImprimirCupom`, `/painel/pedidos/[id]`) continua à vista e leva a uma página que a API recusa com 403. A fila de pedidos já se cala nesse caso (`EstadoDoAgente`); o botão do detalhe ainda não consulta as funcionalidades.
- **Sem número (segundo lote)** — o pareamento do agente (`POST /v1/impressao/agente/pareamento`, sem credencial) conta o limite por loja pelo apelido público. Um anônimo com 10 códigos errados em 15 min bloqueia o pareamento da loja inteira, com espera que dobra até 6 h, e um único endereço de origem (20 por 15 min) basta para manter o bloqueio. No banco, o 5º erro já fecha o código aberto do dono (0038). Não vaza dado; o custo para a disponibilidade não foi decidido (a 8.1 só fala do fechamento no 5º erro).
- **Sem número (segundo lote)** — documentação velha depois da integração: a tabela "Onde paramos" de `docs/pendencias.md` mistura datas e ainda diz 50 de 133 tarefas (pedido-checkout 16/16, config-loja 1/9, pedido-operacao 0/12, identidade-acesso 0/11); as linhas "Sem número" desta seção não têm entrada nem número em `docs/pendencias.md` (os próximos números livres dependem da integração da faixa de produção, que leva 96 e 97); e a seção 10 tem contagens velhas (hoje `app.ts` 934, `admin.routes.ts` 1003, `isolamento-varredura.test.ts` 1354, `lojas.repo.ts` 838, `fila.usecase.ts` 627) e não lista `apps/api/tests/admin-situacao.test.ts` (699 linhas), criado em `6eb60f2` depois da regra de 05/10 de arquivo novo abaixo de 500.
- **Portão contornado** — 26 envios à `main` sem passar pelo portão, de 18/08 a 26/09, sem motivo declarado. Quitar depois do primeiro portão limpo na `main`, com o dono.

Esperam decisão do dono (seção 8): 35 (e-mail), 55 (conta, domínio e primeira publicação), 70 (menor preço), 71 (item esgotado) e 72 (texto da landing).

## 10. Arquivos acima de 500 linhas

Contagem de 05/10 (`git ls-files` e `wc -l`), para a fase 3; só `pedidos.routes.ts` foi recontado em 06/10. As duas migrações **não** se partem (migração aplicada não se edita), e os `executar-tarefas.sh` de `.spec` são gerados pelo motor; sobram 35 arquivos de código para partir.

**Código (41):**

| Linhas | Arquivo                                                                  |
| -----: | ------------------------------------------------------------------------ |
|   1248 | `packages/database/seed/catalogo.ts`                                     |
|   1218 | `apps/api/src/modules/catalog/especificacoes.routes.ts`                  |
|   1143 | `packages/testing/src/factories.ts`                                      |
|    929 | `apps/api/src/modules/orders/pedidos.routes.ts` (cresceu com a T-516)    |
|    927 | `apps/api/src/core/cache.ts`                                             |
|    923 | `.spec/features/fundacao/executar-tarefas.sh` (gerado)                   |
|    910 | `packages/core/src/cupom-blocos.ts`                                      |
|    843 | `apps/api/src/modules/catalog/produtos.routes.ts`                        |
|    815 | `packages/database/migrations/0007_catalogo_completo.sql` (não se parte) |
|    801 | `apps/api/src/modules/admin/lojas.repo.ts`                               |
|    789 | `packages/database/seed/index.ts`                                        |
|    784 | `apps/api/src/app.ts`                                                    |
|    759 | `apps/api/src/modules/admin/admin.routes.ts`                             |
|    734 | `apps/web/src/features/painel-pedidos/MontarPedido.tsx`                  |
|    688 | `apps/api/src/modules/catalog/opcoes.routes.ts`                          |
|    681 | `apps/api/src/modules/catalog/variacoes.routes.ts`                       |
|    672 | `packages/database/src/migrate.ts`                                       |
|    671 | `packages/database/seed/lojas.ts`                                        |
|    653 | `apps/api/src/modules/stores/configuracoes.usecase.ts`                   |
|    642 | `.spec/features/identidade-acesso/executar-tarefas.sh` (gerado)          |
|    630 | `apps/web/src/features/painel-catalogo/EditorEspecificacoes.tsx`         |
|    627 | `apps/api/src/core/db.ts`                                                |
|    622 | `packages/database/migrations/0008_pedidos.sql` (não se parte)           |
|    617 | `apps/web/src/features/landing/mundo.ts`                                 |
|    613 | `.spec/features/admin-lojas/executar-tarefas.sh` (gerado)                |
|    609 | `apps/api/src/modules/printing/fila.usecase.ts`                          |
|    601 | `apps/web/src/features/tv/codigo.ts`                                     |
|    592 | `apps/api/src/modules/catalog/categorias.routes.ts`                      |
|    590 | `apps/api/src/core/limite.ts`                                            |
|    580 | `packages/core/src/cupom-texto.ts`                                       |
|    578 | `packages/database/seed/pedidos.ts`                                      |
|    575 | `apps/api/src/modules/catalog/imagens.routes.ts`                         |
|    550 | `packages/contracts/src/admin.ts`                                        |
|    547 | `apps/web/src/features/admin/DocumentosDaLoja.tsx`                       |
|    540 | `packages/testing/src/db-test.ts`                                        |
|    523 | `infra/scripts/check-migracao-compativel.mjs`                            |
|    511 | `apps/web/src/app/(dev)/ui/page.tsx`                                     |
|    510 | `.spec/features/identidade-visual-global/executar-tarefas.sh` (gerado)   |
|    507 | `apps/web/src/features/painel-catalogo/ListaCategorias.tsx`              |
|    507 | `apps/api/src/modules/cart/carrinho.routes.ts`                           |
|    504 | `apps/web/src/lib/routes.ts`                                             |

**Teste (19):**

| Linhas | Arquivo                                               |
| -----: | ----------------------------------------------------- |
|   1187 | `apps/api/tests/isolamento-varredura.test.ts`         |
|   1172 | `infra/tests/portao.test.ts`                          |
|   1093 | `apps/api/tests/carrinho-rota.int.test.ts`            |
|   1017 | `apps/api/src/core/db.test.ts`                        |
|    881 | `packages/database/src/migrate.test.ts`               |
|    828 | `packages/database/seed/seed.test.ts`                 |
|    795 | `packages/database/src/guards.test.ts`                |
|    794 | `apps/api/tests/vitrine-sem-dado-sensivel.test.ts`    |
|    766 | `apps/api/tests/impressao-sem-duplicar.test.ts`       |
|    720 | `apps/api/src/core/limite.redis.test.ts`              |
|    715 | `apps/web/tests/cardapio-na-tv.test.tsx`              |
|    652 | `apps/web/tests/produto-pagina.test.tsx`              |
|    648 | `apps/api/tests/isolamento-entre-lojas-dono.test.ts`  |
|    591 | `apps/web/tests/admin-documentos.test.tsx`            |
|    562 | `apps/api/tests/estoque-do-produto.int.test.ts`       |
|    545 | `apps/api/tests/especificacoes-do-painel.int.test.ts` |
|    542 | `apps/api/tests/pedido-idempotente.test.ts`           |
|    533 | `packages/testing/src/db-test.test.ts`                |
|    522 | `apps/api/src/core/cache.test.ts`                     |

As contagens mudam com o trabalho das faixas (`isolamento-varredura.test.ts`, por exemplo, cresceu no conserto do AC-010): refazer a lista no começo da fase 3.
