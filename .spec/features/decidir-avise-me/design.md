# Design: Avise-me quando o produto voltar ao estoque (A decidir)

> feature: decidir-avise-me

<!--
  Card #120, bloco 12001 a 12099. PROPOSTA técnica para revisão: nada aqui
  foi aprovado nem implementado. Caminhos relativos a /Users/stargrupo/Projetos/SC.
  Legenda: FATO (visto no código), INFERÊNCIA (dedução), DESCONHECIDO.
  Revisada por duas leituras adversariais (arquitetura e segurança); os
  achados viraram os critérios AC-12005 a AC-12020 e as decisões abaixo.
-->

## 1. Evidências do estado atual

### 1.1 Estoque e "esgotado" (FATO)

| Item                  | Onde                                                                                                            | Observação                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Estoque por variação  | `packages/database/prisma/schema.prisma`, modelo `ProductVariant` (`stockQuantity`, `isAvailable`, `deletedAt`) | nulo é "não controla"; zero é "acabou"                                          |
| Produto sem variação  | modelo `Product` (`isAvailable`, `hasVariants`)                                                                 | só a chave liga e desliga; `trackStock` existe mas nenhum código da API o lê    |
| Regra de disponível   | `apps/api/src/modules/storefront/produto.usecase.ts`                                                            | variação: disponível e (estoque nulo ou maior que zero)                         |
| Regra de esgotado     | mesmo arquivo                                                                                                   | produto: não disponível, ou todas as variações indisponíveis                    |
| Motivos               | `packages/contracts/src/vitrine.ts`, `esquemaDeIndisponibilidade`                                               | ESGOTADO e FORA_DO_HORARIO; o horário vem de `unavailableUntil` e `saleWindows` |
| Histórico de estoque  | modelo `StockMovement` (origens MANUAL, PEDIDO, CANCELAMENTO, IMPORTACAO)                                       | imutável, mas nem todo caminho grava                                            |
| Controle por segmento | `VerticalPreset.tracksStock`, lido em `apps/api/src/modules/catalog/variacoes.routes.ts`                        | o tipo da loja decide se o estoque é controlado                                 |

### 1.2 Caminhos que podem repor (FATO)

| #   | Caminho                              | Arquivo e símbolo                                                            | Grava `StockMovement`? |
| --- | ------------------------------------ | ---------------------------------------------------------------------------- | ---------------------- |
| 1   | Ajuste manual de estoque             | `apps/api/src/modules/catalog/estoque.routes.ts`, `criarRotasDoEstoque`      | sim, MANUAL            |
| 2   | Devolução ao cancelar o pedido       | `apps/api/src/modules/orders/devolver-estoque.ts`, `devolverEstoqueDoPedido` | sim, CANCELAMENTO      |
| 3   | Edição da variação                   | `apps/api/src/modules/catalog/variacoes.routes.ts`, `alterarVariacao`        | **não**                |
| 4   | Criação da variação                  | mesmo arquivo, rota de criação                                               | não                    |
| 5   | Edição do produto (chave disponível) | `apps/api/src/modules/catalog/produtos.routes.ts`, PATCH do produto          | não se aplica          |

Casos extras que também tornam o item comprável de novo (INFERÊNCIA): produto
volta de rascunho para publicado, variação restaurada (`deletedAt` volta a
nulo), loja reativada, e o fim do horário de venda. O caminho 3 muda a
quantidade sem histórico: um gatilho só em `stock_movements` o perderia.

A baixa por pedido (`apps/api/src/modules/orders/reservar-estoque.ts`,
`reservarEstoque`, função SQL `app.reservar_estoque_do_pedido`) é o caminho
mais quente do sistema; um gatilho sem filtro cobraria custo e disputa de
trava de cada venda (AC-12010).

### 1.3 Como a loja mostra o esgotado hoje (FATO)

