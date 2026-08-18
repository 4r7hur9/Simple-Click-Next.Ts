import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Configuração usada apenas pelas provas de `db-test.test.ts`.
 *
 * Ela existe porque duas garantias do banco efêmero só são demonstráveis de
 * fora do processo: que o banco é apagado mesmo quando o teste FALHA, e que
 * rodar a suíte duas vezes seguidas dá o mesmo resultado. Para provar isso é
 * preciso executar uma suíte de verdade, do começo ao fim, e olhar o que
 * sobrou no servidor depois.
 *
 * Os arquivos daqui terminam em `.prova.ts` e não em `.test.ts` de propósito:
 * a suíte do projeto não pode recolhê-los, porque um deles falha por desenho.
 *
 * A raiz é fixada nesta pasta porque o padrão do Vitest é o diretório de onde
 * o comando foi chamado — e quem chama é a suíte, lá da raiz do repositório.
 */
export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["*.prova.ts"],
    setupFiles: ["../src/vitest-banco.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
