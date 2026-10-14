# Tasks: Fundacao

> feature: fundacao

## T-001 — Monorepo, ferramentas e regras de fronteira [concluida]

- Refs: US-002, AC-005
- Arquivos: package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, eslint.config.js, lefthook.yml, Makefile, .gitignore, packages/config-ts/package.json, packages/config-ts/base.json, packages/config-ts/node.json, packages/config-ts/react.json, packages/config-eslint/package.json, packages/config-eslint/index.js, packages/config-eslint/fronteiras.js, packages/config-eslint/tests/fronteiras.test.js
- Notas: as regras de dependência entre camadas da tabela em design/arquitetura.md viram regra de formatação verificável. Nenhuma outra tarefa começa antes desta.
- Esforço: medio

## T-002 — Ambiente local sobe com um comando [concluida]

- Refs: US-001, AC-001
- Arquivos: infra/compose/docker-compose.yml, infra/compose/docker-compose.ci.yml, infra/compose/.env.compose.example, infra/traefik/traefik.yml, infra/traefik/dynamic/tls.yml, infra/traefik/dynamic/middlewares.yml, infra/traefik/certs/.gitkeep, infra/scripts/setup.sh, infra/scripts/certs.sh, infra/scripts/up.sh, infra/tests/compose.test.ts, Makefile
- Notas: perfis core, app, test e print. O roteador local existe para reproduzir o endereço por loja com TLS em desenvolvimento; em produção esse papel é do provedor.
- Esforço: alto

## T-003 — Variáveis de ambiente validadas na partida [concluida]

- Refs: AC-002, AC-031
- Arquivos: .env.example, apps/api/src/core/env.ts, apps/api/src/core/env.test.ts, apps/api/package.json, apps/api/tsconfig.json, infra/scripts/check-ambientes.sh, infra/tests/check-ambientes.test.ts
- Notas: a API recusa iniciar nomeando a variável ausente. O verificador de ambientes reprova produção e teste apontando para o mesmo banco ou cache.
- Esforço: baixo

## T-004 — Migrações base, credenciais separadas e isolamento por linha [concluida]

- Refs: US-003, AC-008, AC-009, AC-012, AC-032, AC-033, AC-034
- Arquivos: packages/database/package.json, packages/database/migrations/0001_extensoes_e_roles.sql, packages/database/migrations/0002_identidade.sql, packages/database/migrations/0003_lojas.sql, packages/database/migrations/0004_catalogo.sql, packages/database/migrations/0005_pedidos.sql, packages/database/migrations/0006_impressao_e_auditoria.sql, packages/database/policies/README.md, packages/database/src/migrate.ts, packages/database/src/migrate.test.ts
- Notas: três credenciais distintas — migração, aplicação e administração. A credencial da aplicação não pode contornar o isolamento. Segue o modelo em design/modelo-de-dados.md, com a precedência do adendo do topo.
- Esforço: max

## T-005 — Guardas estruturais do banco no portão de qualidade [concluida]

- Refs: AC-008, AC-035
- Arquivos: packages/database/guards/g1_isolamento_ativo.sql, packages/database/guards/g2_politica_por_comando.sql, packages/database/guards/g3_unica_por_loja.sql, packages/database/guards/g4_politica_cita_loja.sql, packages/database/guards/g5_indice_cobre_politica.sql, packages/database/guards/g6_sem_matview_multi_loja.sql, packages/database/guards/g7_view_com_invocador.sql, packages/database/guards/g8_pedido_imutavel.sql, packages/database/guards/g9_auditoria_sem_alteracao.sql, packages/database/src/guards.ts, packages/database/src/guards.test.ts, infra/scripts/db-guards.sh, infra/scripts/verificar.sh
- Notas: a guarda 4 existe por achado medido — política sem o identificador da loja no conjunto destrói o índice ordenado. A guarda 5 confere que o índice inclui também as colunas citadas pelas políticas. Não há fluxo do GitHub Actions: a verificação deste projeto roda inteiramente na máquina do dono, e as guardas entram como etapa de `infra/scripts/verificar.sh`.
- Esforço: alto

## T-006 — Caminho único de acesso ao banco com contexto por transação [concluida]

- Refs: AC-010, AC-011, AC-009
- Arquivos: apps/api/src/core/db.ts, apps/api/src/core/db.test.ts, apps/api/src/core/contexto.ts, apps/api/src/core/contexto.test.ts
- Notas: uma transação por requisição, contexto definido nela e descartado ao fim. Nenhum módulo instancia cliente próprio (P-004). Prova de que o contexto não escapa entre requisições concorrentes.
- Esforço: max

