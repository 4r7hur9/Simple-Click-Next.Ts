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
- Notas: duas lojas de ramos diferentes, uma de comida e uma com estoque, com pedidos em todos os status. Identificadores e datas previsíveis. Recusa rodar em produção.
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

## T-011 — Contrato compartilhado e documento publicado [pendente]

- Refs: US-002, AC-006, AC-007
- Arquivos: packages/contracts/package.json, packages/contracts/src/index.ts, packages/contracts/src/comum.ts, apps/api/src/contracts/gerar.ts, apps/api/src/contracts/gerar.test.ts, contrato/openapi.json, .github/workflows/contrato.yml
- Notas: fonte única de esquema para web, API e aplicativos nativos. O portão reprova se o documento publicado divergir do código. Depende da decisão pendente D1 em design/decisoes.md.
- Esforço: alto

## T-012 — Registro, erros e verificações de saúde [pendente]

- Refs: US-006, AC-021, AC-022, AC-023, AC-024
- Arquivos: apps/api/src/core/log.ts, apps/api/src/core/log.test.ts, apps/api/src/core/erros.ts, apps/api/src/core/erros.test.ts, apps/api/src/modules/health/health.routes.ts, apps/api/src/modules/health/health.test.ts
- Notas: registro por lista do que é permitido, nunca por lista do que é proibido. Dado pessoal não entra nem em erro detalhado. Vivo e pronto são verificações distintas.
- Esforço: medio

## T-013 — Borda de validação, origens autorizadas e limite de tentativas [pendente]

- Refs: AC-125, AC-126, AC-127, AC-128, AC-119, AC-120
- Arquivos: apps/api/src/core/validar.ts, apps/api/src/core/validar.test.ts, apps/api/src/core/cors.ts, apps/api/src/core/cors.test.ts, apps/api/src/core/limite.ts, apps/api/src/core/limite.test.ts, apps/api/src/app.ts
- Notas: lista de origens fechada, nunca refletindo a origem recebida. Limite por conta tem prioridade sobre limite por origem. Requisição que muda estado exige origem confiável.
- Esforço: alto

## T-014 — Trabalho em segundo plano com repetição [concluida]

- Refs: US-007, AC-025, AC-026
- Arquivos: apps/api/src/jobs/fila.ts, apps/api/src/jobs/fila.test.ts, apps/api/src/jobs/fila.int.test.ts, apps/api/src/jobs/email.job.ts, apps/api/src/jobs/email.job.test.ts, apps/api/src/jobs/email.job.int.test.ts, apps/api/src/jobs/index.ts, apps/api/src/jobs/index.test.ts, apps/api/tests/apoio-de-fila.ts, vitest.config.ts, infra/scripts/verificar.sh, .env.example
- Notas: envio de e-mail sai do caminho da resposta. Falha repete com espera crescente e termina em estado inspecionável. A fila de e-mail e a de webhook vivem no Redis (BullMQ); a de impressão fica declarada com motor PostgreSQL, porque no plano gratuito o Redis é o primeiro a cair e a cozinha não pode parar — a distinção é dado (`MOTOR_DAS_FILAS`), e não comentário. O adaptador de envio é porta: em teste, duplo que conta chamadas e falha sob comando; em produção, o adaptador de partida falha alto até o provedor de e-mail ser decidido. Os testes que precisam de Redis moram no projeto `filas` do Vitest e FALHAM dizendo o que fazer quando `REDIS_URL_TEST` não existe.
- Esforço: medio

## T-015 — Cache com identificação de loja e invalidação [pendente]

- Refs: AC-027, AC-028
- Arquivos: apps/api/src/core/cache.ts, apps/api/src/core/cache.test.ts, apps/web/src/server/cache.ts, apps/web/src/app/api/revalidate/route.ts
- Notas: toda chave começa pelo identificador da loja; teste prova que não há troca entre lojas. Invalidação por versão de catálogo, disparada por chamada autenticada.
- Esforço: alto

## T-016 — Design system com os quatro estados [concluida]

