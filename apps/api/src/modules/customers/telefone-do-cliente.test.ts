import { describe, expect, it } from "vitest";

import {
  chaveDoTelefone,
  normalizarTelefoneDoCliente,
  pedacosDoTelefoneParaBusca,
} from "./telefone-do-cliente.ts";

describe("a chave do telefone iguala as pontuações (AC-701, AC-704)", () => {
  it("@spec:AC-701 qualquer forma do mesmo número vira a mesma chave", () => {
    const formas = [
      "(11) 98888-7777",
      "11988887777",
      "+55 11 98888-7777",
      "5511988887777",
      "+5511988887777",
    ];
    expect(new Set(formas.map(chaveDoTelefone))).toEqual(
      new Set(["11988887777"]),
    );
  });

  it("@spec:AC-701 fixo com o país também perde o 55; número curto fica como está", () => {
    expect(chaveDoTelefone("+55 (21) 3333-4444")).toBe("2133334444");
    expect(chaveDoTelefone("551234")).toBe("551234");
  });

  it("@spec:AC-701 a busca procura a sequência digitada e, começando por 55, também sem ele", () => {
    expect(pedacosDoTelefoneParaBusca("(11) 9888")).toEqual(["119888"]);
    expect(pedacosDoTelefoneParaBusca("+55 11 9888")).toEqual([
      "55119888",
      "119888",
    ]);
    // Menos de três dígitos não é busca por telefone.
    expect(pedacosDoTelefoneParaBusca("ana 1")).toEqual([]);
  });
});

describe("o telefone do cadastro é conferido (AC-703)", () => {
  it("@spec:AC-703 aceita a máscara e guarda em E.164 com o +", () => {
    expect(normalizarTelefoneDoCliente("(11) 98888-7777")).toEqual({
      ok: true,
      e164: "+5511988887777",
      chave: "11988887777",
    });
  });

  it("@spec:AC-703 recusa dizendo o que falta, e nunca um 'inválido' mudo", () => {
    const vazio = normalizarTelefoneDoCliente("   ");
    expect(vazio).toMatchObject({ ok: false });
    expect(!vazio.ok && vazio.explicacao).toMatch(/código de área/);

    const curto = normalizarTelefoneDoCliente("9888-7777");
    expect(curto).toMatchObject({ ok: false });
    expect(!curto.ok && curto.explicacao).toMatch(/dígitos/);
  });
});
