# Moderação pelo admin do SimpleClick — levantamento e proposta

Card #80. **Só levantamento: nada foi implementado.** Escrito em 19/10/2026, a partir da leitura do código (migrações até a 0071, `apps/api`, `packages/contracts`, `apps/web`).

**Resumo para quem tem pressa**

- Hoje o admin só controla a **loja inteira** (aprovar, recusar, desativar, excluir). Ele **não vê nem remove um conteúdo isolado** (foto, produto, story, comentário) de uma loja já aprovada.
- Já existe uma peça aproveitável: a **denúncia de comentário** (`comment_reports`), mas ela só chega ao **lojista**, nunca ao admin.
- Não existe denúncia de loja, produto, story ou post. Também não existe lista de palavras proibidas, nem varredura de imagem, nem nível de confiança por loja.
- Recomendo começar pela **denúncia + fila no /admin + ocultar/remover + aviso ao lojista** (onda 1). É barato (zero custo de IA) e resolve o principal: o dono passa a ter como agir.
- **Não dá para garantir 100% de fiscalização.** Qualquer solução reduz o risco e o tempo de reação; não zera.

---

## 1. Inventário: o que o código já tem

### 1.1 Situação da loja

| Item | O que existe | Onde |
|---|---|---|
| Estados da loja | `PENDING_APPROVAL`, `ACTIVE`, `REJECTED`, `INACTIVE`, mais excluída (`deleted_at`, com 30 dias para restaurar e depois remoção definitiva) | migração 0049; `stores.status`; `contracts/src/admin-situacao.ts` |
| Transições | aprovar e recusar (de PENDING_APPROVAL), ativar e desativar (INACTIVE ⇄ ACTIVE). Todas **pedem motivo** (3 a 500 letras) | `TRANSICOES_DA_LOJA` |
| Efeito da desativação | A vitrine e o feed só enxergam loja `ACTIVE` (política no banco e na resolução pública). Catálogo e pedidos ficam intactos; reativar devolve "como estava" | `status-loja.usecase.ts` |
| Quem altera | Só a credencial `sc_admin` altera `stores.status` | `situacao.repo.ts` |
| Endpoints (admin) | `GET/POST /v1/admin/lojas`, `GET/PATCH /lojas/:id`, `…/suspensao`, `…/reativacao`, `…/restauracao`, `…/apelido`, `…/tipo-de-negocio`, `…/limites`, `…/equipe`, `…/documentos`, `…/metricas`, `GET /auditoria`, `GET /contas`, `/limites` | `apps/api/src/modules/admin/*.routes.ts` |
| Telas | `/admin`, `/admin/lojas` (lista, ficha com abas: cadastro, documentos, funcionalidades, histórico), `/admin/contas`, `/admin/auditoria` | `apps/web/src/app/(admin)/admin/` |

**Lacuna:** suspender é tudo ou nada. Não há "ocultar só este produto/story" nem "avisar o lojista e dar prazo".

### 1.2 Auditoria

| Tabela | Para quê | Observação |
|---|---|---|
| `app.audit_log` | Trilha **por loja**: quem (`actor_id`, `actor_role`), o quê (`action`, `entity`, `entity_id`), antes/depois (`before_data`/`after_data`), `ip_hmac`, data | Imutável (3 camadas). Sem dado pessoal em claro. Exige `store_id` |
| `app.audit_platform` | Trilha do que não é de loja (limites da plataforma, limite de dono) | Mesmas garantias |
| Atos já registrados | `LOJA_APROVADA`, `LOJA_RECUSADA`, `LOJA_ATIVADA`, `LOJA_DESATIVADA`, `LOJA_EXCLUIDA`, `LOJA_RESTAURADA`, `CONFIG_ALTERADA`, `CONFIG_SENSIVEL_ALTERADA`, `DOCUMENTO_BAIXADO`, `COMENTARIO_APROVADO/RECUSADO/APAGADO`, `COMENTARIOS_AUTOR_BLOQUEADO` e outros | `trilha.ts`, `status-loja.usecase.ts`, `social.usecase.ts` |

Dá para reaproveitar para registrar cada ato de moderação. **Não** há registro de "o lojista trocou nome/logo/descrição" com alerta ao admin (a troca de aparência cai em `CONFIG_ALTERADA`, sem destaque).

### 1.3 Onde cada conteúdo é gravado

