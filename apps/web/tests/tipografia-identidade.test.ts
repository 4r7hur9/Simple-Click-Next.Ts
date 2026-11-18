import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const LAYOUT = readFileSync(
  fileURLToPath(new URL("../src/app/layout.tsx", import.meta.url)),
  "utf8",
);

describe("tipografia oficial", () => {
  it("@spec:AC-942 carrega a família da marca pelo next/font com variáveis globais", () => {
    // Decisão Q-10401 (redesign Stitch): Plus Jakarta Sans substitui Space
    // Grotesk e Inter nas telas; as duas antigas ficam só para a landing.
    expect(LAYOUT).toContain(
      'import { Inter, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google"',
    );
    expect(LAYOUT).toMatch(
      /Plus_Jakarta_Sans\(\{[\s\S]*?display: "swap",[\s\S]*?variable: "--fonte-titulo-da-marca"/,
    );
    expect(LAYOUT).toContain("tituloDaMarca.variable");
  });

  it("@spec:AC-942 não instala Asectica nem mantém as fontes provisórias na interface", () => {
    expect(LAYOUT).not.toMatch(/Asectica|Bricolage_Grotesque|Manrope/);
  });
});
