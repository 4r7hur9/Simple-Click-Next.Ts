# Fundação do card #25 — contratos e endpoints

Aprovação de loja, limites, feed, favoritos, recentes, tema, etapas do pedido,
equipe e permissões por papel. Tudo exportado de `@simpleclick/contracts`
(esquemas zod) e, nas rotas públicas e da conta, também em
`contrato/openapi.json`.

Migrações: `0049_aprovacao_da_loja`, `0050_feed_favoritos_e_recentes`,
`0051_limites_da_plataforma`, `0052_equipe_e_loja_solicitada`,
`0053_etapas_do_pedido` (já aplicadas no banco de dev).

---

## 1. Situação e aprovação da loja

Status (`SITUACOES_DA_LOJA`, `ROTULOS_DAS_SITUACOES`):

| Código             | Tela                 | Vitrine/feed | Painel                 | Pedido novo |
| ------------------ | -------------------- | ------------ | ---------------------- | ----------- |
| `PENDING_APPROVAL` | Aguardando aprovação | não          | sim (monta o cardápio) | não         |
| `ACTIVE`           | Ativa                | sim          | sim                    | sim         |
| `REJECTED`         | Recusada             | não          | só `/situacao`         | não         |
| `INACTIVE`         | Desativada           | não          | só `/situacao`         | não         |
| `DELETED`          | Excluída             | não          | não                    | não         |

Antes eram `PENDING` e `SUSPENDED` (migrados para `PENDING_APPROVAL` e
`INACTIVE`). Toda loja nova — cadastrada pela administração ou aberta pelo
lojista — nasce `PENDING_APPROVAL`.

Transições (`TRANSICOES_DA_LOJA`), só administração, todas na trilha:

| Rota                                 | Corpo                | De → Para                             | Ato na trilha     |
| ------------------------------------ | -------------------- | ------------------------------------- | ----------------- |
| `POST /v1/admin/lojas/:id/aprovar`   | `{}`                 | PENDING_APPROVAL ou REJECTED → ACTIVE | `LOJA_APROVADA`   |
| `POST /v1/admin/lojas/:id/recusar`   | `{ motivo }` (3–500) | PENDING_APPROVAL → REJECTED           | `LOJA_RECUSADA`   |
| `POST /v1/admin/lojas/:id/desativar` | `{ motivo? }`        | ACTIVE → INACTIVE                     | `LOJA_DESATIVADA` |
| `POST /v1/admin/lojas/:id/ativar`    | `{}`                 | INACTIVE → ACTIVE                     | `LOJA_ATIVADA`    |

Resposta: a ficha da loja (`esquemaDaFichaDaLoja`). Repetir o ato que já vale
→ 200 sem mudar. Fora da tabela → `409 { erro: "transicao_invalida", status, mensagem }`.
Excluída → `409 loja_excluida`. As antigas `PUT .../suspensao` e
`PUT .../reativacao` continuam (= desativar/ativar).

- Lista por status: `GET /v1/admin/lojas?situacao=PENDING_APPROVAL` (já existia).
- Ficha ganhou: `recusa {desde, motivo} | null`, `aprovadaEm`, `donos[{identidadeId, nome, email, conviteAceito}]`.
- Dono: `GET /v1/lojas/:apelido/situacao` → `{ status, suspensao, recusa, aguardandoAprovacao }`.

## 2. Lojista abre a própria loja

`POST /v1/auth/lojas` — qualquer conta logada (Bearer ou cookie `sc_access`).

Corpo (`esquemaDaLojaSolicitada`): `{ nome, tipoDeNegocio, apelido?, whatsapp?, cidade?, uf? }`.
Sem `apelido`, ele sai do nome (com `-2`, `-3`… se preciso).

`201`: a **sessão nova**, já como dono (mesmo corpo do login —
`status: "SESSAO_CRIADA"`, `papel: "OWNER"`, `tokenDeAcesso`; o token de
renovação vai no cookie, ou no corpo para o nativo) + `mensagem` +
`loja { codigo, apelido, status: "PENDING_APPROVAL" }`. A ponte do site precisa
regravar `sc_access`/`sc_refresh` com essa sessão (a antiga cairia na próxima
renovação, porque o papel da conta mudou).

Erros: `401`; `400 tipo_desconhecido`; `409 apelido_em_uso { sugestao }`;
`409 limite_atingido { recurso: "lojas", limite, uso }`.

Tipos de negócio (público): `GET /v1/tipos-de-negocio` → `{ tipos: [{ codigo, nome, alimentacao }] }`.

## 3. Limites