| Conteúdo | Tabela / campo | Quem grava (endpoint) | Mídia | Passa por revisão hoje? |
|---|---|---|---|---|
| Nome de exibição, "boas-vindas", "Sobre a loja" (até 2.000 letras) | `store_settings` (jsonb) e `stores.name` | Painel: configuração/aparência (`configuracao.routes.ts`) | — | **Não.** Vai ao ar na hora. Só o cadastro inicial passa pela aprovação |
| Logo, capa, fundo, topo | Só o **endereço https** em `store_settings` | Painel: upload conferido pelos bytes (jpeg/png/webp, tamanho e proporção, `imagem-da-loja.ts`) ou colar URL https | Cloudinary (`core/midia.ts`) | **Não** |
| Produto (nome, descrição, preço, especificações) | `products` (`description`, `search_text`) | `…/catalogo/produtos` | — | **Não** |
| Fotos do produto | `product_images` (`url`, `alt_text`) | `…/produtos/:id/imagens` (`imagens.routes.ts`) | Cloudinary (`hospedagem-de-imagem.ts`) | **Não** |
| Vídeos do produto (até 3, 50 MB, 60 s) | `product_videos` (`url`, `storage_key`) | `…/produtos/:id/videos` (`midias.routes.ts`) | Cloudinary em produção; disco local em dev (`core/armazenamento-de-midia.ts`) | **Não** |
| Post do feed | `feed_posts` (um por produto; gerado por gatilho quando `products.publish_to_feed`). **O post é o próprio produto**: não tem texto/mídia seus | gatilho `publicar_produto_no_feed` | as do produto | **Não** |
| Story de 24 h | `stories` (`media_url`, `storage_key`, `caption` ≤200, `link` interno, `expires_at`) | `POST /v1/lojas/:a/stories` (dono e equipe com `catalogo.produtos`) | Cloudinary/disco; apagado ao vencer (limpeza a cada 10 min) | **Não.** Limite de 30 ativos por loja (ajustável pelo admin) |
| Comentário (≤500 letras) | `comments` (`status` PENDENTE/APROVADO/RECUSADO, motivo, quem moderou) | Cliente logado | — | **Sim, pela loja** (aprovar/recusar/apagar/bloquear autor) |
| Denúncia de comentário | `comment_reports` (comentário, pessoa, motivo ≤200) | `POST /v1/feed/comentarios/:id/denuncia` (função `app.denunciar_comentario`) | — | Só a equipe da loja lê. **O admin não tem tela** |
| Banner promocional | **Ainda não existe cadastro**: a vitrine devolve `banners: []` (`vitrine.routes.ts:209`) | — | — | n/a (entra na moderação quando for criado) |
| Dados pessoais de cliente | `customers`, endereços, pedidos | — | — | Fora do escopo de moderação (é dado privado, não publicação) |

### 1.4 Limites e proteções já existentes

| Proteção | Valor |
|---|---|
| Limites por loja (admin ajusta por loja) | produtos (padrão 500), categorias, clientes, equipe, stories ativos (30); lojas por dono (2) — `platform_limit_defaults`, `store_limits`, `owner_limits` |
| Comentários | máx. 5 em 10 min e 50 em 24 h por pessoa (`app.pode_comentar`); loja pode bloquear autor |
| Upload | confere os **bytes**, não o nome; foto até 10 MB; vídeo mp4/webm; sem credencial de mídia → 503 |
| Isolamento | RLS em todas as tabelas; `sc_admin` enxerga tudo (política `*_admin_all` já existe em comentários, stories, vídeos, feed) |

**Boa notícia técnica:** como o `sc_admin` já tem política de leitura/escrita nessas tabelas, a moderação **não exige abrir permissões novas**; exige rotas e telas novas no módulo admin.

### 1.5 O que NÃO existe

Denúncia de loja/produto/story/post · fila de moderação · ocultar conteúdo isolado · strikes/reincidência · aviso ao lojista com motivo · contestação · lista de palavras proibidas · hash de imagem · nível de confiança por loja · "ver como a loja" para o admin em loja ativa · alerta de troca de nome/logo · exportação de evidências · IA de moderação · página de política de conteúdo (cuidada por outro card).

---

## 2. Opções de moderação

Custos em reais são **estimativas de ordem de grandeza** (preços de provedores mudam; confirmar antes de contratar). "Esforço" é em cards Sonnet.

### (a) Denúncia por qualquer pessoa

