import { describe, expect, it } from "vitest";

import { mascararTelefone } from "./acompanhar.usecase.ts";

describe("acompanhamento público", () => {
  it("@spec:AC-615 mascara o telefone do cliente", () => {
    expect(mascararTelefone("+5511998765432")).toBe("••••••5432");
    expect(mascararTelefone("123")).toBe("••••");
  });
});
