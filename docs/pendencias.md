# Pendências

Dívidas conhecidas e o que retomar. Uma linha sai daqui quando deixa de valer.

## Para retomar (27/08/2026)

### Onde paramos

**Portão limpo em 27/08**: 16 etapas declaradas, 16 executadas, 16 aprovadas,
0 reprovadas. **Ponta a ponta limpo também**: 42 cenários, nos dois tamanhos de
tela. Último trabalho: **27/08**, a T-406 (encontrabilidade e compartilhamento).

**50 de 133 tarefas concluídas.** 270 critérios de aceite declarados, 109
provados (40,4%).

| Feature              | Feito | Situação                                    |
| -------------------- | ----- | ------------------------------------------- |
| `fundacao`           | 22/22 | **fechada**                                 |
| `pedido-checkout`    | 16/16 | **fechada**                                 |
| `vitrine-publica`    | 7/10  | falta T-407, T-408 e T-409                  |
| `landing-plataforma` | 4/5   | falta só a T-963 (ponta a ponta)            |
| `config-loja`        | 1/9   | só a T-903 (horários), a reboque da vitrine |
| `identidade-acesso`  | 0/11  | não começou                                 |
| `catalogo-produtos`  | 0/14  | não começou                                 |
| `pedido-operacao`    | 0/12  | não começou                                 |
| `clientes-loja`      | 0/9   | não começou                                 |
| `dashboard-metricas` | 0/10  | não começou                                 |
| `admin-lojas`        | 0/10  | não começou                                 |
| `cardapio-na-tv`     | 0/5   | não começou                                 |

A contagem de critérios provados (109 de 270) parece baixa perto das tarefas
(50 de 133), e é assim de propósito: a fundação inteira sustenta critérios de
OUTRAS features, que só ficam provados quando a tela ou a rota daquela feature
existir. Número que sobe devagar no começo e rápido no fim é o formato normal
deste projeto — não é sinal de atraso.

**O caminho da compra está inteiro**, e agora é encontrável: vitrine → produto →
carrinho → conferência → fechamento → mensagem no WhatsApp, com dados
estruturados, endereço canônico, mapa do site por loja e prévia desenhada para
quem compartilha.

### As três lições dos dois últimos dias

**`STRICT` na função do índice (T-404).** `app.texto_de_busca` nasceu
`IMMUTABLE STRICT`, e `STRICT` devolve nulo quando qualquer argumento é nulo —
sem executar o corpo, onde o `coalesce` esperava. Descrição vazia é o caso
COMUM, então metade do catálogo entraria no índice como nulo e nunca seria
encontrada, **nem pelo próprio nome**. Apareceu porque o teste de integração
criou produto SEM descrição; o teste que passava era o que tinha uma.

**A regra sobre ramos não mora na tela (T-406).** O contrato ganhou
`alimentacao` para os dados estruturados escolherem entre `Restaurant` e
`Store`. A tela poderia decidir olhando o código do ramo ("começa com FOOD\_"),
e é isso que o campo evita: a regra passaria a morar em cada tela e em cada
aplicativo nativo, e um ramo novo nasceria classificado errado em todos ao mesmo
tempo. É a mesma lição do "loja de roupa não tem cardápio", cobrada de novo.

**Só o navegador pega o que o navegador quebra (T-406).** `sitemap.ts` do
framework não recebe `params` dentro de segmento dinâmico. O teste de unidade
passava — porque era ele quem chamava a função, com a assinatura que ele mesmo
inventou. A rota de verdade só falhou quando um navegador a pediu. E a execução
completa do ponta a ponta encontrou uma corrida no PRÓPRIO fixture, que deixava
a loja sem horário por uma janela e fazia cinco cenários caírem juntos.

### Próximo passo

Na vitrine, o que resta, em ordem de barato para caro:

- **T-408 — Acessibilidade por teclado** (AC-418): o axe já roda em vários
  testes de tela; falta a navegação por teclado provada.
- **T-409 — Ponta a ponta da vitrine**: o harness existe e está limpo. Leva
  junto a dívida 89 (a busca sem prova de navegador).
- **T-407 — Desempenho no celular** (AC-415, AC-416): é o dono do AC-415, que
  meia dúzia de tarefas cita e nenhuma provou. É a mais cara das três, e a que
  fecha a feature.

Fora da vitrine, a **dívida 84** (o portão não reprova arquivo faltante de
tarefa concluída) merece um turno só dela: foi ela que deixou a T-020 passar
`[concluida]` com zero arquivos entregues.

### A ordem que economiza tempo

Formatar ANTES de gravar a prova, e gravar a prova ANTES do portão. O Prettier
reescreve arquivo de teste, e arquivo de teste reescrito envelhece a prova de
TODAS as features de uma vez — o portão então reprova na auditoria e o ciclo
recomeça. `pnpm prettier --write .` → `bash infra/scripts/provar.sh` →
`bash infra/scripts/verificar.sh`.

### Como subir o ambiente

```bash
bash infra/scripts/setup.sh   # cria infra/compose/.env.compose e o certificado
bash infra/scripts/up.sh      # sobe banco, cache, roteador, api e web
bash infra/scripts/verificar.sh  # o portão completo
```

## Dívidas abertas

0. ~~**Cinco testes falham depois das migrações de catálogo e pedidos
   (18/08).**~~ **Resolvido:** o portão de 25/08 passou nas 16 etapas, incluindo
   `seed.test.ts`, `pre-deploy.int.test.ts` e os testes de integração da API.
   As cinco divergências foram fechadas ao longo das tarefas seguintes, cada uma
   no commit da tarefa que mexeu no esquema — que é o comportamento que os
   testes de cobertura existem para forçar. A anotação original fica abaixo,
   porque ela descreve o mecanismo, e o mecanismo continua valendo para a
   próxima migração.

   As 20 tabelas novas fizeram testes de cobertura reprovarem — e reprovarem
   certo: eles cobram que tabela existente esteja coberta. Vinte divergências
   foram corrigidas; estas cinco continuavam:

   - `seed.test.ts` — dois testes de determinismo (AC-037). O cenário compara
     dois bancos coluna a coluna e ainda encontra uma diferença de relógio: há
     coluna `updated_at` nas tabelas novas que o cenário não informa e o banco
     preenche com `now()`. O caminho é achar a última e informá-la; o padrão já
     está estabelecido nas que foram corrigidas.
   - `pre-deploy.int.test.ts` — publicação com migração que falha no meio.
   - Dois testes de integração da API que dependem do cenário completo.

   Nada disso é regressão do produto: são os testes de cobertura pedindo que o
   dado de exemplo acompanhe o esquema. O portão está barrando o envio, que é
   exatamente o comportamento correto — o código está commitado em local e não
   subiu.

1. ~~`infra/compose/.env.compose` não existe na raiz.~~ **Resolvido em
   17/08:** `setup.sh` gerou o arquivo, as senhas foram criadas com
   `openssl rand` e o banco de teste ficou na porta 5533 — a 5433 é do projeto
   `preco-menu-web` desta mesma máquina, e o choque derrubava a subida.

2. **`.env` da raiz foi montado à mão.** As senhas dos três papéis de banco
   foram escritas por mim, sincronizadas com o `.env.compose`. O `setup.sh`
   deveria gerar os dois de uma vez — entra na T-017, quando o portão for
   consolidado.

3. **`check-ambientes.sh` não está ligado ao portão.** Ele existe e é testado,
   mas sem `.env` configurado sairia com código 2 e reprovaria todo mundo.
   Ligar quando o `setup.sh` passar a criar o `.env`.

4. **Os dois projetos disputam a memória do Docker.** O ambiente do SimpleClick
   sobe 7 contêineres, e com o `preco-menu-web` no ar isso encheu os 8 GB
   disponíveis — os contêineres do outro projeto foram encerrados por pressão de
   memória em 17/08. Nenhum dado foi perdido (os bancos desligaram limpos e os
   volumes estão intactos), mas convém subir um projeto de cada vez, ou aumentar
   a memória do Docker Desktop.

5. ~~`vitest.config.ts` da raiz é declarado pela T-007.~~ **Resolvido em
   18/08:** os quatro projetos (`unit`, `web`, `api-int`, `db-rls`) foram
   acrescentados ao arquivo existente. A opção de JSX foi preservada e virou a
   constante `conversaoDeJsx`, repetida em cada projeto — projeto do Vitest não
   herda a configuração de transformação da raiz, então apagá-la de um projeto
   deixaria os componentes daquele projeto ilegíveis. Duas consequências novas:
   - a fronteira entre unidade e integração é o banco. Teste que precisa de
     PostgreSQL mora em `apps/api/tests/`, em `*.int.test.ts`, ou nos pacotes
     `database` e `testing`. **A T-006 precisa disso:** o arquivo declarado nas
     tarefas como `apps/api/src/core/db.test.ts` fala com o banco, então deve
     nascer como `apps/api/src/core/db.int.test.ts` para entrar em `api-int` e
     receber banco próprio;
   - o projeto `api-int` ainda não casa com nenhum arquivo. O Vitest aceita
     projeto vazio enquanto houver teste em algum outro; some quando a T-006 e
     a T-010 entrarem.

6. **`.spec/verification/sinais.json` gera atrito em todo merge.** É derivado,
   regenerado a cada auditoria, e conflita sempre. Resolver aceitando qualquer
   lado e regenerando. Se incomodar de novo, avaliar deixá-lo fora do
   versionamento — o custo é perder o lastro histórico das lições.

7. **Traefik aparece como não saudável** embora roteie corretamente. A
   verificação de saúde dele precisa de ajuste; não impede o uso.

8. **Molde de teste antigo não é varrido.** O banco de molde
   (`sc_molde_<impressão digital das migrações>`) sobrevive de propósito entre
   execuções — é dele que vem a velocidade. Quando uma migração muda, nasce um
   molde novo e o antigo fica no servidor de teste ocupando espaço. A varredura
   automática só apaga banco de teste (`sc_teste_%`) abandonado, porque apagar
   molde poderia atropelar outra árvore de trabalho rodando ao mesmo tempo na
   mesma máquina. Para limpar à mão:
   `DROP DATABASE <molde antigo> WITH (FORCE)` no servidor da porta 5533.

9. **O servidor de teste é compartilhado entre árvores de trabalho.** Várias
   worktrees desta máquina falam com o mesmo `postgres-test`. O arranjo do banco
   efêmero aguenta — nome de banco por processo, trava entre processos na
   construção do molde, que fica no banco administrativo e portanto vale para o
   agrupamento inteiro. Duas coisas a saber:
   - quem for investigar sobra no servidor precisa lembrar que nem tudo que está
     lá é desta árvore de trabalho;
   - o `beforeAll` de `packages/database/src/migrate.test.ts` aplica as migrações
     **sem** essa trava, e migração cria papel, que é objeto do agrupamento. Duas
     árvores aplicando migração ao mesmo tempo podem colidir no `CREATE ROLE`.
     Aconteceu uma vez em 18/08, num arranque frio, e não reproduziu em quatro
     tentativas seguidas. A correção é a mesma trava do molde dentro do
     aplicador; fica para quando incomodar de novo, porque mexe em código da
     T-004.
10. **`DATABASE_URL` do `.env` ainda usa a credencial de arranque, e não a da
    aplicação.** As duas variáveis (`DATABASE_URL` e `DATABASE_URL_DIRETA`)
    estão idênticas e apontam para o superusuário `simpleclick` — que contorna
    o isolamento por linha. `apps/api/src/core/db.ts` recusa abrir caminho
    nessas condições (`ErroDeConexaoDoBanco` e `ErroDeCredencialPrivilegiada`),
    então nada passa em silêncio, mas a API não sobe contra o banco de
    desenvolvimento até o `.env` ser corrigido para
    `postgresql://sc_app:<SENHA_BANCO_APLICACAO>@localhost:5432/simpleclick_dev`.
    Os testes de isolamento não dependem disso: eles derivam a credencial
    `sc_app` sozinhos, a partir de `DATABASE_URL_TEST`. Entra na T-017, junto
    com a dívida 2, quando o `setup.sh` passar a gerar o `.env`.

11. **O cliente tipado do Prisma não é versionado.** `packages/database/gerado/`
    nasce de `prisma generate` e é regenerado no `prepare` (todo `pnpm install`)
    e no início de `infra/scripts/verificar.sh`. Quem apagar a pasta no meio de
    uma sessão precisa rodar `pnpm db:gerar` antes dos testes.