- Cartão: `apps/web/src/features/vitrine/CartaoEsgotado.tsx` (`CartaoEsgotado`, `TEXTO_DO_SELO`).
- Página do produto: `apps/web/src/features/produto/BotaoAdicionar.tsx` (botão desabilitado e texto de motivo), `apps/web/src/server/produto.ts` (`explicar`, texto "Este item acabou. Ele volta assim que a loja repuser.").
- Variação: `apps/web/src/features/produto/MatrizDeVariacao.tsx` (botão desabilitado "Esgotado").
- A rota pública do produto não lê a sessão do cliente; o pedido de aviso exigirá nova rota.

### 1.4 Canais e envio (FATO)

| Canal                | Situação hoje                                                                                                                                                           | Custo e dependência                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| E-mail               | porta `EnviadorDeEmail` em `apps/api/src/jobs/email.job.ts`; em produção `enviadorNaoConfigurado()` sempre falha (dívida 35); sem biblioteca de e-mail nas dependências | provedor a escolher e pagar (Q-12004)                    |
| WhatsApp             | só link `wa.me` (`apps/web/src/features/checkout/EnvioWhatsApp.tsx`); não há API de envio                                                                               | API oficial com custo e modelos aprovados                |
| Push                 | não existe (sem service worker)                                                                                                                                         | construir inscrição de dispositivo e permissão           |
| Aviso dentro do site | não existe central de avisos; o mais próximo é o selo do painel por consulta periódica (`apps/web/src/features/painel/usePedidosNovos.ts`)                              | sem terceiro, mas custa tabela, tela e contador próprios |

Nenhum canal tem custo zero: o "aviso dentro do site" só dispensa terceiros.

### 1.5 Filas (FATO)

- `apps/api/src/jobs/index.ts` define as filas BullMQ (`email`, `webhook`, `impressao`) sobre um Redis configurado como cache (pode perder trabalho). O trabalho de e-mail atual leva endereço e link no próprio payload.
- A fila durável do projeto é `print_jobs` no PostgreSQL (`packages/database/migrations/0034_fila_de_impressao.sql`, reserva com `FOR UPDATE SKIP LOCKED` em `apps/api/src/modules/printing/fila.usecase.ts`), mas ela exige a loja no contexto e é consumida pelo agente de uma só loja. Serve de referência para a reserva, não para o acesso.
- Agendamentos existem como `setInterval` (`apps/api/src/jobs/retencao.job.ts`, `agendarRetencao`).

### 1.6 Conta, consentimento e privacidade (FATO)

- `accepts_offers` (migration `0054_dados_da_conta_do_cliente.sql`) é um aceite global de marketing, sem canal nem loja; a tela é `apps/web/src/features/conta/DadosDaConta.tsx`. O modelo `Identity` tem `emailNorm` e `emailVerifiedAt`.
- Aceites legais: `packages/database/migrations/0073_aceites_legais.sql`; a tabela só aceita três documentos e só recebe acréscimos, então não serve para o consentimento do aviso.
- `app.anonimizar_minha_conta` e `app.meus_dados_nas_lojas` (mesma migration) são `CREATE OR REPLACE` com o corpo inteiro: quem recriar a função copiando uma versão antiga perde exclusões existentes.
- Padrão de inscrição do cliente num produto: `favorite_products` (`packages/database/migrations/0061_favoritos_de_produtos.sql`, rotas em `apps/api/src/modules/feed/feed.routes.ts`, `marcarProdutoFavorito` em `feed.usecase.ts`). A função `app.produto_favoritavel` olha só o produto, não a variação.
- A remoção definitiva de loja (`apps/api/src/modules/admin/situacao.repo.ts`) não apaga `favorite_products`; a tabela nova herdaria o resíduo se não entrar na remoção.

### 1.7 Isolamento e guardas (FATO)