Botão "Denunciar" (com motivo de uma lista + texto opcional) em loja, produto, story, post e comentário, gravando numa tabela única `content_reports` que cai na fila.

| | |
|---|---|
| Prós | Fiscalização "terceirizada" e gratuita; cobre o que ninguém prevê; exigência prática do Marco Civil (canal de notificação) |
| Contras | Depende de alguém ver e denunciar; abuso (denúncia falsa em massa para derrubar concorrente) |
| Mitigação | Exigir conta logada (já há `exigirConta`); 1 denúncia por pessoa por item (padrão de `comment_reports`); limite por hora; peso por reputação depois |
| Esforço | 1 card de banco+API (Sonnet médio) + 1 de botão nas telas (Sonnet médio) |
| Custo | Zero de IA. Só armazenamento mínimo |
| Dúvida de privacidade | Denúncia guarda `identity_id` do denunciante: nunca mostrar ao lojista |

Reuso: `comment_reports` e `app.denunciar_comentario` viram o modelo; migrar as denúncias antigas para a tabela nova (ou manter as duas e a fila ler as duas).

### (b) Fila de moderação no /admin

Tela `/admin/moderacao`: itens pendentes (denúncias agrupadas por alvo, com contagem), pré-visualização do conteúdo, ações **manter / ocultar / remover / suspender loja**, avisar o lojista com motivo, histórico por loja, strikes, contestação.

| | |
|---|---|
| Prós | É o coração da solução; todas as demais opções só alimentam esta fila |
| Contras | Exige o Arthur (ou alguém) olhar a fila: é trabalho humano contínuo |
| Pontos de projeto | **Ocultar ≠ apagar**: coluna `moderation_status` (`OK`, `OCULTO_PELA_PLATAFORMA`, `REMOVIDO`) no conteúdo e a vitrine/feed filtram por ela; guarda o original para evidência e contestação. **Aviso ao lojista**: aviso no painel (e e-mail, se houver canal) com motivo e prazo. **Strikes**: contador por loja (ex.: 3 ações em 90 dias → suspensão automática para revisão). **Contestar**: lojista responde 1 vez, admin decide. **Histórico**: usar `audit_log` (atos `MODERACAO_*`) |
| Esforço | Banco/API ≈ 2 cards (Sonnet alto); tela ≈ 2 cards (Sonnet médio); aviso ao lojista no painel ≈ 1 card |
| Custo | Zero de IA |

### (c) Varredura automática barata (regras, sem IA)

Ao salvar loja/produto/story/comentário: checar texto contra lista de palavras e padrões e **bloquear com explicação** ou **mandar para a fila**.

| Regra | Como | Falso positivo |
|---|---|---|
| Lista de termos proibidos (armas, drogas, adulto, golpe…) por categoria, com normalização de acento e variações ("l33t") | arquivo JSON versionado (como `sinonimos-da-busca.json`); função pura `avaliarTexto()` | **Alto** em palavras ambíguas ("bomba" de combustível, "cartucho" de impressora, "pistola" de pintura, "maconha" nome de planta). Por isso: **só enviar para fila**, não bloquear, salvo termos inequívocos |
| Dados pessoais expostos (CPF, cartão, e-mail, telefone no texto/nome) | regex + dígito verificador | Médio (telefone da loja é legítimo no campo certo) |
| Links suspeitos / encurtadores / "pix urgente" | regex | Baixo |
| Hash de imagens conhecidas | hash perceptual das imagens já removidas pelo admin (reupload cai na fila). **Não** é banco externo de abuso infantil | Baixo; só pega repetição |
| Loja nova → pré-revisão | ver (e) | — |

| | |
|---|---|
| Prós | Custo zero, instantâneo, sem enviar dado a terceiros, fácil de explicar |
| Contras | Fácil de burlar (grafia criativa, texto dentro de imagem); manutenção da lista |
| Esforço | 1 card para o motor de regras + lista inicial (Sonnet médio); 1 card para plugar nas rotas de gravação (Sonnet médio) |
| Custo | Zero |

### (d) Moderação por IA (texto e imagem), só como apoio

IA **classifica e prioriza**; **humano decide**. Nunca remover sozinho no começo.