12. **A API em `dist/` depende de o Node apagar tipos do pacote de banco.**
    `@simpleclick/database` publica TypeScript pelos `exports`
    (`./src/migrate.ts` e `./gerado/cliente/client.ts`). Isso funciona hoje —
    `pnpm build` compila e `import('dist/core/db.js')` carrega — porque o link
    do pnpm resolve para o caminho real, fora de `node_modules`, e o Node só
    recusa apagar tipos DENTRO de `node_modules`. Fica registrado porque a
    dependência é sutil: uma imagem de produção que copie os pacotes para
    dentro de `node_modules` em vez de linká-los quebra sem aviso. Confirmar na
    T-018, quando a publicação for montada.

13. **Prisma 7 tirou as cadeias de conexão do `schema.prisma`.** A decisão de
    17/08 previa `url` e `directUrl` no esquema declarado; o Prisma 7 recusa as
    duas propriedades e passa a conexão pelo adaptador de driver. O arranjo não
    mudou — as duas cadeias continuam distintas —, mudou onde ele é escrito:
    a da aplicação em `apps/api/src/core/db.ts` e a de migração no aplicador de
    migrações. Vale registrar na próxima revisão de decisões.

14. **`criarCategoria` não existe porque `app.categories` ainda não existe.**
    A T-009 pedia construtor para categoria junto com loja, identidade, membro,
    produto e cliente. Os cinco existem; categoria não, porque a tabela é
    declarada como pendente no cabeçalho da migração `0004_catalogo.sql` e
    pertence à feature `catalogo-produtos`. Criar a tabela aqui significaria
    escrever migração, políticas de isolamento e índices fora do escopo desta
    tarefa — e, com as tarefas rodando em árvores de trabalho paralelas, uma
    migração nova nesta acabaria colidindo com a T-008 e com a fatia de
    catálogo. Quando `app.categories` nascer, o construtor é um bloco novo em
    `packages/testing/src/factories.ts`, no mesmo molde de `criarProduto`
    (escrita pela credencial da aplicação, dentro do contexto da loja), mais a
    exportação em `src/index.ts`.

15. **`packages/testing` repete o arranjo de contexto por transação de
    `apps/api/src/core/db.ts`.** As duas escrevem os quatro parâmetros com
    `set_config(..., is_local => true)` dentro de uma transação. A repetição é
    deliberada: a tabela de fronteiras não autoriza `packages/testing` a
    importar aplicação, e o apoio de teste também serve aos testes de
    `packages/database`, que existem antes de a API existir. O risco é as duas
    divergirem em silêncio — se um dia o arranjo mudar em `core/db.ts`, o
    espelho em `factories.ts` precisa mudar junto. O ponto de correção
    definitivo seria a regra subir para `packages/database`, que as duas
    camadas podem importar; fica para quando a divergência incomodar.
16. **A carga de exemplo (T-008) declara 17 tabelas que ainda não existem.** O
    cenário descreve o catálogo e os pedidos inteiros — categorias,
    especificações por categoria, imagens, variações com estoque, preços
    nomeados, grupos de opção e pedidos em todos os status —, mas as migrações
    atuais só criam `identities`, `platform_admins`, `stores`, `store_settings`,
    `store_domains`, `store_members`, `products`, `store_customers` e
    `audit_log`. As 17 tabelas restantes (`assets`, `categories`,
    `attribute_definitions`, `product_categories`, `product_attributes`,
    `product_images`, `option_groups`, `option_items`, `product_option_groups`,
    `product_variants`, `variant_option_values`, `product_prices`, `orders`,
    `order_contacts`, `order_items`, `order_item_options` e
    `order_status_history`) aparecem **adiadas e nomeadas** no relatório da
    carga. Três consequências:
    - a carga NÃO precisa ser reescrita quando cada migração entrar: ela planta
      sozinha o que passar a existir;
    - o teste `@spec:AC-036 planta no banco tudo que o esquema já suporta`
      consulta o catálogo do PostgreSQL e **exige** que tabela existente tenha
      sido plantada. No dia em que a migração de `orders` entrar, esse teste
      passa a cobrar os pedidos e falha se eles não entrarem — é o que impede a
      carga de envelhecer em silêncio;
    - as colunas dessas 17 tabelas foram tiradas de
      `.spec/design/modelo-de-dados.md` (com o adendo de 17/08, que põe
      `category_id` em `attribute_definitions`). Se a migração nascer com forma
      diferente, a carga recusa com `ErroDeColunaDesconhecida`, nomeando tabela
      e colunas. **Quem criar cada tabela deve conferir o conjunto em
      `packages/database/seed/`.** Enquanto isso, AC-036 está provado no banco
      para o que o esquema suporta e no cenário para o que ainda não existe.

17. **`stores.updated_at` é a única coluna que difere entre duas cargas.**
    `bump_catalog_version` atualiza a linha da loja a cada produto plantado, e o
    gatilho `stores_touch` grava `now()` — que é o relógio do servidor, não um
    dado do cenário. A carga não tem como escrevê-lo: a credencial de
    administração não é dona da tabela e não desliga gatilho, e desligá-lo seria
    mudar o comportamento do sistema para fazer um teste passar. A prova de
    AC-037 trata isso sem afrouxar: um teste compara os dois bancos **sem** essa
    coluna, e outro exige que ela seja a **única** diferença, em qualquer tabela
    e qualquer coluna. Se um `now()` aparecer em outro lugar, o segundo teste
    reprova.

18. **A carga de exemplo não recarrega: ela recusa banco que já tem dados.**
    `audit_log` não aceita alteração nem remoção (gatilho `deny_mutation`, que
    vale inclusive para a credencial de migração), então não existe "apagar e
    plantar de novo" que devolva o banco ao estado inicial — e plantar por cima
    produziria um banco diferente de qualquer outra carga, quebrando o
    determinismo. `pnpm --filter @simpleclick/database seed` rodado duas vezes
    no mesmo banco sai com código 1 e explica que é preciso recriar o banco.
    Se um dia isso incomodar, o caminho é um comando de recriação do banco de
    desenvolvimento, e não um "recarregar" que mente.

19. **`pnpm typecheck` já reprovava em `packages/database/src/guards.ts` antes
    da T-008.** Duas chamadas passam o módulo `pg` para o parâmetro `ModuloPg`,
    e as assinaturas divergem porque `@types/pg` está em 8.21 na raiz e em 8.15
    em `packages/testing` — `Client.connect()` devolve `Promise<Client>` numa
    versão e `Promise<void>` na outra. Não é regressão desta tarefa (reproduz
    com o `tsconfig.json` anterior) e não reprova o portão, porque
    `infra/scripts/verificar.sh` ainda não tem etapa de tipos. Alinhar a versão
    de `@types/pg` no catálogo do workspace resolve; entra na T-017, com as
    dívidas 2 e 10.
20. **A varredura de isolamento cobre o papel `OWNER`, e só ele.**
    `apps/api/tests/isolamento-varredura.test.ts` prova as quatro operações com
    a requisição no papel de dono, que é o eixo de isolamento por loja. O
    segundo eixo — o do comprador, que enxerga a própria linha em qualquer loja
    (`sc_self_select` em `store_customers`) — não é exercitado pela varredura, e
    é justamente onde a modelagem registra o porteiro de papel como obrigatório.
    Quando a feature `identidade-acesso` entrar, vale estender a varredura com
    uma segunda passada no papel `CUSTOMER`, provando que ele NÃO enxerga a
    linha de outra pessoa na mesma loja.

21. **A varredura mira a linha por chave de UMA coluna.** O construtor de cada
    tabela declara `chave: "id"` (ou `store_id`), e as tentativas de alteração e
    remoção montam `WHERE <chave>::text = $1`. Nenhuma tabela de hoje tem chave
    primária composta; a primeira que tiver vai precisar que o construtor passe
    a aceitar mais de uma coluna. Não é armadilha silenciosa: sem construtor a
    varredura reprova, e com construtor incompleto o teste quebra na hora.

22. **`packages/database` não passa na verificação de tipos, e isso já vinha de
    antes.** `pnpm typecheck` reprova em `packages/database/src/guards.ts:320`
    com incompatibilidade entre o módulo `pg` real e o tipo `ModuloPg` declarado
    ali (`connect()` devolve `Promise<Client>`, não `Promise<void>`). Foi
    conferido na árvore principal, sem nenhuma alteração desta tarefa: o defeito
    é anterior. Passa despercebido porque `infra/scripts/verificar.sh` não roda
    a verificação de tipos — só formatação, qualidade de código, testes,
    auditoria e guardas. Duas coisas para a T-017, quando o portão for
    consolidado: corrigir a assinatura em `guards.ts` e ACRESCENTAR
    `pnpm typecheck` ao portão, senão o próximo erro de tipo também vai passar.

23. **`@types/pg` estava em duas versões no monorepo.** `packages/testing`
    declarava `8.15.6` enquanto `packages/database` e `apps/api` já usavam
    `8.21.0`, e a divergência fazia o MESMO `pg.Client` ser dois tipos
    incompatíveis — o cliente devolvido por `conectarNoBancoDoArquivo()` não
    servia numa variável tipada pelo `pg` da API. Alinhado em 18/08 para
    `8.21.0` nos três. Se alguém acrescentar um pacote novo que fale com o
    banco, alinhe também — ou o catálogo do `pnpm-workspace.yaml` passa a ser o
    lugar certo para essa versão.

24. **`apps/api/tsconfig.json` deixou de declarar `rootDir`.** Ele foi para
    `tsconfig.build.json`, que é quem gera `dist/`. O motivo: `rootDir: "src"`
    barrava `apps/api/tests/`, e teste que a verificação de tipos não olha é
    teste que compila errado sem ninguém saber. A geração continua idêntica
    (`pnpm --filter @simpleclick/api run build` confere), e `tests/` entrou na
    lista de exclusão da geração — teste em imagem de produção só carrega peso.

25. **A T-011 mexeu em quatro arquivos que não são dela, e cada um por um
    motivo.** Fica registrado para o merge não virar caça ao culpado:
    - `apps/web/src/app/page.tsx` (T-019): a página passou a perguntar à API se
      ela está viva e a ler a resposta pelo contrato. Antes ela afirmava
      "ambiente no ar" sem ter conferido nada. **`apps/api/src/app.ts` NÃO foi
      tocado** — a conformidade da API com o contrato é provada de fora, em
      `apps/api/src/contracts/conformidade.test.ts`, justamente para não
      disputar esse arquivo com as tarefas vizinhas;
    - `apps/web/tsconfig.json` (T-019): ganhou `allowImportingTsExtensions`. O
      pacote de contrato é consumido pelo código-fonte e também é lido pela
      API, que roda em Node e exige a extensão no import. Sem a opção, a
      verificação de tipos do site reprovaria os arquivos internos do contrato;
    - `packages/config-eslint/fronteiras.js` (T-001): nasceu a camada
      `api-contracts` (`apps/api/src/contracts/**`), autorizada a importar
      `pkg-contracts` e mais nada. Sem a camada, a pasta ficava fora do alcance
      da regra, como `app.ts` e `main.ts` ainda estão. A linha correspondente
      entrou na tabela de fronteiras de `.spec/design/arquitetura.md`;
    - `infra/scripts/verificar.sh` (T-005/T-007): mais uma etapa, logo depois da
      verificação de tipos.

26. **O contrato declara uma rota só, e é de propósito.** `GET /` é o que a API
    serve hoje; `/v1/health/live` e `/ready` (AC-023) pertencem à T-012 e não
    foram inventados aqui — documento que promete rota inexistente faz o
    aplicativo nativo nascer chamando o vazio. Quando a T-012 entrar, o caminho
    é: declarar as rotas em `packages/contracts/src/saude.ts`, somá-las a
    `ROTAS_DO_CONTRATO` e regravar com
    `pnpm --filter @simpleclick/api run contrato:escrever`. O teste
    `@spec:AC-006 declara só as rotas que a API serve hoje` vai reprovar até a
    lista ser atualizada — é ele que impede o catálogo de envelhecer calado.