## T-007 — Banco de teste separado e efêmero [concluida]

- Refs: US-001, AC-003
- Arquivos: vitest.config.ts, packages/testing/package.json, packages/testing/tsconfig.json, packages/testing/src/index.ts, packages/testing/src/db-test.ts, packages/testing/src/db-test.test.ts, packages/testing/src/vitest-banco.ts, packages/testing/tests/paralelo-a.test.ts, packages/testing/tests/paralelo-b.test.ts, packages/testing/fixtures/vitest.fixture.config.ts, packages/testing/fixtures/banco-proprio.prova.ts, packages/testing/fixtures/falha-proposital.prova.ts, infra/scripts/verificar.sh
- Notas: banco por processo de teste, criado a partir de molde. Dados de desenvolvimento nunca são tocados. Rodar duas vezes dá o mesmo resultado.
- Esforço: alto

## T-008 — Dados de exemplo determinísticos [concluida]

- Refs: AC-004, AC-036, AC-037, AC-039
- Arquivos: packages/database/seed/index.ts, packages/database/seed/lojas.ts, packages/database/seed/catalogo.ts, packages/database/seed/pedidos.ts, packages/database/seed/deterministico.ts, packages/database/seed/seed.test.ts, vitest.config.ts
- Notas: as chaves plantadas são as que o MODELO declara e a projeção pública lê — divergir produz uma semente que planta sem erro e uma vitrine que não mostra nada, o pior tipo de dado de exemplo porque passa em todo teste e falha quando alguém abre a página. Toda loja tem horário: sem ele, todas apareceriam fechadas para sempre, e dado de exemplo que não produz cenário navegável não é dado de exemplo. Duas lojas de ramos diferentes, uma de comida e uma com estoque, com pedidos em todos os status. Identificadores e datas previsíveis. Recusa rodar em produção.
- Esforço: alto

## T-009 — Construtores de dados para teste [concluida]

- Refs: AC-038
- Arquivos: packages/testing/src/factories.ts, packages/testing/src/factories.test.ts, packages/testing/src/index.ts, packages/testing/src/vitest-banco.ts, packages/testing/fixtures/ordem-dos-construtores.prova.ts
- Notas: cada teste monta o próprio cenário; ordem de execução não altera resultado. Unicidade por contador do processo, nunca por sorteio. Loja e identidade entram pela credencial de administração (como em produção, onde `INSERT` em `stores` é retirado de `sc_app`); membro, produto e cliente entram pela credencial da aplicação, dentro de uma transação com `app.store_id` gravado. A ordem invertida é provada rodando a mesma suíte em outro processo, com os casos registrados ao contrário, e comparando os relatos. Falta `criarCategoria`: `app.categories` ainda não existe no banco (ver docs/pendencias.md).
- Esforço: medio

## T-010 — Prova de isolamento em toda tabela de loja [concluida]

- Refs: AC-010, AC-011
- Arquivos: apps/api/tests/apoio-de-isolamento.ts, apps/api/tests/isolamento-varredura.test.ts, apps/api/tests/isolamento-concorrente.test.ts
- Notas: a prova deixa de depender de alguém lembrar de escrevê-la para cada tabela nova: a varredura pergunta ao catálogo do PostgreSQL quais tabelas têm identificador de loja e cobra leitura, inserção, alteração e remoção de CADA uma, separadamente. Tabela que a varredura não sabe povoar REPROVA pedindo o construtor — nunca é pulada. A própria varredura é provada por uma tabela com identificador de loja e sem política, criada de propósito e desfeita no fim. A prova de concorrência vai além da T-006: quatro lojas, escrita misturada com leitura e 120 requisições sobre três conexões. Marcado com @principle:P-003.
- Esforço: max

## T-011 — Contrato compartilhado e documento publicado [concluida]

