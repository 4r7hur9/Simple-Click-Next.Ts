import { describe, expect, it } from "vitest";

import { ProtecaoContraTentativas } from "../src/modules/auth/lockout.ts";

describe("limite de login na borda da API", () => {
  it("@spec:AC-120 recusa excesso por origem com 429 e usa o endereço real informado pela borda confiável", () => {
    const protecao = new ProtecaoContraTentativas({
      agora: () => new Date("2026-08-23T12:00:00.000Z"),
      limitePorOrigemPorMinuto: 2,
    });

    expect(
      protecao.verificar({
        contaId: "conta-a",
        enderecoDaBorda: "10.0.0.8",
        enderecoRealInformadoPelaBorda: "198.51.100.10",
      }),
    ).toEqual({ status: "PERMITIDA" });
    expect(
      protecao.verificar({
        contaId: "conta-b",
        enderecoDaBorda: "10.0.0.8",
        enderecoRealInformadoPelaBorda: "198.51.100.10",
      }),
    ).toEqual({ status: "PERMITIDA" });

    expect(
      protecao.verificar({
        contaId: "conta-c",
        enderecoDaBorda: "10.0.0.8",
        enderecoRealInformadoPelaBorda: "198.51.100.10",
      }),
    ).toEqual({ status: "ORIGEM_LIMITADA", statusHttp: 429 });

    // A mesma conexão da borda, mas outro endereço real, não herda o limite.
    expect(
      protecao.verificar({
        contaId: "conta-d",
        enderecoDaBorda: "10.0.0.8",
        enderecoRealInformadoPelaBorda: "198.51.100.11",
      }),
    ).toEqual({ status: "PERMITIDA" });
  });
});