27. **A prova de AC-006 monta uma árvore de mentira dentro de
    `packages/contracts/.provas-de-tipo/`.** Ela copia os esquemas de verdade e
    o consumidor de verdade (`apps/web/src/lib/api-contrato.ts`), renomeia um
    campo na cópia e chama o `tsc` do repositório. Mora ali porque é de
    `packages/contracts/node_modules` que o `zod` é resolvido pela subida de
    diretórios. A pasta nasce e morre no próprio teste, e está ignorada no Git,
    no formatador e na verificação de qualidade — se ela sobrar, o teste morreu
    no meio. A prova é ancorada na linha `status: z.literal("viva")`: quem
    renomear esse campo recebe uma falha que explica o que ajustar, e **não**
    um teste que passa por engano.

28. **`NEXT_PUBLIC_API_URL` entrou no `.env.example` e não é validada na
    partida.** Ela é do site, não da API, então não entra no esquema de
    `apps/api/src/core/env.ts`. Sem ela, `apps/web/src/server/api-client.ts`
    usa `https://api.simpleclick.localhost`, que é o nome que o roteador local
    serve com TLS. Quando a T-017 consolidar o portão, vale decidir se o site
    também passa a recusar subir sem ambiente declarado.
29. **A T-012 tocou `apps/api/src/app.ts` em quatro linhas, e só nelas.** Foram
    acrescentados três `import` e três `app.use`: `middlewareDeRegistro()` como
    PRIMEIRO middleware (ele abre o contexto da requisição, e tudo depois
    depende do identificador já existir), `criarRotasDeSaude()` montado em
    `PREFIXO_DE_SAUDE` (`/v1/health`) antes das rotas de negócio, e
    `manipuladorDeErros()` como ÚLTIMO, depois do 404 — o Express só entrega a
    falha a um middleware de quatro parâmetros que venha depois de tudo que pode
    falhar. A assinatura de `criarApp()` NÃO mudou, de propósito, para o merge
    com as outras tarefas do grupo E não virar batalha. Quem for resolver
    conflito nesse arquivo: a ordem dos três é o que importa, o resto é livre.

30. **A T-012 também mexeu em `apps/api/src/core/db.ts`, em quatro linhas.**
    `garantirCredencial` guardava a promessa da conferência de credencial mesmo
    quando ela FALHAVA. Com o banco fora do ar, a primeira tentativa gravava uma
    promessa recusada e a API nunca mais tentava de novo — a verificação de
    PRONTO continuaria dizendo "não" depois de o banco voltar, o oposto do que
    AC-023 pede. Agora a falha limpa o cache e a próxima transação tenta outra
    vez. Nenhum outro comportamento de `db.ts` mudou.

31. **Mensagem de erro de biblioteca não vai para o registro, e isso é uma
    escolha com custo.** `core/log.ts` grava a mensagem apenas de erro que
    carrega a marca `mensagemEscritaPorNos` (hoje, `ErroDeDominio`). De erro de
    terceiro — Prisma, `pg`, `TypeError` de biblioteca — vão o nome da classe, o
    código quando existe e os quadros da pilha, nunca a mensagem. O motivo é
    AC-022: mensagem de banco vem com o VALOR que causou a falha colado nela
    (`invalid input syntax for type uuid: "..."`), e esse valor costuma ser
    justamente o dado pessoal. O custo é real — perde-se o texto que explicaria
    a falha de imediato. Duas saídas quando incomodar: marcar também os erros
    nomeados de `core/db.ts` (`ErroDeRecursoNaoEncontrado` e companhia), cujas
    mensagens são escritas à mão; ou embrulhar o erro de terceiro num
    `ErroDeDominio` com `detalhe` estruturado no ponto onde ele nasce.

32. **A verificação do cache fala o protocolo do Redis à mão, sem cliente.**
    `apps/api/src/modules/health/health.cache.ts` abre um soquete, manda `AUTH`
    (quando a cadeia traz credencial) e `PING`, e reconhece `+PONG`. São ~40
    linhas e nenhuma dependência nova (P-014) — e a conexão nova a cada
    verificação é o que faz a resposta ser honesta, coisa que um cliente com
    agrupamento não entrega. **Quando a T-015 criar `core/cache.ts` com um
    cliente de verdade, esta função deve dar lugar a ele**, senão passam a
    existir dois caminhos até o Redis.

33. **`pino` entrou como dependência de `apps/api`.** É a única biblioteca nova
    da T-012. Justificativa (P-014): saída em JSON por linha sem custo de
    formatação, `mixin` por linha — que é o gancho onde o identificador da
    requisição entra sem nenhuma chamada precisar passá-lo — e `formatters.log`,
    onde a lista de permissão fica num ponto só, por onde TODO caminho de
    registro passa. Escrever isso à mão custaria mais do que manter a
    dependência. **Risco de merge:** as outras tarefas do grupo E também alteram
    `apps/api/package.json` e o `pnpm-lock.yaml`; aceitar os dois lados e rodar
    `pnpm install` resolve.

34. **`main.test.ts` mudou porque a linha de partida mudou de formato.** Ela
    saía como texto (`ouvindo na porta N`) e agora sai pelo registro
    estruturado, como uma linha de JSON com `msg: "api.iniciou"` e o campo
    `porta`. O teste ficou mais forte, não mais fraco: além de esperar a linha,
    ele a converte de volta em objeto e confere a porta. `app.test.ts` ganhou
    um desvio do registrador para um destino que não escreve nada — sem ele, o
    portão passaria a imprimir duas linhas de JSON por requisição de teste.
35. **Nenhum provedor de e-mail foi escolhido, e por isso não existe adaptador
    de envio de verdade.** A T-014 entregou a PORTA (`EnviadorDeEmail`, em
    `apps/api/src/jobs/email.job.ts`) e um adaptador de partida
    (`enviadorNaoConfigurado`) que **falha alto**: o trabalho esgota as
    tentativas e fica em estado falho, inspecionável, com uma mensagem que diz
    o que falta configurar. Fingir que enviou seria pior — produziria um
    sistema que parece funcionar e perde todo e-mail. Para resolver: escolher o
    provedor, registrar a decisão em `.spec/design/decisoes.md`, acrescentar as
    variáveis a `.env.example` e implementar a porta contra ele, com credencial
    vinda do ambiente (P-002). Enquanto isso, AC-025 e AC-026 estão provados
    contra o Redis real com um duplo no lugar do serviço externo.

36. **`montarSegundoPlano` ainda não é chamado por `main.ts`.** A T-014 NÃO
    tocou em `apps/api/src/app.ts` nem em `apps/api/src/main.ts`, de propósito:
    várias tarefas deste grupo disputam esses dois arquivos e um conflito ali
    custa mais do que a espera. O ponto de composição existe, está provado e é
    uma chamada só — `montarSegundoPlano({ urlDoRedis, enviadorDeEmail })` na
    partida, e `fechar()` no desligamento. Quem consolidar a partida (T-012, do
    registro estruturado, ou T-017, do portão) faz a ligação e passa `aoFalhar`
    apontando para o registro do servidor. Enquanto não for ligado, nenhuma
    fila sobe em produção — o que é seguro, porque também não existe rota que
    enfileire nada ainda.

37. **`REDIS_URL_TEST` não é validada por `core/env.ts`.** A validação de
    partida conhece `REDIS_URL`, e só ela; a variável de teste é lida direto
    por `apps/api/tests/apoio-de-fila.ts`, que recusa a ausência com mensagem
    dizendo o que fazer, e recusa também que ela aponte para o MESMO Redis de
    `REDIS_URL`. É o mesmo arranjo que `DATABASE_URL_TEST` tem em
    `packages/testing`. Se um dia a API passar a precisar dela na partida, o
    lugar de acrescentar é a forma declarada em `core/env.ts`.

38. **O Redis do ambiente sobe com `maxmemory-policy allkeys-lru`, e a BullMQ
    avisa disso a cada partida de fila.** O aviso ("Eviction policy is
    allkeys-lru. It should be noeviction") aparece na saída dos testes e é
    correto: sob pressão de memória o Redis pode descartar chave de fila junto
    com chave de cache. A configuração fica como está porque este mesmo Redis é
    o cache do projeto, e porque a consequência já foi aceita — e-mail perdido
    custa um reenvio. É exatamente essa aceitação que torna a fila de impressão
    inadequada ao Redis, e ela está registrada em `MOTOR_DAS_FILAS`
    (`apps/api/src/jobs/index.ts`), com teste que quebra se alguém mudar. Se um
    dia o cache e a fila forem separados em dois servidores, o da fila deve
    subir com `noeviction`.

39. **A BullMQ 6 traz um motor PostgreSQL embutido, e ele NÃO foi adotado.**
    `createPostgresBackend` permitiria a fila de impressão com a mesma API
    desta tarefa. Não foi usado aqui por dois motivos concretos: ele cria e
    migra o próprio esquema, o que colide com a regra de migrações escritas à
    mão (decisão de 17/08, regra 5), e as tabelas que ele cria não têm
    isolamento por linha — as guardas estruturais G1..G9 reprovariam. Fica
    registrado como caminho a avaliar quando a fatia de impressão (F6) chegar:
    ou se resolve o esquema dele sob as guardas, ou se escreve a fila de
    impressão à mão, como a decisão previa.

40. **`vitest.config.ts` ganhou um quinto projeto, `filas`, e o portão ganhou
    uma etapa.** Os testes que falam com Redis moram em
    `apps/api/src/jobs/*.int.test.ts` e ficaram FORA de `api-int` — sem isso,
    cada arquivo deles pagaria a criação de um banco descartável que nenhum
    teste seu abriria, e entraria na serialização que existe por causa das
    migrações. `infra/scripts/verificar.sh` roda a etapa "testes de fila
    (Redis)" separada da de banco, para a primeira linha vermelha já dizer qual
    serviço está envolvido. Quem consolidar o portão na T-017 herda as duas
    mudanças.
41. **A T-015 (cache) tocou quatro arquivos que não são dela, e o merge precisa
    saber quais.** `apps/api/src/app.ts` NÃO foi tocado. Foram tocados:
    - `vitest.config.ts` — nasceu o quinto projeto, `cache-int`, e os projetos
      `unit`, `web` e `api-int` passaram a excluir `**/*.redis.test.ts`. O
      motivo de não reaproveitar `api-int`: aquele projeto cria um banco
      descartável por arquivo, e cobrar um PostgreSQL de pé para provar o cache
      faria o teste do cache falhar por um motivo que não é dele;
    - `infra/scripts/verificar.sh` — uma etapa nova, "testes do cache (Redis de
      teste)", logo depois da etapa de integração;
    - `.env.example` e `.env` — duas variáveis novas, `URL_DO_SITE` e
      `SEGREDO_DE_REVALIDACAO`;
    - `.spec/features/fundacao/tasks.md` — a T-015 virou concluída.

42. **`URL_DO_SITE` e `SEGREDO_DE_REVALIDACAO` ainda não passam por
    `core/env.ts`.** Elas são lidas por `lerConfiguracaoDoAviso` em
    `apps/api/src/core/cache.ts`, que recusa configuração pela metade e segredo
    com menos de 32 caracteres — então não há segredo em código (P-002) nem
    variável aceita sem conferência. O que falta é a recusa acontecer na
    PARTIDA, como AC-002 pede, e não na primeira invalidação. Não subiram para
    `core/env.ts` agora por dois motivos: acrescentá-las ao esquema declarado
    obriga a mudar a lista exata que `env.test.ts` afirma
    (`descreve todas as variáveis previstas`), e esse arquivo é da T-003 —
    com várias tarefas em árvores paralelas, seria conflito garantido; e as
    duas são opcionais por desenho (sem elas, a alteração do catálogo ainda
    aparece quando o prazo de validade vence). **Entra na T-017**, junto com as
    dívidas 2 e 10: mover para `forma`, acrescentar as duas ao ambiente de
    exemplo do teste e à lista de `VARIAVEIS`.

43. **Ninguém chama o aviso de invalidação ainda.**
    `criarAvisoDoSite` e `cache().invalidarLoja` existem e estão provados, mas
    não há caso de uso de catálogo para acioná-los — o módulo `catalog` nasce
    na F1/F3. O ponto de ligação é o caso de uso que altera produto, categoria
    ou configuração da loja: ele deve, na mesma ordem, invalidar o cache da
    API (`invalidarLoja`) e avisar o site (`avisar({ lojaId, nomes })`). O
    aviso é best-effort de propósito: `"indisponivel"` não pode derrubar a
    alteração do catálogo, porque o prazo de validade assume.

