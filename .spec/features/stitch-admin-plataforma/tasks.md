# Tarefas: Expansão visual da administração da plataforma

> feature: stitch-admin-plataforma

<!--
  Card #113 — bloco de códigos 11301 a 11399. Todas pendentes: implementação
  NÃO autorizada. Execução futura: uma tarefa após a outra, na pasta
  principal, sem worktree e sem o executor paralelo do motor; cada tarefa é um
  commit revertível (design.md, seção 10). Em "Arquivos" só caminhos que já
  existem; arquivos novos ficam em "A criar" (o motor ignora essa linha).
  Testes só *.onp.test.ts(x), com título "[CA-n] @spec:AC-113xx …", e só em
  apps/web (o verify roda os projetos web e unit). Nenhuma tarefa depende de
  função "A decidir" (#115–#126). Antes e depois de cada tarefa: os testes
  atuais de administração (web, API e e2e) são o portão.
-->

## Perguntas que bloqueiam tarefas

| Pergunta | Bloqueia          | O que fica parado                                                            |
| -------- | ----------------- | ---------------------------------------------------------------------------- |
| Q-11301  | T-11302 a T-11311 | se a administração entra na onda e em que ordem (liga com Q-10301)           |
| Q-11302  | ordem das tarefas | quais telas vêm primeiro                                                     |
| Q-11303  | T-11303, T-11304  | densidade da tabela                                                          |
| Q-11304  | T-11311           | tema da administração (liga com Q-10304 e Q-10402)                           |
| Q-11305  | T-11309           | gráficos novos (endpoint e card próprios) ou só retoque                      |
| Q-11306  | T-11305           | variante de celular da ficha                                                 |
| Q-11307  | nenhuma           | auditar leitura de contas é mudança de API, fora deste card                  |
| Q-11308  | nenhuma           | busca fora da URL e `Referrer-Policy` são decisões do dono, fora das tarefas |
| Q-11309  | nenhuma           | redirecionamento no servidor e `noindex`, fora das tarefas                   |
| Q-11310  | T-11302           | quem cuida do estilo do cartão de consentimento                              |
| Q-11311  | T-11301           | provas de API: `api-int` no verify ou só web                                 |
| Q-11312  | T-11306           | se salvar limites passa a pedir confirmação                                  |
| Q-11313  | T-11306           | quais atos levam o tom de perigo                                             |

Dependências de outros cards (todas de especificação e de implementação
futura): peças do #104 (`Chip`, `Abas`, `Gaveta`, `AvisoFlutuante`, token de
toque e Q-10405); padrões de tela e moldura do #112; e2e do #114.

## T-11301 — Provas de regressão de acesso, ponte e varredura (primeiro) [pendente]

- Refs: US-11301, US-11302, AC-11301, AC-11302, AC-11303, AC-11304, AC-11307, AC-11308, AC-11310
- Arquivos: apps/web/src/server/admin-api.ts, apps/web/src/server/pendentes-da-administracao.ts, apps/web/src/features/admin/apresentacao.ts, apps/web/src/features/admin/DocumentosDaLoja.tsx
- A criar: apps/web/tests/admin-acesso.onp.test.tsx, apps/web/tests/admin-ponte.onp.test.ts, apps/web/tests/admin-varredura.onp.test.ts
- Notas: só testes, nenhum código de produção muda (os arquivos acima são
  lidos). Primeiro porque fixa o que a reforma não pode afrouxar: texto das
  sete mensagens de sessão com 401 e 403, contador de pendentes com `buscar`
  falso (401, 403, falha), `caminhoPermitido` e `encaminharParaAdministracao`
  (404, 401, `no-store`, três cabeçalhos do documento), e varreduras de
  `"use cache"`, `unstable_cache`, imports de contrato `admin-*` e `console.`.
  A prova de gravação na trilha segue nos testes de API atuais (Q-11311).

## T-11302 — Moldura da administração: pedido ao #112 e conferência [pendente]