| Opção | Texto | Imagem | Custo (ordem de grandeza) | Privacidade/LGPD | Observações |
|---|---|---|---|---|---|
| API de moderação de provedor (ex.: endpoint de moderação da OpenAI) | sim, multilíngue | sim (modelos omni) | Costuma ser **gratuita ou muito barata** (confirmar na tabela vigente) | Conteúdo sai do Brasil para o provedor; precisa de cláusula no termo e contrato de operador | Categorias genéricas (violência, sexual, ódio, autolesão). **Não conhece** "arma branca à venda" ou "golpe de pix" |
| Modelo de visão/LLM com política própria (ex.: Claude com prompt "esta imagem viola as regras X?") | sim | sim | Texto curto: fração de centavo por item. Imagem: ~centavos por 1.000 itens em modelo pequeno; faixa de **R$ 5–60 por 1.000 imagens** conforme modelo e resolução (estimativa; medir antes) | Mesma exportação; usar contrato que proíba treino com os dados | Entende **regras do SC** (armas, drogas, golpe, direito autoral evidente) e devolve motivo em português. Mais flexível, mais caro e mais lento que a API de moderação |
| Serviço de visão de nuvem (SafeSearch tipo Google/AWS Rekognition) | não | sim | ~US$ 1–1,5 por 1.000 imagens | Idem | Bom para nudez/violência; fraco para "regras do negócio" |
| Rodar modelo próprio | — | — | Infra + manutenção | Melhor privacidade | Desproporcional para o tamanho atual |

Estimativa de volume para decidir: 100 lojas × (20 produtos × 3 fotos + 1 story/dia) ≈ 6.000 fotos de catálogo (uma vez) + ~3.000 stories/mês. Mesmo no cenário caro, é **dezenas de reais por mês**. O custo real é o **tempo humano** de revisar a fila.

| | |
|---|---|
| Prós | Pega o que a lista de palavras não pega (nudez, violência, texto na imagem); prioriza a fila |
| Contras | Falso positivo (foto de biquíni de loja de moda, faca de cozinha) e falso negativo; envia dado a terceiro; dependência de provedor |
| Regra de ouro | IA só **marca e ordena**; a ação é sempre do admin. Medir falso positivo por 30 dias antes de pensar em automatizar qualquer coisa |
| Esforço | 1 card de integração com fila assíncrona (Sonnet alto): `moderation_jobs`, execução em segundo plano, chave em variável de ambiente, desligável por flag; 1 card de calibragem/relatório (Sonnet médio) |
| Quando | **Onda 3**, só depois de a fila (b) existir e de haver volume que justifique |

### (e) Pré-aprovação por nível de confiança

Cada loja tem um nível: `NOVA` → `CONFIAVEL` (padrão após X dias sem ocorrência e Y pedidos) → `OBSERVACAO` (após strike).

| Nível | O que passa por pré-aprovação |
|---|---|
| NOVA ou OBSERVACAO | stories, vídeos, primeira publicação de cada produto, troca de nome/logo/capa |
| CONFIAVEL | tudo publica direto; só denúncia e varredura (c) alcançam |

| | |
|---|---|
| Prós | Concentra o esforço humano onde o risco é maior; combina com a aprovação de loja que já existe |
| Contras | Atrito para lojista novo (story não sai na hora); exige fila rápida (SLA) senão frustra. Para story de 24 h, aprovar em 4 h é quase inútil: **sugestão: só vídeo de loja nova passa por pré-revisão; foto de story sai direto e vai para a fila a posteriori** |
| Esforço | 1 card (coluna `trust_level` + regras) e 1 card para "estado de publicação" nos conteúdos (Sonnet alto). Depende de (b) |
| Custo | Zero de IA |

### (f) Ferramentas do admin

| Ferramenta | O que é | Esforço |
|---|---|---|
| **Ver como a loja** | O admin abre a vitrine/painel em modo leitura, inclusive de loja não-ativa (hoje só o dono vê a própria loja em análise, migração 0057). Sem botões de salvar | Sonnet médio |
| **Mural de lojas novas/alteradas** | Lista das últimas lojas aprovadas e das que mudaram nome/logo/capa/sobre; ordenada por data, com miniatura | Sonnet médio |
| **Alerta de alteração pós-aprovação** | Ao trocar nome, logo, capa ou "sobre", gravar ato `LOJA_IDENTIDADE_ALTERADA` e criar item na fila (com antes/depois). Sem bloquear | Sonnet médio |
| **Exportação de evidências** | Pacote (ZIP/PDF) com texto, mídia, data, quem publicou, histórico e denúncias, para jurídico/polícia/contestação. Cuidado com privacidade (mascarar denunciante) | Sonnet alto |

