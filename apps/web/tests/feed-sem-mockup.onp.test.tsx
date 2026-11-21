/**
 * Card #106, T-10609/T-10610: nada do mockup nem de função "A decidir" no
 * Início, e metadados próprios sem dado de conta.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(process.cwd(), "apps", "web", "src");
const PASTA = join(RAIZ, "features", "feed");
const CODIGO = readdirSync(PASTA)
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => readFileSync(join(PASTA, f), "utf8"))
  .join("\n");

describe("início sem o mockup", () => {
  it.each([
    "Universokar",
    "Entrega Flash",
    "Suporte 24h",
    "45 min",
    "Sem taxas ocultas",
    "Mais vendidos",
    "Em alta",
    "TOP OFERTA",
    "Top oferta",
  ])("[CA-28] @spec:AC-10628 não existe %s", (texto) => {
    expect(CODIGO).not.toContain(texto);
  });

  it("[CA-27] @spec:AC-10627 sem nota de loja com estrela nem selo", () => {
    expect(CODIGO).not.toMatch(/nota da loja|selo de loja|4\.8/i);
  });
});

describe("metadados do início", () => {
  const ler = (...c: string[]) => readFileSync(join(RAIZ, "app", "(explorar)", "explorar", ...c), "utf8");

  it("[CA-30] @spec:AC-10630 produtos e lojas têm título, descrição e endereço canônico", () => {
    for (const arquivo of [["produtos", "page.tsx"], ["lojas", "page.tsx"]]) {
      const t = ler(...arquivo);
      expect(t).toContain("canonical");
      expect(t).toContain("description");
    }
  });

  it("[CA-29] @spec:AC-10629 /explorar não redireciona mais: é a vitrine mista (card #152)", () => {
    expect(ler("page.tsx")).not.toContain("redirect(");
    expect(ler("page.tsx")).toContain("inicio: true");
  });
});
