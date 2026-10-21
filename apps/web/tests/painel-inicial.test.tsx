import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InicioDoPainel } from "../src/features/dashboard/InicioDoPainel.tsx";

describe("painel inicial: as métricas da loja", () => {
  it("abre como painel de métricas, com o seletor de período e o atalho para a visão detalhada", () => {
    const html = renderToStaticMarkup(
      <InicioDoPainel consultaInicial={{ periodo: "hoje" }} />,
    );

    expect(html).toContain("Resumo da loja");
    expect(html).toContain('href="/painel/metricas?periodo=hoje"');
    expect(html).toContain("data-seletor-de-periodo");
    expect(html).toContain("Hoje");
    expect(html).toContain("7 dias");
  });

  it("leva o período do endereço para a visão detalhada", () => {
    const html = renderToStaticMarkup(
      <InicioDoPainel
        consultaInicial={{ periodo: "personalizado", de: "2026-09-01", ate: "2026-09-15" }}
      />,
    );

    expect(html).toContain("/painel/metricas?periodo=personalizado&amp;de=2026-09-01&amp;ate=2026-09-15");
  });

  it("chega ao servidor sem número: o resumo nasce no estado de carregamento", () => {
    const html = renderToStaticMarkup(
      <InicioDoPainel consultaInicial={{ periodo: "hoje" }} />,
    );

    expect(html).toContain('data-estado="carregando"');
    expect(html).not.toContain("R$");
  });
});