- Refs: US-002, AC-006, AC-007
- Arquivos: packages/contracts/package.json, packages/contracts/tsconfig.json, packages/contracts/src/index.ts, packages/contracts/src/comum.ts, packages/contracts/src/erro.ts, packages/contracts/src/rota.ts, packages/contracts/src/rotas.ts, packages/contracts/src/saude.ts, packages/contracts/src/rota.test.ts, packages/contracts/src/contrato.test.ts, apps/api/src/contracts/gerar.ts, apps/api/src/contracts/gerar.test.ts, apps/api/src/contracts/conformidade.test.ts, contrato/openapi.json, apps/web/src/lib/api-contrato.ts, apps/web/src/server/api-client.ts, apps/web/src/app/page.tsx, apps/web/tests/api-contrato.test.ts, apps/web/tests/contrato-tipos.test.ts, packages/config-eslint/fronteiras.js, infra/scripts/verificar.sh
- Notas: fonte única de esquema para web, API e aplicativos nativos — a decisão D1 saiu de pendente em 17/08. `definirRota` serve a dois usos com uma declaração só: valida a entrada em execução (P-007) e descreve a rota para o documento. A geração vive na API, não no pacote de contrato, para que trocar o formato publicado não obrigue a mexer nos esquemas de domínio. O catálogo declara só o que a API serve hoje (raiz e erro); saúde separada em vivo/pronto entra com a T-012. Não há fluxo do GitHub Actions: a etapa de contrato entra em `infra/scripts/verificar.sh`, como as guardas do banco.
- Esforço: alto

## T-012 — Registro, erros e verificações de saúde [concluida]

- Refs: US-006, AC-021, AC-022, AC-023, AC-024
- Arquivos: apps/api/src/core/log.ts, apps/api/src/core/log.test.ts, apps/api/src/core/erros.ts, apps/api/src/core/erros.test.ts, apps/api/src/modules/health/health.routes.ts, apps/api/src/modules/health/health.cache.ts, apps/api/src/modules/health/health.test.ts, apps/api/src/modules/health/health.int.test.ts
- Notas: registro por lista do que é permitido, nunca por lista do que é proibido. Dado pessoal não entra nem em erro detalhado. Vivo e pronto são verificações distintas.
- Esforço: medio

## T-013 — Borda de validação, origens autorizadas e limite de tentativas [concluida]

- Refs: AC-125, AC-126, AC-127, AC-128, AC-119, AC-120
- Arquivos: apps/api/src/core/validar.ts, apps/api/src/core/validar.test.ts, apps/api/src/core/cors.ts, apps/api/src/core/cors.test.ts, apps/api/src/core/limite.ts, apps/api/src/core/limite.redis.test.ts, apps/api/src/app.ts, apps/api/package.json, vitest.config.ts, infra/scripts/verificar.sh
- Notas: lista de origens fechada, nunca refletindo a origem recebida — o cabeçalho publicado sai da configuração, e quem compara não tem mais acesso ao texto recebido depois de comparar. Método que muda estado exige origem confiável; leitura pública passa de qualquer origem; `Vary: Origin` em toda resposta, senão o cache entrega a liberação de uma origem para outra. O limite de tentativas decide dentro de um script no Redis — leitura, comparação e escrita sem janela entre elas — e conta em dois eixos, com a conta em primeiro lugar. O endereço da origem vem por saltos contados a partir do FIM de `X-Forwarded-For`, porque o começo é escrito por quem chama. O relógio entra por parâmetro, o que torna o crescimento da espera provável sem esperar minutos de verdade. O e-mail de aviso que AC-119 pede é anunciado por `aoBloquear`; quem o transforma em mensagem é a feature de identidade, com a fila da T-014. A prova do limite fala com Redis de verdade e mora no projeto novo `api-redis` do Vitest, ligado ao portão.
- Esforço: alto

## T-014 — Trabalho em segundo plano com repetição [concluida]

- Refs: US-007, AC-025, AC-026
- Arquivos: apps/api/src/jobs/fila.ts, apps/api/src/jobs/fila.test.ts, apps/api/src/jobs/fila.int.test.ts, apps/api/src/jobs/email.job.ts, apps/api/src/jobs/email.job.test.ts, apps/api/src/jobs/email.job.int.test.ts, apps/api/src/jobs/index.ts, apps/api/src/jobs/index.test.ts, apps/api/tests/apoio-de-fila.ts, vitest.config.ts, infra/scripts/verificar.sh, .env.example
- Notas: envio de e-mail sai do caminho da resposta. Falha repete com espera crescente e termina em estado inspecionável. A fila de e-mail e a de webhook vivem no Redis (BullMQ); a de impressão fica declarada com motor PostgreSQL, porque no plano gratuito o Redis é o primeiro a cair e a cozinha não pode parar — a distinção é dado (`MOTOR_DAS_FILAS`), e não comentário. O adaptador de envio é porta: em teste, duplo que conta chamadas e falha sob comando; em produção, o adaptador de partida falha alto até o provedor de e-mail ser decidido. Os testes que precisam de Redis moram no projeto `filas` do Vitest e FALHAM dizendo o que fazer quando `REDIS_URL_TEST` não existe.
- Esforço: medio

