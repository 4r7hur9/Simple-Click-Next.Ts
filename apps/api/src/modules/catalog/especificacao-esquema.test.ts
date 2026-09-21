import { describe, expect, it } from "vitest";

import {
  DEFINICOES_DOS_TIPOS,
  TIPOS_DE_VALOR,
  esquemaDaEspecificacao,
  esquemaDoValorDaEspecificacao,
} from "./especificacao-esquema.ts";

describe("esquema de especificação", () => {
  it("@spec:AC-325 deriva os quatro tipos de valor do registro tipado", () => {
    expect(TIPOS_DE_VALOR).toEqual(["texto", "numero", "lista", "booleano"]);
    expect(Object.keys(DEFINICOES_DOS_TIPOS)).toEqual(TIPOS_DE_VALOR);

    const base = {
      categoriaId: "categoria-pneus",
      nome: "Aro",
      unidade: "pol",
      obrigatoria: true,
      filtravel: true,
      opcoes: ["13", "14", "15", "16"],
      ordem: 0,
    };
    expect(
      esquemaDaEspecificacao.safeParse({ ...base, tipo: "lista" }).success,
    ).toBe(true);
    expect(
      esquemaDaEspecificacao.safeParse({
        ...base,
        tipo: "booleano",
        opcoes: [],
        unidade: null,
      }).success,
    ).toBe(true);
    expect(
      esquemaDaEspecificacao.safeParse({
        ...base,
        categoriaId: "",
        tipo: "texto",
        opcoes: [],
      }).success,
    ).toBe(false);
  });

  it("@spec:AC-327 o esquema gerado rejeita valor que não está na lista", () => {
    const especificacao = {
      tipo: "lista" as const,
      opcoes: ["13", "14", "15", "16"],
    };
    const esquema = esquemaDoValorDaEspecificacao(especificacao);

    expect(esquema.safeParse("16").success).toBe(true);
    const resultado = esquema.safeParse("17");
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toContain("13, 14, 15, 16");
    }
  });
});
