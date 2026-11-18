import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Fonte do redesign Stitch (card #104, T-10402): Plus Jakarta Sans global por
 * `next/font`, com a landing "/" congelada em Space Grotesk e Inter.
 */

const ler = (caminho: string): string =>
  readFileSync(fileURLToPath(new URL(caminho, import.meta.url)), "utf8");

const LAYOUT = ler("../src/app/layout.tsx");
const GLOBAL = ler("../src/app/globals.css");
const TOKENS = ler("../src/app/tokens.css");

describe("fonte da base visual", () => {
  it("[CA-21] @spec:AC-10403 Plus Jakarta Sans preenche as variáveis da marca, sem pesos e sem CDN", () => {
    expect(LAYOUT).toMatch(
      /Plus_Jakarta_Sans\(\{[\s\S]*?display: "swap",[\s\S]*?variable: "--fonte-titulo-da-marca"/,
    );
    expect(GLOBAL).toMatch(/--fonte-corpo:\s*var\(--fonte-titulo-da-marca\)/);
    expect(LAYOUT).not.toMatch(/googleapis|gstatic|<link[^>]+fonts/i);
  });

  it("[CA-21] @spec:AC-10403 Space Grotesk e Inter ficam só como legadas, sem pré-carga", () => {
    expect(LAYOUT).toMatch(
      /Space_Grotesk\(\{[\s\S]*?preload: false,[\s\S]*?variable: "--fonte-legada-titulo"/,
    );
    expect(LAYOUT).toMatch(
      /Inter\(\{[\s\S]*?preload: false,[\s\S]*?variable: "--fonte-legada-corpo"/,
    );
    for (const classe of [
      "tituloDaMarca.variable",
      "tituloLegado.variable",
      "textoLegado.variable",
    ]) {
      expect(LAYOUT).toContain(classe);
    }
  });

  it("[CA-21] @spec:AC-10403 a landing redefine as quatro variáveis de fonte para as antigas", () => {
    const bloco = GLOBAL.match(/body:has\(\.sc-lp-topo\)\s*\{([\s\S]*?)\n\}/);
    expect(bloco, "regra da landing em globals.css").not.toBeNull();
    const corpo = bloco?.[1] ?? "";
    expect(corpo).toMatch(
      /--fonte-titulo-da-marca:\s*var\(--fonte-legada-titulo\)/,
    );
    expect(corpo).toMatch(/--fonte-corpo:\s*var\(--fonte-legada-corpo\)/);
    expect(corpo).toMatch(/--fonte-titulo:\s*var\(--fonte-legada-titulo\)/);
    expect(corpo).toMatch(/--fonte-base:\s*var\(--fonte-legada-corpo\)/);
  });

  it("[CA-21] @spec:AC-10403 o viewport cobre a área segura do aparelho", () => {
    expect(LAYOUT).toMatch(/viewportFit:\s*"cover"/);
  });

  it("[CA-21] @spec:AC-10403 o Tailwind enxerga a escala tipográfica e os pesos novos, sem cor literal", () => {
    for (const papel of [
      "titulo-xl",
      "titulo-lg",
      "titulo-md",
      "titulo-sm",
      "corpo-lg",
      "corpo-md",
      "corpo-sm",
      "rotulo-lg",
      "rotulo-sm",
      "preco",
    ]) {
      expect(TOKENS).toContain(`--text-${papel}: var(--tipo-${papel}-tamanho)`);
      expect(TOKENS).toContain(
        `--text-${papel}--line-height: var(--tipo-${papel}-altura)`,
      );
    }
    expect(TOKENS).toContain("--font-weight-bold: var(--peso-negrito)");
    expect(TOKENS).toContain("--font-weight-extrabold: var(--peso-extra)");
    expect(TOKENS).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});
