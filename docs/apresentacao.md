# Roteiro de demonstração — 10 minutos

Os slides estão em [`apresentacao/index.html`](apresentacao/index.html) e a fala, em [`apresentacao/roteiro.md`](apresentacao/roteiro.md). Este arquivo guarda só o passo a passo da demonstração ao vivo. Projeto A (projeto final).

## 1. O problema (1 min 30)

- Pequenas lojas vendem pelo WhatsApp sem vitrine, catálogo nem controle de pedido. O **SimpleClick** dá uma vitrine, o cliente monta o pedido e o envia pelo WhatsApp; o dono acompanha tudo num painel.
- Uma loja nunca vê dados de outra.
- Mostrar: [README](../README.md) e [C4](c4/contexto.md).

## 2. Demonstração — sobe, roda, responde (3 min 30)

1. `docker compose up` (núcleo: roteador, PostgreSQL, Redis) e depois migrar → seed → `pnpm dev` (comandos no README).
2. `curl http://localhost:3001/v1/health/ready` → 200.
3. Fluxo: vitrine → sacola → fechar pedido (exige conta) → link do WhatsApp → painel do dono vê o pedido.
4. Repetir o envio com a mesma chave de idempotência: **200 com o mesmo pedido**, sem duplicar.
5. Rodar a suíte: `pnpm test:unit` e `pnpm test:int`. A CI está em [`ci.yml`](../.github/workflows/ci.yml) (detalhes em [docs/ci.md](ci.md)); cobertura **80,1% linhas**, com mínimos de 75/73/75/66. Execução verde: <https://github.com/4r7hur9/Simple-Click-Next.Ts/actions/runs/44890192508>.

Atenção: nunca usar as portas do preview do Arthur em demonstrações paralelas.

## 3. Uma decisão e a alternativa descartada (2 min)

- **Decisão:** todo acesso ao banco passa por `core/db.ts`, com transação e contexto da loja por requisição ([ADR 0002](adr/0002-database-pattern-prisma-e-sql.md)).
- **Descartada:** Prisma direto nas rotas. Um esquecimento vaza dados entre lojas sem erro nem log.
- Se sobrar tempo: [ADR 0001](adr/0001-pedido-e-carrinho-na-mesma-transacao.md) (pedido e carrinho na mesma transação).

## 4. Números e o que faria diferente (3 min)

Números de [`docs/desempenho.md`](desempenho.md):

| Medida | Valor |
|---|---|
| Gargalo “meus pedidos” (p95, mesma carga) | 481 ms → 9 ms |
| Estresse com 101 mil pedidos (20, 40 e 60 usuários) | 57.139 requisições, 0 falhas; saturação não encontrada |
| Limites aceitos | catálogo < 500 ms, criação < 1.000 ms, falhas < 1% |

O que faria diferente: ambiente de testes para ensaiar mudança de preço; guardar o resumo do corpo junto da chave de idempotência; corrigir o 500 em confirmações simultâneas com a mesma chave (card #129); rodar carga e estresse também no GitHub Actions; subir a pilha do zero e publicar o staging.
