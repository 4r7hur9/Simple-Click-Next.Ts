// @vitest-environment jsdom
/**
 * Prova da propagação da cor (AC-939).
 *
 * O que está sob prova é a ligação que faltava: a pessoa escolhia vermelho na
 * prévia e o fundo da página continuava azul — como se a escolha não valesse
 * nada. A cor precisa chegar a duas partes que não são filhas da prévia: o fundo
 * de CSS e o mundo em três dimensões.
 */
import { afterEach, describe, expect, it } from "vitest";

import { VARIAVEL_DA_COR, anunciarCor, ouvirCor } from "./cor-da-landing.ts";

afterEach(() => {
  document.documentElement.style.removeProperty(VARIAVEL_DA_COR);
});

describe("a cor escolhida alcança a página inteira (AC-939)", () => {
  it("@spec:AC-939 a cor vira valor declarado, para o CSS alcançar sem script", () => {
    anunciarCor("#b3261e");

    expect(
      document.documentElement.style.getPropertyValue(VARIAVEL_DA_COR),
    ).toBe("#b3261e");
  });

  it("@spec:AC-939 quem escuta recebe a cor nova", () => {
    // O mundo em três dimensões precisa do momento da troca: ele não observa
    // folha de estilo, e sem o aviso continuaria com a cor antiga.
    const recebidas: string[] = [];
    const parar = ouvirCor((cor) => recebidas.push(cor));

    anunciarCor("#0f6e5c");
    anunciarCor("#5b2d82");

    expect(recebidas).toEqual(["#0f6e5c", "#5b2d82"]);
    parar();
  });

  it("@spec:AC-939 parar de escutar realmente para", () => {
    // Sem isto, um mundo desmontado continuaria escutando e tentaria pintar um
    // material já descartado.
    const recebidas: string[] = [];
    const parar = ouvirCor((cor) => recebidas.push(cor));

    parar();
    anunciarCor("#b3261e");

    expect(recebidas).toEqual([]);
  });

  it("@spec:AC-939 dois ouvintes recebem a mesma troca", () => {
    // O fundo e o mundo escutam ao mesmo tempo, e um não pode calar o outro.
    const um: string[] = [];
    const dois: string[] = [];
    const pararUm = ouvirCor((c) => um.push(c));
    const pararDois = ouvirCor((c) => dois.push(c));

    anunciarCor("#2c3038");

    expect(um).toEqual(["#2c3038"]);
    expect(dois).toEqual(["#2c3038"]);
    pararUm();
    pararDois();
  });
});
