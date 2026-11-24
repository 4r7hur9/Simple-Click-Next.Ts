import { describe, expect, it } from "vitest";

import { ATOS_SENSIVEIS, atoSensivel } from "./trilha.ts";

describe("trilha da plataforma (card #3)", () => {
  it("[CA-18] a criação da administração permanente é ato sensível, destacado sempre", () => {
    expect(ATOS_SENSIVEIS.has("ADMINISTRACAO_PERMANENTE_CRIADA")).toBe(true);
    expect(atoSensivel("ADMINISTRACAO_PERMANENTE_CRIADA", null)).toBe(true);
  });
});
