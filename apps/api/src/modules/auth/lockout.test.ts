import { describe, expect, it, vi } from "vitest";

import { ProtecaoContraTentativas } from "./lockout.ts";

describe("Proteção contra tentativas de login", () => {
  it("@spec:AC-119 bloqueia a conta após dez falhas, informa a espera, aumenta o próximo bloqueio e avisa o dono", async () => {
    const avisarDono = vi.fn().mockResolvedValue(undefined);
    let agora = new Date("2026-08-23T12:00:00.000Z");
    const protecao = new ProtecaoContraTentativas({
      avisarDono,
      agora: () => agora,
    });
    const contaId = "conta-1";

    for (let tentativa = 0; tentativa < 9; tentativa += 1) {
      await expect(protecao.registrarFalha(contaId)).resolves.toEqual({
        status: "PERMITIDA",
      });
    }

    await expect(protecao.registrarFalha(contaId)).resolves.toMatchObject({
      status: "CONTA_BLOQUEADA",
      esperaEmMs: 60_000,
    });
    expect(avisarDono).toHaveBeenCalledWith({
      contaId,
      bloqueadoAte: new Date("2026-08-23T12:01:00.000Z"),
      esperaEmMs: 60_000,
    });

    expect(
      protecao.verificar({ contaId, enderecoDaBorda: "198.51.100.7" }),
    ).toMatchObject({
      status: "CONTA_BLOQUEADA",
      esperaEmMs: 60_000,
    });

    agora = new Date("2026-08-23T12:01:00.000Z");
    for (let tentativa = 0; tentativa < 10; tentativa += 1) {
      await protecao.registrarFalha(contaId);
    }
    await expect(
      protecao.verificar({ contaId, enderecoDaBorda: "198.51.100.7" }),
    ).toMatchObject({
      status: "CONTA_BLOQUEADA",
      esperaEmMs: 120_000,
    });
    expect(avisarDono).toHaveBeenLastCalledWith({
      contaId,
      bloqueadoAte: new Date("2026-08-23T12:03:00.000Z"),
      esperaEmMs: 120_000,
    });
  });
});
