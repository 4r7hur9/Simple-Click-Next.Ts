# Retomada do projeto — 27/09/2026

Estado apurado após a parada das sessões do Claude por limite de uso, a partir do
Git, das worktrees, dos registros de execução e da auditoria do ONP. Conferir
`git status` antes de agir: as faixas em curso preservam alterações sem commit.

## Base da integração

- A integração está em `../onp-worktrees/sc-integracao-onda1`, branch
  `integracao/onda-1`, commit `dd75476`. F1 catálogo, F2 preços, F3 janela de
  venda, F4 operação, F5 cupom, F6 configuração, F7 vitrine/dívidas e F9 TV
  foram integradas nessa branch. F8 administração ainda não foi integrada.
- A `main` continua em `55ea723` com alterações locais preexistentes: sinais da
  verificação, sete arquivos `fora-de-formato-*.ts` removidos e um relatório de
  retomada não rastreado. Preservar esse estado.
- A auditoria na integração em `dd75476` saiu com código 1: 13 features, 284
  critérios, 232 com teste e prova, 63 erros e 120 avisos. Por feature: métricas
  18 erros, administração 15, clientes 14, operação 6, catálogo 2, e as sete
  restantes com um erro de prova obsoleta cada. Isso é a situação global; as
  provas escopadas de feature não substituem o portão completo.

## Onde a execução parou

| Worktree | Trabalho em curso               | Estado ao retomar                                                                                                                                                                                                                                                                      |
| -------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sc-F3`  | Catálogo T-311, janela de venda | Concluída em `92af2ba` e integrada em `c6fbb2c`. O Codex acrescentou regressão para JSON incompleto, corrigiu o CHECK SQL e alinhou o relógio do carrinho ao do teste. Prova escopada: 37/37 critérios, 283 testes; testes dirigidos na integração: 64/64 (junto com TV e isolamento). |
| `sc-F8`  | Administração T-200..209        | T-200 commitada em `ef237e3`, prova 3 critérios/27 testes; T-201 tem código e testes ainda sem commit.                                                                                                                                                                                 |
| `sc-F9`  | Cardápio na TV T-950..954       | T-950/951/952/954 e correção de layout vertical commitadas em `27beb03`, integradas em `dd75476`. Prova escopada: 7/7 critérios, 80 testes. T-953 foi escrito, mas o E2E ainda não foi executado.                                                                                      |
| `sc-F1`  | Clientes T-700..708             | Trabalho sem commit em contrato, esquema, fábrica e migrações 0035/0036; API/telas ainda por fazer.                                                                                                                                                                                    |
| `sc-F2`  | Métricas T-800..809             | Módulo, testes, contrato e migração 0037 sem commit; a rota ainda não está montada nem o contrato exportado.                                                                                                                                                                           |
| `sc-F6`  | Impressão T-607..611            | Worktree limpa; implementação ainda não começou. O agente de impressão deve seguir a pilha Node/TypeScript do projeto, conforme correção explícita do usuário.                                                                                                                         |

F8 contém commits exclusivos ainda não integrados. F1/F2 têm trabalho novo
apenas no disco. O inventário de telas após integrar TV e cupom tem 51 linhas e
54 rotas; o manifesto foi ajustado e o conjunto dirigido de integração passou.

## Provas e bloqueios

- Na integração, as últimas provas escopadas registram catálogo 37/38, TV 7/7,
  configuração 24/24, operação 22/27 e vitrine 24/24. Ainda são anteriores ao
  HEAD e a auditoria acusa provas obsoletas. T-309/AC-320 continua aberta. O
  E2E do catálogo foi relatado 82/82 no commit `dd601c0`, anterior às
  integrações recentes. O registro do portão desta worktree está vazio.
- O `onpspec.config.json` local da integração está marcado `skip-worktree` e
  aponta para `../vitest-feature.sh catalogo-produtos`. Antes de `provar.sh` ou
  portão geral, restaurar o comando de teste completo; com a configuração
  atual, todas as features executariam apenas testes do catálogo. Nas faixas,
  usar Git Bash explícito: `C:/Program Files/Git/bin/bash.exe`.
- A migração 0032 da F8 já foi aplicada ao banco de desenvolvimento e não está
  na integração. Por isso o migrador recusa aplicar 0028/0029/0030 ali. O banco
  descartável de testes aplica o conjunto da worktree e foi capaz de testar a
  janela. Resolver a ordem das migrações antes de apontar a API de
  desenvolvimento para a integração.
- **Dívida 92, prioritária:** token de dono de uma loja pode acessar rotas de
  outra loja ao trocar o apelido na URL. `app.is_store_staff()` confere só o
  papel; precisa exigir vínculo ativo em `store_members`, junto de guarda
  central na transação e provas de isolamento reais. As fixtures locais de
  login e E2E usam identidades fictícias, e precisarão de membros persistidos.
- **Dívida 93:** o site mantém respostas da vitrine e do produto em cache por
  até 60 segundos sem invalidação quando o dono altera o catálogo. Isso atrasa
  alterações manuais e pode atrasar a representação de uma janela de venda;
  a API e o fechamento recalculam o estado em cada requisição.

## Sequência para concluir

1. Concluir T-908 (configuração E2E), T-953 (TV E2E, incluindo viewport
   vertical) e T-309/AC-320 com a administração F8; revisar migrações antes de
   iniciar a API de desenvolvimento.
2. Fechar administração F8, incluindo T-201..209, e integrá-la; completar as
   provas após a integração.
3. Fechar clientes, métricas e impressão em TypeScript. Executar os E2E
   pendentes T-908, T-953, T-611, T-708 e T-809.
4. Corrigir autorização entre lojas e invalidação da vitrine, depois renovar
   provas de todas as features, portão completo, E2E e auditoria global até
   código 0. Manter a integração isolada até haver um estado verificável para
   revisão da `main`.