- RLS por `app.store_id`; `apps/api/tests/isolamento-varredura.test.ts` exige construtor (`CONSTRUTORES`) e camada (`CAMADAS`) para toda tabela nova com `store_id`, mas não testa funções de acesso ampliado.
- Guardas em `packages/database/guards/`: G1 (RLS ativo), G2 (uma política por comando), G3 (índice único começa por `store_id`, exceções só com justificativa), G4 (política cita a loja), G5 (índice cobre a política), G6 e G7 (sem matview multi-loja, view com invocador), G10 (função com acesso ampliado tem caminho de busca fixo).
- Limite de abuso: `apps/api/src/core/limite.ts`, `limitarTentativas`, foi desenhado para falhas de login; o Redis é descartável.

### 1.8 Painel e conta (FATO)

- Painel de estoque: `apps/web/src/features/painel-estoque/PainelDeEstoque.tsx`; dados de `apps/api/src/modules/catalog/listagem-do-painel.ts`; rota em `visao-geral.routes.ts`.
- Conta do cliente: menu em `apps/web/src/lib/quem-esta-logado.ts`; páginas em `apps/web/src/app/(conta)/conta/`.

### 1.9 Provas (FATO)

`vitest.config.ts` tem os projetos `unit`, `web`, `api-int`, `filas`, `db-rls`, `cache-int` e `agente`. O comando do ONP (`onpspec.config.json`) roda só `web` e `unit`. Tudo que depende de banco, RLS, gatilho ou fila fica fora do `verify` (Q-12012). Não existe nada de "avise-me", inscrição ou notificação de reposição no código (busca por avise, aviso, reposi, notify e esgotad).

## 2. Regra central: "comprável agora"

Esgotado não é uma coluna: depende do produto, da variação, do horário, da
publicação e da loja. Por isso o aviso só sai quando **tudo** isto vale no
momento do envio: produto publicado e não apagado, produto disponível, loja
ativa, variação não apagada, disponível, dentro do horário de venda e com
estoque nulo ou maior que zero. A conferência acontece duas vezes: ao se
inscrever (só se o motivo for esgotado) e imediatamente antes de enviar
(AC-12006, AC-12007). Isso impede avisar de produto que o lojista ocultou
depois e evita vazar nome e link de item não público.

## 3. Alternativas de detecção da reposição

| Opção                                      | Como funciona                                                                                          | Prós                                                        | Contras                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A (recomendada): gatilho filtrado + outbox | gatilho no banco só na transição para "disponível" grava ids numa tabela de eventos na mesma transação | cobre os cinco caminhos, inclusive o sem histórico; durável | migration e testes com banco; cobrir os casos extras da seção 1.2              |
| B: chamar um serviço em cada rota          | cada rota de estoque chama o serviço de aviso                                                          | sem gatilho                                                 | cinco pontos para lembrar; novo caminho esquecido some o aviso; mistura regras |
| C: fila BullMQ                             | enfileira no Redis                                                                                     | já existe                                                   | Redis é descartável; payload com dado pessoal                                  |

Recomendação para decisão do usuário: **A**.

Gatilho proposto: `AFTER UPDATE OF stock_quantity, is_available … WHEN` a nova
linha está disponível e a antiga não, `SECURITY INVOKER`, gravando só a loja,
o produto, a variação e o tipo do evento, sem ler inscrições nem identidades.
Também em `products` (chave disponível, publicação) quando Q-12008 permitir. A
baixa por pedido não satisfaz o filtro e não grava nada (AC-12010). O design
da implementação deve dizer o que acontece sem loja no contexto (carga em
massa, importação) e o volume de eventos.

O evento só dispara a reavaliação; **não é a chave do envio**. A chave é o
ciclo da inscrição (seção 4).

## 4. Dados propostos

Duas variantes, ligadas às perguntas ainda abertas (não presumir resposta):

- **Conta obrigatória (Q-12003 sim)**: tabela de inscrição no estilo de `favorite_products`, com `identity_id`. Política por identidade e loja, como no padrão.
- **Sem conta (Q-12003 não)**: a tabela guarda só o e-mail como resumo (hash) mais o endereço cifrado, passa por confirmação dupla antes de qualquer aviso, usa a mesma resposta para qualquer caso e precisa de caminho próprio para os direitos LGPD (a anonimização e a exportação atuais só alcançam quem tem conta). Mais caro e mais arriscado.

