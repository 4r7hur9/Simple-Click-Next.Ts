import { describe, expect, it } from "vitest";

import { disponibilidadeDoProduto } from "./disponibilidade.usecase.ts";

const entrada = {
  janelas: [{ diaDaSemana: 6, abre: "09:00", fecha: "18:00" }],
  fusoHorario: "America/Sao_Paulo",
  agora: new Date("2026-09-19T15:00:00.000Z"),
} as const;

describe("disponibilidade do produto", () => {
  it("@spec:AC-321 esgotado fica indisponível mesmo dentro da janela", () => {
    expect(
      disponibilidadeDoProduto({
        ...entrada,
        disponivelManualmente: false,
      }),
    ).toEqual({ disponivel: false, motivo: "ESGOTADO" });
  });

  it("@spec:AC-321 reativar libera o produto quando não há restrição", () => {
    expect(
      disponibilidadeDoProduto({
        ...entrada,
        disponivelManualmente: true,
        janelas: [],
      }),
    ).toEqual({ disponivel: true, motivo: "DISPONIVEL" });
  });

  it("@spec:AC-322 bloqueia fora da janela e libera dentro dela", () => {
    expect(
      disponibilidadeDoProduto({
        ...entrada,
        disponivelManualmente: true,
        agora: new Date("2026-09-15T15:00:00.000Z"),
      }),
    ).toEqual({ disponivel: false, motivo: "FORA_DA_JANELA" });
    expect(
      disponibilidadeDoProduto({
        ...entrada,
        disponivelManualmente: true,
      }),
    ).toEqual({ disponivel: true, motivo: "DISPONIVEL" });
  });
});
