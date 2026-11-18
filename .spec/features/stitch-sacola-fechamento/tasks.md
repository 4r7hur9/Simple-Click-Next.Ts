# Tasks: Sacola lateral, barra móvel e fechamento do pedido

> feature: stitch-sacola-fechamento

<!--
  Card #110 — bloco de códigos 11001 a 11099.
  Todas as tarefas ficam [pendente] e sem início automático: só depois de a
  spec ser revisada, as perguntas respondidas e um plano aprovado. Execução
  sequencial, na pasta principal, sem worktrees nem executor paralelo (README
  do #103). Em "Arquivos" só caminhos que já existem; os arquivos novos estão
  em "A criar". Nenhuma tarefa depende de card "A decidir" (P-107).
  Dependências de outros cards: #104 (peças Gaveta, AvisoFlutuante,
  BarraInferior), #105 (altura da barra inferior, evento de abrir), #108
  (espaço da coluna em TelaDoCatalogo.tsx; fila #108 → #109 → #110).
  Proposta técnica em design.md.
-->

## T-11001 — Coluna lateral da sacola no computador [pendente]

- Refs: US-11001, AC-11001, AC-11002, AC-11003, AC-11028, AC-11030
- Arquivos: apps/web/src/features/carrinho/CarrinhoFlutuante.tsx, apps/web/src/features/carrinho/GavetaCarrinho.tsx, apps/web/src/app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx, packages/ui/styles/fechamento.css
- A criar: apps/web/src/features/carrinho/ColunaDaSacola.tsx, apps/web/tests/sacola-lateral.onp.test.tsx
- Notas: região não modal (`aside` com título "Sua sacola"), no espaço que o
  #108 reserva; vazia, libera a coluna aos produtos. Não chama o preparo do
  fechamento ao montar. Depende do #108 (espaço e largura) e da Q-11001 (se a
  resposta for gaveta lateral, a coluna vira modal). Entra em `TelaDoCatalogo`
  só na vez do #110 na fila.

## T-11002 — Barra fixa no celular e no tablet [pendente]

