# Design: Selo público de loja verificada (A decidir)

> feature: decidir-selos-de-loja · card #118 · 05/11/2026

**Proposta, não aprovada.** A função só entra se o dono do produto responder
"fazer" na Q-11801 (P-107). Os nomes de tabela, campo e rota abaixo são
sugestões para revisão: nada foi criado no código, no banco ou nos contratos.
Os comandos e caminhos valem a partir de `/Users/stargrupo/Projetos/SC`.

## 1. Estado atual (evidência)

| O que existe                                                                                                                 | Onde                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Situação da loja: PENDING_APPROVAL, ACTIVE, REJECTED, INACTIVE, DELETED; `approvedAt` = primeira entrada no ar               | `packages/database/prisma/schema.prisma` (model Store)                                                                                                                |
| A vitrine só resolve loja ACTIVE                                                                                             | `apps/api/src/modules/storefront/resolver-loja.usecase.ts` (linha 117)                                                                                                |
| O público nunca recebe a situação (para não revelar loja suspensa; regra da spec arquivada)                                  | `apps/api/src/modules/storefront/dto-publico.ts` (`CAMPOS_PUBLICOS_DA_LOJA`, `NUNCA_SAEM`)                                                                            |
| Aprovar, recusar, ativar e desativar: trava de administração e trilha na mesma transação                                     | `apps/api/src/modules/admin/aprovacao.routes.ts`, `apps/api/src/modules/admin/admin.routes.ts`                                                                        |
| Suspender, reativar, excluir e restaurar                                                                                     | `apps/api/src/modules/admin/status-loja.usecase.ts`                                                                                                                   |
| Edição dos dados da loja pela administração                                                                                  | `apps/api/src/modules/admin/editar-loja.usecase.ts`                                                                                                                   |
| Administração da plataforma sem papéis: quem está em `platform_admins` pode tudo                                             | `packages/database/prisma/schema.prisma` (model PlatformAdmin)                                                                                                        |
| Trilha só acrescenta; a equipe da loja LÊ a trilha da própria loja (`audit_staff_select`)                                    | `packages/database/migrations/0006_impressao_e_auditoria.sql`, `apps/api/src/modules/admin/trilha.ts`                                                                 |
| Mascaramento de dado pessoal na trilha                                                                                       | `apps/api/src/modules/admin/auditoria.usecase.ts` (`mascararDadoPessoal`)                                                                                             |
| Documentos guardados: contrato, documento do responsável, comprovante de endereço (CONTRACT, ID_DOC, ADDRESS_PROOF no banco) | `packages/contracts/src/admin-documentos.ts`, `apps/api/src/modules/admin/documentos.repo.ts` (`store_contracts`)                                                     |
| Exceção por loja com motivo, data e autor                                                                                    | `packages/contracts/src/admin-funcionalidades.ts`, model StoreFeatureOverride                                                                                         |
| Contratos estritos da loja pública: vitrine, feed, cartão (o cartão aparece também em produto do feed e favoritos)           | `packages/contracts/src/vitrine.ts` (`esquemaDeLojaPublica`), `packages/contracts/src/feed.ts` (`esquemaDaLojaDoFeed`, `esquemaDaLojaNoCartao`, `esquemaDosRecentes`) |
| O site recusa resposta fora do contrato e mostra a loja como indisponível                                                    | `apps/web/src/server/vitrine.ts` (`safeParse`, linha 99)                                                                                                              |
| Cache de 60 s por etiqueta da loja e revalidação sob demanda                                                                 | `apps/web/src/server/cache.ts` (`TTL_PADRAO_SEGUNDOS`, `etiquetasDaVitrine`), `apps/web/src/server/revalidacao.ts`, `apps/web/src/app/api/revalidate/route.ts`        |
| Dados para buscadores e prévia de link                                                                                       | `apps/web/src/lib/dados-estruturados.tsx`, `apps/web/src/app/(loja)/loja/[slug]/opengraph-image.tsx`                                                                  |
| Peças de UI reaproveitáveis: `Selo` (texto carrega o sentido) e `Dialogo`                                                    | `packages/ui/src/selo.tsx`, `packages/ui/src/dialogo.tsx`                                                                                                             |
| Matriz do redesign: selo AD, "não existe"; o filtro "Revendas oficiais" depende dele                                         | `.spec/features/stitch-planejamento/design.md` (linhas 114, 131, 157, 240)                                                                                            |

**Conclusão:** a aprovação é condição para operar e vale para todas as lojas
públicas. Ela não serve de selo. Um selo precisa de um registro próprio.

## 2. Alternativas

