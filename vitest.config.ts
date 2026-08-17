import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  // O Next obriga `jsx: "preserve"` no tsconfig do site — ele reescreve a
  // opção sozinho a cada build. Com isso o transformador do Vitest recebe JSX
  // cru e falha ao ler o arquivo. Aqui declaramos a mesma conversão que o Next
  // usa em produção (a automática do React), o que resolve sem somar
  // dependência nenhuma (P-014).
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    exclude: [
      ...configDefaults.exclude,
      "**/.next/**",
      // As telas de ponta a ponta são do Playwright (T-020) e quebram se o
      // Vitest tentar executá-las: mesmo sufixo de arquivo, outro executor.
      "e2e/**",
    ],
  },
});
