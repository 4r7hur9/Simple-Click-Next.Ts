import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PaginaInicialDoPainel from "../src/app/(painel)/painel/page.tsx";

describe("painel inicial do ambiente de demonstração", () => {
  it("leva a cada etapa funcional do MVP sem criar atalhos para telas ausentes", () => {
    const html = renderToStaticMarkup(<PaginaInicialDoPainel />);

    expect(html).toContain('href="/l/pastelaria-da-vila"');
    expect(html).toContain('href="/l/pastelaria-da-vila/catalogo"');
    expect(html).toContain('href="/l/pastelaria-da-vila/checkout"');
    expect(html).toContain('href="/minha-conta/seguranca"');
    expect(html).toContain('href="/painel/config/aparencia"');
    // O painel do dia (T-803) entrou em cima, e os atalhos de cuidar da loja
    // continuam alcançáveis daqui.
    expect(html).toContain('href="/painel/categorias"');
    expect(html).toContain('href="/painel/produtos"');
    expect(html).toContain('href="/painel/metricas"');
  });

  it("chega ao servidor sem número: o resumo do dia nasce no estado de carregamento", () => {
    const html = renderToStaticMarkup(<PaginaInicialDoPainel />);

    expect(html).toContain('data-estado="carregando"');
    expect(html).not.toContain("R$");
  });
});
