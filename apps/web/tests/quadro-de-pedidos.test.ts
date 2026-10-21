import { describe, expect, it } from "vitest";

import {
  acaoDeAvancar,
  avaliarMovimento,
  descreverDia,
  ehDiaValido,
  proximaEtapa,
  somarDiasDoQuadro,
} from "../src/lib/quadro-de-pedidos";

const ENTREGA = { entrega: "DELIVERY" } as const;
const RETIRADA = { entrega: "PICKUP" } as const;

describe("o caminho de cada pedido no quadro", () => {
  it("entrega e retirada seguem o mesmo começo e se separam depois de Em preparo", () => {
    const seguinte = (
      status: string,
      forma: typeof ENTREGA | typeof RETIRADA,
    ) => proximaEtapa({ status, ...forma })?.status ?? null;

    expect(seguinte("PENDING", ENTREGA)).toBe("ACCEPTED");
    expect(seguinte("ACCEPTED", RETIRADA)).toBe("PREPARING");
    expect(seguinte("PREPARING", RETIRADA)).toBe("READY_FOR_PICKUP");
    expect(seguinte("PREPARING", ENTREGA)).toBe("OUT_FOR_DELIVERY");
    expect(seguinte("READY_FOR_PICKUP", RETIRADA)).toBe("COMPLETED");
    expect(seguinte("OUT_FOR_DELIVERY", ENTREGA)).toBe("COMPLETED");
    expect(seguinte("COMPLETED", ENTREGA)).toBeNull();
    expect(seguinte("CANCELLED", ENTREGA)).toBeNull();
  });

  it("o botão rápido diz o verbo de cada passo", () => {
    expect(acaoDeAvancar({ status: "PENDING", ...ENTREGA })).toBe("Confirmar");
    expect(acaoDeAvancar({ status: "ACCEPTED", ...ENTREGA })).toBe(
      "Iniciar preparo",
    );
    expect(acaoDeAvancar({ status: "PREPARING", ...RETIRADA })).toBe(
      "Pronto para retirada",
    );
    expect(acaoDeAvancar({ status: "COMPLETED", ...ENTREGA })).toBeNull();
  });
});

describe("soltar o pedido numa coluna", () => {
  it("só o passo seguinte vale", () => {
    expect(
      avaliarMovimento({ status: "PENDING", ...ENTREGA }, "ACCEPTED"),
    ).toMatchObject({ ok: true, status: "ACCEPTED" });
  });

  it("recusa com a frase certa: forma errada, pular, voltar, repetir e fim de linha", () => {
    const recusa = (
      pedido: { status: string; entrega: string },
      destino: string,
    ) => {
      const r = avaliarMovimento(pedido, destino);
      return r.ok ? null : r.recusa;
    };

    expect(
      recusa({ status: "PREPARING", ...ENTREGA }, "READY_FOR_PICKUP"),
    ).toContain("entrega não passa por");
    expect(
      recusa({ status: "PREPARING", ...RETIRADA }, "OUT_FOR_DELIVERY"),
    ).toContain("retirada não passa por");
    expect(recusa({ status: "ACCEPTED", ...ENTREGA }, "COMPLETED")).toContain(
      "uma etapa por vez",
    );
    expect(recusa({ status: "PREPARING", ...ENTREGA }, "PENDING")).toContain(
      "não volta",
    );
    expect(recusa({ status: "PENDING", ...ENTREGA }, "PENDING")).toContain(
      "já está",
    );
    expect(recusa({ status: "COMPLETED", ...ENTREGA }, "PREPARING")).toContain(
      "concluído",
    );
    expect(recusa({ status: "CANCELLED", ...ENTREGA }, "ACCEPTED")).toContain(
      "cancelado",
    );
  });
});

describe("o dia do quadro", () => {
  it("valida data de calendário, soma dias na virada de mês e escreve por extenso", () => {
    expect(ehDiaValido("2026-10-16")).toBe(true);
    expect(ehDiaValido("2026-02-31")).toBe(false);
    expect(ehDiaValido("hoje")).toBe(false);
    expect(somarDiasDoQuadro("2026-10-01", -1)).toBe("2026-09-30");
    expect(somarDiasDoQuadro("2026-12-31", 1)).toBe("2027-01-01");
    expect(descreverDia("2026-10-16")).toBe("sexta-feira, 16 out 2026");
  });
});