## T-015 — Cache com identificação de loja e invalidação [concluida]

- Refs: AC-027, AC-028
- Arquivos: apps/api/src/core/cache.ts, apps/api/src/core/cache.test.ts, apps/api/src/core/cache.redis.test.ts, apps/web/src/server/cache.ts, apps/web/src/server/revalidacao.ts, apps/web/src/app/api/revalidate/route.ts, apps/web/tests/cache-do-site.test.ts, apps/web/tests/revalidate-rota.test.ts, vitest.config.ts, infra/scripts/verificar.sh, .env.example, apps/api/src/core/aviso-ao-site.ts, apps/api/src/core/aviso-ao-site.test.ts, apps/api/tests/vitrine-avisada-pelo-painel.int.test.ts, apps/web/tests/cache-da-vitrine.test.ts, apps/web/tests/revalidar-vitrine.test.ts
- Notas: a dívida 93 (03/10) ligou as duas pontas: a vitrine pública do site vai ao cache do Next com a etiqueta `vitrine:<apelido>`, a API avisa o site num ponto só (`core/aviso-ao-site.ts`, montado em `/v1/lojas` antes das rotas do dono, segurando o fim da resposta até o aviso terminar) e a rota de invalidação vence essa etiqueta com prazo zero — o perfil `"max"` do Next 16 serviria a cópia velha mais uma vez. Toda chave começa pelo identificador da loja, e a montagem RECUSA chave sem loja — o cache responde antes do banco, então a forma da chave é a única defesa que existe ali (nenhuma política de isolamento é consultada). O separador é proibido dentro das partes para que a loja `a` com o dado `b:x` não colida com a loja `a:b` com o dado `x`. A invalidação tem dois níveis: por loja (prefixo, que a regra da chave torna possível sem índice paralelo) e por dado. O prazo de validade é a rede de proteção: se o aviso se perder, o dado velho morre sozinho em 60s, sem reinício de serviço. Queda do cache é degradação — a leitura vai à fonte e a loja continua vendendo, com espera antes de tentar de novo para "sem cache" não virar "lento". O cliente de Redis é escrito à mão (RESP sobre TCP, seis comandos): o que as bibliotecas maduras acrescentam é justamente a fila de espera que transforma "o cache caiu" em "a página pendurou". Provado contra o Redis de verdade no projeto `cache-int` do Vitest, inclusive com valor de 200 mil caracteres (resposta partida pelo TCP) e com porta fechada (conexão recusada).
- Esforço: alto

## T-016 — Design system com os quatro estados [concluida]

- Refs: US-004, AC-013, AC-014, AC-015, AC-016
- Arquivos: packages/ui/package.json, packages/ui/tsconfig.json, packages/ui/styles/theme.css, packages/ui/styles/componentes.css, packages/ui/src/index.ts, packages/ui/src/tokens.ts, packages/ui/src/contraste.ts, packages/ui/src/botao.tsx, packages/ui/src/campo.tsx, packages/ui/src/cartao.tsx, packages/ui/src/lista.tsx, packages/ui/src/aviso.tsx, packages/ui/src/dialogo.tsx, packages/ui/src/estados.tsx, packages/ui/src/tema-loja.tsx, packages/ui/tests/contraste.test.ts, packages/ui/tests/tokens.test.ts, packages/ui/tests/componentes.test.tsx, packages/ui/tests/tema-loja.test.tsx, packages/config-eslint/cores.js, packages/config-eslint/tests/cores.test.js, apps/web/src/app/(dev)/ui/page.tsx, apps/web/src/app/tokens.css, apps/web/tests/vitrine-ui-estados.test.tsx, apps/web/tests/vitrine-ui-a11y.test.tsx, apps/web/tests/cores-projeto.test.ts, apps/web/src/app/(dev)/ui/_secoes/SecaoDaVitrine.tsx, apps/web/src/app/(dev)/ui/_secoes/SecoesDaMarca.tsx, apps/web/src/app/(dev)/ui/_secoes/SecoesDeControles.tsx, apps/web/src/app/(dev)/ui/_secoes/SecoesDeDados.tsx, apps/web/src/app/(dev)/ui/_secoes/SecoesDeRetorno.tsx, apps/web/src/app/(dev)/ui/_secoes/dados-da-vitrine.ts
- Notas: cor e espaçamento vêm de valores declarados; cor escrita direto no componente reprova, pela regra `cores/sem-cor-literal` que mora em `packages/config-eslint/cores.js`. A cor escolhida pela loja tem contraste ajustado automaticamente por cálculo de luminância do WCAG (`contraste.ts`); `tokens.ts` é o espelho em TypeScript de `theme.css`, porque o cálculo roda no servidor, e a divergência entre os dois reprova por teste. A acessibilidade da vitrine é medida com axe em jsdom — o navegador de verdade entra na T-020.
- Esforço: alto

