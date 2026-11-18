// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { lerDaFeature } from "./apoio-painel-lojista.ts";

describe("painel · primeiros passos", () => {
  it("[CA-1] @spec:AC-11237 o tutorial acha o menu pela marca própria e mantém os atalhos do celular", () => {
    const passos = lerDaFeature("tutorial/passos.ts");
    expect(passos).toContain('aside[data-tutorial="menu-do-painel"]');
    expect(passos).toContain('nav[aria-label="Atalhos"]');
    expect(passos).not.toContain('data-tema="escuro"');
  });

  it("[CA-2] @spec:AC-11229 o tutorial usa a cor do SimpleClick, sem verde próprio nem a cor da loja", () => {
    const css = lerDaFeature("tutorial/tutorial.css");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toContain("--cor-marca");
    expect(css).toContain("var(--cor-primaria)");
  });
});