- Refs: US-11301, US-11308, AC-11302, AC-11328, AC-11331
- Arquivos: apps/web/src/app/(admin)/admin/layout.tsx, apps/web/src/features/painel/MenuDaAdministracao.tsx
- Notas: o #112 exige a não regressão do menu da administração (AC-11211 da spec dele) antes de liberar esses arquivos ao #113. O menu lateral, o estilo do menu e o pé do menu são do #112 (fila
  #112 e depois #113); `usuario.css` é do #111 e o cartão de consentimento de
  `legal.css` não tem dono (Q-11310). Esta tarefa pede ao #112 o ajuste por
  `board_message`, confere que o contador segue por requisição e mantém o
  `layout.tsx` sem guarda nova. Esperar o #112 terminar a moldura.

## T-11303 — Lista de lojas [pendente]

- Refs: US-11304, AC-11306, AC-11316, AC-11317, AC-11318, AC-11319, AC-11321
- Arquivos: apps/web/src/features/admin/ListaLojas.tsx, apps/web/src/features/admin/PilulasDeFiltro.tsx, apps/web/src/app/(admin)/admin/lojas/page.tsx
- A criar: apps/web/tests/admin-listas.onp.test.tsx
- Notas: cabeçalho de página, barra de filtros com chips do #104, tabela com
  ações por linha e quatro estados, `Selo` com nome da situação. Sem seleção
  em lote. Preservar `consultaDoEndereco`, `enderecoDaLista` e a mensagem de
  sessão. A prova de 344px é do e2e (T-11312).

## T-11304 — Lista e ficha de contas [pendente]

- Refs: US-11304, US-11305, AC-11305, AC-11306, AC-11317, AC-11318, AC-11322
- Arquivos: apps/web/src/features/admin/ListaDeContas.tsx, apps/web/src/features/admin/FichaDaConta.tsx, apps/web/src/app/(admin)/admin/contas/page.tsx, apps/web/src/app/(admin)/admin/contas/[id]/page.tsx
- A criar: apps/web/tests/admin-dados.onp.test.tsx
- Notas: mesmos padrões da lista de lojas. Não acrescentar campo pessoal
  (inventário da seção 4 do design); o e-mail e o telefone aparecem onde já
  aparecem. O limite de lojas do dono mantém a regra de hoje.

## T-11305 — Cabeçalho e abas da ficha da loja [pendente]

- Refs: US-11305, AC-11320, AC-11321
- Arquivos: apps/web/src/features/admin/CabecalhoDaFicha.tsx, apps/web/src/features/admin/AbasDaLoja.tsx, apps/web/src/features/admin/ProvedorDaFicha.tsx, apps/web/src/app/(admin)/admin/lojas/[id]/layout.tsx
- A criar: apps/web/tests/admin-fichas.onp.test.tsx
- Notas: as cinco abas continuam sendo páginas, com `aria-current="page"`
  (não usar o componente `Abas` de painel único). `AbasDaLoja.tsx` entra na
  fila do #118 se o selo for aprovado; checar o claim antes.

## T-11306 — Resumo da loja e ações sensíveis [pendente]

- Refs: US-11303, US-11305, AC-11311, AC-11312, AC-11313, AC-11314, AC-11315, AC-11316, AC-11321
- Arquivos: apps/web/src/features/admin/ResumoDaLoja.tsx, apps/web/src/features/admin/MetricasDaLoja.tsx, apps/web/src/features/admin/EquipeDaLoja.tsx, apps/web/src/features/admin/BarraDeUso.tsx, apps/web/src/features/admin/LimitesDaLoja.tsx, apps/web/src/features/admin/AtosDeAprovacao.tsx, apps/web/src/features/admin/AcoesLoja.tsx, apps/web/src/features/admin/JanelaDeConfirmacao.tsx
- A criar: apps/web/tests/admin-atos.onp.test.tsx
- Notas: a mais sensível. A tabela ato, passos, tom e trilha (design,
  seção 5) é o contrato: primeiro clique sem rede, motivo na recusa e na
  suspensão, nome na exclusão, endereço e corpo iguais aos de hoje. A
  `JanelaDeConfirmacao` não é trocada pelo `Dialogo` (Q-10408). Tom de
  perigo conforme Q-11313; limites conforme Q-11312. Rodar os testes atuais
  `apps/web/tests/admin-acoes-loja.test.tsx` e `admin-gestao.test.tsx` antes e
  depois.

## T-11307 — Cadastro, endereço e tipo de negócio da loja [pendente]