## T-022 — Régua de front-end: pontos de quebra e a regra do peso [concluida]

- Refs: US-004, AC-014, AC-015
- Arquivos: .claude/skills/design-de-front/SKILL.md, .claude/skills/design-de-front/references/scroll-story.md, .claude/skills/design-de-front/references/mundo-3d.md, packages/ui/styles/theme.css, packages/ui/styles/narrativa.css, packages/ui/package.json, packages/ui/tests/pontos-de-quebra.test.ts, apps/web/src/lib/narrativa.ts, apps/web/src/lib/narrativa.test.ts
- Notas: a régua tem DUAS dimensões, porque largura sozinha não descreve uma tela: um iPad em retrato e um Nest Hub têm a mesma largura de 1024px e alturas de 1366 e 600. Os pontos saem dos aparelhos do DevTools, e não de números redondos — o piso de largura é 344px, o dobrável fechado, que é o que o P-012 chama de menor breakpoint suportado. Na altura, a tela comprida mostra MAIS seções em vez de esticar uma: duas a partir de 1100px, três a partir de 1700px. A skill separa as superfícies por PRESSA de quem está nelas: narrativa por rolagem com GSAP e Three.js nas landings, onde a pessoa está decidindo assinar; micro-interação no fluxo de pedido, onde ela está com fome e rede ruim. Isso não é gosto: o AC-415 exige a vitrine em 2,5s sem depender de script, e Three.js não desenha nada sem script.

## T-021 — O banco declarado e o banco real não se separam em silêncio [concluida]

- Refs: US-003, AC-044, AC-045
- Arquivos: packages/database/prisma/schema.prisma, packages/database/tests/esquema-cobre-o-banco.test.ts, packages/database/src/migrate.test.ts, vitest.config.ts
- Notas: nasceu de uma deriva real — as migrações 0007 e 0008 foram editadas depois de aplicadas, e como criam com "se não existir", reaplicar não alterou nada: a tabela de pedidos ficou com 28 colunas enquanto o arquivo declarava 45, faltando a chave que impede pedido duplicado. Duas verificações fecham os dois lados: uma reprova tabela sem modelo tipado (com lista de adiamento nomeada, que só pode encolher), outra reprova migração alterada depois de aplicada. A segunda já existia como comportamento testado e não era chamada por ninguém sem pedir.

## T-017 — Portão de qualidade local, com ganchos [concluida]

- Refs: US-005, AC-017, AC-018, AC-019, AC-020, AC-040, AC-041, AC-042, AC-043
- Arquivos: infra/scripts/verificar.sh, infra/scripts/portao-lib.sh, infra/scripts/registrar-pulo.sh, infra/scripts/check-segredos.sh, infra/scripts/check-mensagem.sh, infra/scripts/audit-regressao.mjs, infra/tests/portao.test.ts, lefthook.yml, package.json, docs/verificacao.md, docs/pendencias.md, infra/scripts/assistir.sh, infra/scripts/espiar.sh, infra/scripts/provar.sh, infra/scripts/iniciar-registro-do-portao.mjs
- Notas: nada roda em servidor externo — a verificação é um comando único na máquina de desenvolvimento. Gancho antes do registro cobre o rápido em segundos; gancho antes do envio roda o portão inteiro e bloqueia. Saída explícita para pular existe, mas registra a dívida em arquivo de pendências. Fixar versão das ferramentas para o resultado ser reproduzível. Consolidada: o motor do portão saiu de `verificar.sh` para `portao-lib.sh`, e o script virou só a lista de etapas em blocos — etapa nova é uma linha, e duas tarefas crescem o portão sem conflito. `check-sem-middleware.sh` não nasceu: a T-019 provou a ausência de `middleware.ts` por teste (`apps/web/tests/sem-middleware.test.ts`), que é mais forte que um script. As guardas estruturais moram em `infra/scripts/db-guards.sh` desde a T-008, e não em `packages/database/src/guards.ts`.
- Notas: `infra/scripts/iniciar-registro-do-portao.mjs` entrou no mapeamento em 26/09 (a auditoria o acusava como código órfão). Ele é o `registrar-pulo.sh --iniciar` em Node, chamado pelo `prepare` da instalação (706e23b): no Windows, `bash` pode apontar para um WSL não configurado, e a marcação do ponto de partida do registro do portão não pode depender disso.
- Esforço: alto

