import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const LAYOUT = readFileSync(
  fileURLToPath(new URL("../src/app/layout.tsx", import.meta.url)),
  "utf8",
);

describe("tipografia oficial", () => {
  it("@spec:AC-942 carrega Space Grotesk e Inter pelo next/font com variáveis globais", () => {
    expect(LAYOUT).toContain(
      'import { Inter, Space_Grotesk } from "next/font/google"',
    );
    expect(LAYOUT).toMatch(
      /Space_Grotesk\(\{[\s\S]*?display: "swap",[\s\S]*?variable: "--fonte-titulo-da-marca"/,
    );
    expect(LAYOUT).toMatch(
      /Inter\(\{[\s\S]*?display: "swap",[\s\S]*?variable: "--fonte-corpo"/,
    );
    expect(LAYOUT).toContain("tituloDaMarca.variable");
    expect(LAYOUT).toContain("textoDaMarca.variable");
  });

  it("@spec:AC-942 não instala Asectica nem mantém as fontes provisórias na interface", () => {
    expect(LAYOUT).not.toMatch(/Asectica|Bricolage_Grotesque|Manrope/);
  });
});
