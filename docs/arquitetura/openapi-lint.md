# OpenAPI: geração, lint e teste de contrato

Fonte única: os esquemas Zod de `packages/contracts`. Daí saem, pelo gerador
`apps/api/src/contracts/gerar.ts`:

| Arquivo                 | Para quê                                                         |
| ----------------------- | ---------------------------------------------------------------- |
| `contrato/openapi.json` | documento publicado para os apps nativos (conferido pelo portão) |
| `docs/openapi.yaml`     | o mesmo documento em YAML, no caminho que o curso espera         |

Versão: OpenAPI **3.1.1**.

## Comandos (rodar na raiz)

| Comando                  | O que faz                                                    |
| ------------------------ | ------------------------------------------------------------ |
| `pnpm openapi:gerar`     | regrava `contrato/openapi.json` e `docs/openapi.yaml`        |
| `pnpm openapi:verificar` | falha (exit 1) se JSON ou YAML estiverem defasados do código |
| `pnpm openapi:lint`      | Spectral sobre `docs/openapi.yaml`, falha em `warn` ou pior  |

**Para o card de CI:** chame `pnpm openapi:verificar && pnpm openapi:lint`.
O lint usa `npx --yes @stoplight/spectral-cli@6.15.0` (versão fixa): não
adiciona dependência nem mexe no lockfile, mas precisa de rede no primeiro uso
(cache do npx depois). Ruleset: `.spectral.yaml` (`spectral:oas`, com 3 ajustes
justificados no próprio arquivo).

## Teste de contrato

`apps/api/tests/contrato-openapi.test.ts` (projeto `api-int`, banco real): chama
a API de verdade (catálogo da vitrine, criação de pedido 201/200, GET do pedido
200/404, 401 e 400) e valida **status documentado + schema do corpo** contra
`contrato/openapi.json`. O validador (`apoio-de-contrato.ts`) é próprio, pois o
ajv 8 não é dependência direta; palavra-chave de schema desconhecida falha.

## Divergências que o teste de contrato achou (documentadas, não corrigidas)

- O 400 da borda de validação devolve `{erro:"entrada_invalida", campos:[…]}`,
  que o schema `Erro` não declarava → novo componente `ErroDeEntradaInvalida`.
- A API tem **dois formatos de erro**: plano (`{erro:"nao_encontrado"}`, rotas
  que respondem à mão) e envelope (`{erro:{codigo,mensagem,referencia}}`, do
  manipulador global `core/erros.ts`). Hoje o 404 de loja inexistente no
  catálogo sai no envelope e o do pedido por token, no plano. O documento
  aceita ambos (`anyOf`); unificar é decisão de código da API, fora deste card.