## T-018 — Publicação com migração antes da troca de versão [concluida]

- Refs: US-008, AC-029, AC-030, AC-031
- Arquivos: infra/railway/railway.json, infra/railway/pre-deploy.sh, infra/railway/README.md, infra/scripts/check-migracao-compativel.mjs, infra/scripts/check-ambientes.sh, infra/scripts/verificar.sh, apps/api/Dockerfile, apps/web/Dockerfile, apps/web/next.config.ts, .dockerignore, docs/publicacao.md, docs/pendencias.md, infra/tests/pre-deploy.test.ts, infra/tests/pre-deploy.int.test.ts, infra/tests/migracao-compativel.test.ts, infra/tests/imagens-de-producao.test.ts, infra/tests/check-ambientes.test.ts, packages/database/src/migrate.ts, vitest.config.ts, package.json
- Notas: a ordem é a garantia. `railway.json` declara o comando de pré-publicação, que é o que coloca a migração ENTRE "a imagem está pronta" e "a imagem recebe tráfego" — sair diferente de zero interrompe a publicação e a versão anterior continua atendendo, porque nunca chegou a ser desligada. A migração usa a credencial de migração em conexão DIRETA, e o script recusa publicar se a conexão apontar para o agrupador (agrupador em modo transação descarta o estado de sessão de que a migração é feita). Sem estado misto: uma transação por arquivo, provado contra PostgreSQL de verdade com uma migração que falha no meio — nem índice, nem política, nem gatilho dela sobram. AC-030 virou regra mecânica em `check-migracao-compativel.mjs`: coluna nova aceita nulo, remoção em duas etapas com a primeira citada em `-- @janela-cumprida:` (arquivo que precisa existir e ser anterior), renomear e trocar tipo nunca passam, e o perdão da janela é lista fechada — perdoar por exclusão faria um comentário virar chave-mestra. AC-031 roda nos dois lados do mesmo verificador: na máquina de quem desenvolve exige destinos diferentes, em produção exige que a variável de teste NÃO EXISTA — e ele é a PRIMEIRA etapa do portão, porque errado ali não é teste vermelho, é estrago já feito. As imagens: vários estágios, poda que joga a árvore fora e reinstala só o que executa (instalar "por cima" deixa os arquivos no depósito interno), e processo como usuário `node`. Ambas foram construídas e subiram de verdade durante a tarefa — a API respondendo `/v1/health/live` e o site respondendo a página inicial. Nada foi publicado: o domínio fica para o fim do projeto.
- Esforço: medio

## T-019 — Esqueleto do Next e da API que sobe vazio e verde [concluida]

- Refs: US-001, AC-001, AC-005
- Arquivos: apps/web/package.json, apps/web/tsconfig.json, apps/web/next.config.ts, apps/web/postcss.config.mjs, apps/web/src/app/layout.tsx, apps/web/src/app/page.tsx, apps/web/src/app/globals.css, apps/web/src/app/tokens.css, apps/web/src/app/error.tsx, apps/web/src/app/not-found.tsx, packages/ui/src/estados.tsx, apps/web/src/lib/host-loja.ts, apps/web/src/proxy.ts, apps/web/tests/estados.test.tsx, apps/web/tests/host-loja.test.ts, apps/web/tests/sem-middleware.test.ts, apps/web/tests/fronteiras-projeto.test.ts, apps/api/package.json, apps/api/tsconfig.json, apps/api/tsconfig.build.json, apps/api/src/app.ts, apps/api/src/app.test.ts, apps/api/src/main.ts, apps/api/src/main.test.ts, vitest.config.ts, .prettierignore
- Notas: sem regra de negócio. Existe para que as fatias seguintes tenham onde encostar, e para provar o caminho de ponta a ponta do ambiente. `tokens.css` nasce vazio e vira o `@import` do design system quando a T-016 publicar `packages/ui`. O arquivo de proxy tem esse nome porque o Next 16 ignora `middleware.ts` em silêncio.
- Notas: **`apps/web/src/app/loading.tsx` saiu do mapeamento em 26/09**: o arquivo foi removido em 26/08 (ver T-020) porque criava um limite de streaming acima de toda página pública e quebrava o AC-415. O estado de espera que ele desenhava mora em `packages/ui/src/estados.tsx` (`Carregando`), que é o arquivo real desta tarefa hoje e continua provado em `apps/web/tests/estados.test.tsx`.
- Esforço: medio

