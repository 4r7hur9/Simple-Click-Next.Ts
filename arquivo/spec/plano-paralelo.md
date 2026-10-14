# Plano paralelo para o Codex — 26/09/2026

Base: `main` em `9dbd2f6` (T-603). Auditoria rodada agora: **148 de 284 critérios
de aceite provados**.

## Onde paramos

| Feature                                                        | Situação real                                                                                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| fundação, acesso, identidade visual, landing, checkout         | fechadas (só precisam de `verify` de novo, a prova envelheceu)                                                                     |
| vitrine-publica                                                | só falta a T-410 (página Sobre): o código foi commitado, faltam os testes de AC-421..423 e o e2e                                   |
| catalogo-produtos                                              | T-300..T-312 têm uma "primeira fatia" commitada, mas **0 de 38 provados**: 17 têm teste, 21 nem têm teste. T-313 (e2e) não começou |
| pedido-operacao                                                | T-600..T-603 com fatia commitada, **0 de 27 provados**. T-604..T-611 (histórico, cupom, impressão, agente) não começaram           |
| config-loja                                                    | 9 de 24 provados. T-902, T-905 e T-908 não começaram                                                                               |
| clientes-loja, dashboard-metricas, admin-lojas, cardapio-na-tv | não começaram                                                                                                                      |

Achados da auditoria que entram na faixa de dívidas (F7):

- **Segredo no código (P-002)** acusado 5 vezes em testes de autenticação:
  `convite.usecase.test.ts:79,85`, `login.usecase.test.ts:36,60`, `register.usecase.test.ts:15`.
- **Colisão de códigos**: `infra/tests/portao.test.ts` usa `AC-901` e `AC-902` como exemplo
  inventado — hoje esses códigos são critérios reais da config-loja, e o motor pensa que eles têm teste.
- **Testes da carga de exemplo invisíveis**: `packages/database/seed/seed.test.ts` tem `@spec:AC-004/036/037/039`,
  mas o audit diz que não existem (a varredura de testes do motor não olha essa pasta).
- Arquivos mapeados que não existem em tarefas concluídas: `apps/web/src/app/loading.tsx` (T-019) e
  `apps/api/src/modules/cart/sessao-do-carrinho.ts` (T-511).
- 24 arquivos de código que nenhuma tarefa mapeia (rotas do catálogo e do painel de pedidos) — cada faixa
  mapeia os seus.
- O commit `7987aef` (T-314) foi enviado sem passar pelo portão.

---

## Regras para TODAS as faixas (cole junto com cada prompt)

```text
REGRAS DA FAIXA (inegociáveis):
1. Trabalhe SÓ na sua worktree/branch. Não mexa em tarefas de outra faixa.
2. Um critério de aceite só existe com teste anotado "@spec:AC-xxx" no título. Skip/todo não é prova.
   Nunca enfraqueça, pule ou apague teste para passar.
3. 1 tarefa = 1 commit: "T-xxx <feature>: <título curto>".
4. Marque [concluida] no tasks.md da SUA feature só depois de
   `node C:/Users/arthu/.claude/skills/onp-spec-driven/scripts/onp-spec.mjs verify <feature>`
   dar PASS nos critérios daquela tarefa. Se o tasks.md mapeia arquivo que você não criou, ajuste
   o campo "Arquivos:" para o arquivo real (e mapeie os arquivos novos que você criou).
5. NÃO edite .spec/verification/sinais.json à mão (é regenerado; no conflito, aceite qualquer lado).
6. Arquivos compartilhados — só ACRESCENTE linhas, nunca reordene nem reescreva:
   apps/api/src/app.ts, packages/core/src/index.ts, packages/contracts/src/index.ts,
   packages/database/prisma/schema.prisma, vitest.config.ts, e2e/fixtures.
7. Migração nova: use SÓ o número reservado para sua faixa (tabela abaixo). Migração escrita à mão,
   com isolamento por linha (RLS) e compatível com a versão anterior. Confira packages/database/seed/.
8. Antes de terminar: `pnpm prettier --write .` -> `bash infra/scripts/provar.sh` -> testes da sua feature.
   NÃO rode o portão completo (verificar.sh) em paralelo com outras faixas — ele roda uma vez, no merge.
9. Ao final, escreva um resumo: tarefas concluídas, critérios provados, o que ficou pendente e por quê.
```