| Opção                                                 | Decisão      | Por quê                                                                                                             |
| ----------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| A. Selo = `status ACTIVE`                             | rejeitada    | Toda loja visível teria selo; não comunica nada e expõe a situação, contra a regra de `NUNCA_SAEM`                  |
| B. Booleano `verified` em `stores`                    | rejeitada    | Sem histórico, sem validade, sem quem concedeu; o dono edita `stores` por outras rotas e o risco de vazar é maior   |
| C. Tabela própria de verificação, só da administração | **proposta** | Guarda itens, validade, concessão, revogação e encerramento; leitura pública por função SQL que devolve só o mínimo |
| D. Reaproveitar `StoreFeatureOverride`                | rejeitada    | Sem linha a função fica LIGADA (o contrário do selo); sem validade nem histórico; a equipe da loja lê a linha       |

## 3. Proposta (opção C)

### 3.1 Dados

Tabela sugerida `app.store_verifications`, com uma linha por concessão:

- `store_id` (FK para `stores`), `granted_by`, `granted_at`, `valid_until`
  (`timestamptz`), `reason`;
- `items` (jsonb): `[{ "kind": "ID_DOC", "sha256": "…" }, …]`. Guarda o tipo
  e o hash do documento conferido, **nunca** o número nem o arquivo (Q-11808);
- `ended_at`, `ended_by`, `end_kind` (REVOKED, DATA_CHANGED, STORE_SUSPENDED,
  STORE_DISABLED, STORE_DELETED), `end_reason`;
- índice parcial único: no máximo uma verificação aberta por loja
  (`ended_at IS NULL`).

Acesso:

- só a credencial de administração (`sc_admin`) lê e grava, como
  `store_contracts`;
- a credencial da aplicação (`sc_app`) não tem política nenhuma;
- o público lê por uma função `SECURITY DEFINER` que devolve apenas
  `{ desde, validaAte, itens: ["documento da empresa", "endereço", …] }` da
  verificação aberta e não vencida.

O vencimento é calculado **na leitura** (`valid_until > now()`), e por isso não
existe job (AC-11813). A migração ganha o próximo número livre quando for
implementada; hoje a última é a 0073.

### 3.2 Contrato público

Campo novo `verificacao` em `esquemaDeLojaPublica`, `esquemaDaLojaDoFeed` e
`esquemaDaLojaNoCartao`. O cartão cobre também o produto do feed e os
favoritos; os recentes usam `esquemaDaLojaDoFeed`.

```ts
verificacao: z
  .strictObject({ desde: z.string(), validaAte: z.string(), itens: z.array(z.string()) })
  .nullable()
  .optional(),
```

- `null` vale para nunca verificada, revogada, vencida e encerrada. O público
  não consegue distinguir os casos (AC-11803).
- **Ordem de deploy (AC-11817):** os esquemas são `strictObject`, e o site
  marca a loja como indisponível com campo desconhecido. Por isso, publicar
  primeiro o contrato e o site que aceitam o campo opcional, e só depois a
  API que o envia. O teste de compatibilidade cobre resposta com e sem o
  campo.
- A API inclui `verificacao` em `CAMPOS_PUBLICOS_DA_LOJA` e lê o campo pela
  função pública, nunca pela tabela. O teste de `NUNCA_SAEM` passa a cobrir
  `granted_by`, `reason` e `items`.

### 3.3 Administração

Rotas sugeridas no padrão de `aprovacao.routes.ts`, todas com a trava
`comoAdministrador` e a trilha na mesma transação:

- `GET /v1/admin/lojas/:id/verificacao`: a verificação aberta e o histórico;
- `PUT /v1/admin/lojas/:id/verificacao`, com `{ itens, validaAte, motivo }`:
  concede. A loja precisa estar ativa e ter os documentos dos itens.
  - **Conflito de interesse (AC-11807):** recusa com 409 se quem concede é
    membro da loja (`store_members`) ou foi quem a cadastrou (`created_by`).
  - Se a Q-11803 pedir duas pessoas, entra a etapa "conferida" antes da
    "concedida".
- `DELETE /v1/admin/lojas/:id/verificacao`, com `{ motivo }`: revoga, e uma
  pessoa só basta.

Encerramento automático, na mesma transação do ato:

- `suspenderLoja`, a desativação e `excluirLoja` (em `status-loja.usecase.ts`)
  encerram a verificação aberta;
- `reativarLoja` e `restaurarLoja` não reabrem nada (AC-11810);
- `editar-loja.usecase.ts` encerra a verificação quando mudam a razão social,
  o número do documento ou o endereço (AC-11812).

Depois de conceder, revogar ou encerrar, a API pede a revalidação das
etiquetas da loja (`revalidacao.ts`). O prazo máximo continua sendo o TTL de
60 s (AC-11805).

Trilha:

- atos `SELO_CONCEDIDO`, `SELO_REVOGADO` e `SELO_ENCERRADO`, incluídos em
  `ATOS_SENSIVEIS`;
