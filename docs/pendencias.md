# Pendências

Dívidas conhecidas e o que retomar. Uma linha sai daqui quando deixa de valer.

## Para retomar (17/08/2026)

### Onde paramos

Fase **F0 (fundação)**: 10 de 20 tarefas concluídas, 245 testes passando,
18 de 253 critérios de aceite provados.

| Concluída | O que entregou                                                          |
| --------- | ----------------------------------------------------------------------- |
| T-001     | Monorepo, ferramentas, fronteiras entre camadas verificadas pelo ESLint |
| T-002     | Docker Compose com Traefik, `app.localhost` e `api.localhost` com TLS   |
| T-003     | Variáveis de ambiente validadas na partida, verificador de ambientes    |
| T-004     | Migrações, três credenciais de banco, isolamento por linha provado      |
| T-016     | Design system com os quatro estados, contraste WCAG, regra de cor       |
| T-019     | Esqueleto do site (Next) e da API (Express)                             |
| T-007     | Banco de teste por arquivo, criado de molde e descartado no fim         |
| T-010     | Isolamento provado em TODA tabela de loja, por varredura do catálogo    |

### Próximo passo

**Grupo C** — as três dependem das migrações da T-004, que já entrou:

- **T-005** — guardas estruturais do banco (G1 a G9) no portão de qualidade
- ~~**T-006** — caminho único de acesso ao banco, com contexto por transação~~
  **concluída em 18/08:** `apps/api/src/core/db.ts` e `core/contexto.ts`, com
  AC-009, AC-010 e AC-011 provados contra o PostgreSQL de teste
- ~~**T-007** — banco de teste separado e efêmero~~ **concluída em 18/08**

- ~~**T-008** — dados de exemplo determinísticos~~ **concluída em 18/08:**
  `packages/database/seed/`, com AC-004, AC-036, AC-037 e AC-039 provados
  contra o PostgreSQL de teste (16 testes)

Depois: o resto do grupo D (T-009 construtores, T-010 prova de isolamento),
grupo E (T-011 a T-015), grupo F (T-020) e grupo G (T-017, T-018).
**Grupo D** — depende da T-006:

- ~~**T-010** — prova de isolamento entre lojas~~ **concluída em 18/08:**
  `apps/api/tests/isolamento-varredura.test.ts` descobre no catálogo do
  PostgreSQL toda tabela com identificador de loja e cobra as quatro operações
  de cada uma; `apps/api/tests/isolamento-concorrente.test.ts` leva a prova de
  AC-011 a quatro lojas, com escrita misturada com leitura

Depois: o resto do grupo D (T-008 seed, T-009 construtores), grupo E (T-011 a
T-015), grupo F (T-020) e grupo G (T-017, T-018).

**Grupo E** — as transversais da API:

- ~~**T-014** — trabalho em segundo plano com repetição~~ **concluída em 18/08:**
  `apps/api/src/jobs/`, com AC-025 e AC-026 provados contra o Redis real
  (5 testes no projeto `filas`) e mais 14 testes de unidade. A fila de e-mail
  está de pé de verdade; `webhook` e `impressao` ficam declaradas, e a de
  impressão é RECUSADA no Redis por `abrirFilaEmRedis`, com a decisão de 17/08
  na mensagem. Pendências novas: 25 a 30.
- ~~**T-013** — borda de validação, origens autorizadas e limite de
  tentativas~~ **concluída em 18/08:** `apps/api/src/core/validar.ts`,
  `core/cors.ts` e `core/limite.ts`, com AC-125, AC-126, AC-127, AC-128, AC-119
  e AC-120 provados por requisição de verdade contra Express montado (43 testes;
  o limite fala com o Redis de teste, no projeto novo `api-redis`). A costura
  com o auxiliar de rota da T-011 e a montagem do limite nas rotas de entrada
  continuam por fazer — ver as dívidas 26 e 32.

### Como subir o ambiente

```bash
bash infra/scripts/setup.sh   # cria infra/compose/.env.compose e o certificado
bash infra/scripts/up.sh      # sobe banco, cache, roteador, api e web
bash infra/scripts/verificar.sh  # o portão completo
```

## Dívidas abertas

0. **Cinco testes falham depois das migrações de catálogo e pedidos (18/08).**
   As 20 tabelas novas fizeram testes de cobertura reprovarem — e reprovarem
   certo: eles cobram que tabela existente esteja coberta. Vinte divergências
   foram corrigidas; estas cinco continuam:

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

- **Instabilidade do portão sob carga (aberta desde 18/08/2026, T-017).** A
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

<!-- portao-contornado:fim -->

## Teste intermitente do limite de tentativas (AC-119)

**Observado em 18/08/2026.** Durante uma regravação de provas, o critério AC-119
(excesso de tentativas para a mesma conta) reprovou uma vez e passou nas
execuções seguintes, isolado e em conjunto, sem nenhuma alteração no código.

Por que isto está anotado em vez de esquecido: teste que falha às vezes ensina o
time a reexecutar em vez de investigar, e a partir daí ele deixa de ser prova.
O critério trata de espera crescente entre tentativas, ou seja, depende de
tempo — a suspeita é de tolerância curta demais para uma máquina ocupada, e não
de defeito na regra.

**O que fazer:** rodar `pnpm vitest run --project cache-int apps/api/src/core/limite`
em laço e, se reproduzir, folgar a tolerância de tempo em vez de aumentar o
limite de repetições.

## Carrinho ainda não tem caminho de escrita para o cliente (T-500)

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