### Números de migração reservados

| Faixa                             | Migração           |
| --------------------------------- | ------------------ |
| F1 catálogo-estrutura             | `0026_*`           |
| F2 catálogo-preço                 | `0027_*`           |
| F3 catálogo-estoque               | `0028_*`           |
| F4 operação                       | `0029_*`           |
| F5 cupom                          | `0030_*`           |
| F6 config-loja                    | `0031_*`           |
| F8 admin-lojas                    | `0032_*`, `0033_*` |
| Onda 2 (fila de impressão, T-607) | `0034_*`           |

Faixa que não precisar da migração simplesmente não a cria. Se o aplicador reclamar de buraco na
numeração, o merge renumera (nada foi publicado ainda).

### Como abrir cada faixa

```bash
# na raiz do repo, uma vez por faixa (exemplo F1):
git worktree add ../sc-F1 -b faixa/F1-catalogo-estrutura main
cd ../sc-F1 && pnpm install
```

---

## ONDA 1 — tudo em paralelo agora

Ordem de prioridade (se não der para abrir todas, abra de cima para baixo). **Recomendo no máximo
4–5 Codex rodando testes ao mesmo tempo**: o Docker tem 8 GB e todas as worktrees dividem o mesmo
`postgres-test` e o mesmo Redis (dívidas 4 e 9 de `docs/pendencias.md`).

### F1 — Catálogo: estrutura (categorias, especificações, produto, imagens, filtro)

Feature `catalogo-produtos` · tarefas **T-300, T-301, T-302, T-303, T-310, T-312** · esforço alto

```text
Feature catalogo-produtos, tarefas T-300, T-301, T-302, T-303, T-310, T-312.
Leia .spec/features/catalogo-produtos/spec.md e tasks.md.
Estado: todas têm uma "primeira fatia" já commitada (veja git log) mas NENHUM critério está provado.
Objetivo: fechar as tarefas com prova.
- AC-300, AC-301, AC-302, AC-303 (categorias) NÃO têm teste: escreva os testes e complete o que faltar
  (apagar categoria com produtos exige escolher destino).
- AC-304..AC-308, AC-325..AC-330 JÁ têm teste: rode verify, corrija o que falhar.
- Mapeie nas tarefas os arquivos órfãos que são seus: imagens.routes.ts, painel/produtos/novo/page.tsx,
  api/catalogo/produtos/route.ts, [produtoId]/route.ts, [produtoId]/duplicar/route.ts,
  [produtoId]/imagens/**, features/painel-catalogo/ListaProdutos.tsx.
Não toque em preço, opções, variações, estoque, vertical/ramo, disponibilidade (são das faixas F2 e F3).
```

### F2 — Catálogo: preço, escolhas, variações e ramo

Feature `catalogo-produtos` · tarefas **T-304, T-305, T-306, T-309** · esforço alto

```text
Feature catalogo-produtos, tarefas T-304, T-305, T-306, T-309.
Estado: fatia commitada, sem prova. Critérios sem teste: AC-309..AC-317, AC-320, AC-323.
AC-318, AC-319, AC-324 já têm teste: rode verify e corrija.
- T-304 mapeia packages/core/src/dinheiro.ts, preco-aplicavel.ts e precos.usecase.ts que NÃO existem:
  encontre onde a regra de preço mora hoje (git show f994c2b) e decida — crie os arquivos da tarefa
  movendo a regra para eles, OU corrija o "Arquivos:" para o lugar real. Valor sempre em centavos
  inteiros (P-005/P-006). Preço enviado pelo cliente é ignorado (AC-312).
- T-305 mapeia grupos-opcao.usecase.ts e packages/core/src/validar-escolhas.ts que não existem: mesmo tratamento.
- AC-323: só o administrador geral muda o tipo de negócio.
- Mapeie os órfãos: precos.routes.ts, api/catalogo/produtos/[produtoId]/precos/**, [produtoId]/opcoes/**.
Não toque em estoque/disponibilidade (F3) nem em categorias/especificações (F1).
```

### F3 — Catálogo: estoque e disponibilidade

Feature `catalogo-produtos` · tarefas **T-307, T-308, T-311** · esforço xalto

