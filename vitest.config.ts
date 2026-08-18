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
 * Quatro projetos, separados pelo que cada teste precisa para rodar:
 *
 * - `unit`    — nada além do processo. É o que responde em segundos.
 * - `web`     — componentes e regras do site, renderizados em texto.
 * - `api-int` — rotas da API contra banco de verdade, um banco por arquivo.
 * - `db-rls`  — migrações, políticas de isolamento e o próprio apoio de teste.
 *
 * A fronteira entre `unit` e os de integração é o banco: quem precisa dele mora
 * em `apps/api/tests/`, em `*.int.test.ts`, ou nos pacotes de banco e de apoio
 * a teste. Assim ninguém descobre por acidente que um teste "de unidade"
 * dependia de um PostgreSQL no ar.
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
          include: [
            "apps/api/tests/**/*.test.ts",
            "apps/api/src/**/*.int.test.ts",
          ],
          exclude: excluidos,
          setupFiles: preparacaoDeBanco,
          ...esperaDeIntegracao,
        },
      },
      {
        oxc: conversaoDeJsx,
        test: {
          name: "db-rls",
          include: [
            "packages/database/src/**/*.test.ts",
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
