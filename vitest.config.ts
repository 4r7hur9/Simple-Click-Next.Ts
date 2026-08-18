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
 * Cinco projetos, separados pelo que cada teste precisa para rodar:
 *
 * - `unit`    — nada além do processo. É o que responde em segundos.
 * - `web`     — componentes e regras do site, renderizados em texto.
 * - `api-int` — rotas da API contra banco de verdade, um banco por arquivo.
 * - `db-rls`  — migrações, políticas de isolamento e o próprio apoio de teste.
 * - `filas`   — trabalho em segundo plano contra o Redis de verdade.
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
    projects: [
      {
        oxc: conversaoDeJsx,
        test: {
          name: "unit",
          include: [
            "apps/api/src/**/*.test.ts",
            "packages/*/src/**/*.test.{ts,tsx}",
            "packages/*/tests/**/*.test.{ts,tsx,js}",
            "infra/tests/**/*.test.ts",
          ],
          exclude: [
            ...excluidos,
            "apps/api/src/**/*.int.test.ts",
            "packages/database/**",
            "packages/testing/**",
          ],
        },
      },
      {
        oxc: conversaoDeJsx,
        test: {
          name: "web",
          include: [
            "apps/web/tests/**/*.test.{ts,tsx}",
            "apps/web/src/**/*.test.{ts,tsx}",
          ],
          exclude: excluidos,
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
          exclude: [...excluidos, "apps/api/src/jobs/**"],
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
            "packages/testing/src/**/*.test.ts",
            "packages/testing/tests/**/*.test.ts",
          ],
          exclude: excluidos,
          setupFiles: preparacaoDeBanco,
          ...esperaDeIntegracao,
        },
      },
    ],
  },
});
