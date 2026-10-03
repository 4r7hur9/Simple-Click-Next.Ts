# Retomada do projeto — 27/09/2026

Estado apurado após a parada das sessões do Claude por limite de uso, a partir do
Git, das worktrees, dos registros de execução e da auditoria do ONP. Conferir
`git status` antes de agir: as faixas em curso preservam alterações sem commit.

## Base da integração

- A integração está em `../onp-worktrees/sc-integracao-onda1`, branch
  `integracao/onda-1`, desde `345d3df`. F1 catálogo, F2 preços, F3 janela de
  venda, F4 operação, F5 cupom, F6 configuração, F7 vitrine/dívidas e F9 TV
  foram integradas nessa branch. As T-200 e T-201 da F8 administração também
  foram incorporadas; a T-202 é a próxima tarefa dessa faixa.
- A `main` continua em `55ea723` com alterações locais preexistentes: sinais da
  verificação, sete arquivos `fora-de-formato-*.ts` removidos e um relatório de
  retomada não rastreado. Preservar esse estado.
- A auditoria na integração após a T-201 saiu com código 1: 13 features, 284
  critérios, 235 com teste e prova, 60 erros e 109 avisos. Por feature:
  métricas 18 erros, clientes 14, administração 12, operação 6, catálogo 2;
  as demais têm um erro de prova obsoleta cada. O portão completo ainda não
  passou; as provas escopadas de feature não o substituem.

## Onde a execução parou

| Worktree | Trabalho em curso               | Estado ao retomar                                                                                                                                                                                                                                                                      |
| -------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sc-F3`  | Catálogo T-311, janela de venda | Concluída em `92af2ba` e integrada em `c6fbb2c`. O Codex acrescentou regressão para JSON incompleto, corrigiu o CHECK SQL e alinhou o relógio do carrinho ao do teste. Prova escopada: 37/37 critérios, 283 testes; testes dirigidos na integração: 64/64 (junto com TV e isolamento). |
| `sc-F8`  | Administração T-200..209        | T-200 `ef237e3` e T-201 `ba3bdd3` concluídas. A T-201 corrigiu o total da paginação quando se pede uma página além da última; 14 testes dirigidos passaram na faixa. Prova escopada de administração: 4/4 critérios implementados e 41 testes. T-202..209 continuam pendentes.         |
| `sc-F9`  | Cardápio na TV T-950..954       | T-950/951/952/954 e correção de layout vertical commitadas em `27beb03`, integradas em `dd75476`. T-953 passou no navegador: 12/12 cenários em dois perfis, incluindo tela vertical, rodízio e queda/retorno da rede. Prova escopada anterior: 7/7 critérios, 80 testes.               |
| `sc-F1`  | Clientes T-700..708             | Trabalho sem commit em contrato, esquema, fábrica e migrações 0035/0036; API/telas ainda por fazer.                                                                                                                                                                                    |
| `sc-F2`  | Métricas T-800..809             | Módulo, testes, contrato e migração 0037 sem commit; a rota ainda não está montada nem o contrato exportado.                                                                                                                                                                           |
| `sc-F6`  | Impressão T-607..611            | Worktree limpa; implementação ainda não começou. O agente de impressão deve seguir a pilha Node/TypeScript do projeto, conforme correção explícita do usuário.                                                                                                                         |

F1/F2 têm trabalho novo sem commit. O inventário de telas após integrar TV e cupom tem 51 linhas e
54 rotas; o manifesto foi ajustado e o conjunto dirigido de integração passou.

## Provas e bloqueios

- Na integração, as últimas provas escopadas registram catálogo 37/38, TV 7/7,
  administração 4/4 critérios implementados, configuração 24/24, operação
  22/27 e vitrine 24/24. Ainda são anteriores ao
  HEAD e a auditoria acusa provas obsoletas. T-309/AC-320 continua aberta. O
  E2E do catálogo foi relatado 82/82 no commit `dd601c0`, anterior às
  integrações recentes. O registro do portão desta worktree está vazio.
- A TV foi provada em banco descartável com as 30 migrações desta integração,
  sem tocar o banco local divergente; o banco da execução já foi removido. O
  comando `node e2e/run-isolado.mjs specs/cardapio-na-tv.spec.ts` reproduz a
  montagem, a carga de exemplo, a execução e a limpeza.
- O `onpspec.config.json` local da integração está marcado `skip-worktree` e
  aponta para `../vitest-feature.sh catalogo-produtos`. Antes de `provar.sh` ou
  portão geral, restaurar o comando de teste completo; com a configuração
  atual, todas as features executariam apenas testes do catálogo. Nas faixas,
  usar Git Bash explícito: `C:/Program Files/Git/bin/bash.exe`.
- A migração 0032 da F8 já estava aplicada ao banco de desenvolvimento e agora
  está nesta integração. A única pendente era a 0028 (janela de venda), aplicada
  em 27/09/2026. `migrate.ts verificar` confirmou o banco em dia; os testes da
  janela e da T-200 também passaram em bancos descartáveis.
- **Dívida 92 — resolvida (27/09, `ebd4afa` prova vermelha e `4e602e1`
  correção):** `app.is_store_staff()` passou a exigir vínculo ativo em
  `store_members` (migração 0041, `SECURITY DEFINER` com caminho fixo; guarda
  G10 nova), e `core/db.ts` confere o vínculo logo depois de gravar o contexto
  na transação — falso vira `nao_encontrado` antes de qualquer consulta. A
  prova `apps/api/tests/isolamento-entre-lojas-dono.test.ts` cobre cada módulo
  do dono nas duas lojas. Login local, construtores de teste e montagem do E2E
  do painel passaram a criar identidade e vínculo de verdade. A 0041 já está
  aplicada ao banco de desenvolvimento.
- **Dívida 93:** o site mantém respostas da vitrine e do produto em cache por
  até 60 segundos sem invalidação quando o dono altera o catálogo. Isso atrasa
  alterações manuais e pode atrasar a representação de uma janela de venda;
  a API e o fechamento recalculam o estado em cada requisição.

## Sequência para concluir

1. Concluir T-908 (configuração E2E) e T-309/AC-320 com a administração F8.
2. Fechar administração F8, incluindo T-202..209, e integrá-la; completar as
   provas após a integração.
3. Fechar clientes, métricas e impressão em TypeScript. Executar os E2E
   pendentes T-908, T-611, T-708 e T-809.
4. Corrigir autorização entre lojas e invalidação da vitrine, depois renovar
   provas de todas as features, portão completo, E2E e auditoria global até
   código 0. Manter a integração isolada até haver um estado verificável para
   revisão da `main`.
