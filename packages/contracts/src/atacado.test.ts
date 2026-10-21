/**
 * Prova do contrato das faixas de atacado (card #53).
 */
import { describe, expect, it } from "vitest";

import {
  esquemaDaFaixaDeAtacado,
  esquemaDasFaixasDeAtacado,
  esquemaDasFaixasParaSalvar,
} from "./atacado.ts";

const pct = (quantidadeMinima: number, desconto: number) => ({
  quantidadeMinima,
  tipoDeDesconto: "PERCENTUAL" as const,
  desconto,
});

const mensagens = (valor: unknown): string[] => {
  const r = esquemaDasFaixasDeAtacado.safeParse(valor);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("faixa de atacado", () => {
  it("aceita percentual e valor em reais", () => {
    expect(esquemaDaFaixaDeAtacado.safeParse(pct(10, 5)).success).toBe(true);
    expect(
      esquemaDaFaixaDeAtacado.safeParse({
        quantidadeMinima: 12,
        tipoDeDesconto: "VALOR",
        desconto: 250,
        rotulo: "Caixa fechada",
      }).success,
    ).toBe(true);
  });

  it("recusa quantidade abaixo de 2, desconto zero e percentual fora de 1 a 99", () => {
    expect(esquemaDaFaixaDeAtacado.safeParse(pct(1, 5)).success).toBe(false);
    expect(esquemaDaFaixaDeAtacado.safeParse(pct(10, 0)).success).toBe(false);
    expect(esquemaDaFaixaDeAtacado.safeParse(pct(10, 100)).success).toBe(false);
    expect(esquemaDaFaixaDeAtacado.safeParse(pct(10, 2.5)).success).toBe(false);
  });
});

describe("faixas do produto", () => {
  it("lista vazia é só varejo; crescente correta passa", () => {
    expect(mensagens([])).toEqual([]);
    expect(mensagens([pct(10, 5), pct(50, 10), pct(100, 15)])).toEqual([]);
    expect(
      esquemaDasFaixasParaSalvar.safeParse({ faixas: [pct(10, 5)] }).success,
    ).toBe(true);
  });

  it("recusa quantidade repetida, desconto que não cresce e tipos misturados", () => {
    expect(mensagens([pct(10, 5), pct(10, 8)])).toContain(
      "Já existe uma faixa com essa quantidade.",
    );
    expect(mensagens([pct(50, 10), pct(10, 10)])).toContain(
      "Quem leva mais precisa ganhar um desconto maior.",
    );
    expect(
      mensagens([
        pct(10, 5),
        { quantidadeMinima: 20, tipoDeDesconto: "VALOR", desconto: 500 },
      ]),
    ).toContain("Use o mesmo tipo de desconto em todas as faixas.");
  });
});