### (g) Base legal e o que o Termo precisa prever

Não sou fonte jurídica; **validar com advogado**. Pontos para o card das páginas legais:

| Tema | O que prever |
|---|---|
| **Marco Civil da Internet (Lei 12.965/2014)** | O SC é provedor de aplicações. Regra geral (art. 19): só responde por conteúdo de terceiro se, **após ordem judicial**, não retirar. Exceções: nudez/ato sexual privado sem consentimento (art. 21, retirar após notificação do ofendido) e direitos autorais (regime próprio). Na prática: ter **canal de notificação e retirada** (a denúncia (a)) e agir rápido, mesmo sem ordem judicial, é prudente e ajuda a mostrar boa-fé. Guardar **registros de acesso** (art. 15: 6 meses) quando exigido |
| **Termos de uso** | Lista do que é **proibido** (ilegal, adulto, fraude/golpe, armas, drogas, ódio/discriminação, violação de direito autoral/marca, dados pessoais de terceiros, produto falsificado); o SC **pode ocultar, remover, suspender ou encerrar** sem aviso prévio em caso grave; o **lojista é responsável** pelo que publica e declara ter direitos sobre fotos/vídeos; licença para exibir o conteúdo; limitação de responsabilidade do SC |
| **Processo** | Aviso com motivo; prazo e canal de **contestação**; reincidência (strikes) e consequência; como reativar |
| **LGPD** | Base legal e finalidade da moderação (legítimo interesse/cumprimento de obrigação); **denunciante tem identidade protegida**; retenção de evidências (prazo definido, ex.: 6–12 meses); se houver IA de terceiros, citar **compartilhamento e transferência internacional** e o operador; direito do titular de pedir remoção de dado pessoal exposto; canal do encarregado (DPO) |
| **Direitos autorais / marca** | Formulário de notificação (quem é o titular, o que viola, onde está); contra-notificação |
| **Menores** | Política contra conteúdo envolvendo menores; **denúncia deste tipo tem prioridade máxima** e pode exigir comunicação a autoridades |
| **Categorias reguladas** | Alimentos, medicamentos, bebidas alcoólicas (venda a menores), cigarro, armas: o termo diz que o lojista cumpre a lei do seu ramo e que o SC pode vetar categorias |

---

## 3. Recomendação: MVP em ondas

**Princípio:** primeiro dar ao admin o poder de **ver e agir** (b+a); depois **reduzir a carga** com regras e confiança (c+e+f); só então **IA** (d).

| Onda | Conteúdo | Cards (estim.) | Esforço | Depende de | Resultado |
|---|---|---|---|---|---|
| **1** | Denúncia (a) + Fila no /admin (b) com ocultar/remover, aviso ao lojista, histórico e strikes simples. Ver como a loja (f, parte) | **7** | 2 Sonnet alto, 5 Sonnet médio | Aprovação do dono; texto do Termo (card de páginas legais) em paralelo | O dono consegue receber denúncia, ver e tirar do ar qualquer conteúdo, com registro |
| **2** | Varredura por regras (c); alerta de troca de nome/logo e mural de lojas novas (f); nível de confiança e pré-revisão de vídeo/story de loja nova (e); contestação | **6** | 2 Sonnet alto, 4 Sonnet médio | Onda 1 (fila e `moderation_status`) | Menos trabalho manual; lojas novas e alteradas sob olho |
| **3** | IA de apoio (d): classificação de texto e imagem enviando à fila com nota e motivo; exportação de evidências (f); painel de métricas da moderação | **4** | 2 Sonnet alto, 2 Sonnet médio | Onda 2; decisão de provedor, contrato e Termo com cláusula de IA | Fila priorizada; custo medido; só avisa, nunca remove |

Ordem dentro da onda 1: banco → API de denúncia → botões nas telas ∥ API da fila → tela da fila → aviso ao lojista → "ver como a loja".

### Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Ninguém olha a fila | Denúncia vira promessa vazia (pior que não ter botão) | Contador no menu do admin, e-mail/alerta ao admin, definir SLA realista; começar com poucas lojas |
| Denúncia falsa | Derrubar concorrente | Conta obrigatória, 1 por pessoa por item, limite por hora; ocultar só por decisão humana |
| Falso positivo de regras/IA | Lojista legítimo punido | Regras só mandam à fila; aviso com motivo e contestação |
| Apagar prova | Problema legal e sem contestação | Ocultar antes de remover; guardar mídia por prazo; cuidado: o story vence em 24 h e **o arquivo é apagado pela limpeza**, então ao ser denunciado a mídia precisa ser **congelada** (não apagar enquanto houver denúncia aberta) |
| Dado do cliente na evidência | LGPD | Mascarar denunciante e dados pessoais no pacote |
| Envio de conteúdo a provedor de IA | Transferência internacional | Só na onda 3, com cláusula no Termo e contrato de operador |
| Conteúdo ilegal grave (menores) | Risco criminal | Fluxo próprio de prioridade máxima; orientação jurídica antes do lançamento |
| Escopo cresce | Atrasa tudo | Fixar a onda 1 como "ver, ocultar, avisar, registrar" |
| **Limite honesto** | Conteúdo impróprio vai passar: texto em imagem, grafia criativa, loja que muda após aprovação, mídia por link externo (logo por URL https colada) | Combinar camadas (denúncia + regras + confiança + IA) e **comunicar no Termo** que a plataforma modera por notificação e amostragem, não previamente |

Ponto de atenção técnico: **logo/capa podem ser URL colada** (qualquer https). Isso permite imagem hospedada fora, trocável depois da revisão. Sugestão: na onda 2, só aceitar upload (que passa pelo nosso armazenamento) ou copiar a imagem para o nosso armazenamento ao salvar.

---

## 4. Cards prontos para a onda 1

Migração livre: **0072** (confirmar no board antes). Rotas devem ser registradas em `packages/contracts/src/rotas.ts` e nos testes de contrato.

### Card 1 — Banco da moderação (Sonnet alto)

- **Escopo:** migração com `content_reports` (alvo tipo+id, `store_id`, denunciante, motivo da lista, texto ≤300, status ABERTA/PROCEDENTE/IMPROCEDENTE, quem decidiu), `moderation_actions` (alvo, ação, motivo, admin, data, desfeita_em), `stores.strike_count` (ou derivado das ações), coluna `moderation_status` (`OK`/`OCULTO`/`REMOVIDO`) em `products`, `product_videos`, `product_images`, `stories`, `comments`, e em loja (`stores.moderation_status` ou usar INACTIVE). Filtro nas funções públicas (vitrine, feed, stories, comentários) para esconder `OCULTO`/`REMOVIDO`. Ação `MODERACAO_*` no `audit_log`. Mídia de alvo denunciado não é apagada pela limpeza de stories enquanto houver denúncia aberta.
- **Arquivos:** `packages/database/migrations/0072_moderacao.sql`, `packages/database/prisma/schema.prisma` (só modelos novos no fim), funções públicas em migrações novas (substituir `app.feed_produtos`, listagem de stories, etc. por versões com filtro), `apps/api/src/modules/stories/stories.usecase.ts` (limpeza).
- **Dependências:** nenhuma. **Cuidado:** muitas funções SECURITY DEFINER da vitrine/feed precisam do filtro; cobrir com teste de isolamento (`apps/api/tests/isolamento-varredura.test.ts`).

### Card 2 — API de denúncia (Sonnet médio)

- **Escopo:** `POST /v1/denuncias {alvoTipo, alvoId, motivo, texto?}` (conta logada; 1 por pessoa por alvo; limite por hora), motivos fixos (ilegal, adulto, golpe/fraude, armas, drogas, ódio, direito autoral, dado pessoal, outro). Mantém `…/comentarios/:id/denuncia` funcionando (grava também na tabela nova). Nunca expõe o denunciante ao lojista.
- **Arquivos:** `apps/api/src/modules/moderacao/denuncias.routes.ts` e `.usecase.ts` (módulo novo), `packages/contracts/src/moderacao.ts`, `index.ts`, `rotas.ts`, `apps/api/src/app.ts`.
- **Dependências:** Card 1.

### Card 3 — Botão "Denunciar" nas telas públicas (Sonnet médio)

- **Escopo:** menu "⋯ → Denunciar" com janela (motivo + texto + confirmação) em loja, produto, story, post do feed e comentário; exige login (usa a janela de acesso existente); mensagem de agradecimento sem prometer prazo. Seguir `apps/web/AGENTS.md` (Campo com `info`, rótulo visível).
- **Arquivos:** `apps/web/src/features/moderacao/` (novo: `JanelaDeDenuncia.tsx`), proxy `apps/web/src/app/api/denuncias/route.ts`, pontos de encaixe em `features/feed/`, `features/vitrine/`, `features/produto/`, `features/comentarios/` e `app/(loja)/`.
- **Dependências:** Card 2. **Conflito possível:** vários cards de UI mexem nessas pastas; reservar com `board_claim`.