```text
Feature catalogo-produtos, tarefas T-307, T-308, T-311.
Critérios sem teste: AC-331, AC-332, AC-334, AC-335, AC-336, AC-337. Com teste sem prova: AC-321, AC-322, AC-333.
- AC-333 (duas compras simultâneas da última peça) precisa de prova de concorrência real no banco
  (apps/api/tests/estoque-concorrente.test.ts).
- AC-334 (pedido cancelado devolve o estoque): NÃO edite apps/api/src/modules/orders/mudar-status.usecase.ts
  (é da faixa F4). Faça a devolução no banco (gatilho/função na sua migração 0028, disparado pela mudança
  de status para cancelado/recusado) ou exponha uma função e registre no resumo que a ligação fica para o merge.
- AC-337: loja de comida não é obrigada a controlar estoque.
Não toque em preço/opções (F2) nem categorias (F1).
```

### F4 — Operação do pedido: fila, status, WhatsApp, acompanhamento, histórico

Feature `pedido-operacao` · tarefas **T-600, T-601, T-602, T-603, T-604** · esforço alto

```text
Feature pedido-operacao, tarefas T-600..T-604.
Estado: T-600..T-603 têm fatia commitada, NENHUM critério provado. T-604 não começou.
- AC-600..AC-611 e AC-615 já têm teste: rode verify pedido-operacao e corrija o que falhar.
- Sem teste: AC-612, AC-613 (página de acompanhamento atualiza sozinha), AC-614 (link não pode ser
  adivinhado — crie apps/api/tests/acompanhamento-nao-enumeravel.test.ts), AC-616 (T-604 inteira:
  histórico do cliente logado em todas as lojas, sem uma loja ver a outra).
- Mapeie os órfãos: orders/fila.routes.ts, api/painel/pedidos/**, painel-pedidos/DetalheDoPedido.tsx,
  pedido/AcompanhamentoDoPedido.tsx, lib/acompanhamento.ts, contracts/src/acompanhamento.ts,
  migrations/0025_confirmacao_whatsapp.sql.
Não toque em cupom/impressão (T-605+) nem em estoque (F3).
```

### F5 — Cupom: uma fonte, duas saídas

Feature `pedido-operacao` · tarefas **T-605 → T-606** · esforço max

```text
Feature pedido-operacao, tarefas T-605 e depois T-606. Nada foi feito ainda.
- T-605: gerador único de blocos do cupom em packages/core (cupom-blocos.ts, cupom-largura.ts),
  parametrizado pela largura do papel (a configuração de impressão já existe: T-906, veja
  apps/api/src/modules/stores/impressao-config*). Acento correto (tabela de caracteres) e alinhamento
  com texto normalizado. AC-619, AC-620, AC-621 (segunda via).
- T-606: página /imprimir/[id] sem o layout do app, largura do papel respeitada. AC-617, AC-618.
O formato dos blocos é CONTRATO: a fila e o agente de impressão (onda 2) vão consumi-lo.
Documente o formato no topo de cupom-blocos.ts.
Não edite o tasks.md de T-600..T-604 (faixa F4) — só as linhas de T-605 e T-606.
```

### F6 — Configurações da loja

Feature `config-loja` · tarefas **T-900, T-901, T-902, T-904, T-905, T-906, T-907** · esforço alto

```text
Feature config-loja, tarefas T-900, T-901, T-902, T-904, T-905, T-906, T-907.
Estado: T-900, T-901, T-904, T-906, T-907 têm fatia commitada. T-902 e T-905 não começaram.
- Sem teste: AC-900, AC-903 (trocar a chave PIX não altera pedido feito), AC-905, AC-914, AC-915,
  AC-916, AC-917 (cor escolhida não deixa texto ilegível — contraste), AC-918, AC-921, AC-922
  (toda alteração auditada), AC-923 (gravação atômica).
- AC-919, AC-920 têm teste: rode verify e corrija.
- AC-901 e AC-902: o motor acha que têm teste porque infra/tests/portao.test.ts usa esses códigos
  como exemplo — é a faixa F7 que corrige isso. Escreva os testes REAIS de AC-901/AC-902 mesmo assim.
- T-900 mapeia configuracoes.usecase.ts, configuracoes.schema.ts e contracts/src/store-settings.ts,
  que não existem: crie-os ou corrija o mapeamento para onde a lógica mora hoje.
Não toque em horários (T-903, concluída) nem no checkout além do necessário para AC-900/905/914.
```