Campos da inscrição (nomes ilustrativos): loja, produto (obrigatório), variação
(opcional, ligada a Q-12008), canal, consentimento (data e versão do texto),
estado, ciclo, datas de criação, aviso e expiração.

Estados: ATIVA → NOTIFICANDO → NOTIFICADA, ou CANCELADA, EXPIRADA, FALHOU.
Unicidade por (loja, pessoa, variação) enquanto ATIVA; por (loja, inscrição,
ciclo) no envio. Todos os índices únicos **começam por `store_id`** (G3).
Oscilação 0→1→0→1 não duplica o aviso (AC-12008). Se Q-12006 permitir novo
aviso, o ciclo avança.

Tabela de eventos (outbox): loja, produto, variação, tipo, data, estado. Sem e-mail,
telefone nem código do link (AC-12018).

Cancelamento por link: código aleatório de pelo menos 128 bits, guardado só
como resumo; o GET só mostra a confirmação e o POST cancela; exceção
justificada na G3 por ser consulta global do código; cabeçalho de
cancelamento de um clique no e-mail (AC-12013).

## 5. Acesso ampliado e o trabalhador

A política normal por identidade não deixa a equipe da loja nem um trabalhador
ler inscrições. O desenho proposto evita o papel de administração e usa
funções estreitas, todas com caminho de busca fixo (G10) e testes entre lojas
(AC-12016):

- `variacao_avisavel(variação)`: confere a seção 2 e devolve a loja descoberta pelo servidor; resposta uniforme para inexistente, oculta e de outra loja.
- `contagem_de_espera(variação)`: só para a equipe da loja do contexto; devolve um número.
- reservar o próximo lote de eventos e ler o destinatário no momento do envio, devolvendo só o mínimo (inscrição, canal, endereço).
- cancelar por código.

O trabalhador percorre **loja por loja**, com a loja no contexto, e usa
`SKIP LOCKED` para não processar o mesmo evento duas vezes. O papel de
administração (`sc_admin`) é proibido para o trabalhador. Matview é proibida e
view só com invocador (G6 e G7).

## 6. Privacidade e LGPD

- A anonimização e a exportação incluem a tabela **na mesma migration** que a cria, e um teste confere que as exclusões anteriores continuam (AC-12017).
- O consentimento fica na inscrição (canal, data, versão do texto); não liga `accepts_offers` (AC-12003). Q-12011 decide se a prova sobrevive à anonimização.
- Nenhum dado pessoal em evento, fila ou log (AC-12018); o trabalho na fila leva ids.
- Só e-mail confirmado (AC-12005).
- Retenção com prazo (Q-12005), limpeza com credencial definida, e a tabela entra na remoção definitiva da loja e na suspensão (AC-12019).
- Abuso (AC-12020): limite por origem mais um teto de inscrições ativas por pessoa guardado no banco; decidir se a rota sem conta fecha quando o cache cai.
- Se Q-12007 for "mostrar nomes", o lojista vira controlador desses dados e o texto de consentimento cita a loja.

## 7. Telas (proposta visual própria; o Stitch só mostra o botão)

| Lugar                                 | Mudança                                                                                      | Arquivo                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Cartão esgotado                       | botão "Avise-me quando chegar" ao lado do selo, só com motivo esgotado, oculto até a decisão | `apps/web/src/features/vitrine/CartaoEsgotado.tsx`                         |
| Página do produto e variação esgotada | botão e janela de pedido (canal, consentimento) junto do aviso de indisponível               | `apps/web/src/features/produto/BotaoAdicionar.tsx`, `MatrizDeVariacao.tsx` |
| Conta do cliente                      | lista "Meus avisos" com cancelar                                                             | `apps/web/src/features/conta`, `apps/web/src/app/(conta)/conta`            |
| Painel de estoque                     | número de pessoas esperando na variação                                                      | `apps/web/src/features/painel-estoque/PainelDeEstoque.tsx`                 |
| Página de cancelamento por link       | confirmação em página pública                                                                | nova rota no app web                                                       |

