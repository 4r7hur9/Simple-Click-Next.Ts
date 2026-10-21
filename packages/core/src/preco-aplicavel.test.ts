/**
 * Prova do preço cobrado por item (AC-309, AC-310, AC-311).
 *
 * A regra é pura e mora no core porque a conferência do carrinho e o pedido a
 * usam para COBRAR, e a vitrine usa a vizinha `precoQueVale` para ANUNCIAR.
 * Os cenários abaixo são os dos critérios, com os números dos critérios.
 */
import { describe, expect, it } from "vitest";

import { precoAplicavel } from "./preco-aplicavel.ts";
import { precoQueVale, type PrecoCadastrado } from "./preco-vigente.ts";

const AGORA = new Date("2026-09-26T15:00:00Z");

function preco(sobrescrita: Partial<PrecoCadastrado> = {}): PrecoCadastrado {
  return {
    tipo: "BASE",
    valorEmCentavos: 2000,
    quantidadeMinima: 1,
    ativo: true,
    comecaEm: null,
    terminaEm: null,
    ...sobrescrita,
  };
}

describe("preço base e promocional (AC-309)", () => {
  it("@spec:AC-309 promoção ativa de R$ 15,00 é o que se paga, com R$ 20,00 riscado", () => {
    const precos = [preco(), preco({ tipo: "PROMO", valorEmCentavos: 1500 })];

    const cobrado = precoAplicavel(precos, AGORA, 1);

    expect(cobrado?.unitarioEmCentavos).toBe(1500);
    expect(cobrado?.anteriorEmCentavos).toBe(2000);
    expect(cobrado?.tipo).toBe("PROMO");
    // O carrinho cobra o mesmo que a vitrine anuncia: as duas regras concordam.
    expect(precoQueVale(precos, AGORA)).toEqual({
      atualEmCentavos: 1500,
      anteriorEmCentavos: 2000,
    });
  });

  it("@spec:AC-309 promoção desativada devolve o preço base, sem nada riscado", () => {
    const precos = [
      preco(),
      preco({ tipo: "PROMO", valorEmCentavos: 1500, ativo: false }),
    ];

    const cobrado = precoAplicavel(precos, AGORA, 2);

    expect(cobrado?.unitarioEmCentavos).toBe(2000);
    expect(cobrado?.anteriorEmCentavos).toBeNull();
    expect(cobrado?.motivo).toBeNull();
    expect(cobrado?.totalEmCentavos).toBe(4000);
  });

  it("@spec:AC-309 promoção fora da janela não vale", () => {
    const precos = [
      preco(),
      preco({
        tipo: "PROMO",
        valorEmCentavos: 1500,
        terminaEm: new Date("2026-09-26T14:00:00Z"),
      }),
    ];

    expect(precoAplicavel(precos, AGORA, 1)?.unitarioEmCentavos).toBe(2000);
  });
});

describe("preço nomeado por quantidade (AC-310)", () => {
  const precos = [
    preco(),
    preco({
      tipo: "WHOLESALE",
      rotulo: "Atacado",
      valorEmCentavos: 1500,
      quantidadeMinima: 6,
    }),
  ];

  it("@spec:AC-310 com seis unidades o atacado entra sozinho e diz por quê", () => {
    const cobrado = precoAplicavel(precos, AGORA, 6);

    expect(cobrado?.unitarioEmCentavos).toBe(1500);
    expect(cobrado?.totalEmCentavos).toBe(9000);
    expect(cobrado?.rotulo).toBe("Atacado");
    expect(cobrado?.motivo).toContain("Atacado");
    expect(cobrado?.motivo).toContain("a partir de 6 unidades");
    // O preço normal fica como referência do desconto.
    expect(cobrado?.anteriorEmCentavos).toBe(2000);
  });

  it("@spec:AC-310 com cinco unidades vale o preço base, e o atacado não é anunciado como preço", () => {
    const cobrado = precoAplicavel(precos, AGORA, 5);

    expect(cobrado?.unitarioEmCentavos).toBe(2000);
    expect(cobrado?.motivo).toBeNull();
    // A vitrine nunca mostra o atacado como "o preço" de uma unidade.
    expect(precoQueVale(precos, AGORA).atualEmCentavos).toBe(2000);
  });

  it("@spec:AC-310 entre duas faixas valendo, vale a de menor preço", () => {
    const faixas = [
      ...precos,
      preco({
        tipo: "WHOLESALE",
        rotulo: "Caixa fechada",
        valorEmCentavos: 1200,
        quantidadeMinima: 12,
      }),
    ];

    expect(precoAplicavel(faixas, AGORA, 12)?.rotulo).toBe("Caixa fechada");
    expect(precoAplicavel(faixas, AGORA, 8)?.rotulo).toBe("Atacado");
  });

  it("@spec:AC-310 promoção mais barata que o atacado continua valendo", () => {
    const comPromo = [
      ...precos,
      preco({ tipo: "PROMO", valorEmCentavos: 1000 }),
    ];

    const cobrado = precoAplicavel(comPromo, AGORA, 6);
    expect(cobrado?.tipo).toBe("PROMO");
    expect(cobrado?.unitarioEmCentavos).toBe(1000);
  });

  it("@spec:AC-310 atacado sem nome recebe o nome padrão, e nunca aparece vazio", () => {
    const semNome = [
      preco(),
      preco({ tipo: "WHOLESALE", valorEmCentavos: 1500, quantidadeMinima: 6 }),
    ];

    expect(precoAplicavel(semNome, AGORA, 6)?.rotulo).toBe("Atacado");
  });
});

