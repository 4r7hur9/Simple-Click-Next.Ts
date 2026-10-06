import { configDefaults, defineConfig } from "vitest/config";

// O Next obriga `jsx: "preserve"` no tsconfig do site — ele reescreve a
// opção sozinho a cada build. Com isso o transformador do Vitest recebe JSX
// cru e falha ao ler o arquivo. Aqui declaramos a mesma conversão que o Next
// usa em produção (a automática do React), o que resolve sem somar
// dependência nenhuma (P-014).
//
// Fica numa constante porque projeto do Vitest NÃO herda a configuração de
// transformação da raiz: cada projeto declara a sua. Repetir a opção é o preço
// de os projetos existirem — apagá-la de um projeto deixa todo arquivo de
// componente daquele projeto ilegível.
const conversaoDeJsx = { jsx: { runtime: "automatic" as const } };

const excluidos = [
  ...configDefaults.exclude,
  "**/.next/**",
  // As telas de ponta a ponta são do Playwright (T-020) e quebram se o
  // Vitest tentar executá-las: mesmo sufixo de arquivo, outro executor.
  "e2e/**",
];

/**
 * Preparação que dá a cada arquivo de teste o seu banco descartável (AC-003).
 * Só os projetos que falam com o banco a carregam — o resto não paga por ela.
 */
const preparacaoDeBanco = ["./packages/testing/src/vitest-banco.ts"];

/** Teste que fala com o banco espera migração, cópia de molde e rede local. */
const esperaDeIntegracao = { testTimeout: 60_000, hookTimeout: 180_000 };

/**
 * Espera dos projetos sem serviço (`unit` e `web`). O padrão do Vitest é 5 s,
 * e numa máquina de quatro núcleos lógicos com Windows ele media a carga, não
 * o teste: com a suíte inteira em paralelo, ler os arquivos do site, importar
 * o `proxy.ts` do Next ou rodar um script de shell passava de 5 s sem nada
 * estar errado. Nenhum teste destes afirma tempo pela espera — quem cobra
 * tempo (AC-040) mede e afirma dentro do próprio teste.
 */
const esperaSemServico = { testTimeout: 60_000 };

/**
 * Cinco projetos, separados pelo que cada teste precisa para rodar:
 *
 * - `unit`    — nada além do processo. É o que responde em segundos.
 * - `web`     — componentes e regras do site, renderizados em texto.
 * - `api-int` — rotas da API contra banco de verdade, um banco por arquivo.
 * - `db-rls`  — migrações, políticas de isolamento e o próprio apoio de teste.
 * - `filas`   — trabalho em segundo plano contra o Redis de verdade.
 * Teste que fala com o Redis de verdade (T-015). Fica em projeto próprio, e não
 * dentro de `api-int`, porque o que ele precisa é OUTRO serviço: `api-int`
 * cria um banco descartável por arquivo, e cobrar um PostgreSQL de pé para
 * provar o cache faria o teste do cache falhar por um motivo que não é dele.
 */
const provaDeCache = ["**/*.redis.test.ts"];

/**
 * Quatro projetos, separados pelo que cada teste precisa para rodar:
 *
 * - `unit`      — nada além do processo. É o que responde em segundos.
 * - `web`       — componentes e regras do site, renderizados em texto.
 * - `api-int`   — rotas da API contra banco de verdade, um banco por arquivo.
 * - `db-rls`    — migrações, políticas de isolamento e o próprio apoio de teste.
 * - `cache-int` — o cache contra o Redis de verdade, sem banco nenhum.
 *
 * A fronteira entre `unit` e os de integração é a infraestrutura: quem precisa
 * de banco mora em `apps/api/tests/`, em `*.int.test.ts`, ou nos pacotes de
 * banco e de apoio a teste; quem precisa de Redis mora em
 * `apps/api/src/jobs/*.int.test.ts`. Assim ninguém descobre por acidente que um
 * teste "de unidade" dependia de um serviço no ar.
 */