## T-020 — Manifesto de rotas e cobertura de telas [concluida]

- Refs: US-004, AC-016
- Arquivos: apps/web/src/lib/routes.ts, e2e/playwright.config.ts, e2e/iniciar-api.mjs, e2e/package.json, e2e/tsconfig.json, e2e/specs/rotas-manifesto.spec.ts, e2e/specs/manifesto-cobre-arquivos.spec.ts, pnpm-workspace.yaml, apps/web/tests/estados.test.tsx
- Notas: o manifesto espelha design/mapa-de-telas.md. Uma tela nova sem entrada no manifesto reprova, e é isso que torna "todas as telas" verificável. Acessibilidade em cada rota, marcado com @principle:P-012 e @principle:P-011.
- Notas: **ELA ESTAVA MARCADA COMO CONCLUÍDA SEM TER ENTREGADO NADA, e isso foi descoberto em 26/08** ao começar a T-510. Nenhum dos seis arquivos declarados existia: sem pasta `e2e/`, sem Playwright, sem `routes.ts`. A auditoria via o problema e dizia o certo — "que não existe (tarefa concluída!)" —, mas o portão não reprovava, porque `ARQUIVO_INEXISTENTE` estava classificado como backlog. Ver a dívida 81.
- Notas: quatro tarefas de ponta a ponta dependiam disto em silêncio — T-409, T-510, T-908 e T-963. É a dívida 66 um nível acima: a T-500 entregou caso de uso sem rota, a T-020 declarou o harness e não entregou nenhum. As duas passaram porque nada as chamava.
- Notas: **o harness pagou por si na primeira execução.** O AC-415 estava quebrado e nenhum teste de unidade podia ver: `app/loading.tsx` criava um limite de streaming ACIMA DE TODA PÁGINA PÚBLICA, e o conteúdo chegava dentro de um `<template>` que só o script punha no lugar. A vitrine sem script mostrava "Carregando…" para sempre. Provado com `javaScriptEnabled: false`, que é a única forma de ver isso.
- Notas: a resolução foi tirar o `loading.tsx` da RAIZ, e não o estado de espera. Havia tensão real entre o P-011 (quatro estados em toda tela) e o AC-415 (vitrine sem script), e ela é binária no Next: ou tudo acima daquele limite faz streaming, ou nada faz. Na vitrine, "carregando" nunca ajuda — o servidor já tem o dado antes de responder. O componente continua existindo em `packages/ui` e continua provado; o limite volta nas áreas em que a espera é real (painel, minha conta), quando elas nascerem.
- Notas: o manifesto guarda a rota no formato do MAPA (`{slug}`), e não no do Next (`[slug]`). A tradução é uma função só, e o dia em que o framework mudar de convenção muda um lugar — em vez de 50 linhas escritas à mão.
- Notas: das duas direções de cobertura, a que reprova é "tela no código sem linha no manifesto". A inversa — linha sem arquivo — é trabalho planejado e apenas conta: são 45 telas por construir, e cada uma é uma tarefa do plano.
- Notas: o ponta a ponta NÃO entra no portão, e é decisão consciente: o portão roda a cada envio e responde em menos de um minuto; navegador de verdade custa dezenas de segundos e exige o ambiente no ar. O lugar dele é `pnpm test:e2e`, antes de publicar e ao mexer em fluxo.
- Esforço: alto

## T-023 — Partida e desligamento da API de produção [concluida]