44. **A regra da chave está escrita duas vezes.** `apps/api/src/core/cache.ts` e
    `apps/web/src/server/cache.ts` repetem a mesma expressão regular de parte de
    chave e o mesmo separador. A tabela de fronteiras não deixa o site importar
    a API, e `packages/core` ainda não existe — quando existir, o lugar da regra
    é lá, e os dois passam a importá-la. Enquanto isso, o que amarra as pontas é
    cada lado ter teste exigindo exatamente o mesmo formato de chave
    (`<loja>:<nome>[:<parte>]`) e a mesma recusa de separador dentro das partes.
    É a mesma natureza da dívida 15, e some pelo mesmo caminho.

45. **O cache do site depende de `unstable_cache`, que o Next chama de
    instável.** É a única API do Next 16 que guarda leitura de servidor por
    chave com etiquetas sem exigir a configuração de componentes em cache. O
    envelope `lembrarNoSite` existe justamente para que a troca seja um arquivo:
    quem chama passa loja, nome e função de leitura, e nunca vê o motor. Se o
    Next promover `"use cache"` com `cacheTag` a caminho padrão, muda
    `motorDoNext` e mais nada. `revalidateTag` é chamado com o perfil `"max"`
    porque a forma de um argumento só está descontinuada, e `updateTag` só vale
    dentro de ação de servidor — a rota de invalidação não é uma.
46. **A T-013 tocou `apps/api/src/app.ts`, e só nas três linhas da lista de
    origens.** `criarApp()` passou a aceitar `OpcoesDoApp` (hoje só `origens`) e
    monta `corsDeOrigensFechadas` ANTES de `express.json()` — a ordem é
    deliberada: requisição de origem estranha é recusada sem a API gastar
    trabalho lendo o corpo dela. Nada mais no arquivo mudou. Quem estiver
    resolvendo conflito nesse arquivo pode ficar com os dois lados: a alteração
    é aditiva.

47. **A borda de validação (`core/validar.ts`) ainda precisa se juntar ao
    auxiliar de rota da T-011.** As duas nascem para o mesmo ponto do desenho: a
    T-011 declara a rota e gera o documento de contrato a partir do esquema; a
    T-013 aplica esse esquema na requisição. `validar()` já expõe `esquemas`
    justamente para o gerador de contrato lê-los sem precisar de outra fonte.
    Quando a T-011 entrar, o encontro é `declararRota(...)` chamando `validar()`
    por dentro — nenhum dos dois arquivos precisa ser reescrito, mas alguém
    precisa fazer a costura, e ela não está feita.

48. **O aviso de bloqueio de AC-119 sai por gancho, e ninguém o ouve ainda.** O
    limitador chama `aoBloquear` uma vez por bloqueio NOVO, com a conta, a
    espera e quantos bloqueios seguidos houve. Quem transforma isso em e-mail é
    a feature `identidade-acesso`, usando a fila da T-014 — o limite não pode
    depender de servidor de e-mail para barrar ninguém. Enquanto o ouvinte não
    existe, o aviso é emitido e descartado, e o teste prova o que a fundação
    pode provar: que ele é emitido uma vez por bloqueio, e não a cada requisição
    barrada.

49. **Quantas bordas confiáveis existem à frente da API é parâmetro, e ainda não
    é variável de ambiente.** `limitarTentativas` recebe `proxiesConfiaveis`,
    com padrão 1 — o roteador local de hoje. Quando entrar CDN na frente, o
    número muda, e mudar número em código para configurar ambiente é o começo de
    um erro caro: com o número errado para cima, quem chama passa a escolher o
    próprio balde; para baixo, todo mundo cai no balde do roteador. O lugar certo
    é uma variável validada em `core/env.ts` (AC-002), e mexer em `env.ts` agora
    colidiria com quem está na T-003. Entra junto com a montagem das rotas de
    entrada, na feature `identidade-acesso`.

50. **`main.ts` ainda não chama `carregarAmbiente`.** `criarApp()` lê
    `ORIGENS_PERMITIDAS` do ambiente e, se ela faltar, a lista fica VAZIA — o que
    fecha a porta (nenhuma origem autorizada a mudar estado) em vez de abri-la.
    É o padrão seguro, mas não substitui a recusa de partida que AC-002 exige:
    hoje a API subiria com a lista vazia e só o primeiro `POST` acusaria. Ligar
    `carregarAmbiente` na partida resolve, e é da T-003/T-017.

51. **Nasceu o quinto projeto do Vitest: `api-redis`.** Casa com
    `apps/api/src/**/*.redis.test.ts`, não carrega preparação de banco e entrou
    como etapa própria de `infra/scripts/verificar.sh` — sem essa linha, o
    projeto novo ficaria fora do portão em silêncio, que é o pior jeito de um
    teste sumir. O projeto `unit` passou a excluir o mesmo padrão. **Aviso de
    conflito:** a T-017 vai reescrever `verificar.sh`; ao resolver, mantenha a
    etapa do cache.

52. **`@redis/client` entrou como dependência de `apps/api`.** É o cliente do
    node-redis sem os módulos de busca, JSON, série temporal e filtro — que o
    pacote `redis` traria junto sem uso nenhum (P-014). O que ele resolve e a
    stack atual não resolve: o protocolo do Redis, a vida da conexão e a
    reconexão. O limitador só usa `EVAL`, por uma porta estreita
    (`CacheDoLimite`), então trocar o cliente é mexer em uma função.

53. **O limite de tentativas ainda não está montado em rota nenhuma.**
    `core/limite.ts` está pronto e provado, mas quem o instala em
    `POST /v1/auth/login` (e nas rotas de código de verificação e recuperação de
    senha) é a feature `identidade-acesso`. A prova de hoje monta a rota de
    entrada dentro do próprio teste, com senha e domínio de mentira — o que
    prova o limite, e não a autenticação.

54. **Um servidor por requisição no supertest deu flutuação de verdade.** Duas
    execuções em quinze reprovaram com 404 numa rota que existe, em testes que
    passavam sozinhos. A causa é o volume: provar um limite de tentativas exige
    estourá-lo, e `request(app)` abre um servidor efêmero NOVO por requisição —
    eram centenas de portas abertas e devolvidas em segundos, e uma conexão nova
    caindo numa porta recém-largada recebe a resposta do servidor errado.
    Corrigido em `cors.test.ts` e `limite.redis.test.ts` com um servidor por
    cenário, fechado no fim de cada teste (24 execuções seguidas limpas depois
    disso). **Vale para quem escrever teste de rota daqui em diante**, e
    `apps/api/src/app.test.ts` ainda usa o padrão antigo — não incomoda hoje
    porque faz quatro requisições.

- ~~**Instabilidade do portão sob carga (aberta desde 18/08/2026,
  T-017).**~~ **Fechada em 25/08**, com a última das três causas corrigida. A
  consolidação do portão exigiu rodá-lo repetidas vezes para provar que a
  mesma versão dá o mesmo resultado (AC-042), e a repetição revelou duas
  instabilidades que só aparecem com a suíte inteira rodando junto:

  1. **`cors.test.ts` recebia resposta do servidor errado** — 404 num caminho
     que existe. Causa: `app.listen(0)` sem endereço escuta em `::` com pilha
     dupla, e um servidor de outro processo de teste que pegue a mesma porta
     em `0.0.0.0` casa mais especificamente com o `127.0.0.1` que o supertest
     chama. **Corrigido**: `cors.test.ts` e `limite.redis.test.ts` agora
     escutam em `127.0.0.1`, como o resto da suíte já fazia. Dezessete
     execuções da suíte inteira depois da correção, nenhuma recaída.
  2. **`limite.redis.test.ts`, "a espera não passa do teto configurado",
     ainda falha em cerca de uma execução a cada quinze** — `esperaSegundos`
     volta `undefined` porque a requisição não foi barrada. Hipótese: o teste
     avança um relógio de mentira dentro da aplicação, mas o bloqueio vive
     como chave com prazo de validade num Redis de verdade; quando as 77
     requisições do cenário demoram mais que o prazo (a máquina sob carga, ou
     várias árvores de trabalho dividindo o mesmo Redis), a chave expira
     sozinha e o bloqueio some. **Não corrigido**: a correção mexe em como o
     limitador marca prazo em teste, que é decisão da T-013, não do portão.
     Enquanto isso, uma reprovação nesta etapa merece uma segunda execução
     antes de virar investigação.

     **Reincidiu duas vezes em 25/08, e a segunda foi capturada com a saída
     inteira do portão — o que mudou o diagnóstico.** Não é o teste anotado
     acima. É este:

     ```
     × @spec:AC-119 o dono da conta é avisado uma vez por bloqueio novo,
       e não a cada requisição barrada          30006ms
     Error: Test timed out in 30000ms.
     ```

     **É o mesmo defeito que a seção "RESOLVIDO — Teste intermitente do limite
     de tentativas" descreve, no teste VIZINHO.** Aquela correção deu espera
     própria (`ESPERA_DOS_PESADOS`, dois minutos) a DOIS testes do arquivo —
     "a espera não passa do teto configurado" e "com os dois estourados, a
     resposta é a da conta". Este terceiro faz 15 requisições HTTP de verdade,
     cada uma conversando várias vezes com o Redis, e ficou com a espera padrão
     de 30 segundos. Sozinho ele cabe; com a suíte inteira disputando o mesmo
     Redis, não cabe.

     **Corrigido em 25/08**, junto com a T-512: o `it` passou a receber
     `ESPERA_DOS_PESADOS` como último argumento, exatamente como os dois
     vizinhos. O que mudou entre a T-403 e agora foi a gravidade — a
     reprovação deixou de ser intermitente e virou consistente, porque a suíte
     cresceu com a vitrine e o carrinho e a carga passou do que os 30 segundos
     padrão aguentavam. De uma em quinze execuções para todas, o que travava o
     portão em qualquer tarefa seguinte.

     **RESOLVIDO DE VERDADE EM 26/08, e o diagnóstico anterior estava errado.**
     A espera longa do arquivo foi retirada: com ela, o caso do AC-119 passou a
     levar **120 segundos e ainda assim reprovar** — o que provou que ele não é
     lento, é **PARADO**. Nunca foi carga.

     A causa está no ARRANJO dos testes, e não neles: os dois arquivos do
     projeto `cache-int` rodavam em paralelo contra o mesmo Redis, e o par
     (relógio de mentira dentro da aplicação, prazo de validade de verdade no
     Redis) faz uma conexão esperar pela outra e nunca ser acordada. Com
     `fileParallelism: false` no projeto, os 23 testes passam em **2,1
     segundos** — o mesmo remédio que `api-int` já usava, por causa diferente.

     **A nota original do arquivo estava certa e eu a ignorei:** "subir o limite
     esconderia um teste genuinamente travado atrás de dois minutos de
     paciência". Foi exatamente o que a espera longa fez. Ela não corrigiu nada
     — atrasou o diagnóstico e deixou o portão duas vezes mais lento.

     **O padrão, agora completo:** dar mais tempo a um teste que reprova é
     tratá-lo como lento. Antes de fazer isso, vale conferir se ele é lento
     mesmo — um teste que estoura QUALQUER prazo que se dê a ele não é lento, e
     nenhuma quantidade de paciência vai consertá-lo.

     (o percurso até aqui, que vale como registro do erro)
     **A lição foi aprendida tarde, e o preço foi pago três vezes.** A correção
     de 19/08 tratou dois testes do arquivo; em 25/08 um terceiro reprovou com
     a mesma forma e recebeu a mesma linha; em **26/08 um quarto reprovou** —
     desta vez o do AC-120 —, e o portão parou de novo.

     Só então a correção foi para a CLASSE: `vi.setConfig({ testTimeout })` no
     arquivo inteiro, porque o que os quatro têm em comum não é coincidência —
     TODO teste ali faz dezenas de requisições HTTP de verdade contra um Redis
     compartilhado. O risco de esconder um teste travado continua existindo e
     continua limitado: vale para este arquivo, e não para os outros 40.

     **O padrão a reconhecer:** quando a mesma correção é aplicada pela segunda
     vez, o alvo certo já não é o caso — é a classe. Três diagnósticos idênticos
     foram três oportunidades de notar isso, e as três foram gastas.

     **A hipótese antiga (a chave de bloqueio expirando sozinha no Redis)
     segue sem evidência**, e o teste que ela acusava passou nas duas
     ocorrências. Ela pode estar errada.

     **O que atrapalhou:** o diário da etapa NÃO é guardado — `portao-lib.sh`
     grava em `mktemp` e o arquivo morre com a execução. Quem investigar
     precisa redirecionar a saída inteira do portão para um arquivo; só o
     resumo não diz qual teste caiu.

  Teste instável é dívida do portão inteiro: ele ensina a desconfiar do
  vermelho, e portão em que ninguém confia é portão que ninguém roda.

