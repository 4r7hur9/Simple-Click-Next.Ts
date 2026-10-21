import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A cor de destaque é do dono: o CSS da vitrine não pode ter o verde-click
 * escrito direto, só as variáveis `--cor-marca`, `--cor-sobre-marca` e
 * `--cor-marca-texto`, que a loja redefine no envelope do tema.
 */
const FOLHAS = ["vitrine", "narrativa", "produto", "fechamento", "sobre"];

describe("a folha de estilo da loja usa a cor de destaque do dono", () => {
  for (const nome of FOLHAS) {
    it(`${nome}.css não escreve o verde fixo`, () => {
      const css = readFileSync(
        new URL(`../../../packages/ui/styles/${nome}.css`, import.meta.url),
        "utf8",
      );
      expect(css).not.toContain("--marca-verde-click");
      expect(css.toLowerCase()).not.toContain("#b7ff00");
      expect(css).toContain("--cor-marca");
    });
  }

  it("o padrão das variáveis é o verde SimpleClick", () => {
    const tema = readFileSync(
      new URL("../../../packages/ui/styles/theme.css", import.meta.url),
      "utf8",
    );
    expect(tema).toContain("--cor-marca: var(--marca-verde-click);");
  });
});
