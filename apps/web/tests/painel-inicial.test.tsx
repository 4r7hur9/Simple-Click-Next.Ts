import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InicioDoPainel } from "../src/features/dashboard/InicioDoPainel.tsx";

describe("painel inicial do ambiente de demonstração", () => {
  it("leva a cada etapa funcional do MVP sem criar atalhos para telas ausentes", () => {
    const html = renderToStaticMarkup(
      <InicioDoPainel apelidoDaLoja="pastelaria-da-vila" />,
    );

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

  it("os atalhos da vitrine levam à loja da sessão, e não à de demonstração", () => {
    const html = renderToStaticMarkup(
      <InicioDoPainel apelidoDaLoja="mercado-do-bairro" />,
    );

    expect(html).toContain('href="/l/mercado-do-bairro"');
    expect(html).toContain('href="/l/mercado-do-bairro/catalogo"');
    expect(html).toContain('href="/l/mercado-do-bairro/checkout"');
    expect(html).not.toContain("pastelaria-da-vila");
  });

  it("chega ao servidor sem número: o resumo do dia nasce no estado de carregamento", () => {
    const html = renderToStaticMarkup(
      <InicioDoPainel apelidoDaLoja="pastelaria-da-vila" />,
    );

    expect(html).toContain('data-estado="carregando"');
    expect(html).not.toContain("R$");
  });
});
