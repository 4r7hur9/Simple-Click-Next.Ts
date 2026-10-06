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

  it("@spec:AC-919 a configuração gravada antes da chave do automático continua valendo: 58 mm não volta para 80", () => {
    // O documento como estava guardado antes da T-608: sem `automatico`. Com
    // o campo obrigatório, ele deixaria de validar e cairia no padrão.
    const antiga = normalizarConfiguracaoDeImpressao({
      larguraMm: 58,
      conteudo: {
        pedido: true,
        itens: true,
        total: true,
        enderecoCliente: false,
        totalEmDestaque: true,
        observacoes: true,
      },
    });

    expect(antiga.larguraMm).toBe(58);
    expect(antiga.conteudo.enderecoCliente).toBe(false);
    expect(antiga.conteudo.totalEmDestaque).toBe(true);
    expect(antiga.automatico).toBe(false);
  });

  it("@spec:AC-622 a impressão automática nasce desligada e só liga com a chave em verdadeiro", () => {
    expect(normalizarConfiguracaoDeImpressao(undefined).automatico).toBe(false);
    expect(normalizarConfiguracaoDeImpressao({}).automatico).toBe(false);
    expect(
      normalizarConfiguracaoDeImpressao({ automatico: "true" }).automatico,
    ).toBe(false);

    const ligada = validarConfiguracaoDeImpressao({
      larguraMm: 58,
      conteudo: {
        pedido: true,
        itens: true,
        total: true,
        enderecoCliente: true,
        totalEmDestaque: false,
        observacoes: true,
      },
      automatico: true,
    });
    expect(ligada).toMatchObject({ larguraMm: 58, automatico: true });

    // A fila lê a chave direto do documento; a tela precisa dizer o mesmo,
    // mesmo quando o resto do documento está incompleto.
    expect(
      normalizarConfiguracaoDeImpressao({ automatico: true }),
    ).toMatchObject({ larguraMm: 80, automatico: true });
  });
});
