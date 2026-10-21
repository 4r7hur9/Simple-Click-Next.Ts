import { describe, expect, it } from "vitest";
import {
  descreverPeriodo,
  ehDataIso,
  hojeNoFuso,
  periodoAnterior,
  periodoDoAtalho,
  semanasDoMes,
  somarDias,
  somarMeses,
  diaDaSemana,
  ordenarPeriodo,
  limitarData,
  descreverIntervalo,
} from "../src/periodo";

describe("datas civis", () => {
  it("vira o mês e o ano ao somar dias", () => {
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2027-01-01", -1)).toBe("2026-12-31");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(somarDias("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("soma meses limitando ao último dia", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2026-03-15", -3)).toBe("2025-12-15");
    expect(somarMeses("2026-12-10", 1)).toBe("2027-01-10");
  });

  it("valida datas que existem", () => {
    expect(ehDataIso("2026-02-30")).toBe(false);
    expect(ehDataIso("2026-10-16")).toBe(true);
    expect(ehDataIso("16/10/2026")).toBe(false);
  });

  it("acha o dia da semana (domingo = 0)", () => {
    expect(diaDaSemana("2026-10-16")).toBe(5);
    expect(diaDaSemana("2026-10-18")).toBe(0);
  });

  it("ordena e limita", () => {
    expect(ordenarPeriodo("2026-10-18", "2026-10-12")).toEqual({
      inicio: "2026-10-12",
      fim: "2026-10-18",
    });
    expect(limitarData("2026-01-01", "2026-03-01", "2026-04-01")).toBe("2026-03-01");
    expect(limitarData("2026-09-01", "2026-03-01", "2026-04-01")).toBe("2026-04-01");
  });
});

describe("grade do mês", () => {
  it("tem 6 semanas começando no domingo", () => {
    const semanas = semanasDoMes(2026, 9);
    expect(semanas).toHaveLength(6);
    expect(semanas.every((s) => s.length === 7)).toBe(true);
    expect(semanas.every((s) => diaDaSemana(s[0]!.iso) === 0)).toBe(true);
    expect(semanas[0]![0]!.iso).toBe("2026-09-27");
    expect(semanas[0]![0]!.foraDoMes).toBe(true);
    expect(semanas[0]![4]!.iso).toBe("2026-10-01");
    expect(semanas[0]![4]!.foraDoMes).toBe(false);
  });

  it("cobre a virada de ano", () => {
    const dias = semanasDoMes(2026, 11).flat();
    expect(dias.some((d) => d.iso === "2027-01-01" && d.foraDoMes)).toBe(true);
    expect(dias.filter((d) => !d.foraDoMes)).toHaveLength(31);
  });
});

describe("atalhos", () => {
  const hoje = "2026-10-16";
  it("calcula cada um", () => {
    expect(periodoDoAtalho("hoje", hoje)).toEqual({ inicio: hoje, fim: hoje });
    expect(periodoDoAtalho("ontem", hoje)).toEqual({ inicio: "2026-10-15", fim: "2026-10-15" });
    expect(periodoDoAtalho("ultimos-7", hoje)).toEqual({ inicio: "2026-10-10", fim: hoje });
    expect(periodoDoAtalho("ultimos-30", hoje)).toEqual({ inicio: "2026-09-17", fim: hoje });
    expect(periodoDoAtalho("este-mes", hoje)).toEqual({ inicio: "2026-10-01", fim: hoje });
    expect(periodoDoAtalho("mes-passado", hoje)).toEqual({ inicio: "2026-09-01", fim: "2026-09-30" });
  });

  it("mês passado em janeiro cai em dezembro do ano anterior", () => {
    expect(periodoDoAtalho("mes-passado", "2027-01-05")).toEqual({
      inicio: "2026-12-01",
      fim: "2026-12-31",
    });
  });

  it("período anterior tem o mesmo tamanho", () => {
    expect(periodoAnterior({ inicio: "2026-10-10", fim: "2026-10-16" })).toEqual({
      inicio: "2026-10-03",
      fim: "2026-10-09",
    });
    expect(periodoAnterior({ inicio: "2027-01-01", fim: "2027-01-01" })).toEqual({
      inicio: "2026-12-31",
      fim: "2026-12-31",
    });
  });
});

describe("texto do período", () => {
  const hoje = "2026-10-16";
  it("usa o nome do atalho quando bate", () => {
    expect(descreverPeriodo({ inicio: hoje, fim: hoje }, hoje)).toBe("Hoje");
    expect(descreverPeriodo({ inicio: "2026-10-10", fim: hoje }, hoje)).toBe("Últimos 7 dias");
  });
  it("escreve intervalos", () => {
    expect(descreverPeriodo({ inicio: "2026-10-12", fim: "2026-10-18" }, hoje)).toBe("12 a 18 out 2026");
    expect(descreverIntervalo({ inicio: "2026-09-28", fim: "2026-10-03" })).toBe("28 set a 3 out 2026");
    expect(descreverIntervalo({ inicio: "2026-12-28", fim: "2027-01-03" })).toBe("28 dez 2026 a 3 jan 2027");
  });
});

describe("fuso America/Fortaleza", () => {
  it("às 01h UTC ainda é o dia anterior em Fortaleza (UTC-3)", () => {
    expect(hojeNoFuso("America/Fortaleza", new Date("2026-10-16T01:00:00Z"))).toBe("2026-10-15");
  });
  it("às 03h UTC já virou o dia", () => {
    expect(hojeNoFuso("America/Fortaleza", new Date("2026-10-16T03:00:00Z"))).toBe("2026-10-16");
  });
  it("vira o ano pelo fuso", () => {
    expect(hojeNoFuso("America/Fortaleza", new Date("2027-01-01T02:59:00Z"))).toBe("2026-12-31");
    expect(hojeNoFuso("America/Fortaleza", new Date("2027-01-01T03:00:00Z"))).toBe("2027-01-01");
  });
  it("não depende do fuso do computador", () => {
    const antes = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";
    try {
      expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
      expect(diaDaSemana("2026-10-16")).toBe(5);
    } finally {
      if (antes === undefined) delete process.env.TZ;
      else process.env.TZ = antes;
    }
  });
});
