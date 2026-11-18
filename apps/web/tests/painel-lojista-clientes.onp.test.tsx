// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { ler, lerDaFeature, ESTILOS } from "./apoio-painel-lojista.ts";
import { join } from "node:path";

describe("painel · clientes", () => {
  it("[CA-1] @spec:AC-11214 a lista de clientes usa a barra de filtros do painel", () => {
    expect(lerDaFeature("painel-clientes/ListaClientes.tsx")).toContain(
      "BarraDeFiltros",
    );
  });

  it("[CA-2] @spec:AC-11219 o painel não redefine as classes da conta em filtros.css", () => {
    const filtros = ler(join(ESTILOS, "filtros.css"));
    // `.sc-filtros__chips` é da conta (conta.css); o painel não a usa mais.
    expect(lerDaFeature("painel-filtros/BarraDeFiltros.tsx")).not.toContain(
      "sc-filtros__chips",
    );
    expect(filtros).not.toMatch(/\.sc-filtros__chip\s*[{:]/);
  });
});
