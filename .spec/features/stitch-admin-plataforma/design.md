# Design: Expansão visual da administração da plataforma

> feature: stitch-admin-plataforma · card #113 · 09/11/2026

Documento de planejamento. Nada aqui está aprovado nem implementado: as
decisões do dono do produto estão nas perguntas Q-11301…Q-11312 da spec.
Caminhos relativos a `apps/web/src/` salvo indicação. Situação: **E** existe,
**P** parcial, **N** nova (peça do #104), **NC** não confirmado.

## 1. Origem e método

- O ZIP do Stitch não tem tela de administração (matriz do #103, seção 4.6).
  A proposta aplica a base visual do #104 e os padrões de tela do #112 às
  telas que já existem. Nenhuma peça nova é criada aqui: o que faltar vira
  pedido ao #104 (ASM-11302).
- Os sete padrões de tela do #112 estão em `.spec/features/stitch-painel-lojista/design.md` (seções 4 e 5), com rótulos PT1 a PT7 sem hífen (PT1 cabeçalho de página, PT2 barra de filtros, PT3 tabela densa com ações, PT4 ficha em abas, PT5 janela de confirmação, PT6 estados, PT7 cartão de métrica). Este card os cita pelo nome e pelo rótulo; o #112 registrou a `JanelaDeConfirmacao` da administração como referência de comportamento do PT5 e não a importa.
- Cor oficial `#B7FF00` e tokens `--cor-*` (P-102, P-108); nada de recurso
  externo do Stitch (P-103); Universokar é só exemplo (P-104, P-105).

## 2. Evidências do estado atual

| Fato                                                                                          | Evidência (caminho e símbolo)                                                                                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A casca web desenha menu e conteúdo para qualquer pessoa; não autoriza nada                   | `app/(admin)/admin/layout.tsx` (`LayoutDaAdministracao`)                                                                 |
| O número de pendentes vem com `no-store` e vira 0 em qualquer falha ou recusa                 | `server/pendentes-da-administracao.ts` (`lojasPendentesDeAprovacao`)                                                     |
| API: trava 1 (papel ADMIN, 403 `RECUSA_DA_ADMINISTRACAO`) e trava 2 (`platform_admins` ativo) | `apps/api/src/modules/admin/admin.routes.ts` (`criarRotasDaAdministracao`, `comoAdministrador`)                          |
| A ponte repassa só uma lista fechada; fora dela 404, sem cookie 401, sempre `no-store`        | `server/admin-api.ts` (`CAMINHOS_DA_ADMINISTRACAO`, `caminhoPermitido`, `encaminharParaAdministracao`)                   |
| A ponte repassa três cabeçalhos do documento baixado                                          | `server/admin-api.ts` (`CABECALHOS_DA_RESPOSTA_REPASSADOS`)                                                              |
| Sem `admin.css`; telas em Tailwind com `var(--cor-*)` e classes `sc-*`                        | `app/(admin)/admin/lojas/page.tsx` (`PaginaDeLojas`), `packages/ui/styles/componentes.css`                               |
| O `Dialogo` do pacote não é modal; a administração usa janela própria com `showModal()`       | `features/admin/JanelaDeConfirmacao.tsx` (`JanelaDeConfirmacao`)                                                         |
| Aprovar, recusar, ativar e desativar: janela de confirmação, recusa exige motivo              | `features/admin/AtosDeAprovacao.tsx` (`atosDisponiveis`, `consequenciasDoAtoDeAprovacao`)                                |
| Suspender, reativar, excluir e restaurar: dois passos na tela, exclusão pelo nome             | `features/admin/AcoesLoja.tsx` (`enderecoDoAto`, `consequenciasDoAto`), contrato `confirmacaoConfere`                    |
| Atos sensíveis da trilha e máscara de dado pessoal                                            | `apps/api/src/modules/admin/trilha.ts` (`ATOS_SENSIVEIS`, `atoSensivel`, `mascararDadoPessoal`)                          |
| A ficha da loja traz documento, e-mail, telefone e endereço; a abertura é auditada            | `packages/contracts/src/admin-ficha.ts` (`esquemaDaFichaDaLoja`)                                                         |
| A lista e a ficha de contas mostram e-mail e telefone; a leitura de contas não é auditada     | `features/admin/ListaDeContas.tsx` (`TabelaDeContas`), `FichaDaConta.tsx`, `apps/api/src/modules/admin/gestao.routes.ts` |
| A busca vai para o endereço (`?busca=`)                                                       | `features/admin/ListaLojas.tsx` (`enderecoDaPagina`), `ListaDeContas.tsx` (`enderecoDaPaginaDeContas`)                   |
| O link do documento nasce no clique e baixa como anexo                                        | `features/admin/DocumentosDaLoja.tsx` (`DocumentosDaLoja`)                                                               |
| As abas são links de página, com `aria-current`                                               | `features/admin/AbasDaLoja.tsx` (`ABAS_DA_LOJA`, `AbasDaLoja`)                                                           |
| Os gráficos têm `role="img"` com `aria-label`                                                 | `features/admin-dashboard/graficos.tsx` (`GraficoDeLinha`, `GraficoDeColunas`, `BarrasHorizontais`)                      |
| Limites de loja e do dono salvam por `PATCH` sem confirmação                                  | `features/admin/LimitesDaLoja.tsx` (`corpoDosLimites`), `FichaDaConta.tsx`                                               |
| Os títulos são fixos em cada página e não há `noindex`                                        | `app/(admin)/admin/page.tsx` (`metadata`), `auditoria/page.tsx`                                                          |
| O `verify` roda só os projetos vitest `web` e `unit`                                          | `onpspec.config.json` (`testCommand`), `vitest.config.ts` (projetos `unit`, `web`, `api-int`)                            |

Sete mensagens de sessão (o texto delas não muda, AC-11301):
`MENSAGEM_DE_SESSAO` em `ListaLojas.tsx`, em `HistoricoDeAuditoria.tsx` e em
`admin-dashboard/useMetricasDoAdmin.ts`; `MENSAGEM_DE_SESSAO_DA_FICHA` em
`FichaLoja.tsx`; `MENSAGEM_DE_SESSAO_DA_ADMINISTRACAO` em `apresentacao.ts`;
`MENSAGEM_DE_SESSAO_DOS_DOCUMENTOS` em `DocumentosDaLoja.tsx`;
`MENSAGEM_DE_SESSAO_DAS_FUNCIONALIDADES` em `FuncionalidadesDaLoja.tsx`.

## 3. Inventário das telas

Peças do #104 que valem para todas: `Botao` (primária, secundária, perigo,
discreta), `Campo`, `Selo`, `Tabela`, `Cartao`, `Aviso`, `Seletor`, `Chip`
(N, nos filtros), `Abas` (N, só onde o painel troca na mesma página; a ficha
da loja é navegação por página, ASM-10406), `Gaveta` (N, no celular),
`AvisoFlutuante` (N, confirmação de salvar).

| Rota (`app/(admin)/admin/`)  | Componente principal (arquivo)                                                                                     | Padrão do #112 / peça do #104                                    | Situação | Tarefa  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------- | ------- |
| `page.tsx`                   | `DashboardDoAdmin` (`admin-dashboard/DashboardDoAdmin.tsx`)                                                        | cartão de métrica, cabeçalho de página, `SeletorDePeriodo`       | P        | T-11309 |
| `lojas/`                     | `ListaLojas`, `TabelaDeLojas` (`admin/ListaLojas.tsx`)                                                             | cabeçalho de página, barra de filtros com chips, tabela, estados | P        | T-11303 |
| `lojas/nova/`                | `FormularioNovaLoja` (`admin/FormularioNovaLoja.tsx`)                                                              | `Campo`, `Botao`, estados                                        | P        | T-11308 |
| `lojas/[id]/` (layout)       | `ProvedorDaFicha`, `CabecalhoDaFicha`, `AbasDaLoja`                                                                | ficha com abas, `Selo`                                           | P        | T-11305 |
| `lojas/[id]/`                | `ResumoDaLoja` com `MetricasDaLoja`, `EquipeDaLoja`, `LimitesDaLoja`, `BarraDeUso`, `AtosDeAprovacao`, `AcoesLoja` | cartão de métrica, janela de confirmação                         | P        | T-11306 |
| `lojas/[id]/cadastro`        | `DadosDaLoja`, `CadastroDaLoja` (`FichaLoja.tsx`), `EnderecoDaLoja`, `SeletorVertical`                             | `Campo`, `Seletor`, `Aviso`                                      | P        | T-11307 |
| `lojas/[id]/documentos`      | `DocumentosDaLoja`                                                                                                 | tabela, estados                                                  | P        | T-11308 |
| `lojas/[id]/funcionalidades` | `FuncionalidadesDaLoja`                                                                                            | `Cartao`, `Botao`                                                | P        | T-11308 |
| `lojas/[id]/historico`       | `HistoricoDaLoja`, `ListaDaTrilha`                                                                                 | lista da trilha, `Selo`                                          | P        | T-11310 |
| `contas/`                    | `ListaDeContas`, `TabelaDeContas`                                                                                  | idem lojas                                                       | P        | T-11304 |
| `contas/[id]`                | `FichaDaConta`, `LojasDaConta`                                                                                     | ficha, `Cartao`, `Campo` do limite                               | P        | T-11304 |
| `auditoria/`                 | `HistoricoDeAuditoria`, `PainelDaAuditoria`                                                                        | barra de filtros, `SeletorDePeriodo`, lista da trilha            | P        | T-11310 |

Menu lateral, pé do menu e selo de pendentes: **#112** (ver seção 7).

## 4. Dado pessoal por tela (base do AC-11305)

| Tela                           | Campos pessoais que aparecem hoje                                       | Leitura auditada hoje?                        |
| ------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------- |
| Lista de lojas                 | nome do dono (sem e-mail, por desenho do contrato)                      | NC (a lista registra consulta? conferir na T) |
| Ficha da loja: Cadastro        | razão social, CPF ou CNPJ, e-mail, telefone, endereço, e-mail dos donos | sim (a abertura da ficha vai à trilha)        |
| Ficha da loja: Documentos      | documento do responsável e contrato (arquivo, só por link no clique)    | sim (`DOCUMENTO_BAIXADO`)                     |
| Ficha da loja: Resumo e Equipe | e-mail dos membros da equipe                                            | NC                                            |
| Lista de contas                | e-mail                                                                  | **não**                                       |
| Ficha da conta                 | e-mail, telefone                                                        | **não**                                       |
| Auditoria e histórico da loja  | valores mascarados (por exemplo "…1234"), papéis                        | n/a                                           |
| Início                         | nenhum (números agregados)                                              | n/a                                           |

A reforma não acrescenta linha a esta tabela. Auditar a leitura de contas é a
Q-11307 (mudança de API, fora deste card).

## 5. Ato → passos → tom → trilha (base dos AC-11311 a AC-11315)

| Ato       | Onde (arquivo)        | Passos na tela                                   | Botão de abrir | Botão de confirmar | Trilha (ato na API)                   |
| --------- | --------------------- | ------------------------------------------------ | -------------- | ------------------ | ------------------------------------- |
| aprovar   | `AtosDeAprovacao.tsx` | janela com consequências, confirmar              | primária       | primária           | `LOJA_APROVADA`                       |
| recusar   | `AtosDeAprovacao.tsx` | janela, motivo obrigatório, confirmar            | secundária     | **perigo**         | `LOJA_RECUSADA`                       |
| ativar    | `AtosDeAprovacao.tsx` | janela com consequências, confirmar              | primária       | primária           | `LOJA_ATIVADA`                        |
| desativar | `AtosDeAprovacao.tsx` | janela com consequências, confirmar              | secundária     | primária           | `LOJA_DESATIVADA`                     |
| suspender | `AcoesLoja.tsx`       | passo na tela, motivo obrigatório, confirmar     | NC             | primária           | NC (nome do ato a conferir na tarefa) |
| reativar  | `AcoesLoja.tsx`       | passo na tela, confirmar                         | NC             | primária           | NC                                    |
| excluir   | `AcoesLoja.tsx`       | passo na tela, digitar o nome da loja, confirmar | NC             | **perigo**         | `LOJA_EXCLUIDA`                       |
| restaurar | `AcoesLoja.tsx`       | passo na tela, confirmar                         | NC             | primária           | `LOJA_RESTAURADA`                     |

Proposta (a confirmar, Q-11313): o ato destrutivo ou difícil de desfazer
(recusar, excluir) mantém o tom de perigo; os reversíveis seguem com o tom
primário; a desativação e a suspensão ganham texto de consequência em destaque
e o tom é decidido na tarefa T-11306 depois da resposta do dono. Em todos, a diferença não
pode ser só de cor: nome do ato e consequência em texto.

Só a exclusão (nome) e a recusa (motivo) são exigidas pela API; os dois
passos dos demais existem só na tela. Por isso o AC-11311 é provado por teste
de tela (primeiro clique sem rede) e a gravação na trilha segue provada pelos
testes de API atuais (AC-11314).

## 6. O que o #113 não altera

| Item                                                             | Regra                                                                                                          |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Contratos `packages/contracts/src/admin-*.ts`                    | não são alterados aqui; outro card (por exemplo o #118) pode alterar no próprio card                           |
| `CAMINHOS_DA_ADMINISTRACAO` e as respostas 401, 404 e `no-store` | nenhuma entrada por este card; teste confere que o que já era recusado continua recusado, sem congelar a lista |
| `ATOS_SENSIVEIS`, `mascararDadoPessoal` e o conteúdo da trilha   | intactos; a tela só apresenta                                                                                  |
| O texto das sete mensagens de sessão                             | iguais; trocar o visual do aviso é permitido                                                                   |
| A `JanelaDeConfirmacao` (modal com `showModal()`)                | não é trocada pelo `Dialogo` até a Q-10408 do #104                                                             |
| Regras de validação, limites, endereços de API e corpos enviados | iguais                                                                                                         |
| Rotas e nomes de URL do `/admin`                                 | iguais                                                                                                         |

## 6.1 Segurança da reforma (travas para a implementação futura)

- Dado administrativo continua vindo do cliente pela ponte, com `no-store`.
  Mover busca para Server Component, `"use cache"` ou `unstable_cache` é
  proibido neste card (AC-11307).
- O contador do menu continua por requisição (`lojasPendentesDeAprovacao`,
  `no-store`). Nenhuma busca no cliente que reaproveite o número de outra
  pessoa.
- Estados de erro e de "não encontrado" são iguais para loja existente e
  inexistente e não repetem código nem termo (AC-11303).
- Link de documento: só gerado no clique, nunca em `href` renderizado, sem
  `iframe` nem `object`, sem botão de copiar (AC-11309).
- `Referrer-Policy`, `noindex`, redirecionamento no servidor e busca fora da
  URL são decisões do dono (Q-11308, Q-11309) e mudanças de infraestrutura:
  **não** entram nas tarefas.

## 7. Fila de donos de arquivo

Vale quando houver autorização de implementação, uma tarefa após a outra, na
pasta principal, sem worktree.

| Arquivo ou pasta                                                                                                          | Dono ou fila                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `features/admin/*`, `features/admin-dashboard/*`, `app/(admin)/**`                                                        | #113                                                            |
| `features/painel/*` (`MenuLateral`, `MenuDaAdministracao`, `estilo-do-menu`, `SecaoDoMenu`, `PessoaDoMenu`, `SairDoMenu`) | **#112**, fila #112 e depois #113 (pedido por `board_message`)  |
| `features/painel-filtros/*`, `features/painel-estoque/lista-paginada.tsx`                                                 | #112                                                            |
| `features/admin/FichaLoja.tsx`, `AbasDaLoja.tsx`, `DocumentosDaLoja.tsx`                                                  | #113 e depois #118, só se o selo for aprovado (T-11805 do #118) |
| `packages/ui/styles/componentes.css`, `theme.css`, `packages/ui/src/*`                                                    | #104 (o #113 só usa)                                            |
| `packages/ui/styles/usuario.css` (pé do menu, anel do avatar)                                                             | #111                                                            |
| `packages/ui/styles/legal.css` (cartão de consentimento visível na administração)                                         | sem dono (Q-11310)                                              |
| `server/admin-api.ts`, `server/pendentes-da-administracao.ts`, `app/_usuario/sessao.tsx`                                  | só leitura neste card                                           |
| Testes `*.onp.test.ts(x)` desta feature                                                                                   | #113; os transversais de navegador, #114                        |

## 8. Alternativas

| Alternativa                                                                                               | Efeito                                                                                  | Recomendação               |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------- |
| A. Retoque tela a tela com as peças do #104 e os padrões do #112, uma tarefa por tela, regressão primeiro | menor risco, cada tela se reverte sozinha, funções e dados intocados                    | **sim**                    |
| B. Nova moldura e novo conjunto de componentes só da administração                                        | visual único, mas duplica peças, fere ASM-11302 e atrasa; mais risco de mexer em acesso | não                        |
| C. Deixar a administração como está até o painel terminar                                                 | zero risco agora, mas a plataforma fica com dois visuais                                | só se a Q-11301 disser não |

## 9. Matriz critério → prova futura

Provas nos projetos `web` e `unit`, que o `verify` executa (ASM-11306).
Título do teste: `[CA-n] @spec:AC-113xx …`. `AC_SEM_PROVA` é esperado onde a
prova é de navegador (e2e do #114).

| Critério            | Prova proposta                                                                                                                            | Arquivo futuro (a criar)                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| AC-11301            | telas com `lerDaApi` recebendo 401 e 403: texto de cada uma das sete mensagens; nenhum dado renderizado                                   | `apps/web/tests/admin-acesso.onp.test.tsx`                        |
| AC-11302            | `lojasPendentesDeAprovacao` com `buscar` falso: 401, 403, falha e sucesso; `no-store` na chamada                                          | `apps/web/tests/admin-acesso.onp.test.tsx`                        |
| AC-11303            | telas de ficha com resposta 403 para id existente e inexistente: DOM igual e sem o id                                                     | `apps/web/tests/admin-acesso.onp.test.tsx`                        |
| AC-11304            | `caminhoPermitido` e `encaminharParaAdministracao` com `buscar` falso: caminho fora da lista 404, sem cookie 401                          | `apps/web/tests/admin-ponte.onp.test.ts`                          |
| AC-11305            | render das telas com contrato de exemplo: só os campos do inventário (seção 4)                                                            | `apps/web/tests/admin-dados.onp.test.tsx`                         |
| AC-11306            | render de lista com busca por e-mail: o termo não está no `title`, em `href` externo nem na mensagem de vazio                             | `apps/web/tests/admin-dados.onp.test.tsx`                         |
| AC-11307            | varredura do código de `app/(admin)` e `features/admin*` (sem `"use cache"` e `unstable_cache`); ponte com `cache-control: no-store`      | `apps/web/tests/admin-varredura.onp.test.ts`                      |
| AC-11308            | varredura de imports de `@simpleclick/contracts` com nomes `admin-*` fora das pastas permitidas                                           | `apps/web/tests/admin-varredura.onp.test.ts`                      |
| AC-11309            | tela de documentos: nenhum `href` com `/arquivos/`, sem `iframe`/`object`; ponte repassa os três cabeçalhos                               | `apps/web/tests/admin-documentos-seguro.onp.test.tsx`             |
| AC-11310            | varredura de `metadata.title` fixos e de `console.` em `features/admin*`                                                                  | `apps/web/tests/admin-varredura.onp.test.ts`                      |
| AC-11311 a AC-11313 | `AtosDeAprovacao` e `AcoesLoja`: primeiro clique sem chamada de rede, recusa e suspensão sem motivo não enviam, nome diferente desabilita | `apps/web/tests/admin-atos.onp.test.tsx`                          |
| AC-11314            | endereço e corpo enviados por ato iguais aos de hoje (`enderecoDoAto`, `corpoDoAto`); trilha: testes de API atuais como portão            | `apps/web/tests/admin-atos.onp.test.tsx`                          |
| AC-11315            | variante do botão e texto da consequência por ato conforme a seção 5                                                                      | `apps/web/tests/admin-atos.onp.test.tsx`                          |
| AC-11316            | sem controle de seleção em lote na lista; `JanelaDeConfirmacao` chama `showModal()` (dublê no jsdom)                                      | `apps/web/tests/admin-atos.onp.test.tsx`                          |
| AC-11317, AC-11318  | render dos quatro estados; `consultaDoEndereco` e `enderecoDaLista` ida e volta; chip marcado anunciado                                   | `apps/web/tests/admin-listas.onp.test.tsx`                        |
| AC-11319            | e2e em 344px (rolagem lateral da página)                                                                                                  | e2e do #114 (`AC_SEM_PROVA` até lá)                               |
| AC-11320 a AC-11322 | abas com `aria-current`; selo com texto para as seis situações; bloco do limite de lojas na ficha da conta                                | `apps/web/tests/admin-fichas.onp.test.tsx`                        |
| AC-11323 a AC-11325 | erro junto do campo (`aria-describedby`); documentos e funcionalidades nos estados; motivo exigido                                        | `apps/web/tests/admin-formularios.onp.test.tsx`                   |
| AC-11326, AC-11327  | `role="img"` e `aria-label` nos gráficos; ato sensível destacado por texto; valor mascarado preservado; contraste 3:1 no e2e              | `apps/web/tests/admin-inicio-auditoria.onp.test.tsx`, e2e do #114 |
| AC-11328            | ordem de Tab, Enter, Espaço e Esc; foco devolvido ao botão que abriu a janela                                                             | `apps/web/tests/admin-teclado.onp.test.tsx`                       |
| AC-11329            | uso do token de toque do #104 (varredura); medida renderizada no e2e do #114                                                              | `apps/web/tests/admin-varredura.onp.test.ts`, e2e do #114         |
| AC-11330            | varredura de hexadecimais soltos e de `b2f800` em `features/admin*` e `app/(admin)`                                                       | `apps/web/tests/admin-varredura.onp.test.ts`                      |
| AC-11331            | os valores do tema claro do #104 (AC-10420) seguem iguais; nenhuma folha da administração troca `data-tema`                               | `apps/web/tests/admin-varredura.onp.test.ts`                      |

Testes atuais que seguem como portão antes e depois de cada tarefa:
os 11 `apps/web/tests/admin-*.test.tsx`; os `apps/api/tests/admin-*.test.ts`,
`aprovacao-e-limites.test.ts` e `vertical-somente-admin.test.ts` (projeto
`api-int`, rodados fora do `verify`); e os e2e `e2e/specs/admin-lojas.spec.ts`
e `admin-documentos.spec.ts`.

## 10. Rollback e riscos

- **Rollback desta entrega:** apagar a pasta `.spec/features/stitch-admin-plataforma/`;
  ela não tem commit e nada fora dela é alterado.
- **Rollback da implementação futura:** uma tarefa por tela, um commit por
  tarefa, revertível com `git revert`. Nenhuma tarefa mexe em contrato, rota,
  banco ou migração; não há nada a desfazer fora do código das telas.

| Risco                                                     | Mitigação                                                                  | Detecção                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| Reforma solta dado pessoal em lista, título, URL ou cache | US-11302 com varreduras e inventário; busca fora da URL fica como pergunta | testes `admin-dados` e `admin-varredura` |
| Confirmação enfraquecida ao trocar o visual               | US-11303 com teste de tela por ato; janela segue modal                     | `admin-atos.onp.test.tsx`                |
| Conflito de arquivo com #112, #118, #104 e #111           | seção 7 e `board_message` antes de cada tarefa                             | `board_peers` e claims                   |
| Prova de API fora do verify                               | provas na web; Q-11311 ao gerente; testes de API atuais como portão        | `audit` acusa `AC_SEM_PROVA`             |
| IDs do #104 mudarem (AC-10420, Q-10402, Q-10405, Q-10408) | referências conferidas ao fim; trocar por nome se o #104 renumerar         | `onp-spec audit` (referência quebrada)   |
| Um padrão do #112 mudar de nome                           | seção 1: ao publicar, trocar pela seção do #112                            | revisão do dono                          |
