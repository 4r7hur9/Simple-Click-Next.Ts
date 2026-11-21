# Roteiro de apresentação — 10 minutos

Nível declarado: **Projeto A (avançado)**. Marcações **PENDENTE** serão preenchidas quando o card #142 (desempenho) fechar e após o primeiro push (link da execução da CI).

## 1. Problema e nível (1 min 30)

- Pequenas lojas vendem pelo WhatsApp sem vitrine, catálogo nem controle de pedido. O **SimpleClick** dá uma vitrine, o cliente monta o pedido e o envia pelo WhatsApp; o dono acompanha tudo num painel.
- Multi-loja: uma loja nunca vê dados de outra. Nível A: ADRs, C4, OpenAPI, observabilidade, testes de carga e uso de IA registrado.
- Mostrar: [README](../README.md) e [C4](c4/contexto.md).

## 2. Demonstração — sobe, roda, responde (3 min 30)

1. `docker compose up` (núcleo: roteador, PostgreSQL, Redis) e depois migrar → seed → `pnpm dev` (comandos no README).
2. `curl http://localhost:3001/v1/health/ready` → 200.
3. Fluxo: vitrine → sacola → fechar pedido (exige conta) → link do WhatsApp → painel do dono vê o pedido.
4. Repetir o envio com a mesma chave de idempotência: **200 com o mesmo pedido**, sem duplicar.
5. Rodar a suíte: `pnpm test:unit` e `pnpm test:int`. CI: [`ci.yml`](../.github/workflows/ci.yml) com 7 jobs (detalhes em [docs/ci.md](ci.md)); cobertura **80,1% linhas** (77,99% instruções, 79,75% funções, 71,07% ramos), com mínimos de 75/73/75/66. Link da execução verde: **PENDENTE — só existe após o push:** `<link>`.

Atenção: nunca usar as portas do preview do Arthur em demonstrações paralelas.

## 3. Uma decisão e a alternativa descartada (2 min)

- **Decisão:** todo acesso ao banco passa por `core/db.ts`, com transação e contexto da loja por requisição ([ADR 0002](adr/0002-database-pattern-prisma-e-sql.md)).
- **Descartada:** Prisma direto nas rotas. Um esquecimento vaza dados entre lojas sem erro nem log.
- Bônus se sobrar tempo: [ADR 0001](adr/0001-pedido-e-carrinho-na-mesma-transacao.md) (pedido e carrinho na mesma transação) e [ADR 0003](adr/0003-ports-e-adapters-solid-armazenamento-de-midia.md) (SOLID).

## 4. Números e o que faria diferente (3 min)

Números de [`docs/desempenho.md`](desempenho.md): **PENDENTE (#142)**. Enquanto isso, há medições reais já registradas em [`docs/estruturacao/05-desempenho.md`](estruturacao/05-desempenho.md) (k6 em ambiente local; confirmar qual rodada vale antes de citar):

| Medida | Valor | Fonte |
|---|---|---|
| p95 do catálogo (perfil curto, 42 s) | 28 ms — só prova o mecanismo, **não vale como capacidade** | `05-desempenho.md` linha ~243 |
| p95 da criação de pedido (perfil curto) | 33 ms — idem | idem |
| p95 criar / replay (verificação) | 45 ms / 18 ms | `05-desempenho.md` linhas ~201-202 |
| Limites aceitos (SLO) | catálogo < 500 ms, criação < 1.000 ms, falhas < 1% | `05-desempenho.md` linha ~66 |
| Ponto lento do volume (101.000 pedidos) | `app.meus_pedidos` 2,4 s | `docs/estruturacao/09-volume.md` |

O que faria diferente: converter os serviços `api`/`web` do compose (hoje placeholders nginx) em imagens reais; corrigir o 500 em confirmações simultâneas com a mesma chave (card #129); índice para `meus_pedidos`; ambiente de homologação para ensaiar mudança de preço.
