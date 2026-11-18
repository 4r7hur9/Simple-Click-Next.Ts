// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { lerDaFeature } from "./apoio-painel-lojista.ts";

describe("painel · equipe", () => {
  it("[CA-1] @spec:AC-11240 senhas mantêm tipo e preenchimento automático", () => {
    const equipe = lerDaFeature("equipe/PainelDaEquipe.tsx");
    expect(equipe.match(/type="password"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(equipe.match(/autoComplete="new-password"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
