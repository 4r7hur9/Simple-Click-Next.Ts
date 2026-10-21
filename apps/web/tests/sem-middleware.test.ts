import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const RAIZ_DO_SITE = fileURLToPath(new URL("../", import.meta.url));

/**
 * Onde o Next 15 procurava o interceptador de requisição. No Next 16 esses
 * caminhos deixaram de ser lidos — e o pior: sem erro, sem aviso, sem nada.
 */
const CAMINHOS_IGNORADOS_PELO_NEXT_16 = [
  "middleware.ts",
  "middleware.js",
  "src/middleware.ts",
  "src/middleware.js",
];

describe("armadilha silenciosa do Next 16", () => {
  it("@spec:AC-001 não existe middleware.ts, que o Next 16 ignoraria sem avisar", () => {
    const encontrados = CAMINHOS_IGNORADOS_PELO_NEXT_16.filter((caminho) =>
      existsSync(join(RAIZ_DO_SITE, caminho)),
    );

    // Um arquivo desses no repositório parece funcionar, passa em revisão e
    // nunca roda: o link antigo da loja simplesmente não redirecionaria.
    expect(encontrados).toEqual([]);
  });

  it("@spec:AC-001 o redirecionamento do apelido antigo mora em src/proxy.ts, que é o arquivo lido", async () => {
    expect(existsSync(join(RAIZ_DO_SITE, "src/proxy.ts"))).toBe(true);

    const modulo = await import("../src/proxy");

    expect(typeof modulo.default).toBe("function");
    expect(modulo.config.matcher.length).toBeGreaterThan(0);
  });
});
