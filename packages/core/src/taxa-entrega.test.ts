/**
 * Prova de AC-507, AC-906, AC-907 e AC-908 — a conta que vira dinheiro.
 *
 * O que estes testes protegem é a ORDEM e o CENTAVO. Um erro aqui não derruba
 * nada: o pedido fecha, o cliente paga, e a diferença só aparece no fim do mês,
 * quando ninguém mais consegue dizer de qual pedido ela veio.
 */
import { describe, expect, it } from "vitest";

import { calcularValores, emReais } from "./taxa-entrega.ts";
import type { ConfiguracaoDeEntrega } from "./taxa-entrega.ts";

/** Loja comum: entrega e retirada, taxa de R$ 8,00 com nome próprio. */
const LOJA: ConfiguracaoDeEntrega = {
  aceitaEntrega: true,
  aceitaRetirada: true,
  taxaEmCentavos: 800,
  nomeDaTaxa: "Entrega Centro",
};

describe("taxa de entrega no resumo (AC-507, AC-906)", () => {
  it("@spec:AC-906 a taxa entra em linha separada, com o nome que o dono deu", () => {
    const resumo = calcularValores(LOJA, "DELIVERY", 4550);

    expect(resumo.subtotalEmCentavos).toBe(4550);
    expect(resumo.taxaDeEntrega.valorEmCentavos).toBe(800);
    expect(resumo.taxaDeEntrega.nome).toBe("Entrega Centro");
    expect(resumo.totalEmCentavos).toBe(5350);
  });

  it("@spec:AC-507 o resumo traz as três linhas que a tela mostra, e o total é a soma delas", () => {
    const resumo = calcularValores(LOJA, "DELIVERY", 12345);

    // A tela não recalcula nada: ela imprime estes três números. Se o total
    // deixasse de ser a soma exata, a tela mentiria sem ter culpa.
    expect(
      resumo.subtotalEmCentavos + resumo.taxaDeEntrega.valorEmCentavos,
    ).toBe(resumo.totalEmCentavos);
    expect(resumo.impedimento).toBeNull();
  });

  it("@spec:AC-906 taxa sem nome cadastrado ganha um nome legível, e não fica em branco", () => {
    const semNome = { ...LOJA, nomeDaTaxa: null };

    expect(calcularValores(semNome, "DELIVERY", 5000).taxaDeEntrega.nome).toBe(
      "Taxa de entrega",
    );
  });

  it("@spec:AC-906 taxa não cadastrada é a combinar, e não entrega de graça", () => {
    // Tratar ausência como zero faria a loja entregar sem cobrar sem nunca ter
    // decidido isso — e ela só descobriria contando o prejuízo.
    const aCombinar = { ...LOJA, taxaEmCentavos: null };
    const resumo = calcularValores(aCombinar, "DELIVERY", 5000);

    expect(resumo.taxaDeEntrega.modo).toBe("ASK");
    expect(resumo.entregaGratis).toBe(false);
    expect(resumo.totalEmCentavos).toBe(5000);
  });
});

describe("entrega grátis acima de um valor (AC-907)", () => {
  const comGratis = { ...LOJA, gratisAcimaDeEmCentavos: 6000 };

  it("@spec:AC-907 pedido acima do limite zera a taxa e diz que a entrega saiu de graça", () => {
    const resumo = calcularValores(comGratis, "DELIVERY", 7000);

    expect(resumo.taxaDeEntrega.valorEmCentavos).toBe(0);
    expect(resumo.taxaDeEntrega.modo).toBe("FREE");
    expect(resumo.entregaGratis).toBe(true);
    // O nome sobrevive: a linha continua aparecendo, zerada e explicada.
    expect(resumo.taxaDeEntrega.nome).toBe("Entrega Centro");
    expect(resumo.totalEmCentavos).toBe(7000);
  });

  it("@spec:AC-907 pedido abaixo do limite continua pagando a taxa", () => {
    const resumo = calcularValores(comGratis, "DELIVERY", 5000);

    expect(resumo.taxaDeEntrega.valorEmCentavos).toBe(800);
    expect(resumo.entregaGratis).toBe(false);
    expect(resumo.totalEmCentavos).toBe(5800);
  });

  it("@spec:AC-907 no valor exato do limite a entrega já sai de graça", () => {
    // "acima de R$ 60,00" com o pedido em exatamente R$ 60,00 é a fronteira que
    // gera reclamação. A regra fica escrita aqui: no limite, é grátis.
    const resumo = calcularValores(comGratis, "DELIVERY", 6000);

    expect(resumo.entregaGratis).toBe(true);
    expect(resumo.totalEmCentavos).toBe(6000);
  });

  it("@spec:AC-907 a entrega grátis decide sobre os ITENS, e não sobre o total", () => {
    // Se a taxa entrasse na conta do limite, um pedido de R$ 55,00 mais R$ 8,00
    // de taxa passaria de R$ 60,00 e zeraria a própria taxa que o fez passar.
    const resumo = calcularValores(comGratis, "DELIVERY", 5500);

    expect(resumo.entregaGratis).toBe(false);
    expect(resumo.totalEmCentavos).toBe(6300);
  });
});

