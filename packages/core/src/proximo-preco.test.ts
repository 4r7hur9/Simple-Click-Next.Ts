/**
 * Prova da próxima queda de preço (card #140, CA-13). Valores calculados à mão.
 */
import { describe, expect, it } from "vitest";

import type { PrecoCadastrado } from "./preco-vigente.ts";
import { proximaQuedaDePreco } from "./proximo-preco.ts";

const AGORA = new Date("2026-11-20T12:00:00Z");
const DIA = 24 * 60 * 60 * 1000;
const EM = (dias: number) => new Date(AGORA.getTime() + dias * DIA);

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

describe("próxima queda de preço", () => {
  it("[CA-13] promoção que começa em T dentro do horizonte vira a queda", () => {
    const queda = proximaQuedaDePreco(
      [
        preco(),
        preco({ tipo: "PROMO", valorEmCentavos: 1500, comecaEm: EM(1) }),
      ],
      AGORA,
    );
    expect(queda).toEqual({ precoCentavos: 1500, aPartirDe: EM(1) });
  });

  it("[CA-13] virada do base para um valor menor é queda", () => {
    const queda = proximaQuedaDePreco(
      [
        preco({ terminaEm: EM(2) }),
        preco({ valorEmCentavos: 1800, comecaEm: EM(2) }),
      ],
      AGORA,
    );
    expect(queda).toEqual({ precoCentavos: 1800, aPartirDe: EM(2) });
  });

  it("[CA-13] aumento agendado (antigo encerrado em T) nunca aparece", () => {
    const queda = proximaQuedaDePreco(
      [
        preco({ terminaEm: EM(1) }),
        preco({ valorEmCentavos: 2500, comecaEm: EM(1) }),
      ],
      AGORA,
    );
    expect(queda).toBeNull();
  });

  it("[CA-13] aumento SEM encerrar o antigo não muda o preço: nada a anunciar", () => {
    const queda = proximaQuedaDePreco(
      [preco(), preco({ valorEmCentavos: 2500, comecaEm: EM(1) })],
      AGORA,
    );
    expect(queda).toBeNull();
  });

  it("[CA-13] se a primeira mudança é aumento, queda posterior não é anunciada", () => {
    const queda = proximaQuedaDePreco(
      [
        preco({ terminaEm: EM(1) }),
        preco({ valorEmCentavos: 2500, comecaEm: EM(1), terminaEm: EM(3) }),
        preco({ valorEmCentavos: 1000, comecaEm: EM(3) }),
      ],
      AGORA,
    );
    expect(queda).toBeNull();
  });

  it("[CA-13] promoção que termina em T volta ao base (aumento): null", () => {
    const queda = proximaQuedaDePreco(
      [
        preco(),
        preco({ tipo: "PROMO", valorEmCentavos: 1500, terminaEm: EM(1) }),
      ],
      AGORA,
    );
    expect(queda).toBeNull();
  });

  it("[CA-13] mudança vinda de ou indo para 'sem preço' é ignorada", () => {
    // Só uma promoção futura, sem base: hoje não há preço (null).
    const deNulo = proximaQuedaDePreco(
      [preco({ tipo: "PROMO", valorEmCentavos: 1500, comecaEm: EM(1) })],
      AGORA,
    );
    // Base que termina sem substituto: passa a não haver preço.
    const paraNulo = proximaQuedaDePreco([preco({ terminaEm: EM(1) })], AGORA);
    expect(deNulo).toBeNull();
    expect(paraNulo).toBeNull();
  });

  it("[CA-13] além do horizonte de 7 dias não anuncia; no limite exato, sim", () => {
    const promo = (dias: number) =>
      proximaQuedaDePreco(
        [
          preco(),
          preco({ tipo: "PROMO", valorEmCentavos: 1500, comecaEm: EM(dias) }),
        ],
        AGORA,
      );
    expect(promo(8)).toBeNull();
    expect(promo(7)).toEqual({ precoCentavos: 1500, aPartirDe: EM(7) });
  });

  it("[CA-13] preço inativo e faixa de atacado futura são ignorados", () => {
    const queda = proximaQuedaDePreco(
      [
        preco(),
        preco({
          tipo: "PROMO",
          valorEmCentavos: 1000,
          comecaEm: EM(1),
          ativo: false,
        }),
        preco({
          tipo: "WHOLESALE",
          valorEmCentavos: 900,
          quantidadeMinima: 10,
          comecaEm: EM(1),
        }),
      ],
      AGORA,
    );
    expect(queda).toBeNull();
  });
});
