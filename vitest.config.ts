import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  // O Next obriga `jsx: "preserve"` no tsconfig do site — ele reescreve a
  // opção sozinho a cada build. Com isso o transformador do Vitest recebe JSX
  // cru e falha ao ler o arquivo. Aqui declaramos a mesma conversão que o Next
  // usa em produção (a automática do React), o que resolve sem somar
  // dependência nenhuma (P-014).
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    // As suítes que provam o banco criam cada uma o seu banco descartável, mas
    // a migração 0001 cria PAPÉIS — e papel é objeto do agrupamento, não do
    // banco. Duas suítes rodando ao mesmo tempo disparam dois `ALTER ROLE`
    // simultâneos sobre a mesma linha do catálogo compartilhado, e o PostgreSQL
    // recusa com "tuple concurrently updated". A trava do aplicador de
    // migrações não alcança isso: ela é por banco, e os bancos são distintos.
    //
    // Serializar por arquivo custou 7,3 s contra 2,8 s aqui — preço baixo por
    // uma suíte que não falha de forma intermitente. Quando a T-007 dividir a
    // configuração em projetos, a serialização pode ficar só no projeto de
    // banco, e o resto volta a rodar em paralelo.
    fileParallelism: false,
    exclude: [
      ...configDefaults.exclude,
      "**/.next/**",
      // As telas de ponta a ponta são do Playwright (T-020) e quebram se o
      // Vitest tentar executá-las: mesmo sufixo de arquivo, outro executor.
      "e2e/**",
    ],
  },
});
