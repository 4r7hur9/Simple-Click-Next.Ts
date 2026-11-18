// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { lerDaFeature } from "./apoio-painel-lojista.ts";

describe("painel · feed, stories e comentários", () => {
  it("[CA-1] @spec:AC-11204 os controles continuam condicionados à permissão", () => {
    expect(lerDaFeature("stories-painel/TelaDeStories.tsx")).toMatch(
      /perfil\.podeTrocarFoto\s*\?/,
    );
    expect(lerDaFeature("comentarios/TelaDeComentarios.tsx")).toMatch(
      /podeConfigurar\s*\?/,
    );
  });
});
