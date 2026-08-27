/**
 * O ponta a ponta do SimpleClick (AC-016).
 *
 * ELE SOBE O AMBIENTE SOZINHO. A API e o site são iniciados pelo próprio
 * Playwright, contra o PostgreSQL e o Redis que a composição local já mantém no
 * ar. Sem isso, todo cenário viraria "roda se você lembrar de subir duas
 * coisas" — e teste que depende de memória não é rede de segurança.
 *
 * NÃO ENTRA NO PORTÃO, e é decisão consciente: o portão roda a cada envio e
 * precisa responder em menos de um minuto; navegador de verdade custa dezenas
 * de segundos e exige o ambiente no ar. O lugar dele é o comando dedicado
 * (`pnpm test:e2e`), rodado antes de publicar e quando se mexe em fluxo.
 *
 * AS ORIGENS SÃO AS DO AMBIENTE LOCAL, e não as do domínio de produção: o
 * carrinho depende de um cookie que a API emite, e a lista fechada de origens
 * (`core/cors.ts`) precisa conhecer de onde o site chama. Sem isso, todo POST
 * do cliente responde 403 — corretamente, e o cenário reprovaria por motivo
 * que não é o dele.
 */
import { defineConfig, devices } from "@playwright/test";

/**
 * O ambiente do REPOSITÓRIO, carregado antes de tudo.
 *
 * Os cenários montam a loja de teste falando com o banco direto, e para isso
 * precisam da cadeia de conexão. Sem esta linha, o processo do Playwright não
 * a tem — e a montagem falha com uma mensagem sobre variável ausente, que é
 * clara, mas evitável.
 *
 * `try` porque a ausência do arquivo não deve derrubar a configuração inteira:
 * quem roda em ambiente com as variáveis já no processo não tem `.env`.
 */
try {
  process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
} catch {
  // Sem arquivo: vale o que já estiver no ambiente.
}

/** Onde o site atende durante o ponta a ponta. */
export const ENDERECO_DO_SITE = "http://localhost:3100";

/** Onde a API atende durante o ponta a ponta. */
export const ENDERECO_DA_API = "http://localhost:3101";

export default defineConfig({
  testDir: "./specs",
  // Um cenário que depende de outro é um cenário que mente quando roda
  // sozinho. Cada arquivo monta o que precisa.
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: ENDERECO_DO_SITE,
    // O rastro só é guardado quando algo reprova: guardar sempre enche o disco
    // e ninguém olha; guardar na falha é o que se abre para entender.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "publico",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // A MENOR LARGURA SUPORTADA é ponto de quebra do produto (P-012), e não
      // um extra: o dobrável fechado tem 344px, e é onde o estouro horizontal
      // aparece primeiro.
      name: "celular",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 344, height: 882 },
      },
    },
  ],
  webServer: [
    {
      // `--env-file` porque a API valida o ambiente na PARTIDA (AC-002): sem
      // as cadeias de conexão ela recusa subir, e recusa certo. O Playwright
      // não carrega `.env` sozinho, e sem esta linha o site sobe, responde, e
      // devolve 404 em toda loja — um sintoma que parece de rota e é de banco.
      command: "node --env-file=.env apps/api/src/main.ts",
      cwd: "..",
      url: `${ENDERECO_DA_API}/`,
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
      env: {
        PORT: "3101",
        API_PORT: "3101",
        ORIGENS_PERMITIDAS: ENDERECO_DO_SITE,
        URL_DO_SITE: ENDERECO_DO_SITE,
      },
    },
    {
      command: "pnpm --filter @simpleclick/web exec next dev -p 3100",
      cwd: "..",
      url: ENDERECO_DO_SITE,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      env: { NEXT_PUBLIC_API_URL: ENDERECO_DA_API },
    },
  ],
});