describe("o total do item é inteiro (AC-311)", () => {
  it("@spec:AC-311 @principle:P-005 R$ 19,99 vezes três dá 5997 centavos", () => {
    const cobrado = precoAplicavel(
      [preco({ valorEmCentavos: 1999 })],
      AGORA,
      3,
    );

    expect(cobrado?.totalEmCentavos).toBe(5997);
  });

  it("@spec:AC-311 sem preço nenhum valendo, o resultado é nulo, e não zero", () => {
    expect(precoAplicavel([], AGORA, 1)).toBeNull();
    expect(precoAplicavel([preco({ ativo: false })], AGORA, 1)).toBeNull();
  });
});

describe("faixas de atacado com desconto (card #53)", () => {
  const faixa = (
    quantidadeMinima: number,
    tipoDeDesconto: "PERCENTUAL" | "VALOR",
    desconto: number,
    extra: Partial<PrecoCadastrado> = {},
  ) =>
    preco({
      tipo: "WHOLESALE",
      valorEmCentavos: 0,
      quantidadeMinima,
      tipoDeDesconto,
      desconto,
      ...extra,
    });

  const crescente = [
    preco(),
    faixa(10, "PERCENTUAL", 5),
    faixa(50, "PERCENTUAL", 10),
    faixa(100, "PERCENTUAL", 15),
  ];

  it("sem faixa, o item não traz atacado", () => {
    expect(precoAplicavel([preco()], AGORA, 30)?.atacado).toBeNull();
  });

  it("abaixo da menor faixa vale o varejo, e o item diz o pedido mínimo e quanto falta", () => {
    const cobrado = precoAplicavel(crescente, AGORA, 7);
    expect(cobrado?.tipo).toBe("BASE");
    expect(cobrado?.unitarioEmCentavos).toBe(2000);
    expect(cobrado?.atacado?.pedidoMinimo).toBe(10);
    expect(cobrado?.atacado?.faixaAplicada).toBeNull();
    expect(cobrado?.atacado?.faltamParaProxima).toBe(3);
  });

  it("a faixa de valor zero no banco nunca vira preço de graça", () => {
    const cobrado = precoAplicavel(crescente, AGORA, 50);
    expect(cobrado?.unitarioEmCentavos).toBe(1800);
    expect(cobrado?.totalEmCentavos).toBe(90_000);
    expect(cobrado?.tipo).toBe("WHOLESALE");
    expect(cobrado?.anteriorEmCentavos).toBe(2000);
    expect(cobrado?.motivo).toBe(
      "Atacado: 10% de desconto a partir de 50 unidades, e você está levando 50.",
    );
    expect(cobrado?.atacado?.proximaFaixa?.quantidadeMinima).toBe(100);
    expect(cobrado?.atacado?.faltamParaProxima).toBe(50);
    expect(cobrado?.atacado?.economiaEmCentavos).toBe(10_000);
  });

  it("o desconto incide sobre a promoção que vale agora", () => {
    const comPromo = [
      ...crescente,
      preco({ tipo: "PROMO", valorEmCentavos: 1600 }),
    ];
    const cobrado = precoAplicavel(comPromo, AGORA, 10);
    // 1600 − 5% = 1520.
    expect(cobrado?.unitarioEmCentavos).toBe(1520);
    expect(cobrado?.anteriorEmCentavos).toBe(1600);
  });

  it("desconto em reais com o nome do dono", () => {
    const cobrado = precoAplicavel(
      [preco(), faixa(12, "VALOR", 250, { rotulo: "Caixa fechada" })],
      AGORA,
      12,
    );
    expect(cobrado?.unitarioEmCentavos).toBe(1750);
    expect(cobrado?.rotulo).toBe("Caixa fechada");
    expect(cobrado?.motivo).toContain("R$ 2,50 de desconto a partir de 12");
  });

  it("desconto em reais maior que a promoção é ignorado: vale a promoção", () => {
    const cobrado = precoAplicavel(
      [
        preco(),
        preco({ tipo: "PROMO", valorEmCentavos: 400 }),
        faixa(10, "VALOR", 500),
      ],
      AGORA,
      20,
    );
    expect(cobrado?.tipo).toBe("PROMO");
    expect(cobrado?.unitarioEmCentavos).toBe(400);
    expect(cobrado?.atacado).toBeNull();
  });

  it("faixa desligada ou fora da janela não vale", () => {
    const desligada = [preco(), faixa(10, "PERCENTUAL", 5, { ativo: false })];
    expect(precoAplicavel(desligada, AGORA, 10)?.unitarioEmCentavos).toBe(2000);
    const vencida = [
      preco(),
      faixa(10, "PERCENTUAL", 5, {
        terminaEm: new Date("2026-09-26T14:00:00Z"),
      }),
    ];
    expect(precoAplicavel(vencida, AGORA, 10)?.atacado).toBeNull();
  });

  it("entre o atacado antigo de preço fixo e a faixa, vale o mais barato", () => {
    const misto = [
      preco(),
      preco({ tipo: "WHOLESALE", valorEmCentavos: 1700, quantidadeMinima: 6 }),
      faixa(10, "PERCENTUAL", 10),
    ];
    expect(precoAplicavel(misto, AGORA, 8)?.unitarioEmCentavos).toBe(1700);
    expect(precoAplicavel(misto, AGORA, 10)?.unitarioEmCentavos).toBe(1700);
    expect(precoAplicavel(misto, AGORA, 6)?.atacado?.faltamParaProxima).toBe(4);
  });
});