export default defineConfig({
  oxc: conversaoDeJsx,
  test: {
    exclude: excluidos,
    // O arquivo de comparação nasce AO LADO do teste, e não em `__snapshots__`.
    // O motivo não é gosto: o Prettier normaliza markdown e reescreve
    // `__snapshots__` como negrito (`**snapshots**`), o que quebrou em silêncio
    // o caminho declarado na tarefa e fez a auditoria acusar o arquivo como
    // código que nenhum requisito atende. Sem underscore duplo, o caminho
    // sobrevive à formatação — e o mesmo vale para qualquer tarefa futura.
    resolveSnapshotPath: (caminhoDoTeste, extensao) =>
      caminhoDoTeste + extensao,
    projects: [
      {
        oxc: conversaoDeJsx,
        test: {
          name: "unit",
          ...esperaSemServico,
          // Roda DEPOIS dos outros projetos quando a suíte vem inteira. A prova
          // do gancho antes do registro (AC-040) mede o tempo do gancho de
          // verdade, e medido ao lado do ESLint e do jsdom das provas do site o
          // número dizia quanto a máquina estava ocupada, não quanto o gancho
          // custa a quem registra. No portão (`--project unit`) nada muda.
          sequence: { groupOrder: 1 },
          include: [
            "apps/api/src/**/*.test.ts",
            "packages/*/src/**/*.test.{ts,tsx}",
            "packages/*/tests/**/*.test.{ts,tsx,js}",
            "infra/tests/**/*.test.ts",
          ],
          exclude: [
            ...excluidos,
            ...provaDeCache,
            "apps/api/src/**/*.int.test.ts",
            // A prova da publicação contra um PostgreSQL de verdade (T-018)
            // mora em `db-rls`. Sem esta linha ela rodaria também aqui, onde
            // não há banco nenhum — e falharia por um motivo que não é dela.
            "infra/tests/**/*.int.test.ts",
            "packages/database/**",
            "packages/testing/**",
          ],
        },
      },
      {
        oxc: conversaoDeJsx,
        test: {
          // `agente` — o agente de impressão da loja (T-609) e o emulador de
          // impressora (T-610). Sem banco e sem Redis: a API é falsa e a
          // impressora é o emulador TCP subindo numa porta livre do próprio
          // processo. Projeto próprio porque o agente é um programa à parte,
          // com a rede local como dependência, e a linha vermelha do portão
          // diz logo que o problema é da impressão.
          name: "agente",
          include: ["apps/agente-impressao/src/**/*.test.ts"],
          exclude: excluidos,
          testTimeout: 20_000,
        },
      },
      {
        oxc: conversaoDeJsx,
        test: {
          name: "web",
          ...esperaSemServico,
          // O jsdom não implementa `matchMedia`, e componente que pergunta
          // sobre preferência do sistema estoura ao montar — com mensagem que
          // fala de uma função ausente, e não do componente.
          setupFiles: ["./apps/web/tests/preparo-navegador.ts"],
          include: [
            "apps/web/tests/**/*.test.{ts,tsx}",
            "apps/web/src/**/*.test.{ts,tsx}",
          ],
          exclude: [...excluidos, ...provaDeCache],
        },
      },
      {
        oxc: conversaoDeJsx,
        test: {
          name: "api-int",
          // A migração 0001 cria PAPÉIS, e papel é objeto do agrupamento, não
          // do banco. Dois arquivos deste projeto rodando ao mesmo tempo
          // disparam dois ALTER ROLE sobre a mesma linha do catálogo
          // compartilhado, e o PostgreSQL recusa com "tuple concurrently
          // updated" — a trava do aplicador de migrações não alcança isso,
          // porque ela é por banco e os bancos são distintos. Serializar só
          // aqui: os projetos de unidade e de tela seguem em paralelo.
          fileParallelism: false,
          include: [
            "apps/api/tests/**/*.test.ts",
            "apps/api/src/**/*.int.test.ts",
          ],
          // A fila fala com Redis, e não com PostgreSQL. Deixá-la aqui faria
          // cada arquivo dela pagar a criação de um banco descartável que
          // nenhum teste seu abriria — e ainda entrar nesta serialização, que
          // existe por causa das migrações.
          exclude: [...excluidos, ...provaDeCache, "apps/api/src/jobs/**"],
          setupFiles: preparacaoDeBanco,
          ...esperaDeIntegracao,
        },
      },
      {
        oxc: conversaoDeJsx,
        test: {
          // `filas` — trabalho em segundo plano contra o Redis de verdade
          // (AC-025, AC-026). Separado de `api-int` porque a dependência é
          // outra: aqui não há banco, e quando o portão reprova a primeira
          // linha vermelha já diz que o problema é de fila, não de PostgreSQL.
          //
          // Cada arquivo isola as próprias chaves num espaço de nomes só dele
          // (`prefixoDeTeste`), então os arquivos correm em paralelo sem um
          // consumir o trabalho do outro — inclusive entre árvores de trabalho
          // diferentes desta máquina, que dividem o mesmo Redis.
          name: "filas",
          include: ["apps/api/src/jobs/**/*.int.test.ts"],
          exclude: excluidos,
          // A espera crescente entre tentativas é o comportamento sob prova, e
          // ela leva segundos de propósito.
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      {
        oxc: conversaoDeJsx,
        test: {
          name: "db-rls",
          // A migração 0001 cria PAPÉIS, e papel é objeto do agrupamento, não
          // do banco. Dois arquivos deste projeto rodando ao mesmo tempo
          // disparam dois ALTER ROLE sobre a mesma linha do catálogo
          // compartilhado, e o PostgreSQL recusa com "tuple concurrently
          // updated" — a trava do aplicador de migrações não alcança isso,
          // porque ela é por banco e os bancos são distintos. Serializar só
          // aqui: os projetos de unidade e de tela seguem em paralelo.
          fileParallelism: false,
          include: [
            "packages/database/src/**/*.test.ts",
            // A carga de dados de exemplo (T-008) fala com o banco e mora fora
            // de `src/`: sem esta linha o arquivo dela não casaria com nenhum
            // projeto e deixaria de rodar em silêncio — que é o pior jeito de
            // um teste falhar.
            "packages/database/seed/**/*.test.ts",
            // A prova de que o esquema declarado cobre o banco (AC-044) mora
            // fora de `src/` porque não é código de produção — é verificação.
            "packages/database/tests/**/*.test.ts",
            "packages/testing/src/**/*.test.ts",
            "packages/testing/tests/**/*.test.ts",
            // A publicação aplica migração antes de trocar a versão (AC-029), e
            // provar isso exige um banco vazio de verdade. Mora aqui, e não em
            // `api-int`, pelo mesmo motivo que este projeto não corre em
            // paralelo: aplicar a 0001 num banco novo cria PAPÉIS, que são
            // objeto do agrupamento inteiro e não do banco.
            "infra/tests/**/*.int.test.ts",
          ],
          exclude: excluidos,
          setupFiles: preparacaoDeBanco,
          ...esperaDeIntegracao,
        },
      },
      {
        oxc: conversaoDeJsx,
        test: {
          name: "cache-int",
          include: ["apps/api/src/**/*.redis.test.ts"],
          exclude: excluidos,
          // OS DOIS ARQUIVOS DESTE PROJETO DISPUTAM O MESMO REDIS, e a disputa
          // não deixa um deles LENTO: deixa ele PARADO. Rodando sozinho,
          // `limite.redis.test.ts` passa em menos de dois segundos; junto do
          // teste de cache, um dos casos ficou 120 segundos sem terminar.
          //
          // A causa é o par (relógio de mentira dentro da aplicação, prazo de
          // validade de verdade no Redis) somado a duas conexões concorrentes
          // no mesmo índice: uma espera pela outra e nunca é acordada.
          //
          // Serializar os dois custa alguns segundos por execução e devolve o
          // portão. É o mesmo remédio que `api-int` usa, por causa diferente —
          // lá são papéis do PostgreSQL, aqui é o índice do Redis.
          fileParallelism: false,
          // O prazo de validade é aplicado pelo servidor, e provar que ele
          // vence exige esperar o relógio de verdade — poucos segundos, mas
          // acima do prazo padrão de um teste de unidade.
          testTimeout: 30_000,
        },
      },
    ],
  },
});
