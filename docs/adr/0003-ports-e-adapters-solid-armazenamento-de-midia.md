# ADR 0003 — Pattern de design: Strategy/Adapter (SOLID: OCP e DIP) para o armazenamento de mídia

- **Estado:** aceita (já é o comportamento do código)
- **Formato:** MADR
- **Código:** `apps/api/src/core/armazenamento-de-midia.ts` (interface `ArmazenamentoDeMidia`, linha ~71; implementações `midiaNoCloudinary`, `midiaNoDisco`, versão em memória `MidiaEmMemoria`), consumidores `modules/catalog/midias.routes.ts`, `modules/stories/stories.routes.ts`, `core/limpeza-dos-stories.ts`

## Contexto e problema

Fotos, vídeos de produto e Stories precisam ser guardados em lugares diferentes: **Cloudinary** em produção, **disco** da API em desenvolvimento, **memória** nos testes, e nenhum onde não há configuração. As rotas de upload e a limpeza de Stories não podem saber qual deles está ativo.

## Alternativas consideradas

1. **`if (process.env.CLOUDINARY_URL) … else …` dentro de cada rota** (descartada). Viola o aberto/fechado (OCP): cada novo destino altera rotas já testadas; os testes dependem de variáveis de ambiente e de rede.
2. **Chamar o SDK do Cloudinary direto nos casos de uso** (descartada). Viola a inversão de dependência (DIP): a regra de negócio passa a depender do fornecedor, e o teste precisa de rede ou de mock global.

## Decisão

Uma interface pequena, `ArmazenamentoDeMidia` (`guardar`, `apagar`, `lugar`), com **uma implementação por destino**; a escolha é feita **uma vez**, na composição do app (`app.ts`, opção `armazenamento`), e injetada nas rotas e na limpeza.

| Princípio | Como aparece |
|---|---|
| **S** — responsabilidade única | cada adaptador só sabe guardar/apagar em um lugar |
| **O** — aberto/fechado | novo destino = novo adaptador, sem tocar nas rotas |
| **L** — Liskov | qualquer implementação responde igual (apagar o que não existe não é erro) |
| **I** — segregação de interfaces | só dois métodos; a rota não vê credenciais |
| **D** — inversão de dependência | rotas dependem da interface, não do Cloudinary |

## Consequências

- Bom: testes usam a versão em memória, sem rede; trocar de fornecedor é um arquivo.
- Ruim: uma camada a mais para quem lê; o contrato precisa cobrir o menor denominador comum (ex.: capa de vídeo pode ser nula).

## Evidência

`apps/api/src/core/armazenamento-de-midia.test.ts` (disco, Cloudinary e recusas) e os testes de rotas de mídia/Stories, que rodam com o armazenamento em memória.