Padrões (`LIMITES_PADRAO`): lojas por dono 2, equipe por loja 1, produtos 500,
categorias 50, clientes 5000.

Criar além do limite → `409 { erro: "limite_atingido", recurso, limite, uso, mensagem }`
(`esquemaDoLimiteAtingido`), com `recurso` em `lojas | staff | produtos | categorias | clientes`.
Conferido em: abrir/cadastrar loja (vagas do dono), cadastrar/reativar equipe,
criar/duplicar produto, criar categoria, cadastrar cliente no painel. Cliente
que chega por pedido do site **nunca** é barrado.

| Rota                                                  | Quem          | Corpo / resposta                                                                                                  |
| ----------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /v1/lojas/:apelido/limites`                      | dono e equipe | `{ limites: [{ recurso, limite, uso, restante }] }`                                                               |
| `GET` / `PATCH /v1/admin/limites`                     | admin         | `{ lojasPorDono, staffPorLoja, produtosPorLoja, categoriasPorLoja, clientesPorLoja }` (PATCH parcial)             |
| `GET` / `PATCH /v1/admin/lojas/:id/limites`           | admin         | PATCH `{ staff?, produtos?, categorias?, clientes? }` (`null` = volta ao padrão); resposta `{ limites, ajustes }` |
| `GET` / `PATCH /v1/admin/donos/:identidadeId/limites` | admin         | PATCH `{ lojas: n                                                                                                 | null }`; resposta `{ identidadeId, limite, ajuste }` |

Trilha: ajuste de loja em `audit_log` (`LIMITES_ALTERADOS`); padrões e dono em
`audit_platform` (`LIMITES_PADRAO_ALTERADOS`, `LIMITE_DO_DONO_ALTERADO`).

## 4. Permissões por papel

O papel no painel vem do **vínculo** da conta com a loja (`store_members`), e
não do papel da sessão: equipe (STAFF) entra com a sessão de cliente;
administração que é dona entra com a sessão ADMIN.

Matriz (`MATRIZ_DE_PERMISSOES`, `podeNaLoja`, `permissoesDoPapel`):

| Permissão             | OWNER | STAFF |
| --------------------- | :---: | :---: |
| `loja.ver`            |   ✓   |   ✓   |
| `catalogo.categorias` |   ✓   |   ✓   |
| `catalogo.produtos`   |   ✓   |   ✓   |
| `pedidos.operar`      |   ✓   |   ✓   |
| `pedidos.manual`      |   ✓   |   ✓   |
| `clientes`            |   ✓   |   ✓   |
| `metricas`            |   ✓   |   ✓   |
| `configuracoes`       |   ✓   |       |
| `equipe`              |   ✓   |       |
| `feed`                |   ✓   |       |
| `personalizacao`      |   ✓   |       |
| `moderar_comentarios` |   ✓   |   ✓   |

`moderar_comentarios` (card #47): fila, aprovar, recusar, apagar e bloquear
quem comenta (`/v1/lojas/:apelido/comentarios/*`); ligar a aprovação automática
(`/comentarios/configuracao`) é `configuracoes`. Contrato completo em
`src/social.ts`.

Negado → `403 { erro: "sem_permissao", permissao, mensagem }`. Rota do painel
fora da tabela de `apps/api/src/core/equipe-da-loja.ts` é só do dono.

`GET /v1/eu` ganhou `lojasDaConta[].permissoes` e `permissoesDaPlataforma`
(`admin.lojas`, `admin.limites`, `admin.auditoria` quando é admin). Para montar o
painel use `lojasDaConta` (`lojas` só vem preenchido na sessão OWNER).

## 5. Equipe (só o dono)

| Rota                                      | Corpo                     | Resposta                                                 |
| ----------------------------------------- | ------------------------- | -------------------------------------------------------- |
| `GET /v1/lojas/:apelido/equipe`           |                           | `{ membros: [MembroDaEquipe], limite: { limite, uso } }` |
| `POST /v1/lojas/:apelido/equipe`          | `{ nome, email, senha? }` | `201 { membro, contaCriada }`                            |
| `PATCH /v1/lojas/:apelido/equipe/:id`     | `{ ativo }`               | `{ membro }`                                             |
| `DELETE /v1/lojas/:apelido/equipe/:id`    |                           | `204`                                                    |
| `PUT /v1/lojas/:apelido/equipe/:id/senha` | `{ senha }`               | `204`                                                    |

`MembroDaEquipe`: `{ id (do vínculo), nome, email, papel, ativo, contaGerenciada, desde }`.
E-mail sem conta exige `senha` (`422 senha_obrigatoria`; fraca: `422 senha_fraca`);
a conta nasce gerenciada pela loja. E-mail com conta só ganha o vínculo.
`409 ja_e_membro`, `409 limite_atingido`, `409 dono_nao_sai`,
`409 senha_nao_gerenciada` (só se troca senha de conta que a loja criou; a troca
derruba as sessões da pessoa).

## 6. Feed, favoritos e recentes

`GET /v1/feed/produtos` (público) — consulta: `tipo` (códigos separados por
vírgula), `categoria`, `entrega` (`entrega` | `retirada`), `busca`, `ordem`
(`relevancia` | `distancia` | `preco-menor` | `preco-maior` | `recentes`),
`lat`, `lng`, `pagina`, `porPagina` (até 50).
Resposta: `{ produtos: [ProdutoDoFeed], pagina, porPagina, total }`, com
`ProdutoDoFeed = { id, nome, descricao, precoCentavos, precoOriginalCentavos, imagem, categoria, loja { apelido, nome, tipoDeNegocio, logo, cidade, bairro, formasDeEntrega }, distanciaKm, publicadoEm }`.

`GET /v1/feed/lojas` (público; com sessão traz `favorita` e `ultimaVisita`) —
mesmos filtros (sem `categoria`), `ordem` `relevancia` | `distancia` | `recentes` | `nome`.
Resposta: `{ lojas: [LojaDoFeed], pagina, porPagina, total }`, com
`LojaDoFeed = { apelido, nome, tipoDeNegocio, tipoDeNegocioNome, cidade, bairro, uf, formasDeEntrega, logo, capa, corDestaque, distanciaKm, produtosNoFeed, favorita, ultimaVisita }`.

Só entra loja ATIVA com `aparecerNoFeed`, e só produto publicado, disponível e
marcado `publicarNoFeed`.

Conta (Bearer ou cookie): `GET /v1/conta/favoritos`,
`POST | DELETE /v1/conta/favoritos/:apelido` → `{ apelido, favorita }`;
`GET /v1/conta/recentes`; `POST /v1/conta/recentes/:apelido` (o site chama ao
abrir a loja) → `{ apelido, visitas, ultimaVisita }`. Loja fora do ar → 404.

Produto (`POST`/`PATCH /v1/lojas/:apelido/catalogo/produtos`): campo
`publicarNoFeed` (ausente na criação = `publicarProdutosNovos` da loja). Equipe
mandando o campo → `403 sem_permissao { permissao: "feed" }`.

Configuração do feed (dono): `GET` / `PUT /v1/lojas/:apelido/feed` →
`{ aparecerNoFeed (padrão true), publicarProdutosNovos (padrão false) }`.

## 7. Tema da vitrine (permissão `personalizacao`)

`GET` / `PUT /v1/lojas/:apelido/tema` — PUT parcial:
`{ corDestaque?: "#rrggbb", fundoVitrine?: "https://…" | null, topoCardapio?: "https://…" | null }`.
Resposta e vitrine (`GET /v1/vitrine/:apelido` → `loja.tema`):
`{ corDestaque (padrão "#b7ff00"), corDeFundo: "#000000" (fixo), fundoVitrine, topoCardapio }`
(`esquemaDoTemaDaLoja`, `temaDaLoja`, `COR_DE_DESTAQUE_PADRAO`).

## 8. Etapas do pedido (kanban)

`ETAPAS_DO_PEDIDO`, `etapasDaForma(forma)`, `etapaDoStatus`, `rotuloDaEtapa`:

| Status             | Etapa             | Rótulo            | Formas            |
| ------------------ | ----------------- | ----------------- | ----------------- |
| `PENDING`          | PEDIDO_GERADO     | Pedido gerado     | entrega, retirada |
| `ACCEPTED`         | CONFIRMADO        | Confirmado        | entrega, retirada |
| `PREPARING`        | EM_PREPARO        | Em preparo        | entrega, retirada |
| `READY_FOR_PICKUP` | RETIRADA          | Retirada          | só retirada       |
| `OUT_FOR_DELIVERY` | SAIU_PARA_ENTREGA | Saiu para entrega | só entrega        |
| `COMPLETED`        | CONCLUIDA         | Concluída         | entrega, retirada |
| `CANCELLED`        | (fora do quadro)  | Cancelado         |                   |

As transições continuam as de `@simpleclick/core` (`proximosStatus`,
`decidirTransicao`) em `PATCH /v1/lojas/:apelido/pedidos/:id/status`. O status
`REJECTED` de pedido deixou de existir (os antigos viraram `CANCELLED`, com a
passagem no histórico), e o banco recusa retirada em "saiu para entrega" e
entrega em "retirada".