55. **Nada está publicado, e é assim de propósito.** O mecanismo da publicação
    existe e é provado por teste (T-018), mas conta no provedor, domínio e
    primeira publicação são tarefas da fase de publicação — o domínio fica para
    o fim do projeto (decisão de 17/08). O que nunca foi ensaiado de verdade:
    uma publicação com a versão nova e a antiga atendendo ao mesmo tempo. A
    regra de compatibilidade das migrações já foi escrita para esse mundo; é
    exatamente a janela que ela protege.

56. **Dois nomes para a mesma porta da API.** `apps/api/src/main.ts` lê
    `API_PORT`; `apps/api/src/core/env.ts` e o `.env.example` chamam a mesma
    coisa de `PORT`. Hoje convivem porque o padrão é 3001 nos dois, e a imagem
    de produção declara `API_PORT`. Unificar é mexer em teste de duas tarefas
    (T-003 e T-019), então ficou registrado em vez de resolvido no meio da
    publicação.

57. **A imagem da API pesa mais do que deveria por causa de companhia
    opcional.** `@prisma/client` declara a linha de comando do Prisma, o painel
    visual e o servidor de desenvolvimento como companhia OPCIONAL, e o arquivo
    de trava reproduz a resolução que a máquina de desenvolvimento fez — mesmo
    com a poda de produção. `apps/api/Dockerfile` os remove por nome, o que
    levou o conteúdo de `/app` de 356 MB para 267 MB (imagem inteira: 687 MB). É remoção por nome, e nome muda: se um
    dia o cliente do Prisma passar a precisar de um deles em execução, a imagem
    quebra na partida (e a prova disso é subir a imagem e chamar
    `/v1/health/live`, como está em `docs/publicacao.md`).

58. **A prova das imagens é da RECEITA, não da imagem construída.** Construir as
    duas imagens no portão levaria minutos e exigiria Docker na máquina que o
    roda — a mesma razão que já separou a prova da composição local. As duas
    foram construídas e subiram de verdade durante a T-018 (a API respondendo
    `/v1/health/live`, o site respondendo a página inicial), e os comandos para
    repetir isso à mão estão em `docs/publicacao.md`. O que roda no portão
    confere o que a receita MANDA acontecer: estágios separados, poda das
    dependências de desenvolvimento e usuário sem privilégio.

59. ~~**O botão principal da loja leva a uma página que não existe.**~~
    **Resolvido pela T-403 em 25/08:** a página do catálogo entrou em
    `apps/web/src/app/(loja)/l/[slug]/catalogo/page.tsx`, e o botão da
    apresentação agora chega a algum lugar. A anotação original fica porque o
    modo de falhar é instrutivo: cada lado estava provado sozinho — a
    apresentação por teste de tela, o catálogo por teste de integração — e o
    caminho ENTRE eles não era de ninguém. Prova por peça não vê a costura.

    (anotação original)
    **O botão principal da loja leva a uma página que não existe.**
    `apps/web/src/app/(loja)/l/[slug]/page.tsx` passa
    `linkDoCardapio={/l/${loja.apelido}/cardapio}` para a apresentação, e
    `apps/web/src/app/(loja)/l/[slug]/` não tem nenhuma pasta `cardapio`. Quem
    abrir uma loja hoje vê a apresentação inteira, aperta o único botão que ela
    oferece e cai no 404. Não foi descuido: a T-400 entregou a apresentação e a
    T-402 entregou o catálogo pela API, e a tela que os une é a T-403 — mas
    entre uma e outra o caminho está cortado, e isso não aparece em teste
    nenhum porque cada lado é provado sozinho. **A T-403 fecha.**

60. ~~**O nome da rota do cardápio diverge entre o código e o mapa de
    telas.**~~ **Resolvido pela T-403 em 25/08:** venceu o mapa, e a rota é
    `/l/{apelido}/catalogo`. O desempate não foi só "o mapa manda": `catálogo`
    serve à loja de roupas e à de peças, e `cardápio` só serve à lanchonete —
    e a landing vende para as três. O RÓTULO na tela continua "Ver o
    cardápio", e a propriedade continua `linkDoCardapio`: a palavra que a
    pessoa lê é a da loja dela, o caminho no endereço é o genérico. Os cinco
    lugares que fixavam o endereço nos testes acompanharam.

    (anotação original)
    **O nome da rota do cardápio diverge entre o código e o mapa de telas.** O
    código chama de `/l/{slug}/cardapio`; a linha 2 da tabela de
    `.spec/design/mapa-de-telas.md` declara `/l/{slug}/catalogo`, e é ela que
    carrega os critérios AC-404 a AC-409, AC-415 a AC-417 e AC-420. Um dos dois
    está errado e nada acusa isso hoje, porque o manifesto de rotas da T-020
    confere COBERTURA de tela, não o nome do caminho que outra tela usa para
    apontar. **Decidir na T-403, e mudar o lado perdedor** — o mapa é o
    documento que manda, então trocar o código é o caminho mais barato, a menos
    que "cardápio" seja a palavra que o dono da loja usa, e aí o mapa é que se
    corrige. Os testes de `apps/web/tests/apresentacao-da-loja.test.tsx` fixam o
    endereço em quatro lugares e vão precisar acompanhar.

61. ~~**`buscarCatalogo` não tem nenhum chamador.**~~ **Resolvido pela T-403
    em 25/08:** a página do catálogo chama `buscarVitrine` e `buscarCatalogo`
    EM PARALELO. Em série, o tempo até o primeiro produto seria a soma das
    duas idas à API — e é justamente esse tempo que o AC-415 mede.

    (anotação original)
    **`buscarCatalogo` não tem nenhum chamador.** A T-402 escreveu a ponte
    inteira em `apps/web/src/server/vitrine.ts` — busca, conferência contra o
    esquema, tratamento de vazio como catálogo legítimo e não como erro (AC-407)
    — e nenhuma página a usa. Código sem chamador é código que ninguém sabe se
    funciona de ponta a ponta, mesmo passando no portão. É a mesma T-403 que
    resolve; fica anotado para o caso de ela demorar, porque em duas semanas
    essa função vira "por que isso existe?".

62. **A lista de adiamento do Prisma tem DUAS tabelas** (eram oito até a
    T-405). Ficam `attribute_definitions` e `product_attributes`, as duas de
    especificação tipada, que pertencem à feature `catalogo-produtos`. As seis
    de variação, preço nomeado e grupo de escolha saíram porque a T-405 passou
    a lê-las. A lista SÓ PODE ENCOLHER, e a guarda da T-021 reprova quem
    tentar acrescentar sem registrar o motivo.

    (anotação original, de quando eram oito)
    **A lista de adiamento do Prisma ainda tem oito tabelas.**
    `SEM_MODELO_POR_DECISAO`, em
    `packages/database/tests/esquema-cobre-o-banco.test.ts`, guarda
    `product_variants`, `product_prices`, `option_groups`, `option_items`,
    `product_option_groups`, `variant_option_values`, `attribute_definitions` e
    `product_attributes`. A T-402 tirou três (`categories`,
    `product_categories`, `product_images`) porque passou a lê-las. As oito que
    ficaram são de variação, preço nomeado e grupo de escolha — ou seja, elas
    saem da lista quando a **T-405** (detalhe do produto) e a feature
    `catalogo-produtos` chegarem. A lista SÓ PODE ENCOLHER, e a guarda da T-021
    reprova quem tentar acrescentar sem registrar o motivo.

63. **AC-415 é citado como cumprido nas notas da T-400, e não tem teste.** A
    nota diz que a apresentação é desenhada no servidor "que é o que o AC-415
    exige"; a auditoria lista AC-415 (Vitrine é entregue pronta pelo servidor)
    entre os critérios sem prova. Os dois estão certos: a página é mesmo de
    servidor, e o critério fala da VITRINE, que ainda não existe — o dono dele é
    a **T-407**, com medição de desempenho. Fica registrado porque nota de
    tarefa que cita critério de outra tarefa é exatamente como um critério passa
    a parecer provado sem estar.

64. **A construção do site depende de rede para as fontes da marca.**
    `apps/web/src/app/layout.tsx` usa `next/font/google` para
    `Bricolage_Grotesque` e `Manrope`. A escolha está certa e é deliberada — a
    fonte é baixada NA CONSTRUÇÃO e servida do próprio domínio, o que evita
    entregar o endereço de quem visita a um terceiro e evita texto invisível
    esperando o download —, mas o custo aparece do outro lado: `pnpm build` do
    site precisa alcançar o Google, e o estágio de construção da imagem também.
    Numa máquina sem rede, ou num ambiente de publicação com saída fechada, a
    construção quebra num lugar que não parece ter nada a ver com fonte. Se
    incomodar, o caminho é versionar os arquivos `.woff2` e passar a
    `next/font/local`.

65. ~~**Todo cartão da vitrine aponta para uma página que ainda não
    existe.**~~ **Resolvida pela T-405 em 25/08:** a página do produto entrou
    em `apps/web/src/app/(loja)/l/[slug]/produto/[id]/page.tsx`, e os cartões
    da vitrine chegam a algum lugar. A dependência era declarada e tinha dono;
    fechou no prazo de uma tarefa.

    (anotação original)
    **Todo cartão da vitrine aponta para uma página que ainda não existe.** A
    T-403 monta a grade e os destaques, e cada cartão é um link para
    `/l/{apelido}/produto/{id}` — a linha 3 do mapa de telas, que a **T-405**
    entrega. Até lá, tocar num produto cai no 404.

    Isto NÃO é a dívida 59 se repetindo, e a diferença importa: lá o caminho
    tinha sido cortado sem ninguém notar; aqui ele é uma dependência declarada,
    exigida pelo próprio critério. O AC-406 diz "cada destaque leva ao produto
    correspondente" — sem o link, o critério não fecha. As duas saídas piores
    eram inventar uma âncora dentro do catálogo, que faria o AC-406 parecer
    provado e obrigaria a T-405 a desfazer; ou não linkar, deixando o critério
    aberto sem dizer por quê.

    É o mesmo formato da página do fechamento: ausência anotada, com dono e
    prazo. **A T-405 fecha.**

66. ~~**O carrinho não tem UMA rota HTTP, e isso agora bloqueia duas
    telas.**~~ **Resolvida pela T-511 em 25/08**, tarefa que nasceu desta
    dívida e não estava no plano. Entraram quatro rotas, o token de sessão em
    cookie e a chamada do navegador — e com elas a **segunda metade do AC-411**:
    a rota recalcula o item com `calcularItem`, a MESMA função que a tela usa,
    com os preços que ela lê do catálogo.

    **A página do fechamento continua sem existir**, mas agora por falta de
    tela, e não de encanamento — ver a seção do fim deste arquivo.

    (anotação original)
    **O carrinho não tem UMA rota HTTP, e isso agora bloqueia duas telas.** O
    caso de uso está completo desde a T-500 — `acrescentarItem`, `verCarrinho`,
    `mudarQuantidade`, `removerItem` em
    `apps/api/src/modules/cart/carrinho.usecase.ts`, provado contra PostgreSQL
    em `carrinho.int.test.ts`. O que não existe é o Express: nenhuma rota no
    contrato, nenhuma montada em `app.ts`. A T-500 declarou só o caso de uso na
    lista de arquivos, e ninguém notou porque nada o chamava.

    **É a mesma forma da dívida 61** (`buscarCatalogo` sem chamador), com a
    diferença de que aqui falta a ponta do SERVIDOR, e não a da tela.

    **O que fica sem prova por causa disto:** a segunda metade do AC-411 — "o
    valor conferido no servidor ao adicionar é o mesmo". A primeira metade está
    provada, e a garantia SUBSTANTIVA existe: a conta é uma só
    (`packages/core/src/item-total.ts`), e a API vai chamar exatamente a função
    que a tela chama. O que falta é o encanamento HTTP entre as duas, e é ele
    que um teste de ponta a ponta exercitaria.

    `BotaoAdicionar` recebe quem leva o item por propriedade, então a página
    fica pronta no dia em que a rota existir — não há casca a desfazer.

    **Também é o que falta para a página do fechamento** (ver a seção do fim
    deste arquivo): montar `checkout/page.tsx` exige ler e alterar o carrinho
    por HTTP. As duas coisas saem da mesma tarefa.

    **Não tem tarefa declarada no plano.** Nasce uma, ou entra na T-510 junto do
    teste de ponta a ponta do fechamento.

