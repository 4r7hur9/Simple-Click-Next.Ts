# Estruturação 5 — Desempenho: smoke, carga e estresse (k6 + GitHub Actions)

Card #131 · seção 5 do plano (`Simple_Click_Plano_de_Estruturacao.md`) e itens 3 e 5 da seção 4.
Depende de `04-simulacao.md` (seed de 100 lojas e 1.000 pedidos e o manifesto) e de
`03-testes-checkout.md` (a matriz do checkout e o defeito AC-516).

Nenhum código da API, do site ou do seed foi alterado. Tudo novo está em três lugares:

| Onde                               | O quê                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `.github/workflows/desempenho.yml` | os 3 jobs (`smoke`, `carga`, `estresse`)                                        |
| `tests/performance/k6/`            | os cenários k6 (`smoke.js`, `carga.js`, `estresse.js`, `comum.js`, `resumo.js`) |
| `tests/performance/ambiente/`      | preparo, medição e fechamento de cada etapa (scripts que o YAML só chama)       |

**Os números são valores iniciais de homologação, não metas do produto.** Meça a primeira
execução antes de adotá-los.

## 1. Como rodar

### No GitHub Actions

- **Smoke:** roda em todo PR para a `main` e por disparo manual (_Actions → Desempenho → Run workflow_).
- **Carga e estresse:** só por disparo manual, em sequência (`carga` tem `needs: smoke`; `estresse` tem
  `needs: carga`). O `needs` só controla a **ordem**: cada job roda em seu próprio runner e prepara a sua
  cópia descartável da mesma base. Smoke que falha impede a carga; carga que falha impede o estresse.
- Os artefatos (`desempenho-smoke`, `desempenho-carga`, `desempenho-estresse`) são publicados **sempre**
  (`if: always()`), inclusive quando uma etapa falha, e o `relatorio.md` aparece no painel da execução.

> O workflow **não foi disparado no GitHub** neste card (regra do card). Foi validado com `actionlint` e
> pelos mesmos scripts, rodados no computador (seção 9).

### No computador (do jeito do CI)

```bash
# precisa de Docker e do k6 1.3.0; se houver e2e rodando (mesma pasta apps/web/.next), o ensaio espera uma janela
K6_BIN=$HOME/.cache/sc-perf/k6 bash tests/performance/ambiente/local.sh smoke
PERFIL=curto K6_BIN=... bash tests/performance/ambiente/local.sh carga      # ensaio rápido (durações ÷ 12)
```

`local.sh` sobe **Postgres 16 e Redis 7 descartáveis** (`servicos.sh`: Docker, só em 127.0.0.1, senhas
aleatórias), roda `preparar.sh` → `executar-k6.sh` → `finalizar.sh` e remove tudo no fim. Não toca na base de
desenvolvimento nem na `simpleclick_simulacao` do seed. Os resultados ficam em
`tests/performance/saida/<etapa>/` (fora do git).

## 2. O que cada job faz

Os três jobs fazem o mesmo preparo e só mudam o cenário:

1. checkout, **Node 24**, **pnpm do `packageManager`** com `--frozen-lockfile`, **k6 1.3.0** (versão fixa);
2. Postgres 16 e Redis 7 próprios do job (`servicos.sh subir`; senhas aleatórias mascaradas no log);
3. **migrações** da base-mestre (cria os papéis `sc_*` do cluster limpo) e **`seed:simulacao`** com semente
   `sc-2026` e referência `2026-11-01T18:00:00-03:00` (100 lojas, 1.000 pedidos, imagens em `apps/web/public/demo/simulacao/`);
4. **validação do seed** (`seed:simulacao:validar`): camada do banco logo após o seed e camada da aplicação com tudo no ar;
5. **API** (`apps/api/src/main.ts`, porta 3301) e **site de produção** (build `standalone`, porta 3300, com as
   imagens do seed copiadas para dentro dele), esperando `/v1/health/ready`;
6. **prova** de que uma vitrine e uma imagem do manifesto carregam (200, tipo de imagem, cabeçalho RIFF/WEBP);
7. **linha de base** do banco: 100 lojas, 10 pedidos em cada, nenhum pedido do k6, totais fechando, e a impressão SHA-256 dos 1.000 pedidos iniciais;
8. a **medição** (`executar-k6.sh`) e o **fechamento** (`finalizar.sh`: reconciliação, relatório, derruba os servidores).

