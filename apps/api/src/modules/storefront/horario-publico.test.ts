import { describe, expect, it } from "vitest";

import { horarioPublico } from "./horario-publico.ts";

describe("horarioPublico", () => {
  it("devolve os 7 dias, com dia sem faixa como fechado", () => {
    const publico = horarioPublico({
      estado: "SCHEDULE",
      fusoHorario: "America/Sao_Paulo",
      faixas: { 1: [{ abre: "11:00", fecha: "15:00" }] },
      excecoes: [{ data: "2026-12-25", fechada: true, motivo: "Natal" }],
    });

    expect(publico.modo).toBe("SCHEDULE");
    expect(publico.semana.map((linha) => linha.dia)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(publico.semana[1]?.faixas).toEqual([
      { abre: "11:00", fecha: "15:00" },
    ]);
    expect(publico.semana[0]?.faixas).toEqual([]);
    // As exceções (e o motivo que o dono escreveu) não saem por aqui.
    expect(JSON.stringify(publico)).not.toContain("Natal");
  });

  it("loja sem grade sai com os 7 dias vazios", () => {
    const publico = horarioPublico({
      estado: "ALWAYS_OPEN",
      fusoHorario: "America/Sao_Paulo",
    });

    expect(publico.modo).toBe("ALWAYS_OPEN");
    expect(publico.semana.every((linha) => linha.faixas.length === 0)).toBe(
      true,
    );
  });
});