Copiar do Stitch só a composição. A "previsão de chegada" e a data dos
mockups nunca entram (P-105).

## 8. Prova por critério

Quem pode provar o quê no comando atual do ONP (`web` e `unit`):

| Critério                     | Projeto de teste                        | Entra no `verify` atual? |
| ---------------------------- | --------------------------------------- | ------------------------ |
| AC-12002, AC-12011, AC-12014 | `web` (componentes com dublê)           | sim                      |
| AC-12003, AC-12004, AC-12009 | `unit` (regras puras e dublês de envio) | sim                      |
| AC-12001, AC-12005, AC-12006 | `api-int` (rota e banco)                | não, até Q-12012         |
| AC-12007, AC-12008, AC-12010 | `db-rls` e `api-int` (gatilho e fila)   | não, até Q-12012         |
| AC-12012, AC-12013, AC-12015 | `api-int`                               | não, até Q-12012         |
| AC-12016, AC-12017, AC-12019 | `db-rls`                                | não, até Q-12012         |
| AC-12018, AC-12020           | `unit` e `cache-int`                    | parcial                  |

O que não entra no `verify` continua sendo prova real quando o gerente e o #103
decidirem como estender o comando (Q-12012). Até lá, esses critérios aparecem
como sem prova no audit, e não podem ser declarados cumpridos.

## 9. Donos de arquivo e fila (implementação futura, uma tarefa após a outra)

Seguindo a seção 7 do design do `stitch-planejamento`. Os arquivos abaixo
são compartilhados e passam pela fila do gerente (`board_message`):

| Arquivo ou pasta                                                           | Dono ou fila                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/database/prisma/schema.prisma`, `packages/database/migrations/`  | fila entre os cards "A decidir" aprovados; número: o próximo livre     |
| `apps/api/tests/isolamento-varredura.test.ts`, `packages/database/guards/` | fila (um editor por vez)                                               |
| `packages/contracts/src/index.ts`, `rotas.ts`                              | fila; contrato novo em arquivo próprio, sem editar `vitrine.ts` (#108) |
| `apps/web/src/features/vitrine/CartaoEsgotado.tsx`                         | #107 ou #108 confirma o dono                                           |
| `apps/web/src/features/produto/*`                                          | #109, este card entra depois                                           |
| `apps/web/src/features/conta/*`, `apps/web/src/app/(conta)/conta/*`        | #111, este card entra depois                                           |
| `apps/web/src/features/painel-estoque/*`                                   | #112, este card entra depois                                           |
| `apps/api/src/jobs/*`                                                      | fila (o canal e-mail depende da dívida 35)                             |

Nenhuma tarefa do redesign (#104 a #114) depende deste card (P-107).

## 10. Riscos

| Risco                                                     | Mitigação                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Aviso de item oculto ou fora do horário                   | conferir "comprável agora" no envio (AC-12007)                               |
| Aviso duplicado                                           | máquina de estados por ciclo, idempotência, registro antes da tentativa      |
| Lentidão na baixa de estoque                              | gatilho filtrado na transição e teste (AC-12010)                             |
| Vazamento entre lojas por função de acesso ampliado       | caminho fixo, lojas separadas, testes por função (AC-12016)                  |
| Envio de e-mail para terceiros ou enumeração de inscritos | e-mail confirmado, resposta uniforme, limite, confirmação dupla se sem conta |
| Dado pessoal em fila ou log                               | só ids; endereço lido no envio (AC-12018)                                    |
| Canal sem provedor em produção                            | decisão de Q-12002 e Q-12004 antes de começar                                |
| Critérios de banco sem prova no comando atual             | Q-12012 e a tabela da seção 8                                                |
| Colisão de migration e de arquivos com outros cards       | fila do gerente, número da próxima migration livre                           |
