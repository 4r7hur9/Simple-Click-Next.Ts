/**
 * Prova das feature flags de ambiente (card #140, CA-12).
 */
import { describe, expect, it } from "vitest";

import { VARIAVEIS } from "./env.ts";
import {
  CATALOGO_DE_FLAGS,
  FLAGS_DESLIGADAS,
  flagsDoAmbiente,
  flagsFixas,
} from "./flags.ts";

describe("flags de ambiente", () => {
  it("[CA-12] ausente e desligado ficam desligados; ligado liga", () => {
    expect(flagsDoAmbiente({}).ligada("vitrine.proximo_preco")).toBe(false);
    expect(
      flagsDoAmbiente({ FLAG_VITRINE_PROXIMO_PRECO: "desligado" }).ligada(
        "vitrine.proximo_preco",
      ),
    ).toBe(false);
    expect(
      flagsDoAmbiente({ FLAG_VITRINE_PROXIMO_PRECO: "ligado" }).ligada(
        "vitrine.proximo_preco",
      ),
    ).toBe(true);
  });

  it("[CA-12] o padrão do app é tudo desligado, e as flags fixas só ligam o que citam", () => {
    expect(FLAGS_DESLIGADAS.ligada("vitrine.proximo_preco")).toBe(false);
    expect(flagsFixas({}).ligada("vitrine.proximo_preco")).toBe(false);
    expect(
      flagsFixas({ "vitrine.proximo_preco": true }).ligada(
        "vitrine.proximo_preco",
      ),
    ).toBe(true);
  });

  it("[CA-12] toda variável do catálogo é validada no boot (existe em VARIAVEIS)", () => {
    for (const flag of Object.values(CATALOGO_DE_FLAGS)) {
      expect(VARIAVEIS).toContain(flag.variavel);
      expect(flag.padrao).toBe(false);
    }
  });
});
