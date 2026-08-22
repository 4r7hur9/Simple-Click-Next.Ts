import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TOKENS = readFileSync(
  fileURLToPath(new URL("../src/app/tokens.css", import.meta.url)),
  "utf8",
);
const GLOBAL = readFileSync(
  fileURLToPath(new URL("../src/app/globals.css", import.meta.url)),
  "utf8",
);

describe("API semântica do Tailwind", () => {
  it("@spec:AC-946 expõe cor, fonte, espaço, raio e sombra via @theme inline", () => {
    expect(TOKENS).toContain("@theme inline");
    for (const alias of [
      "--color-primaria: var(--cor-primaria)",
      "--color-fundo: var(--cor-fundo)",
      "--font-sans: var(--fonte-base)",
      "--font-display: var(--fonte-titulo)",
      "--spacing: var(--espaco-1)",
      "--radius-button: var(--raio-botao)",
      "--shadow-md: var(--sombra-2)",
    ]) {
      expect(TOKENS).toContain(alias);
    }
    expect(TOKENS).toContain("transition: var(--transicao-rapida)");
  });

  it("@spec:AC-946 @spec:AC-948 não cria paleta ou configuração Tailwind paralela", () => {
    expect(TOKENS).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(GLOBAL.indexOf('@import "tailwindcss"')).toBeLessThan(
      GLOBAL.indexOf('@import "./tokens.css"'),
    );
  });
});
