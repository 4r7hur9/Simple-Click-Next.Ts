# Estruturação 6 — Operação, observabilidade e uso de IA

Card #132 · executado em 19/11/2026 · seção 6 do plano (`Simple_Click_Plano_de_Estruturacao.md`).
Revisão examinada: `69cf095`. Nenhum código de produção foi alterado. Arquivos deste card:
este documento e dois testes novos em `apps/api/tests/` (`log-de-pedido-sem-pii.test.ts`,
`preco-vigente-virada.test.ts`).

Dados nos exemplos: **todos fictícios** (sentinelas do teste, nada de cliente real).

## Resumo por linha da tabela

| Linha da seção 6 | Situação |
|---|---|
| Logs e traces | ✅ feito (1). Linha do tempo real de uma compra, com a lacuna de instrumentação registrada. |
| Latência e SLO | 🟡 estrutura pronta, números **a verificar** (2): dependem do relatório de desempenho (#131). |
| Segurança e ambientes | ✅ feito (3). Sem PII nos logs (teste novo, verde) e sem falha de isolamento. |
| Diagnóstico e otimização | 🟡 estrutura pronta, medidas **a verificar** (4): dependem do k6 (#131). |
| Entrega progressiva | ✅ procedimento escrito e provado no nível da regra (5); o ensaio em homologação está **a verificar** (não existe ambiente de homologação neste repositório). |
| IA como assistente | ✅ registrado (6), com decisão humana **a verificar** (a pessoa responsável ainda precisa assinar). |

---

## 1. Logs e traces — acompanhar uma compra pelo identificador de requisição

### 1.1 Como o log funciona hoje (lido em `apps/api/src/core/log.ts` e `core/erros.ts`)

- Pino, uma linha JSON por evento. Toda linha dentro de uma requisição leva `requisicaoId`
  (vem do contexto assíncrono, não de parâmetro).
- O identificador é o cabeçalho `x-request-id` do cliente, **se tiver forma válida**
  (`[A-Za-z0-9._-]{8,64}`); senão a API gera um UUID. A API devolve o mesmo valor no cabeçalho de resposta
  `x-request-id`. É assim que se segue uma jornada do navegador até a API.
- **Lista de permissão de campos** (`CAMPOS_PERMITIDOS`): só nomes de identificação, classificação e medida
  passam; qualquer outro campo vira `"[omitido]"`. Nome de evento tem forma fixa (`pedido.criado`), e mensagem de erro de
  biblioteca não é registrada (só o nome da classe, o código e os quadros da pilha).
- A rota gravada é o **molde** (`/v1/vitrine/:apelido/pedido/:token`), nunca o endereço pedido: o token de
  acompanhamento não vai para o log.
- Eventos emitidos hoje no caminho da compra: `requisicao.iniciou`, `requisicao.terminou` (`metodo`, `rota`,
  `status`, `duracaoMs`) e, em recusa/erro, `requisicao.falhou` (nível `warn` para 4xx, `error` para 5xx, com `status`, `codigo`,
  `referencia`, `erro{nome,codigo,pilha}`, `detalhe`).

### 1.2 Como seguir uma compra

1. Quem investiga recebe o `x-request-id` da resposta (ou a `referencia` do corpo de erro, que é o mesmo valor).
2. `grep` / filtro no log por `"requisicaoId":"<id>"`: saem as 2–3 linhas daquela requisição.
3. Para a jornada completa, o front deve mandar o **mesmo** `x-request-id` válido em carrinho → conferência →
   fechamento; sem isso, cada chamada ganha um UUID novo e a jornada precisa ser costurada por horário.
   (O teste usa `x-request-id: req-cliente-sentinela-01` e confirma que a API o aceita e o devolve.)

### 1.3 Linha do tempo sanitizada (saída real do teste, campos ordenados e `time`/`pid` omitidos)

Compra de 1 item, retirada na loja; cada linha é uma requisição (`iniciou` → `terminou`):

| # | `requisicaoId` | `metodo` `rota` | `status` | `duracaoMs` | o que significa |
|---|---|---|---|---|---|
| 1 | `req-cliente-sentinela-01` | `POST /v1/vitrine/:apelido/carrinho/itens` | 201 | 134,4 | item entrou no carrinho (id do cliente aceito) |
| 2 | `630b5bc2-…` | `POST /v1/vitrine/:apelido/pedidos` | **201** | 37,8 | pedido gravado |
| 3 | `70d48e85-…` | `POST /v1/vitrine/:apelido/pedidos` | **200** | 13,7 | **replay**: mesma chave, mesmo pedido (`jaExistia`) |
| 4 | `05fb644c-…` | `GET /v1/vitrine/:apelido/pedido/:token` | 200 | 5,7 | acompanhamento (token só no molde `:token`) |
| 5 | `f4c647a2-…` | `POST …/pedidos` → `requisicao.falhou` nível 40 (`warn`) | 409 | 13,4 | recusa de negócio; `codigo:"conflito"`, `referencia` = o próprio id, `detalhe.motivo:"[omitido]"` |

Valores de `duracaoMs` de uma máquina de desenvolvimento, só para mostrar a forma; não são medida de desempenho.

### 1.4 Como a linha do tempo diferencia **erro na gravação** de **perda da resposta**

| Situação | O que o servidor registra | O que o cliente viu | Como confirmar |
|---|---|---|---|
| **Erro na gravação** (o pedido NÃO nasceu) | `requisicao.falhou` com `status` ≥ 500 (nível `error`), `codigo:"erro_interno"`, `erro.nome`/`erro.codigo` (ex.: `P2002` do Prisma) e pilha; depois `requisicao.terminou` com o mesmo status 5xx | resposta de erro com `referencia` | não há linha em `app.orders` para a `(loja, chave)`; a nova tentativa com a mesma chave **cria** o pedido (201) |
| **Perda da resposta** (o pedido nasceu, o cliente não soube) | `requisicao.terminou` com `status` **201** e **nenhum** `requisicao.falhou` para aquele id; depois, uma segunda requisição `POST …/pedidos` com `status` **200** (replay) | tempo esgotado / conexão caída, sem corpo | existe 1 linha em `app.orders` para a chave; a tentativa seguinte devolve o mesmo pedido (200), sem gastar número |
| **Defeito conhecido** (#129/#134): duas confirmações simultâneas com a mesma chave | a perdedora aparece como o primeiro caso (500 com `P2002` em `orders_idempotency_uk`), mas **o pedido existe** | 500 | existe 1 linha para a chave: é "erro de log, não de gravação" — por isso o log sozinho não basta; confira o banco |

Limite assumido: o evento `finish` do Node dispara quando a resposta foi entregue ao sistema operacional, não quando o
cliente a recebeu. Por isso o servidor **não vê** a perda em si; ele vê "terminou 201" e, depois, o replay.

### 1.5 Lacunas de instrumentação (observações, não corrigidas)

Foram vistas na saída real; cada uma vira card se o gerente quiser (por regra do card, nenhuma foi corrigida):

1. **Não há evento de domínio para pedido** (`pedido.criado`, `pedido.repetido`): o log do pedido é só o par
   `requisicao.*`. Não há `recursoId` (id do pedido) nem `lojaId` nas linhas: com a chave de idempotência
   ausente do log (certo, é credencial), ligar o replay (linha 3) ao original (linha 2) hoje depende do banco ou do horário.
2. **Sem duração por etapa** (consulta do carrinho/catálogo, gravação do pedido): o plano pede "duração da consulta e da
   gravação quando houver instrumentação por etapa" — **não há** instrumentação por etapa. Só existe `duracaoMs` da requisição inteira.
3. ✅ **Corrigido no #139** (`papel` = o de maior privilégio da requisição; `usuarioId`/`lojaId` anotados na raiz). Era: **`papel` sempre `PUBLIC` e sem `usuarioId`** nas linhas da compra, mesmo com cliente autenticado (o contexto do log
   é aberto antes da autenticação e não é atualizado).
4. ✅ **Corrigido no #139** (a rota é capturada quando o Express a escolhe, com o prefixo do sub-roteador; coberta em `core/log-papel-e-rota.test.ts`). Era: **`rota` inconsistente em 4xx tratado**: na linha 5 saiu `"/:apelido/pedidos"` (sem o prefixo `/v1/vitrine`), nas
   demais saiu o molde completo. Inofensivo (não é PII), mas atrapalha agrupar por rota na latência (seção 2).

---

## 2. Latência e SLO — **a verificar** (depende do #131)

> **Atualização (#139):** as métricas RED, o trace da criação de pedido e o SLO declarado estão em [`docs/observabilidade.md`](../observabilidade.md). O SLO continua sem medição de carga até o #131 rodar.

> **Atualização (#142):** as metas de p95 por operação e as medidas de carga com 101 mil pedidos (k6, duas execuções antes e duas depois) estão em [`docs/desempenho.md`](../desempenho.md), seções 1 e 5. As tabelas abaixo ficam como estrutura original; a fonte dos números é aquele documento.

Estrutura pronta; células de medida ficam vazias até o relatório de desempenho existir. Nenhum número foi inventado.

### 2.1 Definição por operação

| Operação | Rota (molde) | Conta como tentativa para o SLO | **Não** conta | Meta (p95) | Meta de sucesso | Janela |
|---|---|---|---|---|---|---|
| **Navegação** | `GET /v1/vitrine/:apelido` e `…/catalogo`, `…/produtos/:id` | toda requisição que chegou à API e não foi cancelada pelo cliente | 404 de loja inexistente; requisições com origem não permitida | **a verificar** (#131) | **a verificar** | 28 dias móveis para o SLO; 5 min para alerta |
| **Criação** | `POST /v1/vitrine/:apelido/pedidos` com `201` | toda tentativa **válida** (corpo correto, carrinho com item, loja aberta) | 4xx de negócio esperado: `409 preco_divergente`, loja fechada, `401 conta_obrigatoria`, item esgotado (são recusas corretas, não falha do serviço) | **a verificar** | **a verificar** (sucesso = 2xx; falha = 5xx e tempo esgotado) | idem |
| **Replay** | `POST …/pedidos` que termina em `200` (`jaExistia`) | toda tentativa com chave já usada pela mesma pessoa | chave de outra pessoa (devolve pedido novo, é criação) | **a verificar**; deve ser ≤ meta de criação (não grava) | **a verificar**; um replay **nunca** pode ser 5xx (AC-516) | idem |

Separação operacional: criação e replay compartilham a rota; distinguem-se pelo `status` (201 × 200) na linha
`requisicao.terminou`. O p95 é o tempo em que 95% das requisições terminam.

### 2.2 Tabela a preencher com o relatório do card #131

| Operação | Volume | p95 (ms) | Erros (5xx/timeout) | Taxa de sucesso | Meta | Cumpriu? |
|---|---|---|---|---|---|---|
| Navegação | a verificar | a verificar | a verificar | a verificar | a verificar | a verificar |
| Criação | a verificar | a verificar | a verificar | a verificar | a verificar | a verificar |
| Replay | a verificar | a verificar | a verificar | a verificar | a verificar | a verificar |

Fonte das medidas a usar: saída do k6 (smoke, carga, estresse) do card #131; conferir que o volume de criação bate com os
pedidos novos no banco (reconciliação) antes de aceitar o número.

---

## 3. Segurança e ambientes

### 3.1 Permissões por loja (isolamento)

Já provado, sem falha encontrada. Evidência (executada neste card em 19/11/2026, revisão `69cf095`):

| Prova | Resultado |
|---|---|
| `apps/api/tests/checkout-aceite.int.test.ts` (card #129): `@spec:AC-502` — a sessão da loja A não fecha carrinho na B; fechar A não converte o carrinho de B; o link do pedido de A dá 404 na B | ✅ no card #129 (não reexecutado aqui: arquivo do #134) |
| `apps/api/tests/isolamento-entre-lojas-dono.test.ts` | ✅ 18/18 (rodado agora) |
| `apps/api/tests/pedido-idempotente.test.ts` › `@spec:AC-514` — o pedido criado não aparece para outra loja | ✅ no card #129 |

**Nenhuma falha de isolamento observada**; não há caso para virar card.

### 3.2 Nenhum log de pedido expõe telefone, nome, endereço ou token — teste novo

`apps/api/tests/log-de-pedido-sem-pii.test.ts` (1 teste, **verde**). Comando:

```
npx vitest run --project api-int apps/api/tests/log-de-pedido-sem-pii.test.ts
```

O que faz: sobe a API inteira (`criarApp`) com um registrador de verdade (pino, JSON) ligado a um destino em memória;
compra com **sentinelas fictícias** (nome `Zenaide Sentinela Fictícia`, telefone `11955550199`/`+5511955550199`, chave de
idempotência, token público do pedido, cookie da sessão do carrinho, `Bearer`, `sc_access`) passando por carrinho →
fechamento (201) → replay (200) → acompanhamento por token → fechamento recusado (409). Afirma:

1. nenhuma das sentinelas aparece em **nenhuma** das linhas de log;
2. toda linha de requisição tem `requisicaoId`, e o `x-request-id` do cliente foi aceito;
3. a rota gravada é o molde (`:token`), nunca o token;
4. cada fechamento tem `iniciou` + `terminou` sob o mesmo id, com `duracaoMs` numérica, e os status 201 e 200 aparecem.

Verificação de que o teste não é vazio (feita em cópia temporária, removida): emitir
`registrar.info("pedido.teste", { contato: { telefone: "11955550199" } })` produz `"contato":"[omitido]"` — o
telefone não chega à saída.

Limite honesto: o teste cobre o **caminho de compra por retirada**. Entrega com endereço digitado e o pedido manual do
painel não foram exercitados com sentinelas; pela leitura, o endereço do pedido (`enderecoDoSite`, `entrega.endereco`)
não está na lista de campos permitidos, então seria `[omitido]`, mas isso é leitura, não prova → **a verificar** se o
gerente quiser ampliar.

**PII em log: não encontrada.** Nenhuma ação de "menor caso" necessária.

### 3.3 Variáveis de ambiente

Verificado por leitura de `.env.example` (nomes) e `apps/api/src/core/env.ts` (validação). **`.env` não foi aberto** (regra do projeto).

| Variável | Validação no boot | Observação |
|---|---|---|
| `NODE_ENV`, `PORT`, `LOG_LEVEL` | enum/coerção; `LOG_LEVEL` padrão `info` | em produção não usar `debug` |
| `DATABASE_URL`, `DATABASE_URL_DIRETA`, `DATABASE_URL_TEST` | `cadeiaDeConexao(postgres/postgresql)` | `_TEST` separada da de desenvolvimento; ver aviso abaixo |
| `REDIS_URL`, `REDIS_URL_TEST` | `redis/rediss` | |
| `JWT_SECRET` | mínimo de caracteres; "vindo do ambiente, nunca do código" | |
| `ORIGENS_PERMITIDAS` | lista fechada de origens válidas | |
| `CHAVE_CIFRA_TOTP` | obrigatória só em produção, 32 bytes em base64 | |
| `SEGUNDO_PLANO` | opcional; liga sozinho em produção | |
| `SENHA_BANCO_*`, `NEXT_PUBLIC_*`, `URL_DO_SITE`, `SEGREDO_DE_REVALIDACAO` | só no `.env.example`/web | `NEXT_PUBLIC_*` vai para o navegador: só URL pública, nunca segredo |

Ambientes: desenvolvimento, teste (banco `_TEST` na 5533) e produção existem em configuração. **Não existe ambiente de
homologação neste repositório** (ver 5). Aviso já registrado no board: `pnpm test:e2e` escreve no banco de DEV — nunca
apontar para um banco com dado real.

---

## 4. Diagnóstico e otimização — **a verificar** (depende do #131)

Método fixo (uma hipótese por vez, **mesmo perfil de carga** antes e depois, integridade conferida):

| Passo | Regra |
|---|---|
| 0. Linha de base | Rodar o perfil de carga do #131 (mesmos VUs, duração, 100 lojas, mesmo banco) e anotar p95/erros por operação. |
| 1. Hipótese A — consultas ao catálogo em excesso | Medir: nº de consultas por requisição (`pg_stat_statements` ou contagem no teste) e `duracaoMs` da navegação. Mudar **só** isso. Rodar o mesmo perfil. |
| 2. Hipótese B — espera por conexão no pool | Medir: conexões em uso × máximo (`maxDeConexoes`), tempo de espera. Mudar **só** o pool. Rodar o mesmo perfil. |
| 3. Critério | Aceitar a mudança só se o p95 melhora **e** a reconciliação dos pedidos continua exata (nº de pedidos no banco = 201 contados; 0 duplicados por `(loja, chave)`; nenhum 5xx novo). |
| 4. Registro | Uma linha por tentativa na tabela abaixo; hipótese descartada também fica registrada. |

| # | Hipótese | Mudança única | p95 antes | p95 depois | Erros antes/depois | Integridade do pedido | Conclusão |
|---|---|---|---|---|---|---|---|
| 1 | Consultas ao catálogo | a verificar | a verificar | a verificar | a verificar | a verificar | a verificar |
| 2 | Espera por conexão | a verificar | a verificar | a verificar | a verificar | a verificar | a verificar |
| 3 | `app.meus_pedidos` sem a loja nas junções (#142) | migração `0074_meus_pedidos_por_loja.sql` | 481 ms (588 / 374) | 9 ms (9 / 9) | 0% / 0% | reconciliação aprovada nas 4 execuções; 0 duplicados; 0 lista errada | aceita; detalhes em [`docs/desempenho.md`](../desempenho.md) |

As hipóteses 1 e 2 não foram testadas: o EXPLAIN do #138 e a carga do #142 apontaram outra causa (linha 3), e o
card aplicou **uma** otimização. Nas linhas 1 e 2, **nenhum valor foi estimado**.

### 4.1 Antes de aplicar a migração 0074 em qualquer ambiente

A 0074 passa a exigir que o cliente e os itens de um pedido sejam da **mesma loja** do pedido. A própria migração
conta os vínculos entre lojas e **recusa aplicar** se houver algum (falha fechada). Para saber antes do deploy,
rode a mesma contagem (só leitura) com um papel que enxergue todas as lojas:

```sql
SELECT
  (SELECT count(*) FROM app.orders o
     JOIN app.store_customers c ON c.id = o.store_customer_id
    WHERE c.store_id <> o.store_id) AS pedidos_com_cliente_de_outra_loja,
  (SELECT count(*) FROM app.order_items i
     JOIN app.orders o ON o.id = i.order_id
    WHERE i.store_id <> o.store_id) AS itens_de_outra_loja;
```

Os dois números precisam ser **0**. Se não forem, a migração para com a mensagem `0074 recusada: …`; corrija o dado
antes (não force). Sem essa correção, a lista de pedidos, a exportação LGPD e as métricas da conta deixariam de
mostrar o pedido afetado. Volta: uma migração nova com o corpo da função da 0029 (`CREATE OR REPLACE`).

---

## 5. Entrega progressiva — procedimento para uma futura mudança de preço

### 5.1 O que o sistema já oferece (lido no código)

- O preço vigente é decidido por **uma única função pura** (`precoQueVale`, `packages/core/src/preco-vigente.ts`),
  usada pela vitrine **e** pela conferência do carrinho; um preço tem `ativo`, `comecaEm` (inclusivo) e `terminaEm`
  (exclusivo). Isso permite agendar e desfazer sem apagar nada.
- Pedido gravado guarda o **snapshot** do preço (`order_items.unit_price_cents`, `line_total_cents`); reprecificar ou
  renomear o produto **não muda** pedido existente (`pedido-imutavel.test.ts` › `@spec:AC-515`, 7/7 verde agora).
- Quem tem a tela aberta com o preço antigo não é cobrado errado: a conferência mostra "de R$ 20,00 para R$ 25,00",
  exige confirmação, e o fechamento com subtotal velho dá `409 preco_divergente` sem gravar nada
  (`checkout-aceite.int.test.ts`, card #129).
- Existe portão de funcionalidade **por loja** (`app.store_feature_enabled`, `exigirFuncionalidade`), útil para liberar
  uma mudança maior (nova regra de preço) a poucas lojas antes de todas.

### 5.2 Procedimento

| Etapa | Quem | O que faz |
|---|---|---|
| 1. Decidir | Dono da loja (preço da própria loja) · administração do SimpleClick (mudança de regra de preço na plataforma) | Registra o motivo, o novo valor, o instante `T` (de preferência fora do horário de pico) e a pessoa que pode voltar atrás. |
| 2. Preparar | Quem ativa (mesma pessoa de 1) | Cadastra o preço **novo** com `comecaEm = T`. **Encerra o preço antigo** com `terminaEm = T` (mesmo instante). *Não* basta cadastrar o novo: sem encerrar o antigo, vale o **menor** — um aumento não tem efeito (prova abaixo). Reduções entram sem esse cuidado. |
| 3. Ensaiar | Quem ativa | Em **homologação** (a verificar: não existe aqui), com loja de teste e dados fictícios, repetir 2 e conferir (a) a vitrine mostra o novo no instante `T`, (b) um carrinho aberto antes de `T` recebe o aviso e exige confirmação, (c) um pedido gravado antes de `T` continua com o valor antigo. |
| 4. Ativar | Quem ativa | No instante `T` o preço vira sozinho (sem deploy). Para mudança de regra (não de valor), ligar o portão de funcionalidade só nas lojas piloto primeiro. |
| 5. Observar (primeiras 2 h; depois diário por 7 dias) | Quem ativa + quem opera | (a) taxa de `409 preco_divergente` em `POST …/pedidos` (linha `requisicao.falhou`, `codigo:"conflito"`); (b) taxa de 5xx em criação e replay (seção 2); (c) pedidos/hora da loja contra a mesma faixa horária da semana anterior; (d) reclamações. Esperado: pico curto de `409` logo após `T` e volta ao normal. |
| 6. Quando voltar atrás | Quem ativa | Qualquer um: 5xx em criação > meta de erro da seção 2 por 10 min; `409` não cai depois de 30 min; queda de pedidos > 30% contra a semana anterior sem outra causa; relato de cobrança diferente do mostrado. |
| 7. Como voltar | Quem ativa | **Desativar** (`ativo=false`) o preço novo e remover o `terminaEm` do antigo (ou cadastrar o antigo de novo). Não apagar linhas. Pedidos já gravados **não** mudam; carrinhos abertos recebem novo aviso de preço. |
| 8. Fechar | Quem ativa | Conferir que a soma dos pedidos do período bate com a soma dos itens (nenhum pedido com valor diferente do snapshot) e anotar o resultado. |

### 5.3 Prova no nível da regra (teste novo)

`apps/api/tests/preco-vigente-virada.test.ts` (4 testes, **verdes**), valores calculados à mão antes de rodar:

| Caso | Esperado | Resultado |
|---|---|---|
| `comecaEm = T`: em `T` vale; em `T − 1 ms` não vale (início **inclusivo**) | true / false | ✅ |
| antigo `terminaEm = T` + novo `comecaEm = T`: em `T − 1 ms` → 2000; em `T` → 2500 (sem buraco e sem sobreposição) | 2000 → 2500 | ✅ |
| aumento **sem** encerrar o antigo: em `T` continua 2000 (o menor vence) | 2000 | ✅ |
| voltar atrás: novo com `ativo=false` → 2000, nunca nulo | 2000 | ✅ |

Comando: `npx vitest run --project api-int apps/api/tests/preco-vigente-virada.test.ts`.
Mais `pedido-imutavel.test.ts` (7/7) para "pedidos gravados preservados".

**A verificar:** o ensaio em homologação (etapa 3). Este repositório não tem esse ambiente; a regra foi provada em teste
de unidade e a preservação do pedido em teste de integração com PostgreSQL de teste, mas isso **não substitui** o ensaio
ponta a ponta (o painel do dono cadastrando o preço novo e a vitrine real exibindo-o). Também **a verificar**: se a
tela de preços do painel permite hoje definir `comecaEm`/`terminaEm` no preço `BASE` (a regra do core permite; não
conferi a tela).

---

## 6. IA como assistente — registro

Função escolhida: `precoQueVale` / `precoValeAgora` (`packages/core/src/preco-vigente.ts`, ~40 linhas, pura), com os
10 testes existentes de `packages/core/src/preco-vigente.test.ts` e dados sintéticos (centavos e datas fixas).
Ferramenta: Claude Sonnet 5.5, neste card; o texto do prompt abaixo é o que foi usado como pergunta.

| Campo | Registro |
|---|---|
| **Prompt** | "Esta é a função `precoQueVale` e os 10 testes que a cobrem (todos com dados sintéticos: preço de R$ 20,00, promoção de R$ 15,00, datas fixas em 2026). **Aponte uma lacuna de cobertura relevante para a operação** — um comportamento que a função tem e que nenhum teste prova — e proponha o teste. Não altere a função. Diga qual valor você espera e por quê." |
| **Sugestão recebida** | Lacuna: os testes provam que o **fim** da janela é exclusivo, mas nenhum prova o **início** (`comecaEm`), nem a **virada** (preço antigo termina em T, novo começa em T). Proposta: 4 testes — início inclusivo; virada sem buraco nem sobreposição; aumento sem encerrar o antigo (menor vence); voltar atrás com `ativo=false`. Valores esperados propostos: 2000 em `T−1 ms`, 2500 em `T`, 2000 se o antigo não terminar, 2000 após desativar o novo. |
| **Validação à mão** | Refeita por quem escreveu o teste, sem rodar: início `comecaEm > agora` é falso quando iguais ⇒ vale (inclusivo) ✔; fim `terminaEm <= agora` ⇒ em `T` o antigo sai e o novo entra ⇒ 2500; em `T−1 ms` o novo ainda não começou (`comecaEm > agora`) e o antigo ainda não terminou ⇒ 2000 ✔; dois BASE valendo ⇒ `Math.min` ⇒ 2000 (aumento sem encerrar **não** vale — isto é regra do código, não erro do teste) ✔; `ativo=false` ⇒ filtrado ⇒ 2000 ✔. |
| **Teste que sustenta** | `apps/api/tests/preco-vigente-virada.test.ts` (4/4 verdes). Prova de que os testes pegam defeito: em **cópia fora do repositório** foram aplicadas 3 mutações — início exclusivo (`>=`), fim inclusivo (`<`), `Math.min`→`Math.max` — e cada uma derrubou pelo menos uma das asserções (respectivamente 1ª e 2ª; 2ª; 3ª). Cópia removida. |
| **Decisão humana** | **A verificar** — a pessoa responsável (membro da equipe) precisa ler o teste, aceitar ou rejeitar e assinar aqui: ____ / data: ____. Proposta do agente: **aceitar**; o teste não muda código de produção e documenta uma regra com consequência real (aumento só vale se o antigo for encerrado). |
| **O que a IA NÃO decidiu** | Não decidiu se o comportamento "o menor vence" é desejado para o negócio (é do dono do produto); só o documentou como está. Se for indesejado, vira card de regra, e o teste 3 muda junto. |
| **Limites do uso** | A IA só viu a função, os testes e dados sintéticos. Nenhum dado de cliente, `.env` ou log real foi entregue. O valor esperado foi conferido por regra do código e por mutação, não "porque a IA disse". |

---

## Anexo — o que rodei e o que não rodei

| Verificação | Comando | Resultado |
|---|---|---|
| Teste de log sem PII | `npx vitest run --project api-int apps/api/tests/log-de-pedido-sem-pii.test.ts` | ✅ 1/1 |
| Teste da virada de preço | `npx vitest run --project api-int apps/api/tests/preco-vigente-virada.test.ts` | ✅ 4/4 |
| Pedido imutável | `… apps/api/tests/pedido-imutavel.test.ts` | ✅ 7/7 |
| Isolamento entre lojas (dono) | `… apps/api/tests/isolamento-entre-lojas-dono.test.ts` | ✅ 18/18 |
| Seções 2 e 4 | k6 do card #131 | **a verificar** — não executado |
| Ensaio de preço em homologação | — | **a verificar** — ambiente inexistente |
| Lint e tipos dos 2 testes novos | `npx eslint <os 2 arquivos>`; `npx tsc --noEmit -p apps/api/tsconfig.json` (filtrado pelos 2 arquivos) | ✅ sem apontamentos |

Arquivos rodados isolados, como nos cards anteriores (a suíte `test:int` completa já tinha falhas, L-07 a L-10 do inventário).
