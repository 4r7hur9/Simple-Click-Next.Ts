/**
 * As travas e a prévia das faixas de atacado no painel (card #54), sem banco.
 */
import type { FaixaGravadaNoContrato } from "@simpleclick/contracts";
import { describe, expect, it } from "vitest";

import { atacadoDoPreco, conferirFaixas } from "./atacado.usecase.ts";

function gravada(
  campos: Partial<FaixaGravadaNoContrato> &
    Pick<FaixaGravadaNoContrato, "quantidadeMinima" | "desconto">,
): FaixaGravadaNoContrato {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    tipoDeDesconto: "PERCENTUAL",
    rotulo: null,
    ativo: true,
    ...campos,
  };
}

describe("conferirFaixas", () => {
  it("aceita lista vazia: o produto volta a vender só no varejo", () => {
    expect(conferirFaixas([], 2000)).toEqual({ ok: true, faixas: [] });
  });

  it("aceita uma faixa só e faixas crescentes", () => {
    expect(
      conferirFaixas(
        [{ quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 5 }],
        2000,
      ).ok,
    ).toBe(true);
    expect(
      conferirFaixas(
        [
          { quantidadeMinima: 50, tipoDeDesconto: "PERCENTUAL", desconto: 10 },
          { quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 5 },
          { quantidadeMinima: 100, tipoDeDesconto: "PERCENTUAL", desconto: 15 },
        ],
        2000,
      ).ok,
    ).toBe(true);
  });

  it("recusa quantidade repetida, apontando a linha", () => {
    const conferido = conferirFaixas(
      [
        { quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 5 },
        { quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 8 },
      ],
      2000,
    );
    expect(conferido).toEqual({
      ok: false,
      problemas: [
        { indice: 1, mensagem: "Já existe uma faixa com essa quantidade." },
      ],
    });
  });

  it("recusa desconto que não cresce com a quantidade", () => {
    const conferido = conferirFaixas(
      [
        { quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 10 },
        { quantidadeMinima: 50, tipoDeDesconto: "PERCENTUAL", desconto: 10 },
      ],
      2000,
    );
    expect(conferido.ok).toBe(false);
    if (!conferido.ok)
      expect(conferido.problemas).toEqual([
        {
          indice: 1,
          mensagem: "Quem leva mais precisa ganhar um desconto maior.",
        },
      ]);
  });

  it("recusa tipos misturados e quantidade abaixo de 2", () => {
    const misturado = conferirFaixas(
      [
        { quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 5 },
        { quantidadeMinima: 20, tipoDeDesconto: "VALOR", desconto: 300 },
      ],
      2000,
    );
    expect(misturado.ok).toBe(false);
    if (!misturado.ok)
      expect(misturado.problemas.map((p) => p.mensagem)).toContain(
        "Use o mesmo tipo de desconto em todas as faixas.",
      );

    const unidade = conferirFaixas(
      [{ quantidadeMinima: 1, tipoDeDesconto: "PERCENTUAL", desconto: 5 }],
      2000,
    );
    expect(unidade).toEqual({
      ok: false,
      problemas: [
        { indice: 0, mensagem: "O atacado começa a partir de 2 unidades." },
      ],
    });
  });

  it("recusa percentual fora de 1 a 99", () => {
    const conferido = conferirFaixas(
      [{ quantidadeMinima: 10, tipoDeDesconto: "PERCENTUAL", desconto: 100 }],
      2000,
    );
    expect(conferido).toEqual({
      ok: false,
      problemas: [
        { indice: 0, mensagem: "O desconto percentual vai de 1% a 99%." },
      ],
    });
  });

  it("recusa desconto em reais maior ou igual ao preço, e aceita o menor", () => {
    const igual = conferirFaixas(
      [{ quantidadeMinima: 10, tipoDeDesconto: "VALOR", desconto: 2000 }],
      2000,
    );
    expect(igual).toEqual({
      ok: false,
      problemas: [
        {
          indice: 0,
          mensagem:
            "O desconto em reais precisa ser menor que o preço do produto.",
        },
      ],
    });
    expect(
      conferirFaixas(
        [{ quantidadeMinima: 10, tipoDeDesconto: "VALOR", desconto: 1999 }],
        2000,
      ).ok,
    ).toBe(true);
  });

  it("recusa campo desconhecido e valor quebrado", () => {
    expect(
      conferirFaixas(
        [
          {
            quantidadeMinima: 10,
            tipoDeDesconto: "PERCENTUAL",
            desconto: 5,
            precoCentavos: 1,
          },
        ],
        2000,
      ).ok,
    ).toBe(false);
    expect(
      conferirFaixas(
        [{ quantidadeMinima: 10, tipoDeDesconto: "VALOR", desconto: 1.5 }],
        2000,
      ).ok,
    ).toBe(false);
  });
});

describe("atacadoDoPreco", () => {
  it("sem faixa ou sem preço, só varejo", () => {
    expect(atacadoDoPreco(2000, [])).toBeNull();
    expect(
      atacadoDoPreco(null, [gravada({ quantidadeMinima: 10, desconto: 5 })]),
    ).toBeNull();
  });

  it("calcula o unitário de cada faixa e o pedido mínimo", () => {
    expect(
      atacadoDoPreco(2000, [
        gravada({ quantidadeMinima: 10, desconto: 5, rotulo: "Caixa" }),
        gravada({ quantidadeMinima: 50, desconto: 10 }),
      ]),
    ).toEqual({
      pedidoMinimo: 10,
      faixas: [
        {
          quantidadeMinima: 10,
          tipoDeDesconto: "PERCENTUAL",
          desconto: 5,
          rotulo: "Caixa",
          unitarioCentavos: 1900,
          descontoPorUnidadeCentavos: 100,
        },
        {
          quantidadeMinima: 50,
          tipoDeDesconto: "PERCENTUAL",
          desconto: 10,
          rotulo: null,
          unitarioCentavos: 1800,
          descontoPorUnidadeCentavos: 200,
        },
      ],
    });
  });

  it("deixa fora a faixa em reais que não cabe no preço desta variação", () => {
    const faixas = [
      gravada({ quantidadeMinima: 10, tipoDeDesconto: "VALOR", desconto: 300 }),
      gravada({ quantidadeMinima: 20, tipoDeDesconto: "VALOR", desconto: 800 }),
    ];
    expect(atacadoDoPreco(500, faixas)?.faixas).toEqual([
      expect.objectContaining({ quantidadeMinima: 10, unitarioCentavos: 200 }),
    ]);
    expect(atacadoDoPreco(300, faixas)).toBeNull();
  });

  it("faixa desligada não entra", () => {
    expect(
      atacadoDoPreco(2000, [
        gravada({ quantidadeMinima: 10, desconto: 5, ativo: false }),
      ]),
    ).toBeNull();
  });
});
