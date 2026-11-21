import { describe, expect, it } from "vitest";

import { ErroDeParametros, lerParametros } from "./parametros.ts";

const REF = "2026-11-01T18:00:00-03:00";

describe("lerParametros", () => {
  it("[CA-3] exige semente e referência, e a referência precisa ter fuso", () => {
    expect(() => lerParametros(["carregar"])).toThrow(ErroDeParametros);
    expect(() => lerParametros(["carregar", "--semente", "sc-2026"])).toThrow(/referencia/);
    expect(() => lerParametros(["carregar", "--semente", "sc-2026", "--referencia", "2026-11-01T18:00:00"])).toThrow(/fuso/);
    expect(() => lerParametros(["carregar", "--referencia", REF])).toThrow(/semente/);
  });

  it("[CA-3] recusa comando, argumento e semente desconhecidos", () => {
    expect(() => lerParametros([])).toThrow(/comando/);
    expect(() => lerParametros(["apagar", "--semente", "a", "--referencia", REF])).toThrow(/comando/);
    expect(() => lerParametros(["carregar", "--semente", "a", "--referencia", REF, "--pedidos", "5"])).toThrow(/desconhecido/);
    expect(() => lerParametros(["carregar", "--lote", "500", "--semente", "a", "--referencia", REF])).toThrow(/desconhecido/);
    expect(() => lerParametros(["carregar", "--semente", "a b;DROP", "--referencia", REF])).toThrow(/semente/);
  });

  it("[CA-4] aceita --ensaio e --falhar-na-loja só em carregar, e não juntos", () => {
    const ok = lerParametros(["carregar", "--semente", "sc-2026", "--referencia", REF, "--ensaio"]);
    expect(ok).toMatchObject({ comando: "carregar", ensaio: true, falharNaLoja: null });
    expect(ok.referencia.toISOString()).toBe("2026-11-01T21:00:00.000Z");
    expect(lerParametros(["carregar", "--semente", "s", "--referencia", REF, "--falhar-na-loja", "7"]).falharNaLoja).toBe(7);
    expect(() => lerParametros(["validar", "--semente", "s", "--referencia", REF, "--ensaio"])).toThrow(/carregar/);
    expect(() => lerParametros(["carregar", "--semente", "s", "--referencia", REF, "--ensaio", "--falhar-na-loja", "1"])).toThrow(/não se combinam/);
    expect(() => lerParametros(["carregar", "--semente", "s", "--referencia", REF, "--falhar-na-loja", "100"])).toThrow(/índice/);
  });
});