### F7 — Dívidas do portão + página Sobre

Features `vitrine-publica` (T-410) e manutenção · esforço médio

```text
Faixa de dívidas. Faça nesta ordem, um commit por item:
1. T-410 vitrine-publica (página Sobre, já commitada): escreva os testes de AC-421, AC-422, AC-423
   e o e2e e2e/specs/sobre-da-loja.spec.ts. Verify vitrine-publica e marque [concluida].
2. P-002: o audit acusa segredo em código em apps/api/src/modules/auth/convite.usecase.test.ts:79,85,
   login.usecase.test.ts:36,60, register.usecase.test.ts:15. São senhas de teste literais: troque por
   valor montado em tempo de execução ou constante de apoio de teste que não case com o padrão.
   NÃO altere o princípio na constituição.
3. infra/tests/portao.test.ts usa AC-901/AC-902 como códigos de exemplo — hoje são critérios reais da
   config-loja. Troque por códigos que nunca existirão (ex.: AC-99901) para parar o falso "tem teste".
4. packages/database/seed/seed.test.ts tem @spec:AC-004/036/037/039 mas o audit não enxerga:
   descubra por que (config do motor: onpspec.config.json / globs de teste) e corrija a config, não o teste.
5. fundacao T-019 mapeia apps/web/src/app/loading.tsx e pedido-checkout T-511 mapeia
   apps/api/src/modules/cart/sessao-do-carrinho.ts — nenhum existe. Corrija o mapeamento para o arquivo real.
6. Ao final: verify em fundacao, identidade-acesso, identidade-visual-global, landing-plataforma,
   pedido-checkout e vitrine-publica (as provas envelheceram).
```

### F8 — Administração de lojas (feature nova, independente)

Feature `admin-lojas` · tarefas **T-200 → T-208** (T-209 fica para a onda 2) · esforço alto

```text
Feature admin-lojas, tarefas T-200 a T-208, em ordem. Nada foi feito.
A identidade e os papéis (feature identidade-acesso) estão prontos — o administrador geral já existe.
Leia .spec/features/admin-lojas/spec.md e tasks.md. Migrações: só 0032 e 0033.
Cada ação administrativa é auditada (audit_log). Não toque em catálogo nem pedidos.
```

### F9 — Cardápio na TV (feature nova, independente)

Feature `cardapio-na-tv` · tarefas **T-950, T-951, T-952, T-954** (T-953 é o e2e, onda 2) · esforço médio

```text
Feature cardapio-na-tv, tarefas T-950, T-951, T-952, T-954. Nada foi feito.
Consome o catálogo público da vitrine (vitrine-publica, pronta). Só leitura: sem migração.
Siga a skill design-de-front do projeto para tela. Não toque em arquivos da vitrine além de importar deles.
```

---

## Merge da onda 1 (eu faço, ou você me chama)

Ordem que minimiza conflito: **F7 → F6 → F1 → F2 → F3 → F4 → F5 → F8 → F9**.
Depois de cada merge: `pnpm install` se mudou lock, rodar os testes da feature. No fim:
`pnpm prettier --write .` → `bash infra/scripts/provar.sh` → `bash infra/scripts/verificar.sh` →
`onp-spec audit --ci`.

## ONDA 2 — depende da onda 1

| Faixa                         | Tarefas                                       | Depende de                                                    |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| G1 e2e catálogo               | T-313                                         | F1, F2, F3                                                    |
| G2 e2e config                 | T-908                                         | F6                                                            |
| G3 fila de impressão + agente | T-607 → T-608 → T-609 → T-610 (migração 0034) | F5 (formato dos blocos)                                       |
| G4 clientes da loja           | T-700 → T-707                                 | F4 (pedidos e status)                                         |
| G5 painel de métricas         | T-800 → T-808                                 | F4 (status/faturamento, fora do faturamento o não confirmado) |
| G6 e2e admin + TV             | T-209, T-953                                  | F8, F9                                                        |

## ONDA 3 — fechamento

T-611 (e2e operação), T-708 (e2e clientes), T-809 (e2e métricas), portão completo e
`onp-spec audit --ci` saindo 0.
