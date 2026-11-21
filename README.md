Nível: Projeto A

# SimpleClick

[![CI](https://github.com/4r7hur9/Simple-Click-Next.Ts/actions/workflows/ci.yml/badge.svg?branch=entrega/projeto-final)](https://github.com/4r7hur9/Simple-Click-Next.Ts/actions/workflows/ci.yml)

Vitrine, catálogo e pedidos para pequenas lojas. A loja ganha uma vitrine na internet, o cliente monta o pedido e envia pelo WhatsApp, e o dono acompanha tudo num painel.

- `apps/web`: site em Next.js + Tailwind (vitrine, painel, conta, administração).
- `apps/api`: API em Express, rotas em `/v1`.
- `packages/database`: PostgreSQL com Prisma (migrações em SQL e dados de exemplo).
- `packages/contracts`, `packages/core`, `packages/ui`: contrato (Zod), regras puras e componentes.

## Evidências da entrega

| Item | Onde |
|---|---|
| CI | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (7 jobs) · [docs/ci.md](docs/ci.md) · cobertura 80,1% linhas (mínimos 75/73/75/66 em linhas/instruções/funções/ramos) · **execução verde:** [run 44890192508](https://github.com/4r7hur9/Simple-Click-Next.Ts/actions/runs/44890192508) (commit `2ada0f4`, 8/8 jobs) |
| Desempenho | [docs/desempenho.md](docs/desempenho.md) (plano de p95, gargalo antes/depois e estresse com 101 mil pedidos) |
| Observabilidade | [docs/observabilidade.md](docs/observabilidade.md) (métricas RED, 1 trace, 1 SLO) |
| Deploy | [docs/deploy-railway.md](docs/deploy-railway.md) (roteiro Railway: staging e produção) |
| Uso de IA | [docs/ia.md](docs/ia.md) |
| Contribuidores | [CONTRIBUTORS.md](CONTRIBUTORS.md) |
| ADRs | [0001 pedido e carrinho](docs/adr/0001-pedido-e-carrinho-na-mesma-transacao.md) · [0002 Database Pattern](docs/adr/0002-database-pattern-prisma-e-sql.md) · [0003 SOLID / armazenamento de mídia](docs/adr/0003-ports-e-adapters-solid-armazenamento-de-midia.md) |
| C4 | [contexto](docs/c4/contexto.md) · [contêineres](docs/c4/containers.md) · [detalhado](docs/arquitetura/c4.md) |
| OpenAPI | [docs/openapi.yaml](docs/openapi.yaml) · [contrato/openapi.json](contrato/openapi.json) (gerado) · `pnpm openapi:verificar` |
| Roteiro de 10 minutos | [docs/apresentacao.md](docs/apresentacao.md) |

## Ambientes publicados

| Ambiente | Branch | Site | API |
|---|---|---|---|
| staging | `entrega/projeto-final` | `https://staging.DOMINIO` | `https://api.staging.DOMINIO` |
| produção | `main` | `https://DOMINIO` | `https://api.DOMINIO` |

> `DOMINIO` é o marcador: ainda não há domínio publicado. Troque pelo domínio real quando o deploy estiver no ar. O roteiro (Railway, variáveis e segredos por ambiente) está em [docs/deploy-railway.md](docs/deploy-railway.md).

## Subir com Docker (um comando)

Na raiz do repositório, com Docker instalado:

```bash
docker compose up --build
```

O comando sobe PostgreSQL, Redis, a migração (roda e sai), a API e o site, cada um só depois que o anterior estiver saudável. Endereços no seu computador:

- site: http://localhost:4000
- API: http://localhost:4001 (`/v1/health/live`)
- banco: `localhost:5544` · Redis: `localhost:6390`

Os segredos do `docker-compose.yml` são descartáveis e valem só para este ambiente local. Para parar: `docker compose down` (com `-v` apaga também o banco).

## Subir com pnpm dev (desenvolvimento)

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

## Mapa da documentação

| Tema | Onde |
|---|---|
| Decisões de arquitetura | [docs/adr/](docs/adr/) |
| Arquitetura (C4) | [docs/c4/](docs/c4/) e [docs/arquitetura/](docs/arquitetura/) |
| Contrato da API | [docs/openapi.yaml](docs/openapi.yaml) e [contrato/openapi.json](contrato/openapi.json) |
| Observabilidade | [docs/observabilidade.md](docs/observabilidade.md) |
| Desempenho | [docs/desempenho.md](docs/desempenho.md) e [docs/desempenho/](docs/desempenho/) |
| CI | [docs/ci.md](docs/ci.md) |
| Deploy | [docs/deploy-railway.md](docs/deploy-railway.md) e [docs/ambientes-e-deploy.md](docs/ambientes-e-deploy.md) |
| Uso de IA | [docs/ia.md](docs/ia.md) |
| Contribuidores | [CONTRIBUTORS.md](CONTRIBUTORS.md) |

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
- `pnpm start` é o modo de produção: **não** carrega o `.env` da raiz (só o `pnpm dev` carrega). Defina as variáveis no ambiente, como o deploy faz; rode `pnpm build` antes.

Planos, especificação e o README antigo, mais detalhado, ficam em `arquivo/`, só para consulta.
