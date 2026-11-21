/**
 * O modo de produção não lê o `.env` da máquina (card #137, achado 8).
 *
 * O `.env` da raiz é o de DESENVOLVIMENTO. Se o `start` o carregasse, um
 * arquivo esquecido no servidor preencheria em silêncio a variável que o
 * deploy não definiu (banco, segredo, URL do site) e a API subiria apontando
 * para o lugar errado, em vez de recusar a partida (AC-002). Só o `dev` lê o
 * arquivo; a imagem roda o `dist` direto e nem recebe o `.env` no contexto.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..", "..");
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf8");

describe("[CA-8] produção sem .env", () => {
  const scripts = (
    JSON.parse(ler("apps/api/package.json")) as {
      scripts: Record<string, string>;
    }
  ).scripts;

  it("o start da API não carrega arquivo de ambiente; o dev continua carregando", () => {
    expect(scripts["start"]).toBe("node dist/main.js");
    expect(scripts["start"]).not.toMatch(/env-file/);
    expect(scripts["dev"]).toMatch(/--env-file-if-exists=\.\.\/\.\.\/\.env/);
  });

  it("a imagem da API roda o dist direto, sem .env, e o .env não entra no contexto do build", () => {
    const dockerfile = ler("apps/api/Dockerfile");
    expect(dockerfile).toMatch(
      /^CMD \["node", "apps\/api\/dist\/main\.js"\]$/m,
    );
    expect(dockerfile).not.toMatch(/env-file/);
    const ignorados = ler(".dockerignore")
      .split("\n")
      .map((linha) => linha.trim());
    expect(ignorados).toContain(".env");
    expect(ignorados).toContain(".env.*");
  });
});
