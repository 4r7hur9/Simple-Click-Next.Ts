# Estruturação 3 — Testes e critérios de aceite do checkout

Card #129 · executado em 19/11/2026 · seção 3 do plano (`Simple_Click_Plano_de_Estruturacao.md`).
Parte do inventário em `docs/estruturacao/01-inventario.md` (revisão `69cf0958ae`).

Nenhum código de produção foi alterado. Arquivos mexidos: `packages/core/src/pedido-total.test.ts`
(12 casos novos), `apps/api/tests/checkout-aceite.int.test.ts` (arquivo novo, 12 casos),
`e2e/specs/pedido-manual.spec.ts` (consertado) e este documento.

## 1. Defeito de produção encontrado (NÃO corrigido)

**Duas confirmações simultâneas com a MESMA chave de idempotência: uma delas recebe HTTP 500.**

| Item | Valor |
|---|---|
| Onde | `apps/api/src/modules/orders/criar-pedido.usecase.ts:351` (INSERT do pedido), chamado de `apps/api/src/modules/orders/pedidos.routes.ts:385` |
| Causa | As duas requisições passam por "já existe pedido desta chave?" (`pedidoDaChaveDeFechamento`, `pedidos.routes.ts:~322`) antes de qualquer uma inserir. A que perde a corrida bate em `orders_idempotency_uk` (`packages/database/migrations/0008_pedidos.sql:177`, único por `store_id, idempotency_key`). O erro do Prisma (`P2002`) sobe sem tratamento e vira `500 erro_interno`. |
| Efeito | O banco fica correto (**um** pedido, um carrinho convertido). Mas a segunda resposta é um erro para um pedido que **foi criado**; a regra AC-516 diz que a nova tentativa com a mesma chave devolve o mesmo pedido (`200`, `jaExistia: true`). |
| Menor caso | `apps/api/tests/checkout-aceite.int.test.ts`, teste `@spec:AC-516 DEFEITO: a segunda confirmação simultânea com a mesma chave deveria receber o mesmo pedido, e não 500`. Dois `POST /v1/vitrine/:apelido/pedidos` em `Promise.all`, mesmo cookie de sessão, mesma `chaveDeIdempotencia`, carrinho de 1 item. Reproduziu em todas as execuções feitas (mais de 8, com o arquivo isolado). |
| Como está no repositório | **Atualização (19/11/2026): corrigido no card #134**, o teste virou `it` e passa. Texto original: marcado com `it.fails`: fica verde enquanto o defeito existe e **fica vermelho no dia em que for corrigido** (aí basta trocar `it.fails` por `it`). O teste vizinho (`…o banco guarda UM pedido…`) prova o que já é verdade hoje e passa normalmente. |
| Sugestão (para quem corrigir) | Tratar `P2002` em `orders_idempotency_uk` dentro de `criarPedido` relendo o pedido da chave (a leitura já existe), ou usar `INSERT … ON CONFLICT DO NOTHING RETURNING` e cair no caminho `jaExistia`. Cuidado com a transação já abortada pelo erro do Postgres. |

Por regra do card, não corrigi; o card é reportado como `paused` ao gerente por causa disto.

## 2. Linha de base (antes de mexer em qualquer teste)

Máquina com Postgres de teste na 5533 e Redis no ar. Os arquivos da API foram rodados **isolados**
(`npx vitest run --project api-int <arquivo>`), como pediu o gerente, porque o `test:int` completo já
tinha 40 falhas antes deste card (L-07 a L-10 do inventário: limite 429 entre suítes, origem em
`conta-duas-contas`, Bearer 401 em `rotas-da-conta-segura`, cor em `feed-e-tema`). Não tentei corrigi-las.

| Suíte de partida | Comando | Linha de base |
|---|---|---|
| `packages/core/src/pedido-total.test.ts` | `npx vitest run --project unit packages/core/src/pedido-total.test.ts` | ✅ 20/20 |
| `apps/api/tests/carrinho-convertido.int.test.ts` | `npx vitest run --project api-int …` | ✅ 3/3 |
| `apps/api/tests/pedido-idempotente.test.ts` | idem | ✅ 17/17 |
| `apps/api/tests/carrinho-rota.int.test.ts` (tem a conferência e o fechamento por HTTP) | idem | ✅ 37/37 |
| `e2e/specs/pedido-manual.spec.ts` | `pnpm --filter @simpleclick/e2e exec playwright test specs/pedido-manual.spec.ts` | ❌ 0/2 — o teste estava **desatualizado** depois do redesign (ver 4.6). A falha já constava no inventário (2 falhas). |

## 3. Matriz caso × teste × situação × resultado