67. ~~**O carrinho ainda não tem rota que devolva PREÇO.**~~ **Resolvida pela
    T-512 em 25/08.** E ao expor a conferência apareceram **dois erros de
    dinheiro**, os dois latentes até a T-511 — antes dela não havia como pôr
    no carrinho um item com opção ou com variante, então nenhum caminho
    chegava neles:

    - **o acréscimo da opção saía de graça.** A conferência somava só o preço
      do PRODUTO. O bacon de R$ 3,00 apareceria na vitrine e sumiria da conta:
      o cliente veria R$ 23,00 e o pedido sairia por R$ 20,00.
    - **produto com variante era conferido por ZERO.** `displayPriceCents` é
      nulo quando o preço mora na variante, e o código lia `?? 0n`. O
      comentário dizia "vale zero e não passa", mas nada filtrava zero — o
      item seguia, o pedido saía de graça e a cozinha preparava.

    Os dois estão corrigidos e provados contra PostgreSQL. A lição, que vale
    para o resto: **nulo não é zero, e a diferença é dinheiro.**

    (anotação original)
    **O carrinho ainda não tem rota que devolva PREÇO.** As quatro rotas da
    T-511 movem itens: acrescentar, mudar quantidade, tirar, listar. O que elas
    devolvem é o que foi ESCOLHIDO — identificadores, quantidade, observação e
    os nomes das opções. Nome e preço do produto vêm do catálogo no momento de
    conferir (AC-503), e o caso de uso que faz isso existe
    (`conferir-preco.usecase.ts`, T-501) e **também não tem rota**.

    É a mesma lacuna da dívida 66, uma camada adiante: a gaveta do carrinho
    (`GavetaCarrinho`) espera `precoUnitario` e `totalDaLinha` já escritos, e
    hoje ninguém os produz por HTTP. **A página do fechamento precisa disso**, e
    é o próximo pedaço do mesmo encanamento.

68. ~~**A chamada do carrinho sai do navegador, e nenhum teste a exercita de
    ponta a ponta.**~~ **Fechada pela T-510 em 26/08.** O cenário põe o item
    no carrinho pela tela, vai ao fechamento, cria o pedido e chega à
    mensagem do WhatsApp — com o cookie atravessando dois endereços, o
    `credentials: \"include\"` valendo e o CORS deixando o POST passar. A
    junção que nunca tinha rodado agora roda em 9 segundos.

    (anotação original)
    **A chamada do carrinho sai do navegador, e nenhum teste a exercita de
    ponta a ponta.** `apps/web/src/lib/carrinho-do-navegador.ts` é provado com
    `fetch` injetado, e a rota é provada por supertest. O que NÃO é provado é a
    costura real entre os dois: o cookie atravessando dois subdomínios, o
    `credentials: "include"` valendo, o CORS deixando o POST passar com a
    origem do site.

    Cada metade está certa e a junção nunca rodou — é exatamente a forma da
    dívida 59, e o que a fecha é um teste de navegador (T-409 ou T-510). Até
    lá, vale abrir a vitrine à mão depois de subir o ambiente.

69. **`NEXT_PUBLIC_API_URL` agora é obrigatória de verdade, e continua sem
    validação na partida.** Enquanto só o servidor do site falava com a API, a
    variável tinha um padrão razoável e a ausência dela passava despercebida
    (dívida 28). Agora o NAVEGADOR a usa: sem ela, o valor embutido na página é
    `https://api.simpleclick.localhost`, que só existe na máquina de quem
    desenvolve — em produção o carrinho falharia em todo aparelho, sem erro no
    servidor para explicar. Entra na T-017, com as dívidas 2, 10 e 19.

70. **`escolherPreco` tinha uma decisão a mais que ninguém tinha declarado.** Ao
    subir a regra para `packages/core` (T-512), apareceu um caso sem resposta
    escrita: dois preços do MESMO tipo valendo ao mesmo tempo. A versão da
    T-405 pegava o primeiro que a consulta devolvesse — ou seja, a ordem do
    banco decidia quanto o cliente pagava.

    A regra passou a ser explícita: vale o MENOR. Cadastro sobreposto é engano
    do dono, e cobrar o maior por engano dele é o cliente pagando a conta. Fica
    anotado porque é decisão de negócio tomada por mim, e o dono pode discordar
    — se discordar, muda numa linha e num teste.

71. **A conferência ignora `is_available` da OPÇÃO e o estoque da variante.**
    Ela lê o preço do adicional e o preço da variante, e não olha se qualquer um
    dos dois ainda está à venda. A rota de acrescentar olha (recusa com 409),
    então o item nasce válido — o buraco é o tempo entre pôr no carrinho e
    fechar: o cheddar acaba, e o pedido sai com cheddar.

    Não foi corrigido junto porque a resposta certa não é óbvia. Retirar o item
    inteiro por causa de um adicional esgotado é desproporcional; retirar só o
    adicional muda o pedido sem a pessoa pedir. As duas precisam de decisão de
    produto, e o lugar dela é a T-505 ou a tela do fechamento.

72. **A landing ainda fala "cardápio" para todo mundo.** O mesmo erro que a
    vitrine tinha, um nível acima: `apps/web/src/app/page.tsx` e
    `HistoriaDaLanding.tsx` dizem "Monte seu cardápio" e "Seu cardápio online
    sem pagar mensalidade" — e a própria landing mostra três ramos no mundo em
    três dimensões (loja de roupas, lanchonete, loja de peças).

    A diferença em relação à vitrine é que **na landing não há ramo para
    consultar**: quem chega ainda não tem loja, e é justamente ali que ele
    decide se o produto serve para o negócio dele. A saída não é o vocabulário
    do banco — é decisão de texto de venda, e por isso não foi corrigida junto.

    Duas direções possíveis, e a escolha é do Arthur: assumir que a maioria é
    de comida e falar "cardápio" de propósito, aceitando afastar as outras; ou
    escrever a landing em palavra neutra e deixar os três ramos aparecerem nos
    exemplos. Pertence à T-960.

73. **`rotulos` chega à vitrine e a busca ainda não o usa.** O ramo declara
    `buscaPlaceholder` — "O que você gostaria de comer?" na lanchonete, "Peça,
    código ou aplicação" na autopeça —, e o campo de busca é da T-404, que não
    existe. Quando ela nascer, o texto já está a um `loja.rotulos` de distância;
    fica anotado para não nascer com um genérico escrito à mão.

74. **`grupoOpcao` não tem consumidor, e talvez nunca tenha na vitrine.** O ramo
    declara a palavra para o grupo de escolha ("Ingredientes", "Especificações"),
    mas na vitrine o nome do grupo vem do que o DONO cadastrou em
    `option_groups.name` — e sobrescrever o que ele escreveu seria pior que
    genérico. O lugar provável deste rótulo é o PAINEL, como texto padrão ao
    criar um grupo (feature `catalogo-produtos`). Fica no contrato porque o
    aplicativo nativo do dono vai precisar dele pelo mesmo motivo.

75. **`store_settings` é JSON livre, e as formas já divergiram.** As sete
    colunas de configuração (`checkout`, `delivery`, `payment`, `whatsapp`,
    `printing`, `seo`, `notifications`) são `jsonb` sem esquema — nada no banco
    nem no código diz que forma cada uma tem.

    **A divergência já aconteceu.** A carga de exemplo grava
    `payment = { formas: [...], pix: { chave, tipo, titular } }`; o teste da
    T-401 gravava `{ chavePix, nomeDoRecebedor }`. Ninguém notou por dois
    motivos: nada LIA o campo, e o teste que o escrevia só provava que ele NÃO
    vazava — para isso qualquer forma serve. A T-513 passou a ler, e a
    divergência apareceu na primeira execução.

    O alinhamento foi feito pela forma da carga, que nasce do modelo de dados.
    O que continua aberto é a causa: **a próxima escrita pode inventar outra
    forma do mesmo jeito.** O lugar da correção é a T-900 (configurações por
    seção), que é quem passa a escrever essas colunas de verdade — e o formato
    da correção é um esquema declarado, conferido na escrita, como
    `packages/contracts` já faz com o que entra pela borda HTTP.

76. **A rota do fechamento lê a vitrine inteira para saber duas coisas.** Ela
    chama `lojaDaVitrine` só para obter `formasDeEntrega` — e paga por isso uma
    leitura de horário, a montagem da apresentação e a chamada de
    `storefront_settings()`. Funciona e é correto, mas é trabalho a mais numa
    rota que a página do fechamento chama sempre.

    Não foi otimizado agora porque a alternativa — uma consulta enxuta só da
    coluna `fulfillment_modes` — precisa de mais um caminho de leitura da loja,
    e caminho de leitura é onde o isolamento se perde quando alguém tem pressa.
    Vale medir antes de mexer: se a T-407 apontar isto no tempo da tela, aí sim.

77. **O formulário não pede UF, e o pedido tem coluna para ela.** `EnderecoNaTela`
    tem logradouro, número, complemento, bairro, cidade, CEP e ponto de
    referência — não tem estado. `ContatoParaCriar` tem `estado`, e a página do
    fechamento manda `null`.

    **Não é esquecimento do formulário, é decisão dele**: entrega de bairro não
    precisa de estado, e todo campo a mais no celular é uma desistência a mais.
    Fica anotado porque o dia em que alguém precisar (nota fiscal, transportadora
    com cálculo por estado) o campo já existe no banco e a origem dele não.

    Na mesma linha: `pontoDeReferencia` existe no formulário e NÃO tem coluna no
    pedido — a informação é digitada e descartada. Essa é a mais urgente das
    duas, porque a pessoa escreve achando que o entregador vai ler.

78. ~~**O passo do WhatsApp não existe na página do fechamento.**~~
    **Resolvida em 26/08**, junto da resposta para a pergunta que ela
    levantava. A resposta veio do banco: na carga de exemplo, **o número da
    loja e o celular do dono são o MESMO** — e é realista, porque no pequeno
    negócio o dono É o WhatsApp da loja.

    Então o número NÃO virou campo público. Ele vai embutido no endereço da
    conversa, montado na API ao criar o pedido, e o endereço só volta para
    quem acabou de pedir — mesmo desenho da chave PIX, pelo mesmo motivo. A
    resposta tem três campos e há prova disso.

    (anotação original)
    **O passo do WhatsApp não existe na página do fechamento.** O pedido é
    criado, a tela mostra o código e o caminho de acompanhar — e para aí. O
    AC-514 pede que o cliente MANDE o pedido para a loja no WhatsApp, e há duas
    peças prontas para isso: `EnvioWhatsApp` (T-508) e o gerador do texto
    (`lib/texto-whatsapp.ts`, T-507).

    **O que falta é o número da loja.** Ele mora em `store_settings.whatsapp`, e
    nenhuma rota o expõe — a de fechamento (T-513) o deixou de fora de propósito,
    porque naquele momento a pergunta era outra. Aqui a pergunta aparece: o
    número de WhatsApp com que a loja RECEBE pedido é público por natureza (é
    para isso que ele existe), e é diferente do telefone do dono que o AC-904
    protege.

    Provavelmente são campos diferentes na mesma coluna, e vale conferir antes
    de expor qualquer um. Pertence à T-508.

79. **`URL_DO_SITE` não é validada na partida, e agora ela vai dentro da
    mensagem.** O link de acompanhamento embutido no texto do WhatsApp é
    montado com `process.env.URL_DO_SITE`, e a variável não passa pelo esquema
    de `core/env.ts` — na falta dela, o padrão é vazio, e a mensagem sai com um
    link relativo que não abre em aplicativo nenhum.

    Não quebra nada visível no servidor: o pedido é criado, a mensagem é
    montada, o WhatsApp abre. O que falha é o cliente tocando no link e não
    chegando a lugar nenhum. É a mesma família das dívidas 42 e 69 — variável
    de ambiente que só falha em produção, e em silêncio. Entra na T-017, junto
    delas.

