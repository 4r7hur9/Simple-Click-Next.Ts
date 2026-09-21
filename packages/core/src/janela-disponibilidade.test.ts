import { describe, expect, it } from "vitest";

import {
  estaNaJanelaDeDisponibilidade,
  type JanelaDeDisponibilidade,
} from "./janela-disponibilidade.ts";

const FIM_DE_SEMANA: readonly JanelaDeDisponibilidade[] = [
  { diaDaSemana: 6, abre: "09:00", fecha: "18:00" },
];

describe("janela de disponibilidade do produto", () => {
  it("@spec:AC-322 libera no sábado dentro do fuso da loja", () => {
    expect(
      estaNaJanelaDeDisponibilidade(
        FIM_DE_SEMANA,
        new Date("2026-09-19T15:00:00.000Z"),
        "America/Sao_Paulo",
      ),
    ).toBe(true);
  });

  it("@spec:AC-322 bloqueia na terça e fora do horário", () => {
    expect(
      estaNaJanelaDeDisponibilidade(
        FIM_DE_SEMANA,
        new Date("2026-09-15T15:00:00.000Z"),
        "America/Sao_Paulo",
      ),
    ).toBe(false);
    expect(
      estaNaJanelaDeDisponibilidade(
        FIM_DE_SEMANA,
        new Date("2026-09-19T22:00:00.000Z"),
        "America/Sao_Paulo",
      ),
    ).toBe(false);
  });

  it("@spec:AC-322 não restringe produto sem janela e ignora faixa inválida", () => {
    expect(
      estaNaJanelaDeDisponibilidade(
        [],
        new Date("2026-09-15T15:00:00.000Z"),
        "America/Sao_Paulo",
      ),
    ).toBe(true);
    expect(
      estaNaJanelaDeDisponibilidade(
        [{ diaDaSemana: 6, abre: "18:00", fecha: "02:00" }],
        new Date("2026-09-19T15:00:00.000Z"),
        "America/Sao_Paulo",
      ),
    ).toBe(false);
  });
});
