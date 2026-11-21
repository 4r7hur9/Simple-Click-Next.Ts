# Observabilidade — métricas RED, 1 trace e 1 SLO (card #139)

O curso (M3) pede *logs estruturados, métricas RED, 1 trace e 1 SLO declarado*. O SimpleClick entrega os quatro:

| Pilar | O que existe | Onde |
|---|---|---|
| Logs estruturados | pino em JSON, lista de permissão de campos (sem PII), `requisicaoId` em toda linha, agora com `traceId`/`spanId` | `apps/api/src/core/log.ts`, `docs/estruturacao/06-operacao.md` |
| Métricas RED | `http_requests_total` e `http_request_duration_seconds` por método, **rota (molde)** e status, em `GET /metrics` | `apps/api/src/core/metricas.ts` |
| 1 trace | criação de pedido: HTTP → caso de uso `pedido.criar` → consultas ao Postgres, exportado ao Jaeger (OpenTelemetry) | `apps/api/src/core/rastreamento.ts` |
| 1 SLO | 99% das criações de pedido válidas respondem com sucesso em menos de 1 s, em 28 dias | seção [SLO](#slo-declarado) e `infra/compose/regras-slo.yml` |

## 1. Métricas RED

`GET /metrics` (formato Prometheus) expõe:

| Métrica | Tipo | Rótulos | RED |
|---|---|---|---|
| `http_requests_total` | counter | `method`, `route`, `status_code` | **R**ate e **E**rrors (`status_code=~"5.."`) |
| `http_request_duration_seconds` | histogram (buckets 5 ms … 5 s, com `le="1"`) | `method`, `route`, `status_code` | **D**uration |
| `process_*`, `nodejs_*` | métricas padrão do processo | — | USE básico |

### Cardinalidade (o que NÃO entra nos rótulos)

- `route` é o **molde** (`/v1/vitrine/:apelido/pedidos`), nunca o endereço pedido: id, token de pedido, telefone, apelido de loja e query string não chegam ao Prometheus.
- `method` é lista fechada (`GET POST PUT PATCH DELETE HEAD OPTIONS`); o resto vira `OUTRO`.
- Sem molde: `nao_encontrada` (404 sem rota) ou `nao_roteada` (resposta dada por um middleware antes de rotear: CORS, aceite, portão da equipe).
- `status_code` é o código ou `cancelada` (o cliente fechou a conexão antes da resposta).
- Teste de guarda (`metricas.test.ts`): nenhum roteador é montado em caminho com `:param` (o molde seria truncado e o valor vazaria).

### Proteção do endpoint (fechado por padrão)

| Configuração | `/metrics` |
|---|---|
| nada definido | **404** (a rota nem existe) |
| `METRICAS_TOKEN` (≥ 32 caracteres) | exige `Authorization: Bearer <token>`; sem ele, **401**. Comparação por `timingSafeEqual` sobre sha256 |
| `METRICAS_ABERTAS=sim` (sem token) | aberto, **só fora de produção e com `NODE_ENV` declarado**; em `production` a API recusa partir |
| `NODE_ENV` ausente e sem token | desligado |

O token se gera com `openssl rand -hex 32` e nunca é registrado nem aparece em mensagem de erro. A rota é montada **antes** do registro de requisição: não gera log, span nem métrica de si mesma. Em produção, além do token, publique a porta só na rede interna (o Prometheus raspa por dentro).

## 2. O trace da criação de pedido

```
POST /v1/vitrine/:apelido/pedidos            (SERVER, raiz nova por requisição)
├─ prisma:client:transaction  ×N              (cada acesso ao banco: resolve a loja, identidade, cliente…)
└─ prisma:client:transaction                  (a transação do pedido)
   └─ pedido.criar                            (caso de uso, `medirEtapa`)
      └─ prisma:client:operation → prisma:client:db_query   (SQL parametrizado, `db.query.text`)
```

Um trace real (131 spans, 37 ms) está em [`observabilidade/trace-pedido.json`](observabilidade/trace-pedido.json) e resumido em [`observabilidade/trace-pedido-resumo.txt`](observabilidade/trace-pedido-resumo.txt).

- **OpenTelemetry**, instrumentação manual: o span SERVER sai de `middlewareDeRastreamento`; o do caso de uso, de um invólucro mínimo em `criarPedido`; o do Postgres, de `@prisma/instrumentation` (liga só o ajudante global do Prisma, sem `--import` nem *monkey-patch*).
- **Opcional:** sem `OTEL_EXPORTER_OTLP_ENDPOINT` nenhum provedor é registrado e a API sobe normalmente (coberto em `main.test.ts`, inclusive com o coletor inalcançável). A fila de exportação é limitada (2048 spans, 5 s): se o Jaeger cair, o trace se perde e a requisição não espera.
- **Correlação com os logs:** as linhas `requisicao.iniciou` e `requisicao.terminou` levam `traceId` e `spanId`; o span SERVER leva `simpleclick.requisicao_id` igual ao cabeçalho `x-request-id` da resposta. Do log ao trace: procure o `traceId` no Jaeger. Do trace ao log: filtre o log por `requisicaoId`.
- **Sem dado de pessoa nos spans:** o exportador é uma *lista de permissão* (`exportador-higienizado.ts`). Saem só `http.request.method`, `http.route`, `http.response.status_code`, `error.type`, `simpleclick.requisicao_id`, `db.system`, `db.query.text` e `db.operation.name`. Eventos de exceção, links, `status.message` e `traceState` são descartados; erro vira só `ERROR` + o *nome* da classe. O SQL é parametrizado (os valores não vão junto). `trace-do-pedido.test.ts` varre o JSON de todos os spans de uma compra real, de um acompanhamento por token e de uma recusa, e não acha nenhuma sentinela.
- **Cada requisição abre um trace novo:** `traceparent`/`tracestate` do cliente são ignorados.
- A sonda de saúde (`/v1/health/*`) não gera trace.

## SLO declarado

> **99% das criações de pedido válidas respondem com sucesso (2xx) em menos de 1 segundo, medido em janela móvel de 28 dias.**

- **Indicador (SLI):** razão entre as criações *boas* e as *válidas*.
  - *Válida* = `POST /v1/vitrine/:apelido/pedidos` que não terminou em 4xx (erro do cliente: preço divergente, produto esgotado, validação) nem foi cancelada pelo cliente.
  - *Boa* = válida, com 2xx e duração ≤ 1 s (bucket `le="1"` do histograma). Repetição idempotente (200) conta como boa.
- **Meta (SLO):** 99% em 28 dias.
- **Nota sobre o rótulo `le`:** a API emite `le="1"`, mas o Prometheus 3 normaliza para `le="1.0"` ao gravar; por isso a consulta usa `le=~"1(\\.0)?"`, que vale nas duas formas (descoberto ao consultar o Prometheus real).
- **Orçamento de erro:** 1%, ou seja, **10 criações lentas ou com falha a cada 1.000** válidas (a 100 pedidos/dia, ~28 por janela).
- **Consulta PromQL que mede** (a regra `slo:pedido_criar:atendimento:28d`):

```promql
sum(increase(http_request_duration_seconds_bucket{method="POST",route="/v1/vitrine/:apelido/pedidos",status_code=~"2..",le=~"1(\\.0)?"}[28d]))
/
sum(increase(http_request_duration_seconds_count{method="POST",route="/v1/vitrine/:apelido/pedidos",status_code!~"4..|cancelada"}[28d]))
```

- **Orçamento gasto** (1 = acabou; a regra `slo:pedido_criar:orcamento_gasto:28d`):

```promql
(1 - slo:pedido_criar:atendimento:28d) / 0.01
```

- **Alertas por taxa de queima** (`infra/compose/regras-slo.yml`):

| Alerta | Condição | Significa |
|---|---|---|
| `PedidoCriarQueimaRapida` (página) | razão de erro > 14,4 × 1% em **1 h e 5 min** | gasta 2% do orçamento por hora |
| `PedidoCriarQueimaLenta` (ticket) | razão de erro > 6 × 1% em **6 h e 30 min** | gasta 5% do orçamento a cada 6 h |

- **Se o orçamento acabar:** congela mudança não essencial em criação de pedido até a janela se recompor.
- **Limites honestos:** o SLO está *declarado e instrumentado*; a medição real em carga depende do teste de carga do #131. Pedido repetido por replay conta junto (é 2xx rápido). A métrica não distingue loja: um problema numa loja só aparece diluído (de propósito, por cardinalidade). `nao_roteada` agrupa o que um middleware responde antes de rotear.

## 3. Perfil `obs` do compose

```bash
# sobe só Prometheus e Jaeger (rede própria `observacao`, portas só em 127.0.0.1)
docker compose -f infra/compose/docker-compose.yml --profile obs up -d prometheus jaeger
```

| Serviço | Imagem | Porta (só loopback) |
|---|---|---|
| Prometheus | `prom/prometheus:v3.5.0`, retenção de 30 dias (cobre os 28 do SLO) | `9090` |
| Jaeger | `jaegertracing/jaeger:2.10.0`, armazenamento em memória | UI `16686`, OTLP/HTTP `4318` |

O Prometheus raspa a API **que roda no host** (`host.docker.internal:${PORTA_API_METRICAS:-3001}`). O Jaeger guarda em memória: reiniciar o contêiner apaga os traces (é de desenvolvimento). Sem `docker compose` no `setup.sh`: o comando acima é o caminho oficial.

## 4. Como reproduzir (evidências)

1. Suba o perfil: comando da seção 3 (com `PORTA_API_METRICAS` na porta em que a API vai rodar; **não** use 3000/3001 se o preview estiver no ar).
2. Rode a API com as variáveis:
   ```bash
   METRICAS_ABERTAS=sim NODE_ENV=development \
   OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
   PORT=3101 pnpm --filter @simpleclick/api dev
   ```
3. Faça uma criação de pedido (pelo site ou pela API) e abra `http://localhost:16686`, serviço `simpleclick-api`, operação `POST /v1/vitrine/:apelido/pedidos`.
4. `curl localhost:3101/metrics | grep http_request` e, no Prometheus (`localhost:9090`), a consulta do SLO.

Atalho automatizado (banco descartável, porta 3101, grava o recorte do `/metrics`):

```bash
PORTA_API_METRICAS=3101 docker compose -f infra/compose/docker-compose.yml --profile obs up -d prometheus jaeger
EVIDENCIA_OBSERVABILIDADE=1 PORTA_API_METRICAS=3101 \
  npx vitest run --project api-int apps/api/tests/evidencia-de-observabilidade.test.ts
```

Evidências salvas em [`docs/observabilidade/`](observabilidade/): `metrics.txt` (recorte do `/metrics`), `trace-pedido.json` (o trace pela API do Jaeger) e `slo-promql.json` (a consulta do SLO no Prometheus).

## 5. Testes

| Arquivo | Cobre |
|---|---|
| `core/metricas.test.ts` | rótulos por molde, 404/`nao_roteada`, `OUTRO`, `cancelada`, bucket `le="1"`, sentinelas ausentes, 404/401/200 do `/metrics`, guarda de `:param` |
| `core/observabilidade.test.ts` | token curto, `METRICAS_ABERTAS` recusada em produção, endpoint inválido/com credencial/http remoto em produção |
| `core/log-papel-e-rota.test.ts` | papel de maior privilégio, rota com prefixo em 4xx e erro, contexto aninhado sem herdar credencial, `traceId` e `telefone` no log |
| `core/exportador-higienizado.test.ts` | exceção, `status.message`, links e atributos sentinela não saem |
| `core/rastreamento.test.ts` | `medirEtapa`, raiz nova (ignora `traceparent`), 5xx, sonda sem trace |
| `main.test.ts` | sobe sem Jaeger, com coletor inalcançável, `/metrics` fechado/com token, recusa de token curto |
| `tests/trace-do-pedido.test.ts` | trace ponta a ponta de uma compra real, ligado ao log e sem PII |
