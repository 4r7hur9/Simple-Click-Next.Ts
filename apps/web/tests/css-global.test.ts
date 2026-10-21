import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  fileURLToPath(new URL("../src/app/globals.css", import.meta.url)),
  "utf8",
);

describe("base global da interface", () => {
  it("@spec:AC-947 herda documento, tipografia, controles, seleção e foco dos tokens", () => {
    expect(CSS).toContain("min-width: 344px");
    expect(CSS).toContain("font-family: var(--fonte-titulo)");
    expect(CSS).toContain("font-family: var(--fonte-base)");
    expect(CSS).toContain("background-color: var(--cor-superficie-alta)");
    expect(CSS).toContain("outline: 2px solid var(--cor-foco)");
    expect(CSS).toContain("::selection");
    expect(CSS).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("@spec:AC-943 @spec:AC-950 entrega ações opacas e superfícies sólidas", () => {
    expect(CSS).toMatch(
      /button\s*\{[\s\S]*?background-color: var\(--cor-primaria\)/,
    );
    expect(CSS).not.toMatch(
      /backdrop-filter|linear-gradient|radial-gradient|background-color:\s*transparent/i,
    );
  });

  it("@spec:AC-951 mantém texto livre e limita o raio de botão a 6px sem pílulas", () => {
    expect(CSS).toContain("border-radius: var(--raio-botao)");
    expect(CSS).not.toContain("--raio-completo");
    expect(CSS).not.toMatch(/border-radius:\s*999/);
  });

  it("controles nativos na paleta: verde da marca, nada do azul do sistema", () => {
    expect(CSS).toMatch(/:root\s*\{[^}]*accent-color: var\(--cor-primaria\)/);
    expect(CSS).toMatch(/\[data-tema="escuro"\]\s*\{\s*color-scheme: dark/);
    expect(CSS).toMatch(
      /:-webkit-autofill[\s\S]*?-webkit-text-fill-color: var\(--cor-tinta\)/,
    );
    expect(CSS).toContain("::file-selector-button");
    expect(CSS).toMatch(/dialog::backdrop\s*\{[^}]*var\(--cor-sobreposicao\)/);
  });
});
