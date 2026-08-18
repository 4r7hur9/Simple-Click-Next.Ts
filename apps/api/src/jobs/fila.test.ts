/**
 * A política de repetição, conferida sem subir Redis.
 *
 * Não substitui a prova de integração — a espera de verdade quem aplica é a
 * fila, e isso está provado em `fila.int.test.ts`. O que este arquivo prende é
 * o que a política DECLARA: se alguém trocar a espera crescente por espera
 * fixa, ou desligar a guarda do trabalho falho, quebra aqui em milissegundos,
 * sem depender de nenhum serviço estar no ar.
 */

import { describe, expect, it } from "vitest";

import {
  esperaAntesDaTentativa,
  opcoesDeTrabalho,
  REPETICAO_PADRAO,
  type PoliticaDeRepeticao,
} from "./fila.ts";

const POLITICA: PoliticaDeRepeticao = {
  tentativas: 5,
  esperaInicialMs: 1_000,
};

describe("política de repetição", () => {
  it("@spec:AC-026 declara espera que cresce a cada nova tentativa", () => {
    const esperas = [1, 2, 3, 4, 5].map((tentativa) =>
      esperaAntesDaTentativa(tentativa, POLITICA),
    );

    // A primeira tentativa acontece na hora; da segunda em diante a espera
    // dobra, o que dá ao destino uma janela cada vez maior para voltar.
    expect(esperas).toEqual([0, 1_000, 2_000, 4_000, 8_000]);

    for (let i = 2; i < esperas.length; i += 1) {
      expect(esperas[i] ?? 0).toBeGreaterThan(esperas[i - 1] ?? 0);
    }
  });

  it("@spec:AC-026 guarda o trabalho que esgotou as tentativas", () => {
    const opcoes = opcoesDeTrabalho(POLITICA);

    expect(opcoes.attempts).toBe(POLITICA.tentativas);
    expect(opcoes.backoff).toEqual({
      type: "exponential",
      delay: POLITICA.esperaInicialMs,
    });
    // O que falhou nunca é descartado: é isso que faz "não desaparece" ser
    // uma propriedade do código, e não um padrão da biblioteca que pode mudar.
    expect(opcoes.removeOnFail).toBe(false);
  });

  it("@spec:AC-026 a política padrão já repete mais de uma vez", () => {
    // Fila que nasce com uma tentativa só perde todo trabalho no primeiro
    // soluço de rede, e o descuido seria invisível: nada no código de quem
    // enfileira diria que faltava pedir repetição.
    expect(REPETICAO_PADRAO.tentativas).toBeGreaterThan(1);
    expect(REPETICAO_PADRAO.esperaInicialMs).toBeGreaterThan(0);
    expect(opcoesDeTrabalho().attempts).toBe(REPETICAO_PADRAO.tentativas);
  });

  it("não espera antes da primeira tentativa", () => {
    expect(esperaAntesDaTentativa(1, POLITICA)).toBe(0);
    expect(esperaAntesDaTentativa(0, POLITICA)).toBe(0);
  });
});