80. **O texto da mensagem repete a conta que o pedido já congelou.** Ele é
    gerado a partir da conferência e do carrinho, e não do PEDIDO recém-criado —
    que é quem tem a cópia congelada de verdade (AC-515). Hoje os dois dizem a
    mesma coisa, porque a criação usou exatamente esses valores.

    O risco é de deriva: se um dia a criação ajustar algo (arredondamento,
    desconto, item retirado), a mensagem passa a contar uma versão do pedido que
    não é a gravada — e o cliente manda para a loja um texto que não bate com a
    fila do dono. O conserto é ler os itens do pedido criado; não foi feito
    agora porque exigiria uma leitura a mais na mesma transação, e o ganho é
    contra um risco que ainda não existe.

81. ~~**A T-020 está `[concluida]` e NENHUM dos seis arquivos dela
    existe.**~~ **Entregue em 26/08**, depois de o Arthur escolher construir
    o harness em vez de adiar. Entraram Playwright, `playwright.config.ts`,
    o manifesto de rotas com as 50 telas e duas verificações de cobertura.

    **O harness pagou por si na primeira execução** — ver a dívida 83.

    O buraco do portão que a escondeu CONTINUA ABERTO: `ARQUIVO_INEXISTENTE`
    segue classificado como backlog mesmo quando a tarefa está concluída.
    Ver a dívida 84.

    (anotação original)
    **A T-020 está `[concluida]` e NENHUM dos seis arquivos dela existe.** A
    tarefa declara `apps/web/src/lib/routes.ts`, `e2e/playwright.config.ts`,
    três specs e `e2e/fixtures/auth.setup.ts`. **A pasta `e2e/` não existe, o
    Playwright não está instalado, e `routes.ts` não foi escrito.**

    A auditoria VÊ o problema e diz o certo — "que não existe (tarefa
    concluída!)" —, mas o portão não reprova, e é aí que ele passou: em
    `infra/scripts/audit-regressao.mjs`, `ARQUIVO_INEXISTENTE` está na lista de
    BACKLOG ("trabalho que ainda não foi feito: conta, mas não reprova").

    **Essa classificação é certa para tarefa PENDENTE e errada para tarefa
    CONCLUÍDA.** Na pendente, o arquivo não existe porque o trabalho não foi
    feito; na concluída, ele não existe porque a tarefa mentiu. O motor já
    distingue as duas: o achado sai com `severity: "erro"` quando a tarefa está
    concluída, e `"aviso"` quando está pendente. O conserto é uma condição,
    não um casamento de texto.

    **O que depende disso, em silêncio:** a metade de AC-016 que fala de
    cobertura de TELAS (a outra metade, a página do design system, está provada
    em `vitrine-ui-a11y.test.tsx`), e as quatro tarefas de ponta a ponta —
    T-409 (vitrine), T-510 (fechamento), T-908 (configurações) e T-963
    (landing). Todas as quatro declaram arquivos em `e2e/` e nenhuma delas
    tem harness para rodar.

    **É a dívida 66 outra vez, num nível acima:** a T-500 entregou o caso de uso
    do carrinho sem rota; a T-020 declarou o harness de ponta a ponta e não
    entregou nenhum. As duas passaram porque nada as chamava.

82. **O `notFound()` responde 200 no servidor de desenvolvimento.** A página de
    loja inexistente é a certa — ela diz "não está disponível" e não conta se o
    endereço já existiu —, mas o status HTTP é 200. Um _soft 404_ diz ao
    buscador que a página existe, e ele passa a indexar endereços de lojas que
    nunca houve.

    O ponta a ponta NÃO confere o status de propósito: gravar `200` como
    esperado congelaria o comportamento errado. Quem decide a resposta de
    produção é a construção, e o lugar de conferir isso é a **T-406**
    (encontrabilidade), com o site construído.

83. **`app/loading.tsx` quebrava o AC-415 em toda página pública — e nenhum
    teste de unidade podia ver.** O arquivo de convenção criava um limite de
    streaming ACIMA de tudo: o conteúdo chegava dentro de um `<template>` e só
    era posto no lugar por script. **A vitrine sem script mostrava "Carregando…"
    para sempre**, que é exatamente o que o critério proíbe.

    Nenhum teste de unidade pegava porque todos desenham o COMPONENTE, e o
    componente estava certo; o defeito era do arranjo de rotas. Só um navegador
    com `javaScriptEnabled: false` vê isso, e foi a primeira coisa que o harness
    encontrou.

    **A tensão era real, e binária:** o P-011 quer estado de espera em toda
    tela; o AC-415 quer a vitrine sem script. No Next, ou tudo acima daquele
    limite faz streaming, ou nada faz. Resolvido a favor do AC-415, porque na
    vitrine "carregando" nunca ajuda — o servidor já tem o dado antes de
    responder. O componente segue em `packages/ui`, e o limite volta nas áreas
    em que a espera é real (painel, minha conta), quando nascerem.

84. **O portão não reprova arquivo faltante de tarefa CONCLUÍDA.** Em
    `infra/scripts/audit-regressao.mjs`, `ARQUIVO_INEXISTENTE` está na lista de
    BACKLOG. É a classificação certa para tarefa pendente — o arquivo não existe
    porque o trabalho não foi feito — e errada para tarefa concluída, onde ele
    não existe porque a tarefa mentiu.

    **Foi por aqui que a T-020 passou**, e o mesmo buraco cobre qualquer outra.
    O motor já distingue os dois casos: o achado sai com `severity: "erro"`
    quando a tarefa está concluída e `"aviso"` quando pendente. O conserto é uma
    condição sobre esse campo — não um casamento de texto.

    Não foi feito junto porque muda o comportamento do portão, e mudança de
    portão merece rodar sozinha para se ver o que ela passa a acusar.

85. **O ponta a ponta escreve no banco de DESENVOLVIMENTO — atenuado, não
    resolvido.** A T-510 deixou de usar a loja da carga e passou a montar uma
    PRÓPRIA (`e2e-lanchonete`), idempotente, e a apagar os pedidos que cria.
    O que sobra é uma loja a mais no banco de desenvolvimento, com apelido
    que se reconhece de longe.

    Continua valendo o caminho definitivo: banco próprio para o ponta a
    ponta. Enquanto ele não vem, o incômodo é uma linha na lista de lojas —
    e não pedido de teste na fila de ninguém.

    (anotação original)
    **O ponta a ponta escreve no banco de DESENVOLVIMENTO.** Ele usa `.env`, e
    portanto a loja da carga de exemplo — o que é bom (prova o caminho com o
    dado que o produto tem) e tem um custo: o cenário de fechamento vai CRIAR
    pedidos ali, e eles ficam.

    Enquanto os cenários só leem, não incomoda. Quando a T-510 entrar, vale um
    banco próprio para o ponta a ponta — ou uma limpeza no fim. Anotado antes de
    o primeiro pedido de teste aparecer na fila de alguém.

86. **`provar.sh` roda a suíte inteira de uma vez; o portão roda projeto por
    projeto.** São duas cargas diferentes sobre os mesmos serviços, e a gravação
    da prova acontece na mais pesada das duas.

    A consequência apareceu em 26/08: o AC-503 perdeu a prova numa execução de
    `provar.sh`, e todos os testes que o cobrem passavam isolados e passavam
    pelo portão. A prova reprovou por contenção — não porque o código regrediu.

    É a mesma família do que a correção do `cache-int` resolveu, um nível acima:
    lá eram dois arquivos disputando o Redis dentro de um projeto; aqui são os
    projetos inteiros disputando Redis e PostgreSQL ao mesmo tempo. O caminho
    provável é `provar.sh` executar projeto a projeto, como o portão faz — o
    custo é alguns segundos a mais, e o ganho é a prova deixar de depender da
    máquina estar folgada.

87. **`products.search_tsv` ficou redundante e continua sendo mantida pelo
    banco.** A migração 0021 criou o índice de expressão
    `products_busca_sem_acento_ix`, que é o que a busca usa. A coluna gerada
    `search_tsv` não é lida por ninguém desde então — e continua sendo
    recalculada a cada escrita em `products`, junto do índice dela.

    Não foi removida no mesmo passo de propósito: o AC-030 exige que a versão
    anterior siga funcionando enquanto as duas atendem lado a lado, e
    `DROP COLUMN` a quebraria no minuto da troca. A remoção é o segundo passo,
    num dia em que nenhuma versão no ar a leia.

    O custo de deixá-la é escrita mais lenta em `products` e índice ocupando
    espaço — nada que se sinta hoje. O custo de esquecê-la é alguém, daqui a
    seis meses, "consertar" a busca mexendo na coluna errada.

88. **A busca corta em 200 acertos e não avisa ninguém.**
    `MAXIMO_DE_ACERTOS` limita o que `produtosQueCasam` devolve, e a tela mostra
    o resultado como se fosse tudo. Numa loja com mil produtos, buscar uma
    palavra comum ("de", "com") entrega os 200 melhores por `ts_rank` e nenhum
    sinal de que havia mais.

    Hoje é teórico: nenhuma loja do produto chega perto disso. Vira real quando
    a primeira chegar — e o sintoma será um dono jurando que cadastrou um
    produto que "a busca não acha". O caminho é a rota devolver quantos casaram,
    e a tela dizer "mostrando 200 de 640" com o convite a refinar.

89. **A busca não tem prova de ponta a ponta, e ela é a mais barata que
    existe.** O AC-408 e o AC-409 estão provados em três níveis — unidade,
    banco de verdade e desenho estático da tela — mas nada percorre o caminho
    inteiro: digitar no campo, enviar sem JavaScript, ler o resultado.

    O harness do Playwright existe desde a T-510, e o projeto `publico` já roda
    com `javaScriptEnabled: false`. É uma tela e um `fill`+`press`. Entra na
    T-409 (ponta a ponta da vitrine), que ainda está pendente.

90. **Um servidor de desenvolvimento sobrando faz o ponta a ponta reprovar
    inteiro, e a mensagem não diz isso.** `reuseExistingServer` reaproveita o
    que já responde na porta 3100 — inclusive um processo antigo, servindo de um
    cache que não existe mais ou sem as variáveis que o cenário precisa. O
    sintoma é 42 cenários caindo de uma vez, com erros que falam de canônico e
    de carrinho.

    Aconteceu duas vezes na T-406, e as duas custaram uma investigação. O que
    resolve é derrubar 3100 e 3101 antes de rodar. O caminho provável é o
    próprio `test:e2e` conferir se quem está na porta é dele — ou simplesmente
    não reaproveitar.

91. **A imagem de compartilhamento usa a fonte do sistema.** `next/og` não
    conhece as duas famílias que o site carrega por `next/font`, e desenha com o
    que tiver. A prévia sai legível, e sai com a letra de qualquer página — que
    é justamente o que a escolha de tipografia do projeto existe para evitar.

    Passar a fonte é uma opção do `ImageResponse` (`fonts:`), e exige ler o
    arquivo `.ttf` do disco na partida da rota. Fica para quando houver um
    arquivo de fonte versionado; hoje elas vêm do pacote do Next.

## Portão contornado

`LEFTHOOK=0 git push` continua funcionando — situação excepcional existe. O que
ele não consegue é passar em silêncio: o portão anota cada versão que aprova
(`.git/portao-verificados`), e o gancho antes do registro compara o que já foi
enviado com o que foi aprovado. Versão enviada que não consta como aprovada só
pode ter passado por fora do portão: vira uma linha aqui embaixo, com data,
versão, ramo e a lista do que ficou sem verificação, e entra no commit — dívida
que fica só no disco de quem pulou não é visível para mais ninguém (AC-043).

Quem escreve é `infra/scripts/registrar-pulo.sh`. A vigilância começa no ponto
de partida marcado por `pnpm install`, e não no primeiro commit da história: sem
isso, todo clone novo acusaria como contornado o histórico que já existia antes
dele, e dívida falsa ensina a ignorar este arquivo. O funcionamento inteiro está
em `docs/verificacao.md`.

Para quitar: volte à versão, rode `bash infra/scripts/verificar.sh` até sair
limpo e apague a linha.

Enquanto a lista abaixo estiver vazia, nunca aconteceu.

<!-- portao-contornado:inicio -->

- **18/08/2026 · `56b7b48` no ramo `main`** — enviado sem passar pelo portão.
  Motivo: não informado — quem pulou não declarou
  Ficou sem verificação: separação de ambientes · cliente tipado do banco · formatação · qualidade de código · segredo no código · auditoria da especificação · verificação de tipos · contrato publicado em dia · testes de unidade · testes do site (estados e acessibilidade) · testes do cache (Redis de teste) · testes de fila (Redis) · testes de integração (banco efêmero) · migração compatível com a versão anterior · guardas estruturais do banco.
  Para quitar: volte a esta versão, rode `bash infra/scripts/verificar.sh`
  até sair limpo e apague esta linha.

