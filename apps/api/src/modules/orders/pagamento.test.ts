/**
 * Prova das regras de pagamento (AC-511, AC-512).
 *
 * O que está sob prova aqui é o RETRATO. O pedido guarda o que valia no momento
 * da compra; se ele guardasse só uma referência à loja, o pedido de ontem
 * mudaria sozinho quando o dono trocasse a chave PIX — e o cliente veria uma
 * chave para a qual nunca pagou.
 */
import { describe, expect, it } from "vitest";

import {
  formasOferecidas,
  montarPagamento,
  type ConfiguracaoDePagamento,
} from "./pagamento.ts";

const LOJA: ConfiguracaoDePagamento = {
  aceitaPix: true,
  aceitaDinheiro: true,
  aceitaCartaoNaEntrega: true,
  chavePix: "loja@sabor.com.br",
  tipoDaChavePix: "EMAIL",
  nomeDoRecebedor: "Sabor & Cia",
};

describe("formas de pagamento oferecidas (AC-512)", () => {
  it("@spec:AC-512 a loja que aceita as três formas mostra as três", () => {
    const formas = formasOferecidas(LOJA).map((f) => f.forma);

    expect(formas).toEqual(["PIX", "CASH", "CARD_ON_DELIVERY"]);
  });

  it("@spec:AC-512 a loja mostra só o que o dono configurou", () => {
    const soPix = {
      ...LOJA,
      aceitaDinheiro: false,
      aceitaCartaoNaEntrega: false,
    };

    expect(formasOferecidas(soPix).map((f) => f.forma)).toEqual(["PIX"]);
  });

  it("@spec:AC-512 escolher dinheiro é o que pergunta o troco, e só isso", () => {
    const formas = formasOferecidas(LOJA);

    expect(formas.find((f) => f.forma === "CASH")?.perguntaTroco).toBe(true);
    expect(formas.find((f) => f.forma === "PIX")?.perguntaTroco).toBe(false);
    expect(
      formas.find((f) => f.forma === "CARD_ON_DELIVERY")?.perguntaTroco,
    ).toBe(false);
  });

  it("@spec:AC-512 PIX sem chave cadastrada não é oferecido", () => {
    // Oferecer e não ter o que mostrar é pior que não oferecer: o cliente
    // escolhe, chega numa caixa vazia e desiste sem ter como pagar.
    const semChave = { ...LOJA, chavePix: "   " };

    expect(formasOferecidas(semChave).map((f) => f.forma)).not.toContain("PIX");
  });

  it("@spec:AC-512 escolha que a loja não aceita é recusada com explicação", () => {
    // A escolha vem do cliente, e cliente não é fonte de verdade: a tela pode
    // estar velha, ou alguém pode ter mandado a escolha na mão.
    const semCartao = { ...LOJA, aceitaCartaoNaEntrega: false };
    const resultado = montarPagamento(
      { forma: "CARD_ON_DELIVERY" },
      semCartao,
      5000,
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.recusa.causa).toBe("FORMA_NAO_ACEITA");
      expect(resultado.recusa.explicacao).toContain("não aceita");
    }
  });

  it("@spec:AC-512 troco menor que o total é recusado antes de o entregador sair", () => {
    // Descobrir isso na porta, com o entregador, é o pior lugar possível.
    const resultado = montarPagamento(
      { forma: "CASH", trocoParaEmCentavos: 2000 },
      LOJA,
      3500,
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.recusa.causa).toBe("TROCO_MENOR_QUE_O_TOTAL");
    }
  });

  it("@spec:AC-512 dinheiro sem troco informado é aceito — nem todo mundo precisa", () => {
    const resultado = montarPagamento({ forma: "CASH" }, LOJA, 3500);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.pagamento.trocoParaEmCentavos).toBeNull();
    }
  });

  it("@spec:AC-512 troco igual ao total é aceito: é o caso de quem tem o valor exato", () => {
    const resultado = montarPagamento(
      { forma: "CASH", trocoParaEmCentavos: 3500 },
      LOJA,
      3500,
    );

    expect(resultado.ok).toBe(true);
  });
});

describe("o pedido guarda a chave que valia no momento (AC-511)", () => {
  it("@spec:AC-511 a chave, o tipo e o recebedor são copiados para dentro do pedido", () => {
    const resultado = montarPagamento({ forma: "PIX" }, LOJA, 5000);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.pagamento.chavePix).toBe("loja@sabor.com.br");
      expect(resultado.pagamento.tipoDaChavePix).toBe("EMAIL");
      expect(resultado.pagamento.nomeDoRecebedor).toBe("Sabor & Cia");
    }
  });

  it("@spec:AC-511 trocar a chave da loja depois não muda o pedido já montado", () => {
    // É a prova de que o pedido é um retrato, e não uma janela para a loja.
    const antes = montarPagamento({ forma: "PIX" }, LOJA, 5000);
    const lojaDepois = {
      ...LOJA,
      chavePix: "99988877766",
      tipoDaChavePix: "CPF" as const,
    };
    const depois = montarPagamento({ forma: "PIX" }, lojaDepois, 5000);

    expect(antes.ok && antes.pagamento.chavePix).toBe("loja@sabor.com.br");
    expect(depois.ok && depois.pagamento.chavePix).toBe("99988877766");
    // O pedido antigo continua com a chave antiga: nada nele aponta para a loja.
    expect(antes.ok && antes.pagamento.chavePix).not.toBe(
      depois.ok && depois.pagamento.chavePix,
    );
  });

  it("@spec:AC-511 pagamento que não é PIX não carrega chave nenhuma", () => {
    // Guardar a chave em todo pedido espalharia um dado da loja por linhas que
    // não têm motivo para tê-lo, e ele apareceria em tela que não deveria.
    const resultado = montarPagamento(
      { forma: "CARD_ON_DELIVERY" },
      LOJA,
      5000,
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.pagamento.chavePix).toBeNull();
      expect(resultado.pagamento.nomeDoRecebedor).toBeNull();
      expect(resultado.pagamento.trocoParaEmCentavos).toBeNull();
    }
  });
});