- Refs: US-010, AC-002, AC-046, AC-047, AC-048
- Arquivos: apps/api/src/main.ts, apps/api/src/main.test.ts, apps/api/src/main.redis.test.ts, apps/api/src/core/env.ts, apps/api/src/core/env.test.ts, .env.example, apps/api/Dockerfile, infra/railway/README.md, docs/publicacao.md, docs/pendencias.md
- Notas: nasce do levantamento de completude (LAC-03): com todas as tarefas fechadas, `main.ts` só lia a porta e escutava — não chamava `carregarAmbiente` (dívida 50), não subia `montarSegundoPlano` (dívida 36), não tratava o sinal de término, e a porta tinha dois nomes (dívida 56). A partida vira uma função exportada (`iniciarApi`) que valida o ambiente, sobe o segundo plano quando ligado e devolve quem desliga; o arquivo só se executa sozinho quando é a entrada do processo, para a prova poder importá-lo sem subir servidor.
- Notas: o desligamento fecha na ordem que a dependência pede — primeiro para de aceitar conexão e espera a resposta em curso (uma requisição pode enfileirar e-mail e tocar o banco), depois as filas, depois banco e cache. Tem prazo, abaixo dos 10 s que o `docker stop` dá antes de matar: estourar o prazo sai com código diferente de zero dizendo o que ficou aberto. O sinal é provado em processo, com um emissor de mentira no lugar de `process`, porque no Windows `kill('SIGTERM')` derruba o filho sem chamar o ouvinte — um teste por processo filho provaria a plataforma, não o código.
- Notas: a porta se chama `PORT`, o nome que o provedor injeta e que `core/env.ts` já validava; `API_PORT` vira nome aposentado, tolerado só quando aponta para a mesma porta, para não quebrar os `.env` locais que já existem. O segundo plano liga sozinho em produção e fica desligado fora dela, salvo `SEGUNDO_PLANO=ligado`: os testes que sobem a API não precisam de Redis, e produção não depende de alguém lembrar de uma variável para mandar e-mail. O envio continua pelo adaptador que falha alto (`enviadorNaoConfigurado`) até o dono escolher o provedor de e-mail (dívida 35).
- Notas: prova escopada de 03/10 numa árvore de trabalho do Windows: AC-001, AC-002, AC-046, AC-047 e AC-048 passam. Os critérios da fundação que reprovaram na mesma execução (AC-006, AC-007, AC-017, AC-020, AC-025, AC-029 a AC-031, AC-040 a AC-043) não passam por arquivo desta tarefa e reprovam por ambiente — CRLF do `core.autocrlf`, `.env` carregado pelo motor, ganchos do portão no Windows e a medição de 500 ms do AC-025 sob carga —, com o diagnóstico na dívida 94.
- Esforço: medio

## T-024 — Arranque do banco de produção, primeira administração e cópia de segurança [concluida]

- Refs: US-011, AC-049, AC-050, AC-051, AC-052
- Arquivos: packages/database/src/arranque.ts, packages/database/src/copia-de-seguranca.ts, packages/database/src/ensaio-de-restauracao.ts, packages/database/src/ferramentas-do-postgres.ts, packages/database/src/copia-de-seguranca.test.ts, packages/database/src/ferramentas-do-postgres.test.ts, packages/database/package.json, apps/api/src/arranque.ts, apps/api/src/modules/auth/primeira-administracao.ts, apps/api/tests/apoio-do-arranque.ts, apps/api/tests/arranque-de-producao.test.ts, apps/api/tests/arranque-recusas.test.ts, apps/api/Dockerfile, apps/web/Dockerfile, .dockerignore, README.md, HarnessPlan.md
- Notas: nasce do levantamento de completude (LAC-08): não havia caminho para um banco de produção vazio chegar ao estado do código nem para a primeira administração existir sem comando digitado à mão no banco. O arranque usa a credencial de dono do provedor UMA vez — a 0001 cria `sc_migrator`, então ele ainda não existe — e termina conferindo, já com a credencial de migração, que o banco está em dia: a partir daí a publicação segue só pelo `pre-deploy.sh`.
- Notas: a primeira administração nasce com o aplicativo autenticador já confirmado pelo operador no terminal, porque a administração sem aplicativo não abre sessão (AC-122). Senha e e-mail vêm do ambiente; a chave do aplicativo e os códigos de recuperação aparecem só no terminal de quem roda, uma vez.
- Notas: a cópia usa `pg_dump`/`pg_restore` da instalação do PostgreSQL (não é dependência nova do projeto) e grava ao lado um manifesto tirado do mesmo instante da cópia, para o ensaio conferir contagem de linhas sem depender de o banco de origem estar parado. Se o provedor oferecer cópia própria, as duas vias ficam documentadas e a escolha é do dono.
- Notas: a construção da imagem da API, conferida pela primeira vez nesta tarefa, revelou dois defeitos antigos: o `.dockerignore` só ignorava o `node_modules` da raiz (o de cada pacote, com ligações do Windows, entrava por cima do instalado e o gerador do Prisma não era achado) e `packages/core` faltava na instalação e na imagem final. Corrigidos; a imagem sobe e responde `/v1/health/live`. A restauração passa por `psql` com filtro porque `pg_restore` mais novo que o servidor escreve `SET transaction_timeout`, que o PostgreSQL 16 recusa.
- Esforço: alto
