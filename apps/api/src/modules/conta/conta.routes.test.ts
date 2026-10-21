import { describe, expect, it } from "vitest";

import { cpfValido } from "./conta.routes.ts";

describe("CPF da conta", () => {
  it("aceita um CPF com verificadores certos", () => {
    expect(cpfValido("52998224725")).toBe(true);
  });
  it("recusa verificador errado, repetido e tamanho errado", () => {
    expect(cpfValido("52998224724")).toBe(false);
    expect(cpfValido("11111111111")).toBe(false);
    expect(cpfValido("123")).toBe(false);
  });
});