- **18/08/2026 · `5a0607c` no ramo `main`** — enviado sem passar pelo portão.
  Motivo: não informado — quem pulou não declarou
  Ficou sem verificação: separação de ambientes · cliente tipado do banco · formatação · qualidade de código · segredo no código · auditoria da especificação · verificação de tipos · contrato publicado em dia · testes de unidade · testes do site (estados e acessibilidade) · testes do cache (Redis de teste) · testes de fila (Redis) · testes de integração (banco efêmero) · migração compatível com a versão anterior · guardas estruturais do banco.
  Para quitar: volte a esta versão, rode `bash infra/scripts/verificar.sh`
  até sair limpo e apague esta linha.

- **19/08/2026 · `ee808b8` no ramo `main`** — enviado sem passar pelo portão.
  Motivo: não informado — quem pulou não declarou
  Ficou sem verificação: separação de ambientes · cliente tipado do banco · formatação · qualidade de código · segredo no código · auditoria da especificação · verificação de tipos · contrato publicado em dia · testes de unidade · testes do site (estados e acessibilidade) · testes do cache (Redis de teste) · testes de fila (Redis) · banco local em dia com as migrações · testes de integração (banco efêmero) · migração compatível com a versão anterior · guardas estruturais do banco.
  Para quitar: volte a esta versão, rode `bash infra/scripts/verificar.sh`
  até sair limpo e apague esta linha.

- **19/09/2026 · `e73432e` no ramo `main`** — enviado sem passar pelo portão.
  Motivo: não informado — quem pulou não declarou
  Ficou sem verificação: separação de ambientes · cliente tipado do banco · formatação · qualidade de código · segredo no código · auditoria da especificação · verificação de tipos · contrato publicado em dia · testes de unidade · testes do site (estados e acessibilidade) · testes do cache (Redis de teste) · testes de fila (Redis) · banco local em dia com as migrações · testes de integração (banco efêmero) · migração compatível com a versão anterior · guardas estruturais do banco.
  Para quitar: volte a esta versão, rode `bash infra/scripts/verificar.sh`
  até sair limpo e apague esta linha.

- **19/09/2026 · `2ac1c0a` no ramo `main`** — enviado sem passar pelo portão.
  Motivo: não informado — quem pulou não declarou
  Ficou sem verificação: separação de ambientes · cliente tipado do banco · formatação · qualidade de código · segredo no código · auditoria da especificação · verificação de tipos · contrato publicado em dia · testes de unidade · testes do site (estados e acessibilidade) · testes do cache (Redis de teste) · testes de fila (Redis) · banco local em dia com as migrações · testes de integração (banco efêmero) · migração compatível com a versão anterior · guardas estruturais do banco.
  Para quitar: volte a esta versão, rode `bash infra/scripts/verificar.sh`
  até sair limpo e apague esta linha.

- **20/09/2026 · `3ecf402` no ramo `main`** — enviado sem passar pelo portão.
  Motivo: não informado — quem pulou não declarou
  Ficou sem verificação: separação de ambientes · cliente tipado do banco · formatação · qualidade de código · segredo no código · auditoria da especificação · verificação de tipos · contrato publicado em dia · testes de unidade · testes do site (estados e acessibilidade) · testes do cache (Redis de teste) · testes de fila (Redis) · banco local em dia com as migrações · testes de integração (banco efêmero) · migração compatível com a versão anterior · guardas estruturais do banco.
  Para quitar: volte a esta versão, rode `bash infra/scripts/verificar.sh`
  até sair limpo e apague esta linha.

- **20/09/2026 · `b2fb93a` no ramo `main`** — enviado sem passar pelo portão.
  Motivo: não informado — quem pulou não declarou
  Ficou sem verificação: separação de ambientes · cliente tipado do banco · formatação · qualidade de código · segredo no código · auditoria da especificação · verificação de tipos · contrato publicado em dia · testes de unidade · testes do site (estados e acessibilidade) · testes do cache (Redis de teste) · testes de fila (Redis) · banco local em dia com as migrações · testes de integração (banco efêmero) · migração compatível com a versão anterior · guardas estruturais do banco.
  Para quitar: volte a esta versão, rode `bash infra/scripts/verificar.sh`
  até sair limpo e apague esta linha.

- **20/09/2026 · `bc98def` no ramo `main`** — enviado sem passar pelo portão.
  Motivo: não informado — quem pulou não declarou
  Ficou sem verificação: separação de ambientes · cliente tipado do banco · formatação · qualidade de código · segredo no código · auditoria da especificação · verificação de tipos · contrato publicado em dia · testes de unidade · testes do site (estados e acessibilidade) · testes do cache (Redis de teste) · testes de fila (Redis) · banco local em dia com as migrações · testes de integração (banco efêmero) · migração compatível com a versão anterior · guardas estruturais do banco.
  Para quitar: volte a esta versão, rode `bash infra/scripts/verificar.sh`
  até sair limpo e apague esta linha.

<!-- portao-contornado:fim -->

## RESOLVIDO — Teste intermitente do limite de tentativas (AC-119/AC-120)

**Diagnosticado e corrigido em 19/08/2026, na terceira ocorrência.** O motivo
apareceu assim que o portão passou a guardar a saída da etapa que reprova: não
era o AC-119 nem tolerância de tempo curta, era o teste do AC-120 estourando os
30 segundos do projeto.

Ele é o mais pesado do arquivo: 38 requisições HTTP de verdade — 11 para
estourar o limite da conta, 26 para estourar o da origem, 1 para conferir o
veredito —, cada uma conversando várias vezes com o Redis. Sozinho leva cerca de
dois segundos; com a suíte inteira disputando o mesmo Redis, passou de 30.

**A correção** foi dar espera própria a ESSE teste (dois minutos), e não subir o
limite do projeto: subir todos esconderia um teste genuinamente travado atrás de
dois minutos de paciência.

**A lição:** duas investigações anteriores falharam porque o motivo se perdia
entre centenas de linhas de saída do portão. A terceira levou minutos, porque o
portão guardou o diário da etapa. Ferramenta de diagnóstico paga por si na
primeira vez que é usada.

## (anotação original, com as duas primeiras ocorrências)

**Observado em 18/08/2026.** Durante uma regravação de provas, o critério AC-119
(excesso de tentativas para a mesma conta) reprovou uma vez e passou nas
execuções seguintes, isolado e em conjunto, sem nenhuma alteração no código.

Por que isto está anotado em vez de esquecido: teste que falha às vezes ensina o
time a reexecutar em vez de investigar, e a partir daí ele deixa de ser prova.
O critério trata de espera crescente entre tentativas, ou seja, depende de
tempo — a suspeita é de tolerância curta demais para uma máquina ocupada, e não
de defeito na regra.

**Segunda ocorrência em 19/08/2026**, também durante uma execução do portão, e
também passando isolada. Oito execuções seguidas — cinco isoladas e três com a
máquina carregada por outra suíte — não reproduziram. O relógio do teste é
VIRTUAL (`cenario.avancar`), então a suspeita inicial de tolerância curta está
descartada: a falha não é de asserção de tempo, e sim de conexão com o Redis ou
de espera de conexão sob carga.

**O que mudou para a próxima vez:** o portão passou a repetir, no resumo, as
últimas linhas da etapa que reprovou. Nas duas ocorrências o motivo se perdeu
porque a explicação ficava centenas de linhas acima do veredito. A próxima
ocorrência vai dizer o que foi.

**O que fazer:** ler o trecho que o portão repetir. Se for espera de conexão,
folgar a espera do cliente de Redis nos testes; se for chave colidindo, olhar o
espaço de nomes por arquivo.

## RESOLVIDO — Carrinho: o problema era o oposto do anotado (T-500)

**Corrigido em 19/08/2026 pela migração 0012.** A anotação abaixo estava errada
no diagnóstico, e vale manter registrada porque o erro é instrutivo: eu supus
que as políticas de carrinho copiavam as de pedido e exigiam ser da equipe. Não
exigiam. Elas se chamam `carts_staff_*` e pedem apenas que exista loja no
contexto — e todo visitante da vitrine tem loja no contexto, é assim que ele vê
os produtos.

O problema não era falta de acesso: era acesso demais. Qualquer visitante
anônimo podia LER o carrinho de todos os outros daquela loja, ALTERÁ-LOS e
APAGÁ-LOS. O nome da política escondeu isso — quem lê `carts_staff_select`
assume que a conferência está ali.

**Lição:** nome de política não é verificação. A guarda G2 confere que existe
política por comando, não que a condição dentro dela faz sentido.

## (anotação original, com o diagnóstico errado)

**Observado em 19/08/2026, junto com a migração 0009.** A migração 0008 escreveu
as políticas de `carts` e `cart_items` só para a equipe da loja
(`app.is_store_staff()`). O cliente não consegue criar nem alterar o próprio
carrinho — a mesma lacuna que a 0009 corrigiu para o pedido.

Não foi corrigida junto de propósito: escrever política sem um caso de uso que a
exercite é escrever no escuro, e o carrinho ainda não tem o seu. A T-500
("carrinho que sobrevive ao recarregar") é quem fecha isso, e a política deve
seguir o mesmo desenho da 0009 — o que autoriza a escrita é um dado que só o
dono do carrinho conhece, declarado no contexto da requisição, e não o simples
fato de haver uma loja no contexto.

## DESTRAVADA — A página do fechamento (T-502 → T-400/T-401)

**A dependência caiu em 21/08.** A T-400 e a T-401 entraram: a loja é resolvida
pelo apelido, `GET /v1/vitrine/:apelido` está publicado no contrato e a saída
pública já passa por lista de campos permitidos. **Não há mais nada bloqueando
a página do fechamento** — o que falta é escrevê-la.

**O que fazer, exatamente:** montar
`apps/web/src/app/(loja)/l/[slug]/checkout/page.tsx` com `FormularioCheckout`,
`ResumoDoPedido`, `SeletorDePagamento` e `CaixaPix`, que já existem em
`apps/web/src/features/checkout/`, carregar a configuração da loja por
`buscarVitrine` e ligar o envio ao caso de uso de criação do pedido. Depois
disso a T-510 (ponta a ponta) tem página para abrir, e a feature fecha em 11/11.

Uma decisão a tomar junto: a linha 5 do mapa de telas declara a rota como
`/l/{slug}/checkout`, e é preciso conferir que o carrinho (linha 4,
`/l/{slug}/carrinho`) não vira pré-requisito na prática — hoje o carrinho vive
em `useCarrinho`, no navegador, sem página própria.

A anotação original fica abaixo, porque ela explica POR QUE a página não nasceu
junto com os componentes, e essa razão continua valendo para a próxima vez.

### (anotação original, de quando ainda estava bloqueada)

**Anotado em 19/08/2026, ao fechar a T-502.** O formulário de fechamento, os
campos de endereço condicional e a validação de borda estão prontos e provados.
Falta a PÁGINA que os monta em `app/(loja)/l/[slug]/checkout/page.tsx`.

Ela não foi escrita agora por dependência real, e não por escolha: a tabela de
fronteiras não autoriza o site a falar com o banco. Toda leitura passa pela API
por HTTP, e as rotas públicas da loja vêm com a vitrine (T-400 resolve a loja
pelo endereço, T-401 define a saída pública). Escrever a página antes disso
produziria uma casca sem de onde carregar a configuração da loja — e uma casca
que passa no portão é pior que uma ausência anotada.

**O que fazer quando T-400 e T-401 estiverem prontas:** montar a página com
`FormularioCheckout`, `ResumoDoPedido`, `SeletorDePagamento` e `CaixaPix`, que
já existem, e ligar o envio ao caso de uso de criação do pedido.

**A T-510 (ponta a ponta do fechamento) espera a mesma coisa.** Um teste de
navegador precisa de uma página para abrir. Os 24 critérios da feature de
fechamento estão provados por teste de unidade, de tela e de integração contra
PostgreSQL; o que a ponta a ponta acrescenta é a costura entre eles, e ela só
existe depois das rotas. A feature fica com 24 de 24 critérios e 10 de 11
tarefas até lá — e é assim que deve aparecer no acompanhamento, sem arredondar
para "pronta".
