Nível: Projeto A (avançado)

# SimpleClick

Vitrine, catálogo e pedidos para pequenas lojas. A loja ganha uma vitrine na internet, o cliente monta o pedido e envia pelo WhatsApp, e o dono acompanha tudo num painel.

- `apps/web`: site em Next.js + Tailwind (vitrine, painel, conta, administração).
- `apps/api`: API em Express, rotas em `/v1`.
- `packages/database`: PostgreSQL com Prisma (migrações em SQL e dados de exemplo).
- `packages/contracts`, `packages/core`, `packages/ui`: contrato (Zod), regras puras e componentes.

## Evidências da entrega

| Item | Onde |
|---|---|
| CI | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (7 jobs) · [docs/ci.md](docs/ci.md) · cobertura 80,1% linhas (mínimos 75/73/75/66 em linhas/instruções/funções/ramos) · execução verde: **PENDENTE — só existe após o push:** `<link da execução no GitHub Actions>` |
| Desempenho | **PENDENTE (#142):** `docs/desempenho.md` (enquanto isso, [medições k6](docs/estruturacao/05-desempenho.md)) |
| Uso de IA | [docs/ia.md](docs/ia.md) |
| Contribuidores | [CONTRIBUTORS.md](CONTRIBUTORS.md) |
| ADRs | [0001 pedido e carrinho](docs/adr/0001-pedido-e-carrinho-na-mesma-transacao.md) · [0002 Database Pattern](docs/adr/0002-database-pattern-prisma-e-sql.md) · [0003 SOLID / armazenamento de mídia](docs/adr/0003-ports-e-adapters-solid-armazenamento-de-midia.md) |
| C4 | [contexto](docs/c4/contexto.md) · [contêineres](docs/c4/containers.md) |
| OpenAPI | [contrato/openapi.json](contrato/openapi.json) · [docs/openapi.yaml](docs/openapi.yaml) · `pnpm openapi:verificar` |
| Roteiro de 10 minutos | [docs/apresentacao.md](docs/apresentacao.md) |

## Subir com 1 comando (Docker)

Depois do passo 2 abaixo (`setup.sh` cria `infra/compose/.env.compose`), na raiz:

```bash
COMPOSE_ENV_FILES=infra/compose/.env.compose docker compose up -d
```

Sobe roteador (Traefik), PostgreSQL, Redis e os serviços `api`/`web` **do compose, que ainda são placeholders nginx**: a API e o site reais rodam com `pnpm dev` (passo 7). O `docker-compose.yml` da raiz só estende o de `infra/compose/`, sem duplicar configuração e sem segredos. Banco de teste: `docker compose --profile test up -d`.

## Como subir na sua máquina

Precisa de Node 24, pnpm 11 e Docker. Rode na ordem:

```bash
pnpm install                                 # 1. dependências e cliente do Prisma
bash infra/scripts/setup.sh                  # 2. cria infra/compose/.env.compose e o certificado local
cp .env.example .env                         # 3. preencha os valores (troque os TROQUE_*)
bash infra/scripts/up.sh core test           # 4. PostgreSQL, Redis e banco de teste; só volta quando estiverem saudáveis
pnpm --filter @simpleclick/database migrar   # 5. aplica as migrações
pnpm --filter @simpleclick/database seed     # 6. dados de exemplo
pnpm dev                                     # 7. site em :3000 e API em :3001
```

Ordem obrigatória: `up` → **migrar** → **seed** → demo (`pnpm dev`). Migrar antes do seed, e os dois depois do `up`.

Avisos:

- `setup.sh` **reinicia o Traefik se ele já estiver no ar** (para reler o certificado local); conexões abertas por ele caem por alguns segundos.
- `pg_dump`, `pg_restore` e `psql` (pré-requisito da prova de cópia de segurança, veja "Sobre `pnpm test:int`"): instale o `libpq` e aponte `PG_BIN`.
- Portas 3000/3001 (site e API) precisam estar livres. Para conferir que a API subiu bem:

```bash
curl -i http://localhost:3001/v1/health/live    # o processo está de pé
curl -i http://localhost:3001/v1/health/ready   # 200 se PostgreSQL e Redis respondem; 503 se algum não
```

`/v1/health/ready` exige **as duas** dependências: com o Redis parado ele dá 503 mesmo que o pedido não use Redis (detalhes em [Arquitetura](docs/arquitetura/c4.md)).

## Arquitetura e contrato

- [Arquitetura C4](docs/arquitetura/c4.md): contexto e contêineres (Web, API, PostgreSQL, Redis), usos do Redis e prontidão.
- [ADR 0001 — pedido e carrinho na mesma transação](docs/adr/0001-pedido-e-carrinho-na-mesma-transacao.md): quem grava a compra e por que um reenvio devolve o mesmo pedido.
- [Contrato da API (`contrato/openapi.json`)](contrato/openapi.json): **gerado** a partir de `packages/contracts` com `pnpm --filter @simpleclick/api run contrato:escrever`; não edite à mão.
- [Trecho OpenAPI dos pedidos](docs/arquitetura/openapi-pedidos.yaml): `POST /v1/vitrine/{apelido}/pedidos` (201 na criação, 200 no reenvio) e `GET /v1/vitrine/{apelido}/pedido/{token}`, com exemplos. Existe porque o gerado ainda não distingue 201 de 200, não traz esse `GET` nem exemplos.

Quem calcula o preço: o servidor (`packages/core`). Quem grava a compra: a rota de pedidos da API, numa transação. A resposta a um reenvio vem do pedido guardado no PostgreSQL, achado pela chave de idempotência.

## Scripts

| Comando                     | O que faz                                     |
| --------------------------- | --------------------------------------------- |
| `pnpm dev`                  | site e API em modo de desenvolvimento         |
| `pnpm build` / `pnpm start` | compila e roda site e API                     |
| `pnpm typecheck`            | confere os tipos                              |
| `pnpm lint` / `pnpm format` | ESLint e Prettier                             |
| `pnpm test:unit`            | testes de unidade                             |
| `pnpm test:int`             | testes contra banco e Redis (precisa do `up`) |
| `pnpm openapi:verificar`    | falha se o contrato OpenAPI estiver defasado  |

Sobre `pnpm test:int`:

- Roda com `--continue`: uma falha num pacote (por exemplo, `database`) não esconde os testes dos pacotes seguintes (`api`); o comando ainda termina com erro se algum falhar.
- Os limites de requisição da API contam num Redis à parte (índice 15 do servidor de `REDIS_URL_TEST`), e não no de desenvolvimento.
- A prova da cópia de segurança (`packages/database/src/copia-de-seguranca.test.ts`, AC-052) usa `pg_dump`, `pg_restore` e `psql` de verdade. Sem eles na máquina a suíte é **pulada** com aviso; na CI (`CI` definida) a falta deles reprova. Para rodá-la: `brew install libpq` e `export PG_BIN="$(brew --prefix libpq)/bin"` (ou instale o PostgreSQL 16+ e deixe `pg_dump` no `PATH`).
- `pnpm start` carrega o `.env` da raiz como o `pnpm dev`; rode `pnpm build` antes.

Planos, especificação e o README antigo, mais detalhado, ficam em `arquivo/`, só para consulta.
