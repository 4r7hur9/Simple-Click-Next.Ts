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
    expect(html).not.toContain('href="/painel/config/');
  });
});
