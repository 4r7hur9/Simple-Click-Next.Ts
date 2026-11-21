# Estruturação 4 — Seed de simulação: 100 lojas e 1.000 pedidos

Cards #130 (plano v6) e #135 (execução) · executado em 19/11/2026 · seção 4 do plano (`Simple_Click_Plano_de_Estruturacao.md`).

> **Só na máquina local.** O perfil grava senha conhecida (`DemoSimpleClick2026`) e tokens de pedido previsíveis. Ele recusa produção, banco remoto e qualquer base que não seja `simpleclick_simulacao`. O k6 (card #131) **nunca** pode mirar um servidor publicado.

## Comandos

Todos rodam a partir de `packages/database` (`pnpm --filter @simpleclick/database <script>`) e leem o `.env` da raiz.

| Script | O que faz |
|---|---|
| `seed:simulacao -- --semente <texto> --referencia <ISO com fuso> [--recriar] [--falhar-apos N] [--aceitar-trust] [--banco simpleclick_simulacao_xxx]` | Guarda → cria a base (ou recria com `--recriar`) → autentica os papéis → migra → grava **uma loja por transação** → escreve `saida/manifesto.json` e `saida/impressoes.json`. |
| `seed:simulacao:aplicacao` | Sobe a API em `http://localhost:3201` e o site (`next dev`) em `http://localhost:3200`, apontados só para a base da simulação. Fica no ar até Ctrl+C. |
| `seed:simulacao:validar -- [--site http://localhost:3200 --api http://localhost:3201]` | Valida o banco e, com `--site` e `--api`, a aplicação. Escreve `validacao-banco.json`, `validacao-aplicacao.json` e `relatorio.md`. Sai com 0 só se tudo passar. |

`--semente` e `--referencia` são obrigatórios e não têm valor padrão. A referência é o "agora" do perfil e precisa de fuso (`Z` ou `±HH:MM`). A validação, sem os dois, usa os do manifesto.

Repetir `seed:simulacao` com os mesmos parâmetros completa o que faltou: o resto vira upsert, e o pedido entra com `DO NOTHING`. Se a base já tem lojas de **outro** perfil (outra impressão em `stores.code`), o comando recusa e pede `--recriar`. `--falhar-apos N` existe só para provar a retomada: ele para com o código de saída 3 depois de gravar N lojas.

## O perfil

- **100 lojas**, clonadas dos 22 modelos de `seed/demo/lojas` (`i mod 22`, de 4 a 5 por segmento). O nome é `<tipo> <do/da/de> <bairro>`, com 100 bairros distintos de Fortaleza (`bairros.ts`). O apelido é o slug do nome, e a loja 000 é sempre a **Cozinha do Benfica** (FOOD_MARMITA).
- Cada loja tem dono próprio (`dono@<apelido>.simulacao.test`, senha `DemoSimpleClick2026`), contatos sintéticos (`+55859…`, `.test`), capa própria e abre 24 h. `stores.code` é `SIM-<impressão de 8 hex>-NNN`.
- **Catálogo:** 2 categorias (as duas maiores do modelo) e 8 produtos publicados por loja. A semente varia o preço em ±10 %, arredondado a R$ 0,50 (vale para preço, promoção, custo e opções de eixo). O estoque é 9999 no varejo. Nas lojas `GROCERY`, `HARDWARE`, `STATIONERY`, `AUTO_PARTS` e `PET_SHOP`, 1 produto de preço único tem a faixa de atacado `WHOLESALE` (10 un., 5 %, `variant_id` nulo).
- **Pedidos:** 10 por loja (`sim-NNN:pedido:K`, números 1001…1010, códigos `A-1001`…`A-1010`):
  - 1 PENDING, 1 ACCEPTED e 2 PREPARING;
  - 2 intermediários: 1 READY_FOR_PICKUP + 1 OUT_FOR_DELIVERY, ou 2 na única modalidade da loja;
  - 3 COMPLETED e 1 CANCELLED, com motivo.

  Os ativos ficam entre 30 e 240 min antes da referência. Os demais ficam de 1 a 6 dias antes, entre 11 h e 21 h de Fortaleza.
- **Pedido-prova:** Cozinha do Benfica, `A-1007`, COMPLETED, entrega. São 2 × "Marmita de frango grelhado" (R$ 20,00) com "Ovo frito" (R$ 3,00), mais R$ 5,00 de frete: **R$ 51,00 (5100)**.
- A escrita (imagens WebP, store_settings, catálogo, retrato histórico do item, histórico de status, sequência) é a do seed de demonstração. A única mudança em `seed/demo/index.ts` é acrescentar `export` em `Contexto`, `prepararLoja`, `plantarCatalogo`, `idDoProdutoDemo`, `plantarClientes`, `plantarPedidos` e `atualizarTotaisDosClientes`.
- As imagens vão para `apps/web/public/demo/simulacao/<apelido>/`, fora do git: 1.208 arquivos, 30 MB.

## Guarda de banco (D-2)

O comando recusa **antes de conectar** quando:
- `NODE_ENV=production`;
- o banco não casa com `^simpleclick_simulacao(_[a-z0-9]+)?$`, ou é o mesmo de `DATABASE_URL`, `DATABASE_URL_DIRETA` ou `DATABASE_URL_TEST`;
- o host não é `localhost`, `127.0.0.1` ou `::1`;
- a query string traz `host`, `hostaddr` ou `service`.

A regra de host vale para `DATABASE_URL_DIRETA`, `DATABASE_URL` e `REDIS_URL` (`rediss` também é recusado).

Depois de conectar:
- cada conexão confere `SELECT current_database()`;
- o banco nasce com `COMMENT ON DATABASE … 'simpleclick-simulacao'`;
- `--recriar` só faz DROP com esse marcador presente e com todas as lojas `SIM-` (conferido pela conexão de superusuário);
- antes de migrar, `sc_migrator`, `sc_app` e `sc_admin` precisam autenticar com as senhas do `.env`, e uma senha errada precisa ser recusada. Se o cluster estiver em `trust`, o comando só segue com `--aceitar-trust`.

O lançador da aplicação:
- usa a mesma guarda;
- monta o ambiente dos servidores do zero: o banco da simulação, o Redis `/5`, `JWT_SECRET` e segredos aleatórios só na memória, e `SEGUNDO_PLANO=desligado`;
- recusa se houver `DATABASE_URL_ADMINISTRACAO` ou um `next dev` do site já rodando;
- antes de liberar, confere que API e site servem `cozinha-do-benfica`, loja que não existe na dev.

## Manifesto para o k6 (card #131)

**Caminho:** `packages/database/seed/simulacao/saida/manifesto.json` (a pasta `saida/` tem `.gitignore` próprio). Ele é gerado a cada `seed:simulacao` a partir do que ficou no banco, e é byte a byte igual entre execuções do mesmo perfil.

```jsonc
{
  "versao": 1,
  "perfil": { "semente": "sc-2026", "referencia": "2026-11-01T18:00:00-03:00",
              "impressao": "2882eaec", "banco": "simpleclick_simulacao",
              "lojas": 100, "pedidosPorLoja": 10 },
  "lojas": [{
    "indice": 0, "codigo": "SIM-2882eaec-000",
    "apelido": "cozinha-do-benfica", "nome": "Cozinha do Benfica",
    "segmento": "FOOD_MARMITA", "bairro": "Benfica",
    "modalidades": ["DELIVERY", "PICKUP"],
    "logo": "/demo/simulacao/cozinha-do-benfica/logo.webp",
    "capa": "/demo/simulacao/cozinha-do-benfica/capa.webp",
    "produtos": [{
      "id": "uuid", "slug": "marmita-carne-de-sol", "nome": "…",
      "precoCents": 2150,            // menor preço (com variantes, o da mais barata)
      "categoria": "marmitas",
      "imagem": "/demo/simulacao/…-1.webp",
      "destaque": true, "noFeed": true, "comVariantes": true,
      "atacado": null                 // ou { "minimo": 10, "descontoPercent": 5 }
    }],
    "pedidos": { "quantidade": 10, "codigos": ["A-1001", "…", "A-1010"] }
  }]
}
```

Para o k6:
- **Rotas públicas:** `GET /v1/vitrine/:apelido`, `GET /v1/vitrine/:apelido/catalogo`, `GET /v1/vitrine/:apelido/produto/:id` e `GET /v1/vitrine/:apelido/pedido/:token`.
- **Painel:**
  - `POST /v1/auth/login` com `{ email, senha }` e o cabeçalho `Origin: http://localhost:3200` (sem `Origin` a API responde `origem_nao_autorizada`);
  - depois, `Authorization: Bearer <tokenDeAcesso>` em `GET /v1/lojas/:apelido/pedidos?dia=AAAA-MM-DD` e `GET /v1/lojas/:apelido/pedidos/:id`.
- **Login:** `dono@<apelido>.simulacao.test` / `DemoSimpleClick2026`. O e-mail não está no manifesto (nenhuma saída leva contato) e é montado pelo apelido.
- **Tokens de acompanhamento:** não saem em arquivo nenhum. Quem precisar calcula com `tokenDoPedido("sim-NNN:pedido:K")` (`seed/simulacao/perfil.ts`).
- **Imagens:** são servidas pelo site, no mesmo caminho do manifesto (`http://localhost:3200/demo/simulacao/...`).

## Resultados reais (19/11/2026, revisão `69cf095` + alterações deste card)

Perfil: `--semente sc-2026 --referencia 2026-11-01T18:00:00-03:00`, impressão `2882eaec`.

| Verificação | Resultado | Evidência |
|---|---|---|
| `pnpm --filter @simpleclick/database typecheck` | ✅ | sem erros |
| `pnpm --filter @simpleclick/database lint` | ✅ 0 erros | 11 avisos: 4 já existentes em `seed/winsis/` e 7 de `max-params`/`max-depth` nos arquivos novos. Fronteira `pkg-database` ↛ `pkg-core` respeitada: as transições estão copiadas em `transicoes.ts`, e `transicoes.test.ts` prova que batem com `proximosStatus` |
| `pnpm vitest run --project db-rls packages/database/seed/simulacao/` | ✅ 61/61 | `parametros.test.ts` 21, `perfil.test.ts` 24, `validar.test.ts` 15, `transicoes.test.ts` 1 |
| `demo.test.ts` (T-1) | ⚠ falha que já existia | `beforeAll` estoura 600 s **com e sem** os `export` (rodado também sobre uma cópia temporária com o `index.ts` original, já apagada): 6 ok, 5 pulados nos dois casos. A T-1 foi validada pelo typecheck e pelo diff, que mostra só 7 linhas `x` → `export x`. |
| Guarda: recusas sem conectar | ✅ | `--banco simpleclick_dev` e `simpleclick_test` → exit 2; `NODE_ENV=production` → exit 1; host `db.exemplo.com` → exit 1; `?host=` na URL → exit 1; sem `--semente` → 2; referência sem fuso → 2; `--site` remoto → 2. A dev seguiu com 0 lojas `SIM-`. |
| Carga com `--recriar --falhar-apos 37` | ✅ | base recriada pelo marcador, papéis autenticados, senha errada recusada, 69 migrações aplicadas; parou com exit 3 depois de 37 lojas: **37 lojas e 370 pedidos** no banco |
| Repetição sem `--falhar-apos` | ✅ | "a base já tem 37 loja(s) deste perfil: completando"; **100 lojas e 1.000 pedidos**, 630 pedidos novos; ≈ 1 s por loja |
| Segunda execução | ✅ | 0 pedidos novos; impressão dos ids `abd1ec67125c4176778fe567486ab5640141d17471e04cbc0c903d7485dda55b` e do conteúdo `f90eb2cb618428a8eb0c5443be59c3af71cc4f6efd0fe8f509864223f41ecf9b`, iguais nas duas execuções; `manifesto.json` byte a byte igual (`cmp`). A impressão dos ids do banco é a mesma calculada no plano puro. |
| `seed:simulacao:aplicacao` | ✅ | API :3201 e site :3200 na base `simpleclick_simulacao`, Redis `/5`; os dois servindo `cozinha-do-benfica` |
| `seed:simulacao:validar` — banco | ✅ 17/17 | ver `saida/relatorio.md` |
| `seed:simulacao:validar` — aplicação | ✅ 11/11 (total **28/28, APROVADO**, 8 min 51 s) | 100 vitrines e 100 catálogos na API com os 8 produtos do manifesto; 22 faixas de atacado na página do produto; 100 páginas `/loja/<apelido>` no site; 100 logos, 100 capas e 800 imagens principais com HTTP 200, `image/webp`, decodificadas pelo sharp e com as dimensões do acervo, mais 208 fotos extras (208 esperadas); 151 acompanhamentos (1 por status em cada segmento) batendo status, código e total; painel em 22 lojas (login, fila do dia e detalhe; 46 consultas); detalhe do pedido-prova com 5100 / 2000 / 4600 |
| Varredura das saídas | ✅ (no teste e com `grep` nos arquivos finais) | `manifesto.json`, `impressoes.json`, `validacao-*.json` e `relatorio.md` sem `@`, `+55`, 40 hex, `eyJ` nem `Set-Cookie` |

Na primeira tentativa da camada da aplicação, a verificação do atacado no **cartão** reprovou nas 22 lojas (ver diferença 3). As tentativas seguintes ficaram presas no limite do catálogo (ver diferença 6). Depois dos dois ajustes, a execução final aprovou tudo. A verificação manual ("abrir `/loja/cozinha-do-benfica` e o pedido de R$ 51,00 no painel") foi coberta por HTTP: a página respondeu 200, e o detalhe do painel veio com 5100. Ninguém abriu as telas num navegador.

## Diferenças em relação ao plano v6 (registradas)

1. **Rota da vitrine:** a vitrine pública é `/v1/vitrine/:apelido`, e o acompanhamento é `/v1/vitrine/:apelido/pedido/:token`. O plano dizia `/v1/lojas/...`, mas lá fica só o painel (`/v1/lojas/:apelido/pedidos`), que responde 401 sem sessão. O lançador e a validação usam as rotas reais.
2. **`DATABASE_URL_TEST` na API:** a API não sobe sem ela fora de produção e exige que seja diferente de `DATABASE_URL`. O lançador passa `simpleclick_simulacao_teste`, um banco que não existe e no qual a API não escreve. Nunca passa a base de teste real (:5533).
3. **Atacado no cartão:** nas lojas de varejo, o seed de demonstração guarda o preço na variante "Único". O cartão do catálogo fica sem preço de varejo (`precoCentavos: null`) e, por isso, não mostra a faixa. A faixa aparece na faceta de atacado do catálogo e na página do produto (`/produto/:id`: 10 un., 5 %, R$ 4,50 → R$ 4,28). A validação confere a página do produto. Por isso o atacado vai sempre num produto sem eixo.
4. **Login do painel:** exige o cabeçalho `Origin` de uma origem permitida.
5. **Cancelamento:** o motivo também aparece em `customer_note`, como no seed de demonstração (D-1 continua só com `export`).
6. **Limite do catálogo:** `GET /v1/vitrine/:apelido/catalogo` (e `/resumo`, `/produtos`) aceita 60 consultas/min por endereço; quem passa disso espera, com espera crescente até 15 min. A validação espaça essas consultas em 1,2 s e respeita o `Retry-After`, sem afrouxar a API. Para o k6, que sai de um endereço só, o lançador repassa `VITRINE_CATALOGO_LIMITE`, `VITRINE_CATALOGO_JANELA_MS` e `VITRINE_CATALOGO_ESPERA_MS` **se** forem definidas no terminal; sem elas, vale o padrão da API. O contador fica no Redis `/5` (`sc:limite:vitrine-catalogo:*`).
7. **Fronteira de pacotes:** a validação usa `transicoes.ts`, uma cópia da tabela de `proximosStatus`, porque `pkg-database` não pode importar `pkg-core`. `transicoes.test.ts` compara a cópia com o núcleo.
8. **`demo.test.ts`:** falha que já existia (estouro de 600 s no `beforeAll`), independente deste card.

## Arquivos

- `packages/database/seed/simulacao/`:
  - `parametros.ts`, `banco.ts` (T-2);
  - `bairros.ts`, `perfil.ts` (T-3);
  - `index.ts`, `manifesto.ts` (T-4);
  - `validar.ts`, `aplicacao.ts`, `transicoes.ts` (T-5);
  - testes `parametros.test.ts`, `perfil.test.ts`, `validar.test.ts`, `transicoes.test.ts`.
- `packages/database/seed/demo/index.ts`: só os `export` (T-1).
- `packages/database/package.json`: 3 scripts novos (T-6).
