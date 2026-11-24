import { describe, expect, it } from "vitest";

import {
  rotuloDoAto,
  rotuloDoPapel,
} from "../src/features/admin/trilha-na-tela.ts";

describe("a trilha da administração permanente (card #3)", () => {
  it("[CA-18] o ato e o papel do sistema aparecem em português, sem código cru", () => {
    expect(rotuloDoAto("ADMINISTRACAO_PERMANENTE_CRIADA")).toBe(
      "Administração permanente criada no deploy",
    );
    expect(rotuloDoPapel("SYSTEM")).toBe("sistema");
  });
});