- Refs: US-11002, AC-11004, AC-11005, AC-11024, AC-11030
- Arquivos: apps/web/src/features/carrinho/SacolaFlutuante.tsx, apps/web/src/features/carrinho/posicao-da-sacola.ts, apps/web/src/features/carrinho/CarrinhoFlutuante.tsx, packages/ui/styles/fechamento.css
- A criar: apps/web/src/features/carrinho/BarraDaSacola.tsx, apps/web/tests/sacola-barra.onp.test.tsx
- Notas: contagem, subtotal e "Ver sacola"; área segura; uma barra fixa por
  vez (substitui a inferior do #105); na página do produto convive com a barra
  de adicionar do #109 (`acimaDaAcao`). Se a Q-11003 escolher a barra, apagar
  a posição guardada (`CHAVE_DA_POSICAO`) e aposentar só o teste de arraste de
  `apps/web/tests/sacola-e-banners.test.tsx`. Abre o diálogo modal (AC-11024),
  pela `Gaveta` do #104 ou pelo `<dialog>` atual. Depende de #104 e #105.

## T-11003 — Confirmação ao adicionar e pedido de abrir a sacola [pendente]

- Refs: US-11002, AC-11006, AC-11024, AC-11029
- Arquivos: apps/web/src/features/carrinho/CarrinhoFlutuante.tsx, apps/web/src/lib/carrinho-do-navegador.ts
- A criar: apps/web/tests/sacola-abrir.onp.test.tsx
- Notas: contagem e total mudam na hora; confirmação anunciada em região
  `aria-live="polite"` sem mover o foco (aviso flutuante só se a Q-11013
  disser). Evento `sc:abrir-sacola` ao lado de `AVISO_DE_CARRINHO_MUDOU`,
  ouvido pelo `CarrinhoFlutuante`: coluna visível recebe o foco no título,
  senão abre o diálogo; sacola vazia avisa. `lib/carrinho-do-navegador.ts` não
  tem dono na matriz do #103: pedir ao gerente (design, seção 9).

## T-11004 — Linha da sacola e edição de itens [pendente]

- Refs: US-11003, AC-11007, AC-11008, AC-11009
- Arquivos: apps/web/src/features/carrinho/LinhaCarrinho.tsx, apps/web/src/features/carrinho/atacado-na-linha.ts, apps/web/src/features/carrinho/useCarrinho.ts, packages/ui/styles/fechamento.css
- A criar: apps/web/tests/sacola-linha.onp.test.tsx
- Notas: visual do Stitch; valores sempre do servidor; falha reverte a
  quantidade e oferece tentar de novo. Consome sem alterar `lib/produto.ts` e
  `lib/atacado-na-vitrine.ts` (donos: #109). O formato do item do carrinho
  não muda; se mudar, avisar o #109 antes. Alvo de toque conforme a Q-11012.

## T-11005 — Receber e pagar no fechamento [pendente]

- Refs: US-11004, AC-11010, AC-11011, AC-11012, AC-11013
- Arquivos: apps/web/src/features/checkout/FechamentoDaCompra.tsx, apps/web/src/features/checkout/SeletorDeEndereco.tsx, apps/web/src/features/checkout/CamposDeEndereco.tsx, apps/web/src/features/checkout/SeletorDePagamento.tsx, apps/web/src/features/checkout/CaixaPix.tsx, packages/ui/styles/fechamento.css
- A criar: apps/web/tests/fechamento-receber-pagar.onp.test.tsx
- Notas: reorganiza visualmente (design, seção 6) sem mudar as regras: só as
  formas da loja, PIX copiável, troco, erros 422 no campo certo. Sem campo de
  cupom, sem parcelamento (AC-11023). Depende da Q-11004 (janela ou coluna).

## T-11006 — Resumo, revalidação e pedido sem duplicação [pendente]

- Refs: US-11005, AC-11014, AC-11015, AC-11016, AC-11017, AC-11018, AC-11019
- Arquivos: apps/web/src/features/checkout/FechamentoDaCompra.tsx, apps/web/src/features/checkout/ResumoDoPedido.tsx, apps/web/src/features/checkout/AvisoDeMudanca.tsx, apps/web/src/lib/carrinho-do-navegador.ts
- A criar: apps/web/tests/fechamento-total-idempotencia.onp.test.tsx
- Notas: total com taxa é "estimativa" até o pedido ser criado; o envio sempre
  leva subtotal e total vistos; chave por `crypto.randomUUID()`, nova depois
  do sucesso, da troca de conta ou de loja, nunca em storage, URL ou log. Sem
  mudança de API: taxa divergente (Q-11007) e "pedido já criado" (Q-11008)
  ficam para card de API. Refaz o teste de duplo toque no estilo de
  `apps/api/tests/pedido-idempotente.test.ts`, no lado do cliente.

## T-11007 — Conta, loja fechada e pedido criado [pendente]

- Refs: US-11005, AC-11020, AC-11021, AC-11022
- Arquivos: apps/web/src/features/checkout/PassoDoFechamento.tsx, apps/web/src/features/checkout/EnvioWhatsApp.tsx, apps/web/src/features/checkout/FechamentoDaCompra.tsx, apps/web/src/server/conta-do-fechamento.ts
- A criar: apps/web/tests/fechamento-conta-loja.onp.test.tsx
- Notas: 401 abre a janela de acesso e, depois, dados pessoais e chave vêm da
  conta nova; loja fechada mostra quando abre e guarda a sacola; pedido criado
  mostra os valores gravados e esvazia barra e coluna. `conta-do-fechamento.ts`
  não tem dono na matriz do #103: pedir ao gerente. Sacola que acompanha o
  aparelho compartilhado fica na Q-11011.

## T-11008 — Rotas, privacidade e nada de "A decidir" [pendente]

- Refs: US-11006, AC-11023, AC-11025, AC-11026, AC-11027
- Arquivos: apps/web/src/app/(loja)/loja/[slug]/checkout/acoes.ts, apps/web/src/server/fechamento.ts, apps/web/src/features/carrinho/CarrinhoFlutuante.tsx, apps/web/src/features/checkout/FechamentoDaCompra.tsx
- A criar: apps/web/tests/sacola-privacidade.onp.test.tsx
- Notas: `/carrinho` e `/checkout` continuam abrindo a sacola e o fechamento,
  inclusive o link sem script; sacola e conta só pelo navegador com
  `no-store`; a coluna nasce vazia no servidor; registros sem dados pessoais;
  busca no DOM por cupom, desconto, parcela, previsão e "compra segura"
  retorna nada. `acoes.ts` só roda no toque em "Fechar pedido" (AC-11002).

## T-11009 — Remover as classes antigas de vitrine.css [pendente]

- Refs: US-11001, US-11002, AC-11004
- Arquivos: packages/ui/styles/vitrine.css
- Notas: BLOQUEADA. `vitrine.css` tem a fila #107 → #108 → #111 e o #110 não
  está nela. Só começa depois de o gerente incluir o #110 na fila, ou de o #108
  ou o #111 removerem `.sc-sacola*` e `.sc-carrinho-janela*`. Antes, conferir
  que nenhum componente ainda usa as classes antigas. Não faz parte do caminho
  crítico das outras tarefas.
