/**
 * Prova da conferência da chave PIX pelo tipo escolhido (AC-901).
 *
 * Os documentos usados aqui são gerados pela própria conta do dígito
 * verificador — não pertencem a ninguém.
 */
import { describe, expect, it } from "vitest";

import {
  cnpjValido,
  cpfValido,
  FORMATO_DA_CHAVE_PIX,
  validarChavePix,
} from "./chave-pix.ts";

/** CPF de exemplo com dígitos verificadores corretos. */
const CPF_VALIDO = "529.982.247-25";
/** O mesmo com o último dígito trocado. */
const CPF_COM_DIGITO_ERRADO = "529.982.247-26";
const CNPJ_VALIDO = "11.222.333/0001-81";

describe("chave do tipo CPF (AC-901)", () => {
  it("@spec:AC-901 CPF válido é aceito com ou sem pontuação, e sai só com os dígitos", () => {
    expect(validarChavePix("CPF", CPF_VALIDO)).toEqual({
      ok: true,
      chave: "52998224725",
    });
    expect(validarChavePix("CPF", "52998224725")).toEqual({
      ok: true,
      chave: "52998224725",
    });
  });

  it("@spec:AC-901 valor que não é CPF válido é recusado explicando o formato esperado", () => {
    for (const errado of [
      CPF_COM_DIGITO_ERRADO,
      "111.111.111-11",
      "1234567890",
      "loja@exemplo.com",
      "529.982.247-2x",
    ]) {
      const resultado = validarChavePix("CPF", errado);
      expect(resultado.ok, errado).toBe(false);
      if (!resultado.ok) {
        expect(resultado.formatoEsperado).toContain("11 dígitos");
        expect(resultado.formatoEsperado).toMatch(/exemplo/);
      }
    }
  });

  it("@spec:AC-901 a conta do dígito verificador é a do CPF", () => {
    expect(cpfValido(CPF_VALIDO)).toBe(true);
    expect(cpfValido(CPF_COM_DIGITO_ERRADO)).toBe(false);
    expect(cpfValido("000.000.000-00")).toBe(false);
  });
});

describe("os outros tipos (AC-901)", () => {
  it("@spec:AC-901 CNPJ válido é aceito, e com dígito errado é recusado", () => {
    expect(validarChavePix("CNPJ", CNPJ_VALIDO)).toEqual({
      ok: true,
      chave: "11222333000181",
    });
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    const recusado = validarChavePix("CNPJ", "11.222.333/0001-82");
    expect(recusado).toEqual({
      ok: false,
      formatoEsperado: FORMATO_DA_CHAVE_PIX.CNPJ,
    });
  });

  it("@spec:AC-901 telefone vira o formato internacional, e fixo ou sem DDD é recusado", () => {
    expect(validarChavePix("TELEFONE", "(11) 91234-5678")).toEqual({
      ok: true,
      chave: "+5511912345678",
    });
    expect(validarChavePix("TELEFONE", "91234-5678").ok).toBe(false);
    expect(validarChavePix("TELEFONE", "(11) 3456-7890").ok).toBe(false);
  });

  it("@spec:AC-901 e-mail é aceito em minúsculas, e sem arroba é recusado", () => {
    expect(validarChavePix("EMAIL", "Loja@Exemplo.com.br")).toEqual({
      ok: true,
      chave: "loja@exemplo.com.br",
    });
    expect(validarChavePix("EMAIL", "loja.exemplo.com.br").ok).toBe(false);
  });

  it("@spec:AC-901 chave aleatória tem o formato do banco, e outra coisa é recusada", () => {
    expect(
      validarChavePix("ALEATORIA", "123E4567-E89B-12D3-A456-426614174000"),
    ).toEqual({ ok: true, chave: "123e4567-e89b-12d3-a456-426614174000" });
    expect(validarChavePix("ALEATORIA", CPF_VALIDO).ok).toBe(false);
  });

  it("@spec:AC-901 chave de um tipo não passa como outro tipo", () => {
    expect(validarChavePix("TELEFONE", CPF_VALIDO).ok).toBe(false);
    expect(validarChavePix("EMAIL", CPF_VALIDO).ok).toBe(false);
    expect(validarChavePix("CPF", "(11) 91234-5678").ok).toBe(false);
  });
});
