// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { lerDaFeature } from "./apoio-painel-lojista.ts";

describe("painel · configurações", () => {
  it("[CA-1] @spec:AC-11241 a navegação das configurações segue o que a administração liga", () => {
    const nav = lerDaFeature("config/NavegacaoDaConfiguracao.tsx");
    expect(nav).toContain("useNavegacaoDaConfiguracao");
    expect(lerDaFeature("painel/MenuDoPainel.tsx")).toContain(
      "useNavegacaoDaConfiguracao",
    );
  });
});
