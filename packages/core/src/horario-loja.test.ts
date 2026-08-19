/**
 * Prova de "a loja está aberta agora?" (AC-401, AC-909, AC-910).
 *
 * Todos os instantes são fixos e escritos por extenso. Um teste que lê o
 * relógio passa em julho e reprova em janeiro, e passa às 14h e reprova à
 * meia-noite — e quem o vir reprovando vai reexecutar em vez de investigar.
 */
import { describe, expect, it } from "vitest";

import {
  situacaoDaLoja,
  momentoNaLoja,
  type HorarioDaLoja,
} from "./horario-loja.ts";

const SP = "America/Sao_Paulo";

/** Loja que abre 11h–15h e 18h–23h de segunda a sábado, fechada no domingo. */
const ALMOCO_E_JANTAR: HorarioDaLoja = {
  estado: "SCHEDULE",
  fusoHorario: SP,
  faixas: {
    1: [
      { abre: "11:00", fecha: "15:00" },
      { abre: "18:00", fecha: "23:00" },
    ],
    2: [
      { abre: "11:00", fecha: "15:00" },
      { abre: "18:00", fecha: "23:00" },
    ],
    6: [{ abre: "18:00", fecha: "23:30" }],
  },
};

/** Um instante em São Paulo, escrito na hora local (UTC-3 sem verão). */
function emSaoPaulo(dia: number, hora: number, minuto = 0): Date {
  // Agosto de 2026: São Paulo está em UTC-3, sem horário de verão.
  return new Date(Date.UTC(2026, 7, dia, hora + 3, minuto));
}

describe("o horário por dia controla a vitrine (AC-909)", () => {
  it("@spec:AC-909 @spec:AC-401 dentro da faixa a loja aparece aberta", () => {
    // Segunda, 17 de agosto de 2026, 12h em São Paulo.
    const situacao = situacaoDaLoja(ALMOCO_E_JANTAR, emSaoPaulo(17, 12));

    expect(situacao.aberta).toBe(true);
    expect(situacao.motivo).toBe("ABERTA");
  });

  it("@spec:AC-909 @spec:AC-401 fora da faixa aparece fechada com o horário da próxima abertura", () => {
    // Segunda, 9h — antes de abrir.
    const situacao = situacaoDaLoja(ALMOCO_E_JANTAR, emSaoPaulo(17, 9));

    expect(situacao.aberta).toBe(false);
    expect(situacao.proximaAbertura).toBe("abre hoje às 11h");
  });

  it("@spec:AC-909 no minuto exato da abertura já está aberta", () => {
    expect(situacaoDaLoja(ALMOCO_E_JANTAR, emSaoPaulo(17, 11)).aberta).toBe(
      true,
    );
  });

  it("@spec:AC-909 no minuto exato do fechamento já está fechada", () => {
    // A fronteira que gera reclamação: às 15h em ponto o pedido não entra mais.
    expect(situacaoDaLoja(ALMOCO_E_JANTAR, emSaoPaulo(17, 15)).aberta).toBe(
      false,
    );
  });

  it("@spec:AC-909 dia sem faixa nenhuma aparece fechado, com a próxima abertura da semana", () => {
    // Domingo, 16 de agosto: a loja não abre. A próxima é segunda.
    const situacao = situacaoDaLoja(ALMOCO_E_JANTAR, emSaoPaulo(16, 12));

    expect(situacao.aberta).toBe(false);
    expect(situacao.proximaAbertura).toBe("abre amanhã às 11h");
  });

  it("@spec:AC-909 depois da última faixa do dia, a próxima é a de outro dia", () => {
    // Terça, 23h30 — passou do jantar. Quarta não tem faixa; sábado tem.
    const situacao = situacaoDaLoja(ALMOCO_E_JANTAR, emSaoPaulo(18, 23, 30));

    expect(situacao.aberta).toBe(false);
    expect(situacao.proximaAbertura).toBe("abre sábado às 18h");
  });
});

describe("mais de uma faixa no mesmo dia (AC-910)", () => {
  it("@spec:AC-910 as duas faixas valem", () => {
    expect(situacaoDaLoja(ALMOCO_E_JANTAR, emSaoPaulo(17, 12)).aberta).toBe(
      true,
    );
    expect(situacaoDaLoja(ALMOCO_E_JANTAR, emSaoPaulo(17, 20)).aberta).toBe(
      true,
    );
  });

  it("@spec:AC-910 no intervalo ENTRE elas a loja aparece fechada, com a próxima faixa", () => {
    // Segunda, 16h: passou do almoço, não chegou o jantar.
    const situacao = situacaoDaLoja(ALMOCO_E_JANTAR, emSaoPaulo(17, 16));

    expect(situacao.aberta).toBe(false);
    expect(situacao.proximaAbertura).toBe("abre hoje às 18h");
  });

  it("@spec:AC-910 faixa com minuto quebrado é dita por extenso", () => {
    // Sábado, 10h: a próxima abertura é 18h; e no fim dela, 23h30.
    const comQuebrado: HorarioDaLoja = {
      ...ALMOCO_E_JANTAR,
      faixas: { 6: [{ abre: "09:30", fecha: "23:30" }] },
    };

    expect(situacaoDaLoja(comQuebrado, emSaoPaulo(22, 8)).proximaAbertura).toBe(
      "abre hoje às 9h30",
    );
  });
});

