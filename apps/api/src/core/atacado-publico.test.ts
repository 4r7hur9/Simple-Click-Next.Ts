/**
 * Card #56 — o atacado que a vitrine, a página do produto e o feed mostram.
 */
import type { PrecoCadastrado } from "@simpleclick/core";
import { describe, expect, it } from "vitest";

import { atacadoPublico, comoPrecoCadastrado } from "./atacado-publico.ts";

const agora = new Date("2026-10-17T12:00:00Z");

function faixa(
  quantidadeMinima: number,
  tipoDeDesconto: "PERCENTUAL" | "VALOR",
  desconto: number,
  extras: Partial<PrecoCadastrado> = {},
): PrecoCadastrado {
  return {
    tipo: "WHOLESALE",
    valorEmCentavos: 0,
    quantidadeMinima,
    ativo: true,
    comecaEm: null,
    terminaEm: null,
    rotulo: null,
    tipoDeDesconto,
    desconto,
    ...extras,
  };
}

describe("atacadoPublico", () => {
  it("sem faixa, sem preço ou com preço zero, é só varejo", () => {
    expect(atacadoPublico(1000, [], agora)).toBeNull();
    expect(atacadoPublico(null, [faixa(10, "PERCENTUAL", 5)], agora)).toBeNull();
    expect(atacadoPublico(0, [faixa(10, "PERCENTUAL", 5)], agora)).toBeNull();
  });

  it("faixas crescentes saem em ordem, com unitário e economia por unidade", () => {
    const atacado = atacadoPublico(
      1000,
      [
        faixa(50, "PERCENTUAL", 10),
        faixa(10, "PERCENTUAL", 5, { rotulo: " Caixa " }),
        faixa(100, "PERCENTUAL", 15),
      ],
      agora,
    );
    expect(atacado).toEqual({
      pedidoMinimo: 10,
      faixas: [
        {
          quantidadeMinima: 10,
          tipoDeDesconto: "PERCENTUAL",
          desconto: 5,
          rotulo: "Caixa",
          unitarioCentavos: 950,
          descontoPorUnidadeCentavos: 50,
        },
        {
          quantidadeMinima: 50,
          tipoDeDesconto: "PERCENTUAL",
          desconto: 10,
          rotulo: null,
          unitarioCentavos: 900,
          descontoPorUnidadeCentavos: 100,
        },
        {
          quantidadeMinima: 100,
          tipoDeDesconto: "PERCENTUAL",
          desconto: 15,
          rotulo: null,
          unitarioCentavos: 850,
          descontoPorUnidadeCentavos: 150,
        },
      ],
    });
  });

  it("desconto em reais que não cabe no preço some; o pedido mínimo vem da que sobra", () => {
    const atacado = atacadoPublico(
      500,
      [faixa(6, "VALOR", 500), faixa(12, "VALOR", 100)],
      agora,
    );
    expect(atacado?.pedidoMinimo).toBe(12);
    expect(atacado?.faixas).toHaveLength(1);
    expect(atacado?.faixas[0]?.unitarioCentavos).toBe(400);
  });

  it("faixa desligada, fora da janela ou de outro tipo de preço não entra", () => {
    expect(
      atacadoPublico(
        1000,
        [
          faixa(6, "PERCENTUAL", 5, { ativo: false }),
          faixa(12, "PERCENTUAL", 10, {
            comecaEm: new Date("2026-11-01T00:00:00Z"),
          }),
          faixa(24, "PERCENTUAL", 20, {
            terminaEm: new Date("2026-10-01T00:00:00Z"),
          }),
          { ...faixa(2, "PERCENTUAL", 50), tipo: "PROMO" },
        ],
        agora,
      ),
    ).toBeNull();
  });

  it("o atacado antigo de preço fixo vira desconto em reais, só se baixar o preço", () => {
    const fixo = (min: number, valor: number): PrecoCadastrado => ({
      ...faixa(min, "VALOR", 0),
      tipoDeDesconto: null,
      desconto: null,
      valorEmCentavos: valor,
    });
    expect(atacadoPublico(600, [fixo(6, 600)], agora)).toBeNull();
    expect(atacadoPublico(600, [fixo(6, 450)], agora)).toEqual({
      pedidoMinimo: 6,
      faixas: [
        {
          quantidadeMinima: 6,
          tipoDeDesconto: "VALOR",
          desconto: 150,
          rotulo: null,
          unitarioCentavos: 450,
          descontoPorUnidadeCentavos: 150,
        },
      ],
    });
  });
});

describe("comoPrecoCadastrado", () => {
  it("traduz o tipo de desconto do banco e converte bigint", () => {
    const base = {
      kind: "WHOLESALE",
      amountCents: 0n,
      minQuantity: 10,
      isActive: true,
      startsAt: null,
      endsAt: null,
      label: "Fardo",
    };
    expect(
      comoPrecoCadastrado({ ...base, discountKind: "AMOUNT", discountValue: 150n }),
    ).toMatchObject({ tipoDeDesconto: "VALOR", desconto: 150, rotulo: "Fardo" });
    expect(
      comoPrecoCadastrado({ ...base, discountKind: "PERCENT", discountValue: 5n }),
    ).toMatchObject({ tipoDeDesconto: "PERCENTUAL", desconto: 5 });
    expect(
      comoPrecoCadastrado({ ...base, amountCents: 900n, discountKind: null }),
    ).toMatchObject({ tipoDeDesconto: null, desconto: null, valorEmCentavos: 900 });
  });
});
