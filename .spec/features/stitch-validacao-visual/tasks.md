# Tasks: Validação visual, acessibilidade e regressão do redesign

> feature: stitch-validacao-visual

<!--
  Card #114 — bloco de códigos 11401 a 11499.
  Todas as tarefas ficam [pendente]: esta fase é só de especificação e
  nenhuma tem autorização de implementação nem início automático. Cada uma
  depende da implementação aprovada das telas dos cards #104–#111 e roda uma
  após a outra, na pasta principal, sem worktree (design.md, seção 9).
  Refs só com códigos deste card e de specs que já existem (#104); os
  critérios de #105–#111 entram na matriz do design.md quando as specs deles
  existirem. "Arquivos" traz só caminhos que já existem (a pasta onde o
  arquivo novo nasce); os arquivos novos ficam em "A criar", que o motor
  ignora (convenção do #115). Nenhum pertence a outro card.
-->

## T-11401 — Estratégia e matriz cruzada de validação [pendente]

- Refs: US-11401, US-11402, US-11403, US-11404, US-11405, US-11406, AC-11420
- Arquivos: .spec/features/stitch-validacao-visual/design.md
- Notas: ferramentas e nível de prova, larguras, rubrica, matriz com #104
  presente e #105–#111 aguardando. A cada spec nova de #105–#111, a linha do
  card vira tabela própria (design.md, seção 4).

## T-11402 — Capturas por tela, largura e tema [pendente]

- Refs: US-11401, AC-11401, AC-11403
- Arquivos: e2e/specs/, e2e/fixtures/
- A criar: e2e/specs/capturas-redesign.onp.spec.ts, e2e/fixtures/telas-do-redesign.ts
- Notas: lista de telas e lojas (Q-11403) num só arquivo de fixture; larguras
  da Q-11401; temas da Q-11404; `document.fonts.ready` e movimento reduzido
  antes de capturar; capturas no local da Q-11408. Sem baseline de pixels
  até a Q-11402.

## T-11403 — Manifesto de diferenças e teste da forma [pendente]

- Refs: US-11401, AC-11402
- Arquivos: e2e/fixtures/, apps/web/tests/
- A criar: e2e/fixtures/diferencas-do-redesign.ts, apps/web/tests/diferencas-do-redesign.onp.test.ts
- Notas: o teste confere classe válida, motivo com código existente e
  pendente apontando pergunta aberta; não afirma completude (essa é a
  revisão do dono, AC-11403).

## T-11404 — Jornada de compra ponta a ponta [pendente]

- Refs: US-11402, AC-11404, AC-11405, AC-11406, AC-11407
- Arquivos: e2e/specs/
- A criar: e2e/specs/jornada-de-compra.onp.spec.ts
- Notas: reusa `e2e/fixtures/loja-de-teste.ts` sem alterar o que outros
  cenários usam; se faltar variação ou atacado na loja de teste, pedir ao
  gerente antes de mudar a fixture compartilhada. Valores esperados fixos
  (ASM-11406).

## T-11405 — Rede de regressão dos testes antigos [pendente]

- Refs: US-11402, AC-11408
- Arquivos: .spec/features/stitch-validacao-visual/design.md
- Notas: rodar a lista da seção 5 do design.md a cada onda e guardar o
  relatório com a contagem de pulados. Ajuste de seletor é dos cards donos
  das telas; asserção nunca é relaxada.

## T-11406 — Acessibilidade e larguras por tela [pendente]

- Refs: US-11403, AC-11409, AC-11415, AC-10419
- Arquivos: e2e/specs/, apps/web/tests/
- A criar: e2e/specs/acessibilidade-redesign.onp.spec.ts, apps/web/tests/acessibilidade-redesign.onp.test.tsx
- Notas: axe com regras mínimas (design.md, seção 6) no navegador e, no
  jsdom, papéis e nomes das telas. Inclui a página `/ui` do #104 se ele
  aceitar (ASM-11407); se não, o #104 mantém o próprio e2e e esta tarefa
  tira a referência ao AC-10419.

## T-11407 — Teclado e foco na jornada [pendente]

- Refs: US-11403, AC-11410, AC-10412
- Arquivos: e2e/specs/
- A criar: e2e/specs/teclado-redesign.onp.spec.ts
- Notas: sacola lateral e janela do produto prendem e devolvem o foco no
  navegador; depende da Q-10408 do #104 (diálogo modal de verdade).

## T-11408 — Contraste das lojas e alvos de toque [pendente]

- Refs: US-11403, AC-11411, AC-11412, AC-10416
- Arquivos: apps/web/tests/, e2e/specs/
- A criar: apps/web/tests/contraste-das-lojas.onp.test.ts, e2e/specs/toque-redesign.onp.spec.ts
- Notas: cores reais das lojas de exemplo com `relacaoDeContraste`; não
  repetir os pares de tokens do #104. Mínimo de toque da Q-10405. Marca
  `@principle:P-106` só como rastreabilidade.

## T-11409 — Movimento reduzido e área segura das barras [pendente]

- Refs: US-11403, AC-11413, AC-11414, AC-10414
- Arquivos: apps/web/tests/
- A criar: apps/web/tests/movimento-e-area-segura.onp.test.ts
- Notas: declaração no CSS das telas (exceto a barra inferior, que é do
  #104); prova manual no simulador de iPhone conforme a Q-11409, registrada
  no pacote de evidências.

## T-11410 — Estados vazio, erro, carregamento e imagens [pendente]

- Refs: US-11404, AC-11416, AC-11417
- Arquivos: e2e/specs/, e2e/fixtures/
- A criar: e2e/specs/estados-redesign.onp.spec.ts, e2e/fixtures/estados-do-redesign.ts
- Notas: falhas e atrasos simulados com `page.route`; substituto de foto
  pelas capas padrão por ramo; deslocamento de layout por
  `PerformanceObserver`.

## T-11411 — Catálogo grande [pendente]

- Refs: US-11405, AC-11418, AC-11419
- Arquivos: e2e/fixtures/, e2e/specs/
- A criar: e2e/fixtures/catalogo-grande.ts, e2e/specs/catalogo-grande.onp.spec.ts
- Notas: loja dedicada `e2e-catalogo-grande`, criada e limpa pela fixture;
  N da Q-11407; 5 repetições, mediana; nunca a loja de teste compartilhada.

## T-11412 — Auditoria da onda e dados do Stitch [pendente]

- Refs: US-11406, AC-11420, AC-11421
- Arquivos: apps/web/tests/
- A criar: apps/web/tests/dados-do-stitch.onp.test.ts
- Notas: busca dos dados do export no texto das telas e nos arquivos de
  conteúdo das telas; `onp-spec verify` e `audit` da feature; matriz do
  design.md atualizada com provado, pendente ou sem prova.
