# Tasks: Vitrine da loja (redesign Stitch)

> feature: stitch-vitrine-loja

<!--
  Card #107 — bloco de códigos 10701 a 10799.
  Tudo [pendente], sem auto_start e sem plano de execução aprovado. A
  execução futura é UMA tarefa após a outra, na pasta principal, na ordem
  abaixo (arquivos compartilhados: TelaDaLoja.tsx, ApresentacaoDaLoja.tsx,
  narrativa.css). Nenhuma tarefa depende de função "A decidir" (P-107).
  "Arquivos" lista só caminhos que já existem; os novos estão em "A criar".
  Antes de editar narrativa.css, sobre.css, selo-de-status.css ou feed.css,
  confirmar a posse no board (Q-10710). O código AC-10716 ficou sem uso de
  propósito (teclado é do #114).
-->

## T-10701 — Extrair a composição síncrona da página [pendente]

- Refs: US-10705, US-10706, AC-10718
- Arquivos: apps/web/src/app/(loja)/loja/[slug]/TelaDaLoja.tsx
- A criar: apps/web/src/features/loja/PerfilDaLoja.tsx, apps/web/tests/vitrine-loja-perfil.onp.test.tsx
- Notas: `TelaDaLoja` continua buscando os dados (vitrine, fechamento,
  resumo, usuário, favoritas) e passa tudo pronto ao `PerfilDaLoja`, síncrono
  e testável com `renderToStaticMarkup`. Sem mudança visual. O fechamento
  entra só como `RecebimentoDaLoja` (sem a chave PIX) e a guarda por leitura
  do fonte em `sobre-da-loja.test.tsx` continua passando. A rota pública, o
  `/sobre` e a prévia continuam usando a mesma tela.

## T-10702 — Identidade e situação da loja [pendente]

- Refs: US-10701, US-10702, AC-10701, AC-10702, AC-10703, AC-10704, AC-10705, AC-10706, AC-10707
- Arquivos: apps/web/src/features/loja/ApresentacaoDaLoja.tsx, packages/ui/styles/narrativa.css, apps/web/src/features/vitrine/SeloDeStatus.tsx
- A criar: apps/web/tests/vitrine-loja-identidade.onp.test.tsx, apps/web/tests/vitrine-loja-situacao.onp.test.tsx
- Notas: recompor capa, logo ou iniciais, nome e selo no desenho do Stitch,
  com a cor e as fotos da própria loja. Mantém "Fechada agora", a próxima
  abertura, "horário não informado" e a explicação da exceção; fechada não
  afirma atendimento imediato. O `SeloDeStatus` só é tocado se o contraste
  pedir (ele é do design system do selo). Os testes antigos
  `apresentacao-da-loja.test.tsx` e `selo-de-status.test.tsx` seguem
  valendo.

## T-10703 — Condições de compra e contato [pendente]

- Refs: US-10703, AC-10708, AC-10709, AC-10710, AC-10711, AC-10720
- Arquivos: apps/web/src/features/loja/ApresentacaoDaLoja.tsx, apps/web/src/features/loja/EntradaDaLoja.tsx, apps/web/src/features/loja/sobre/formatos.ts, packages/ui/styles/narrativa.css, apps/web/tests/apresentacao-da-loja.test.tsx
- A criar: apps/web/src/features/loja/CondicoesDaLoja.tsx, apps/web/tests/vitrine-loja-condicoes.onp.test.tsx
- Notas: cartões de entrega e retirada, endereço e pagamento só com dado; o
  pagamento vem de `RecebimentoDaLoja`. O contato por WhatsApp só com
  `whatsappPublico`, texto genérico. Reusa `enderecoNoMapa` e
  `numeroDoWhatsApp` sem alterá-los. Sempre há um link para `/sobre`
  (hoje ele some sem entrega e sem endereço). O lugar do mapa e do WhatsApp
  depende das perguntas Q-10706 e Q-10708. Os blocos novos ficam dentro de
  `[data-narrativa="apresentacao"]` ou a `EntradaDaLoja` é ajustada na mesma
  tarefa. O teste antigo `apresentacao-da-loja.test.tsx` procura
  `.sc-loja__detalhes`: ajuste só com a equivalência declarada (ASM-10707).

## T-10704 — Destaques da loja na vitrine [pendente]

- Refs: US-10704, AC-10712, AC-10713
- Arquivos: apps/web/src/app/(loja)/loja/[slug]/TelaDaLoja.tsx, packages/ui/styles/narrativa.css
- A criar: apps/web/tests/vitrine-loja-destaques.onp.test.tsx
- Notas: o `PerfilDaLoja` (criado na T-10701) recebe o bloco. Reusa `Destaques` (apps/web/src/features/vitrine/Destaques.tsx) e a
  conversão `prepararProduto` (apps/web/src/server/catalogo-na-tela.ts) **sem
  editá-los**: os dois são do #108. Como as classes dos destaques estão em
  `vitrine.css`, que não carrega na página pública, combinar com o #108 antes
  (estilo próprio em `narrativa.css` ou importar a folha). A regra por ramo
  só entra depois da resposta da Q-10703; até lá, a tarefa não começa.
  Botão do catálogo: link real com o rótulo do ramo (a contagem de itens só
  se a Q-10704 disser sim).

## T-10705 — Publicações e Sobre na nova composição [pendente]

- Refs: US-10705, AC-10714, AC-10715, AC-10721
- Arquivos: apps/web/src/features/loja/SobreDaLoja.tsx, apps/web/src/features/loja/sobre/JanelaDoSobre.tsx, packages/ui/styles/sobre.css, apps/web/src/features/feed/feed.css, apps/web/tests/sobre-da-loja.test.tsx
- A criar: apps/web/tests/vitrine-loja-publicacoes.onp.test.tsx
- Notas: o `PerfilDaLoja` (criado na T-10701) recebe o bloco. **Bloqueada pelas perguntas Q-10701 e Q-10702** (abas ou seções;
  Sobre como janela, aba ou seção). O que for escolhido não pode esconder
  conteúdo sem JavaScript nem criar um endereço que dispute com o `/sobre`.
  As regras novas em `feed.css` ficam sob `.sc-pagina-da-loja`, sem mudar o
  /explorar (o arquivo é do #106 e o teste do feed não muda). `PostsDaLoja`
  só é reusada.

## T-10706 — Guardas de conteúdo, prévia e favoritar [pendente]

- Refs: US-10705, US-10706, AC-10717, AC-10718, AC-10719
- Arquivos: apps/web/tests/previa-da-loja.test.tsx, apps/web/src/app/(loja)/loja/[slug]/previa/[parte]/page.tsx
- A criar: apps/web/tests/vitrine-loja-guardas.onp.test.tsx
- Notas: só teste, sem editar a prévia. Procura, no HTML da vitrine e no
  fonte, os textos ocultos (nota, avaliações, verificada, mais vendidos,
  parcelas, contador de favoritos, "NF-e inclusa", "compra protegida").
  Confere por leitura do fonte que a prévia e a rota pública usam a mesma
  composição. Favoritar sem contador, quando há publicações. Favoritar
  também sem publicações depende da Q-10709.