- Refs: US-11306, AC-11323
- Arquivos: apps/web/src/features/admin/DadosDaLoja.tsx, apps/web/src/features/admin/FichaLoja.tsx, apps/web/src/features/admin/EnderecoDaLoja.tsx, apps/web/src/features/admin/SeletorVertical.tsx, apps/web/src/features/admin/edicao-da-loja.ts, apps/web/src/app/(admin)/admin/lojas/[id]/cadastro/page.tsx
- A criar: apps/web/tests/admin-formularios.onp.test.tsx
- Notas: `CadastroDaLoja` (em `FichaLoja.tsx`) é a edição do cadastro;
  `FichaLoja.tsx` está na fila do #118. Erro junto do campo e anunciado;
  regras de validação intactas (`validarEdicao`).

## T-11308 — Nova loja, documentos e funcionalidades [pendente]

- Refs: US-11306, US-11302, AC-11309, AC-11323, AC-11324, AC-11325
- Arquivos: apps/web/src/features/admin/FormularioNovaLoja.tsx, apps/web/src/features/admin/formulario-da-loja.ts, apps/web/src/features/admin/DocumentosDaLoja.tsx, apps/web/src/features/admin/documentos-da-loja.ts, apps/web/src/features/admin/FuncionalidadesDaLoja.tsx
- A criar: apps/web/tests/admin-documentos-seguro.onp.test.tsx
- Notas: nos documentos, o link continua gerado no clique, fora do HTML, sem
  pré-visualização nem botão de copiar (AC-11309). `DocumentosDaLoja.tsx`
  está na fila do #118. Funcionalidades continuam pedindo motivo.

## T-11309 — Início (dashboard) [pendente]

- Refs: US-11307, AC-11326
- Arquivos: apps/web/src/features/admin-dashboard/DashboardDoAdmin.tsx, apps/web/src/features/admin-dashboard/CartaoDeNumero.tsx, apps/web/src/features/admin-dashboard/graficos.tsx, apps/web/src/features/admin-dashboard/useMetricasDoAdmin.ts, apps/web/src/app/(admin)/admin/page.tsx
- A criar: apps/web/tests/admin-inicio-auditoria.onp.test.tsx
- Notas: só retoque visual com tokens e `SeletorDePeriodo`. Gráfico novo que
  precise de endpoint exige card próprio (ASM-11308, Q-11305). Manter
  `role="img"` e `aria-label`.

## T-11310 — Histórico da loja e auditoria [pendente]

- Refs: US-11307, AC-11327
- Arquivos: apps/web/src/features/admin/HistoricoDaLoja.tsx, apps/web/src/features/admin/ListaDaTrilha.tsx, apps/web/src/features/admin/HistoricoDeAuditoria.tsx, apps/web/src/features/admin/trilha-na-tela.ts, apps/web/src/app/(admin)/admin/auditoria/page.tsx, apps/web/src/app/(admin)/admin/lojas/[id]/historico/page.tsx
- Notas: ato sensível destacado por texto além da cor; valores mascarados
  não são reformatados; filtros e período como nas listas. O conteúdo da
  trilha (`trilha.ts` na API) não muda.

## T-11311 — Teclado, toque, tokens e tema claro [pendente]

- Refs: US-11308, AC-11328, AC-11329, AC-11330, AC-11331
- Arquivos: apps/web/src/features/admin/JanelaDeConfirmacao.tsx, apps/web/src/features/admin/PilulasDeFiltro.tsx
- A criar: apps/web/tests/admin-teclado.onp.test.tsx
- Notas: provas transversais depois de todas as telas. Teclado (Tab, Enter,
  Espaço, Esc, foco devolvido), varredura de cor solta e de `b2f800`, uso do
  token de toque do #104 e tema claro sem mudança. O tema segue a Q-11304.

## T-11312 — Prova em navegador (proposta ao #114) [pendente]

- Refs: US-11304, US-11307, US-11308, AC-11319, AC-11326, AC-11329
- Arquivos: e2e/specs/admin-lojas.spec.ts
- Notas: só proposta: 344, 768 e 1280px sem rolagem lateral da página,
  contraste de 3:1 das marcas dos gráficos e medida do alvo de toque. A
  implementação é do #114; até lá esses critérios ficam `AC_SEM_PROVA`
  (ASM-11307). Não criar teste aqui.
