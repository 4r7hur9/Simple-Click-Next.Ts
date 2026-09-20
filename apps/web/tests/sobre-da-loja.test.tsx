import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  SobreDaLoja,
  type DadosSobreDaLoja,
} from "../src/features/loja/SobreDaLoja.tsx";

const LOJA: DadosSobreDaLoja = {
  apelido: "sabor-e-cia",
  nome: "Sabor & Cia",
  sobre: "Uma história feita de receitas de família.",
  logo: "https://exemplo.test/logo.png",
  capa: "https://exemplo.test/capa.jpg",
  cores: null,
  enderecoParaRetirada: {
    logradouro: "Rua das Flores",
    numero: "10",
    complemento: null,
    bairro: "Centro",
    cidade: "Santos",
    uf: "SP",
  },
  whatsappPublico: "5511999998888",
};

describe("página Sobre da loja", () => {
  it("entrega história, identidade, retirada e contato público sem JavaScript", () => {
    const html = renderToStaticMarkup(<SobreDaLoja loja={LOJA} />);

    expect(html).toContain("Uma história feita de receitas de família.");
    expect(html).toContain("https://exemplo.test/logo.png");
    expect(html).toContain("Rua das Flores");
    expect(html).toContain('href="https://wa.me/5511999998888"');
    expect(html).toContain('href="/l/sabor-e-cia"');
  });

  it("não desenha contato quando o dono não o marcou como público", () => {
    const html = renderToStaticMarkup(
      <SobreDaLoja loja={{ ...LOJA, whatsappPublico: null }} />,
    );

    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("WhatsApp público");
  });
});
