import { describe, expect, it } from "vitest";

import {
  normalizarConfiguracaoDeImpressao,
  validarConfiguracaoDeImpressao,
} from "./impressao-config.usecase.ts";

describe("configuração de impressão", () => {
  it("@spec:AC-919 conserva a largura escolhida para o formato do cupom", () => {
    expect(
      validarConfiguracaoDeImpressao({
        larguraMm: 58,
        conteudo: {
          pedido: true,
          itens: true,
          total: true,
          enderecoCliente: true,
          totalEmDestaque: false,
          observacoes: true,
        },
      }).larguraMm,
    ).toBe(58);
    expect(
      validarConfiguracaoDeImpressao({
        larguraMm: 80,
        conteudo: {
          pedido: true,
          itens: true,
          total: true,
          enderecoCliente: true,
          totalEmDestaque: false,
          observacoes: true,
        },
      }).larguraMm,
    ).toBe(80);
  });

  it("@spec:AC-920 aplica as escolhas de conteúdo e mantém o essencial ativo", () => {
    const configuracao = normalizarConfiguracaoDeImpressao({
      larguraMm: 58,
      conteudo: {
        pedido: false,
        itens: false,
        total: false,
        enderecoCliente: false,
        totalEmDestaque: true,
        observacoes: false,
      },
    });

    expect(configuracao.conteudo).toEqual({
      pedido: true,
      itens: true,
      total: true,
      enderecoCliente: false,
      totalEmDestaque: true,
      observacoes: false,
    });
  });
});
