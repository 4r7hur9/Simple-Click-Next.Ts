import { describe, expect, it } from "vitest";

import { nivelDeEfeitos, type SinaisDeCapacidade } from "./capacidade-da-landing.ts";

const potente: SinaisDeCapacidade = {
  ponteiroGrosso: false,
  memoriaEmGiB: 8,
  nucleos: 8,
  economiaDeDados: false,
  movimentoReduzido: false,
  quadrosPorSegundo: 60,
};

describe("nível progressivo de efeitos da landing", () => {
  it("mantém o desktop capaz no nível completo", () => {
    expect(nivelDeEfeitos(potente)).toBe("completo");
  });

  it("limita um aparelho móvel capaz aos efeitos leves", () => {
    expect(nivelDeEfeitos({ ...potente, ponteiroGrosso: true })).toBe("leve");
  });

  it.each([
    ["movimento reduzido", { movimentoReduzido: true }],
    ["economia de dados", { economiaDeDados: true }],
    ["pouca memória", { memoriaEmGiB: 2 }],
    ["poucos núcleos", { nucleos: 2 }],
    ["quadros lentos", { quadrosPorSegundo: 30 }],
  ] as const)("usa versão estática com %s", (_caso, sinal) => {
    expect(nivelDeEfeitos({ ...potente, ...sinal })).toBe("estatico");
  });

  it("trata sinais ausentes como capacidade insuficiente", () => {
    expect(nivelDeEfeitos({ ...potente, memoriaEmGiB: 0, nucleos: 0 })).toBe("estatico");
  });
});