- Refs: US-004, AC-013, AC-014, AC-015, AC-016
- Arquivos: packages/ui/package.json, packages/ui/tsconfig.json, packages/ui/styles/theme.css, packages/ui/styles/componentes.css, packages/ui/src/index.ts, packages/ui/src/tokens.ts, packages/ui/src/contraste.ts, packages/ui/src/botao.tsx, packages/ui/src/campo.tsx, packages/ui/src/cartao.tsx, packages/ui/src/lista.tsx, packages/ui/src/aviso.tsx, packages/ui/src/dialogo.tsx, packages/ui/src/estados.tsx, packages/ui/src/tema-loja.tsx, packages/ui/tests/contraste.test.ts, packages/ui/tests/tokens.test.ts, packages/ui/tests/componentes.test.tsx, packages/ui/tests/tema-loja.test.tsx, packages/config-eslint/cores.js, packages/config-eslint/tests/cores.test.js, apps/web/src/app/(dev)/ui/page.tsx, apps/web/src/app/tokens.css, apps/web/tests/vitrine-ui-estados.test.tsx, apps/web/tests/vitrine-ui-a11y.test.tsx, apps/web/tests/cores-projeto.test.ts
- Notas: cor e espaçamento vêm de valores declarados; cor escrita direto no componente reprova, pela regra `cores/sem-cor-literal` que mora em `packages/config-eslint/cores.js`. A cor escolhida pela loja tem contraste ajustado automaticamente por cálculo de luminância do WCAG (`contraste.ts`); `tokens.ts` é o espelho em TypeScript de `theme.css`, porque o cálculo roda no servidor, e a divergência entre os dois reprova por teste. A acessibilidade da vitrine é medida com axe em jsdom — o navegador de verdade entra na T-020.
- Esforço: alto

## T-017 — Portão de qualidade local, com ganchos [pendente]

- Refs: US-005, AC-017, AC-018, AC-019, AC-020, AC-040, AC-041, AC-042, AC-043
- Arquivos: infra/scripts/verificar.sh, infra/scripts/check-segredos.sh, infra/scripts/check-mensagem.sh, infra/scripts/audit-regressao.mjs, infra/scripts/check-sem-middleware.sh, docs/verificacao.md, docs/pendencias.md, packages/database/src/guards.ts
- Notas: nada roda em servidor externo — a verificação é um comando único na máquina de desenvolvimento. Gancho antes do registro cobre o rápido em segundos; gancho antes do envio roda o portão inteiro e bloqueia. Saída explícita para pular existe, mas registra a dívida em arquivo de pendências. Fixar versão das ferramentas para o resultado ser reproduzível.
- Esforço: alto

## T-018 — Publicação com migração antes da troca de versão [pendente]

- Refs: US-008, AC-029, AC-030, AC-031
- Arquivos: infra/railway/pre-deploy.sh, infra/railway/README.md, apps/api/Dockerfile, apps/web/Dockerfile, docs/publicacao.md
- Notas: migração aplicada com a credencial de migração, antes de a versão nova receber tráfego; falha interrompe a publicação. Migração compatível com a versão anterior por uma janela definida.
- Esforço: medio

## T-019 — Esqueleto do Next e da API que sobe vazio e verde [concluida]

- Refs: US-001, AC-001, AC-005
- Arquivos: apps/web/package.json, apps/web/tsconfig.json, apps/web/next.config.ts, apps/web/postcss.config.mjs, apps/web/src/app/layout.tsx, apps/web/src/app/page.tsx, apps/web/src/app/globals.css, apps/web/src/app/tokens.css, apps/web/src/app/error.tsx, apps/web/src/app/not-found.tsx, apps/web/src/app/loading.tsx, apps/web/src/lib/host-loja.ts, apps/web/src/proxy.ts, apps/web/tests/estados.test.tsx, apps/web/tests/host-loja.test.ts, apps/web/tests/sem-middleware.test.ts, apps/web/tests/fronteiras-projeto.test.ts, apps/api/package.json, apps/api/tsconfig.json, apps/api/tsconfig.build.json, apps/api/src/app.ts, apps/api/src/app.test.ts, apps/api/src/main.ts, apps/api/src/main.test.ts, vitest.config.ts, .prettierignore
- Notas: sem regra de negócio. Existe para que as fatias seguintes tenham onde encostar, e para provar o caminho de ponta a ponta do ambiente. `tokens.css` nasce vazio e vira o `@import` do design system quando a T-016 publicar `packages/ui`. O arquivo de proxy tem esse nome porque o Next 16 ignora `middleware.ts` em silêncio.
- Esforço: medio

## T-020 — Manifesto de rotas e cobertura de telas [pendente]

- Refs: US-004, AC-016
- Arquivos: apps/web/src/lib/routes.ts, e2e/playwright.config.ts, e2e/specs/rotas-manifesto.spec.ts, e2e/specs/manifesto-cobre-arquivos.spec.ts, e2e/specs/a11y.spec.ts, e2e/fixtures/auth.setup.ts
- Notas: o manifesto espelha design/mapa-de-telas.md. Uma tela nova sem entrada no manifesto reprova, e é isso que torna "todas as telas" verificável. Acessibilidade em cada rota, marcado com @principle:P-012 e @principle:P-011.
- Esforço: alto
