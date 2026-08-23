import { describe, expect, it } from "vitest";

import { avaliarPoliticaDeSenha, derivarSenha, senhaConfere } from "./senha.ts";

describe("política e derivação de senha", () => {
  it("@spec:AC-102 senha fraca informa mínimo e exposição em vazamentos conhecidos", () => {
    const resultado = avaliarPoliticaDeSenha("123456");

    expect(resultado).toMatchObject({ valida: false });
    if (!resultado.valida) {
      expect(resultado.problemas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ codigo: "minimo_de_caracteres" }),
          expect.objectContaining({ codigo: "senha_vazada" }),
        ]),
      );
    }
  });

  it("@spec:AC-100 senha aceita é guardada como derivação Argon2id e pode ser conferida", async () => {
    const derivacao = await derivarSenha("Cacto azul sob a lua 2026!");

    expect(derivacao).toMatch(/^argon2id\$/);
    await expect(
      senhaConfere("Cacto azul sob a lua 2026!", derivacao),
    ).resolves.toBe(true);
    await expect(senhaConfere("outra senha", derivacao)).resolves.toBe(false);
  }, 15_000);
});
