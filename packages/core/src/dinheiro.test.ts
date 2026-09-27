/**
 * Prova do dinheiro em centavos (AC-311, P-005).
 *
 * O cenário do critério é R$ 19,99 × 3 = R$ 59,97 exatos. A prova passa pelos
 * dois lugares onde o centavo costuma se perder: a leitura do que a pessoa
 * digitou e a multiplicação pela quantidade.
 */
import { describe, expect, it } from "vitest";

import {
  centavosDoTexto,
  ErroDeDinheiro,
  exigirCentavos,
  multiplicarCentavos,
  somarCentavos,
} from "./dinheiro.ts";
import { emReais } from "./taxa-entrega.ts";

describe("valor monetário nunca perde centavo (AC-311)", () => {
  it("@spec:AC-311 @principle:P-005 R$ 19,99 × 3 dá exatamente R$ 59,97", () => {
    const unitario = centavosDoTexto("19,99");

    expect(unitario).toBe(1999);
    expect(multiplicarCentavos(1999, 3)).toBe(5997);
    expect(emReais(multiplicarCentavos(1999, 3))).toBe("R$ 59,97");
    expect(Number.isInteger(multiplicarCentavos(1999, 3))).toBe(true);
  });

  it("@spec:AC-311 lê o que o dono digita sem passar por ponto flutuante", () => {
    // 19.99 * 100 é 1998.9999999999998: a leitura por texto não cai nisso.
    expect(19.99 * 100).not.toBe(1999);
    expect(centavosDoTexto("19.99")).toBe(1999);
    expect(centavosDoTexto("R$ 1.234,50")).toBe(123_450);
    expect(centavosDoTexto("20")).toBe(2000);
    expect(centavosDoTexto("0,1")).toBe(10);
    expect(centavosDoTexto("4,35")).toBe(435);
    expect(centavosDoTexto("-2,00")).toBe(-200);
  });

  it("@spec:AC-311 texto que não é valor em reais vira nulo, e nunca zero", () => {
    expect(centavosDoTexto("")).toBeNull();
    expect(centavosDoTexto("abc")).toBeNull();
    expect(centavosDoTexto("19,999")).toBeNull();
    expect(centavosDoTexto("1,2,3")).toBeNull();
  });

  it("@spec:AC-311 conta com valor quebrado é recusada, e não arredondada", () => {
    expect(() => multiplicarCentavos(19.99, 3)).toThrow(ErroDeDinheiro);
    expect(() => multiplicarCentavos(1999, 1.5)).toThrow(ErroDeDinheiro);
    expect(() => exigirCentavos(Number.MAX_SAFE_INTEGER + 2)).toThrow(
      ErroDeDinheiro,
    );
  });

  it("@spec:AC-311 somar linhas de pedido fica em inteiros", () => {
    expect(somarCentavos([5997, 700, 1])).toBe(6698);
    expect(() => somarCentavos([100, 0.5])).toThrow(ErroDeDinheiro);
  });
});