### Card 4 — API da fila e das ações do admin (Sonnet alto)

- **Escopo:** `GET /v1/admin/moderacao` (pendentes agrupados por alvo, filtros por tipo/loja/idade, contagem), `GET /v1/admin/moderacao/:id` (conteúdo, loja, denúncias, histórico), `POST …/:id/decisao {acao: manter|ocultar|remover|suspender-loja, motivo}`, `POST …/desfazer`, `GET /v1/admin/lojas/:id/moderacao` (histórico e strikes). Cada ato na `audit_log`, mesma transação. Ação "suspender loja" reaproveita `status-loja.usecase`. Cria o **aviso ao lojista** (tabela `store_notices`: motivo, prazo para contestar, lido em).
- **Arquivos:** `apps/api/src/modules/moderacao/fila.routes.ts`, `fila.usecase.ts`, `fila.repo.ts`, `packages/contracts/src/moderacao.ts`, `rotas.ts`, `apps/api/src/app.ts`.
- **Dependências:** Card 1 (e Card 2 para haver itens).

### Card 5 — Tela /admin/moderacao (Sonnet médio)

- **Escopo:** fila com abas (Pendentes, Decididas), filtros, pré-visualização do conteúdo (foto, vídeo, texto, story), botões Manter / Ocultar / Remover / Suspender loja com motivo obrigatório; contador no menu do admin; histórico da loja com strikes na ficha (`/admin/lojas/[id]`, nova aba "Moderação").
- **Arquivos:** `apps/web/src/app/(admin)/admin/moderacao/`, `apps/web/src/features/admin-moderacao/` (novo), `apps/web/src/app/api/admin/moderacao/`, `apps/web/src/features/painel/MenuDaAdministracao.tsx` (1 item e o selo), `apps/web/src/features/admin/AbasDaLoja.tsx` (1 aba).
- **Dependências:** Card 4.

### Card 6 — Aviso ao lojista no painel (Sonnet médio)

- **Escopo:** faixa/área "Avisos da plataforma" no painel com o motivo, o conteúdo afetado (ocultado/removido) e como contestar; marcar como lido; selo no menu. Na onda 1 a contestação é só "responder uma mensagem" (texto, 1 vez), que aparece no item da fila.
- **Arquivos:** `apps/web/src/features/avisos-da-plataforma/`, `apps/web/src/app/(painel)/painel/avisos/`, `apps/web/src/features/painel/secoes-do-painel.ts` e `MenuDoPainel.tsx`, rota do lojista em `apps/api/src/modules/moderacao/avisos.routes.ts`.
- **Dependências:** Card 4.

### Card 7 — "Ver como a loja" para o admin (Sonnet médio)

- **Escopo:** botão na ficha da loja que abre a vitrine (e o painel, só leitura) com faixa fixa "Modo leitura da administração"; funciona com loja em qualquer situação (hoje só ACTIVE aparece); registra `ADMIN_VIU_LOJA` na trilha. Sem botões de gravar.
- **Arquivos:** `apps/web/src/features/admin/CabecalhoDaFicha.tsx` ou `AcoesLoja.tsx`, rota de leitura nova na API admin (`apps/api/src/modules/admin/` ou `moderacao/`), e o ponto em que a vitrine resolve loja não-ativa.
- **Dependências:** nenhuma da fila; pode andar em paralelo. **Risco:** mexe na resolução pública (RLS): precisa de revisão cuidadosa.

### Antes de criar os cards, o dono decide

1. Aceita a **onda 1** como escopo, ou quer incluir já a varredura por regras (c)?
2. Aviso ao lojista: só no painel, ou também **e-mail** (hoje há canal de e-mail?). Se sim, vira mais 1 card.
3. Quem **olha a fila** e qual a meta de resposta (ex.: 24 h)? Define se vale pré-revisão (e).
4. Aceita em princípio enviar texto/imagem a um provedor de IA (onda 3), com cláusula no Termo?
5. Strikes: quantos até suspender? (sugestão: 3 ações procedentes em 90 dias → loja vai para revisão obrigatória.)