describe("valor mínimo do pedido (AC-908)", () => {
  const comMinimo = { ...LOJA, minimoParaEntregaEmCentavos: 2500 };

  it("@spec:AC-908 abaixo do mínimo o fechamento é impedido e informa quanto falta", () => {
    const resumo = calcularValores(comMinimo, "DELIVERY", 2000);

    expect(resumo.impedimento?.causa).toBe("ABAIXO_DO_MINIMO");
    expect(resumo.impedimento?.faltamEmCentavos).toBe(500);
    expect(resumo.impedimento?.explicacao).toContain("R$ 5,00");
    expect(resumo.impedimento?.explicacao).toContain("R$ 25,00");
  });

  it("@spec:AC-908 a retirada continua permitida quando o mínimo é só da entrega", () => {
    // O dono definiu mínimo para entrega porque a corrida custa. Espelhar o
    // número na retirada bloquearia venda que ele nunca quis bloquear.
    const resumo = calcularValores(comMinimo, "PICKUP", 2000);

    expect(resumo.impedimento).toBeNull();
    expect(resumo.totalEmCentavos).toBe(2000);
  });

  it("@spec:AC-908 o mínimo mede os ITENS, e não o total com a taxa", () => {
    // R$ 20,00 de itens mais R$ 8,00 de taxa dá R$ 28,00. Se o mínimo olhasse o
    // total, a própria taxa destravaria o pedido — e a regra viraria enfeite.
    const resumo = calcularValores(comMinimo, "DELIVERY", 2000);

    expect(resumo.totalEmCentavos).toBe(2800);
    expect(resumo.impedimento?.causa).toBe("ABAIXO_DO_MINIMO");
  });

  it("@spec:AC-908 no valor exato do mínimo o pedido passa", () => {
    expect(calcularValores(comMinimo, "DELIVERY", 2500).impedimento).toBeNull();
  });
});

describe("loja que só faz retirada (AC-506)", () => {
  const soRetirada: ConfiguracaoDeEntrega = {
    ...LOJA,
    aceitaEntrega: false,
  };

  it("@spec:AC-506 a taxa não é somada em nenhum caso quando a loja não entrega", () => {
    // Somar e "zerar na tela" deixaria a taxa dentro do pedido guardado, e o
    // relatório do dono passaria a contar receita de entrega que nunca houve.
    const resumo = calcularValores(soRetirada, "DELIVERY", 5000);

    expect(resumo.taxaDeEntrega.valorEmCentavos).toBe(0);
    expect(resumo.totalEmCentavos).toBe(5000);
    expect(resumo.impedimento?.causa).toBe("ENTREGA_NAO_OFERECIDA");
  });

  it("@spec:AC-506 a retirada na mesma loja fecha normalmente, sem taxa", () => {
    const resumo = calcularValores(soRetirada, "PICKUP", 5000);

    expect(resumo.impedimento).toBeNull();
    expect(resumo.taxaDeEntrega.valorEmCentavos).toBe(0);
    expect(resumo.totalEmCentavos).toBe(5000);
  });
});

describe("dinheiro escrito para o cliente ler", () => {
  it("@spec:AC-908 centavos viram reais sem ponto flutuante no caminho", () => {
    // Um único `/100` em ponto flutuante já erra: 0.1+0.2 não dá 0.3, e a
    // diferença aparece como um centavo a menos no aviso do mínimo.
    expect(emReais(0)).toBe("R$ 0,00");
    expect(emReais(5)).toBe("R$ 0,05");
    expect(emReais(800)).toBe("R$ 8,00");
    expect(emReais(2599)).toBe("R$ 25,99");
    expect(emReais(123456789)).toBe("R$ 1.234.567,89");
  });
});
