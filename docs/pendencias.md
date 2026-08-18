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

**Grupo D** — depende da T-006:

- ~~**T-010** — prova de isolamento entre lojas~~ **concluída em 18/08:**
  `apps/api/tests/isolamento-varredura.test.ts` descobre no catálogo do
  PostgreSQL toda tabela com identificador de loja e cobra as quatro operações
  de cada uma; `apps/api/tests/isolamento-concorrente.test.ts` leva a prova de
  AC-011 a quatro lojas, com escrita misturada com leitura

Depois: o resto do grupo D (T-008 seed, T-009 construtores), grupo E (T-011 a
T-015), grupo F (T-020) e grupo G (T-017, T-018).

### Como subir o ambiente

```bash
bash infra/scripts/setup.sh   # cria infra/compose/.env.compose e o certificado
bash infra/scripts/up.sh      # sobe banco, cache, roteador, api e web
bash infra/scripts/verificar.sh  # o portão completo
```

## Dívidas abertas

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

14. **A varredura de isolamento cobre o papel `OWNER`, e só ele.**
    `apps/api/tests/isolamento-varredura.test.ts` prova as quatro operações com
    a requisição no papel de dono, que é o eixo de isolamento por loja. O
    segundo eixo — o do comprador, que enxerga a própria linha em qualquer loja
    (`sc_self_select` em `store_customers`) — não é exercitado pela varredura, e
    é justamente onde a modelagem registra o porteiro de papel como obrigatório.
    Quando a feature `identidade-acesso` entrar, vale estender a varredura com
    uma segunda passada no papel `CUSTOMER`, provando que ele NÃO enxerga a
    linha de outra pessoa na mesma loja.

15. **A varredura mira a linha por chave de UMA coluna.** O construtor de cada
    tabela declara `chave: "id"` (ou `store_id`), e as tentativas de alteração e
    remoção montam `WHERE <chave>::text = $1`. Nenhuma tabela de hoje tem chave
    primária composta; a primeira que tiver vai precisar que o construtor passe
    a aceitar mais de uma coluna. Não é armadilha silenciosa: sem construtor a
    varredura reprova, e com construtor incompleto o teste quebra na hora.

16. **`packages/database` não passa na verificação de tipos, e isso já vinha de
    antes.** `pnpm typecheck` reprova em `packages/database/src/guards.ts:320`
    com incompatibilidade entre o módulo `pg` real e o tipo `ModuloPg` declarado
    ali (`connect()` devolve `Promise<Client>`, não `Promise<void>`). Foi
    conferido na árvore principal, sem nenhuma alteração desta tarefa: o defeito
    é anterior. Passa despercebido porque `infra/scripts/verificar.sh` não roda
    a verificação de tipos — só formatação, qualidade de código, testes,
    auditoria e guardas. Duas coisas para a T-017, quando o portão for
    consolidado: corrigir a assinatura em `guards.ts` e ACRESCENTAR
    `pnpm typecheck` ao portão, senão o próximo erro de tipo também vai passar.

17. **`@types/pg` estava em duas versões no monorepo.** `packages/testing`
    declarava `8.15.6` enquanto `packages/database` e `apps/api` já usavam
    `8.21.0`, e a divergência fazia o MESMO `pg.Client` ser dois tipos
    incompatíveis — o cliente devolvido por `conectarNoBancoDoArquivo()` não
    servia numa variável tipada pelo `pg` da API. Alinhado em 18/08 para
    `8.21.0` nos três. Se alguém acrescentar um pacote novo que fale com o
    banco, alinhe também — ou o catálogo do `pnpm-workspace.yaml` passa a ser o
    lugar certo para essa versão.

18. **`apps/api/tsconfig.json` deixou de declarar `rootDir`.** Ele foi para
    `tsconfig.build.json`, que é quem gera `dist/`. O motivo: `rootDir: "src"`
    barrava `apps/api/tests/`, e teste que a verificação de tipos não olha é
    teste que compila errado sem ninguém saber. A geração continua idêntica
    (`pnpm --filter @simpleclick/api run build` confere), e `tests/` entrou na
    lista de exclusão da geração — teste em imagem de produção só carrega peso.

## Portão contornado

Nenhuma vez até agora. Quando acontecer (`LEFTHOOK=0 git push`), registre aqui a
data, o motivo e o que ficou sem verificação — é o que exige o critério AC-043.