- `after_data` = `{ validaAte, itens: [{ kind, sha256 }], motivo }`, com o
  motivo passando por `mascararDadoPessoal`;
- sem CPF, CNPJ, nome do responsável nem arquivo, porque a equipe da loja lê a
  trilha (AC-11804).

UI da administração: uma aba ou um bloco "Verificação" na ficha da loja
(`apps/web/src/features/admin/FichaLoja.tsx`, `AbasDaLoja.tsx`). Ela tem:

- a lista dos itens conferíveis, a partir dos documentos já enviados
  (`DocumentosDaLoja.tsx`);
- a validade;
- o motivo;
- a confirmação, no padrão de `JanelaDeConfirmacao.tsx`.

### 3.4 Cliente e dono

- Componente `SeloDeVerificacao`, feito com `Selo` e `Dialogo` do
  `packages/ui`, aparece na capa da vitrine (`CapaDaVitrine.tsx`) e no cartão
  e post da loja no feed (`Cartoes.tsx`, `PostDeLoja.tsx`).
  - Ele tem um ícone próprio do pacote de ícones do projeto (P-103) e o texto
    "Loja verificada". É acionável por teclado e abre a explicação
    (AC-11801, AC-11802).
  - A cor segue os tokens (P-102 e P-108). Não pode ser imitado por texto
    livre, que nunca recebe ícone nem pílula.
- Texto da explicação: os itens genéricos, o mês e o ano, e o parágrafo do que
  **não** garante. Precisa de revisão jurídica antes de publicar (Q-11805).
- Expressões reservadas (AC-11816): uma lista única exportada de
  `packages/contracts`, aplicada na validação do nome, das boas-vindas, do
  "sobre" e do banner (`packages/contracts/src/store-settings.ts`), no
  servidor e na tela.
- O dono vê a situação do selo no painel (AC-11814) por uma leitura própria:
  `{ situacao, validaAte }`, sem autor nem motivo. O lugar sugerido é a área de
  configuração da loja (`apps/web/src/features/config/`).
- O campo `verificacao` não existe em nenhum esquema de entrada do dono; um
  envio com esse campo é recusado pelo `strictObject` (AC-11815).
- `dados-estruturados.tsx` e `opengraph-image.tsx` não mudam até a Q-11809
  ser respondida (AC-11818).

## 4. Estratégia de testes (quando autorizada)

Os arquivos se chamam `*.onp.test.ts(x)` e os títulos levam
`[CA-n] @spec:AC-118xx` (README da `.spec`).

| Critérios                                | Onde                                              | Tipo                                             |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| AC-11817                                 | `packages/contracts/src/selo-de-loja.onp.test.ts` | unidade: esquemas com e sem o campo              |
| AC-11816                                 | `packages/contracts/src/selo-de-loja.onp.test.ts` | unidade: expressões reservadas                   |
| AC-11804 a AC-11807, AC-11809 a AC-11813 | `apps/api/tests/selo-de-loja.onp.test.ts`         | integração com banco (apoio-da-administracao.ts) |
| AC-11803, AC-11808, AC-11815             | `apps/api/tests/selo-de-loja-publico.onp.test.ts` | integração: vitrine, feed, favoritos, recentes   |
| AC-11801, AC-11802, AC-11814, AC-11818   | `apps/web/tests/selo-de-loja.onp.test.tsx`        | componente e acessibilidade                      |

A recusa de acesso (AC-11806) é testada com cliente, dono e equipe. A
varredura de isolamento (`apps/api/tests/isolamento-varredura.test.ts`) passa
a incluir a tabela nova.

## 5. Riscos

| Risco                                                                         | Mitigação                                                            |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Publicidade enganosa (CDC art. 37) com "certificada", "homologada", "oficial" | Só "Loja verificada", texto dos limites e revisão jurídica (Q-11805) |
| Vitrine inteira indisponível pelo contrato estrito                            | Ordem de deploy e teste de compatibilidade (AC-11817)                |
| Dado pessoal na trilha lida pela equipe da loja                               | Só tipo e hash e motivo mascarado; teste do `after_data`             |
| Selo continuar visível depois de revogado                                     | Revalidação por etiqueta e TTL de 60 s (AC-11805)                    |
| Selo herdado ou ressuscitado                                                  | Encerramento na mesma transação dos atos de situação e de edição     |
| Administrador verificando a própria loja                                      | Recusa por vínculo (AC-11807) e opção de duas pessoas (Q-11803)      |

## 6. Relação com outros cards

- #107 (vitrine), #106 (início e descoberta) e #108 (catálogo) reservam o
  lugar visual do selo, **oculto** até a decisão (P-107). Nenhuma tarefa deles
  depende deste card.
- #113 (admin da plataforma) recebe a aba de verificação, se aprovada.
- #117 (avaliações) e #124 (mais vendidos) são selos de outra natureza e ficam
  separados.