Resultados na revisão `69cf0958ae` + as alterações deste card, rodados em 19/11/2026.

| # | Caso de aceite | Teste (arquivo › nome) | Situação | Resultado |
|---|---|---|---|---|
| 1 | **Preço alterado** — 2 marmitas a R$ 20 → R$ 25: o preço da conta é o do catálogo, soma 5.000 | `packages/core/src/pedido-total.test.ts` › `@spec:AC-504 … o preço da conta é o do catálogo, e não o que a tela mostrou` | já existia | ✅ |
| 1 | idem: aumento informado com os dois valores, exige confirmação | `pedido-total.test.ts` › `@spec:AC-503 preço que subiu é avisado com os dois valores` | já existia | ✅ |
| 1 | idem, pela API: o aumento aparece item a item | `apps/api/tests/carrinho-rota.int.test.ts` › `@spec:AC-503 preço que mudou desde a tela é mostrado item a item` | já existia | ✅ |
| 1 | idem, pela API com **2 × R$ 20 → R$ 25**: avisa "de R$ 20,00 para R$ 25,00", `precisaConfirmar`, subtotal **5000** | `apps/api/tests/checkout-aceite.int.test.ts` › `@spec:AC-503 @spec:AC-504 duas marmitas de R$ 20 viram R$ 25: …` | **novo** | ✅ |
| 1 | **L-06**: fechar com o subtotal velho → `409 conflito` (`preco_divergente` no log), **0 pedido, 0 número gasto, carrinho aberto** (conferido no banco); reenvio com 5000 e a mesma chave → **1** pedido de 5.000; terceiro envio → `jaExistia`, ainda 1 | `checkout-aceite.int.test.ts` › `@spec:AC-503 @spec:AC-516 fechar com o subtotal VELHO é 409 preco_divergente …` | **novo** | ✅ |
| 1 | subtotal visto que bate não é recusado | `checkout-aceite.int.test.ts` › `@spec:AC-504 subtotal visto que bate com o do servidor não é recusado` | **novo** | ✅ |
| 2 | **Produto indisponível** — sai da soma, motivo informado (regra pura) | `pedido-total.test.ts` › `@spec:AC-503 item esgotado sai do carrinho e o motivo é dito pelo nome` | já existia | ✅ |
| 2 | idem, pela API (conferência) | `carrinho-rota.int.test.ts` › `@spec:AC-503 produto que ficou indisponível é retirado com explicação` | já existia | ✅ |
| 2 | esgotar **depois** de pôr no carrinho: sai da soma (4000), a conferência diz "Refrigerante lata", e o **pedido gravado tem uma linha só** (conferido em `order_items`) | `checkout-aceite.int.test.ts` › `@spec:AC-503 o esgotado sai da soma, a conferência diz o motivo e o pedido nasce só com o que sobrou` | **novo** | ✅ |
| 2 | tudo esgotado: fechamento `409`, 0 pedido, 0 número gasto | `checkout-aceite.int.test.ts` › `@spec:AC-503 quando tudo no carrinho esgotou, …` | **novo** | ✅ |
| 3 | **Resposta perdida (idempotência)** — mesma chave → mesmo pedido, contagem +1 só uma vez | `apps/api/tests/pedido-idempotente.test.ts` › `@spec:AC-516 a segunda tentativa com a mesma chave devolve o mesmo pedido` (conta `app.orders`: `toBe(1)`) | já existia | ✅ |
| 3 | idem: não gasta número da sequência | `pedido-idempotente.test.ts` › `@spec:AC-516 a segunda tentativa não gasta um número da sequência da loja` | já existia | ✅ |
| 3 | idem, depois da conversão do carrinho: mesmo id, número, token e **mesmos valores (subtotal = total = 2000)** | `apps/api/tests/carrinho-convertido.int.test.ts` › `@spec:AC-516 a mesma chave devolve o mesmo pedido, com os valores e a mensagem do pedido guardado` | já existia | ✅ |
| 3 | idem, por HTTP | `carrinho-rota.int.test.ts` › `@spec:AC-516 a MESMA chave devolve o MESMO pedido, e nunca um segundo` | já existia | ✅ |
| 3 | mesma chave em outra loja cria pedido (a chave é por loja) | `pedido-idempotente.test.ts` › `@spec:AC-516 a mesma chave em outra loja cria pedido …` | já existia | ✅ |
| 3 | chave de outra pessoa não devolve o pedido dela | `pedido-idempotente.test.ts` › `@spec:AC-516 a chave de outra pessoa não devolve o pedido dela` | já existia | ✅ |
| 3 | chave de A usada por **outra pessoa na loja B** cria pedido novo em B | `checkout-aceite.int.test.ts` › `@spec:AC-516 a chave de A usada na loja B, por outra pessoa, não devolve o pedido de A` | **novo** | ✅ |
| 4 | **Concorrência** — duas confirmações simultâneas, chaves diferentes: no máximo uma compra | `checkout-aceite.int.test.ts` › `@spec:AC-524 duas confirmações com chaves DIFERENTES: no máximo uma compra efetiva …` (um `201`, nenhum `5xx`; banco: +1 pedido, carrinho convertido) | **novo** | ✅ |
| 4 | duas simultâneas com a **mesma** chave: banco com **1** pedido e toda resposta de sucesso aponta para o mesmo id | `checkout-aceite.int.test.ts` › `@spec:AC-516 duas confirmações com a MESMA chave ao mesmo tempo: o banco guarda UM pedido …` | **novo** | ✅ |
| 4 | idem, sem erro de servidor | `checkout-aceite.int.test.ts` › `@spec:AC-516 DEFEITO: a segunda confirmação simultânea … não 500` | **novo** (`it` desde o #134) | ✅ **corrigido no #134**: SAVEPOINT trata a P2002 de `orders_idempotency_uk`; a segunda recebe 200 com `jaExistia: true` |
| 4 | conversão atômica do carrinho (a segunda conversão perde) | `carrinho-convertido.int.test.ts` › `@spec:AC-524 o carrinho de outra sessão, de outra loja ou já convertido não é convertido` | já existia | ✅ |
| 4 | baixa de estoque concorrente (duas compras, saldo não fica negativo) — caso vizinho, carrinhos distintos | `apps/api/tests/estoque-concorrente.test.ts` › `@spec:AC-333 aceita uma compra, recusa a outra …` | já existia (não rodado neste card) | — |
| 5 | **Isolamento entre lojas** — sessão da A com a loja B: não fecha nada, o carrinho de A fica intacto | `checkout-aceite.int.test.ts` › `@spec:AC-502 a sessão da loja A não fecha carrinho na loja B …` | **novo** | ✅ |
| 5 | fechar A não converte o carrinho de B; cada loja conta só os seus pedidos | `checkout-aceite.int.test.ts` › `@spec:AC-502 @spec:AC-524 fechar o carrinho de A não converte o de B …` | **novo** | ✅ |
| 5 | o link do pedido de A não abre na loja B (404, sem vazar o código) | `checkout-aceite.int.test.ts` › `@spec:AC-502 o pedido de A não é lido pela loja B …` | **novo** | ✅ |
| 5 | uma sessão não enxerga / não altera o carrinho de outra | `carrinho-rota.int.test.ts` › `@spec:AC-502 uma sessão NÃO enxerga o carrinho de outra` e `… não altera o item de outra` | já existia | ✅ |
| 5 | conversão recusa carrinho alheio e outra loja (função do banco) | `carrinho-convertido.int.test.ts` (mesmo teste do caso 4) | já existia | ✅ |
| 5 | o pedido criado não aparece para outra loja | `pedido-idempotente.test.ts` › `@spec:AC-514 o pedido criado não aparece para outra loja` | já existia | ✅ |
| 6 | **Pedido manual (e2e)** — lanche com grupo obrigatório; sem a opção não avança; escolhendo e confirmando, o pedido aparece na fila do lojista | `e2e/specs/pedido-manual.spec.ts` › `@spec:AC-707 o dono lança o pedido de quem não quer cadastro, o grupo obrigatório barra, e o pedido entra na fila como balcão` | já existia, **consertado** (4.6) | ✅ 2/2 (`publico` e `celular`), 3 execuções seguidas |

Resumo: **6 casos de aceite**; todos têm teste. Já existiam testes para os casos 1 (regra e conferência), 2 (regra e
conferência), 3 (completo) e 6 (quebrado). Lacunas cobertas: o POST de pedido com preço alterado (L-06), o pedido
gravado sem o esgotado, a concorrência (inexistente), o isolamento por HTTP entre lojas e o e2e do pedido manual.

## 4. Detalhes

### 4.1 Contagens

| Camada | Antes | Depois |
|---|---|---|
| `packages/core` (unit) | 262 testes; `pedido-total.test.ts` 20 | 274 testes; `pedido-total.test.ts` **32** |
| `apps/api` (int, só os arquivos deste card, isolados) | `carrinho-convertido` 3, `pedido-idempotente` 17, `carrinho-rota` 37 | idem, mais `checkout-aceite.int.test.ts` **11 passam + 1 falha esperada** |
| e2e `pedido-manual` | 0/2 | 2/2 |

### 4.2 Exercício IEL Módulo 2 — função escolhida: `conferirCarrinho` (`packages/core/src/pedido-total.ts:192`)

Critérios: ≥ 5 testes unitários com TDD · integração com PostgreSQL · regressão que bloqueia · 100% de ramos.

**Cobertura de ramos.** O repositório não tem provedor de cobertura do Vitest (`@vitest/coverage-v8` não está
instalado e não se atualizam dependências neste card). Medi com o cobertor do próprio Node 24 (`node --test
--experimental-test-coverage`), rodando **cópias** de `pedido-total.ts`, `dinheiro.ts` e do arquivo de teste numa pasta
temporária (`/tmp/cov-core`, fora do repositório), com uma casca mínima que traduz `describe/it/expect` para
`node:test/node:assert`.

| Momento | `pedido-total.ts` linhas | **ramos** | funções |
|---|---|---|---|
| Antes (20 testes) | 100,00% | **96,88%** | 100% |
| Depois (32 testes) | 100,00% | **100,00%** | 100% |

Os ramos que faltavam: a explicação do preço aplicado (do produto e da variante), o negativo e o milhar de `emReais`,
o `null` explícito do preço visto e do total enviado. (`dinheiro.ts` é outro módulo e não faz parte da função escolhida.)

**Os 12 testes novos** (`pedido-total.test.ts`, blocos "explicação do preço aplicado acompanha o preço (AC-310)" e
"a frase do aviso de preço e as bordas da conferência (AC-503, AC-311)"): atacado do produto leva a explicação;
variante leva a **da variante** e ignora a do produto; variante sem explicação **não herda**; preço normal tem
explicação **nula**; milhar escrito `R$ 1.234,56`; preço visto negativo não quebra a frase; preço visto `null` não
inventa mudança; total enviado `null`; total enviado **zero** é divergência; carrinho vazio confere em zero; quantidade
quebrada **estoura**; preço do catálogo quebrado **estoura**.

**RED → correção → GREEN.** A função já existia e já estava correta; não há comportamento ausente para um RED clássico
(teste que falha porque o código ainda não existe) e **não se podia mexer em código de produção**. O RED foi
construído honestamente de outra forma, por **mutação em cópia** (`/tmp/cov-core`, nunca no repositório): cada teste
novo nasceu para matar uma mutação que a suíte antiga deixava viva.

| Mutação aplicada à cópia da função | 20 testes antigos | 32 testes (antigos + novos) |
|---|---|---|
| M5 — explicação do **produto** vaza para a variante (`item.precoAplicado ?? null` → `produto.precoAplicado ?? null`) | 🟢 **sobrevive** (0 falham) → RED do exercício | 🔴 2 falham |
| M7 — milhar sem ponto (`.replace(…, ".")` removido) | 🟢 sobrevive | 🔴 1 falha |
| M9 — quantidade arredonda em vez de estourar (`Math.round(unitario * quantidade)`) | 🟢 sobrevive | 🔴 2 falham |
| M6 — total enviado `0` tratado como "ausente" | 🔴 1 falha | 🔴 3 falham |
| M1 — preço do cliente compõe o total (viola P-006) | 🔴 6 falham | 🔴 8 falham |
| M2 — nunca pede confirmação | — (já coberta) | 🔴 3 falham |
| M3 — indisponível segue no pedido | — | 🔴 1 falha |
| M4 — sem preço segue por zero | — | 🔴 2 falham |
| M8 — acréscimo some da conta | — | 🔴 4 falham |

Sequência: (1) medi 96,88% e escrevi os testes para os ramos descobertos; (2) provei com as mutações M5, M7 e M9 que a
suíte antiga **não** os pegava (RED); (3) com os testes novos, toda mutação é morta e a função **real** passa 32/32
(GREEN); (4) a refatoração foi do **teste**: um único bloco, com constantes (`ATACADO`, `VARIANTE_G`) reaproveitadas,
re-rodado verde (`npx vitest run --project unit packages/core/src/pedido-total.test.ts` → 32/32).

**Integração com PostgreSQL**: `apps/api/tests/checkout-aceite.int.test.ts` (banco descartável por arquivo; asserções
em `app.orders`, `app.carts`, `app.store_sequences`, `app.order_items` pelo migrador, e não pelo que a resposta diz).

**Regressão que bloqueia**: (a) o unit roda no `pnpm test:unit`; (b) o caso de L-06 reprova se a
checagem de `preco_divergente` sair (`pedidos.routes.ts:373-381`) — *não verifiquei removendo a checagem*, porque isso
exigiria editar código de produção; (c) o teste do defeito (`it.fails`) **fica vermelho quando o defeito for
corrigido**, forçando a remoção do marcador.

### 4.3 Preço alterado — o que o teste enxerga

A recusa por preço **não expõe o motivo no corpo**: a resposta é `409 {"erro":{"codigo":"conflito",…}}` e
`preco_divergente` só vai para o log. O teste prova a causa pelo caminho completo: o **mesmo** pedido (mesma chave),
com o subtotal novo, passa. Se a tela precisar distinguir "preço mudou" de outros conflitos, isso hoje só é possível
refazendo a conferência (`POST …/carrinho/conferencia`).

### 4.4 O que **não** foi feito

- `test:int` completo não foi rodado (40 falhas anteriores; instrução do gerente).
- Mutação no código de produção (para L-06) — vedada.
- Não rodei `estoque-concorrente.test.ts`, só o citei.

### 4.5 Observações de ambiente

- **`pnpm test:e2e` aponta para o banco de dev** (`DATABASE_URL_DIRETA` do `.env`), não para um descartável. Cada execução
  deixou 2 pedidos de teste na loja do painel (da faixa #85 em diante há mais de 20 só das minhas tentativas de hoje).
  Isso também é o que fazia o pedido novo sumir do quadro (4.6, item 6).
- `node e2e/run-isolado.mjs specs/pedido-manual.spec.ts` (banco descartável) falhou: após "Confirmar pedido" a tela
  mostra "Não foi possível lançar agora" (erro genérico do servidor). **Não investiguei a causa** (sem log do
  servidor na saída; fora do escopo). Fica como lacuna: o spec só foi verificado no banco de dev.
- O `next build` do `webServer` do Playwright **aborta na primeira tentativa** com `SecurityFatalError` ("Your version of
  Next.js is affected by a known security vulnerability", com sugestão de `next upgrade`) e **continua na segunda**.
  Não atualizei nada (vedado). Fica o registro: a versão do Next em uso tem um aviso de segurança e vale um card.

### 4.6 O que consertei em `pedido-manual.spec.ts` e por quê (tudo no teste, nada na tela)

O redesign trocou o formulário do pedido manual; o spec ficou para trás:

1. `getByLabel("Nome")`/`"Telefone"` → o dono agora escolhe **"Cliente novo"** e preenche *Nome de quem pede* e *Telefone com DDD*.
2. `selectOption` no `<select>` "Acrescentar produto" → o campo virou o **seletor do pacote** (`combobox` "Adicionar produto ao
   pedido", opções `role=option`); mesma troca já feita em `produto-opcoes.spec.ts`.
3. Reforcei "sem a opção não avança": além da mensagem `Escolha 1 opção em Molho.`, afirma que a lista "Itens do pedido" **não existe** ainda.
4. **Telefone único por execução.** Com o telefone fixo, o sistema reaproveita a ficha do primeiro cliente (mesmo
   telefone) e o pedido sai no nome dele — o teste procurava o nome novo e falhava.
5. **Aviso de cookies no celular** cobre o fim do formulário e o clique em "Confirmar pedido" não chega; o teste o
   dispensa ("Recusar não essenciais") como a pessoa faria.
6. **Quadro com "Mostrar mais" / "Mostrar os outros N"**: cada coluna mostra os primeiros cartões; o pedido novo (o mais
   recente) fica no fim e some num dia com muitos pedidos. O teste abre a lista até achar o cartão.
7. Prazo de 20 s para o cartão aparecer na primeira carga do quadro.

Resultado: `pedido-manual.spec.ts` ✅ 2/2 (`publico`, `celular`), 3 execuções seguidas.

## 5. Como repetir

```bash
# unit (função escolhida)
npx vitest run --project unit packages/core/src/pedido-total.test.ts
# integração (precisa do Postgres de teste: bash infra/scripts/up.sh core test)
npx vitest run --project api-int apps/api/tests/checkout-aceite.int.test.ts
npx vitest run --project api-int apps/api/tests/carrinho-convertido.int.test.ts
npx vitest run --project api-int apps/api/tests/pedido-idempotente.test.ts
npx vitest run --project api-int apps/api/tests/carrinho-rota.int.test.ts
# e2e (banco de dev; se o build do Next parar com o aviso de segurança, repita o mesmo comando)
pnpm --filter @simpleclick/e2e exec playwright test specs/pedido-manual.spec.ts
```

Cobertura de ramos sem dependência nova: copiar `pedido-total.ts`, `dinheiro.ts` e o teste para uma pasta temporária,
com uma casca `vitest` → `node:test`, e rodar `node --test --experimental-test-coverage`.