Falha em qualquer passo do preparo encerra o job **antes** da medição (o passo do k6 é pulado, mas o
fechamento e a publicação dos artefatos rodam).

| Etapa      | Gatilho                 | Tráfego                                                                                    | Decide                                                                                                                                       |
| ---------- | ----------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke`    | PR para `main` e manual | 1 VU, 1 jornada dirigida na Cozinha do Benfica                                             | 100% dos checks, zero falhas, 201 na criação e 200 no replay com o mesmo pedido e total, imagem válida, **uma** compra nova no banco         |
| `carga`    | manual, `needs: smoke`  | 1→20 VUs em 2 min, 20 por 5 min, →0 em 1 min; ~80% navegação, ~20% compra, nas 100 lojas   | p95 catálogo < 500 ms, p95 criação < 1.000 ms, falhas inesperadas < 1%, zero total errado e zero replay divergente, as 100 lojas com tráfego |
| `estresse` | manual, `needs: carga`  | patamares de 20, 40 e 60 VUs (rampa 1 min + 2 min cada), volta a 1 VU e recupera por 2 min | registra o **primeiro patamar acima da meta**; reprova só por inconsistência de pedido ou por não recuperar as metas na janela final         |

## 3. A jornada (`tests/performance/k6/comum.js`)

- **Um comprador por VU.** Cada VU cria a própria conta (`POST /v1/auth/cadastro`, e-mail
  `k6-<rodada>-v<VU>-r<n>@simulacao.test`, telefone único) e usa o **cookie jar do VU como sessão de
  carrinho**. A conta é renovada (`-r<n+1>`) aos 12 min, antes de o token de 15 min vencer.
- **Uma chave por compra lógica:** `k6-<rodada>-<etapa>-v<VU>-i<iteração>`. É usada na criação e
  **reutilizada só no replay** da mesma compra.
- **Compra:** vitrine → fechamento → produto (primeira variação disponível e as escolhas mínimas dos grupos
  obrigatórios) → item → conferência → criar → **replay** (mesma chave, mesmo corpo) → consulta pelo token.
  Retirada ou entrega (alterna quando a loja faz as duas), com a quantidade necessária para passar do mínimo (≤ 9, fora da faixa de atacado).
- **Navegação:** vitrine → resumo e página do catálogo → logo e até 2 fotos de produto (`imagem`: 200,
  `image/*`, cabeçalho RIFF/WEBP) → às vezes a página `/loja/<apelido>` do site e o detalhe de um produto.
- **WhatsApp:** nunca é chamado. Só se confere que o `whatsapp.endereco` devolvido na criação é um `https://wa.me/…`.
- **Distribuição:** loja = iteração mod 100 (as 100 recebem tráfego); em cada "rodada" de 100 iterações, 20 são compra, deslocadas de modo que toda loja compra a cada 5 rodadas.
- **Smoke:** Cozinha do Benfica, 2 × "Marmita de frango grelhado" (R$ 20,00) com o adicional "Ovo frito"
  (R$ 3,00), retirada: **R$ 46,00 (4.600 centavos)** conferido na conferência, na criação, no replay e na consulta.

## 4. Métricas e thresholds

Etiqueta `op` em toda requisição: `cadastro`, `vitrine`, `pagina`, `catalogo`, `produto`, `imagem`,
`fechamento`, `carrinho`, `conferencia`, `criar`, `replay`, `consulta`. O resumo traz volume, req/s, p50/p90/p95/p99
e taxa de falhas **por operação**. No estresse a etiqueta `patamar` separa `rampa-20`, `p20`, `rampa-40`, `p40`,
`rampa-60`, `p60`, `descida` e `recuperacao`.

Thresholds explícitos (inclusive de checks): `checks`, `checks{essencial:sim}` (criar, replay, consulta e
imagem), `checks{verificacao:whatsapp}`, `falhas_inesperadas`, p95 por operação, `totais_errados`,
`replay_divergente`, `compras_criadas`, `replays_ok` e uma exigência `lojas_visitadas{loja:<apelido>} count>0`
para **cada uma** das 100 lojas. No smoke tudo é igualdade (`rate==1`, `count==0`/`==1`); na carga os checks
essenciais exigem > 99% (o mesmo 1% de falha tolerado nas requisições) enquanto total errado e replay
divergente têm tolerância zero.

## 5. Como o relatório separa o que deu errado

Cada ocorrência cai em **uma** classe (`relatorio.md`, tabela "Classificação das ocorrências"):

| Classe                         | O que é                                                                                                                                         | Quem decide               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **Lentidão**                   | p95 do catálogo ≥ 500 ms ou da criação ≥ 1.000 ms                                                                                               | k6 (thresholds)           |
| **Recusa de negócio prevista** | 409/422 explicado pelo estado visto na mesma iteração: loja fechada (`abertura.aberta=false`) ou subtotal abaixo do mínimo do `/fechamento`     | k6                        |
| **Falha de infraestrutura**    | tempo esgotado/sem resposta (status 0), 429, 5xx; ou um 500 sem pedido gravado                                                                  | k6 e banco                |
| **Pedido duplicado**           | mais de um pedido para a mesma chave de compra, no banco                                                                                        | **banco** (reconciliação) |
| **Defeito conhecido AC-516**   | 500 na confirmação **com o pedido gravado uma vez** (duas confirmações simultâneas com a mesma chave; corrigido no #134, ver §10). **Não é infraestrutura** | banco                     |
| Total incorreto                | total ≠ subtotal + taxa, ou consulta ≠ criação                                                                                                  | k6 e banco                |
| Rejeição inesperada            | qualquer 4xx fora do previsto (403, 401, 404, 400, 409/422 sem explicação)                                                                      | k6                        |

> **Por que a recusa prevista é deduzida do estado e não do corpo:** o corpo de erro da API é só
> `{codigo, mensagem, referencia}`; o motivo do 409 (`preco_divergente`, `carrinho_ja_virou_pedido`, loja
> fechada…) vai para o log do servidor e não para a resposta. O plano previa uma "lista fechada de motivos do
> corpo"; isso não é possível sem mudar a API. Por isso, qualquer 409/422 que o estado observado não explique é falha.
>
> **O AC-516 não é provocado:** o replay do cenário é sequencial (a mesma VU), então o defeito só aparece se
> uma resposta se perder e a repetição chegar enquanto a primeira ainda grava. Se aparecer, o banco o classifica.

## 6. Reconciliação dos pedidos

`reconciliar.ts` roda no fim de toda etapa e **reprova** (código ≠ 0) quando:

- algum dos **1.000 pedidos iniciais mudou** (impressão SHA-256 diferente da linha de base) ou alguma loja deixou de ter 10;
- alguma chave `k6-<rodada>-…` gerou **mais de um pedido**;
- os pedidos novos no banco ficam **fora da faixa** que o k6 explica: `compras_criadas + recuperadas ≤ novos ≤
compras_criadas + recuperadas + criações incertas` (no smoke, igualdade: 1.000 + 1);
- `1.000 + novos ≠ total na base`;
- o total ou o subtotal de **qualquer pedido novo** não fecha em centavos (total = Σ linhas + frete − desconto) ou
  uma linha dele não fecha (`line_total = unitário × quantidade`; o acréscimo das opções não pode passar do unitário).
  Os 1.000 iniciais continuam sendo conferidos com a fórmula do `seed:simulacao:validar`, provada na linha de base;
  **os pedidos novos usam a fórmula da API**, porque a convenção dela é outra (seção 9).

Um **replay bem-sucedido recupera a mesma compra e soma zero**: por isso `replays_ok` cresce e o total da base não.
As chaves cujo resultado ficou incerto no k6 (tempo esgotado ou 500, métrica `chave_incerta`) são extraídas do
JSON bruto (`--out json`, depois apagado) e o **banco** diz o que cada uma foi (1 pedido gravado → AC-516 se foi
500; 0 → falha de infraestrutura).

## 7. Artefatos de cada etapa (`tests/performance/saida/<etapa>/`)

`relatorio.md` e `relatorio.json` (consolidado) · `resumo.json` e `resumo.md` (k6) · `reconciliacao.json` e
`reconciliacao.md` · `linha-de-base.json` · `metadados.json` (SHA, ref, semente, data de referência, runner,
configuração) · `k6.json` (versão e intervalo medido) · `k6.log` · `chaves-incertas.json` ·
`validacao-do-seed/` (relatório, validação do banco e da aplicação, impressões, manifesto) · `api.log`,
`site.log`, `build-site.log`. As senhas dos serviços descartáveis ficam em `tests/performance/.servicos*.env`,
**fora** da pasta de artefatos e do git.

## 8. Limitações e escolhas (para quem for ler os números)

- **Limitador do catálogo levantado.** A API limita o catálogo a 60 consultas/min por endereço
  (`VITRINE_CATALOGO_LIMITE`); o k6 sai de um endereço só e mediria o limitador (429) em vez do catálogo. O
  ensaio sobe o limite para 1.000.000 e registra isso em `metadados.json`. Em produção o limite continua valendo.
- **Redis próprio do ensaio** (índice /6), limpo a cada preparo, para não herdar bloqueios do limitador.
- **API em `NODE_ENV=development`**, como no lançador do seed de simulação; o **site é o build de produção**.
  Os números da API podem diferir de uma API de produção.
- **Cadastro nas rampas.** Cada VU cria a conta na primeira iteração (hash argon2, CPU pesada). A operação
  `cadastro` fica fora dos thresholds; a renovação aos 12 min cai nas rampas.
- **Ordem do preparo:** seed → API → build do site → o standalone é **movido** para `saida/<etapa>/site/` (fora de
  `.next`) e recebe `public` (que já tem as imagens do seed) e `.next/static` → site. O `next build` escreve em
  `apps/web/.next`, a mesma pasta do e2e: o ensaio **espera até 20 min por uma janela sem e2e** (no CI nunca há um) e
  só então constrói. O `next dev` do Next 16 usa `.next/dev`, que o build preserva: convivem (o ensaio avisa e segue).
  Depois do build, um `next build` alheio já não derruba o site medido, porque ele roda de `saida/<etapa>/site/`
  (apagada no fechamento e fora do artefato).
- **Site em 127.0.0.1.** O Node liga `localhost` só em IPv6 (`::1`) no macOS e o k6 resolve `localhost` só para IPv4:
  com `HOSTNAME=localhost` o site responde ao Node e ao `curl` e dá _connection refused_ ao k6. O site sobe em
  `127.0.0.1` (as URLs dos cenários continuam `localhost`).
- **Cluster limpo no CI:** a migração da base-mestre cria os papéis `sc_*` antes do seed; o seed autentica
  esses papéis com as senhas do job e recusa se o cluster aceitar senha errada.
- **Dados:** só dados fictícios; senhas, tokens e URLs com credencial nunca vão para os artefatos. O perfil de
  simulação (tokens previsíveis, senha de dono conhecida) **nunca** pode mirar um servidor publicado.
- **k6 1.3.0** fixo (a versão atual do k6 é outra série; trocar é decisão consciente, não efeito de um
  `latest`). As actions de terceiros estão fixadas por SHA de commit.

## 9. Resultado do smoke real (19/11/2026)

Rodado no computador com `bash tests/performance/ambiente/local.sh smoke`: Postgres 16 e Redis 7 descartáveis
(porta 55440 e 63790), a base `simpleclick_simulacao` criada **dentro** do Postgres descartável pelo seed (a base
compartilhada do #135 não recebeu nenhum pedido), API na **3301** e site de produção na **3300**. O preview do
usuário (3000/3001) não foi tocado (respondeu 200 antes e depois).

|                      |                                                                         |
| -------------------- | ----------------------------------------------------------------------- |
| Veredito             | **APROVADO** (código 0): k6 e reconciliação                             |
| k6                   | v1.3.0 (`5870e99ae8`, go1.25.1, darwin/arm64)                           |
| SHA                  | `69cf0958ae92…` (com alterações locais não commitadas)                  |
| Semente / referência | `sc-2026` · `2026-11-01T18:00:00-03:00` (perfil do seed `2882eaec`)     |
| Runner               | local · Apple M4 · 10 CPUs · 16 GB · Node 24.18.0                       |
| Validação do seed    | APROVADO, 28 de 28 (banco e aplicação)                                  |
| Linha de base        | 100 lojas × 10 pedidos = 1.000, nenhum do k6, impressão `fdda5f18d091…` |
| Checks do k6         | 21 de 21; falhas inesperadas 0,00%                                      |

**A jornada (1 VU, Cozinha do Benfica, 0,4 s de medição):**

| passo                                                                              | resultado                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| cadastro, vitrine, página da loja, catálogo (2), produto (2), fechamento, carrinho | 200/201, 0% de falha                                   |
| imagens (logo e 2 fotos)                                                           | 200, `image/*`, cabeçalho RIFF/WEBP                    |
| conferência                                                                        | total esperado de **R$ 46,00 (4.600 centavos)**        |
| criar (primeira tentativa)                                                         | **201** (p95 45 ms)                                    |
| replay (mesma chave e mesmo corpo)                                                 | **200**, mesmo pedido e mesmo total (p95 18 ms)        |
| consulta pelo token                                                                | 200, mesmo pedido e total                              |
| WhatsApp                                                                           | só o link `https://wa.me/…` conferido; nenhuma chamada |

| operação | req |   p50 |   p95 |
| -------- | --: | ----: | ----: |
| catálogo |   2 | 13 ms | 14 ms |
| criar    |   1 | 45 ms | 45 ms |
| replay   |   1 | 18 ms | 18 ms |

(Uma amostra de 1 VU não é medida de capacidade: só prova a jornada.)

**Reconciliação com o banco: 1.000 iniciais + 1 nova = 1.001 pedidos; o replay somou zero.** Os 1.000 iniciais
ficaram idênticos (mesma impressão), as 100 lojas continuam com 10, a chave `k6-…` gerou 1 pedido e o total, o
subtotal e a linha do pedido novo fecham em centavos. Classes: lentidão 0 · recusa de negócio prevista 0 · falha
de infraestrutura 0 · duplicidade 0 · AC-516 0 · total incorreto 0 · rejeição inesperada 0.

### O que o ensaio real descobriu

1. **Site invisível para o k6 (corrigido, é do ensaio).** `HOSTNAME=localhost` fazia o Next ligar só em `::1`
   no macOS; o k6 resolve IPv4 e levava _connection refused_ nas imagens e na página (23,5% de falhas), enquanto
   o `curl` e o Node (provas do preparo) funcionavam. O site agora sobe em `127.0.0.1`.
2. **Convenção de `order_items` diferente entre o seed e a API (pendente, fora do meu escopo).** A API grava
   `unit_price_cents` = produto + acréscimo (2.300), `options_total_cents` = acréscimo **por unidade** (300) e
   `line_total = unit_price × quantity` (4.600) — o teste `apps/api/tests/carrinho-rota.int.test.ts:837-845`
   afirma isso. O seed grava unitário 2.000, `options_total` **por linha** (600) e a mesma `line_total`.
   O `seed:simulacao:validar` usa `line_total = unit × qty + options_total`, que reprova um pedido criado pela
   API. Por isso a reconciliação confere os 1.000 iniciais com a fórmula do seed e os **pedidos novos com a da
   API**. Avisado ao #135 e ao gerente; quem decidir mudar o seed deve alinhar com a API.
3. **Preço das opções não gravado (observação, não reprova).** No caminho do carrinho a API grava
   `order_item_options.price_delta_cents = 0` e guarda o acréscimo só em `options_total_cents`. A reconciliação
   registra a contagem desses itens (1 no smoke).
4. **O build do site disputa `apps/web/.next` com o e2e de outros cards** (`e2e/iniciar-site.mjs` roda
   `next build`, que apaga `.next`). O ensaio passou a esperar uma janela sem e2e e a servir o site de uma cópia
   em `saida/<etapa>/site/` (seção 8). Resta só a janela do próprio build (cerca de 1–2 min).

### Carga em perfil curto (validação extra, 19/11/2026)

`PERFIL=curto bash tests/performance/ambiente/local.sh carga` (durações ÷ 12, 42 s, até 20 VUs) contra a API
real, para provar o caminho da carga antes de o GitHub gastar 8 minutos: **APROVADA**, 49 compras (201) e 49
replays (200, mesmo pedido e total), **1.000 + 49 = 1.049 pedidos**, replay somando zero, zero duplicidade,
zero falha inesperada, p95 do catálogo **28 ms** e da criação **33 ms**. A cobertura das 100 lojas **não é
medida** nesse perfil (a série por loja só existe com threshold; o relatório agora diz "não medida" em vez de
"0 de 100"). Esse ensaio é só uma prova do mecanismo: **não vale como medida de capacidade.**

> **Não foram executados contra a API real neste card:** a carga e o estresse em **perfil completo** (8 e ~15
> min). Eles só rodam no GitHub (disparo manual). Do estresse, o card tem a validação de sintaxe e de
> estágios (`k6 inspect`) e o ensaio da lógica de patamares e recuperação contra um servidor simulado.

### Também validado, sem execução no GitHub

`actionlint` limpo no `desempenho.yml` · `k6 inspect` dos três cenários (estágios e thresholds esperados) ·
`bash -n` nos scripts · typecheck avulso (`tsc --strict`), ESLint e Prettier limpos em `tests/performance/`.

## 10. Carga com volume, trabalho fixo e antes × depois (card #142)

O relatório final de desempenho do curso está em [`docs/desempenho.md`](../desempenho.md). Esta seção só registra o
que o harness ganhou para ele; sem as variáveis novas, tudo acima continua igual.

| Variável / peça | O que faz |
| --- | --- |
| `VOLUME=sim` | o `preparar.sh` prova que o Postgres é o **descartável** (`descartavel.ts`: porta gravada pelo `servicos.sh`, `system_identifier` e nonce) e carrega os 100 mil pedidos do `seed:volume` (#138) entre a validação do seed (5) e a subida da API (6). A validação da camada da aplicação (7) só roda sem volume; com volume, o passo 9b prova o login dos donos e a fila. A saída do `seed:volume` desta carga fica em `saida/<rótulo>/volume/` e a do #138 (`packages/database/seed/volume/saida/`) é preservada por backup + `trap`. |
| `ROTULO=<nome>` | a pasta da saída (`saida/<rótulo>/`), para duas execuções da mesma etapa não se sobrescreverem. O `local.sh` recusa pasta que já existe. |
| cenário `conta` (carga) | o `setup()` cria 10 contas com 20 pedidos cada, em 2 lojas (`prepararContas`, op `preparo`); depois, 5 req/s constantes de `GET /v1/conta/pedidos` (op `meus_pedidos`) do minuto 2 ao 7. Cada resposta precisa ser **exatamente** a lista da conta (`isolamento_violado == 0`). |
| cenário `painel` (carga) | 2 donos (a menor e a maior loja em pedidos, gravadas na linha de base) abrem a fila a cada ~5 s (op `fila`) e tentam uma vez a fila da outra loja, que precisa ser recusada (`vazamento_painel == 0`). A senha de simulação vai pelo ambiente do processo do k6, nunca por `-e`. |
| janela de controle | os 2 primeiros minutos da jornada mista rodam sem `conta` nem `painel` (etiqueta `janela:controle`): servem para ver a deriva do ambiente entre execuções. |
| validade × metas | `resumo.json` separa `validade` (integridade, isolamento, trabalho fixo; tolerância zero) de `metasDeP95`. Uma execução pode ser **válida como medida e reprovar metas** (código 99 do k6): é o "antes" esperado. |
| `explicar-gargalo.ts` | no fim do preparo com volume: `EXPLAIN (ANALYZE, BUFFERS)` da chamada de `app.meus_pedidos` (como `sc_app`) e dos dois corpos versionados (0029 e 0074, como `sc_migrator`, só leitura), e qual corpo está vigente. |
| `comparar.ts` | `node tests/performance/ambiente/comparar.ts <antes...> -- <depois...>`: monta a tabela antes × depois e **recusa** se o harness, o perfil, a semente, o k6, o volume ou o trabalho fixo diferirem, ou se a diferença de migrações não for só a 0074. |
| `artefatos.ts` | copia para `docs/desempenho/<rótulo>/` só a lista fechada (resumo, relatório, reconciliação, `k6.json`, metadados com SHA curto e os EXPLAIN), sanitizada; recusa o arquivo se sobrar credencial, caminho de usuário, e-mail ou token. |

Testes destas peças: `node --test tests/performance/ambiente/*.test.ts` (33 testes; o caminho não está em nenhum
projeto do vitest nem no gate — incluir é decisão de quem mantém o gate).

A classe "defeito conhecido AC-516" continua no relatório para pegar regressão, mas o defeito foi **corrigido no
#134** (savepoint na criação): nas cargas completas do #142 ela ficou em zero.