describe("o fuso é o da loja, e não o do servidor (AC-909)", () => {
  it("@spec:AC-909 a mesma hora do mundo dá resultados diferentes em fusos diferentes", () => {
    // 13h UTC de uma segunda: 10h em São Paulo (fechada, abre 11h) e 9h em
    // Rio Branco (fechada, abre 11h) — mas 12h em Lisboa, onde estaria aberta.
    const instante = new Date(Date.UTC(2026, 7, 17, 13, 0));

    const emSP = situacaoDaLoja(ALMOCO_E_JANTAR, instante);
    const emLisboa = situacaoDaLoja(
      { ...ALMOCO_E_JANTAR, fusoHorario: "Europe/Lisbon" },
      instante,
    );

    expect(emSP.aberta).toBe(false);
    expect(emLisboa.aberta).toBe(true);
  });

  it("@spec:AC-909 o dia da semana também é o da loja", () => {
    // 2h UTC de segunda ainda é domingo, 23h, em São Paulo.
    const instante = new Date(Date.UTC(2026, 7, 17, 2, 0));

    expect(momentoNaLoja(instante, SP).diaDaSemana).toBe(0);
  });
});

describe("estados que vencem o horário (AC-401)", () => {
  it("@spec:AC-401 loja em pausa aparece fechada mesmo dentro da faixa", () => {
    // Ela pausou justamente para não receber pedido. Deixar o horário decidir
    // faria a pausa não servir para nada.
    const emPausa: HorarioDaLoja = {
      ...ALMOCO_E_JANTAR,
      estado: "TEMPORARILY_CLOSED",
      fechadaAte: emSaoPaulo(17, 20),
    };

    const situacao = situacaoDaLoja(emPausa, emSaoPaulo(17, 12));

    expect(situacao.aberta).toBe(false);
    expect(situacao.motivo).toBe("PAUSA");
  });

  it("@spec:AC-401 pausa vencida volta a valer o horário, sem ninguém despausar", () => {
    const pausaVencida: HorarioDaLoja = {
      ...ALMOCO_E_JANTAR,
      estado: "TEMPORARILY_CLOSED",
      fechadaAte: emSaoPaulo(17, 11, 30),
    };

    expect(situacaoDaLoja(pausaVencida, emSaoPaulo(17, 12)).aberta).toBe(true);
  });

  it("@spec:AC-401 loja encerrada aparece fechada e sem previsão de abrir", () => {
    const encerrada: HorarioDaLoja = {
      ...ALMOCO_E_JANTAR,
      estado: "PERMANENTLY_CLOSED",
    };
    const situacao = situacaoDaLoja(encerrada, emSaoPaulo(17, 12));

    expect(situacao.aberta).toBe(false);
    expect(situacao.motivo).toBe("ENCERRADA");
    expect(situacao.proximaAbertura).toBeNull();
  });

  it("@spec:AC-401 loja sempre aberta ignora as faixas", () => {
    const sempre: HorarioDaLoja = {
      ...ALMOCO_E_JANTAR,
      estado: "ALWAYS_OPEN",
    };

    // Domingo de madrugada, quando nenhuma faixa existe.
    expect(situacaoDaLoja(sempre, emSaoPaulo(16, 3)).aberta).toBe(true);
  });

  it("@spec:AC-401 loja sem horário nenhum cadastrado fica fechada, sem prometer abertura", () => {
    // Prometer "abre segunda" sem faixa cadastrada seria inventar informação
    // que o dono nunca deu.
    const semHorario: HorarioDaLoja = { estado: "SCHEDULE", fusoHorario: SP };
    const situacao = situacaoDaLoja(semHorario, emSaoPaulo(17, 12));

    expect(situacao.aberta).toBe(false);
    expect(situacao.proximaAbertura).toBeNull();
  });

  it("@spec:AC-401 faixa malformada é ignorada, e não derruba a página", () => {
    const torta: HorarioDaLoja = {
      estado: "SCHEDULE",
      fusoHorario: SP,
      faixas: {
        1: [
          { abre: "abre cedo", fecha: "15:00" },
          { abre: "18:00", fecha: "23:00" },
        ],
      },
    };

    expect(situacaoDaLoja(torta, emSaoPaulo(17, 12)).proximaAbertura).toBe(
      "abre hoje às 18h",
    );
  });
});
